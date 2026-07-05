import type {
  NyxChatInputMessage,
  NyxChatMessage,
  NyxChatRunStatus,
  NyxChatTurnUserMessage,
} from '../../../shared/chat/types'

export interface ChatTurnRequest {
  requestId: string
  userMessageId: string
  assistantMessageId: string
  turnUserMessage: NyxChatTurnUserMessage
  submittedMessages: ReadonlyArray<NyxChatInputMessage>
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
}

export const initialChatState: ChatState = {
  messages: [],
  input: '',
  runStatus: 'idle',
  activeRequestId: undefined,
  activeAssistantMessageId: undefined,
  activeTurn: null,
  retryableTurn: null,
}
