import type {
  NyxChatDocumentRef,
  NyxChatError,
  NyxChatImageRef,
  NyxChatInputMessage,
  NyxChatMessage,
  NyxChatTargetAttribution,
  NyxChatTargetSelection,
  NyxChatTurnUserMessage,
} from '../../../shared/chat/types'
import type {
  NyxCurrentThreadResetError,
  NyxCurrentThreadSnapshot,
  NyxCurrentThreadSnapshotError,
} from '../../../shared/chat/snapshot'
import type { ChatDocumentDraft, ChatImageDraft, ChatState } from './chat-types'
import { initialChatState } from './chat-types'

type ChatAction =
  | {
      type: 'current-thread-hydrated'
      generation: number
      snapshot: NyxCurrentThreadSnapshot | null
    }
  | {
      type: 'current-thread-hydration-failed'
      generation: number
      error: NyxCurrentThreadSnapshotError
    }
  | {
      type: 'set-input'
      value: string
    }
  | {
      type: 'draft-images-added'
      images: ReadonlyArray<ChatImageDraft>
    }
  | {
      type: 'draft-image-preparing'
      imageId: string
    }
  | {
      type: 'draft-image-ready'
      imageId: string
      image: Omit<NyxChatImageRef, 'imageId'>
      canonicalBytes: Uint8Array
      previewBytes: Uint8Array
      previewUrl: string
    }
  | {
      type: 'draft-image-failed'
      imageId: string
      error: string
    }
  | {
      type: 'draft-image-removed'
      imageId: string
    }
  | {
      type: 'draft-documents-added'
      documents: ReadonlyArray<ChatDocumentDraft>
    }
  | {
      type: 'draft-document-preparing'
      documentId: string
    }
  | {
      type: 'draft-document-ready'
      documentId: string
      document: Omit<NyxChatDocumentRef, 'documentId'>
      sourceBytes: Uint8Array
      extractedTextBytes: Uint8Array
      extractedFromSha256: string
    }
  | {
      type: 'draft-document-failed'
      documentId: string
      error: string
    }
  | {
      type: 'draft-document-removed'
      documentId: string
    }
  | {
      type: 'composer-notice-changed'
      notice: string | null
    }
  | {
      type: 'target-context-ready'
      generation: number
      catalogEpoch: number
      selection: NyxChatTargetSelection | null
      available: boolean
    }
  | {
      type: 'target-catalog-updated'
      generation: number
      catalogEpoch: number
      available: boolean
    }
  | {
      type: 'target-catalog-unready'
      catalogEpoch: number
    }
  | {
      type: 'target-draft-changed'
      selection: NyxChatTargetSelection
      available: boolean
    }
  | {
      type: 'request-submitted'
      requestId: string
      assistantMessageId: string
      turnUserMessage: NyxChatTurnUserMessage
      submittedMessages: ReadonlyArray<NyxChatInputMessage>
      userMessage: NyxChatMessage
      assistantMessage: NyxChatMessage
      targetSelection: NyxChatTargetSelection
    }
  | {
      type: 'request-accepted'
      requestId: string
      assistantMessageId: string
    }
  | {
      type: 'request-started'
      requestId: string
      assistantMessageId: string
      targetAttribution: NyxChatTargetAttribution
    }
  | {
      type: 'request-delta'
      requestId: string
      assistantMessageId: string
      snapshot: string
    }
  | {
      type: 'request-completed'
      requestId: string
      assistantMessageId: string
      status: 'completed' | 'cancelled'
      finalContent: string
    }
  | {
      type: 'request-failed'
      requestId: string
      assistantMessageId: string
      error: NyxChatError
      targetAttribution?: NyxChatTargetAttribution
    }
  | {
      type: 'retry-requested'
      requestId: string
      userMessageId: string
      assistantMessageId: string
      turnUserMessage: NyxChatTurnUserMessage
      submittedMessages: ReadonlyArray<NyxChatInputMessage>
      targetSelection: NyxChatTargetSelection
    }
  | {
      type: 'reset-started'
      generation: number
      minimumCatalogEpoch: number
    }
  | {
      type: 'reset-failed'
      generation: number
      error: NyxCurrentThreadResetError
      restoreTargetInitialized: boolean
      restoreTargetAvailable: boolean
      restoreMinimumCatalogEpoch: number
    }
  | {
      type: 'clear-chat'
      generation: number
      minimumCatalogEpoch: number
    }

