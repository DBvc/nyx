import type {
  NyxChatError,
  NyxChatRunStatus,
  NyxChatTargetAttribution,
  NyxChatTurnIntent,
} from './types'

export const nyxChatEventTypes = [
  'chat:accepted',
  'chat:start',
  'chat:delta',
  'chat:done',
  'chat:error',
] as const

export type NyxChatEventType = (typeof nyxChatEventTypes)[number]

interface NyxChatEventBase {
  requestId: string
  assistantMessageId: string
}

export interface NyxChatAcceptedEvent extends NyxChatEventBase {
  type: 'chat:accepted'
  userMessageId: string
  turnIntent: NyxChatTurnIntent
}

export interface NyxChatStartEvent extends NyxChatEventBase {
  type: 'chat:start'
  status: Extract<NyxChatRunStatus, 'streaming'>
  targetAttribution: NyxChatTargetAttribution
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
  targetAttribution?: NyxChatTargetAttribution
}

export type NyxChatEvent =
  | NyxChatAcceptedEvent
  | NyxChatStartEvent
  | NyxChatDeltaEvent
  | NyxChatDoneEvent
  | NyxChatErrorEvent

export type NyxChatEventListener = (event: NyxChatEvent) => void
