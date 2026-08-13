import type {
  NyxChatDocumentMediaType,
  NyxChatDocumentRef,
  NyxChatError,
  NyxChatImageRef,
  NyxChatMessage,
  NyxChatRunStatus,
  NyxChatTargetSelection,
  NyxChatTurnIntent,
} from '../../../shared/chat/types'
import type {
  NyxThreadRetryableTurn,
  NyxThreadSafeError,
  NyxThreadSettlementFailure,
  NyxThreadSummary,
} from '../../../shared/threads/types'

export type ChatHydrationStatus = 'loading' | 'ready' | 'error'
export type ChatSaveStatus = 'idle' | 'saving'

export type ChatImageDraft =
  | {
      id: string
      name: string
      status: 'preparing'
      source: Blob
    }
  | {
      id: string
      name: string
      status: 'ready'
      source: null
      image: Omit<NyxChatImageRef, 'imageId'>
      canonicalBytes?: Uint8Array
      previewBytes?: Uint8Array
      previewUrl: string
    }
  | {
      id: string
      name: string
      status: 'failed'
      source: Blob
      error: string
    }

export type ChatDocumentDraft =
  | {
      id: string
      name: string
      mediaType: NyxChatDocumentMediaType
      status: 'preparing'
      source: File
    }
  | {
      id: string
      name: string
      mediaType: NyxChatDocumentMediaType
      status: 'ready'
      source: null
      document: Omit<NyxChatDocumentRef, 'documentId'>
      sourceBytes?: Uint8Array
      extractedTextBytes?: Uint8Array
      extractedFromSha256?: string
    }
  | {
      id: string
      name: string
      mediaType: NyxChatDocumentMediaType
      status: 'failed'
      source: File
      error: string
    }

export interface ChatTurnRequest {
  threadId: string
  requestId: string
  turnIntent: NyxChatTurnIntent
  accepted: boolean
  expectedDraftRevision: number
  turnOrdinal?: number
  expectedAttemptRequestId?: string
  capturedInput: string
  capturedDraftImageIds: ReadonlyArray<string>
  capturedDraftDocumentIds: ReadonlyArray<string>
  userMessageId?: string
  assistantMessageId?: string
}

export interface ChatState {
  selectedThreadId: string | null
  threadSummary: NyxThreadSummary | null
  messages: NyxChatMessage[]
  input: string
  draftImages: ChatImageDraft[]
  draftDocuments: ChatDocumentDraft[]
  draftRevision: number
  draftEditVersion: number
  savedEditVersion: number
  composerNotice: string | null
  composerError: NyxChatError | null
  runStatus: NyxChatRunStatus
  activeRequestId: string | undefined
  activeAssistantMessageId: string | undefined
  activeTurn: ChatTurnRequest | null
  retryableTurn: NyxThreadRetryableTurn | null
  settlementFailure: NyxThreadSettlementFailure | null
  hydrationStatus: ChatHydrationStatus
  hydrationError: NyxThreadSafeError | null
  hydrationErrorThreadId: string | null
  hydrationRetrying: boolean
  newThreadPending: boolean
  projectionGeneration: number
  saveStatus: ChatSaveStatus
  eventEpoch: string | null
  listCursor: number
  detailCursor: number
  committedTarget: NyxChatTargetSelection | null
  targetDraft: NyxChatTargetSelection | null
  targetInitialized: boolean
  targetAvailable: boolean
  targetCatalogEpoch: number
  targetMinimumCatalogEpoch: number
}

export const initialChatState: ChatState = {
  selectedThreadId: null,
  threadSummary: null,
  messages: [],
  input: '',
  draftImages: [],
  draftDocuments: [],
  draftRevision: 0,
  draftEditVersion: 0,
  savedEditVersion: 0,
  composerNotice: null,
  composerError: null,
  runStatus: 'idle',
  activeRequestId: undefined,
  activeAssistantMessageId: undefined,
  activeTurn: null,
  retryableTurn: null,
  settlementFailure: null,
  hydrationStatus: 'loading',
  hydrationError: null,
  hydrationErrorThreadId: null,
  hydrationRetrying: false,
  newThreadPending: false,
  projectionGeneration: 0,
  saveStatus: 'idle',
  eventEpoch: null,
  listCursor: 0,
  detailCursor: 0,
  committedTarget: null,
  targetDraft: null,
  targetInitialized: false,
  targetAvailable: false,
  targetCatalogEpoch: 0,
  targetMinimumCatalogEpoch: 0,
}
