import type {
  NyxChatDocumentRef,
  NyxChatError,
  NyxChatImageRef,
  NyxChatMessage,
  NyxChatTargetAttribution,
  NyxChatTargetSelection,
  NyxChatTurnIntent,
} from '../../../shared/chat/types'
import { buildNyxChatImageUrl } from '../../../shared/chat/image-url'
import type {
  NyxThreadDetail,
  NyxThreadSafeError,
  NyxThreadSummary,
} from '../../../shared/threads/types'
import type { ChatDocumentDraft, ChatImageDraft, ChatState } from './chat-types'
import { initialChatState } from './chat-types'

export type ChatAction =
  | {
      type: 'thread-library-hydrated'
      generation: number
      summary: NyxThreadSummary | null
      detail: NyxThreadDetail | null
      eventEpoch: string
      listCursor: number
      detailCursor: number
      preserveOverlay?: boolean
    }
  | {
      type: 'thread-library-hydration-failed'
      generation: number
      error: NyxThreadSafeError
      threadId?: string
    }
  | { type: 'thread-library-retry-started' }
  | { type: 'public-event-advanced'; cursor: number }
  | { type: 'new-thread-started' }
  | { type: 'new-thread-failed' }
  | { type: 'thread-unavailable'; threadId: string; error: NyxThreadSafeError; cursor: number }
  | {
      type: 'thread-detail-changed'
      detail: NyxThreadDetail
      cursor: number
      preserveOverlay: boolean
    }
  | { type: 'thread-summary-changed'; summary: NyxThreadSummary; cursor: number }
  | { type: 'set-input'; value: string }
  | { type: 'draft-images-added'; images: ReadonlyArray<ChatImageDraft> }
  | { type: 'draft-image-preparing'; imageId: string }
  | {
      type: 'draft-image-ready'
      imageId: string
      image: Omit<NyxChatImageRef, 'imageId'>
      canonicalBytes: Uint8Array
      previewBytes: Uint8Array
      previewUrl: string
    }
  | { type: 'draft-image-failed'; imageId: string; error: string }
  | { type: 'draft-image-removed'; imageId: string }
  | { type: 'draft-documents-added'; documents: ReadonlyArray<ChatDocumentDraft> }
  | { type: 'draft-document-preparing'; documentId: string }
  | {
      type: 'draft-document-ready'
      documentId: string
      document: Omit<NyxChatDocumentRef, 'documentId'>
      sourceBytes: Uint8Array
      extractedTextBytes: Uint8Array
      extractedFromSha256: string
    }
  | { type: 'draft-document-failed'; documentId: string; error: string }
  | { type: 'draft-document-removed'; documentId: string }
  | { type: 'composer-notice-changed'; notice: string | null }
  | {
      type: 'target-context-ready'
      generation: number
      catalogEpoch: number
      selection: NyxChatTargetSelection | null
      available: boolean
    }
  | { type: 'target-catalog-updated'; generation: number; catalogEpoch: number; available: boolean }
  | { type: 'target-catalog-unready'; catalogEpoch: number }
  | { type: 'target-draft-changed'; selection: NyxChatTargetSelection; available: boolean }
  | { type: 'save-started' }
  | { type: 'save-failed'; error: NyxChatError }
  | {
      type: 'thread-discarded'
      submittedVersion: number
      cursor: number
      eventEpoch: string
    }
  | { type: 'thread-materialized'; detail: NyxThreadDetail; cursor: number; eventEpoch: string }
  | {
      type: 'save-succeeded'
      detail: NyxThreadDetail
      submittedVersion: number
      cursor: number
      eventEpoch: string
    }
  | {
      type: 'request-submitted'
      threadId: string
      requestId: string
      turnIntent: NyxChatTurnIntent
      expectedDraftRevision: number
      turnOrdinal?: number
      expectedAttemptRequestId?: string
    }
  | {
      type: 'settlement-retry-submitted'
      threadId: string
      requestId: string
      assistantMessageId: string
      expectedDraftRevision: number
    }
  | {
      type: 'request-accepted'
      threadId: string
      requestId: string
      userMessageId: string
      assistantMessageId: string
      turnIntent: NyxChatTurnIntent
    }
  | {
      type: 'request-started'
      threadId: string
      requestId: string
      assistantMessageId: string
      targetAttribution: NyxChatTargetAttribution
    }
  | {
      type: 'request-delta'
      threadId: string
      requestId: string
      assistantMessageId: string
      snapshot: string
    }
  | {
      type: 'request-completed'
      threadId: string
      requestId: string
      assistantMessageId: string
      status: 'completed' | 'cancelled'
      finalContent: string
    }
  | {
      type: 'request-failed'
      threadId: string
      requestId: string
      assistantMessageId?: string
      error: NyxChatError
      targetAttribution?: NyxChatTargetAttribution
    }
  | { type: 'show-placeholder'; generation: number; minimumCatalogEpoch: number }

