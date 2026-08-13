import { randomUUID } from 'node:crypto'

import type { NyxChatTargetAttribution, NyxThreadChatRequest } from '../../../shared/chat/types'
import type { ChatProviderMessage, ChatProviderRichUserPart } from '../chat/client'
import { type ResponsesContinuationStateV1, type JsonValue } from '../chat/provider-stream'
import type { RuntimeChatStateClient } from '../runtime/chat-state-client'
import type { ResolvedChatTarget } from '../connections/provider-resolver'
import { ThreadLibraryClient } from './client'
import type {
  ThreadLibraryOperationInput,
  ThreadLibraryReply,
  ThreadLibraryThreadDetail,
} from './protocol'
import {
  ThreadLibrarySidecars,
  type NewThreadDocument,
  type NewThreadImage,
  type PreparedResponse,
} from './sidecars'

export class ThreadLibraryCoordinatorError extends Error {
  constructor(
    message: string,
    readonly code: 'invalid_request' | 'storage_error' = 'storage_error',
  ) {
    super(message)
    this.name = 'ThreadLibraryCoordinatorError'
  }
}

export type SaveThreadDraftInput = {
  input: ThreadLibraryOperationInput['saveDraft']
  newImages?: ReadonlyArray<NewThreadImage>
  newDocuments?: ReadonlyArray<NewThreadDocument>
}

export type MaterializeThreadInput = {
  input: ThreadLibraryOperationInput['materialize']
  newImages?: ReadonlyArray<NewThreadImage>
  newDocuments?: ReadonlyArray<NewThreadDocument>
}

export type SettleThreadInput = Omit<
  ThreadLibraryOperationInput['settleTurn'],
  'providerStateRef'
> & {
  continuation?: {
    executionIdentity: string
    state: ResponsesContinuationStateV1
  }
}

type SettlementFailure = {
  input: ThreadLibraryOperationInput['settleTurn']
  response: PreparedResponse | null
  pendingResponse: {
    stateId: string
    executionIdentity: string
    state: ResponsesContinuationStateV1
  } | null
}

export interface PreparedThreadTurn {
  detail: ThreadLibraryThreadDetail
  runtimeReplayDetail: ThreadLibraryThreadDetail
  threadId: string
  requestId: string
  userMessageId: string
  assistantMessageId: string
  targetSelection: ThreadLibraryThreadDetail['draft']['targetSelection']
  documentBearing: boolean
}

type ThreadHistoryTarget = Pick<ResolvedChatTarget, 'protocolConfig' | 'executionIdentity'>

export function buildDocumentTextEnvelope(name: string, text: string) {
  return `Attached document ${JSON.stringify(name)}.\nThe following is locally extracted user-provided content:\n\n${text}`
}

export class ThreadLibraryCoordinator {
  private client: ThreadLibraryClient
  private sidecars: ThreadLibrarySidecars
  private readonly generateId: () => string
  private readonly now: () => string
  private readonly settlementFailures = new Map<string, SettlementFailure>()
  private readonly uncertainSidecars = new Map<
    string,
    { images: Set<string>; documents: Set<string> }
  >()

  constructor({
    client,
    sidecars,
    generateId = randomUUID,
    now = () => new Date().toISOString(),
  }: {
    client: ThreadLibraryClient
    sidecars: ThreadLibrarySidecars
    generateId?: () => string
    now?: () => string
  }) {
    this.client = client
    this.sidecars = sidecars
    this.generateId = generateId
    this.now = now
  }

  replaceStorage(client: ThreadLibraryClient, sidecars: ThreadLibrarySidecars) {
    this.client = client
    this.sidecars = sidecars
  }

