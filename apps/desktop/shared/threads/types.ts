import type {
  NyxChatDocumentRef,
  NyxChatImageRef,
  NyxChatMessage,
  NyxChatNewDocument,
  NyxChatNewImage,
  NyxChatRunStatus,
  NyxChatTargetSelection,
  NyxChatTurnIntent,
} from '../chat/types'

export type NyxThreadLocation = 'available' | 'archived' | 'trash'

export interface NyxThreadClock {
  eventEpoch: string
  includedThroughCursor: number
}

export interface NyxThreadRunCapacity {
  activeRuns: number
  attachmentRunActive: boolean
}

export interface NyxThreadSafeError {
  code: 'invalid_request' | 'not_found' | 'conflict' | 'library_unavailable' | 'thread_unavailable'
  message: string
}

export type NyxThreadResult<Value> =
  | { ok: true; value: Value }
  | { ok: false; error: NyxThreadSafeError }

export interface NyxThreadAvailableSummary {
  availability: 'available'
  id: string
  location: NyxThreadLocation
  pinPosition: number | null
  title: string
  threadRevision: number
  resultRevision: number
  seenResultRevision: number
  lastUserActivityAt: string
  createdAt: string
  updatedAt: string
  activity?: NyxThreadActivity
}

export type NyxThreadActivity =
  | { status: 'idle' }
  | {
      status: 'submitting' | 'streaming'
      requestId: string
      attachmentBearing: boolean
    }
  | { status: 'saving_failed'; requestId: string }

export interface NyxThreadUnavailableSummary {
  availability: 'unavailable'
  id: string
  location: NyxThreadLocation
  pinPosition: number | null
  title: "Couldn't open this thread"
  unavailable: NyxThreadSafeError
}

export type NyxThreadSummary = NyxThreadAvailableSummary | NyxThreadUnavailableSummary

export interface NyxThreadDraftImage extends NyxChatImageRef {
  available: boolean
}

export interface NyxThreadDraftDocument extends NyxChatDocumentRef {
  available: boolean
}

export interface NyxThreadDraft {
  revision: number
  text: string
  targetSelection: NyxChatTargetSelection
  images: ReadonlyArray<NyxThreadDraftImage>
  documents: ReadonlyArray<NyxThreadDraftDocument>
}

export interface NyxThreadRetryableTurn {
  turnOrdinal: number
  expectedAttemptRequestId: string
  expectedDraftRevision: number
  userMessageId: string
  assistantMessageId: string
}

export interface NyxThreadSettlementFailure {
  requestId: string
  assistantMessageId: string
}

export interface NyxThreadActiveRun {
  requestId: string
  assistantMessageId: string
  turnIntent: NyxChatTurnIntent
  attachmentBearing?: boolean
}

export interface NyxThreadDetail {
  summary: NyxThreadAvailableSummary
  draft: NyxThreadDraft
  messages: ReadonlyArray<NyxChatMessage>
  runStatus: NyxChatRunStatus
  activeRun: NyxThreadActiveRun | null
  retryableTurn: NyxThreadRetryableTurn | null
  settlementFailure: NyxThreadSettlementFailure | null
}

export interface NyxThreadListPageInput {
  location: NyxThreadLocation
  cursor?: string | null
  limit: 50
}

export interface NyxThreadListPage extends NyxThreadClock {
  rows: ReadonlyArray<NyxThreadSummary>
  nextCursor: string | null
  capacity: NyxThreadRunCapacity
}

export interface NyxThreadGetInput {
  threadId: string | null
}

export interface NyxThreadSnapshot extends NyxThreadClock {
  detail: NyxThreadDetail | null
}

export interface NyxThreadMaterializeInput {
  text: string
  targetSelection: NyxChatTargetSelection
  images: ReadonlyArray<NyxThreadDraftImageInput>
  documents: ReadonlyArray<NyxThreadDraftDocumentInput>
  newImages?: ReadonlyArray<NyxChatNewImage>
  newDocuments?: ReadonlyArray<NyxChatNewDocument>
}

export interface NyxThreadMaterializeResult extends NyxThreadClock {
  detail: NyxThreadDetail
}

export interface NyxThreadDraftImageInput extends NyxChatImageRef {
  position: number
}

export interface NyxThreadDraftDocumentInput extends NyxChatDocumentRef {
  position: number
}

export interface NyxThreadSaveDraftInput {
  threadId: string
  expectedDraftRevision: number
  discardEmptyShell?: boolean
  text: string
  targetSelection: NyxChatTargetSelection
  images: ReadonlyArray<NyxThreadDraftImageInput>
  documents: ReadonlyArray<NyxThreadDraftDocumentInput>
  newImages?: ReadonlyArray<NyxChatNewImage>
  newDocuments?: ReadonlyArray<NyxChatNewDocument>
}

export interface NyxThreadSaveDraftResult extends NyxThreadClock {
  detail: NyxThreadDetail | null
  discarded: boolean
}

export type NyxThreadRetryOpenInput = { scope: 'library' } | { scope: 'thread'; threadId: string }

export interface NyxThreadMarkSeenInput {
  threadId: string
  observedResultRevision: number
}

export interface NyxThreadMarkSeenResult extends NyxThreadClock {
  detail: NyxThreadDetail
}

export type NyxThreadPinAction =
  | 'pin'
  | 'unpin'
  | 'move_up'
  | 'move_down'
  | 'move_top'
  | 'move_bottom'

export interface NyxThreadUpdatePinInput {
  threadId: string
  action: NyxThreadPinAction
  expectedPinPosition: number | null
}

export interface NyxThreadUpdatePinResult extends NyxThreadClock {
  detail: NyxThreadDetail
}

export interface NyxThreadRenameInput {
  threadId: string
  title: string
  expectedThreadRevision: number
}

export interface NyxThreadRenameResult extends NyxThreadClock {
  detail: NyxThreadDetail
}

export type NyxThreadLocationAction = 'archive' | 'unarchive'

export interface NyxThreadUpdateLocationInput {
  threadId: string
  action: NyxThreadLocationAction
  expectedThreadRevision: number
}

export interface NyxThreadUpdateLocationResult extends NyxThreadClock {
  detail: NyxThreadDetail
}
