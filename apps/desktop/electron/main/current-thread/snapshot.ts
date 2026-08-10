import type {
  NyxCurrentThreadRetryableTurn,
  NyxCurrentThreadMessage,
  NyxCurrentThreadSnapshot,
  NyxCurrentThreadSnapshotResult,
} from '../../../shared/chat/snapshot'
import type { NyxChatInputMessage } from '../../../shared/chat/types'
import type { CurrentThreadRecord } from './schemas'
import type { CurrentThreadImageFiles } from './image-files'
import type { CurrentThreadDocumentFiles } from './document-files'

export interface CurrentThreadRecordReader {
  read(): Promise<CurrentThreadRecord | null>
}

export interface CurrentThreadSnapshotController {
  getSnapshot(): Promise<NyxCurrentThreadSnapshotResult>
}

export interface CurrentThreadSnapshotServiceOptions {
  resolveReader: () => CurrentThreadRecordReader
  resolveImages?: () => CurrentThreadImageFiles
  resolveDocuments?: () => CurrentThreadDocumentFiles
}

const snapshotLoadError = {
  code: 'load_failed',
  message: 'Nyx could not load the current thread.',
} as const
const noAvailableImageIds: ReadonlySet<string> = new Set()
const noAvailableDocumentIds: ReadonlySet<string> = new Set()

export function toCurrentThreadSnapshot(
  record: CurrentThreadRecord,
  availableImageIds: ReadonlySet<string>,
  availableDocumentIds: ReadonlySet<string>,
): NyxCurrentThreadSnapshot {
  const messages: NyxCurrentThreadMessage[] = []
  const submittedMessages: NyxChatInputMessage[] = []
  let retryableTurn: NyxCurrentThreadRetryableTurn | null = null
  let selectedTarget: NyxCurrentThreadSnapshot['selectedTarget'] = null
  let runStatus: NyxCurrentThreadSnapshot['runStatus'] = 'completed'

  for (const [index, turn] of record.turns.entries()) {
    const targetBinding = record.version === 1 ? null : record.turns[index]!.targetBinding
    const imageRefs =
      record.version === 3 || record.version === 4 ? record.turns[index]!.imageRefs : []
    const documentRefs = record.version === 4 ? record.turns[index]!.documentRefs : []

    if (turn.assistantStatus === 'pending') {
      throw new Error('Pending current thread records must be recovered before snapshot mapping.')
    }

    runStatus = turn.assistantStatus
    const isRetryableTurn =
      index === record.turns.length - 1 &&
      turn.assistantStatus === 'failed' &&
      Boolean(turn.error?.retryable)

    const userMessage = {
      id: turn.userMessageId,
      role: 'user',
      content: turn.userContent,
      status: 'completed',
      ...(imageRefs.length > 0
        ? {
            images: imageRefs.map((imageRef) => ({
              ...imageRef,
              available: availableImageIds.has(imageRef.imageId),
            })),
          }
        : {}),
      ...(documentRefs.length > 0
        ? {
            documents: documentRefs.map(
              ({ sourceSha256: _sourceSha256, extractedTextSha256: _textSha256, ...ref }) => ({
                ...ref,
                available: availableDocumentIds.has(ref.documentId),
              }),
            ),
          }
        : {}),
    } as const satisfies NyxCurrentThreadMessage
    const assistantMessage: NyxCurrentThreadMessage = {
      id: turn.assistantMessageId,
      role: 'assistant',
      content: turn.assistantContent,
      status: turn.assistantStatus,
      ...(turn.error ? { error: { ...turn.error }, canRetry: isRetryableTurn } : {}),
      ...(targetBinding?.attribution
        ? { targetAttribution: { ...targetBinding.attribution } }
        : {}),
    }

    if (targetBinding) {
      selectedTarget = { ...targetBinding.selection }
    }

    messages.push(userMessage, assistantMessage)
    submittedMessages.push({ role: 'user', content: turn.userContent })

    if (turn.assistantStatus !== 'failed' && turn.assistantContent.length > 0) {
      submittedMessages.push({ role: 'assistant', content: turn.assistantContent })
    }

    if (isRetryableTurn) {
      retryableTurn = {
        userMessageId: turn.userMessageId,
        assistantMessageId: turn.assistantMessageId,
        turnUserMessage: {
          id: turn.userMessageId,
          content: turn.userContent,
          ...(imageRefs.length > 0
            ? { imageRefs: imageRefs.map((imageRef) => ({ ...imageRef })) }
            : {}),
          ...(documentRefs.length > 0
            ? {
                documentRefs: documentRefs.map(
                  ({ sourceSha256: _sourceSha256, extractedTextSha256: _textSha256, ...ref }) => ({
                    ...ref,
                  }),
                ),
              }
            : {}),
        },
        submittedMessages: submittedMessages.map((message) => ({ ...message })),
      }
    }
  }

  return {
    messages,
    runStatus,
    retryableTurn,
    selectedTarget,
  }
}

export class CurrentThreadSnapshotService implements CurrentThreadSnapshotController {
  private readonly resolveReader: () => CurrentThreadRecordReader
  private readonly resolveImages: (() => CurrentThreadImageFiles) | undefined
  private readonly resolveDocuments: (() => CurrentThreadDocumentFiles) | undefined

  constructor({
    resolveReader,
    resolveImages,
    resolveDocuments,
  }: CurrentThreadSnapshotServiceOptions) {
    this.resolveReader = resolveReader
    this.resolveImages = resolveImages
    this.resolveDocuments = resolveDocuments
  }

  async getSnapshot(): Promise<NyxCurrentThreadSnapshotResult> {
    try {
      const record = await this.resolveReader().read()
      const availableImageIds =
        record && this.resolveImages
          ? await this.resolveImages().availableImageIds(record)
          : noAvailableImageIds
      const availableDocumentIds =
        record && this.resolveDocuments
          ? await this.resolveDocuments().availableDocumentIds(record)
          : noAvailableDocumentIds

      return {
        ok: true,
        value: record
          ? toCurrentThreadSnapshot(record, availableImageIds, availableDocumentIds)
          : null,
      }
    } catch {
      return {
        ok: false,
        error: snapshotLoadError,
      }
    }
  }
}