  async saveDraft({ input, newImages = [], newDocuments = [] }: SaveThreadDraftInput) {
    const imageIds = newImages.map((row) => row.ref.imageId)
    const documentIds = newDocuments.map((row) => row.ref.documentId)
    let publishedImages: Awaited<ReturnType<ThreadLibrarySidecars['publishImages']>> = []
    let publishedDocuments: Awaited<ReturnType<ThreadLibrarySidecars['publishDocuments']>> = []
    try {
      publishedImages = await this.sidecars.publishImages(input.threadId, newImages)
      publishedDocuments = await this.sidecars.publishDocuments(input.threadId, newDocuments)
    } catch (error) {
      await this.rollbackUnreferenced(input.threadId, imageIds, documentIds)
      throw error
    }

    const reply = await this.client.saveDraft({
      ...input,
      draft: {
        ...input.draft,
        images: [...input.draft.images, ...publishedImages],
        documents: [...input.draft.documents, ...publishedDocuments],
      },
    })
    if (
      (reply.ok && reply.value.status === 'conflict') ||
      (!reply.ok && reply.outcome === 'definitely_not_committed')
    ) {
      await this.rollbackUnreferenced(input.threadId, imageIds, documentIds)
    }
    if (!reply.ok && reply.outcome === 'outcome_unknown') {
      const pending = this.uncertainSidecars.get(input.threadId) ?? {
        images: new Set<string>(),
        documents: new Set<string>(),
      }
      imageIds.forEach((id) => pending.images.add(id))
      documentIds.forEach((id) => pending.documents.add(id))
      this.uncertainSidecars.set(input.threadId, pending)
    } else {
      const pending = this.uncertainSidecars.get(input.threadId)
      imageIds.forEach((id) => pending?.images.delete(id))
      documentIds.forEach((id) => pending?.documents.delete(id))
      if (pending && pending.images.size === 0 && pending.documents.size === 0) {
        this.uncertainSidecars.delete(input.threadId)
      }
    }
    return reply
  }

  async materialize({ input, newImages = [], newDocuments = [] }: MaterializeThreadInput) {
    const imageIds = newImages.map((row) => row.ref.imageId)
    const documentIds = newDocuments.map((row) => row.ref.documentId)
    let publishedImages: Awaited<ReturnType<ThreadLibrarySidecars['publishImages']>> = []
    let publishedDocuments: Awaited<ReturnType<ThreadLibrarySidecars['publishDocuments']>> = []
    try {
      publishedImages = await this.sidecars.publishImages(input.threadId, newImages)
      publishedDocuments = await this.sidecars.publishDocuments(input.threadId, newDocuments)
    } catch (error) {
      await this.rollbackUnreferenced(input.threadId, imageIds, documentIds)
      throw error
    }

    const reply = await this.client.materialize({
      ...input,
      draft: {
        ...input.draft,
        images: [...input.draft.images, ...publishedImages],
        documents: [...input.draft.documents, ...publishedDocuments],
      },
    })
    if (!reply.ok && reply.outcome === 'definitely_not_committed') {
      await this.rollbackUnreferenced(input.threadId, imageIds, documentIds)
    }
    if (!reply.ok && reply.outcome === 'outcome_unknown') {
      this.rememberUncertain(input.threadId, imageIds, documentIds)
    } else {
      this.forgetUncertain(input.threadId, imageIds, documentIds)
    }
    return reply
  }

  startTurn(input: ThreadLibraryOperationInput['startTurn']) {
    return this.client.startTurn(input)
  }

  async prepareTurn(request: NyxThreadChatRequest): Promise<PreparedThreadTurn> {
    const checkedAt = this.now()
    const reconciled = await this.reconcileThread(request.threadId, checkedAt)
    if (!reconciled) {
      throw new ThreadLibraryCoordinatorError('This thread was not found.', 'invalid_request')
    }

    const reply =
      request.turnIntent === 'new_user_message'
        ? await this.startTurn({
            threadId: request.threadId,
            requestId: request.requestId,
            expectedDraftRevision: request.expectedDraftRevision,
            userMessageId: this.generateId(),
            assistantMessageId: this.generateId(),
            startedAt: checkedAt,
          })
        : await this.retryTurn({
            threadId: request.threadId,
            turnOrdinal: request.turnOrdinal,
            expectedAttemptRequestId: request.expectedAttemptRequestId,
            requestId: request.requestId,
            expectedDraftRevision: request.expectedDraftRevision,
            retriedAt: checkedAt,
          })

    if (!reply.ok) {
      throw new ThreadLibraryCoordinatorError(reply.safeError.message, 'invalid_request')
    }
    if (reply.value.status === 'conflict') {
      throw new ThreadLibraryCoordinatorError(
        'This draft changed. Reload it and try again.',
        'invalid_request',
      )
    }

    const detail = reply.value.detail
    const pending = detail.turns.find((turn) => turn.attemptRequestId === request.requestId)
    if (!pending || pending.assistantStatus !== 'pending') {
      throw new ThreadLibraryCoordinatorError('The pending turn could not be read.')
    }

    return {
      detail,
      runtimeReplayDetail: reconciled,
      threadId: request.threadId,
      requestId: request.requestId,
      userMessageId: pending.userMessageId,
      assistantMessageId: pending.assistantMessageId,
      targetSelection: pending.targetSelection,
      documentBearing: detail.documents.some(
        (document) => document.owner === 'turn' && document.turnOrdinal === pending.ordinal,
      ),
    }
  }

