import type {
  NyxChatError,
  NyxChatDocumentRef,
  NyxChatImageRef,
  NyxChatInputMessage,
  NyxChatRequest,
  NyxChatTargetAttribution,
} from '../../../shared/chat/types'
import { nyxChatDocumentLimits } from '../../../shared/chat/document-file'
import {
  createSafeThreadErrorRecord,
  parseCurrentThreadRecord,
  type CurrentThreadRecord,
  type CurrentThreadDocumentRef,
} from './schemas'
import type { CurrentThreadStore } from './store'
import { CurrentThreadImageFilesError, type CurrentThreadImageFiles } from './image-files'
import { CurrentThreadDocumentFilesError, type CurrentThreadDocumentFiles } from './document-files'

export class CurrentThreadSessionError extends Error {
  constructor(
    readonly code: 'invalid_request' | 'store_error',
    message: string,
  ) {
    super(message)
    this.name = 'CurrentThreadSessionError'
  }
}

export interface PreparedCurrentThreadTurn {
  pendingRecord: CurrentThreadRecord
  replayRecord: CurrentThreadRecord | null
  providerMessages: NyxChatInputMessage[]
}

export type CurrentThreadProviderMessage =
  | NyxChatInputMessage
  | {
      role: 'user'
      content: ReadonlyArray<
        { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }
      >
    }

export function buildDocumentTextEnvelope(name: string, text: string) {
  return `Attached document ${JSON.stringify(name)}.\nThe following is locally extracted user-provided content:\n\n${text}`
}

export interface CurrentThreadSessionCoordinatorOptions {
  store: CurrentThreadStore
  images?: CurrentThreadImageFiles
  documents?: CurrentThreadDocumentFiles
  now?: () => string
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    const error = new Error('Image import was cancelled.')
    error.name = 'AbortError'
    throw error
  }
}

function messagesEqual(
  left: ReadonlyArray<NyxChatInputMessage>,
  right: ReadonlyArray<NyxChatInputMessage>,
) {
  return (
    left.length === right.length &&
    left.every(
      (message, index) =>
        message.role === right[index]?.role && message.content === right[index]?.content,
    )
  )
}

function imageRefsEqual(
  left: ReadonlyArray<NyxChatImageRef>,
  right: ReadonlyArray<NyxChatImageRef>,
) {
  return (
    left.length === right.length &&
    left.every((imageRef, index) => {
      const other = right[index]

      return (
        imageRef.imageId === other?.imageId &&
        imageRef.mediaType === other.mediaType &&
        imageRef.width === other.width &&
        imageRef.height === other.height
      )
    })
  )
}

function recordTurnImageRefs(record: CurrentThreadRecord, index: number) {
  return record.turns[index]!.imageRefs
}

function recordTurnDocumentRefs(record: CurrentThreadRecord, index: number) {
  return record.turns[index]!.documentRefs
}

function documentRefsEqual(
  left: ReadonlyArray<CurrentThreadDocumentRef>,
  right: ReadonlyArray<NyxChatDocumentRef>,
) {
  return (
    left.length === right.length &&
    left.every((ref, index) => {
      const other = right[index]
      return (
        ref.documentId === other?.documentId &&
        ref.name === other.name &&
        ref.mediaType === other.mediaType &&
        ref.byteLength === other.byteLength &&
        ref.extractedByteLength === other.extractedByteLength
      )
    })
  )
}

export function toCurrentThreadProviderMessages(record: CurrentThreadRecord | null) {
  const messages: NyxChatInputMessage[] = []

  for (const turn of record?.turns ?? []) {
    messages.push({ role: 'user', content: turn.userContent })

    if (turn.assistantStatus !== 'failed' && turn.assistantContent.length > 0) {
      messages.push({ role: 'assistant', content: turn.assistantContent })
    }
  }

  return messages
}

export class CurrentThreadSessionCoordinator {
  private readonly store: CurrentThreadStore
  private readonly images: CurrentThreadImageFiles | undefined
  private readonly documents: CurrentThreadDocumentFiles | undefined
  private readonly now: () => string

  constructor({
    store,
    images,
    documents,
    now = () => new Date().toISOString(),
  }: CurrentThreadSessionCoordinatorOptions) {
    this.store = store
    this.images = images
    this.documents = documents
    this.now = now
  }

