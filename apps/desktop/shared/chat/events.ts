import type { NyxChatError, NyxChatRunStatus } from './types'

export const nyxChatEventTypes = ['chat:start', 'chat:delta', 'chat:done', 'chat:error'] as const

export type NyxChatEventType = (typeof nyxChatEventTypes)[number]

interface NyxChatEventBase {
  requestId: string
  assistantMessageId: string
}

export interface NyxChatStartEvent extends NyxChatEventBase {
  type: 'chat:start'
  status: Extract<NyxChatRunStatus, 'streaming'>
}

export interface NyxChatDeltaEvent extends NyxChatEventBase {
  type: 'chat:delta'
  delta: string
  snapshot: string
}

export interface NyxChatDoneEvent extends NyxChatEventBase {
  type: 'chat:done'
  status: Extract<NyxChatRunStatus, 'completed' | 'cancelled'>
  finalContent: string
}

export interface NyxChatErrorEvent extends NyxChatEventBase {
  type: 'chat:error'
  status: Extract<NyxChatRunStatus, 'failed'>
  error: NyxChatError
}

export type NyxChatEvent =
  | NyxChatStartEvent
  | NyxChatDeltaEvent
  | NyxChatDoneEvent
  | NyxChatErrorEvent

export type NyxChatEventListener = (event: NyxChatEvent) => void