  async bindPreparedTarget(
    prepared: PreparedThreadTurn,
    targetAttribution: NyxChatTargetAttribution,
  ) {
    const reply = await this.bindTurnTarget({
      threadId: prepared.threadId,
      requestId: prepared.requestId,
      targetAttribution,
      boundAt: this.now(),
    })
    if (!reply.ok) {
      throw new ThreadLibraryCoordinatorError(reply.safeError.message)
    }
    prepared.detail = reply.value
    return reply.value
  }

  async materializeProviderMessages(
    detail: ThreadLibraryThreadDetail,
    target: ThreadHistoryTarget,
  ): Promise<ChatProviderMessage[]> {
    const messages: ChatProviderMessage[] = []

    for (const turn of detail.turns) {
      const images = detail.images
        .filter((image) => image.owner === 'turn' && image.turnOrdinal === turn.ordinal)
        .sort((left, right) => left.position - right.position)
      const documents = detail.documents
        .filter((document) => document.owner === 'turn' && document.turnOrdinal === turn.ordinal)
        .sort((left, right) => left.position - right.position)

      if (images.length === 0) {
        const content = [turn.userContent]
        for (const document of documents) {
          if (document.extractedText === null) {
            throw new ThreadLibraryCoordinatorError(
              'A Thread document is unavailable.',
              'invalid_request',
            )
          }
          content.push(buildDocumentTextEnvelope(document.name, document.extractedText))
        }
        messages.push({ role: 'user', content: content.filter(Boolean).join('\n\n') })
      } else {
        const content: ChatProviderRichUserPart[] = []
        if (turn.userContent.length > 0) {
          content.push({ type: 'text', text: turn.userContent })
        }
        for (const image of images) {
          if (!image.available) {
            throw new ThreadLibraryCoordinatorError(
              'A Thread image is unavailable.',
              'invalid_request',
            )
          }
          const bytes = await this.sidecars.readCanonicalImage(detail.summary.id, image)
          content.push({
            type: 'image_url',
            image_url: {
              url: `data:${image.mediaType};base64,${Buffer.from(
                bytes.buffer,
                bytes.byteOffset,
                bytes.byteLength,
              ).toString('base64')}`,
            },
          })
        }
        for (const document of documents) {
          if (document.extractedText === null) {
            throw new ThreadLibraryCoordinatorError(
              'A Thread document is unavailable.',
              'invalid_request',
            )
          }
          content.push({
            type: 'text',
            text: buildDocumentTextEnvelope(document.name, document.extractedText),
          })
        }
        messages.push({ role: 'user', content })
      }

      const providerRef = detail.providerStateRefs.find(
        (candidate) => candidate.turnOrdinal === turn.ordinal,
      )
      if (
        providerRef &&
        target.protocolConfig.protocol === 'openai-responses' &&
        target.executionIdentity &&
        providerRef.executionIdentity === target.executionIdentity
      ) {
        const state = await this.sidecars.readResponseState(detail.summary.id, providerRef)
        messages.push(
          ...state.outputItems.map((item: JsonValue) => ({
            kind: 'responses-output-item' as const,
            item,
          })),
        )
      } else if (turn.assistantStatus !== 'failed' && turn.assistantContent.length > 0) {
        messages.push({ role: 'assistant', content: turn.assistantContent })
      }
    }

    return messages
  }