  async prepare(request: NyxChatRequest, signal?: AbortSignal): Promise<PreparedCurrentThreadTurn> {
    try {
      const currentRecord = await this.store.read()
      const currentMessages = toCurrentThreadProviderMessages(currentRecord)

      if (request.turnIntent === 'new_user_message') {
        const providerMessages = [
          ...currentMessages,
          { role: 'user' as const, content: request.turnUserMessage.content },
        ]

        this.assertRequestMessages(request, providerMessages)
        await this.images?.reconcile(currentRecord)
        await this.documents?.reconcile(currentRecord)

        const requestImageRefs = request.turnUserMessage.imageRefs ?? []
        const newImages = request.newImages ?? []
        const requestDocumentRefs = request.turnUserMessage.documentRefs ?? []
        const newDocuments = request.newDocuments ?? []
        let preparedImageIds: string[] = []
        let preparedDocumentRefs: CurrentThreadDocumentRef[] = []

        if (
          requestImageRefs.length !== newImages.length ||
          requestImageRefs.some((ref, index) => ref.imageId !== newImages[index]?.imageId)
        ) {
          throw new CurrentThreadSessionError(
            'invalid_request',
            'Image refs and payloads do not match.',
          )
        }

        if (
          requestDocumentRefs.length !== newDocuments.length ||
          requestDocumentRefs.some(
            (ref, index) => ref.documentId !== newDocuments[index]?.documentId,
          )
        ) {
          throw new CurrentThreadSessionError(
            'invalid_request',
            'Document refs and payloads do not match.',
          )
        }

        await this.assertRawAttachmentCapacity(currentRecord, newImages, newDocuments)

        if (requestDocumentRefs.length > 0) {
          if (!this.documents) {
            throw new CurrentThreadSessionError(
              'invalid_request',
              'Document storage is unavailable.',
            )
          }

          preparedDocumentRefs = await this.documents.writeNewDocuments({
            record: currentRecord,
            refs: requestDocumentRefs,
            documents: newDocuments,
            ...(signal ? { signal } : {}),
          })
        }

        try {
          throwIfAborted(signal)
          if (requestImageRefs.length > 0) {
            if (!this.images) {
              throw new CurrentThreadSessionError(
                'invalid_request',
                'Image storage is unavailable.',
              )
            }

            preparedImageIds = await this.images.writeNewImages({
              record: currentRecord,
              refs: requestImageRefs,
              images: newImages,
              ...(signal ? { signal } : {}),
            })
          }
        } catch (error) {
          await this.documents?.rollbackDocuments(preparedDocumentRefs.map((ref) => ref.documentId))
          throw error
        }

        let pendingRecord: CurrentThreadRecord

        try {
          throwIfAborted(signal)
          pendingRecord = currentRecord
            ? await this.store.write(
                this.appendPendingTurn(currentRecord, request, preparedDocumentRefs),
              )
            : await this.createPendingThread(request, preparedDocumentRefs)
        } catch (error) {
          await this.images?.rollbackImages(preparedImageIds)
          await this.documents?.rollbackDocuments(preparedDocumentRefs.map((ref) => ref.documentId))
          throw error
        }

        return { pendingRecord, replayRecord: currentRecord, providerMessages }
      }

      if (!currentRecord) {
        throw new CurrentThreadSessionError('invalid_request', 'There is no failed turn to retry.')
      }

      const failedTurn = currentRecord.turns.at(-1)!
      const requestImageRefs = request.turnUserMessage.imageRefs ?? []
      const failedTurnImageRefs = recordTurnImageRefs(currentRecord, currentRecord.turns.length - 1)
      const requestDocumentRefs = request.turnUserMessage.documentRefs ?? []
      const failedTurnDocumentRefs = recordTurnDocumentRefs(
        currentRecord,
        currentRecord.turns.length - 1,
      )

      if (
        failedTurn.assistantStatus !== 'failed' ||
        !failedTurn.error?.retryable ||
        failedTurn.userMessageId !== request.userMessageId ||
        failedTurn.assistantMessageId !== request.assistantMessageId ||
        failedTurn.userContent !== request.turnUserMessage.content ||
        !imageRefsEqual(failedTurnImageRefs, requestImageRefs) ||
        !documentRefsEqual(failedTurnDocumentRefs, requestDocumentRefs)
      ) {
        throw new CurrentThreadSessionError(
          'invalid_request',
          'The retry request does not match the durable failed turn.',
        )
      }

      if (request.newImages !== undefined) {
        throw new CurrentThreadSessionError(
          'invalid_request',
          'Retry cannot include new image payloads.',
        )
      }

      if (request.newDocuments !== undefined) {
        throw new CurrentThreadSessionError(
          'invalid_request',
          'Retry cannot include new document payloads.',
        )
      }

      this.assertRequestMessages(request, currentMessages)
      await this.images?.reconcile(currentRecord)
      await this.documents?.reconcile(currentRecord)

      if (failedTurnImageRefs.length > 0) {
        if (!this.images) {
          throw new CurrentThreadSessionError('invalid_request', 'Image storage is unavailable.')
        }

        await this.images.assertAvailable(failedTurnImageRefs)
      }

      if (failedTurnDocumentRefs.length > 0) {
        if (!this.documents) {
          throw new CurrentThreadSessionError('invalid_request', 'Document storage is unavailable.')
        }

        await this.documents.assertAvailable(failedTurnDocumentRefs)
      }

      throwIfAborted(signal)

      const now = this.now()
      const pendingRecord = await this.store.write(
        parseCurrentThreadRecord({
          ...currentRecord,
          turns: currentRecord.turns.map((turn, index) =>
            index === currentRecord.turns.length - 1
              ? {
                  ...turn,
                  attemptRequestId: request.requestId,
                  assistantContent: '',
                  assistantStatus: 'pending',
                  error: null,
                  targetBinding: {
                    selection: request.targetSelection,
                    attribution: null,
                  },
                  providerStateRef: null,
                  updatedAt: now,
                }
              : turn,
          ),
          updatedAt: now,
        }),
      )

      return { pendingRecord, replayRecord: currentRecord, providerMessages: currentMessages }
    } catch (error) {
      if (error instanceof CurrentThreadSessionError) {
        throw error
      }

      if (error instanceof CurrentThreadImageFilesError) {
        throw new CurrentThreadSessionError(
          error.code === 'io_error' ? 'store_error' : 'invalid_request',
          error.code === 'io_error' ? 'Current thread storage failed.' : error.message,
        )
      }

      if (error instanceof CurrentThreadDocumentFilesError) {
        throw new CurrentThreadSessionError(
          error.code === 'io_error' ? 'store_error' : 'invalid_request',
          error.code === 'io_error' ? 'Current thread storage failed.' : error.message,
        )
      }

      if (error instanceof Error && error.name === 'AbortError') {
        throw error
      }

      throw new CurrentThreadSessionError('store_error', 'Current thread storage failed.')
    }
  }

