import { randomUUID } from 'node:crypto'

import type { ResponsesContinuationStateV1 } from '../chat/provider-stream'
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
  constructor(message: string) {
    super(message)
    this.name = 'ThreadLibraryCoordinatorError'
  }
}

export type SaveThreadDraftInput = {
  input: ThreadLibraryOperationInput['saveDraft']
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

export class ThreadLibraryCoordinator {
  private readonly client: ThreadLibraryClient
  private readonly sidecars: ThreadLibrarySidecars
  private readonly generateId: () => string
  private readonly settlementFailures = new Map<string, SettlementFailure>()
  private readonly uncertainSidecars = new Map<
    string,
    { images: Set<string>; documents: Set<string> }
  >()

  constructor({
    client,
    sidecars,
    generateId = randomUUID,
  }: {
    client: ThreadLibraryClient
    sidecars: ThreadLibrarySidecars
    generateId?: () => string
  }) {
    this.client = client
    this.sidecars = sidecars
    this.generateId = generateId
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

  startTurn(input: ThreadLibraryOperationInput['startTurn']) {
    return this.client.startTurn(input)
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

  async retrySettlement(threadId: string) {
    const failure = this.settlementFailures.get(threadId)
    if (!failure) throw new ThreadLibraryCoordinatorError('No settlement is waiting for Retry.')
    return this.attemptSettlement(failure)
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