function updateMessage(
  messages: ReadonlyArray<NyxChatMessage>,
  messageId: string,
  updater: (message: NyxChatMessage) => NyxChatMessage,
) {
  return messages.map((message) => {
    if (message.id !== messageId) {
      return message
    }

    return updater(message)
  })
}

function isActiveAssistantTurn(state: ChatState, requestId: string, assistantMessageId: string) {
  return (
    state.activeRequestId === requestId && state.activeAssistantMessageId === assistantMessageId
  )
}

function isAcceptedAssistantTurn(state: ChatState, requestId: string, assistantMessageId: string) {
  return (
    isActiveAssistantTurn(state, requestId, assistantMessageId) &&
    state.activeTurn?.accepted === true
  )
}

function isComposerLocked(state: ChatState) {
  return state.activeTurn !== null && !state.activeTurn.accepted
}

function terminalRunStatus(messages: ReadonlyArray<NyxChatMessage>) {
  const status = [...messages].reverse().find((message) => message.role === 'assistant')?.status

  return status === 'failed' || status === 'cancelled'
    ? status
    : messages.length > 0
      ? 'completed'
      : 'idle'
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'current-thread-hydrated': {
      if (action.generation !== state.projectionGeneration) {
        return state
      }

      const readyState = {
        ...initialChatState,
        hydrationStatus: 'ready',
        projectionGeneration: action.generation,
      } as const satisfies ChatState

      if (!action.snapshot) {
        return readyState
      }

      return {
        ...readyState,
        messages: action.snapshot.messages.map((message) => ({
          ...message,
          ...(message.images ? { images: message.images.map((image) => ({ ...image })) } : {}),
          ...(message.documents
            ? { documents: message.documents.map((document) => ({ ...document })) }
            : {}),
          ...(message.error ? { error: { ...message.error } } : {}),
          ...(message.targetAttribution
            ? { targetAttribution: { ...message.targetAttribution } }
            : {}),
        })),
        runStatus: action.snapshot.runStatus,
        retryableTurn: action.snapshot.retryableTurn
          ? {
              ...action.snapshot.retryableTurn,
              turnUserMessage: {
                ...action.snapshot.retryableTurn.turnUserMessage,
                ...(action.snapshot.retryableTurn.turnUserMessage.imageRefs
                  ? {
                      imageRefs: action.snapshot.retryableTurn.turnUserMessage.imageRefs.map(
                        (imageRef) => ({ ...imageRef }),
                      ),
                    }
                  : {}),
                ...(action.snapshot.retryableTurn.turnUserMessage.documentRefs
                  ? {
                      documentRefs: action.snapshot.retryableTurn.turnUserMessage.documentRefs.map(
                        (documentRef) => ({ ...documentRef }),
                      ),
                    }
                  : {}),
              },
              submittedMessages: action.snapshot.retryableTurn.submittedMessages.map((message) => ({
                ...message,
              })),
            }
          : null,
        committedTarget: action.snapshot.selectedTarget
          ? { ...action.snapshot.selectedTarget }
          : null,
      }
    }

    case 'current-thread-hydration-failed':
      if (action.generation !== state.projectionGeneration) {
        return state
      }

      return {
        ...initialChatState,
        hydrationStatus: 'error',
        hydrationError: { ...action.error },
      }

    case 'set-input':
      if (isComposerLocked(state)) {
        return state
      }

      return {
        ...state,
        input: action.value,
      }

    case 'draft-images-added':
      if (isComposerLocked(state)) {
        return state
      }

      return {
        ...state,
        draftImages: [...state.draftImages, ...action.images],
        composerError: null,
      }

    case 'draft-image-preparing':
      if (isComposerLocked(state)) {
        return state
      }

      return {
        ...state,
        draftImages: state.draftImages.map((image) =>
          image.id === action.imageId && image.status === 'failed'
            ? {
                id: image.id,
                name: image.name,
                status: 'preparing',
                source: image.source,
              }
            : image,
        ),
        composerError: null,
      }

    case 'draft-image-ready':
      return {
        ...state,
        draftImages: state.draftImages.map((image) =>
          image.id === action.imageId && image.status === 'preparing'
            ? {
                id: image.id,
                name: image.name,
                status: 'ready',
                source: null,
                image: action.image,
                canonicalBytes: action.canonicalBytes,
                previewBytes: action.previewBytes,
                previewUrl: action.previewUrl,
              }
            : image,
        ),
      }

    case 'draft-image-failed':
      return {
        ...state,
        draftImages: state.draftImages.map((image) =>
          image.id === action.imageId && image.status === 'preparing'
            ? {
                id: image.id,
                name: image.name,
                status: 'failed',
                source: image.source,
                error: action.error,
              }
            : image,
        ),
        composerNotice: action.error,
      }

    case 'draft-image-removed':
      if (isComposerLocked(state)) {
        return state
      }

      return {
        ...state,
        draftImages: state.draftImages.filter((image) => image.id !== action.imageId),
        composerError: null,
      }

    case 'draft-documents-added':
      if (isComposerLocked(state)) {
        return state
      }

      return {
        ...state,
        draftDocuments: [...state.draftDocuments, ...action.documents],
        composerError: null,
      }

    case 'draft-document-preparing':
      if (isComposerLocked(state)) {
        return state
      }

      return {
        ...state,
        draftDocuments: state.draftDocuments.map((document) =>
          document.id === action.documentId && document.status === 'failed'
            ? {
                id: document.id,
                name: document.name,
                mediaType: document.mediaType,
                status: 'preparing',
                source: document.source,
              }
            : document,
        ),
        composerError: null,
      }

    case 'draft-document-ready':
      return {
        ...state,
        draftDocuments: state.draftDocuments.map((document) =>
          document.id === action.documentId && document.status === 'preparing'
            ? {
                id: document.id,
                name: document.name,
                mediaType: document.mediaType,
                status: 'ready',
                source: null,
                document: action.document,
                sourceBytes: action.sourceBytes,
                extractedTextBytes: action.extractedTextBytes,
                extractedFromSha256: action.extractedFromSha256,
              }
            : document,
        ),
      }

    case 'draft-document-failed':
      return {
        ...state,
        draftDocuments: state.draftDocuments.map((document) =>
          document.id === action.documentId && document.status === 'preparing'
            ? {
                id: document.id,
                name: document.name,
                mediaType: document.mediaType,
                status: 'failed',
                source: document.source,
                error: action.error,
              }
            : document,
        ),
        composerNotice: action.error,
      }

    case 'draft-document-removed':
      if (isComposerLocked(state)) {
        return state
      }

      return {
        ...state,
        draftDocuments: state.draftDocuments.filter(
          (document) => document.id !== action.documentId,
        ),
        composerError: null,
      }

    case 'composer-notice-changed':
      return {
        ...state,
        composerNotice: action.notice,
      }

    case 'target-context-ready':
      if (
        action.generation !== state.projectionGeneration ||
        state.targetInitialized ||
        action.catalogEpoch < state.targetMinimumCatalogEpoch
      ) {
        return state
      }

      return {
        ...state,
        targetDraft: action.selection ? { ...action.selection } : null,
        targetInitialized: true,
        targetAvailable: action.available,
        targetCatalogEpoch: action.catalogEpoch,
      }

    case 'target-catalog-updated':
      if (
        action.generation !== state.projectionGeneration ||
        !state.targetInitialized ||
        action.catalogEpoch < state.targetCatalogEpoch
      ) {
        return state
      }

      return {
        ...state,
        targetAvailable: action.available,
        targetCatalogEpoch: action.catalogEpoch,
      }

    case 'target-catalog-unready':
      if (action.catalogEpoch < state.targetCatalogEpoch || !state.targetAvailable) {
        return state
      }

      return {
        ...state,
        targetAvailable: false,
      }

    case 'target-draft-changed':
      if (
        !state.targetInitialized ||
        state.resetStatus === 'resetting' ||
        isComposerLocked(state)
      ) {
        return state
      }

      return {
        ...state,
        targetDraft: { ...action.selection },
        targetAvailable: action.available,
      }

    case 'request-submitted':
      return {
        ...state,
        runStatus: 'submitting',
        activeRequestId: action.requestId,
        activeAssistantMessageId: action.assistantMessageId,
        activeTurn: {
          requestId: action.requestId,
          userMessageId: action.userMessage.id,
          assistantMessageId: action.assistantMessageId,
          turnIntent: 'new_user_message',
          accepted: false,
          turnUserMessage: action.turnUserMessage,
          submittedMessages: action.submittedMessages,
          targetSelection: action.targetSelection,
          capturedInput: state.input,
          capturedDraftImageIds: state.draftImages.map((image) => image.id),
          capturedDraftDocumentIds: state.draftDocuments.map((document) => document.id),
          userMessage: action.userMessage,
          assistantMessage: action.assistantMessage,
        },
        composerError: null,
      }

    case 'request-accepted': {
      if (!isActiveAssistantTurn(state, action.requestId, action.assistantMessageId)) {
        return state
      }

      const activeTurn = state.activeTurn

      if (!activeTurn || activeTurn.accepted) {
        return state
      }

      if (activeTurn.turnIntent === 'retry_failed_response') {
        return {
          ...state,
          activeTurn: { ...activeTurn, accepted: true },
          committedTarget: { ...activeTurn.targetSelection },
          retryableTurn: null,
          composerError: null,
          messages: updateMessage(state.messages, activeTurn.assistantMessageId, (message) => ({
            ...(() => {
              const { error: _error, targetAttribution: _targetAttribution, ...rest } = message
              return rest
            })(),
            content: '',
            status: 'pending',
            canRetry: false,
          })),
        }
      }

      if (!activeTurn.userMessage || !activeTurn.assistantMessage) {
        return state
      }

      const capturedImageIds = new Set(activeTurn.capturedDraftImageIds)
      const capturedDocumentIds = new Set(activeTurn.capturedDraftDocumentIds)

      return {
        ...state,
        input: state.input === activeTurn.capturedInput ? '' : state.input,
        draftImages: state.draftImages.filter((image) => !capturedImageIds.has(image.id)),
        draftDocuments: state.draftDocuments.filter(
          (document) => !capturedDocumentIds.has(document.id),
        ),
        activeTurn: { ...activeTurn, accepted: true },
        committedTarget: { ...activeTurn.targetSelection },
        retryableTurn: null,
        composerError: null,
        composerNotice: null,
        messages: [...state.messages, activeTurn.userMessage, activeTurn.assistantMessage],
      }
    }

    case 'request-started':
      if (!isAcceptedAssistantTurn(state, action.requestId, action.assistantMessageId)) {
        return state
      }

      return {
        ...state,
        runStatus: 'streaming',
        messages: updateMessage(state.messages, action.assistantMessageId, (message) => ({
          ...message,
          status: 'streaming',
          targetAttribution: { ...action.targetAttribution },
        })),
      }

    case 'request-delta':
      if (!isAcceptedAssistantTurn(state, action.requestId, action.assistantMessageId)) {
        return state
      }

      return {
        ...state,
        runStatus: 'streaming',
        messages: updateMessage(state.messages, action.assistantMessageId, (message) => ({
          ...message,
          content: action.snapshot,
          status: 'streaming',
        })),
      }

    case 'request-completed':
      if (!isAcceptedAssistantTurn(state, action.requestId, action.assistantMessageId)) {
        return state
      }

      return {
        ...state,
        runStatus: action.status,
        activeRequestId: undefined,
        activeAssistantMessageId: undefined,
        activeTurn: null,
        retryableTurn: null,
        messages: updateMessage(state.messages, action.assistantMessageId, (message) => ({
          ...(() => {
            const { error: _error, ...rest } = message
            return rest
          })(),
          content: action.finalContent,
          status: action.status === 'cancelled' ? 'cancelled' : 'completed',
          canRetry: false,
        })),
      }

    case 'request-failed':
      if (!isActiveAssistantTurn(state, action.requestId, action.assistantMessageId)) {
        return state
      }

      if (!state.activeTurn?.accepted) {
        return {
          ...state,
          runStatus: terminalRunStatus(state.messages),
          activeRequestId: undefined,
          activeAssistantMessageId: undefined,
          activeTurn: null,
          composerError: { ...action.error },
        }
      }

      return {
        ...state,
        runStatus: 'failed',
        activeRequestId: undefined,
        activeAssistantMessageId: undefined,
        activeTurn: null,
        composerError: null,
        retryableTurn:
          action.error.retryable && state.activeTurn
            ? {
                userMessageId: state.activeTurn.userMessageId,
                assistantMessageId: state.activeTurn.assistantMessageId,
                turnUserMessage: state.activeTurn.turnUserMessage,
                submittedMessages: state.activeTurn.submittedMessages,
              }
            : null,
        messages: updateMessage(state.messages, action.assistantMessageId, (message) => ({
          ...message,
          status: 'failed',
          error: action.error,
          canRetry: action.error.retryable,
          ...(action.targetAttribution
            ? { targetAttribution: { ...action.targetAttribution } }
            : {}),
        })),
      }

    case 'retry-requested':
      return {
        ...state,
        runStatus: 'submitting',
        activeRequestId: action.requestId,
        activeAssistantMessageId: action.assistantMessageId,
        activeTurn: {
          requestId: action.requestId,
          userMessageId: action.userMessageId,
          assistantMessageId: action.assistantMessageId,
          turnIntent: 'retry_failed_response',
          accepted: false,
          turnUserMessage: action.turnUserMessage,
          submittedMessages: action.submittedMessages,
          targetSelection: action.targetSelection,
          capturedInput: '',
          capturedDraftImageIds: [],
          capturedDraftDocumentIds: [],
        },
        composerError: null,
      }

    case 'reset-started':
      return {
        ...state,
        activeRequestId: undefined,
        activeAssistantMessageId: undefined,
        activeTurn: null,
        retryableTurn: null,
        projectionGeneration: action.generation,
        resetStatus: 'resetting',
        resetError: null,
        targetInitialized: false,
        targetAvailable: false,
        targetMinimumCatalogEpoch: action.minimumCatalogEpoch,
      }

    case 'reset-failed':
      if (action.generation !== state.projectionGeneration) {
        return state
      }

      return {
        ...state,
        runStatus: 'failed',
        activeRequestId: undefined,
        activeAssistantMessageId: undefined,
        activeTurn: null,
        retryableTurn: null,
        hydrationStatus: 'error',
        resetStatus: 'idle',
        resetError: { ...action.error },
        targetInitialized: action.restoreTargetInitialized,
        targetAvailable: action.restoreTargetAvailable,
        targetMinimumCatalogEpoch: action.restoreMinimumCatalogEpoch,
      }

    case 'clear-chat':
      if (action.generation !== state.projectionGeneration) {
        return state
      }

      return {
        ...initialChatState,
        hydrationStatus: 'ready',
        projectionGeneration: action.generation,
        targetMinimumCatalogEpoch: action.minimumCatalogEpoch,
      }
  }
}
