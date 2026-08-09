import { useEffect, useReducer, useRef } from 'react'

import type { NyxChatEvent } from '../../../shared/chat/events'
import { nyxChatImageLimits, parseNyxChatImageHeader } from '../../../shared/chat/image-file'
import type {
  NyxCurrentThreadResetError,
  NyxCurrentThreadSnapshotError,
} from '../../../shared/chat/snapshot'
import type {
  NyxChatError,
  NyxChatInputMessage,
  NyxChatMessage,
  NyxChatNewImage,
  NyxChatTargetSelection,
} from '../../../shared/chat/types'
import { chatReducer } from './chat-reducer'
import { initialChatState, type ChatImageDraft, type ChatState } from './chat-types'
import type {
  ImageCanonicalizerRequest,
  ImageCanonicalizerResult,
} from './image-canonicalizer.worker'
import {
  isChatTargetAvailable,
  selectInitialChatTarget,
  type ConnectionStatusState,
} from './connection-status'

function normalizeBridgeError(error: unknown): NyxChatError {
  if (error instanceof Error) {
    return {
      code: 'unknown',
      message: error.message || 'Nyx could not start this chat request.',
      retryable: true,
    }
  }

  return {
    code: 'unknown',
    message: 'Nyx could not start this chat request.',
    retryable: true,
  }
}

function currentThreadSnapshotBridgeError(): NyxCurrentThreadSnapshotError {
  return {
    code: 'load_failed',
    message: 'Nyx could not load the current thread.',
  }
}

function currentThreadResetBridgeError(): NyxCurrentThreadResetError {
  return {
    code: 'reset_failed',
    message: 'Nyx could not start a fresh thread.',
  }
}

export function toRequestMessages(messages: ReadonlyArray<NyxChatMessage>): NyxChatInputMessage[] {
  const requestMessages: NyxChatInputMessage[] = []

  for (const message of messages) {
    if (message.role === 'assistant') {
      if (message.status === 'failed' || message.content.length === 0) {
        continue
      }

      requestMessages.push({
        role: 'assistant',
        content: message.content,
      })
      continue
    }

    if (message.content.length === 0 && !(message.role === 'user' && message.images?.length)) {
      continue
    }

    requestMessages.push({
      role: message.role,
      content: message.content,
    })
  }

  return requestMessages
}

interface UseChatSessionOptions {
  connectionStatus: ConnectionStatusState
  refreshConnections: () => Promise<void>
  getLatestConnectionRequestEpoch: () => number
}

type TargetCatalogAction =
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

export function deriveTargetCatalogAction(
  state: ChatState,
  connectionStatus: ConnectionStatusState,
): TargetCatalogAction | null {
  if (state.hydrationStatus !== 'ready' || state.resetStatus === 'resetting') {
    return null
  }

  if (connectionStatus.kind !== 'ready') {
    return {
      type: 'target-catalog-unready',
      catalogEpoch: connectionStatus.requestEpoch,
    }
  }

  if (!state.targetInitialized) {
    const selection = selectInitialChatTarget(state.committedTarget, connectionStatus.overview)

    return {
      type: 'target-context-ready',
      generation: state.projectionGeneration,
      catalogEpoch: connectionStatus.requestEpoch,
      selection,
      available: isChatTargetAvailable(selection, connectionStatus.overview),
    }
  }

  return {
    type: 'target-catalog-updated',
    generation: state.projectionGeneration,
    catalogEpoch: connectionStatus.requestEpoch,
    available: isChatTargetAvailable(state.targetDraft, connectionStatus.overview),
  }
}

export function canSubmitChat(state: ChatState, connectionStatus: ConnectionStatusState) {
  const hasContent = state.input.trim().length > 0 || state.draftImages.length > 0
  const imagesReady = state.draftImages.every((image) => image.status === 'ready')

  return (
    state.hydrationStatus === 'ready' &&
    state.resetStatus === 'idle' &&
    hasContent &&
    imagesReady &&
    !state.activeRequestId &&
    connectionStatus.kind === 'ready' &&
    state.targetInitialized &&
    state.targetAvailable &&
    isChatTargetAvailable(state.targetDraft, connectionStatus.overview)
  )
}

