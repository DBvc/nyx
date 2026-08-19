import type {
  NyxChatError,
  NyxChatRunStatus,
  NyxChatTargetAttribution,
  NyxChatTurnIntent,
} from './types'
import type { NyxThreadRunCapacity } from '../threads/types'

export const nyxChatEventTypes = [
  'chat:capacity',
  'chat:accepted',
  'chat:start',
  'chat:delta',
  'chat:done',
  'chat:error',
] as const

export type NyxChatEventType = (typeof nyxChatEventTypes)[number]

interface NyxChatEventClock {
  eventEpoch: string
  cursor: number
}

interface NyxChatEventBase extends NyxChatEventClock {
  threadId: string
  requestId: string
}

export interface NyxChatCapacityEvent extends NyxChatEventClock, NyxThreadRunCapacity {
  type: 'chat:capacity'
}

export interface NyxChatAcceptedEvent extends NyxChatEventBase {
  type: 'chat:accepted'
  userMessageId: string
  assistantMessageId: string
  turnIntent: NyxChatTurnIntent
  attachmentBearing: boolean
}

export interface NyxChatStartEvent extends NyxChatEventBase {
  type: 'chat:start'
  assistantMessageId: string
  status: Extract<NyxChatRunStatus, 'streaming'>
  targetAttribution: NyxChatTargetAttribution
}

export interface NyxChatDeltaEvent extends NyxChatEventBase {
  type: 'chat:delta'
  assistantMessageId: string
  delta: string
  snapshot: string
}

export interface NyxChatDoneEvent extends NyxChatEventBase {
  type: 'chat:done'
  assistantMessageId: string
  status: Extract<NyxChatRunStatus, 'completed' | 'cancelled'>
  finalContent: string
}

export interface NyxChatErrorEvent extends NyxChatEventBase {
  type: 'chat:error'
  assistantMessageId?: string
  status: Extract<NyxChatRunStatus, 'failed'>
  error: NyxChatError
  targetAttribution?: NyxChatTargetAttribution
}

export type NyxChatEvent =
  | NyxChatCapacityEvent
  | NyxChatAcceptedEvent
  | NyxChatStartEvent
  | NyxChatDeltaEvent
  | NyxChatDoneEvent
  | NyxChatErrorEvent

export type NyxChatEventListener = (event: NyxChatEvent) => void
