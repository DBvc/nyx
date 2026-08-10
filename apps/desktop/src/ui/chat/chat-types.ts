import type {
  NyxChatError,
  NyxChatDocumentMediaType,
  NyxChatDocumentRef,
  NyxChatInputMessage,
  NyxChatImageRef,
  NyxChatMessage,
  NyxChatRunStatus,
  NyxChatTargetSelection,
  NyxChatTurnIntent,
  NyxChatTurnUserMessage,
} from '../../../shared/chat/types'
import type {
  NyxCurrentThreadResetError,
  NyxCurrentThreadSnapshotError,
} from '../../../shared/chat/snapshot'

export type ChatHydrationStatus = 'loading' | 'ready' | 'error'
export type ChatResetStatus = 'idle' | 'resetting'

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
      canonicalBytes: Uint8Array
      previewBytes: Uint8Array
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
      sourceBytes: Uint8Array
      extractedTextBytes: Uint8Array
      extractedFromSha256: string
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
  requestId: string
  userMessageId: string
  assistantMessageId: string
  turnIntent: NyxChatTurnIntent
  accepted: boolean
  turnUserMessage: NyxChatTurnUserMessage
  submittedMessages: ReadonlyArray<NyxChatInputMessage>
  targetSelection: NyxChatTargetSelection
  capturedInput: string
  capturedDraftImageIds: ReadonlyArray<string>
  capturedDraftDocumentIds: ReadonlyArray<string>
  userMessage?: NyxChatMessage
  assistantMessage?: NyxChatMessage
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
  draftImages: ChatImageDraft[]
  draftDocuments: ChatDocumentDraft[]
  composerNotice: string | null
  composerError: NyxChatError | null
  runStatus: NyxChatRunStatus
  activeRequestId: string | undefined
  activeAssistantMessageId: string | undefined
  activeTurn: ChatTurnRequest | null
  retryableTurn: RetryableChatTurn | null
  hydrationStatus: ChatHydrationStatus
  hydrationError: NyxCurrentThreadSnapshotError | null
  projectionGeneration: number
  resetStatus: ChatResetStatus
  resetError: NyxCurrentThreadResetError | null
  committedTarget: NyxChatTargetSelection | null
  targetDraft: NyxChatTargetSelection | null
  targetInitialized: boolean
  targetAvailable: boolean
  targetCatalogEpoch: number
  targetMinimumCatalogEpoch: number
}

export const initialChatState: ChatState = {
  messages: [],
  input: '',
  draftImages: [],
  draftDocuments: [],
  composerNotice: null,
  composerError: null,
  runStatus: 'idle',
  activeRequestId: undefined,
  activeAssistantMessageId: undefined,
  activeTurn: null,
  retryableTurn: null,
  hydrationStatus: 'loading',
  hydrationError: null,
  projectionGeneration: 0,
  resetStatus: 'idle',
  resetError: null,
  committedTarget: null,
  targetDraft: null,
  targetInitialized: false,
  targetAvailable: false,
  targetCatalogEpoch: 0,
  targetMinimumCatalogEpoch: 0,
}