  async replayRuntimeHistory(runtime: RuntimeChatStateClient, detail: ThreadLibraryThreadDetail) {
    for (const turn of detail.turns) {
      if (turn.assistantStatus === 'pending') {
        throw new ThreadLibraryCoordinatorError('A pending historical turn cannot be replayed.')
      }
      await runtime.submitUserMessage({
        turnRequestId: turn.attemptRequestId,
        userMessageId: turn.userMessageId,
        assistantMessageId: turn.assistantMessageId,
        content: turn.userContent,
      })
      await runtime.startAssistant({
        turnRequestId: turn.attemptRequestId,
        assistantMessageId: turn.assistantMessageId,
      })
      if (turn.assistantContent.length > 0) {
        await runtime.appendDelta({
          turnRequestId: turn.attemptRequestId,
          assistantMessageId: turn.assistantMessageId,
          snapshot: turn.assistantContent,
        })
      }
      const terminal = {
        turnRequestId: turn.attemptRequestId,
        assistantMessageId: turn.assistantMessageId,
        finalContent: turn.assistantContent,
      }
      if (turn.assistantStatus === 'completed') await runtime.complete(terminal)
      if (turn.assistantStatus === 'cancelled') await runtime.cancel(terminal)
      if (turn.assistantStatus === 'failed') {
        await runtime.fail({
          turnRequestId: turn.attemptRequestId,
          assistantMessageId: turn.assistantMessageId,
          message: turn.error!.message,
        })
      }
    }
  }

  retryTurn(input: ThreadLibraryOperationInput['retryTurn']) {
    return this.client.retryTurn(input)
  }

  bindTurnTarget(input: ThreadLibraryOperationInput['bindTurnTarget']) {
    return this.client.bindTurnTarget(input)
  }

  async settleTurn(input: SettleThreadInput) {
    if (this.settlementFailures.has(input.threadId)) {
      throw new ThreadLibraryCoordinatorError('A terminal result is already waiting for Retry.')
    }
    const pendingResponse = input.continuation
      ? {
          stateId: this.generateId(),
          executionIdentity: input.continuation.executionIdentity,
          state: structuredClone(input.continuation.state),
        }
      : null
    const failure: SettlementFailure = {
      input: {
        threadId: input.threadId,
        requestId: input.requestId,
        assistantStatus: input.assistantStatus,
        assistantContent: input.assistantContent,
        error: input.error,
        providerStateRef: null,
        settledAt: input.settledAt,
      },
      response: null,
      pendingResponse,
    }
    this.settlementFailures.set(input.threadId, failure)
    return this.attemptSettlement(failure)
  }

  async retrySettlement(threadId: string, requestId?: string) {
    const failure = this.settlementFailures.get(threadId)
    if (!failure) throw new ThreadLibraryCoordinatorError('No settlement is waiting for Retry.')
    if (requestId && failure.input.requestId !== requestId) {
      throw new ThreadLibraryCoordinatorError(
        'The settlement Retry identity is invalid.',
        'invalid_request',
      )
    }
    return this.attemptSettlement(failure)
  }

  settlementFailureRequestId(threadId: string) {
    return this.settlementFailures.get(threadId)?.input.requestId ?? null
  }

  settlementFailureThreadIds() {
    return [...this.settlementFailures.keys()]
  }

  async reconcileThread(
    threadId: string,
    checkedAt: string,
  ): Promise<ThreadLibraryThreadDetail | null> {
    const read = await this.client.readThread({ threadId })
    if (!read.ok) throw new ThreadLibraryCoordinatorError(read.safeError.message)
    if (read.value === null) {
      await this.reconcileUncertainSidecars(threadId, null)
      return null
    }

    let detail = read.value
    const inspection = await this.sidecars.inspect(detail)
    const images = inspection.images.filter(
      (row) =>
        detail.images.find((candidate) => candidate.imageId === row.id)?.available !==
        row.available,
    )
    const documents = inspection.documents.filter(
      (row) =>
        detail.documents.find((candidate) => candidate.documentId === row.id)?.available !==
        row.available,
    )
    if (images.length > 0 || documents.length > 0) {
      const availability = await this.client.setResourceAvailability({
        threadId,
        images,
        documents,
        checkedAt,
      })
      if (!availability.ok) throw new ThreadLibraryCoordinatorError(availability.safeError.message)
      detail = availability.value
    }

    for (const corrupt of inspection.corruptProviderStateRefs) {
      if (!corrupt.requestId) {
        throw new ThreadLibraryCoordinatorError('Provider continuation identity is unavailable.')
      }
      const repaired = await this.client.repairProviderStateRef({
        threadId,
        requestId: corrupt.requestId,
        providerStateRef: corrupt.ref,
        repairedAt: checkedAt,
      })
      if (!repaired.ok) throw new ThreadLibraryCoordinatorError(repaired.safeError.message)
      detail = repaired.value
      await this.sidecars.rollbackResponse(threadId, corrupt.ref.stateId)
    }

    await this.reconcileUncertainSidecars(threadId, detail)
    if (!this.settlementFailures.has(threadId) && !this.uncertainSidecars.has(threadId)) {
      await this.sidecars.cleanupOrphans(detail)
    }
    return detail
  }

