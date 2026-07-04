import type {
  NyxChatInputMessage,
  NyxChatMessage,
  NyxChatRunStatus,
} from '../../../shared/chat/types'

export interface NyxChatTurnRequest {
  requestId: string
  userMessageId: string
  assistantMessageId: string
  submittedMessages: ReadonlyArray<NyxChatInputMessage>
}

export interface NyxRetryableChatTurn {
  userMessageId: string
  assistantMessageId: string
  submittedMessages: ReadonlyArray<NyxChatInputMessage>
}

export interface NyxChatState {
  messages: NyxChatMessage[]
  input: string
  runStatus: NyxChatRunStatus
  activeRequestId: string | undefined
  activeAssistantMessageId: string | undefined
  activeTurn: NyxChatTurnRequest | null
  retryableTurn: NyxRetryableChatTurn | null
}

export const initialNyxChatState: NyxChatState = {
  messages: [],
  input: '',
  runStatus: 'idle',
  activeRequestId: undefined,
  activeAssistantMessageId: undefined,
  activeTurn: null,
  retryableTurn: null,
}
