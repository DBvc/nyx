import type {
  NyxCurrentThreadRetryableTurn,
  NyxCurrentThreadMessage,
  NyxCurrentThreadSnapshot,
  NyxCurrentThreadSnapshotResult,
} from '../../../shared/chat/snapshot'
import type { NyxChatInputMessage } from '../../../shared/chat/types'
import type { CurrentThreadRecordV1 } from './schemas'

export interface CurrentThreadRecordReader {
  read(): Promise<CurrentThreadRecordV1 | null>
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

export function toCurrentThreadSnapshot(record: CurrentThreadRecordV1): NyxCurrentThreadSnapshot {
  const messages: NyxCurrentThreadMessage[] = []
  const submittedMessages: NyxChatInputMessage[] = []
  let retryableTurn: NyxCurrentThreadRetryableTurn | null = null
  let runStatus: NyxCurrentThreadSnapshot['runStatus'] = 'completed'

  for (const [index, turn] of record.turns.entries()) {
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
