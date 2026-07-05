import { describe, expect, it } from 'vitest'

import type { NyxChatError, NyxChatInputMessage, NyxChatMessage } from '../../../shared/chat/types'
import { chatReducer } from './chat-reducer'
import { initialChatState } from './chat-types'

const requestId = 'request-1'
const userMessageId = 'user-1'
const assistantMessageId = 'assistant-1'
const staleRequestId = 'request-stale'
const staleAssistantMessageId = 'assistant-stale'

const submittedMessages: ReadonlyArray<NyxChatInputMessage> = [
  {
    role: 'user',
    content: 'Hello Nyx',
  },
]

const userMessage: NyxChatMessage = {
  id: userMessageId,
  role: 'user',
  content: 'Hello Nyx',
  status: 'completed',
}

const turnUserMessage = {
  id: userMessageId,
  content: 'Hello Nyx',
}

const assistantMessage: NyxChatMessage = {
  id: assistantMessageId,
  role: 'assistant',
  content: '',
  status: 'pending',
}

const retryableError: NyxChatError = {
  code: 'network_error',
  message: 'Network failed.',
  retryable: true,
  details: 'Connection closed.',
}

function submittedState() {
  return chatReducer(
    {
      ...initialChatState,
      input: 'Hello Nyx',
    },
    {
      type: 'request-submitted',
      requestId,
      assistantMessageId,
      turnUserMessage,
      submittedMessages,
      userMessage,
      assistantMessage,
    },
  )
}

function streamingState() {
  return chatReducer(submittedState(), {
    type: 'request-started',
    requestId,
    assistantMessageId,
  })
}

function assistantFrom(messages: ReadonlyArray<NyxChatMessage>) {
  const message = messages.find((candidate) => candidate.id === assistantMessageId)

  expect(message).toBeDefined()

  return message as NyxChatMessage
}

