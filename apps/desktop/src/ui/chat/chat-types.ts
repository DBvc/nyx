import type {
  NyxChatInputMessage,
  NyxChatMessage,
  NyxChatRunStatus,
  NyxChatTargetSelection,
  NyxChatTurnUserMessage,
} from '../../../shared/chat/types'
import type {
  NyxCurrentThreadResetError,
  NyxCurrentThreadSnapshotError,
} from '../../../shared/chat/snapshot'

export type ChatHydrationStatus = 'loading' | 'ready' | 'error'
export type ChatResetStatus = 'idle' | 'resetting'

export interface ChatTurnRequest {
  requestId: string
  userMessageId: string
  assistantMessageId: string
  turnUserMessage: NyxChatTurnUserMessage
  submittedMessages: ReadonlyArray<NyxChatInputMessage>
  targetSelection: NyxChatTargetSelection
}

export interface RetryableChatTurn {
  userMessageId: string
  assistantMessageId: string
  turnUserMessage: NyxChatTurnUserMessage
  submittedMessages: ReadonlyArray<NyxChatInputMessage>
}

export interface ChatState {
  messages: NyxChatMessage[]
  input: string
  runStatus: NyxChatRunStatus
  activeRequestId: string | undefined
  activeAssistantMessageId: string | undefined
  activeTurn: ChatTurnRequest | null
  retryableTurn: RetryableChatTurn | null
  hydrationStatus: ChatHydrationStatus
  hydrationError: NyxCurrentThreadSnapshotError | null
  projectionGeneration: number
  resetStatus: ChatResetStatus
  resetError: NyxCurrentThreadResetError | null
  committedTarget: NyxChatTargetSelection | null
  targetDraft: NyxChatTargetSelection | null
  targetInitialized: boolean
  targetAvailable: boolean
  targetCatalogEpoch: number
  targetMinimumCatalogEpoch: number
}

export const initialChatState: ChatState = {
  messages: [],
  input: '',
  runStatus: 'idle',
  activeRequestId: undefined,
  activeAssistantMessageId: undefined,
  activeTurn: null,
  retryableTurn: null,
  hydrationStatus: 'loading',
  hydrationError: null,
  projectionGeneration: 0,
  resetStatus: 'idle',
  resetError: null,
  committedTarget: null,
  targetDraft: null,
  targetInitialized: false,
  targetAvailable: false,
  targetCatalogEpoch: 0,
  targetMinimumCatalogEpoch: 0,
}
