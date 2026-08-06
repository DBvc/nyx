import type {
  NyxChatError,
  NyxChatInputMessage,
  NyxChatMessage,
  NyxChatTargetAttribution,
  NyxChatTargetSelection,
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
      type: 'target-context-ready'
      generation: number
      catalogEpoch: number
      selection: NyxChatTargetSelection | null
      available: boolean
    }
  | {
      type: 'target-catalog-updated'
      generation: number
      catalogEpoch: number
      available: boolean
    }
  | {
      type: 'target-catalog-unready'
      catalogEpoch: number
    }
  | {
      type: 'target-draft-changed'
      selection: NyxChatTargetSelection
      available: boolean
    }
  | {
      type: 'request-submitted'
      requestId: string
      assistantMessageId: string
      turnUserMessage: NyxChatTurnUserMessage
      submittedMessages: ReadonlyArray<NyxChatInputMessage>
      userMessage: NyxChatMessage
      assistantMessage: NyxChatMessage
      targetSelection: NyxChatTargetSelection
    }
  | {
      type: 'request-started'
      requestId: string
      assistantMessageId: string
      targetAttribution: NyxChatTargetAttribution
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
      targetAttribution?: NyxChatTargetAttribution
    }
  | {
      type: 'retry-requested'
      requestId: string
      userMessageId: string
      assistantMessageId: string
      turnUserMessage: NyxChatTurnUserMessage
      submittedMessages: ReadonlyArray<NyxChatInputMessage>
      targetSelection: NyxChatTargetSelection
    }
  | {
      type: 'reset-started'
      generation: number
      minimumCatalogEpoch: number
    }
  | {
      type: 'reset-failed'
      generation: number
      error: NyxCurrentThreadResetError
      restoreTargetInitialized: boolean
      restoreTargetAvailable: boolean
      restoreMinimumCatalogEpoch: number
    }
  | {
      type: 'clear-chat'
      generation: number
      minimumCatalogEpoch: number
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
        projectionGeneration: action.generation,
      } as const satisfies ChatState

      if (!action.snapshot) {
        return readyState
      }

      return {
        ...readyState,
        messages: action.snapshot.messages.map((message) => ({
          ...message,
          ...(message.error ? { error: { ...message.error } } : {}),
          ...(message.targetAttribution
            ? { targetAttribution: { ...message.targetAttribution } }
            : {}),
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
        committedTarget: action.snapshot.selectedTarget
          ? { ...action.snapshot.selectedTarget }
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

    case 'target-context-ready':
      if (
        action.generation !== state.projectionGeneration ||
        state.targetInitialized ||
        action.catalogEpoch < state.targetMinimumCatalogEpoch
      ) {
        return state
      }

      return {
        ...state,
        targetDraft: action.selection ? { ...action.selection } : null,
        targetInitialized: true,
        targetAvailable: action.available,
        targetCatalogEpoch: action.catalogEpoch,
      }

    case 'target-catalog-updated':
      if (
        action.generation !== state.projectionGeneration ||
        !state.targetInitialized ||
        action.catalogEpoch < state.targetCatalogEpoch
      ) {
        return state
      }

      return {
        ...state,
        targetAvailable: action.available,
        targetCatalogEpoch: action.catalogEpoch,
      }

    case 'target-catalog-unready':
      if (action.catalogEpoch < state.targetCatalogEpoch || !state.targetAvailable) {
        return state
      }

      return {
        ...state,
        targetAvailable: false,
      }

    case 'target-draft-changed':
      if (!state.targetInitialized || state.resetStatus === 'resetting') {
        return state
      }

      return {
        ...state,
        targetDraft: { ...action.selection },
        targetAvailable: action.available,
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
          targetSelection: action.targetSelection,
        },
        committedTarget: { ...action.targetSelection },
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
          targetAttribution: { ...action.targetAttribution },
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
          ...(action.targetAttribution
            ? { targetAttribution: { ...action.targetAttribution } }
            : {}),
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
          targetSelection: action.targetSelection,
        },
        committedTarget: { ...action.targetSelection },
        retryableTurn: null,
        messages: updateMessage(state.messages, action.assistantMessageId, (message) => ({
          ...(() => {
            const { error: _error, targetAttribution: _targetAttribution, ...rest } = message
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
        targetInitialized: false,
        targetAvailable: false,
        targetMinimumCatalogEpoch: action.minimumCatalogEpoch,
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
        targetInitialized: action.restoreTargetInitialized,
        targetAvailable: action.restoreTargetAvailable,
        targetMinimumCatalogEpoch: action.restoreMinimumCatalogEpoch,
      }

    case 'clear-chat':
      if (action.generation !== state.projectionGeneration) {
        return state
      }

      return {
        ...initialChatState,
        hydrationStatus: 'ready',
        projectionGeneration: action.generation,
        targetMinimumCatalogEpoch: action.minimumCatalogEpoch,
      }
  }
}
