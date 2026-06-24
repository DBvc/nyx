import { useEffect, useReducer } from 'react'

import type { NyxChatEvent } from '../../../shared/chat/events'
import type { NyxChatError, NyxChatInputMessage, NyxChatMessage } from '../../../shared/chat/types'
import { nyxChatReducer } from './chat-reducer'
import { initialNyxChatState } from './chat-types'

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
  const [state, dispatch] = useReducer(nyxChatReducer, initialNyxChatState)

  useEffect(() => {
    if (!window.nyx) {
      return
    }

    return window.nyx.chat.subscribe((event: NyxChatEvent) => {
      switch (event.type) {
        case 'chat:start':
          dispatch({
            type: 'request-started',
            requestId: event.requestId,
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
  }, [])

  async function sendCurrentInput() {
    const prompt = state.input.trim()

    if (!prompt || state.activeRequestId || !window.nyx) {
      return
    }

    const requestId = crypto.randomUUID()
    const assistantMessageId = crypto.randomUUID()
    const requestMessages = [
      ...toRequestMessages(state.messages),
      { role: 'user' as const, content: prompt },
    ]

    dispatch({
      type: 'request-submitted',
      requestId,
      assistantMessageId,
      submittedMessages: requestMessages,
      userMessage: {
        id: crypto.randomUUID(),
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
        assistantMessageId,
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
      !window.nyx ||
      !state.lastSubmittedMessages ||
      state.lastAssistantMessageId !== messageId
    ) {
      return
    }

    const requestId = crypto.randomUUID()

    dispatch({
      type: 'retry-requested',
      requestId,
      assistantMessageId: messageId,
      submittedMessages: state.lastSubmittedMessages,
    })

    try {
      await window.nyx.chat.startChat({
        requestId,
        assistantMessageId: messageId,
        messages: state.lastSubmittedMessages,
      })
    } catch (error) {
      dispatch({
        type: 'request-failed',
        requestId,
        assistantMessageId: messageId,
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
    if (!window.nyx) {
      dispatch({ type: 'clear-chat' })
      return
    }

    if (state.activeRequestId) {
      await window.nyx.chat.cancelChat({
        requestId: state.activeRequestId,
      })
    }

    dispatch({ type: 'clear-chat' })
  }

  return {
    state,
    isBusy: Boolean(state.activeRequestId),
    canSend: state.input.trim().length > 0 && !state.activeRequestId,
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
