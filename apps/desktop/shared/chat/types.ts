export const nyxChatRoles = ['system', 'user', 'assistant'] as const

export type NyxChatRole = (typeof nyxChatRoles)[number]

export const nyxChatMessageStatuses = [
  'pending',
  'streaming',
  'completed',
  'cancelled',
  'failed',
] as const

export type NyxChatMessageStatus = (typeof nyxChatMessageStatuses)[number]

export const nyxChatRunStatuses = [
  'idle',
  'submitting',
  'streaming',
  'completed',
  'cancelled',
  'failed',
] as const

export type NyxChatRunStatus = (typeof nyxChatRunStatuses)[number]

export const nyxChatTurnIntents = ['new_user_message', 'retry_failed_response'] as const

export type NyxChatTurnIntent = (typeof nyxChatTurnIntents)[number]

const nyxChatTurnIntentSet = new Set<string>(nyxChatTurnIntents)

export function isNyxChatTurnIntent(value: unknown): value is NyxChatTurnIntent {
  return typeof value === 'string' && nyxChatTurnIntentSet.has(value)
}

export const nyxChatErrorCodes = [
  'config_missing',
  'invalid_request',
  'auth_failed',
  'network_error',
  'rate_limited',
  'upstream_error',
  'cancelled',
  'unknown',
] as const

export type NyxChatErrorCode = (typeof nyxChatErrorCodes)[number]

export interface NyxChatError {
  code: NyxChatErrorCode
  message: string
  retryable: boolean
  details?: string
}

export interface NyxChatInputMessage {
  role: NyxChatRole
  content: string
}

export interface NyxChatTurnUserMessage {
  id: string
  content: string
}

export interface NyxChatMessage {
  id: string
  role: NyxChatRole
  content: string
  status: NyxChatMessageStatus
  error?: NyxChatError
  canRetry?: boolean
}

export interface NyxChatRequest {
  requestId: string
  userMessageId: string
  assistantMessageId: string
  turnIntent: NyxChatTurnIntent
  turnUserMessage: NyxChatTurnUserMessage
  messages: ReadonlyArray<NyxChatInputMessage>
  systemPrompt?: string
}

export interface NyxChatCancellationRequest {
  requestId: string
}