  async complete(requestId: string, assistantMessageId: string, finalContent: string) {
    return this.settle(requestId, assistantMessageId, 'completed', finalContent, null)
  }

  async materializeProviderMessages(record: CurrentThreadRecord) {
    const messages: CurrentThreadProviderMessage[] = []

    try {
      for (const turn of record.turns) {
        const refs = turn.imageRefs
        const documentRefs = turn.documentRefs

        if (refs.length === 0) {
          const content = [turn.userContent]

          for (const ref of documentRefs) {
            if (!this.documents) {
              throw new CurrentThreadSessionError(
                'invalid_request',
                'A current-thread document is unavailable.',
              )
            }

            const text = await this.documents.readExtractedText(ref)
            content.push(buildDocumentTextEnvelope(ref.name, text))
          }

          messages.push({ role: 'user', content: content.filter(Boolean).join('\n\n') })
        } else {
          if (refs.length > 0 && !this.images) {
            throw new CurrentThreadSessionError(
              'invalid_request',
              'A current-thread image is unavailable.',
            )
          }

          if (documentRefs.length > 0 && !this.documents) {
            throw new CurrentThreadSessionError(
              'invalid_request',
              'A current-thread document is unavailable.',
            )
          }

          const content: Array<
            Extract<CurrentThreadProviderMessage, { role: 'user' }>['content'][number]
          > = []

          if (turn.userContent.length > 0) {
            content.push({ type: 'text', text: turn.userContent })
          }

          for (const ref of refs) {
            const bytes = await this.images!.readCanonical(ref)
            content.push({
              type: 'image_url',
              image_url: {
                url: `data:${ref.mediaType};base64,${Buffer.from(
                  bytes.buffer,
                  bytes.byteOffset,
                  bytes.byteLength,
                ).toString('base64')}`,
              },
            })
          }

          for (const ref of documentRefs) {
            const text = await this.documents!.readExtractedText(ref)
            content.push({ type: 'text', text: buildDocumentTextEnvelope(ref.name, text) })
          }

          messages.push({ role: 'user', content })
        }

        if (turn.assistantStatus !== 'failed' && turn.assistantContent.length > 0) {
          messages.push({ role: 'assistant', content: turn.assistantContent })
        }
      }

      return messages
    } catch (error) {
      if (error instanceof CurrentThreadSessionError) {
        throw error
      }

      if (error instanceof CurrentThreadImageFilesError) {
        throw new CurrentThreadSessionError(
          error.code === 'io_error' ? 'store_error' : 'invalid_request',
          error.code === 'io_error'
            ? 'Current thread storage failed.'
            : 'A current-thread image is unavailable.',
        )
      }

      if (error instanceof CurrentThreadDocumentFilesError) {
        throw new CurrentThreadSessionError(
          error.code === 'io_error' ? 'store_error' : 'invalid_request',
          error.code === 'io_error'
            ? 'Current thread storage failed.'
            : 'A current-thread document is unavailable.',
        )
      }

      throw new CurrentThreadSessionError('store_error', 'Current thread storage failed.')
    }
  }

