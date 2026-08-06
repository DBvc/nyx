import type {
  NyxCurrentThreadRetryableTurn,
  NyxCurrentThreadMessage,
  NyxCurrentThreadSnapshot,
  NyxCurrentThreadSnapshotResult,
} from '../../../shared/chat/snapshot'
import type { NyxChatInputMessage } from '../../../shared/chat/types'
import type { CurrentThreadRecord } from './schemas'

export interface CurrentThreadRecordReader {
  read(): Promise<CurrentThreadRecord | null>
}

export interface CurrentThreadSnapshotController {
  getSnapshot(): Promise<NyxCurrentThreadSnapshotResult>
}

export interface CurrentThreadSnapshotServiceOptions {
  resolveReader: () => CurrentThreadRecordReader
}

const snapshotLoadError = {
  code: 'load_failed',
  message: 'Nyx could not load the current thread.',
} as const

export function toCurrentThreadSnapshot(record: CurrentThreadRecord): NyxCurrentThreadSnapshot {
  const messages: NyxCurrentThreadMessage[] = []
  const submittedMessages: NyxChatInputMessage[] = []
  let retryableTurn: NyxCurrentThreadRetryableTurn | null = null
  let selectedTarget: NyxCurrentThreadSnapshot['selectedTarget'] = null
  let runStatus: NyxCurrentThreadSnapshot['runStatus'] = 'completed'

  for (const [index, turn] of record.turns.entries()) {
    const targetBinding = record.version === 2 ? record.turns[index]!.targetBinding : null

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

  constructor({ resolveReader }: CurrentThreadSnapshotServiceOptions) {
    this.resolveReader = resolveReader
  }

  async getSnapshot(): Promise<NyxCurrentThreadSnapshotResult> {
    try {
      const record = await this.resolveReader().read()

      return {
        ok: true,
        value: record ? toCurrentThreadSnapshot(record) : null,
      }
    } catch {
      return {
        ok: false,
        error: snapshotLoadError,
      }
    }
  }
}
