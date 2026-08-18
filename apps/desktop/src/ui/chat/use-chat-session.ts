import { useEffect, useReducer, useRef, useState } from 'react'

import type { NyxChatEvent } from '../../../shared/chat/events'
import type { NyxThreadEvent } from '../../../shared/threads/events'
import type {
  NyxThreadDetail,
  NyxThreadSafeError,
  NyxThreadSaveDraftInput,
  NyxThreadSummary,
  NyxThreadActivity,
} from '../../../shared/threads/types'
import { isNyxChatDocumentName, nyxChatDocumentLimits } from '../../../shared/chat/document-file'
import { nyxChatImageLimits, parseNyxChatImageHeader } from '../../../shared/chat/image-file'
import type {
  NyxChatError,
  NyxChatDocumentMediaType,
  NyxChatTargetSelection,
} from '../../../shared/chat/types'
import { chatReducer } from './chat-reducer'
import {
  initialChatState,
  type ChatDocumentDraft,
  type ChatImageDraft,
  type ChatState,
} from './chat-types'
import type { DocumentExtractorRequest, DocumentExtractorResult } from './document-extractor.worker'
import type {
  ImageCanonicalizerRequest,
  ImageCanonicalizerResult,
} from './image-canonicalizer.worker'
import {
  isChatTargetAvailable,
  selectInitialChatTarget,
  type ConnectionStatusState,
} from './connection-status'

function normalizeBridgeError(error: unknown): NyxChatError {
  if (error instanceof Error) {
    return {
      code: 'unknown',
      message: error.message || 'Nyx could not start this chat request.',
      retryable: true,
    }
  }

  return {
    code: 'unknown',
    message: 'Nyx could not start this chat request.',
    retryable: true,
  }
}

function threadLibraryBridgeError(): NyxThreadSafeError {
  return {
    code: 'library_unavailable',
    message: "Couldn't open Thread Library",
  }
}

function threadMutationError(error: NyxThreadSafeError): NyxChatError {
  return {
    code: error.code === 'invalid_request' ? 'invalid_request' : 'unknown',
    message: error.message,
    retryable: true,
  }
}

interface UseChatSessionOptions {
  connectionStatus: ConnectionStatusState
  refreshConnections: () => Promise<void>
  getLatestConnectionRequestEpoch: () => number
}

interface DocumentPreparationOperation {
  worker: Worker
  draftId: string
  timeout: number
}

type SaveDraftOutcome = { ok: true; detail: NyxThreadDetail | null } | { ok: false }

function detailMatchesDraftInput(
  detail: NyxThreadDetail,
  input: Omit<NyxThreadSaveDraftInput, 'threadId' | 'expectedDraftRevision'>,
) {
  const selection = detail.draft.targetSelection
  const sameSelection =
    selection.kind === input.targetSelection.kind &&
    (selection.kind === 'env_fallback' ||
      (input.targetSelection.kind === 'connection' &&
        selection.providerId === input.targetSelection.providerId &&
        selection.modelId === input.targetSelection.modelId))
  return (
    detail.draft.text === input.text &&
    sameSelection &&
    detail.draft.images.length === input.images.length &&
    detail.draft.images.every((image, index) => {
      const expected = input.images[index]
      return (
        expected?.imageId === image.imageId &&
        expected.mediaType === image.mediaType &&
        expected.width === image.width &&
        expected.height === image.height
      )
    }) &&
    detail.draft.documents.length === input.documents.length &&
    detail.draft.documents.every((document, index) => {
      const expected = input.documents[index]
      return (
        expected?.documentId === document.documentId &&
        expected.name === document.name &&
        expected.mediaType === document.mediaType &&
        expected.byteLength === document.byteLength &&
        expected.extractedByteLength === document.extractedByteLength
      )
    })
  )
}

type TargetCatalogAction =
  | {
      type: 'target-context-ready'
      generation: number
      catalogEpoch: number
      selection: NyxChatTargetSelection | null
      available: boolean
    }
  | {
      type: 'target-catalog-updated'
      generation: number
      catalogEpoch: number
      available: boolean
    }
  | {
      type: 'target-catalog-unready'
      catalogEpoch: number
    }

export function deriveTargetCatalogAction(
  state: ChatState,
  connectionStatus: ConnectionStatusState,
): TargetCatalogAction | null {
  if (state.hydrationStatus !== 'ready' || state.saveStatus === 'saving') {
    return null
  }

  if (connectionStatus.kind !== 'ready') {
    return {
      type: 'target-catalog-unready',
      catalogEpoch: connectionStatus.requestEpoch,
    }
  }

  if (!state.targetInitialized) {
    const selection = selectInitialChatTarget(state.committedTarget, connectionStatus.overview)

    return {
      type: 'target-context-ready',
      generation: state.projectionGeneration,
      catalogEpoch: connectionStatus.requestEpoch,
      selection,
      available: isChatTargetAvailable(selection, connectionStatus.overview),
    }
  }

  return {
    type: 'target-catalog-updated',
    generation: state.projectionGeneration,
    catalogEpoch: connectionStatus.requestEpoch,
    available: isChatTargetAvailable(state.targetDraft, connectionStatus.overview),
  }
}

export function threadIsAttachmentBearing(state: ChatState) {
  return (
    state.draftImages.length > 0 ||
    state.draftDocuments.length > 0 ||
    state.messages.some(
      (message) => (message.images?.length ?? 0) > 0 || (message.documents?.length ?? 0) > 0,
    )
  )
}

export function runCapacityBlock(
  state: ChatState,
  summaries: ReadonlyArray<NyxThreadSummary>,
): string | null {
  const activities = summaries
    .filter((summary) => summary.availability === 'available')
    .map((summary) => summary.activity ?? ({ status: 'idle' } as const))
  const active = activities.filter(
    (activity) => activity.status === 'submitting' || activity.status === 'streaming',
  )
  if (active.length >= 2) return 'Two responses are already running.'
  if (
    threadIsAttachmentBearing(state) &&
    active.some(
      (activity) =>
        (activity.status === 'submitting' || activity.status === 'streaming') &&
        activity.attachmentBearing,
    )
  ) {
    return 'Another attachment response is already running.'
  }
  return null
}