  async bindResolvedTarget(
    requestId: string,
    assistantMessageId: string,
    attribution: NyxChatTargetAttribution,
  ) {
    try {
      const record = await this.store.read()
      const currentTurn = record?.turns.at(-1)

      if (
        !record ||
        !currentTurn ||
        currentTurn.assistantStatus !== 'pending' ||
        currentTurn.attemptRequestId !== requestId ||
        currentTurn.assistantMessageId !== assistantMessageId ||
        !currentTurn.targetBinding ||
        currentTurn.targetBinding.attribution
      ) {
        throw new CurrentThreadSessionError(
          'invalid_request',
          'The resolved target does not match the durable pending turn.',
        )
      }

      const now = this.now()
      const currentBinding = currentTurn.targetBinding

      return await this.store.write(
        parseCurrentThreadRecord({
          ...record,
          turns: record.turns.map((turn, index) =>
            index === record.turns.length - 1
              ? {
                  ...turn,
                  targetBinding: {
                    ...currentBinding,
                    attribution,
                  },
                  updatedAt: now,
                }
              : turn,
          ),
          updatedAt: now,
        }),
      )
    } catch (error) {
      if (error instanceof CurrentThreadSessionError) {
        throw error
      }

      throw new CurrentThreadSessionError('store_error', 'Current thread storage failed.')
    }
  }

  async cancel(requestId: string, assistantMessageId: string, finalContent: string) {
    return this.settle(requestId, assistantMessageId, 'cancelled', finalContent, null)
  }

  async fail(
    requestId: string,
    assistantMessageId: string,
    finalContent: string,
    error: NyxChatError,
  ) {
    return this.settle(requestId, assistantMessageId, 'failed', finalContent, error)
  }

  async reset() {
    try {
      await this.store.reset()
    } catch {
      throw new CurrentThreadSessionError('store_error', 'Current thread storage failed.')
    }

    try {
      await this.images?.reset()
    } catch {
      // The record is already reset; leftover files are unreachable orphans.
    }

    try {
      await this.documents?.reset()
    } catch {
      // The record is already reset; leftover files are unreachable orphans.
    }
  }

  private appendPendingTurn(
    record: CurrentThreadRecord,
    request: NyxChatRequest,
    documentRefs: ReadonlyArray<CurrentThreadDocumentRef>,
  ) {
    const now = this.now()
    const imageRefs = request.turnUserMessage.imageRefs ?? []
    const turn = {
      attemptRequestId: request.requestId,
      userMessageId: request.userMessageId,
      assistantMessageId: request.assistantMessageId,
      userContent: request.turnUserMessage.content,
      assistantContent: '',
      assistantStatus: 'pending',
      error: null,
      targetBinding: {
        selection: request.targetSelection,
        attribution: null,
      },
      providerStateRef: null,
      createdAt: now,
      updatedAt: now,
    } as const

    return parseCurrentThreadRecord({
      ...record,
      turns: [...record.turns, { ...turn, imageRefs, documentRefs }],
      updatedAt: now,
    })
  }

