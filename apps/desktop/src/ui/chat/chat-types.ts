import type {
  NyxChatInputMessage,
  NyxChatMessage,
  NyxChatRunStatus,
} from '../../../shared/chat/types'

export interface NyxChatState {
  messages: NyxChatMessage[]
  input: string
  runStatus: NyxChatRunStatus
  activeRequestId: string | undefined
  activeAssistantMessageId: string | undefined
  lastSubmittedMessages: ReadonlyArray<NyxChatInputMessage> | null
  lastAssistantMessageId: string | undefined
}

export const initialNyxChatState: NyxChatState = {
  messages: [],
  input: '',
  runStatus: 'idle',
  activeRequestId: undefined,
  activeAssistantMessageId: undefined,
  lastSubmittedMessages: null,
  lastAssistantMessageId: undefined,
}
