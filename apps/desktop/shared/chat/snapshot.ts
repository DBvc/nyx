import type {
  NyxChatError,
  NyxChatInputMessage,
  NyxChatMessage,
  NyxChatRunStatus,
  NyxChatTargetSelection,
  NyxChatTurnUserMessage,
} from './types'

export type NyxCurrentThreadMessage = Omit<NyxChatMessage, 'error'> & {
  error?: Omit<NyxChatError, 'details'>
}

export interface NyxCurrentThreadRetryableTurn {
  userMessageId: string
  assistantMessageId: string
  turnUserMessage: NyxChatTurnUserMessage
  submittedMessages: ReadonlyArray<NyxChatInputMessage>
}

export interface NyxCurrentThreadSnapshot {
  messages: ReadonlyArray<NyxCurrentThreadMessage>
  runStatus: Extract<NyxChatRunStatus, 'completed' | 'cancelled' | 'failed'>
  retryableTurn: NyxCurrentThreadRetryableTurn | null
  selectedTarget: NyxChatTargetSelection | null
}

export interface NyxCurrentThreadSnapshotError {
  code: 'load_failed'
  message: 'Nyx could not load the current thread.'
}

export type NyxCurrentThreadSnapshotResult =
  | {
      ok: true
      value: NyxCurrentThreadSnapshot | null
    }
  | {
      ok: false
      error: NyxCurrentThreadSnapshotError
    }

export interface NyxCurrentThreadResetError {
  code: 'reset_failed'
  message: 'Nyx could not start a fresh thread.'
}

export type NyxCurrentThreadResetResult =
  | {
      ok: true
    }
  | {
      ok: false
      error: NyxCurrentThreadResetError
    }
