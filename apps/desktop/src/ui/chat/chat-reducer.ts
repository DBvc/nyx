import type {
  NyxChatError,
  NyxChatInputMessage,
  NyxChatMessage,
  NyxChatTurnUserMessage,
} from '../../../shared/chat/types'
import type {
  NyxCurrentThreadResetError,
  NyxCurrentThreadSnapshot,
  NyxCurrentThreadSnapshotError,
} from '../../../shared/chat/snapshot'
import type { ChatState } from './chat-types'
import { initialChatState } from './chat-types'

type ChatAction =
  | {
      type: 'current-thread-hydrated'
      generation: number
      snapshot: NyxCurrentThreadSnapshot | null
    }
  | {
      type: 'current-thread-hydration-failed'
      generation: number
      error: NyxCurrentThreadSnapshotError
    }
  | {
      type: 'set-input'
      value: string
    }
  | {
      type: 'request-submitted'
      requestId: string
      assistantMessageId: string
      turnUserMessage: NyxChatTurnUserMessage
      submittedMessages: ReadonlyArray<NyxChatInputMessage>
      userMessage: NyxChatMessage
      assistantMessage: NyxChatMessage
    }
  | {
      type: 'request-started'
      requestId: string
      assistantMessageId: string
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
      userMessageId: string
      assistantMessageId: string
      turnUserMessage: NyxChatTurnUserMessage
      submittedMessages: ReadonlyArray<NyxChatInputMessage>
    }
  | {
      type: 'reset-started'
      generation: number
    }
  | {
      type: 'reset-failed'
      generation: number
      error: NyxCurrentThreadResetError
    }
  | {
      type: 'clear-chat'
      generation: number
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

function isActiveAssistantTurn(state: ChatState, requestId: string, assistantMessageId: string) {
  return (
    state.activeRequestId === requestId && state.activeAssistantMessageId === assistantMessageId
  )
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'current-thread-hydrated': {
      if (action.generation !== state.projectionGeneration) {
        return state
      }

      const readyState = {
        ...initialChatState,
        hydrationStatus: 'ready',
      } as const satisfies ChatState

      if (!action.snapshot) {
        return readyState
      }

      return {
        ...readyState,
        messages: action.snapshot.messages.map((message) => ({
          ...message,
          ...(message.error ? { error: { ...message.error } } : {}),
        })),
        runStatus: action.snapshot.runStatus,
        retryableTurn: action.snapshot.retryableTurn
          ? {
              ...action.snapshot.retryableTurn,
              turnUserMessage: { ...action.snapshot.retryableTurn.turnUserMessage },
              submittedMessages: action.snapshot.retryableTurn.submittedMessages.map((message) => ({
                ...message,
              })),
            }
          : null,
      }
    }

    case 'current-thread-hydration-failed':
      if (action.generation !== state.projectionGeneration) {
        return state
      }

      return {
        ...initialChatState,
        hydrationStatus: 'error',
        hydrationError: { ...action.error },
      }

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
        activeTurn: {
          requestId: action.requestId,
          userMessageId: action.userMessage.id,
          assistantMessageId: action.assistantMessageId,
          turnUserMessage: action.turnUserMessage,
          submittedMessages: action.submittedMessages,
        },
        retryableTurn: null,
        messages: [...state.messages, action.userMessage, action.assistantMessage],
      }

    case 'request-started':
      if (!isActiveAssistantTurn(state, action.requestId, action.assistantMessageId)) {
        return state
      }

      return {
        ...state,
        runStatus: 'streaming',
        messages: updateMessage(state.messages, action.assistantMessageId, (message) => ({
          ...message,
          status: 'streaming',
        })),
      }

    case 'request-delta':
      if (!isActiveAssistantTurn(state, action.requestId, action.assistantMessageId)) {
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
      if (!isActiveAssistantTurn(state, action.requestId, action.assistantMessageId)) {
        return state
      }

      return {
        ...state,
        runStatus: action.status,
        activeRequestId: undefined,
        activeAssistantMessageId: undefined,
        activeTurn: null,
        retryableTurn: null,
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
      if (!isActiveAssistantTurn(state, action.requestId, action.assistantMessageId)) {
        return state
      }

      return {
        ...state,
        runStatus: 'failed',
        activeRequestId: undefined,
        activeAssistantMessageId: undefined,
        activeTurn: null,
        retryableTurn:
          action.error.retryable && state.activeTurn
            ? {
                userMessageId: state.activeTurn.userMessageId,
                assistantMessageId: state.activeTurn.assistantMessageId,
                turnUserMessage: state.activeTurn.turnUserMessage,
                submittedMessages: state.activeTurn.submittedMessages,
              }
            : null,
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
        activeTurn: {
          requestId: action.requestId,
          userMessageId: action.userMessageId,
          assistantMessageId: action.assistantMessageId,
          turnUserMessage: action.turnUserMessage,
          submittedMessages: action.submittedMessages,
        },
        retryableTurn: null,
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

    case 'reset-started':
      return {
        ...state,
        activeRequestId: undefined,
        activeAssistantMessageId: undefined,
        activeTurn: null,
        retryableTurn: null,
        projectionGeneration: action.generation,
        resetStatus: 'resetting',
        resetError: null,
      }

    case 'reset-failed':
      if (action.generation !== state.projectionGeneration) {
        return state
      }

      return {
        ...state,
        runStatus: 'failed',
        activeRequestId: undefined,
        activeAssistantMessageId: undefined,
        activeTurn: null,
        retryableTurn: null,
        hydrationStatus: 'error',
        resetStatus: 'idle',
        resetError: { ...action.error },
      }

    case 'clear-chat':
      if (action.generation !== state.projectionGeneration) {
        return state
      }

      return {
        ...initialChatState,
        hydrationStatus: 'ready',
        projectionGeneration: action.generation,
      }
  }
}
