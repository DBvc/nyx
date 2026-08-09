import type {
  NyxChatError,
  NyxChatImageRef,
  NyxChatInputMessage,
  NyxChatRequest,
  NyxChatTargetAttribution,
} from '../../../shared/chat/types'
import {
  createSafeThreadErrorRecordV2,
  parseCurrentThreadRecordV3,
  parseCurrentThreadRecordV2,
  parseMutableCurrentThreadRecord,
  upgradeCurrentThreadRecordForImageMutation,
  upgradeCurrentThreadRecordForMutation,
  type CurrentThreadRecord,
  type MutableCurrentThreadRecord,
  type MutableTurnRecord,
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
  pendingRecord: MutableCurrentThreadRecord
  replayRecord: CurrentThreadRecord | null
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
  return record.version === 3 ? record.turns[index]!.imageRefs : []
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
          : await this.createPendingThread(request)

        return { pendingRecord, replayRecord: currentRecord, providerMessages }
      }

      if (!currentRecord) {
        throw new CurrentThreadSessionError('invalid_request', 'There is no failed turn to retry.')
      }

      const failedTurn = currentRecord.turns.at(-1)!
      const requestImageRefs = request.turnUserMessage.imageRefs ?? []
      const failedTurnImageRefs = recordTurnImageRefs(currentRecord, currentRecord.turns.length - 1)

      if (
        failedTurn.assistantStatus !== 'failed' ||
        !failedTurn.error?.retryable ||
        failedTurn.userMessageId !== request.userMessageId ||
        failedTurn.assistantMessageId !== request.assistantMessageId ||
        failedTurn.userContent !== request.turnUserMessage.content ||
        !imageRefsEqual(failedTurnImageRefs, requestImageRefs)
      ) {
        throw new CurrentThreadSessionError(
          'invalid_request',
          'The retry request does not match the durable failed turn.',
        )
      }

      this.assertRequestMessages(request, currentMessages)

      const now = this.now()
      const upgradedRecord = upgradeCurrentThreadRecordForMutation(currentRecord)
      const pendingRecord = await this.store.write(
        parseMutableCurrentThreadRecord({
          ...upgradedRecord,
          turns: upgradedRecord.turns.map((turn, index) =>
            index === upgradedRecord.turns.length - 1
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

      throw new CurrentThreadSessionError('store_error', 'Current thread storage failed.')
    }
  }

  async complete(requestId: string, assistantMessageId: string, finalContent: string) {
    return this.settle(requestId, assistantMessageId, 'completed', finalContent, null)
  }

  async bindResolvedTarget(
    requestId: string,
    assistantMessageId: string,
    attribution: NyxChatTargetAttribution,
  ) {
    try {
      const record = await this.store.read()
      const upgradedRecord = record ? upgradeCurrentThreadRecordForMutation(record) : null
      const currentTurn = upgradedRecord?.turns.at(-1)

      if (
        !upgradedRecord ||
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
        parseMutableCurrentThreadRecord({
          ...upgradedRecord,
          turns: upgradedRecord.turns.map((turn, index) =>
            index === upgradedRecord.turns.length - 1
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
    return this.settle(
      requestId,
      assistantMessageId,
      'failed',
      finalContent,
      createSafeThreadErrorRecordV2({ code: error.code, retryable: error.retryable }),
    )
  }

  async reset() {
    try {
      await this.store.reset()
    } catch {
      throw new CurrentThreadSessionError('store_error', 'Current thread storage failed.')
    }
  }

  private appendPendingTurn(record: CurrentThreadRecord, request: NyxChatRequest) {
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
      createdAt: now,
      updatedAt: now,
    } as const

    if (record.version === 3 || imageRefs.length > 0) {
      const upgradedRecord = upgradeCurrentThreadRecordForImageMutation(record)

      return parseCurrentThreadRecordV3({
        ...upgradedRecord,
        turns: [...upgradedRecord.turns, { ...turn, imageRefs }],
        updatedAt: now,
      })
    }

    const upgradedRecord = upgradeCurrentThreadRecordForMutation(record)

    if (upgradedRecord.version !== 2) {
      throw new CurrentThreadSessionError('invalid_request', 'Current thread version is invalid.')
    }

    return parseCurrentThreadRecordV2({
      ...upgradedRecord,
      turns: [...upgradedRecord.turns, turn],
      updatedAt: now,
    })
  }

  private createPendingThread(request: NyxChatRequest) {
    const input = {
      attemptRequestId: request.requestId,
      userMessageId: request.userMessageId,
      assistantMessageId: request.assistantMessageId,
      userContent: request.turnUserMessage.content,
      targetSelection: request.targetSelection,
    }
    const [firstImageRef, ...remainingImageRefs] = request.turnUserMessage.imageRefs ?? []

    return firstImageRef
      ? this.store.create({
          ...input,
          imageRefs: [firstImageRef, ...remainingImageRefs],
        })
      : this.store.create(input)
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
    error: MutableTurnRecord['error'],
  ) {
    try {
      const record = await this.store.read()
      const upgradedRecord = record ? upgradeCurrentThreadRecordForMutation(record) : null
      const currentTurn = upgradedRecord?.turns.at(-1)

      if (
        !upgradedRecord ||
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

      return await this.store.write(
        parseMutableCurrentThreadRecord({
          ...upgradedRecord,
          turns: upgradedRecord.turns.map((turn, index) =>
            index === upgradedRecord.turns.length - 1
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
        }),
      )
    } catch (settleError) {
      if (settleError instanceof CurrentThreadSessionError) {
        throw settleError
      }

      throw new CurrentThreadSessionError('store_error', 'Current thread storage failed.')
    }
  }
}