  private async attemptSettlement(
    failure: SettlementFailure,
  ): Promise<ThreadLibraryReply<'settleTurn'>> {
    const { input } = failure
    try {
      if (!failure.response && failure.pendingResponse) {
        failure.response = this.sidecars.prepareResponse({
          ...failure.pendingResponse,
          assistantContent: input.assistantContent,
        })
        input.providerStateRef = failure.response.ref
      }
      if (failure.response) {
        await this.sidecars.publishResponseBytes(
          input.threadId,
          failure.response.ref,
          failure.response.bytes,
          input.assistantContent,
        )
      }
    } catch (error) {
      this.settlementFailures.set(input.threadId, failure)
      throw error
    }

    const reply = await this.client.settleTurn(input)
    if (reply.ok) {
      this.settlementFailures.delete(input.threadId)
      return reply
    }
    if (reply.outcome === 'definitely_not_committed' && failure.response) {
      await this.sidecars.rollbackResponse(input.threadId, failure.response.ref.stateId)
    }
    if (reply.safeError.code === 'not_pending') {
      this.settlementFailures.delete(input.threadId)
    } else {
      this.settlementFailures.set(input.threadId, failure)
    }
    return reply
  }

  private async rollbackUnreferenced(
    threadId: string,
    imageIds: ReadonlyArray<string>,
    documentIds: ReadonlyArray<string>,
  ) {
    let read: Awaited<ReturnType<ThreadLibraryClient['readThread']>>
    try {
      read = await this.client.readThread({ threadId })
    } catch {
      this.rememberUncertain(threadId, imageIds, documentIds)
      return
    }
    if (!read.ok) {
      this.rememberUncertain(threadId, imageIds, documentIds)
      return
    }
    const referencedImages = new Set(read.value?.images.map((row) => row.imageId) ?? [])
    const referencedDocuments = new Set(read.value?.documents.map((row) => row.documentId) ?? [])
    const unreferencedImages = imageIds.filter((id) => !referencedImages.has(id))
    const unreferencedDocuments = documentIds.filter((id) => !referencedDocuments.has(id))
    try {
      await Promise.all([
        this.sidecars.rollbackImages(threadId, unreferencedImages),
        this.sidecars.rollbackDocuments(threadId, unreferencedDocuments),
      ])
      this.forgetUncertain(threadId, imageIds, documentIds)
    } catch {
      this.rememberUncertain(threadId, imageIds, documentIds)
    }
  }

  private async reconcileUncertainSidecars(
    threadId: string,
    detail: ThreadLibraryThreadDetail | null,
  ) {
    const pending = this.uncertainSidecars.get(threadId)
    if (!pending) return
    const referencedImages = new Set(detail?.images.map((row) => row.imageId) ?? [])
    const referencedDocuments = new Set(detail?.documents.map((row) => row.documentId) ?? [])
    try {
      await Promise.all([
        this.sidecars.rollbackImages(
          threadId,
          [...pending.images].filter((id) => !referencedImages.has(id)),
        ),
        this.sidecars.rollbackDocuments(
          threadId,
          [...pending.documents].filter((id) => !referencedDocuments.has(id)),
        ),
      ])
      this.uncertainSidecars.delete(threadId)
    } catch {
      return
    }
  }

  private rememberUncertain(
    threadId: string,
    imageIds: ReadonlyArray<string>,
    documentIds: ReadonlyArray<string>,
  ) {
    const pending = this.uncertainSidecars.get(threadId) ?? {
      images: new Set<string>(),
      documents: new Set<string>(),
    }
    imageIds.forEach((id) => pending.images.add(id))
    documentIds.forEach((id) => pending.documents.add(id))
    this.uncertainSidecars.set(threadId, pending)
  }

  private forgetUncertain(
    threadId: string,
    imageIds: ReadonlyArray<string>,
    documentIds: ReadonlyArray<string>,
  ) {
    const pending = this.uncertainSidecars.get(threadId)
    imageIds.forEach((id) => pending?.images.delete(id))
    documentIds.forEach((id) => pending?.documents.delete(id))
    if (pending && pending.images.size === 0 && pending.documents.size === 0) {
      this.uncertainSidecars.delete(threadId)
    }
  }
}