function cloneMessages(messages: ReadonlyArray<NyxChatMessage>) {
  return messages.map((message) => ({
    ...message,
    ...(message.images ? { images: message.images.map((image) => ({ ...image })) } : {}),
    ...(message.documents
      ? { documents: message.documents.map((document) => ({ ...document })) }
      : {}),
    ...(message.error ? { error: { ...message.error } } : {}),
    ...(message.targetAttribution ? { targetAttribution: { ...message.targetAttribution } } : {}),
  }))
}

function imageDrafts(detail: NyxThreadDetail): ChatImageDraft[] {
  return detail.draft.images.map((image, index) => ({
    id: image.imageId,
    name: `Image ${index + 1}`,
    status: 'ready',
    source: null,
    image: {
      mediaType: image.mediaType,
      width: image.width,
      height: image.height,
    },
    previewUrl: buildNyxChatImageUrl(image.imageId, 'preview'),
  }))
}

function documentDrafts(detail: NyxThreadDetail): ChatDocumentDraft[] {
  return detail.draft.documents.map((document) => ({
    id: document.documentId,
    name: document.name,
    mediaType: document.mediaType,
    status: 'ready',
    source: null,
    document: {
      name: document.name,
      mediaType: document.mediaType,
      byteLength: document.byteLength,
      extractedByteLength: document.extractedByteLength,
    },
  }))
}

function detailState(detail: NyxThreadDetail, state: ChatState) {
  return {
    selectedThreadId: detail.summary.id,
    threadSummary: { ...detail.summary },
    messages: cloneMessages(detail.messages),
    input: detail.draft.text,
    draftImages: imageDrafts(detail),
    draftDocuments: documentDrafts(detail),
    draftRevision: detail.draft.revision,
    runStatus: detail.runStatus,
    ...activeRunState(detail, state),
    retryableTurn: detail.retryableTurn ? { ...detail.retryableTurn } : null,
    settlementFailure: detail.settlementFailure ? { ...detail.settlementFailure } : null,
    committedTarget: { ...detail.draft.targetSelection },
    targetDraft: { ...detail.draft.targetSelection },
  }
}

function activeRunState(detail: NyxThreadDetail, state: ChatState) {
  if (!detail.activeRun) {
    return state.activeTurn && !state.activeTurn.accepted
      ? {}
      : {
          activeRequestId: undefined,
          activeAssistantMessageId: undefined,
          activeTurn: null,
        }
  }
  return {
    activeRequestId: detail.activeRun.requestId,
    activeAssistantMessageId: detail.activeRun.assistantMessageId,
    activeTurn: {
      threadId: detail.summary.id,
      requestId: detail.activeRun.requestId,
      turnIntent: detail.activeRun.turnIntent,
      accepted: true as const,
      expectedDraftRevision: detail.draft.revision,
      capturedInput: '',
      capturedDraftImageIds: [],
      capturedDraftDocumentIds: [],
      assistantMessageId: detail.activeRun.assistantMessageId,
    },
  }
}

function updateMessage(
  messages: ReadonlyArray<NyxChatMessage>,
  messageId: string,
  updater: (message: NyxChatMessage) => NyxChatMessage,
) {
  return messages.map((message) => (message.id === messageId ? updater(message) : message))
}

function matchingTurn(
  state: ChatState,
  threadId: string,
  requestId: string,
  assistantMessageId?: string,
) {
  return (
    state.selectedThreadId === threadId &&
    state.activeRequestId === requestId &&
    (!assistantMessageId ||
      !state.activeAssistantMessageId ||
      state.activeAssistantMessageId === assistantMessageId)
  )
}