describe('chatReducer', () => {
  it('records a submitted request and appends user and assistant messages', () => {
    const state = submittedState()

    expect(state.input).toBe('')
    expect(state.runStatus).toBe('submitting')
    expect(state.activeRequestId).toBe(requestId)
    expect(state.activeAssistantMessageId).toBe(assistantMessageId)
    expect(state.activeTurn).toEqual({
      requestId,
      userMessageId,
      assistantMessageId,
      turnUserMessage,
      submittedMessages,
    })
    expect(state.retryableTurn).toBeNull()
    expect(state.messages).toEqual([userMessage, assistantMessage])
  })

  it('marks the pending assistant message as streaming when the request starts', () => {
    const state = streamingState()

    expect(state.runStatus).toBe('streaming')
    expect(assistantFrom(state.messages).status).toBe('streaming')
  })

  it('stores streaming snapshots on request deltas', () => {
    const state = chatReducer(streamingState(), {
      type: 'request-delta',
      requestId,
      assistantMessageId,
      snapshot: 'Partial response',
    })

    const assistant = assistantFrom(state.messages)

    expect(state.runStatus).toBe('streaming')
    expect(assistant.content).toBe('Partial response')
    expect(assistant.status).toBe('streaming')
  })

  it('finalizes a completed request and clears active ids', () => {
    const state = chatReducer(streamingState(), {
      type: 'request-completed',
      requestId,
      assistantMessageId,
      status: 'completed',
      finalContent: 'Final response',
    })

    const assistant = assistantFrom(state.messages)

    expect(state.activeRequestId).toBeUndefined()
    expect(state.activeAssistantMessageId).toBeUndefined()
    expect(state.activeTurn).toBeNull()
    expect(state.retryableTurn).toBeNull()
    expect(state.runStatus).toBe('completed')
    expect(assistant.content).toBe('Final response')
    expect(assistant.status).toBe('completed')
    expect(assistant.canRetry).toBe(false)
    expect(assistant.error).toBeUndefined()
  })

  it('preserves partial content when a request is cancelled', () => {
    const state = chatReducer(streamingState(), {
      type: 'request-completed',
      requestId,
      assistantMessageId,
      status: 'cancelled',
      finalContent: 'Partial response',
    })

    const assistant = assistantFrom(state.messages)

    expect(state.activeRequestId).toBeUndefined()
    expect(state.activeAssistantMessageId).toBeUndefined()
    expect(state.activeTurn).toBeNull()
    expect(state.retryableTurn).toBeNull()
    expect(state.runStatus).toBe('cancelled')
    expect(assistant.content).toBe('Partial response')
    expect(assistant.status).toBe('cancelled')
    expect(assistant.canRetry).toBe(false)
    expect(assistant.error).toBeUndefined()
  })

  it('ignores stale request lifecycle events', () => {
    const state = streamingState()
    const staleActions = [
      {
        type: 'request-started' as const,
        requestId: staleRequestId,
        assistantMessageId,
      },
      {
        type: 'request-delta' as const,
        requestId: staleRequestId,
        assistantMessageId,
        snapshot: 'Stale response',
      },
      {
        type: 'request-completed' as const,
        requestId: staleRequestId,
        assistantMessageId,
        status: 'completed' as const,
        finalContent: 'Stale final response',
      },
      {
        type: 'request-failed' as const,
        requestId: staleRequestId,
        assistantMessageId,
        error: retryableError,
      },
    ]

    for (const action of staleActions) {
      expect(chatReducer(state, action)).toBe(state)
    }
  })

  it('ignores lifecycle events for a stale assistant message identity', () => {
    const submitted = submittedState()

    expect(
      chatReducer(submitted, {
        type: 'request-started',
        requestId,
        assistantMessageId: staleAssistantMessageId,
      }),
    ).toBe(submitted)

    const state = streamingState()
    const staleActions = [
      {
        type: 'request-delta' as const,
        requestId,
        assistantMessageId: staleAssistantMessageId,
        snapshot: 'Stale response',
      },
      {
        type: 'request-completed' as const,
        requestId,
        assistantMessageId: staleAssistantMessageId,
        status: 'completed' as const,
        finalContent: 'Stale final response',
      },
      {
        type: 'request-failed' as const,
        requestId,
        assistantMessageId: staleAssistantMessageId,
        error: retryableError,
      },
    ]

    for (const action of staleActions) {
      expect(chatReducer(state, action)).toBe(state)
    }
  })

  it('stores retryable failures on the assistant message', () => {
    const state = chatReducer(streamingState(), {
      type: 'request-failed',
      requestId,
      assistantMessageId,
      error: retryableError,
    })

    const assistant = assistantFrom(state.messages)

    expect(state.activeRequestId).toBeUndefined()
    expect(state.activeAssistantMessageId).toBeUndefined()
    expect(state.activeTurn).toBeNull()
    expect(state.retryableTurn).toEqual({
      userMessageId,
      assistantMessageId,
      turnUserMessage,
      submittedMessages,
    })
    expect(state.runStatus).toBe('failed')
    expect(assistant.status).toBe('failed')
    expect(assistant.error).toEqual(retryableError)
    expect(assistant.canRetry).toBe(true)
  })

  it('does not allow retry for non-retryable failures', () => {
    const nonRetryableError: NyxChatError = {
      code: 'auth_failed',
      message: 'Authentication failed.',
      retryable: false,
    }

    const state = chatReducer(streamingState(), {
      type: 'request-failed',
      requestId,
      assistantMessageId,
      error: nonRetryableError,
    })

    const assistant = assistantFrom(state.messages)

    expect(state.runStatus).toBe('failed')
    expect(state.activeTurn).toBeNull()
    expect(state.retryableTurn).toBeNull()
    expect(assistant.status).toBe('failed')
    expect(assistant.error).toEqual(nonRetryableError)
    expect(assistant.canRetry).toBe(false)
  })

  it('reuses the same user and assistant message identity when retrying', () => {
    const failedState = chatReducer(streamingState(), {
      type: 'request-failed',
      requestId,
      assistantMessageId,
      error: retryableError,
    })

    const state = chatReducer(failedState, {
      type: 'retry-requested',
      requestId: 'request-2',
      userMessageId,
      assistantMessageId,
      turnUserMessage,
      submittedMessages,
    })

    const assistant = assistantFrom(state.messages)

    expect(state.runStatus).toBe('submitting')
    expect(state.activeRequestId).toBe('request-2')
    expect(state.activeAssistantMessageId).toBe(assistantMessageId)
    expect(state.activeTurn).toEqual({
      requestId: 'request-2',
      userMessageId,
      assistantMessageId,
      turnUserMessage,
      submittedMessages,
    })
    expect(state.retryableTurn).toBeNull()
    expect(assistant.id).toBe(assistantMessageId)
    expect(assistant.content).toBe('')
    expect(assistant.status).toBe('pending')
    expect(assistant.error).toBeUndefined()
    expect(assistant.canRetry).toBe(false)
  })

  it('clears the chat back to the initial state', () => {
    const state = chatReducer(submittedState(), {
      type: 'clear-chat',
    })

    expect(state).toBe(initialChatState)
  })
})