export function canSubmitChat(
  state: ChatState,
  connectionStatus: ConnectionStatusState,
  capacityAvailable = true,
) {
  const hasContent =
    state.input.trim().length > 0 || state.draftImages.length > 0 || state.draftDocuments.length > 0
  const imagesReady = state.draftImages.every((image) => image.status === 'ready')
  const documentsReady = state.draftDocuments.every((document) => document.status === 'ready')

  return (
    state.hydrationStatus === 'ready' &&
    state.saveStatus === 'idle' &&
    hasContent &&
    imagesReady &&
    documentsReady &&
    !state.activeRequestId &&
    !state.settlementFailure &&
    capacityAvailable &&
    connectionStatus.kind === 'ready' &&
    state.targetInitialized &&
    state.targetAvailable &&
    isChatTargetAvailable(state.targetDraft, connectionStatus.overview)
  )
}

export function revokeDraftPreviewUrls(
  drafts: ReadonlyArray<ChatImageDraft>,
  imageIds: ReadonlySet<string>,
  revoke: (url: string) => void,
) {
  for (const image of drafts) {
    if (imageIds.has(image.id) && image.status === 'ready') {
      revoke(image.previewUrl)
    }
  }
}

export function useChatSession({
  connectionStatus,
  refreshConnections,
  getLatestConnectionRequestEpoch,
}: UseChatSessionOptions) {
  const [state, dispatch] = useReducer(chatReducer, initialChatState)
  const [threadSummaries, setThreadSummaries] = useState<ReadonlyArray<NyxThreadSummary>>([])
  const [navigating, setNavigating] = useState(false)
  const projectionGeneration = useRef(initialChatState.projectionGeneration)
  const stateRef = useRef(state)
  const threadSummariesRef = useRef(threadSummaries)
  const workerRef = useRef<Worker | null>(null)
  const documentWorkerRef = useRef<DocumentPreparationOperation | null>(null)
  const liveDraftsRef = useRef(new Set<string>())
  const liveDocumentDraftsRef = useRef(new Set<string>())
  const workerDraftsRef = useRef(new Set<string>())
  const pendingDraftsRef = useRef(new Map<string, ReadonlyArray<string>>())
  const pendingDocumentDraftsRef = useRef(new Map<string, ReadonlyArray<string>>())
  const submittingRef = useRef(false)
  const activeRequestIdRef = useRef<string | null>(null)
  const selectedThreadIdRef = useRef<string | null>(null)
  const saveQueueRef = useRef<Promise<SaveDraftOutcome>>(
    Promise.resolve({ ok: true, detail: null }),
  )
  const hydrationRef = useRef(0)
  const retryHydrationRef = useRef<(() => Promise<void>) | null>(null)
  const navigationRef = useRef(false)
  stateRef.current = state
  threadSummariesRef.current = threadSummaries
  selectedThreadIdRef.current = state.selectedThreadId
  activeRequestIdRef.current = state.activeRequestId ?? null

  function replaceThreadSummaries(rows: ReadonlyArray<NyxThreadSummary>) {
    threadSummariesRef.current = rows
    setThreadSummaries(rows)
  }

  function upsertThreadSummary(summary: NyxThreadSummary) {
    const rows = threadSummariesRef.current
    const existing = rows.findIndex((candidate) => candidate.id === summary.id)
    replaceThreadSummaries(
      existing === -1
        ? [summary, ...rows]
        : rows.map((candidate, index) => (index === existing ? summary : candidate)),
    )
  }

  function updateThreadActivity(threadId: string, activity: NyxThreadActivity) {
    const fallback =
      stateRef.current.threadSummary?.id === threadId ? stateRef.current.threadSummary : null
    const rows = threadSummariesRef.current
    const existing = rows.find((candidate) => candidate.id === threadId) ?? fallback
    if (!existing || existing.availability !== 'available') return
    upsertThreadSummary({ ...existing, activity })
  }

  function failDraft(imageId: string, error = 'Nyx could not prepare this image.') {
    workerDraftsRef.current.delete(imageId)

    if (!liveDraftsRef.current.has(imageId)) {
      return
    }

    dispatch({ type: 'draft-image-failed', imageId, error })
  }

  function imageWorker() {
    if (workerRef.current) {
      return workerRef.current
    }

    const worker = new Worker(new URL('./image-canonicalizer.worker.ts', import.meta.url), {
      type: 'module',
      name: 'nyx-image-canonicalizer',
    })

    worker.onmessage = (event: MessageEvent<ImageCanonicalizerResult>) => {
      const result = event.data
      workerDraftsRef.current.delete(result.draftId)

      try {
        if (!liveDraftsRef.current.has(result.draftId)) {
          return
        }

        if (!result.ok) {
          failDraft(result.draftId, result.error)
          return
        }

        const canonicalBytes = new Uint8Array(result.canonical)
        const previewBytes = new Uint8Array(result.preview)
        const pixels = result.width * result.height

        if (
          canonicalBytes.byteLength === 0 ||
          canonicalBytes.byteLength > nyxChatImageLimits.canonicalBytesPerImage ||
          previewBytes.byteLength === 0 ||
          previewBytes.byteLength > nyxChatImageLimits.previewBytesPerImage ||
          result.width <= 0 ||
          result.height <= 0 ||
          Math.max(result.width, result.height) > nyxChatImageLimits.fullMaxEdge ||
          pixels > nyxChatImageLimits.newImagePixelsPerImage
        ) {
          failDraft(result.draftId)
          return
        }

        const previewUrl = URL.createObjectURL(new Blob([previewBytes], { type: 'image/png' }))

        if (!liveDraftsRef.current.has(result.draftId)) {
          URL.revokeObjectURL(previewUrl)
          return
        }

        dispatch({
          type: 'draft-image-ready',
          imageId: result.draftId,
          image: {
            mediaType: result.mediaType,
            width: result.width,
            height: result.height,
          },
          canonicalBytes,
          previewBytes,
          previewUrl,
        })
      } finally {
        if (workerDraftsRef.current.size === 0 && workerRef.current === worker) {
          worker.terminate()
          workerRef.current = null
        }
      }
    }

    worker.onerror = (event) => {
      event.preventDefault()
      worker.terminate()
      workerRef.current = null

      for (const imageId of workerDraftsRef.current) {
        failDraft(imageId)
      }

      workerDraftsRef.current.clear()
    }

    workerRef.current = worker
    return worker
  }

  async function prepareDraftImage(imageId: string, source: Blob) {
    try {
      if (
        source.size === 0 ||
        source.size > nyxChatImageLimits.canonicalBytesPerImage ||
        (source.type !== 'image/png' && source.type !== 'image/jpeg')
      ) {
        failDraft(imageId, 'Use a PNG or JPEG image no larger than 8 MB.')
        return
      }

      const sourceBuffer = await source.arrayBuffer()

      if (!liveDraftsRef.current.has(imageId)) {
        return
      }

      const parsed = parseNyxChatImageHeader(new Uint8Array(sourceBuffer))
      const pixels = parsed.width * parsed.height

      if (pixels > nyxChatImageLimits.newImagePixelsPerImage) {
        failDraft(imageId, 'This image is too large. Resize it below 4 MP and try again.')
        return
      }

      if (
        parsed.mediaType !== source.type ||
        Math.max(parsed.width, parsed.height) > nyxChatImageLimits.fullMaxEdge ||
        pixels > nyxChatImageLimits.fullPixelsPerImage
      ) {
        failDraft(imageId, 'This image is too large or does not match its file type.')
        return
      }

      const request: ImageCanonicalizerRequest = {
        draftId: imageId,
        source: sourceBuffer,
        mediaType: parsed.mediaType,
      }
      workerDraftsRef.current.add(imageId)
      imageWorker().postMessage(request, [sourceBuffer])
    } catch {
      failDraft(imageId)
    }
  }

  function stopDocumentWorker(target?: string | DocumentPreparationOperation) {
    const active = documentWorkerRef.current

    if (
      !active ||
      (typeof target === 'string' && active.draftId !== target) ||
      (typeof target === 'object' && active !== target)
    ) {
      return
    }

    window.clearTimeout(active.timeout)
    active.worker.terminate()
    documentWorkerRef.current = null
  }

  function failDocumentDraft(
    documentId: string,
    error = 'Nyx could not prepare this document.',
    operation?: DocumentPreparationOperation,
  ) {
    if (operation && documentWorkerRef.current !== operation) {
      return
    }

    stopDocumentWorker(operation ?? documentId)

    if (liveDocumentDraftsRef.current.has(documentId)) {
      dispatch({ type: 'draft-document-failed', documentId, error })
    }
  }

  async function prepareDraftDocument(
    documentId: string,
    source: File,
    mediaType: NyxChatDocumentMediaType,
  ) {
    if (
      source.size === 0 ||
      source.size > nyxChatDocumentLimits.sourceBytesPerDocument ||
      !isNyxChatDocumentName(source.name, mediaType)
    ) {
      failDocumentDraft(documentId, 'Use a supported document no larger than 8 MB.')
      return
    }

    let operation: DocumentPreparationOperation | undefined

    try {
      const worker = new Worker(new URL('./document-extractor.worker.ts', import.meta.url), {
        type: 'module',
        name: 'nyx-document-extractor',
      })
      operation = { worker, draftId: documentId, timeout: 0 }
      operation.timeout = window.setTimeout(() => {
        failDocumentDraft(documentId, 'Document preparation timed out.', operation)
      }, 10_000)
      documentWorkerRef.current = operation

      worker.onmessage = (event: MessageEvent<DocumentExtractorResult>) => {
        const result = event.data

        if (documentWorkerRef.current !== operation) {
          return
        }

        if (result.draftId !== documentId) {
          failDocumentDraft(documentId, 'Nyx could not prepare this document.', operation)
          return
        }

        if (!result.ok) {
          failDocumentDraft(documentId, result.error, operation)
          return
        }

        void source
          .arrayBuffer()
          .then((sourceBuffer) => {
            if (
              documentWorkerRef.current !== operation ||
              !liveDocumentDraftsRef.current.has(documentId)
            ) {
              return
            }

            const extractedTextBytes = new Uint8Array(result.extractedText)

            if (
              sourceBuffer.byteLength !== source.size ||
              extractedTextBytes.byteLength === 0 ||
              extractedTextBytes.byteLength > nyxChatDocumentLimits.extractedBytesPerDocument ||
              !/^[0-9a-f]{64}$/u.test(result.sourceSha256)
            ) {
              failDocumentDraft(documentId, 'Nyx could not prepare this document.', operation)
              return
            }

            stopDocumentWorker(operation)
            dispatch({
              type: 'draft-document-ready',
              documentId,
              document: {
                name: source.name,
                mediaType,
                byteLength: source.size,
                extractedByteLength: extractedTextBytes.byteLength,
              },
              sourceBytes: new Uint8Array(sourceBuffer),
              extractedTextBytes,
              extractedFromSha256: result.sourceSha256,
            })
          })
          .catch(() => {
            failDocumentDraft(documentId, 'Nyx could not prepare this document.', operation)
          })
      }

      worker.onerror = (event) => {
        event.preventDefault()
        failDocumentDraft(documentId, 'Nyx could not prepare this document.', operation)
      }

      const request: DocumentExtractorRequest = { draftId: documentId, source, mediaType }
      worker.postMessage(request)
    } catch {
      if (operation) {
        failDocumentDraft(documentId, 'Nyx could not prepare this document.', operation)
      } else {
        failDocumentDraft(documentId)
      }
    }
  }

  function releaseDrafts(imageIds?: ReadonlySet<string>) {
    const releasedIds = new Set<string>()

    for (const image of stateRef.current.draftImages) {
      if ((imageIds && !imageIds.has(image.id)) || !liveDraftsRef.current.has(image.id)) {
        continue
      }

      liveDraftsRef.current.delete(image.id)
      workerDraftsRef.current.delete(image.id)
      releasedIds.add(image.id)
    }

    revokeDraftPreviewUrls(stateRef.current.draftImages, releasedIds, URL.revokeObjectURL)
  }

  function releaseAllDrafts() {
    releaseDrafts()
    releaseDocumentDrafts()
    pendingDraftsRef.current.clear()
    pendingDocumentDraftsRef.current.clear()
    workerDraftsRef.current.clear()
    workerRef.current?.terminate()
    workerRef.current = null
  }

  function releaseDocumentDrafts(documentIds?: ReadonlySet<string>) {
    for (const document of stateRef.current.draftDocuments) {
      if (
        (documentIds && !documentIds.has(document.id)) ||
        !liveDocumentDraftsRef.current.has(document.id)
      ) {
        continue
      }

      liveDocumentDraftsRef.current.delete(document.id)
      stopDocumentWorker(document.id)
    }
  }

  useEffect(() => releaseAllDrafts, [])

  useEffect(() => {
    if (!window.nyx) {
      return
    }

    let disposed = false
    const chat = window.nyx.chat
    const threads = window.nyx.threads
    const bufferedEvents: Array<
      { kind: 'chat'; event: NyxChatEvent } | { kind: 'thread'; event: NyxThreadEvent }
    > = []
    let hydrated = false
    let eventEpoch: string | null = null
    let listCursor = 0
    let detailCursor = 0

    function acceptClock(nextEpoch: string, cursor: number) {
      if (!eventEpoch || nextEpoch !== eventEpoch) {
        void hydrateThreadLibrary()
        return null
      }

      let listAdvanced = false
      let detailAdvanced = false
      if (cursor > listCursor) {
        if (cursor !== listCursor + 1) {
          void hydrateThreadLibrary()
          return null
        }
        listCursor = cursor
        listAdvanced = true
      }
      if (cursor > detailCursor) {
        if (cursor !== detailCursor + 1) {
          void hydrateThreadLibrary()
          return null
        }
        detailCursor = cursor
        detailAdvanced = true
      }
      return { listAdvanced, detailAdvanced }
    }

    function handleChatEvent(event: NyxChatEvent) {
      const accepted = acceptClock(event.eventEpoch, event.cursor)
      if (!accepted || !accepted.detailAdvanced) return
      if (event.type === 'chat:accepted') {
        updateThreadActivity(event.threadId, {
          status: 'submitting',
          requestId: event.requestId,
          attachmentBearing: event.attachmentBearing,
        })
        const capturedDraftIds = pendingDraftsRef.current.get(event.requestId)
        if (capturedDraftIds) {
          releaseDrafts(new Set(capturedDraftIds))
          pendingDraftsRef.current.delete(event.requestId)
        }
        const capturedDocumentDraftIds = pendingDocumentDraftsRef.current.get(event.requestId)
        if (capturedDocumentDraftIds) {
          releaseDocumentDrafts(new Set(capturedDocumentDraftIds))
          pendingDocumentDraftsRef.current.delete(event.requestId)
        }
      } else if (event.type === 'chat:start' || event.type === 'chat:delta') {
        const current = threadSummariesRef.current.find((summary) => summary.id === event.threadId)
        const activity = current?.availability === 'available' ? current.activity : null
        updateThreadActivity(event.threadId, {
          status: 'streaming',
          requestId: event.requestId,
          attachmentBearing:
            activity?.status === 'submitting' || activity?.status === 'streaming'
              ? activity.attachmentBearing
              : false,
        })
      } else if (event.type === 'chat:done') {
        updateThreadActivity(event.threadId, { status: 'idle' })
      } else if (event.type === 'chat:error') {
        pendingDraftsRef.current.delete(event.requestId)
        pendingDocumentDraftsRef.current.delete(event.requestId)
        updateThreadActivity(
          event.threadId,
          event.error.message === "Couldn't save result"
            ? { status: 'saving_failed', requestId: event.requestId }
            : { status: 'idle' },
        )
      }
      if (event.threadId !== selectedThreadIdRef.current) return
      if (event.requestId !== activeRequestIdRef.current) {
        if (event.type === 'chat:accepted') void hydrateThreadLibrary()
        return
      }

      switch (event.type) {
        case 'chat:accepted': {
          submittingRef.current = false
          dispatch({
            type: 'request-accepted',
            threadId: event.threadId,
            requestId: event.requestId,
            userMessageId: event.userMessageId,
            assistantMessageId: event.assistantMessageId,
            turnIntent: event.turnIntent,
          })
          return
        }

        case 'chat:start':
          dispatch({
            type: 'request-started',
            threadId: event.threadId,
            requestId: event.requestId,
            assistantMessageId: event.assistantMessageId,
            targetAttribution: event.targetAttribution,
          })
          return

        case 'chat:delta':
          dispatch({
            type: 'request-delta',
            threadId: event.threadId,
            requestId: event.requestId,
            assistantMessageId: event.assistantMessageId,
            snapshot: event.snapshot,
          })
          return

        case 'chat:done':
          activeRequestIdRef.current = null
          dispatch({
            type: 'request-completed',
            threadId: event.threadId,
            requestId: event.requestId,
            assistantMessageId: event.assistantMessageId,
            status: event.status,
            finalContent: event.finalContent,
          })
          return

        case 'chat:error':
          const settledProviderFailure =
            event.error.message !== "Couldn't save result" &&
            stateRef.current.settlementFailure?.requestId === event.requestId &&
            stateRef.current.settlementFailure.assistantMessageId === event.assistantMessageId
          activeRequestIdRef.current = null
          submittingRef.current = false
          dispatch({
            type: 'request-failed',
            threadId: event.threadId,
            requestId: event.requestId,
            ...(event.assistantMessageId ? { assistantMessageId: event.assistantMessageId } : {}),
            error: event.error,
            ...(event.targetAttribution ? { targetAttribution: event.targetAttribution } : {}),
          })

          if (event.error.code === 'target_unavailable') {
            void refreshConnections()
          }
          if (settledProviderFailure) void hydrateThreadLibrary()
      }
    }

    function handleThreadEvent(event: NyxThreadEvent) {
      if (event.type === 'threads:epoch-changed') {
        void hydrateThreadLibrary()
        return
      }

      const cursor = event.includedThroughCursor
      const accepted = acceptClock(event.eventEpoch, cursor)
      if (!accepted) return
      if (accepted.listAdvanced) {
        if (event.type === 'threads:changed') upsertThreadSummary(event.detail.summary)
        if (event.type === 'threads:removed') {
          replaceThreadSummaries(
            threadSummariesRef.current.filter((summary) => summary.id !== event.threadId),
          )
        }
        if (
          event.type === 'threads:changed' &&
          event.detail.summary.id === selectedThreadIdRef.current
        )
          dispatch({ type: 'thread-summary-changed', summary: event.detail.summary, cursor })
      }

      if (!accepted.detailAdvanced) return

      if (
        event.type === 'threads:changed' &&
        event.detail.summary.id === selectedThreadIdRef.current
      ) {
        const current = stateRef.current
        dispatch({
          type: 'thread-detail-changed',
          detail: event.detail,
          cursor,
          preserveOverlay: current.draftEditVersion > current.savedEditVersion,
        })
      } else if (
        event.type === 'threads:removed' &&
        event.threadId === selectedThreadIdRef.current
      ) {
        if (stateRef.current.newThreadPending) {
          selectedThreadIdRef.current = null
          return
        }
        const generation = projectionGeneration.current + 1
        projectionGeneration.current = generation
        selectedThreadIdRef.current = null
        dispatch({
          type: 'show-placeholder',
          generation,
          minimumCatalogEpoch: getLatestConnectionRequestEpoch() + 1,
        })
      } else if (event.type === 'threads:library-unavailable') {
        dispatch({
          type: 'thread-library-hydration-failed',
          generation: projectionGeneration.current,
          error: event.error,
        })
      } else if (
        event.type === 'threads:thread-unavailable' &&
        event.threadId === selectedThreadIdRef.current
      ) {
        dispatch({
          type: 'thread-unavailable',
          threadId: event.threadId,
          error: event.error,
          cursor,
        })
      }
    }

    const unsubscribeChat = chat.subscribe((event) => {
      if (!hydrated) bufferedEvents.push({ kind: 'chat', event })
      else handleChatEvent(event)
    })
    const unsubscribeThreads = threads.subscribe((event) => {
      if (!hydrated) bufferedEvents.push({ kind: 'thread', event })
      else handleThreadEvent(event)
    })

    async function hydrateThreadLibrary() {
      const request = ++hydrationRef.current
      const generation = projectionGeneration.current
      hydrated = false
      bufferedEvents.length = 0

      try {
        const pageResult = await threads.listPage({ location: 'available', limit: 50 })
        if (disposed || request !== hydrationRef.current) return
        if (!pageResult.ok) {
          dispatch({ type: 'thread-library-hydration-failed', generation, error: pageResult.error })
          return
        }
        replaceThreadSummaries(pageResult.value.rows)

        const firstSummary = pageResult.value.rows[0] ?? null
        let storedId: string | null = null
        try {
          storedId = window.localStorage.getItem('nyx.thread.selected.v1')
        } catch {
          // A blocked UI preference does not block canonical hydration.
        }

        let selectedId = storedId ?? firstSummary?.id ?? null
        let summary =
          pageResult.value.rows.find((row) => row.id === selectedId) ??
          (selectedId === firstSummary?.id ? firstSummary : null)
        let detailResult = selectedId ? await threads.get({ threadId: selectedId }) : null
        if (disposed || request !== hydrationRef.current) return
        if (
          storedId &&
          selectedId === storedId &&
          ((!detailResult?.ok &&
            (detailResult?.error.code === 'invalid_request' ||
              detailResult?.error.code === 'not_found')) ||
            (detailResult?.ok && detailResult.value.detail === null))
        ) {
          selectedId = firstSummary?.id ?? null
          summary = firstSummary
          detailResult = selectedId ? await threads.get({ threadId: selectedId }) : null
          if (disposed || request !== hydrationRef.current) return
        }
        if (detailResult && !detailResult.ok) {
          if (detailResult.error.code === 'thread_unavailable' && selectedId) {
            summary = {
              availability: 'unavailable',
              id: selectedId,
              location: summary?.location ?? 'available',
              title: "Couldn't open this thread",
              unavailable: detailResult.error,
            }
          } else {
            dispatch({
              type: 'thread-library-hydration-failed',
              generation,
              error: detailResult.error,
            })
            return
          }
        }

        const snapshot = detailResult?.ok ? detailResult.value : null
        if (snapshot && snapshot.eventEpoch !== pageResult.value.eventEpoch) {
          void hydrateThreadLibrary()
          return
        }

        const resolvedSummary =
          snapshot?.detail?.summary ?? (summary?.availability === 'unavailable' ? summary : null)
        eventEpoch = pageResult.value.eventEpoch
        listCursor = pageResult.value.includedThroughCursor
        detailCursor = snapshot?.includedThroughCursor ?? listCursor
        selectedThreadIdRef.current = resolvedSummary?.id ?? null
        if (snapshot?.detail?.activeRun) {
          activeRequestIdRef.current = snapshot.detail.activeRun.requestId
        } else if (snapshot?.detail?.runStatus !== 'streaming') {
          activeRequestIdRef.current = null
        }
        if (selectedThreadIdRef.current) {
          try {
            window.localStorage.setItem('nyx.thread.selected.v1', selectedThreadIdRef.current)
          } catch {
            // A blocked UI preference does not block canonical hydration.
          }
        }
        dispatch({
          type: 'thread-library-hydrated',
          generation,
          summary: resolvedSummary,
          detail: snapshot?.detail ?? null,
          eventEpoch,
          listCursor,
          detailCursor,
          preserveOverlay:
            stateRef.current.selectedThreadId === resolvedSummary?.id &&
            stateRef.current.draftEditVersion > stateRef.current.savedEditVersion,
        })
        hydrated = true
        for (const buffered of bufferedEvents.splice(0)) {
          if (!hydrated) break
          if (buffered.kind === 'chat') handleChatEvent(buffered.event)
          else handleThreadEvent(buffered.event)
        }
      } catch {
        if (!disposed && request === hydrationRef.current) {
          dispatch({
            type: 'thread-library-hydration-failed',
            generation,
            error: threadLibraryBridgeError(),
          })
        }
      }
    }

    retryHydrationRef.current = hydrateThreadLibrary
    void hydrateThreadLibrary()

    return () => {
      disposed = true
      if (retryHydrationRef.current === hydrateThreadLibrary) retryHydrationRef.current = null
      unsubscribeChat()
      unsubscribeThreads()
    }
  }, [refreshConnections])

  useEffect(() => {
    const action = deriveTargetCatalogAction(state, connectionStatus)

    if (!action) {
      return
    }

    dispatch(action)
  }, [
    connectionStatus,
    state.committedTarget,
    state.hydrationStatus,
    state.projectionGeneration,
    state.saveStatus,
    state.targetDraft,
    state.targetInitialized,
  ])

  function addDraftImages(sources: ReadonlyArray<Blob>) {
    if (
      state.hydrationStatus !== 'ready' ||
      stateRef.current.newThreadPending ||
      navigationRef.current ||
      (state.activeTurn && !state.activeTurn.accepted)
    ) {
      return
    }

    const availableSlots = nyxChatImageLimits.imagesPerTurn - liveDraftsRef.current.size
    const acceptedSources = sources.slice(0, Math.max(0, availableSlots))

    if (acceptedSources.length < sources.length) {
      dispatch({
        type: 'composer-notice-changed',
        notice: `You can attach up to ${nyxChatImageLimits.imagesPerTurn} images.`,
      })
    }

    if (acceptedSources.length === 0) {
      return
    }

    const drafts = acceptedSources.map((source, index) => {
      const id = crypto.randomUUID()
      liveDraftsRef.current.add(id)

      return {
        id,
        name: source instanceof File && source.name ? source.name : `Image ${index + 1}`,
        status: 'preparing' as const,
        source,
      }
    })

    dispatch({ type: 'draft-images-added', images: drafts })

    for (const draft of drafts) {
      void prepareDraftImage(draft.id, draft.source)
    }
  }

  function addDraftDocuments(sources: ReadonlyArray<File>) {
    if (
      state.hydrationStatus !== 'ready' ||
      stateRef.current.newThreadPending ||
      navigationRef.current ||
      state.saveStatus === 'saving' ||
      (state.activeTurn && !state.activeTurn.accepted)
    ) {
      return
    }

    if (liveDocumentDraftsRef.current.size > 0 || sources.length !== 1) {
      dispatch({
        type: 'composer-notice-changed',
        notice: 'You can attach one document per message.',
      })
      return
    }

    const source = sources[0]!
    const extension = source.name.slice(source.name.lastIndexOf('.')).toLowerCase()
    const mediaTypeByExtension: Partial<Record<string, NyxChatDocumentMediaType>> = {
      '.pdf': 'application/pdf',
      '.txt': 'text/plain',
      '.md': 'text/markdown',
      '.csv': 'text/csv',
    }
    const mediaType = mediaTypeByExtension[extension]

    if (!mediaType || !isNyxChatDocumentName(source.name, mediaType)) {
      dispatch({
        type: 'composer-notice-changed',
        notice: 'Use a TXT, Markdown, CSV, or text-based PDF file.',
      })
      return
    }

    const id = crypto.randomUUID()
    const draft: ChatDocumentDraft = {
      id,
      name: source.name,
      mediaType,
      status: 'preparing',
      source,
    }
    liveDocumentDraftsRef.current.add(id)
    dispatch({ type: 'draft-documents-added', documents: [draft] })
    void prepareDraftDocument(id, source, mediaType)
  }

  function removeDraftImage(imageId: string) {
    if (
      stateRef.current.newThreadPending ||
      navigationRef.current ||
      (state.activeTurn && !state.activeTurn.accepted)
    ) {
      return
    }

    const image = state.draftImages.find((candidate) => candidate.id === imageId)

    if (!image) {
      return
    }

    releaseDrafts(new Set([imageId]))
    const action = { type: 'draft-image-removed' as const, imageId }
    stateRef.current = chatReducer(stateRef.current, action)
    dispatch(action)
  }

  function retryDraftImage(imageId: string) {
    if (
      stateRef.current.newThreadPending ||
      navigationRef.current ||
      (state.activeTurn && !state.activeTurn.accepted)
    ) {
      return
    }

    const image = state.draftImages.find(
      (candidate) => candidate.id === imageId && candidate.status === 'failed',
    )

    if (!image || image.status !== 'failed') {
      return
    }

    dispatch({ type: 'draft-image-preparing', imageId })
    void prepareDraftImage(imageId, image.source)
  }

  function removeDraftDocument(documentId: string) {
    if (
      stateRef.current.newThreadPending ||
      navigationRef.current ||
      (state.activeTurn && !state.activeTurn.accepted)
    ) {
      return
    }

    if (!state.draftDocuments.some((document) => document.id === documentId)) {
      return
    }

    releaseDocumentDrafts(new Set([documentId]))
    const action = { type: 'draft-document-removed' as const, documentId }
    stateRef.current = chatReducer(stateRef.current, action)
    dispatch(action)
  }

  function retryDraftDocument(documentId: string) {
    if (
      stateRef.current.newThreadPending ||
      navigationRef.current ||
      (state.activeTurn && !state.activeTurn.accepted)
    ) {
      return
    }

    const document = state.draftDocuments.find(
      (candidate) => candidate.id === documentId && candidate.status === 'failed',
    )

    if (!document || document.status !== 'failed') {
      return
    }

    dispatch({ type: 'draft-document-preparing', documentId })
    void prepareDraftDocument(documentId, document.source, document.mediaType)
  }

  function queueSaveDraft(discardEmptyShell = false, requireLatest = false) {
    saveQueueRef.current = saveQueueRef.current
      .catch(() => ({ ok: false as const }))
      .then(async () => {
        for (;;) {
          const current = stateRef.current
          const targetSelection = current.targetDraft
          const readyImages = current.draftImages.filter(
            (image): image is Extract<ChatImageDraft, { status: 'ready' }> =>
              image.status === 'ready',
          )
          const readyDocuments = current.draftDocuments.filter(
            (document): document is Extract<ChatDocumentDraft, { status: 'ready' }> =>
              document.status === 'ready',
          )
          if (
            readyImages.length !== current.draftImages.length ||
            readyDocuments.length !== current.draftDocuments.length
          ) {
            return { ok: false as const }
          }
          const meaningful =
            current.input.trim().length > 0 || readyImages.length > 0 || readyDocuments.length > 0

          if (!window.nyx || !targetSelection) {
            return !selectedThreadIdRef.current && !meaningful
              ? { ok: true as const, detail: null }
              : { ok: false as const }
          }
          if (!selectedThreadIdRef.current && !meaningful) {
            return { ok: true as const, detail: null }
          }

          dispatch({ type: 'save-started' })
          const submittedVersion = current.draftEditVersion
          let threadId = selectedThreadIdRef.current
          let expectedDraftRevision = current.draftRevision
          const draftInput: Omit<NyxThreadSaveDraftInput, 'threadId' | 'expectedDraftRevision'> = {
            text: current.input,
            targetSelection,
            images: readyImages.map((image, position) => ({
              imageId: image.id,
              ...image.image,
              position,
            })),
            documents: readyDocuments.map((document, position) => ({
              documentId: document.id,
              ...document.document,
              position,
            })),
            newImages: readyImages
              .filter(
                (image) => image.canonicalBytes !== undefined && image.previewBytes !== undefined,
              )
              .map((image) => ({
                imageId: image.id,
                canonicalBytes: image.canonicalBytes!,
                previewBytes: image.previewBytes!,
              })),
            newDocuments: readyDocuments
              .filter(
                (document) =>
                  document.sourceBytes !== undefined &&
                  document.extractedTextBytes !== undefined &&
                  document.extractedFromSha256 !== undefined,
              )
              .map((document) => ({
                documentId: document.id,
                sourceBytes: document.sourceBytes!,
                extractedTextBytes: document.extractedTextBytes!,
                extractedFromSha256: document.extractedFromSha256!,
              })),
          }

          if (!threadId) {
            const materialized = await window.nyx.threads.materialize(draftInput)
            if (!materialized.ok) {
              dispatch({ type: 'save-failed', error: threadMutationError(materialized.error) })
              return { ok: false as const }
            }
            const matchesSubmittedDraft = detailMatchesDraftInput(
              materialized.value.detail,
              draftInput,
            )
            threadId = materialized.value.detail.summary.id
            selectedThreadIdRef.current = threadId
            try {
              window.localStorage.setItem('nyx.thread.selected.v1', threadId)
            } catch {
              // A blocked UI preference does not block canonical persistence.
            }
            if (matchesSubmittedDraft && stateRef.current.draftEditVersion === submittedVersion) {
              releaseDrafts(new Set(readyImages.map((image) => image.id)))
              releaseDocumentDrafts(new Set(readyDocuments.map((document) => document.id)))
              const action = {
                type: 'save-succeeded',
                detail: materialized.value.detail,
                submittedVersion,
                cursor: materialized.value.includedThroughCursor,
                eventEpoch: materialized.value.eventEpoch,
              } as const
              stateRef.current = chatReducer(stateRef.current, action)
              dispatch(action)
              return { ok: true as const, detail: materialized.value.detail }
            }
            expectedDraftRevision = materialized.value.detail.draft.revision
            const action = {
              type: 'thread-materialized',
              detail: materialized.value.detail,
              cursor: materialized.value.includedThroughCursor,
              eventEpoch: materialized.value.eventEpoch,
            } as const
            stateRef.current = chatReducer(stateRef.current, action)
            dispatch(action)
            continue
          }

          const saved = await window.nyx.threads.saveDraft({
            ...draftInput,
            threadId,
            expectedDraftRevision,
            ...(discardEmptyShell ? { discardEmptyShell: true } : {}),
          })
          if (!saved.ok) {
            dispatch({ type: 'save-failed', error: threadMutationError(saved.error) })
            return { ok: false as const }
          }
          if (!saved.value.detail) {
            if (saved.value.discarded) {
              selectedThreadIdRef.current = null
              const action = {
                type: 'thread-discarded',
                submittedVersion,
                cursor: saved.value.includedThroughCursor,
                eventEpoch: saved.value.eventEpoch,
              } as const
              stateRef.current = chatReducer(stateRef.current, action)
              dispatch(action)
              return { ok: true as const, detail: null }
            }
            dispatch({
              type: 'save-failed',
              error: {
                code: 'unknown',
                message: 'Nyx could not save this draft.',
                retryable: true,
              },
            })
            return { ok: false as const }
          }
          if (stateRef.current.draftEditVersion === submittedVersion) {
            releaseDrafts(new Set(readyImages.map((image) => image.id)))
            releaseDocumentDrafts(new Set(readyDocuments.map((document) => document.id)))
          }
          const action = {
            type: 'save-succeeded',
            detail: saved.value.detail,
            submittedVersion,
            cursor: saved.value.includedThroughCursor,
            eventEpoch: saved.value.eventEpoch,
          } as const
          stateRef.current = chatReducer(stateRef.current, action)
          dispatch(action)
          if (requireLatest && stateRef.current.draftEditVersion !== submittedVersion) continue
          return { ok: true as const, detail: saved.value.detail }
        }
      })
    return saveQueueRef.current
  }

  useEffect(() => {
    if (
      state.hydrationStatus !== 'ready' ||
      state.activeRequestId ||
      state.draftEditVersion <= state.savedEditVersion
    )
      return

    const hasReadyAttachment =
      state.draftImages.some((image) => image.status === 'ready') ||
      state.draftDocuments.some((document) => document.status === 'ready')
    if (!state.selectedThreadId && state.input.trim().length === 0 && !hasReadyAttachment) return

    const timeout = window.setTimeout(() => void queueSaveDraft(), 250)
    return () => window.clearTimeout(timeout)
  }, [state.activeRequestId, state.draftEditVersion, state.hydrationStatus, state.savedEditVersion])

  async function sendCurrentInput() {
    if (
      submittingRef.current ||
      stateRef.current.newThreadPending ||
      navigationRef.current ||
      !canSubmitChat(
        stateRef.current,
        connectionStatus,
        runCapacityBlock(stateRef.current, threadSummariesRef.current) === null,
      ) ||
      !window.nyx
    )
      return

    submittingRef.current = true
    const saved = await queueSaveDraft(false, true)
    const threadId = selectedThreadIdRef.current
    if (!saved.ok || !saved.detail || !threadId) {
      submittingRef.current = false
      return
    }
    const detail = saved.detail

    const requestId = crypto.randomUUID()
    activeRequestIdRef.current = requestId
    updateThreadActivity(threadId, {
      status: 'submitting',
      requestId,
      attachmentBearing: threadIsAttachmentBearing(stateRef.current),
    })
    pendingDraftsRef.current.set(
      requestId,
      state.draftImages.filter((image) => image.status === 'ready').map((image) => image.id),
    )
    pendingDocumentDraftsRef.current.set(
      requestId,
      state.draftDocuments
        .filter((document) => document.status === 'ready')
        .map((document) => document.id),
    )
    dispatch({
      type: 'request-submitted',
      threadId,
      requestId,
      turnIntent: 'new_user_message',
      expectedDraftRevision: detail.draft.revision,
    })

    try {
      await window.nyx.chat.start({
        threadId,
        requestId,
        turnIntent: 'new_user_message',
        expectedDraftRevision: detail.draft.revision,
      })
    } catch (error) {
      activeRequestIdRef.current = null
      updateThreadActivity(threadId, { status: 'idle' })
      dispatch({
        type: 'request-failed',
        threadId,
        requestId,
        error: normalizeBridgeError(error),
      })
    } finally {
      submittingRef.current = false
    }
  }

  async function retryMessage(messageId: string) {
    const threadId = state.selectedThreadId
    if (
      stateRef.current.newThreadPending ||
      navigationRef.current ||
      state.activeRequestId ||
      state.hydrationStatus !== 'ready' ||
      !window.nyx ||
      !threadId
    )
      return

    if (state.settlementFailure?.assistantMessageId === messageId) {
      const failure = state.settlementFailure
      activeRequestIdRef.current = failure.requestId
      dispatch({
        type: 'settlement-retry-submitted',
        threadId,
        requestId: failure.requestId,
        assistantMessageId: failure.assistantMessageId,
        expectedDraftRevision: state.draftRevision,
      })
      try {
        await window.nyx.chat.retrySettlement({ threadId, requestId: failure.requestId })
      } catch (error) {
        activeRequestIdRef.current = null
        dispatch({
          type: 'request-failed',
          threadId,
          requestId: failure.requestId,
          assistantMessageId: failure.assistantMessageId,
          error: normalizeBridgeError(error),
        })
      }
      return
    }

    const retryableTurn = state.retryableTurn
    if (
      !retryableTurn ||
      retryableTurn.assistantMessageId !== messageId ||
      runCapacityBlock(stateRef.current, threadSummariesRef.current) !== null
    )
      return
    const requestId = crypto.randomUUID()
    activeRequestIdRef.current = requestId
    updateThreadActivity(threadId, {
      status: 'submitting',
      requestId,
      attachmentBearing: threadIsAttachmentBearing(stateRef.current),
    })
    dispatch({
      type: 'request-submitted',
      threadId,
      requestId,
      turnIntent: 'retry_failed_response',
      expectedDraftRevision: retryableTurn.expectedDraftRevision,
      turnOrdinal: retryableTurn.turnOrdinal,
      expectedAttemptRequestId: retryableTurn.expectedAttemptRequestId,
    })
    try {
      await window.nyx.chat.start({
        threadId,
        requestId,
        turnIntent: 'retry_failed_response',
        turnOrdinal: retryableTurn.turnOrdinal,
        expectedAttemptRequestId: retryableTurn.expectedAttemptRequestId,
        expectedDraftRevision: retryableTurn.expectedDraftRevision,
      })
    } catch (error) {
      activeRequestIdRef.current = null
      updateThreadActivity(threadId, { status: 'idle' })
      dispatch({
        type: 'request-failed',
        threadId,
        requestId,
        assistantMessageId: retryableTurn.assistantMessageId,
        error: normalizeBridgeError(error),
      })
    }
  }

  async function stopActiveResponse() {
    if (navigationRef.current || !state.activeRequestId || !state.selectedThreadId || !window.nyx)
      return
    await window.nyx.chat.cancel({
      threadId: state.selectedThreadId,
      requestId: state.activeRequestId,
    })
  }

  async function selectThread(threadId: string) {
    if (
      !window.nyx ||
      stateRef.current.hydrationStatus !== 'ready' ||
      stateRef.current.newThreadPending ||
      navigationRef.current ||
      selectedThreadIdRef.current === threadId ||
      !threadSummariesRef.current.some((summary) => summary.id === threadId)
    )
      return false

    navigationRef.current = true
    setNavigating(true)
    try {
      const saved = await queueSaveDraft(false, true)
      if (!saved.ok) return false
      try {
        window.localStorage.setItem('nyx.thread.selected.v1', threadId)
      } catch {
        // A blocked UI preference does not block canonical selection.
      }
      await retryHydrationRef.current?.()
      return selectedThreadIdRef.current === threadId
    } finally {
      navigationRef.current = false
      setNavigating(false)
    }
  }

  async function startNewChat() {
    if (
      state.hydrationStatus !== 'ready' ||
      stateRef.current.newThreadPending ||
      navigationRef.current ||
      !window.nyx
    )
      return false

    const started = { type: 'new-thread-started' as const }
    stateRef.current = chatReducer(stateRef.current, started)
    dispatch(started)
    const fail = async () => {
      const action = { type: 'new-thread-failed' as const }
      stateRef.current = chatReducer(stateRef.current, action)
      dispatch(action)
      await retryHydrationRef.current?.()
      return false
    }

    try {
      for (;;) {
        const saved = await queueSaveDraft(true, true)
        if (!saved.ok) return fail()
        if (!saved.detail) selectedThreadIdRef.current = null
        const cleared = await window.nyx.threads.get({ threadId: null })
        if (!cleared.ok) {
          dispatch({
            type: 'thread-library-hydration-failed',
            generation: projectionGeneration.current,
            error: cleared.error,
          })
          return fail()
        }
        if (stateRef.current.draftEditVersion === stateRef.current.savedEditVersion) break
      }
    } catch {
      dispatch({
        type: 'thread-library-hydration-failed',
        generation: projectionGeneration.current,
        error: threadLibraryBridgeError(),
      })
      return fail()
    }

    const generation = projectionGeneration.current + 1
    projectionGeneration.current = generation
    selectedThreadIdRef.current = null
    releaseAllDrafts()
    submittingRef.current = false
    dispatch({
      type: 'show-placeholder',
      generation,
      minimumCatalogEpoch: getLatestConnectionRequestEpoch() + 1,
    })
    await refreshConnections()
    return true
  }

  async function retryOpen() {
    if (!window.nyx || !state.hydrationError || state.hydrationRetrying) return
    dispatch({ type: 'thread-library-retry-started' })
    const input = state.hydrationErrorThreadId
      ? { scope: 'thread' as const, threadId: state.hydrationErrorThreadId }
      : { scope: 'library' as const }
    try {
      const result = await window.nyx.threads.retryOpen(input)
      if (!result.ok) {
        const threadId =
          result.error.code === 'thread_unavailable' ? state.hydrationErrorThreadId : null
        dispatch({
          type: 'thread-library-hydration-failed',
          generation: projectionGeneration.current,
          error: result.error,
          ...(threadId ? { threadId } : {}),
        })
        return
      }
      await retryHydrationRef.current?.()
    } catch {
      dispatch({
        type: 'thread-library-hydration-failed',
        generation: projectionGeneration.current,
        error: threadLibraryBridgeError(),
      })
    }
  }

  const capacityNotice = runCapacityBlock(state, threadSummaries)

  return {
    state,
    threadSummaries,
    isBusy: Boolean(state.activeRequestId),
    isAccepting: Boolean(state.activeTurn && !state.activeTurn.accepted),
    isResetting: state.newThreadPending || navigating,
    canStartRun: !state.activeRequestId && !state.settlementFailure && capacityNotice === null,
    canSend: canSubmitChat(state, connectionStatus, capacityNotice === null),
    capacityNotice,
    setInput(value: string) {
      if (stateRef.current.newThreadPending || navigationRef.current) return
      dispatch({
        type: 'set-input',
        value,
      })
    },
    setTargetSelection(selection: NyxChatTargetSelection) {
      if (stateRef.current.newThreadPending || navigationRef.current) return
      dispatch({
        type: 'target-draft-changed',
        selection,
        available:
          connectionStatus.kind === 'ready' &&
          isChatTargetAvailable(selection, connectionStatus.overview),
      })
    },
    addDraftImages,
    addDraftDocuments,
    removeDraftImage,
    removeDraftDocument,
    retryDraftImage,
    retryDraftDocument,
    sendCurrentInput,
    retryMessage,
    stopActiveResponse,
    selectThread,
    startNewChat,
    retryOpen,
  }
}
