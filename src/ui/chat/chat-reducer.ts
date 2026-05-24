import type { NyxChatError, NyxChatInputMessage, NyxChatMessage } from '../../../shared/chat/types'
import type { NyxChatState } from './chat-types'
import { initialNyxChatState } from './chat-types'

type NyxChatAction =
  | {
      type: 'set-input'
      value: string
    }
  | {
      type: 'request-submitted'
      requestId: string
      assistantMessageId: string
      submittedMessages: ReadonlyArray<NyxChatInputMessage>
      userMessage: NyxChatMessage
      assistantMessage: NyxChatMessage
    }
  | {
      type: 'request-started'
      requestId: string
    }
  | {
      type: 'request-delta'
      requestId: string
      assistantMessageId: string
      snapshot: string
    }
  | {
      type: 'request-completed'
      requestId: string
      assistantMessageId: string
      status: 'completed' | 'cancelled'
      finalContent: string
    }
  | {
      type: 'request-failed'
      requestId: string
      assistantMessageId: string
      error: NyxChatError
    }
  | {
      type: 'retry-requested'
      requestId: string
      assistantMessageId: string
      submittedMessages: ReadonlyArray<NyxChatInputMessage>
    }
  | {
      type: 'clear-chat'
    }

function updateMessage(
  messages: ReadonlyArray<NyxChatMessage>,
  messageId: string,
  updater: (message: NyxChatMessage) => NyxChatMessage,
) {
  return messages.map((message) => {
    if (message.id !== messageId) {
      return message
    }

    return updater(message)
  })
}

export function nyxChatReducer(state: NyxChatState, action: NyxChatAction): NyxChatState {
  switch (action.type) {
    case 'set-input':
      return {
        ...state,
        input: action.value,
      }

    case 'request-submitted':
      return {
        ...state,
        input: '',
        runStatus: 'submitting',
        activeRequestId: action.requestId,
        activeAssistantMessageId: action.assistantMessageId,
        lastSubmittedMessages: action.submittedMessages,
        lastAssistantMessageId: action.assistantMessageId,
        messages: [...state.messages, action.userMessage, action.assistantMessage],
      }

    case 'request-started':
      if (state.activeRequestId !== action.requestId || !state.activeAssistantMessageId) {
        return state
      }

      return {
        ...state,
        runStatus: 'streaming',
        messages: updateMessage(state.messages, state.activeAssistantMessageId, (message) => ({
          ...message,
          status: 'streaming',
        })),
      }

    case 'request-delta':
      if (state.activeRequestId !== action.requestId) {
        return state
      }

      return {
        ...state,
        runStatus: 'streaming',
        messages: updateMessage(state.messages, action.assistantMessageId, (message) => ({
          ...message,
          content: action.snapshot,
          status: 'streaming',
        })),
      }

    case 'request-completed':
      if (state.activeRequestId !== action.requestId) {
        return state
      }

      return {
        ...state,
        runStatus: action.status,
        activeRequestId: undefined,
        activeAssistantMessageId: undefined,
        messages: updateMessage(state.messages, action.assistantMessageId, (message) => ({
          ...(() => {
            const { error: _error, ...rest } = message
            return rest
          })(),
          content: action.finalContent,
          status: action.status === 'cancelled' ? 'cancelled' : 'completed',
          canRetry: false,
        })),
      }

    case 'request-failed':
      if (state.activeRequestId !== action.requestId) {
        return state
      }

      return {
        ...state,
        runStatus: 'failed',
        activeRequestId: undefined,
        activeAssistantMessageId: undefined,
        messages: updateMessage(state.messages, action.assistantMessageId, (message) => ({
          ...message,
          status: 'failed',
          error: action.error,
          canRetry: action.error.retryable,
        })),
      }

    case 'retry-requested':
      return {
        ...state,
        runStatus: 'submitting',
        activeRequestId: action.requestId,
        activeAssistantMessageId: action.assistantMessageId,
        lastSubmittedMessages: action.submittedMessages,
        lastAssistantMessageId: action.assistantMessageId,
        messages: updateMessage(state.messages, action.assistantMessageId, (message) => ({
          ...(() => {
            const { error: _error, ...rest } = message
            return rest
          })(),
          content: '',
          status: 'pending',
          canRetry: false,
        })),
      }

    case 'clear-chat':
      return initialNyxChatState
  }
}
