import { randomUUID } from 'node:crypto'

import type { WebContents } from 'electron'
import { z } from 'zod'

import type { NyxChatEvent } from '../../../shared/chat/events'
import { NYX_CHAT_IPC_CHANNELS } from '../../../shared/chat/ipc'
import {
  type NyxChatError,
  nyxChatDocumentMediaTypes,
  nyxChatImageMediaTypes,
  type NyxChatImageRef,
  type NyxChatMessage,
  type NyxChatTargetAttribution,
} from '../../../shared/chat/types'
import { nyxChatDocumentLimits } from '../../../shared/chat/document-file'
import { nyxChatImageLimits } from '../../../shared/chat/image-file'
import type { NyxThreadEvent } from '../../../shared/threads/events'
import { validateNyxThreadTitle } from '../../../shared/threads/title'
import type {
  NyxThreadAvailableSummary,
  NyxThreadActivity,
  NyxThreadDetail,
  NyxThreadListPage,
  NyxThreadResult,
  NyxThreadSafeError,
  NyxThreadSearchResponse,
  NyxThreadSnapshot,
  NyxThreadSummary,
} from '../../../shared/threads/types'
import { chatTargetSelectionSchema } from '../current-thread/schemas'
import type { ActivatedThreadLibrary } from './activation'
import type { ThreadLibraryAcknowledgement } from './client'
import { ThreadLibraryCoordinator } from './coordinator'
import type {
  ThreadLibraryAcknowledgementClock,
  ThreadLibraryListRow,
  ThreadLibraryThreadDetail,
} from './protocol'

const uuid = z.uuid()
const position = z.number().int().nonnegative()
const imageRef = z
  .object({
    imageId: uuid,
    mediaType: z.enum(nyxChatImageMediaTypes),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    position,
  })
  .strict()
const documentRef = z
  .object({
    documentId: uuid,
    name: z.string().min(1),
    mediaType: z.enum(nyxChatDocumentMediaTypes),
    byteLength: z.number().int().positive(),
    extractedByteLength: z.number().int().positive(),
    position,
  })
  .strict()
const newImage = z
  .object({
    imageId: uuid,
    canonicalBytes: z.instanceof(Uint8Array),
    previewBytes: z.instanceof(Uint8Array),
  })
  .strict()
const newDocument = z
  .object({
    documentId: uuid,
    sourceBytes: z.instanceof(Uint8Array),
    extractedTextBytes: z.instanceof(Uint8Array),
    extractedFromSha256: z.string().regex(/^[0-9a-f]{64}$/u),
  })
  .strict()
const draftInput = z
  .object({
    text: z.string(),
    targetSelection: chatTargetSelectionSchema,
    images: z.array(imageRef).max(nyxChatImageLimits.imagesPerTurn),
    documents: z.array(documentRef).max(nyxChatDocumentLimits.documentsPerTurn),
    newImages: z.array(newImage).max(nyxChatImageLimits.imagesPerTurn).optional(),
    newDocuments: z.array(newDocument).max(nyxChatDocumentLimits.documentsPerTurn).optional(),
  })
  .strict()
const materializeInput = draftInput
const saveDraftInput = draftInput
  .extend({
    threadId: uuid,
    expectedDraftRevision: z.number().int().nonnegative(),
    discardEmptyShell: z.boolean().optional(),
  })
  .strict()
const listPageInput = z
  .object({
    location: z.enum(['available', 'archived', 'trash']),
    cursor: z.string().max(1024).nullable().optional(),
    limit: z.literal(50),
  })
  .strict()
const searchInput = z
  .object({
    query: z
      .string()
      .transform((value) => value.trim())
      .refine((value) => {
        let length = 0
        for (const _codePoint of value) {
          length += 1
          if (length > 256) return false
        }
        return length >= 1
      }),
  })
  .strict()
const getInput = z.object({ threadId: uuid.nullable() }).strict()
const retryOpenInput = z.discriminatedUnion('scope', [
  z.object({ scope: z.literal('library') }).strict(),
  z.object({ scope: z.literal('thread'), threadId: uuid }).strict(),
])
const markSeenInput = z
  .object({ threadId: uuid, observedResultRevision: z.number().int().nonnegative() })
  .strict()
const updatePinInput = z
  .object({
    threadId: uuid,
    action: z.enum(['pin', 'unpin', 'move_up', 'move_down', 'move_top', 'move_bottom']),
    expectedPinPosition: z.number().int().positive().nullable(),
  })
  .strict()
  .superRefine((input, context) => {
    if ((input.action === 'pin') !== (input.expectedPinPosition === null)) {
      context.addIssue({ code: 'custom', message: 'Pin action and expected position disagree.' })
    }
  })