  private createPendingThread(
    request: NyxChatRequest,
    documentRefs: ReadonlyArray<CurrentThreadDocumentRef>,
  ) {
    const input = {
      attemptRequestId: request.requestId,
      userMessageId: request.userMessageId,
      assistantMessageId: request.assistantMessageId,
      userContent: request.turnUserMessage.content,
      targetSelection: request.targetSelection,
    }
    return this.store.create({
      ...input,
      imageRefs: request.turnUserMessage.imageRefs ?? [],
      documentRefs,
    })
  }

  private assertRequestMessages(
    request: NyxChatRequest,
    providerMessages: ReadonlyArray<NyxChatInputMessage>,
  ) {
    if (!messagesEqual(request.messages, providerMessages)) {
      throw new CurrentThreadSessionError(
        'invalid_request',
        'Renderer chat messages do not match the durable current thread.',
      )
    }
  }

  private async settle(
    requestId: string,
    assistantMessageId: string,
    assistantStatus: 'completed' | 'cancelled' | 'failed',
    assistantContent: string,
    error: NyxChatError | null,
  ) {
    try {
      const record = await this.store.read()
      const currentTurn = record?.turns.at(-1)

      if (
        !record ||
        !currentTurn ||
        currentTurn.assistantStatus !== 'pending' ||
        currentTurn.attemptRequestId !== requestId ||
        currentTurn.assistantMessageId !== assistantMessageId
      ) {
        throw new CurrentThreadSessionError(
          'invalid_request',
          'The terminal update does not match the durable pending turn.',
        )
      }

      const now = this.now()
      let safeError: ReturnType<typeof createSafeThreadErrorRecord> | null = null

      if (assistantStatus === 'failed' && error) {
        if (
          error.code === 'content_rejected' &&
          currentTurn.imageRefs.length === 0 &&
          currentTurn.documentRefs.length === 0
        ) {
          throw new CurrentThreadSessionError(
            'invalid_request',
            'Only an attachment-bearing turn may persist content rejection.',
          )
        }

        safeError = createSafeThreadErrorRecord({
          code: error.code,
          retryable: error.retryable,
        })
      }

      return await this.store.write(
        parseCurrentThreadRecord({
          ...record,
          turns: record.turns.map((turn, index) =>
            index === record.turns.length - 1
              ? {
                  ...turn,
                  assistantContent,
                  assistantStatus,
                  error: safeError,
                  providerStateRef: null,
                  updatedAt: now,
                }
              : turn,
          ),
          updatedAt: now,
        }),
      )
    } catch (settleError) {
      if (settleError instanceof CurrentThreadSessionError) {
        throw settleError
      }

      throw new CurrentThreadSessionError('store_error', 'Current thread storage failed.')
    }
  }

  private async assertRawAttachmentCapacity(
    record: CurrentThreadRecord | null,
    images: ReadonlyArray<NonNullable<NyxChatRequest['newImages']>[number]>,
    documents: ReadonlyArray<NonNullable<NyxChatRequest['newDocuments']>[number]>,
  ) {
    const hasStoredImages = Boolean(record?.turns.some((turn) => turn.imageRefs.length > 0))
    const hasStoredDocuments = Boolean(record?.turns.some((turn) => turn.documentRefs.length > 0))

    if ((hasStoredImages || images.length > 0) && !this.images) {
      throw new CurrentThreadSessionError('invalid_request', 'Image storage is unavailable.')
    }
    if ((hasStoredDocuments || documents.length > 0) && !this.documents) {
      throw new CurrentThreadSessionError('invalid_request', 'Document storage is unavailable.')
    }

    const existingImageBytes = hasStoredImages ? await this.images!.canonicalBytes(record) : 0
    const existingDocumentBytes = hasStoredDocuments ? this.documents!.rawBytes(record) : 0
    const total =
      existingImageBytes +
      existingDocumentBytes +
      images.reduce((sum, image) => sum + image.canonicalBytes.byteLength, 0) +
      documents.reduce((sum, document) => sum + document.sourceBytes.byteLength, 0)

    if (total > nyxChatDocumentLimits.currentThreadAttachmentBytes) {
      throw new CurrentThreadSessionError(
        'invalid_request',
        'Current-thread attachment capacity was exceeded.',
      )
    }
  }
}
