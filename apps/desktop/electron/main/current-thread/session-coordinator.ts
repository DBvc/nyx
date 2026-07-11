import type { NyxChatError, NyxChatInputMessage, NyxChatRequest } from '../../../shared/chat/types'
import {
  createSafeThreadErrorRecordV1,
  type CurrentThreadRecordV1,
  type TurnRecordV1,
} from './schemas'
import type { CurrentThreadStore } from './store'

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
  pendingRecord: CurrentThreadRecordV1
  replayRecord: CurrentThreadRecordV1 | null
  providerMessages: NyxChatInputMessage[]
}

export interface CurrentThreadSessionCoordinatorOptions {
  store: CurrentThreadStore
  now?: () => string
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

export function toCurrentThreadProviderMessages(record: CurrentThreadRecordV1 | null) {
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
  private readonly now: () => string

  constructor({
    store,
    now = () => new Date().toISOString(),
  }: CurrentThreadSessionCoordinatorOptions) {
    this.store = store
    this.now = now
  }

  async prepare(request: NyxChatRequest): Promise<PreparedCurrentThreadTurn> {
    try {
      const currentRecord = await this.store.read()
      const currentMessages = toCurrentThreadProviderMessages(currentRecord)

      if (request.turnIntent === 'new_user_message') {
        const providerMessages = [
          ...currentMessages,
          { role: 'user' as const, content: request.turnUserMessage.content },
        ]

        this.assertRequestMessages(request, providerMessages)

        const pendingRecord = currentRecord
          ? await this.store.write(this.appendPendingTurn(currentRecord, request))
          : await this.store.create({
              attemptRequestId: request.requestId,
              userMessageId: request.userMessageId,
              assistantMessageId: request.assistantMessageId,
              userContent: request.turnUserMessage.content,
            })

        return { pendingRecord, replayRecord: currentRecord, providerMessages }
      }

      if (!currentRecord) {
        throw new CurrentThreadSessionError('invalid_request', 'There is no failed turn to retry.')
      }

      const failedTurn = currentRecord.turns.at(-1)!

      if (
        failedTurn.assistantStatus !== 'failed' ||
        !failedTurn.error?.retryable ||
        failedTurn.userMessageId !== request.userMessageId ||
        failedTurn.assistantMessageId !== request.assistantMessageId ||
        failedTurn.userContent !== request.turnUserMessage.content
      ) {
        throw new CurrentThreadSessionError(
          'invalid_request',
          'The retry request does not match the durable failed turn.',
        )
      }

      this.assertRequestMessages(request, currentMessages)

      const now = this.now()
      const pendingRecord = await this.store.write({
        ...currentRecord,
        turns: currentRecord.turns.map((turn, index) =>
          index === currentRecord.turns.length - 1
            ? {
                ...turn,
                attemptRequestId: request.requestId,
                assistantContent: '',
                assistantStatus: 'pending',
                error: null,
                updatedAt: now,
              }
            : turn,
        ),
        updatedAt: now,
      })

      return { pendingRecord, replayRecord: currentRecord, providerMessages: currentMessages }
    } catch (error) {
      if (error instanceof CurrentThreadSessionError) {
        throw error
      }

      throw new CurrentThreadSessionError('store_error', 'Current thread storage failed.')
    }
  }

  async complete(requestId: string, assistantMessageId: string, finalContent: string) {
    return this.settle(requestId, assistantMessageId, 'completed', finalContent, null)
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
    return this.settle(
      requestId,
      assistantMessageId,
      'failed',
      finalContent,
      createSafeThreadErrorRecordV1({ code: error.code, retryable: error.retryable }),
    )
  }

  async reset() {
    try {
      await this.store.reset()
    } catch {
      throw new CurrentThreadSessionError('store_error', 'Current thread storage failed.')
    }
  }

  private appendPendingTurn(record: CurrentThreadRecordV1, request: NyxChatRequest) {
    const now = this.now()
    const turn = {
      attemptRequestId: request.requestId,
      userMessageId: request.userMessageId,
      assistantMessageId: request.assistantMessageId,
      userContent: request.turnUserMessage.content,
      assistantContent: '',
      assistantStatus: 'pending',
      error: null,
      createdAt: now,
      updatedAt: now,
    } as const satisfies TurnRecordV1

    return {
      ...record,
      turns: [...record.turns, turn],
      updatedAt: now,
    }
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
    error: TurnRecordV1['error'],
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

      return await this.store.write({
        ...record,
        turns: record.turns.map((turn, index) =>
          index === record.turns.length - 1
            ? {
                ...turn,
                assistantContent,
                assistantStatus,
                error,
                updatedAt: now,
              }
            : turn,
        ),
        updatedAt: now,
      })
    } catch (settleError) {
      if (settleError instanceof CurrentThreadSessionError) {
        throw settleError
      }

      throw new CurrentThreadSessionError('store_error', 'Current thread storage failed.')
    }
  }
}