const renameInput = z
  .object({
    threadId: uuid,
    title: z.string(),
    expectedThreadRevision: z.number().int().positive(),
  })
  .strict()
const updateLocationInput = z
  .object({
    threadId: uuid,
    action: z.enum(['archive', 'unarchive', 'trash', 'restore']),
    expectedThreadRevision: z.number().int().positive(),
  })
  .strict()

type UnclockedChatEvent = NyxChatEvent extends infer Event
  ? Event extends NyxChatEvent
    ? Omit<Event, 'eventEpoch' | 'cursor'>
    : never
  : never

type Options = {
  activate: () => Promise<ActivatedThreadLibrary>
  broadcastThreadEvent: (event: NyxThreadEvent) => void
  generateId?: () => string
  now?: () => Date
}

class ServiceReadError extends Error {
  constructor(readonly code: string) {
    super(code)
  }
}

const safeErrors = {
  invalid_request: { code: 'invalid_request', message: 'The Thread request is invalid.' },
  not_found: { code: 'not_found', message: 'This thread was not found.' },
  conflict: { code: 'conflict', message: 'This thread changed. Reload it and try again.' },
  library_unavailable: { code: 'library_unavailable', message: "Couldn't open Thread Library" },
  thread_unavailable: { code: 'thread_unavailable', message: "Couldn't open this thread" },
} as const satisfies Record<NyxThreadSafeError['code'], NyxThreadSafeError>

const searchConflict: NyxThreadSafeError = {
  code: 'conflict',
  message: 'A Thread search is already running.',
}

function fail<Value>(error: NyxThreadSafeError): NyxThreadResult<Value> {
  return { ok: false, error }
}

function ok<Value>(value: Value): NyxThreadResult<Value> {
  return { ok: true, value }
}