export function revokeDraftPreviewUrls(
  drafts: ReadonlyArray<ChatImageDraft>,
  imageIds: ReadonlySet<string>,
  revoke: (url: string) => void,
) {
  for (const image of drafts) {
    if (imageIds.has(image.id) && image.status === 'ready') {
      revoke(image.previewUrl)
    }
  }
}

export function useChatSession({
  connectionStatus,
  refreshConnections,
  getLatestConnectionRequestEpoch,
}: UseChatSessionOptions) {
  const [state, dispatch] = useReducer(chatReducer, initialChatState)
  const projectionGeneration = useRef(initialChatState.projectionGeneration)
  const stateRef = useRef(state)
  const workerRef = useRef<Worker | null>(null)
  const liveDraftsRef = useRef(new Set<string>())
  const workerDraftsRef = useRef(new Set<string>())
  const pendingDraftsRef = useRef(new Map<string, ReadonlyArray<string>>())
  stateRef.current = state

  function failDraft(imageId: string, error = 'Nyx could not prepare this image.') {
    workerDraftsRef.current.delete(imageId)

    if (!liveDraftsRef.current.has(imageId)) {
      return
    }

    dispatch({ type: 'draft-image-failed', imageId, error })
  }

  function imageWorker() {
    if (workerRef.current) {
      return workerRef.current
    }

    const worker = new Worker(new URL('./image-canonicalizer.worker.ts', import.meta.url), {
      type: 'module',
      name: 'nyx-image-canonicalizer',
    })

    worker.onmessage = (event: MessageEvent<ImageCanonicalizerResult>) => {
      const result = event.data
      workerDraftsRef.current.delete(result.draftId)

      try {
        if (!liveDraftsRef.current.has(result.draftId)) {
          return
        }

        if (!result.ok) {
          failDraft(result.draftId, result.error)
          return
        }

        const canonicalBytes = new Uint8Array(result.canonical)
        const previewBytes = new Uint8Array(result.preview)
        const pixels = result.width * result.height

        if (
          canonicalBytes.byteLength === 0 ||
          canonicalBytes.byteLength > nyxChatImageLimits.canonicalBytesPerImage ||
          previewBytes.byteLength === 0 ||
          previewBytes.byteLength > nyxChatImageLimits.previewBytesPerImage ||
          result.width <= 0 ||
          result.height <= 0 ||
          Math.max(result.width, result.height) > nyxChatImageLimits.fullMaxEdge ||
          pixels > nyxChatImageLimits.fullPixelsPerImage
        ) {
          failDraft(result.draftId)
          return
        }

        const previewUrl = URL.createObjectURL(new Blob([previewBytes], { type: 'image/png' }))

        if (!liveDraftsRef.current.has(result.draftId)) {
          URL.revokeObjectURL(previewUrl)
          return
        }

        dispatch({
          type: 'draft-image-ready',
          imageId: result.draftId,
          image: {
            mediaType: result.mediaType,
            width: result.width,
            height: result.height,
          },
          canonicalBytes,
          previewBytes,
          previewUrl,
        })
      } finally {
        if (workerDraftsRef.current.size === 0 && workerRef.current === worker) {
          worker.terminate()
          workerRef.current = null
        }
      }
    }

    worker.onerror = (event) => {
      event.preventDefault()
      worker.terminate()
      workerRef.current = null

      for (const imageId of workerDraftsRef.current) {
        failDraft(imageId)
      }

      workerDraftsRef.current.clear()
    }

    workerRef.current = worker
    return worker
  }

  async function prepareDraftImage(imageId: string, source: Blob) {
    try {
      if (
        source.size === 0 ||
        source.size > nyxChatImageLimits.canonicalBytesPerImage ||
        (source.type !== 'image/png' && source.type !== 'image/jpeg')
      ) {
        failDraft(imageId, 'Use a PNG or JPEG image no larger than 8 MB.')
        return
      }

      const sourceBuffer = await source.arrayBuffer()

      if (!liveDraftsRef.current.has(imageId)) {
        return
      }

      const parsed = parseNyxChatImageHeader(new Uint8Array(sourceBuffer))
      const pixels = parsed.width * parsed.height

      if (
        parsed.mediaType !== source.type ||
        Math.max(parsed.width, parsed.height) > nyxChatImageLimits.fullMaxEdge ||
        pixels > nyxChatImageLimits.fullPixelsPerImage
      ) {
        failDraft(imageId, 'This image is too large or does not match its file type.')
        return
      }

      const request: ImageCanonicalizerRequest = {
        draftId: imageId,
        source: sourceBuffer,
        mediaType: parsed.mediaType,
      }
      workerDraftsRef.current.add(imageId)
      imageWorker().postMessage(request, [sourceBuffer])
    } catch {
      failDraft(imageId)
    }
  }

  function releaseDrafts(imageIds?: ReadonlySet<string>) {
    const releasedIds = new Set<string>()

    for (const image of stateRef.current.draftImages) {
      if ((imageIds && !imageIds.has(image.id)) || !liveDraftsRef.current.has(image.id)) {
        continue
      }

      liveDraftsRef.current.delete(image.id)
      workerDraftsRef.current.delete(image.id)
      releasedIds.add(image.id)
    }

    revokeDraftPreviewUrls(stateRef.current.draftImages, releasedIds, URL.revokeObjectURL)
  }

  function releaseAllDrafts() {
    releaseDrafts()
    pendingDraftsRef.current.clear()
    workerDraftsRef.current.clear()
    workerRef.current?.terminate()
    workerRef.current = null
  }

  useEffect(() => releaseAllDrafts, [])

  useEffect(() => {
    if (!window.nyx) {
      return
    }

    let disposed = false
    const hydrationGeneration = projectionGeneration.current
    const chat = window.nyx.chat
    const unsubscribe = chat.subscribe((event: NyxChatEvent) => {
      switch (event.type) {
        case 'chat:accepted': {
          const capturedDraftIds = pendingDraftsRef.current.get(event.requestId)

          if (capturedDraftIds) {
            releaseDrafts(new Set(capturedDraftIds))
            pendingDraftsRef.current.delete(event.requestId)
          }

          dispatch({
            type: 'request-accepted',
            requestId: event.requestId,
            assistantMessageId: event.assistantMessageId,
          })
          return
        }

        case 'chat:start':
          dispatch({
            type: 'request-started',
            requestId: event.requestId,
            assistantMessageId: event.assistantMessageId,
            targetAttribution: event.targetAttribution,
          })
          return

        case 'chat:delta':
          dispatch({
            type: 'request-delta',
            requestId: event.requestId,
            assistantMessageId: event.assistantMessageId,
            snapshot: event.snapshot,
          })
          return

        case 'chat:done':
          dispatch({
            type: 'request-completed',
            requestId: event.requestId,
            assistantMessageId: event.assistantMessageId,
            status: event.status,
            finalContent: event.finalContent,
          })
          return

        case 'chat:error':
          pendingDraftsRef.current.delete(event.requestId)
          dispatch({
            type: 'request-failed',
            requestId: event.requestId,
            assistantMessageId: event.assistantMessageId,
            error: event.error,
            ...(event.targetAttribution ? { targetAttribution: event.targetAttribution } : {}),
          })

          if (event.error.code === 'target_unavailable') {
            void refreshConnections()
          }
      }
    })

    void chat
      .getCurrentThreadSnapshot()
      .then((result) => {
        if (disposed) {
          return
        }

        if (result.ok) {
          dispatch({
            type: 'current-thread-hydrated',
            generation: hydrationGeneration,
            snapshot: result.value,
          })
          return
        }

        dispatch({
          type: 'current-thread-hydration-failed',
          generation: hydrationGeneration,
          error: result.error,
        })
      })
      .catch(() => {
        if (!disposed) {
          dispatch({
            type: 'current-thread-hydration-failed',
            generation: hydrationGeneration,
            error: currentThreadSnapshotBridgeError(),
          })
        }
      })

    return () => {
      disposed = true
      unsubscribe()
    }
  }, [refreshConnections])

  useEffect(() => {
    const action = deriveTargetCatalogAction(state, connectionStatus)

    if (!action) {
      return
    }

    dispatch(action)
  }, [
    connectionStatus,
    state.committedTarget,
    state.hydrationStatus,
    state.projectionGeneration,
    state.resetStatus,
    state.targetDraft,
    state.targetInitialized,
  ])

  function addDraftImages(sources: ReadonlyArray<Blob>) {
    if (
      state.hydrationStatus !== 'ready' ||
      state.resetStatus === 'resetting' ||
      (state.activeTurn && !state.activeTurn.accepted)
    ) {
      return
    }

    const availableSlots = nyxChatImageLimits.imagesPerTurn - liveDraftsRef.current.size
    const acceptedSources = sources.slice(0, Math.max(0, availableSlots))

    if (acceptedSources.length < sources.length) {
      dispatch({
        type: 'composer-notice-changed',
        notice: `You can attach up to ${nyxChatImageLimits.imagesPerTurn} images.`,
      })
    }

    if (acceptedSources.length === 0) {
      return
    }

    const drafts = acceptedSources.map((source, index) => {
      const id = crypto.randomUUID()
      liveDraftsRef.current.add(id)

      return {
        id,
        name: source instanceof File && source.name ? source.name : `Image ${index + 1}`,
        status: 'preparing' as const,
        source,
      }
    })

    dispatch({ type: 'draft-images-added', images: drafts })

    for (const draft of drafts) {
      void prepareDraftImage(draft.id, draft.source)
    }
  }

  function removeDraftImage(imageId: string) {
    if (state.resetStatus === 'resetting' || (state.activeTurn && !state.activeTurn.accepted)) {
      return
    }

    const image = state.draftImages.find((candidate) => candidate.id === imageId)

    if (!image) {
      return
    }

    releaseDrafts(new Set([imageId]))
    dispatch({ type: 'draft-image-removed', imageId })
  }

  function retryDraftImage(imageId: string) {
    if (state.resetStatus === 'resetting' || (state.activeTurn && !state.activeTurn.accepted)) {
      return
    }

    const image = state.draftImages.find(
      (candidate) => candidate.id === imageId && candidate.status === 'failed',
    )

    if (!image || image.status !== 'failed') {
      return
    }

    dispatch({ type: 'draft-image-preparing', imageId })
    void prepareDraftImage(imageId, image.source)
  }

  async function sendCurrentInput() {
    const prompt = state.input.trim()
    const targetSelection = state.targetDraft

    if (!canSubmitChat(state, connectionStatus) || !targetSelection || !window.nyx) {
      return
    }

    const readyImages = state.draftImages.filter((image) => image.status === 'ready')
    const requestId = crypto.randomUUID()
    const userMessageId = crypto.randomUUID()
    const assistantMessageId = crypto.randomUUID()
    const imageRefs = readyImages.map((image) => ({
      imageId: crypto.randomUUID(),
      ...image.image,
    }))
    const newImages: NyxChatNewImage[] = readyImages.map((image, index) => ({
      imageId: imageRefs[index]!.imageId,
      canonicalBytes: image.canonicalBytes,
      previewBytes: image.previewBytes,
    }))
    const turnUserMessage = {
      id: userMessageId,
      content: prompt,
      ...(imageRefs.length > 0 ? { imageRefs } : {}),
    }
    const requestMessages = [
      ...toRequestMessages(state.messages),
      { role: 'user' as const, content: prompt },
    ]
    pendingDraftsRef.current.set(
      requestId,
      readyImages.map((image) => image.id),
    )

    dispatch({
      type: 'request-submitted',
      requestId,
      assistantMessageId,
      turnUserMessage,
      submittedMessages: requestMessages,
      userMessage: {
        id: userMessageId,
        role: 'user',
        content: prompt,
        status: 'completed',
        ...(imageRefs.length > 0
          ? { images: imageRefs.map((imageRef) => ({ ...imageRef, available: true })) }
          : {}),
      },
      assistantMessage: {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        status: 'pending',
      },
      targetSelection,
    })

    try {
      await window.nyx.chat.startChat({
        requestId,
        userMessageId,
        assistantMessageId,
        turnIntent: 'new_user_message',
        turnUserMessage,
        messages: requestMessages,
        targetSelection,
        ...(newImages.length > 0 ? { newImages } : {}),
      })
    } catch (error) {
      pendingDraftsRef.current.delete(requestId)
      dispatch({
        type: 'request-failed',
        requestId,
        assistantMessageId,
        error: normalizeBridgeError(error),
      })
    }
  }

  async function retryMessage(messageId: string) {
    if (
      state.activeRequestId ||
      state.hydrationStatus !== 'ready' ||
      state.resetStatus === 'resetting' ||
      !window.nyx ||
      !state.retryableTurn ||
      state.retryableTurn.assistantMessageId !== messageId ||
      !state.targetInitialized ||
      !state.targetAvailable ||
      !state.targetDraft ||
      connectionStatus.kind !== 'ready' ||
      !isChatTargetAvailable(state.targetDraft, connectionStatus.overview)
    ) {
      return
    }

    const requestId = crypto.randomUUID()
    const retryableTurn = state.retryableTurn
    const targetSelection = state.targetDraft

    dispatch({
      type: 'retry-requested',
      requestId,
      userMessageId: retryableTurn.userMessageId,
      assistantMessageId: retryableTurn.assistantMessageId,
      turnUserMessage: retryableTurn.turnUserMessage,
      submittedMessages: retryableTurn.submittedMessages,
      targetSelection,
    })

    try {
      await window.nyx.chat.startChat({
        requestId,
        userMessageId: retryableTurn.userMessageId,
        assistantMessageId: retryableTurn.assistantMessageId,
        turnIntent: 'retry_failed_response',
        turnUserMessage: retryableTurn.turnUserMessage,
        messages: retryableTurn.submittedMessages,
        targetSelection,
      })
    } catch (error) {
      dispatch({
        type: 'request-failed',
        requestId,
        assistantMessageId: retryableTurn.assistantMessageId,
        error: normalizeBridgeError(error),
      })
    }
  }

  async function stopActiveResponse() {
    if (!state.activeRequestId || !window.nyx) {
      return
    }

    await window.nyx.chat.cancelChat({
      requestId: state.activeRequestId,
    })
  }

  async function startNewChat() {
    if (state.hydrationStatus === 'loading' || state.resetStatus === 'resetting') {
      return
    }

    const restoreTargetInitialized = state.targetInitialized
    const restoreTargetAvailable = state.targetAvailable
    const restoreMinimumCatalogEpoch = state.targetMinimumCatalogEpoch
    const minimumCatalogEpoch = getLatestConnectionRequestEpoch() + 1

    if (!window.nyx) {
      const generation = projectionGeneration.current + 1
      projectionGeneration.current = generation
      dispatch({ type: 'reset-started', generation, minimumCatalogEpoch })
      releaseAllDrafts()
      dispatch({ type: 'clear-chat', generation, minimumCatalogEpoch })
      return
    }

    const generation = projectionGeneration.current + 1
    projectionGeneration.current = generation
    dispatch({ type: 'reset-started', generation, minimumCatalogEpoch })

    try {
      const result = await window.nyx.chat.resetChatSession()

      if (!result.ok) {
        dispatch({
          type: 'reset-failed',
          generation,
          error: result.error,
          restoreTargetInitialized,
          restoreTargetAvailable,
          restoreMinimumCatalogEpoch,
        })
        return
      }
    } catch {
      dispatch({
        type: 'reset-failed',
        generation,
        error: currentThreadResetBridgeError(),
        restoreTargetInitialized,
        restoreTargetAvailable,
        restoreMinimumCatalogEpoch,
      })
      return
    }

    const refreshOperation = refreshConnections()
    const resetCatalogEpoch = getLatestConnectionRequestEpoch()
    releaseAllDrafts()
    dispatch({
      type: 'clear-chat',
      generation,
      minimumCatalogEpoch: resetCatalogEpoch,
    })
    await refreshOperation
  }

  return {
    state,
    isBusy: Boolean(state.activeRequestId),
    isAccepting: Boolean(state.activeTurn && !state.activeTurn.accepted),
    isResetting: state.resetStatus === 'resetting',
    canSend: canSubmitChat(state, connectionStatus),
    setInput(value: string) {
      dispatch({
        type: 'set-input',
        value,
      })
    },
    setTargetSelection(selection: NyxChatTargetSelection) {
      dispatch({
        type: 'target-draft-changed',
        selection,
        available:
          connectionStatus.kind === 'ready' &&
          isChatTargetAvailable(selection, connectionStatus.overview),
      })
    },
    addDraftImages,
    removeDraftImage,
    retryDraftImage,
    sendCurrentInput,
    retryMessage,
    stopActiveResponse,
    startNewChat,
  }
}
