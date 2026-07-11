import { useEffect, useReducer, useRef } from 'react'

import type { NyxChatEvent } from '../../../shared/chat/events'
import type {
  NyxCurrentThreadResetError,
  NyxCurrentThreadSnapshotError,
} from '../../../shared/chat/snapshot'
import type { NyxChatError, NyxChatInputMessage, NyxChatMessage } from '../../../shared/chat/types'
import { chatReducer } from './chat-reducer'
import { initialChatState } from './chat-types'

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

export function useChatSession() {
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
          })
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
  }, [])

  async function sendCurrentInput() {
    const prompt = state.input.trim()

    if (!prompt || state.hydrationStatus !== 'ready' || state.activeRequestId || !window.nyx) {
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
    })

    try {
      await window.nyx.chat.startChat({
        requestId,
        userMessageId,
        assistantMessageId,
        turnIntent: 'new_user_message',
        turnUserMessage,
        messages: requestMessages,
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
      state.retryableTurn.assistantMessageId !== messageId
    ) {
      return
    }

    const requestId = crypto.randomUUID()
    const retryableTurn = state.retryableTurn

    dispatch({
      type: 'retry-requested',
      requestId,
      userMessageId: retryableTurn.userMessageId,
      assistantMessageId: retryableTurn.assistantMessageId,
      turnUserMessage: retryableTurn.turnUserMessage,
      submittedMessages: retryableTurn.submittedMessages,
    })

    try {
      await window.nyx.chat.startChat({
        requestId,
        userMessageId: retryableTurn.userMessageId,
        assistantMessageId: retryableTurn.assistantMessageId,
        turnIntent: 'retry_failed_response',
        turnUserMessage: retryableTurn.turnUserMessage,
        messages: retryableTurn.submittedMessages,
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

    if (!window.nyx) {
      const generation = projectionGeneration.current + 1
      projectionGeneration.current = generation
      dispatch({ type: 'reset-started', generation })
      dispatch({ type: 'clear-chat', generation })
      return
    }

    const generation = projectionGeneration.current + 1
    projectionGeneration.current = generation
    dispatch({ type: 'reset-started', generation })

    try {
      const result = await window.nyx.chat.resetChatSession()

      if (!result.ok) {
        dispatch({ type: 'reset-failed', generation, error: result.error })
        return
      }
    } catch {
      dispatch({
        type: 'reset-failed',
        generation,
        error: currentThreadResetBridgeError(),
      })
      return
    }

    dispatch({ type: 'clear-chat', generation })
  }

  return {
    state,
    isBusy: Boolean(state.activeRequestId),
    isResetting: state.resetStatus === 'resetting',
    canSend:
      state.hydrationStatus === 'ready' &&
      state.resetStatus === 'idle' &&
      state.input.trim().length > 0 &&
      !state.activeRequestId,
    setInput(value: string) {
      dispatch({
        type: 'set-input',
        value,
      })
    },
    sendCurrentInput,
    retryMessage,
    stopActiveResponse,
    startNewChat,
  }
}