function isComposerLocked(state: ChatState) {
  return state.newThreadPending || (state.activeTurn !== null && !state.activeTurn.accepted)
}

function markEdited(state: ChatState) {
  return state.draftEditVersion + 1
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'thread-library-hydrated': {
      if (action.generation !== state.projectionGeneration) return state
      if (state.newThreadPending) return state
      const ready = {
        ...initialChatState,
        hydrationStatus: 'ready' as const,
        projectionGeneration: action.generation,
        eventEpoch: action.eventEpoch,
        listCursor: action.listCursor,
        detailCursor: action.detailCursor,
      }
      if (action.detail) {
        if (action.preserveOverlay && state.selectedThreadId === action.detail.summary.id) {
          return {
            ...state,
            hydrationStatus: 'ready',
            hydrationError: null,
            hydrationErrorThreadId: null,
            hydrationRetrying: false,
            eventEpoch: action.eventEpoch,
            listCursor: action.listCursor,
            detailCursor: action.detailCursor,
            threadSummary: { ...action.detail.summary },
            messages: cloneMessages(action.detail.messages),
            draftRevision: action.detail.draft.revision,
            runStatus: action.detail.runStatus,
            ...activeRunState(action.detail, state),
            retryableTurn: action.detail.retryableTurn ? { ...action.detail.retryableTurn } : null,
            settlementFailure: action.detail.settlementFailure
              ? { ...action.detail.settlementFailure }
              : null,
          }
        }
        return { ...ready, ...detailState(action.detail, state), targetInitialized: false }
      }
      if (action.preserveOverlay && action.summary === null && state.selectedThreadId === null) {
        return {
          ...state,
          hydrationStatus: 'ready',
          hydrationError: null,
          hydrationErrorThreadId: null,
          hydrationRetrying: false,
          eventEpoch: action.eventEpoch,
          listCursor: action.listCursor,
          detailCursor: action.detailCursor,
          threadSummary: null,
        }
      }
      if (action.summary?.availability === 'unavailable') {
        return {
          ...ready,
          selectedThreadId: action.summary.id,
          threadSummary: { ...action.summary },
          hydrationStatus: 'error',
          hydrationError: { ...action.summary.unavailable },
          hydrationErrorThreadId: action.summary.id,
        }
      }
      return { ...ready, threadSummary: action.summary ? { ...action.summary } : null }
    }

    case 'thread-library-hydration-failed':
      if (action.generation !== state.projectionGeneration) return state
      if (state.hydrationStatus !== 'loading') {
        const threadScoped =
          action.threadId && state.selectedThreadId === action.threadId && state.threadSummary
        return {
          ...state,
          ...(threadScoped
            ? {
                threadSummary: {
                  availability: 'unavailable' as const,
                  id: action.threadId!,
                  location: state.threadSummary!.location,
                  pinPosition: state.threadSummary!.pinPosition,
                  title: "Couldn't open this thread" as const,
                  unavailable: { ...action.error },
                },
              }
            : { threadSummary: null }),
          hydrationStatus: 'error',
          hydrationError: { ...action.error },
          hydrationErrorThreadId: threadScoped ? action.threadId! : null,
          hydrationRetrying: false,
        }
      }
      return {
        ...initialChatState,
        hydrationStatus: 'error',
        hydrationError: { ...action.error },
        hydrationErrorThreadId: action.threadId ?? null,
        projectionGeneration: action.generation,
      }

    case 'thread-library-retry-started':
      return { ...state, hydrationRetrying: true }

    case 'public-event-advanced':
      return action.cursor > state.listCursor ? { ...state, listCursor: action.cursor } : state

    case 'thread-unavailable':
      if (state.selectedThreadId !== action.threadId || !state.threadSummary) return state
      return {
        ...state,
        threadSummary: {
          availability: 'unavailable',
          id: action.threadId,
          location: state.threadSummary.location,
          pinPosition: state.threadSummary.pinPosition,
          title: "Couldn't open this thread",
          unavailable: { ...action.error },
        },
        hydrationStatus: 'error',
        hydrationError: { ...action.error },
        hydrationErrorThreadId: action.threadId,
        hydrationRetrying: false,
        detailCursor: action.cursor,
      }

    case 'new-thread-started':
      return { ...state, newThreadPending: true }

    case 'new-thread-failed':
      return { ...state, newThreadPending: false, saveStatus: 'idle' }

    case 'thread-summary-changed':
      if (state.threadSummary?.id !== action.summary.id) return state
      return { ...state, threadSummary: { ...action.summary }, listCursor: action.cursor }

    case 'thread-detail-changed':
      if (state.selectedThreadId !== action.detail.summary.id) return state
      return action.preserveOverlay
        ? {
            ...state,
            hydrationStatus: 'ready',
            hydrationError: null,
            hydrationErrorThreadId: null,
            hydrationRetrying: false,
            threadSummary: { ...action.detail.summary },
            messages: cloneMessages(action.detail.messages),
            draftRevision: action.detail.draft.revision,
            runStatus: action.detail.runStatus,
            ...activeRunState(action.detail, state),
            retryableTurn: action.detail.retryableTurn ? { ...action.detail.retryableTurn } : null,
            settlementFailure: action.detail.settlementFailure
              ? { ...action.detail.settlementFailure }
              : null,
            detailCursor: action.cursor,
          }
        : {
            ...state,
            ...detailState(action.detail, state),
            hydrationStatus: 'ready',
            hydrationError: null,
            hydrationErrorThreadId: null,
            hydrationRetrying: false,
            detailCursor: action.cursor,
          }

    case 'set-input':
      if (isComposerLocked(state) || action.value === state.input) return state
      return { ...state, input: action.value, draftEditVersion: markEdited(state) }

    case 'draft-images-added':
      if (isComposerLocked(state)) return state
      return {
        ...state,
        draftImages: [...state.draftImages, ...action.images],
        composerError: null,
      }

    case 'draft-image-preparing':
      if (isComposerLocked(state)) return state
      return {
        ...state,
        draftImages: state.draftImages.map((image) =>
          image.id === action.imageId && image.status === 'failed'
            ? { id: image.id, name: image.name, status: 'preparing', source: image.source }
            : image,
        ),
        composerError: null,
      }

    case 'draft-image-ready':
      return {
        ...state,
        draftEditVersion: markEdited(state),
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
      if (isComposerLocked(state)) return state
      return {
        ...state,
        draftImages: state.draftImages.filter((image) => image.id !== action.imageId),
        draftEditVersion: markEdited(state),
        composerError: null,
      }

    case 'draft-documents-added':
      if (isComposerLocked(state)) return state
      return {
        ...state,
        draftDocuments: [...state.draftDocuments, ...action.documents],
        composerError: null,
      }

    case 'draft-document-preparing':
      if (isComposerLocked(state)) return state
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
        draftEditVersion: markEdited(state),
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
      if (isComposerLocked(state)) return state
      return {
        ...state,
        draftDocuments: state.draftDocuments.filter(
          (document) => document.id !== action.documentId,
        ),
        draftEditVersion: markEdited(state),
        composerError: null,
      }

    case 'composer-notice-changed':
      return { ...state, composerNotice: action.notice }

    case 'target-context-ready':
      if (
        action.generation !== state.projectionGeneration ||
        state.targetInitialized ||
        action.catalogEpoch < state.targetMinimumCatalogEpoch
      )
        return state
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
      )
        return state
      return {
        ...state,
        targetAvailable: action.available,
        targetCatalogEpoch: action.catalogEpoch,
      }

    case 'target-catalog-unready':
      if (action.catalogEpoch < state.targetCatalogEpoch || !state.targetAvailable) return state
      return { ...state, targetAvailable: false }

    case 'target-draft-changed':
      if (!state.targetInitialized || isComposerLocked(state)) return state
      return {
        ...state,
        targetDraft: { ...action.selection },
        targetAvailable: action.available,
        draftEditVersion: markEdited(state),
      }

    case 'save-started':
      return { ...state, saveStatus: 'saving', composerError: null }

    case 'save-failed':
      return { ...state, saveStatus: 'idle', composerError: { ...action.error } }

    case 'thread-discarded':
      return {
        ...state,
        selectedThreadId: null,
        threadSummary: null,
        messages: [],
        draftRevision: 0,
        savedEditVersion: action.submittedVersion,
        saveStatus: 'idle',
        composerError: null,
        runStatus: 'idle',
        activeRequestId: undefined,
        activeAssistantMessageId: undefined,
        activeTurn: null,
        retryableTurn: null,
        settlementFailure: null,
        eventEpoch: action.eventEpoch,
        detailCursor: action.cursor,
      }

    case 'thread-materialized':
      if (state.selectedThreadId && state.selectedThreadId !== action.detail.summary.id)
        return state
      return {
        ...state,
        selectedThreadId: action.detail.summary.id,
        threadSummary: { ...action.detail.summary },
        draftRevision: action.detail.draft.revision,
        eventEpoch: action.eventEpoch,
        detailCursor: action.cursor,
      }

    case 'save-succeeded': {
      if (state.selectedThreadId && state.selectedThreadId !== action.detail.summary.id)
        return state
      const unchanged = state.draftEditVersion === action.submittedVersion
      return unchanged
        ? {
            ...state,
            ...detailState(action.detail, state),
            draftEditVersion: action.submittedVersion,
            savedEditVersion: action.submittedVersion,
            saveStatus: 'idle',
            composerError: null,
            eventEpoch: action.eventEpoch,
            detailCursor: action.cursor,
          }
        : {
            ...state,
            selectedThreadId: action.detail.summary.id,
            threadSummary: { ...action.detail.summary },
            messages: cloneMessages(action.detail.messages),
            draftRevision: action.detail.draft.revision,
            savedEditVersion: action.submittedVersion,
            saveStatus: 'idle',
            composerError: null,
            eventEpoch: action.eventEpoch,
            detailCursor: action.cursor,
          }
    }

    case 'request-submitted':
      return {
        ...state,
        runStatus: 'submitting',
        activeRequestId: action.requestId,
        activeAssistantMessageId: undefined,
        activeTurn: {
          threadId: action.threadId,
          requestId: action.requestId,
          turnIntent: action.turnIntent,
          accepted: false,
          expectedDraftRevision: action.expectedDraftRevision,
          ...(action.turnOrdinal === undefined ? {} : { turnOrdinal: action.turnOrdinal }),
          ...(action.expectedAttemptRequestId
            ? { expectedAttemptRequestId: action.expectedAttemptRequestId }
            : {}),
          capturedInput: state.input,
          capturedDraftImageIds: state.draftImages.map((image) => image.id),
          capturedDraftDocumentIds: state.draftDocuments.map((document) => document.id),
        },
        composerError: null,
      }

    case 'settlement-retry-submitted':
      return {
        ...state,
        runStatus: 'submitting',
        activeRequestId: action.requestId,
        activeAssistantMessageId: action.assistantMessageId,
        activeTurn: {
          threadId: action.threadId,
          requestId: action.requestId,
          turnIntent: 'retry_failed_response',
          accepted: true,
          expectedDraftRevision: action.expectedDraftRevision,
          capturedInput: '',
          capturedDraftImageIds: [],
          capturedDraftDocumentIds: [],
          assistantMessageId: action.assistantMessageId,
        },
        composerError: null,
      }

    case 'request-accepted': {
      if (!matchingTurn(state, action.threadId, action.requestId)) return state
      const activeTurn = state.activeTurn
      if (!activeTurn || activeTurn.accepted || activeTurn.turnIntent !== action.turnIntent)
        return state
      const isRetry = action.turnIntent === 'retry_failed_response'
      let messages = state.messages
      if (isRetry) {
        messages = updateMessage(messages, action.assistantMessageId, (message) => {
          const { error: _error, targetAttribution: _targetAttribution, ...rest } = message
          return { ...rest, content: '', status: 'pending', canRetry: false }
        })
      } else if (!messages.some((message) => message.id === action.userMessageId)) {
        const imageIds = new Set(activeTurn.capturedDraftImageIds)
        const documentIds = new Set(activeTurn.capturedDraftDocumentIds)
        messages = [
          ...messages,
          {
            id: action.userMessageId,
            role: 'user',
            content: activeTurn.capturedInput,
            status: 'completed',
            ...(imageIds.size
              ? {
                  images: state.draftImages
                    .filter(
                      (image): image is Extract<ChatImageDraft, { status: 'ready' }> =>
                        image.status === 'ready' && imageIds.has(image.id),
                    )
                    .map((image) => ({ imageId: image.id, ...image.image, available: true })),
                }
              : {}),
            ...(documentIds.size
              ? {
                  documents: state.draftDocuments
                    .filter(
                      (document): document is Extract<ChatDocumentDraft, { status: 'ready' }> =>
                        document.status === 'ready' && documentIds.has(document.id),
                    )
                    .map((document) => ({
                      documentId: document.id,
                      ...document.document,
                      available: true,
                    })),
                }
              : {}),
          },
          { id: action.assistantMessageId, role: 'assistant', content: '', status: 'pending' },
        ]
      }
      return {
        ...state,
        input: isRetry ? state.input : '',
        draftImages: isRetry ? state.draftImages : [],
        draftDocuments: isRetry ? state.draftDocuments : [],
        activeAssistantMessageId: action.assistantMessageId,
        activeTurn: {
          ...activeTurn,
          accepted: true,
          userMessageId: action.userMessageId,
          assistantMessageId: action.assistantMessageId,
        },
        retryableTurn: null,
        settlementFailure: null,
        messages,
      }
    }

    case 'request-started':
      if (!matchingTurn(state, action.threadId, action.requestId, action.assistantMessageId))
        return state
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
      if (!matchingTurn(state, action.threadId, action.requestId, action.assistantMessageId))
        return state
      return {
        ...state,
        runStatus: 'streaming',
        messages: updateMessage(state.messages, action.assistantMessageId, (message) => ({
          ...message,
          content: action.snapshot,
          status: 'streaming',
        })),
      }

    case 'request-completed': {
      if (!matchingTurn(state, action.threadId, action.requestId, action.assistantMessageId))
        return state
      const settlementRetry =
        state.settlementFailure?.requestId === action.requestId &&
        state.settlementFailure.assistantMessageId === action.assistantMessageId
      return {
        ...state,
        runStatus: action.status,
        activeRequestId: undefined,
        activeAssistantMessageId: undefined,
        activeTurn: null,
        retryableTurn: null,
        settlementFailure: null,
        messages: updateMessage(state.messages, action.assistantMessageId, (message) => {
          const { error: _error, ...rest } = message
          return {
            ...rest,
            content: settlementRetry ? message.content : action.finalContent,
            status: action.status === 'cancelled' ? 'cancelled' : 'completed',
            canRetry: false,
          }
        }),
      }
    }

    case 'request-failed': {
      if (!matchingTurn(state, action.threadId, action.requestId, action.assistantMessageId))
        return state
      const assistantMessageId = action.assistantMessageId ?? state.activeAssistantMessageId
      if (!state.activeTurn?.accepted || !assistantMessageId) {
        return {
          ...state,
          runStatus: state.messages.length ? 'completed' : 'idle',
          activeRequestId: undefined,
          activeAssistantMessageId: undefined,
          activeTurn: null,
          composerError: { ...action.error },
        }
      }
      const matchingSettlementFailure =
        state.settlementFailure?.requestId === action.requestId &&
        state.settlementFailure.assistantMessageId === assistantMessageId
      return {
        ...state,
        runStatus: 'failed',
        activeRequestId: undefined,
        activeAssistantMessageId: undefined,
        activeTurn: null,
        composerError: null,
        settlementFailure:
          action.error.message === "Couldn't save result"
            ? { requestId: action.requestId, assistantMessageId }
            : matchingSettlementFailure
              ? null
              : state.settlementFailure,
        messages: updateMessage(state.messages, assistantMessageId, (message) => ({
          ...message,
          status: 'failed',
          error: { ...action.error },
          canRetry: action.error.retryable,
          ...(action.targetAttribution
            ? { targetAttribution: { ...action.targetAttribution } }
            : {}),
        })),
      }
    }

    case 'show-placeholder':
      return {
        ...initialChatState,
        hydrationStatus: 'ready',
        projectionGeneration: action.generation,
        targetMinimumCatalogEpoch: action.minimumCatalogEpoch,
      }
  }
}
