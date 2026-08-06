import { useEffect, useReducer, useRef } from 'react'

import type { NyxChatEvent } from '../../../shared/chat/events'
import type {
  NyxCurrentThreadResetError,
  NyxCurrentThreadSnapshotError,
} from '../../../shared/chat/snapshot'
import type {
  NyxChatError,
  NyxChatInputMessage,
  NyxChatMessage,
  NyxChatTargetSelection,
} from '../../../shared/chat/types'
import { chatReducer } from './chat-reducer'
import { initialChatState } from './chat-types'
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

function toRequestMessages(messages: ReadonlyArray<NyxChatMessage>): NyxChatInputMessage[] {
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

    if (message.content.length === 0) {
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

export function useChatSession({
  connectionStatus,
  refreshConnections,
  getLatestConnectionRequestEpoch,
}: UseChatSessionOptions) {
  const [state, dispatch] = useReducer(chatReducer, initialChatState)
  const projectionGeneration = useRef(initialChatState.projectionGeneration)

  useEffect(() => {
    if (!window.nyx) {
      return
    }

    let disposed = false
    const hydrationGeneration = projectionGeneration.current
    const chat = window.nyx.chat
    const unsubscribe = chat.subscribe((event: NyxChatEvent) => {
      switch (event.type) {
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
    if (state.hydrationStatus !== 'ready' || state.resetStatus === 'resetting') {
      return
    }

    if (connectionStatus.kind !== 'ready') {
      dispatch({
        type: 'target-catalog-unready',
        catalogEpoch: connectionStatus.requestEpoch,
      })
      return
    }

    if (!state.targetInitialized) {
      const selection = selectInitialChatTarget(state.committedTarget, connectionStatus.overview)

      dispatch({
        type: 'target-context-ready',
        generation: state.projectionGeneration,
        catalogEpoch: connectionStatus.requestEpoch,
        selection,
        available: isChatTargetAvailable(selection, connectionStatus.overview),
      })
      return
    }

    dispatch({
      type: 'target-catalog-updated',
      generation: state.projectionGeneration,
      catalogEpoch: connectionStatus.requestEpoch,
      available: isChatTargetAvailable(state.targetDraft, connectionStatus.overview),
    })
  }, [
    connectionStatus,
    state.committedTarget,
    state.hydrationStatus,
    state.projectionGeneration,
    state.resetStatus,
    state.targetDraft,
    state.targetInitialized,
  ])

  async function sendCurrentInput() {
    const prompt = state.input.trim()

    const targetSelection = state.targetDraft

    if (
      !prompt ||
      state.hydrationStatus !== 'ready' ||
      state.activeRequestId ||
      !state.targetInitialized ||
      !state.targetAvailable ||
      !targetSelection ||
      connectionStatus.kind !== 'ready' ||
      !window.nyx
    ) {
      return
    }

    const requestId = crypto.randomUUID()
    const userMessageId = crypto.randomUUID()
    const assistantMessageId = crypto.randomUUID()
    const turnUserMessage = {
      id: userMessageId,
      content: prompt,
    }
    const requestMessages = [
      ...toRequestMessages(state.messages),
      { role: 'user' as const, content: prompt },
    ]

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
      })
    } catch (error) {
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
      connectionStatus.kind !== 'ready'
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
    isResetting: state.resetStatus === 'resetting',
    canSend:
      state.hydrationStatus === 'ready' &&
      state.resetStatus === 'idle' &&
      state.input.trim().length > 0 &&
      !state.activeRequestId &&
      connectionStatus.kind === 'ready' &&
      state.targetInitialized &&
      state.targetAvailable &&
      Boolean(state.targetDraft),
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
    sendCurrentInput,
    retryMessage,
    stopActiveResponse,
    startNewChat,
  }
}