function localSecond(date: Date) {
  const part = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${part(date.getMonth() + 1)}-${part(date.getDate())}T${part(date.getHours())}:${part(date.getMinutes())}:${part(date.getSeconds())}`
}

function availableSummary(
  detail: ThreadLibraryThreadDetail['summary'],
  activity: NyxThreadActivity,
): NyxThreadAvailableSummary {
  return {
    availability: 'available',
    id: detail.id,
    location: detail.location,
    pinPosition: detail.pinPosition,
    title: detail.title,
    threadRevision: detail.threadRevision,
    resultRevision: detail.resultRevision,
    seenResultRevision: detail.seenResultRevision,
    lastUserActivityAt: detail.lastUserActivityAt,
    createdAt: detail.createdAt,
    updatedAt: detail.updatedAt,
    activity,
  }
}

function listSummary(row: ThreadLibraryListRow, activity: NyxThreadActivity): NyxThreadSummary {
  return row.availability === 'available'
    ? {
        availability: 'available',
        id: row.id,
        location: row.location,
        pinPosition: row.pinPosition,
        title: row.title,
        threadRevision: row.threadRevision,
        resultRevision: row.resultRevision,
        seenResultRevision: row.seenResultRevision,
        lastUserActivityAt: row.lastUserActivityAt,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        activity,
      }
    : {
        availability: 'unavailable',
        id: row.id,
        location: row.location,
        pinPosition: row.pinPosition,
        title: "Couldn't open this thread",
        unavailable: safeErrors.thread_unavailable,
      }
}

export class ThreadLibraryService {
  private active: ActivatedThreadLibrary | null = null
  private coordinator: ThreadLibraryCoordinator | null = null
  private activation: Promise<boolean> | null = null
  private eventEpoch = ''
  private cursor = 0
  private lastCanonicalCursor = 0
  private readonly watermarkCursor = new Map<number, number>()
  private selectedThreadId: string | null = null
  private capacity = { activeRuns: 0, attachmentRunActive: false }
  private selectionRequest = 0
  private readonly imageAuthorization = new Map<
    string,
    { threadId: string; ref: ThreadLibraryThreadDetail['images'][number] }
  >()
  private readonly liveChats = new Map<
    string,
    {
      threadId: string
      requestId: string
      assistantMessageId?: string
      turnIntent: 'new_user_message' | 'retry_failed_response'
      content: string
      status: 'submitting' | 'streaming' | 'saving_failed'
      attachmentBearing: boolean
      error?: NyxChatError
      targetAttribution?: NyxChatTargetAttribution
    }
  >()
  private pendingRecoveryAt: string | null = null
  private startupRecovered = false
  private searchInFlight = false
  private pendingMaterialize: {
    threadId: string
    createdAt: string
    fallbackLocalSecond: string
    input: z.infer<typeof materializeInput>
  } | null = null

  constructor(private readonly options: Options) {}

  async initialize() {
    return this.activate()
  }

  resolveCoordinator() {
    if (!this.active || !this.coordinator) throw new Error(safeErrors.library_unavailable.message)
    return this.coordinator
  }

  resolveAuthorizedImage(imageId: string) {
    return this.imageAuthorization.get(imageId) ?? null
  }

  rendererTeardown() {
    this.clearSelection()
  }

  resolveImageProtocolFile(threadId: string, ref: NyxChatImageRef, variant: 'full' | 'preview') {
    if (!this.active) throw new Error(safeErrors.library_unavailable.message)
    return this.active.sidecars.resolveImageProtocolFile(threadId, ref, variant)
  }

  publishChatEvent(sender: WebContents, event: UnclockedChatEvent) {
    if (!this.eventEpoch) return
    if (event.type === 'chat:capacity') {
      this.capacity = {
        activeRuns: event.activeRuns,
        attachmentRunActive: event.attachmentRunActive,
      }
    } else if (event.type === 'chat:accepted') {
      this.liveChats.set(event.threadId, {
        threadId: event.threadId,
        requestId: event.requestId,
        assistantMessageId: event.assistantMessageId,
        turnIntent: event.turnIntent,
        content: '',
        status: 'submitting',
        attachmentBearing: event.attachmentBearing,
      })
    } else {
      const liveChat = this.liveChats.get(event.threadId)
      if (liveChat?.requestId === event.requestId) {
        if (event.assistantMessageId) liveChat.assistantMessageId = event.assistantMessageId
        if (event.type === 'chat:start') {
          liveChat.status = 'streaming'
          liveChat.targetAttribution = event.targetAttribution
        }
        if (event.type === 'chat:delta') {
          liveChat.status = 'streaming'
          liveChat.content = event.snapshot
        }
        if (event.type === 'chat:error') {
          if (this.coordinator?.settlementFailureRequestId(event.threadId) === event.requestId) {
            liveChat.status = 'saving_failed'
            liveChat.error = event.error
            if (event.targetAttribution) liveChat.targetAttribution = event.targetAttribution
          } else {
            this.liveChats.delete(event.threadId)
          }
        }
        if (event.type === 'chat:done') this.liveChats.delete(event.threadId)
      }
    }
    this.cursor += 1
    try {
      sender.send(NYX_CHAT_IPC_CHANNELS.event, {
        ...event,
        eventEpoch: this.eventEpoch,
        cursor: this.cursor,
      })
    } catch {
      // A closed window can rehydrate from the canonical Thread on reopen.
    }
  }

  async listPage(value: unknown): Promise<NyxThreadResult<NyxThreadListPage>> {
    const input = listPageInput.safeParse(value)
    if (!input.success || !this.active)
      return fail(safeErrors[input.success ? 'library_unavailable' : 'invalid_request'])
    const boundary = { eventEpoch: this.eventEpoch, includedThroughCursor: this.cursor }
    const capacity = this.capacity
    const reply = await this.active.client.listPage({
      ...input.data,
      cursor: input.data.cursor ?? null,
    })
    if (!reply.ok) return fail(this.publicError(reply.safeError.code))
    return ok({
      rows: reply.value.rows.map((row) => listSummary(row, this.activity(row.id))),
      nextCursor: reply.value.nextCursor,
      capacity,
      ...boundary,
    })
  }

  async search(value: unknown): Promise<NyxThreadResult<NyxThreadSearchResponse>> {
    const input = searchInput.safeParse(value)
    if (!input.success || !this.active)
      return fail(safeErrors[input.success ? 'library_unavailable' : 'invalid_request'])
    if (this.searchInFlight) return fail(searchConflict)
    this.searchInFlight = true
    try {
      const reply = await this.active.client.search(input.data)
      if (!reply.ok) return fail(this.publicError(reply.safeError.code))
      return ok({
        results: reply.value.results.map((result) => ({
          threadId: result.threadId,
          title: result.title,
          location: result.location,
          source: result.source,
          snippet: result.snippet,
          messageId: result.messageId,
        })),
        truncated: reply.value.truncated,
        eventEpoch: this.eventEpoch,
        includedThroughCursor: this.boundaryCursor(reply.clock),
      })
    } catch {
      return fail(safeErrors.library_unavailable)
    } finally {
      this.searchInFlight = false
    }
  }

  async get(value: unknown): Promise<NyxThreadResult<NyxThreadSnapshot>> {
    const input = getInput.safeParse(value)
    if (!input.success || !this.active)
      return fail(safeErrors[input.success ? 'library_unavailable' : 'invalid_request'])
    const selectionRequest = ++this.selectionRequest
    const boundary = { eventEpoch: this.eventEpoch, includedThroughCursor: this.cursor }
    const live = input.data.threadId ? this.liveChats.get(input.data.threadId) : null
    const liveChat = live ? { ...live } : null
    const reply = await this.active.client.snapshot(input.data)
    if (!reply.ok) {
      if (
        selectionRequest === this.selectionRequest &&
        input.data.threadId === this.selectedThreadId
      )
        this.clearSelection()
      return fail(this.publicError(reply.safeError.code))
    }
    const detail = reply.value.detail ? this.toSharedDetail(reply.value.detail, liveChat) : null
    if (selectionRequest === this.selectionRequest) this.authorizeDetail(reply.value.detail)
    return ok({
      detail,
      ...boundary,
    })
  }

  async materialize(value: unknown) {
    const parsed = materializeInput.safeParse(value)
    if (!parsed.success || !this.active || !this.coordinator) {
      return fail(safeErrors[parsed.success ? 'library_unavailable' : 'invalid_request'])
    }
    const selectionRequest = ++this.selectionRequest
    this.pendingMaterialize ??= (() => {
      const now = this.options.now?.() ?? new Date()
      return {
        threadId: this.options.generateId?.() ?? randomUUID(),
        createdAt: now.toISOString(),
        fallbackLocalSecond: localSecond(now),
        input: structuredClone(parsed.data),
      }
    })()
    try {
      const pending = this.pendingMaterialize
      const reply = await this.coordinator.materialize(this.materializeCoordinatorInput(pending))
      if (!reply.ok) return fail(this.publicError(reply.safeError.code))
      const detail = this.toSharedDetail(reply.value)
      this.pendingMaterialize = null
      this.authorizeDetail(reply.value, selectionRequest)
      return ok({
        detail,
        eventEpoch: this.eventEpoch,
        includedThroughCursor: this.boundaryCursor(reply.clock),
      })
    } catch {
      return fail(safeErrors.library_unavailable)
    }
  }

  async saveDraft(value: unknown) {
    const parsed = saveDraftInput.safeParse(value)
    if (!parsed.success || !this.active || !this.coordinator) {
      return fail(safeErrors[parsed.success ? 'library_unavailable' : 'invalid_request'])
    }
    const selectionRequest = ++this.selectionRequest
    try {
      const input = await this.saveCoordinatorInput(parsed.data)
      if (!input) return fail(safeErrors.invalid_request)
      const reply = await this.coordinator.saveDraft(input)
      if (!reply.ok) return fail(this.publicError(reply.safeError.code))
      if (reply.value.status === 'conflict') return fail(safeErrors.conflict)
      let detail: ThreadLibraryThreadDetail | null = reply.value.detail
      let discarded = false
      if (parsed.data.discardEmptyShell) {
        const discard = await this.active.client.discardEmptyShell({
          threadId: parsed.data.threadId,
          expectedDraftRevision: detail.draft.draftRevision,
        })
        if (!discard.ok) return fail(this.publicError(discard.safeError.code))
        discarded = discard.value.discarded
        if (discarded) {
          detail = null
          this.broadcast({
            type: 'threads:removed',
            threadId: parsed.data.threadId,
            eventEpoch: this.eventEpoch,
            includedThroughCursor: this.cursor,
          })
        }
      }
      this.authorizeDetail(detail, selectionRequest)
      const clock = this.active.client.currentClock()
      return ok({
        detail: detail ? this.toSharedDetail(detail) : null,
        discarded,
        eventEpoch: this.eventEpoch,
        includedThroughCursor: this.boundaryCursor(clock),
      })
    } catch (error) {
      return fail(
        error instanceof ServiceReadError
          ? this.publicError(error.code)
          : safeErrors.library_unavailable,
      )
    }
  }

  async retryOpen(value: unknown) {
    const parsed = retryOpenInput.safeParse(value)
    if (!parsed.success) return fail(safeErrors.invalid_request)
    if (parsed.data.scope === 'library') {
      return (await this.ensureLibraryOpen()) ? ok(null) : fail(safeErrors.library_unavailable)
    }
    if (!(await this.ensureLibraryOpen()) || !this.coordinator) {
      return fail(safeErrors.library_unavailable)
    }
    try {
      const detail = await this.coordinator.reconcileThread(
        parsed.data.threadId,
        new Date().toISOString(),
      )
      if (!detail) return fail(safeErrors.not_found)
      this.emitChanged(detail)
      return ok(null)
    } catch {
      return fail(safeErrors.thread_unavailable)
    }
  }

  private async ensureLibraryOpen() {
    if (!this.active) return this.activate()
    try {
      const probe = await this.active.client.listPage({
        location: 'available',
        cursor: null,
        limit: 50,
      })
      if (probe.ok) return true
    } catch {
      // A dead Worker is reopened below.
    }
    await this.deactivate()
    return this.activate()
  }

  async markSeen(value: unknown) {
    const input = markSeenInput.safeParse(value)
    if (!input.success || !this.active)
      return fail(safeErrors[input.success ? 'library_unavailable' : 'invalid_request'])
    const reply = await this.active.client.markSeen(input.data)
    if (!reply.ok) return fail(this.publicError(reply.safeError.code))
    return ok({
      detail: this.toSharedDetail(reply.value),
      eventEpoch: this.eventEpoch,
      includedThroughCursor: this.boundaryCursor(reply.clock),
    })
  }

  async updatePin(value: unknown) {
    const input = updatePinInput.safeParse(value)
    if (!input.success || !this.active)
      return fail(safeErrors[input.success ? 'library_unavailable' : 'invalid_request'])
    const reply = await this.active.client.updatePin(input.data)
    if (!reply.ok) return fail(this.publicError(reply.safeError.code))
    return ok({
      detail: this.toSharedDetail(reply.value),
      eventEpoch: this.eventEpoch,
      includedThroughCursor: this.boundaryCursor(reply.clock),
    })
  }

  async rename(value: unknown) {
    const input = renameInput.safeParse(value)
    if (!input.success || !this.active) {
      return fail(safeErrors[input.success ? 'library_unavailable' : 'invalid_request'])
    }
    const title = validateNyxThreadTitle(input.data.title)
    if (!title.ok) return fail({ code: 'invalid_request', message: title.message })
    const reply = await this.active.client.rename({
      threadId: input.data.threadId,
      title: title.title,
      expectedThreadRevision: input.data.expectedThreadRevision,
      renamedAt: (this.options.now?.() ?? new Date()).toISOString(),
    })
    if (!reply.ok) return fail(this.publicError(reply.safeError.code))
    return ok({
      detail: this.toSharedDetail(reply.value),
      eventEpoch: this.eventEpoch,
      includedThroughCursor: this.boundaryCursor(reply.clock),
    })
  }

  async updateLocation(value: unknown) {
    const input = updateLocationInput.safeParse(value)
    if (!input.success || !this.active) {
      return fail(safeErrors[input.success ? 'library_unavailable' : 'invalid_request'])
    }
    const activity = this.activity(input.data.threadId)
    if (
      (input.data.action === 'archive' || input.data.action === 'trash') &&
      activity.status !== 'idle'
    ) {
      return fail(safeErrors.invalid_request)
    }
    const reply = await this.active.client.updateLocation({
      ...input.data,
      movedAt: (this.options.now?.() ?? new Date()).toISOString(),
    })
    if (!reply.ok) return fail(this.publicError(reply.safeError.code))
    return ok({
      detail: this.toSharedDetail(reply.value),
      eventEpoch: this.eventEpoch,
      includedThroughCursor: this.boundaryCursor(reply.clock),
    })
  }

  private async activate() {
    if (this.active) return true
    if (this.activation) return this.activation
    this.activation = (async () => {
      let opened: ActivatedThreadLibrary | null = null
      try {
        const active = await this.options.activate()
        opened = active
        this.active = active
        if (this.coordinator) this.coordinator.replaceStorage(active.client, active.sidecars)
        else
          this.coordinator = new ThreadLibraryCoordinator({
            client: active.client,
            sidecars: active.sidecars,
          })
        active.client.setAcknowledgementObserver((acknowledgement) => this.observe(acknowledgement))
        this.rotateEpoch(active.client.currentClock(), false)
        if (!this.startupRecovered) {
          this.pendingRecoveryAt ??= (this.options.now?.() ?? new Date()).toISOString()
          const recovered = await active.client.recoverPending({
            recoveredAt: this.pendingRecoveryAt,
          })
          if (!recovered.ok) throw new Error('Thread recovery failed.')
          this.pendingRecoveryAt = null
          this.startupRecovered = true
        }
        return true
      } catch {
        opened?.client.setAcknowledgementObserver(undefined)
        try {
          await opened?.client.close()
        } catch {
          // Retry reopens the same canonical root and repeats the same recovery command.
        }
        this.active = null
        this.clearSelection()
        return false
      }
    })()
    try {
      return await this.activation
    } finally {
      this.activation = null
    }
  }

  private async deactivate() {
    const active = this.active
    active?.client.setAcknowledgementObserver(undefined)
    try {
      await active?.client.close()
    } catch {
      // Retry opens the same canonical root with a new Worker generation.
    }
    this.active = null
    this.clearSelection()
  }

  private observe(acknowledgement: ThreadLibraryAcknowledgement) {
    const { clock } = acknowledgement
    if (clock.generation !== this.eventEpoch) this.rotateEpoch(clock, true)
    if (!clock.actualMutation) {
      this.watermarkCursor.set(clock.watermark, this.lastCanonicalCursor)
      return
    }
    this.cursor += 1
    this.lastCanonicalCursor = this.cursor
    this.watermarkCursor.set(clock.watermark, this.cursor)
    const value = acknowledgement.value as unknown
    if (acknowledgement.operation === 'discardEmptyShell') return
    const detail = this.detailFromMutation(value)
    if (detail) this.emitChanged(detail)
  }

  private rotateEpoch(
    clock: Omit<ThreadLibraryAcknowledgementClock, 'actualMutation'>,
    announce: boolean,
  ) {
    this.eventEpoch = clock.generation
    this.cursor = 0
    this.lastCanonicalCursor = 0
    this.watermarkCursor.clear()
    this.watermarkCursor.set(clock.watermark, 0)
    this.clearSelection()
    if (announce) {
      this.broadcast({
        type: 'threads:epoch-changed',
        eventEpoch: this.eventEpoch,
        includedThroughCursor: 0,
      })
    }
  }

  private boundaryCursor(clock: Omit<ThreadLibraryAcknowledgementClock, 'actualMutation'>) {
    if (clock.generation !== this.eventEpoch) return 0
    return this.watermarkCursor.get(clock.watermark) ?? this.lastCanonicalCursor
  }

  private emitChanged(detail: ThreadLibraryThreadDetail) {
    if (this.selectedThreadId === detail.summary.id) this.authorizeDetail(detail)
    this.broadcast({
      type: 'threads:changed',
      detail: this.toSharedDetail(detail),
      eventEpoch: this.eventEpoch,
      includedThroughCursor: this.cursor,
    })
  }

  private detailFromMutation(value: unknown) {
    if (!value || typeof value !== 'object') return null
    if ('summary' in value) return value as ThreadLibraryThreadDetail
    if ('status' in value && value.status === 'committed' && 'detail' in value) {
      return value.detail as ThreadLibraryThreadDetail
    }
    return null
  }

  private broadcast(event: NyxThreadEvent) {
    try {
      this.options.broadcastThreadEvent(event)
    } catch {
      // Renderer delivery must not invalidate an acknowledged Worker mutation.
    }
  }

  private authorizeDetail(
    detail: ThreadLibraryThreadDetail | null,
    selectionRequest = this.selectionRequest,
  ) {
    if (selectionRequest !== this.selectionRequest) return
    this.imageAuthorization.clear()
    this.selectedThreadId = detail?.summary.id ?? null
    if (!detail) return
    for (const ref of detail.images) {
      if (ref.available)
        this.imageAuthorization.set(ref.imageId, { threadId: detail.summary.id, ref })
    }
  }

  private clearSelection() {
    this.selectionRequest += 1
    this.selectedThreadId = null
    this.imageAuthorization.clear()
  }

  private toSharedDetail(
    detail: ThreadLibraryThreadDetail,
    liveChat = this.liveChats.get(detail.summary.id) ?? null,
  ): NyxThreadDetail {
    const messages: NyxChatMessage[] = []
    for (const turn of detail.turns) {
      const images = detail.images
        .filter((row) => row.owner === 'turn' && row.turnOrdinal === turn.ordinal)
        .sort((left, right) => left.position - right.position)
        .map(({ imageId, mediaType, width, height, available }) => ({
          imageId,
          mediaType,
          width,
          height,
          available,
        }))
      const documents = detail.documents
        .filter((row) => row.owner === 'turn' && row.turnOrdinal === turn.ordinal)
        .sort((left, right) => left.position - right.position)
        .map(({ documentId, name, mediaType, byteLength, extractedByteLength, available }) => ({
          documentId,
          name,
          mediaType,
          byteLength,
          extractedByteLength,
          available,
        }))
      messages.push({
        id: turn.userMessageId,
        role: 'user',
        content: turn.userContent,
        status: 'completed',
        ...(images.length ? { images } : {}),
        ...(documents.length ? { documents } : {}),
      })
      messages.push({
        id: turn.assistantMessageId,
        role: 'assistant',
        content: turn.assistantContent,
        status: turn.assistantStatus === 'pending' ? 'streaming' : turn.assistantStatus,
        ...(turn.error ? { error: turn.error } : {}),
        ...(turn.targetAttribution ? { targetAttribution: turn.targetAttribution } : {}),
      })
    }
    const last = detail.turns.at(-1)
    const live =
      last?.assistantStatus === 'pending' &&
      liveChat?.threadId === detail.summary.id &&
      liveChat.requestId === last.attemptRequestId &&
      (!liveChat.assistantMessageId || liveChat.assistantMessageId === last.assistantMessageId)
        ? liveChat
        : null
    if (last && last.assistantStatus !== 'pending' && this.liveChats.has(detail.summary.id)) {
      this.liveChats.delete(detail.summary.id)
    }
    if (live) {
      const assistant = messages.find((message) => message.id === last!.assistantMessageId)
      if (assistant) {
        assistant.content = live.content
        assistant.status = live.status === 'saving_failed' ? 'failed' : 'streaming'
        if (live.error) assistant.error = live.error
        if (live.targetAttribution) assistant.targetAttribution = live.targetAttribution
      }
    }
    const settlementRequestId =
      this.coordinator?.settlementFailureRequestId(detail.summary.id) ?? null
    const settlement =
      settlementRequestId &&
      last?.assistantStatus === 'pending' &&
      last.attemptRequestId === settlementRequestId
        ? last
        : null
    const retryable = last?.assistantStatus === 'failed' && last.error?.retryable ? last : null
    if (retryable) {
      const assistant = messages.find((message) => message.id === retryable.assistantMessageId)
      if (assistant) assistant.canRetry = true
    }
    if (settlement) {
      const assistant = messages.find((message) => message.id === settlement.assistantMessageId)
      if (assistant) {
        assistant.status = 'failed'
        assistant.error = { code: 'unknown', message: "Couldn't save result", retryable: true }
        assistant.canRetry = true
      }
    }
    return {
      summary: availableSummary(detail.summary, this.activity(detail.summary.id)),
      draft: {
        revision: detail.draft.draftRevision,
        text: detail.draft.text,
        targetSelection: detail.draft.targetSelection,
        images: detail.images
          .filter((row) => row.owner === 'draft')
          .sort((left, right) => left.position - right.position)
          .map(({ imageId, mediaType, width, height, available }) => ({
            imageId,
            mediaType,
            width,
            height,
            available,
          })),
        documents: detail.documents
          .filter((row) => row.owner === 'draft')
          .sort((left, right) => left.position - right.position)
          .map(({ documentId, name, mediaType, byteLength, extractedByteLength, available }) => ({
            documentId,
            name,
            mediaType,
            byteLength,
            extractedByteLength,
            available,
          })),
      },
      messages,
      runStatus:
        settlement || live?.status === 'saving_failed'
          ? 'failed'
          : (live?.status ??
            (last?.assistantStatus === 'pending'
              ? 'streaming'
              : (last?.assistantStatus ?? 'idle'))),
      activeRun:
        (live?.status === 'submitting' || live?.status === 'streaming') && !settlement
          ? {
              requestId: live.requestId,
              assistantMessageId: last!.assistantMessageId,
              turnIntent: live.turnIntent,
              attachmentBearing: live.attachmentBearing,
            }
          : null,
      retryableTurn: retryable
        ? {
            turnOrdinal: retryable.ordinal,
            expectedAttemptRequestId: retryable.attemptRequestId,
            expectedDraftRevision: detail.draft.draftRevision,
            userMessageId: retryable.userMessageId,
            assistantMessageId: retryable.assistantMessageId,
          }
        : null,
      settlementFailure: settlement
        ? {
            requestId: settlement.attemptRequestId,
            assistantMessageId: settlement.assistantMessageId,
          }
        : null,
    }
  }

  private activity(threadId: string): NyxThreadActivity {
    const live = this.liveChats.get(threadId)
    const settlementRequestId = this.coordinator?.settlementFailureRequestId(threadId) ?? null
    if (settlementRequestId) return { status: 'saving_failed', requestId: settlementRequestId }
    if (live?.status === 'submitting' || live?.status === 'streaming') {
      return {
        status: live.status,
        requestId: live.requestId,
        attachmentBearing: live.attachmentBearing,
      }
    }
    return { status: 'idle' }
  }

  private materializeCoordinatorInput(
    pending: NonNullable<ThreadLibraryService['pendingMaterialize']>,
  ) {
    const newImages = pending.input.newImages ?? []
    const newDocuments = pending.input.newDocuments ?? []
    if (
      pending.input.images.some((ref, index) => ref.imageId !== newImages[index]?.imageId) ||
      pending.input.images.length !== newImages.length ||
      pending.input.documents.some(
        (ref, index) => ref.documentId !== newDocuments[index]?.documentId,
      ) ||
      pending.input.documents.length !== newDocuments.length
    )
      throw new Error('Initial Draft resources must carry their bytes.')
    return {
      input: {
        threadId: pending.threadId,
        fallbackLocalSecond: pending.fallbackLocalSecond,
        createdAt: pending.createdAt,
        draft: {
          text: pending.input.text,
          targetSelection: pending.input.targetSelection,
          images: [],
          documents: [],
        },
      },
      newImages: pending.input.images.map((ref, index) => ({
        ref,
        position: ref.position,
        image: newImages[index]!,
      })),
      newDocuments: pending.input.documents.map((ref, index) => ({
        ref,
        position: ref.position,
        document: newDocuments[index]!,
      })),
    }
  }

  private async saveCoordinatorInput(input: z.infer<typeof saveDraftInput>) {
    const read = await this.active!.client.readThread({ threadId: input.threadId })
    if (!read.ok) throw new ServiceReadError(read.safeError.code)
    if (!read.value) return null
    if (read.value.summary.location !== 'available') return null
    const newImageIds = new Set((input.newImages ?? []).map((row) => row.imageId))
    const newDocumentIds = new Set((input.newDocuments ?? []).map((row) => row.documentId))
    const images = []
    for (const ref of input.images) {
      if (newImageIds.has(ref.imageId)) continue
      const canonical = read.value.images.find(
        (row) => row.owner === 'draft' && row.imageId === ref.imageId,
      )
      if (
        !canonical ||
        canonical.mediaType !== ref.mediaType ||
        canonical.width !== ref.width ||
        canonical.height !== ref.height
      )
        return null
      images.push({
        imageId: canonical.imageId,
        position: ref.position,
        mediaType: canonical.mediaType,
        width: canonical.width,
        height: canonical.height,
        available: canonical.available,
      })
    }
    const documents = []
    for (const ref of input.documents) {
      if (newDocumentIds.has(ref.documentId)) continue
      const canonical = read.value.documents.find(
        (row) => row.owner === 'draft' && row.documentId === ref.documentId,
      )
      if (
        !canonical ||
        canonical.name !== ref.name ||
        canonical.mediaType !== ref.mediaType ||
        canonical.byteLength !== ref.byteLength ||
        canonical.extractedByteLength !== ref.extractedByteLength
      )
        return null
      documents.push({
        documentId: canonical.documentId,
        position: ref.position,
        name: canonical.name,
        mediaType: canonical.mediaType,
        byteLength: canonical.byteLength,
        extractedByteLength: canonical.extractedByteLength,
        sourceSha256: canonical.sourceSha256,
        extractedTextSha256: canonical.extractedTextSha256,
        available: canonical.available,
        extractedText: canonical.extractedText,
      })
    }
    const newImages = (input.newImages ?? []).map((image) => {
      const ref = input.images.find((row) => row.imageId === image.imageId)
      if (!ref) throw new Error('New image is not in the Draft.')
      return { ref, position: ref.position, image }
    })
    const newDocuments = (input.newDocuments ?? []).map((document) => {
      const ref = input.documents.find((row) => row.documentId === document.documentId)
      if (!ref) throw new Error('New document is not in the Draft.')
      return { ref, position: ref.position, document }
    })
    return {
      input: {
        threadId: input.threadId,
        expectedDraftRevision: input.expectedDraftRevision,
        savedAt: new Date().toISOString(),
        draft: { text: input.text, targetSelection: input.targetSelection, images, documents },
      },
      newImages,
      newDocuments,
    }
  }

  private publicError(code: string): NyxThreadSafeError {
    if (code === 'not_found') return safeErrors.not_found
    if (
      code === 'stale_revision' ||
      code === 'stale_thread_revision' ||
      code === 'stale_pin_position' ||
      code === 'already_exists' ||
      code === 'stale_cursor'
    )
      return safeErrors.conflict
    if (code === 'invalid_request' || code === 'not_pending') return safeErrors.invalid_request
    if (code === 'thread_unavailable') return safeErrors.thread_unavailable
    return safeErrors.library_unavailable
  }
}
