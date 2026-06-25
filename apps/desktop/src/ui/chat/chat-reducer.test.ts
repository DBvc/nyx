import { describe, expect, it } from 'vitest'

import type { NyxChatError, NyxChatInputMessage, NyxChatMessage } from '../../../shared/chat/types'
import { nyxChatReducer } from './chat-reducer'
import { initialNyxChatState } from './chat-types'

const requestId = 'request-1'
const assistantMessageId = 'assistant-1'
const staleRequestId = 'request-stale'

const submittedMessages: ReadonlyArray<NyxChatInputMessage> = [
  {
    role: 'user',
    content: 'Hello Nyx',
  },
]

const userMessage: NyxChatMessage = {
  id: 'user-1',
  role: 'user',
  content: 'Hello Nyx',
  status: 'completed',
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
  return nyxChatReducer(
    {
      ...initialNyxChatState,
      input: 'Hello Nyx',
    },
    {
      type: 'request-submitted',
      requestId,
      assistantMessageId,
      submittedMessages,
      userMessage,
      assistantMessage,
    },
  )
}

function streamingState() {
  return nyxChatReducer(submittedState(), {
    type: 'request-started',
    requestId,
  })
}

function assistantFrom(messages: ReadonlyArray<NyxChatMessage>) {
  const message = messages.find((candidate) => candidate.id === assistantMessageId)

  expect(message).toBeDefined()

  return message as NyxChatMessage
}

describe('nyxChatReducer', () => {
  it('records a submitted request and appends user and assistant messages', () => {
    const state = submittedState()

    expect(state.input).toBe('')
    expect(state.runStatus).toBe('submitting')
    expect(state.activeRequestId).toBe(requestId)
    expect(state.activeAssistantMessageId).toBe(assistantMessageId)
    expect(state.lastSubmittedMessages).toBe(submittedMessages)
    expect(state.lastAssistantMessageId).toBe(assistantMessageId)
    expect(state.messages).toEqual([userMessage, assistantMessage])
  })

  it('marks the pending assistant message as streaming when the request starts', () => {
    const state = streamingState()

    expect(state.runStatus).toBe('streaming')
    expect(assistantFrom(state.messages).status).toBe('streaming')
  })

  it('stores streaming snapshots on request deltas', () => {
    const state = nyxChatReducer(streamingState(), {
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
    const state = nyxChatReducer(streamingState(), {
      type: 'request-completed',
      requestId,
      assistantMessageId,
      status: 'completed',
      finalContent: 'Final response',
    })

    const assistant = assistantFrom(state.messages)

    expect(state.activeRequestId).toBeUndefined()
    expect(state.activeAssistantMessageId).toBeUndefined()
    expect(state.runStatus).toBe('completed')
    expect(assistant.content).toBe('Final response')
    expect(assistant.status).toBe('completed')
    expect(assistant.canRetry).toBe(false)
    expect(assistant.error).toBeUndefined()
  })

  it('preserves partial content when a request is cancelled', () => {
    const state = nyxChatReducer(streamingState(), {
      type: 'request-completed',
      requestId,
      assistantMessageId,
      status: 'cancelled',
      finalContent: 'Partial response',
    })

    const assistant = assistantFrom(state.messages)

    expect(state.activeRequestId).toBeUndefined()
    expect(state.activeAssistantMessageId).toBeUndefined()
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
      expect(nyxChatReducer(state, action)).toBe(state)
    }
  })

  it('stores retryable failures on the assistant message', () => {
    const state = nyxChatReducer(streamingState(), {
      type: 'request-failed',
      requestId,
      assistantMessageId,
      error: retryableError,
    })

    const assistant = assistantFrom(state.messages)

    expect(state.activeRequestId).toBeUndefined()
    expect(state.activeAssistantMessageId).toBeUndefined()
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

    const state = nyxChatReducer(streamingState(), {
      type: 'request-failed',
      requestId,
      assistantMessageId,
      error: nonRetryableError,
    })

    const assistant = assistantFrom(state.messages)

    expect(state.runStatus).toBe('failed')
    expect(assistant.status).toBe('failed')
    expect(assistant.error).toEqual(nonRetryableError)
    expect(assistant.canRetry).toBe(false)
  })

  it('reuses the same assistant message when retrying', () => {
    const failedState = nyxChatReducer(streamingState(), {
      type: 'request-failed',
      requestId,
      assistantMessageId,
      error: retryableError,
    })

    const retryMessages: ReadonlyArray<NyxChatInputMessage> = [
      {
        role: 'user',
        content: 'Try again',
      },
    ]

    const state = nyxChatReducer(failedState, {
      type: 'retry-requested',
      requestId: 'request-2',
      assistantMessageId,
      submittedMessages: retryMessages,
    })

    const assistant = assistantFrom(state.messages)

    expect(state.runStatus).toBe('submitting')
    expect(state.activeRequestId).toBe('request-2')
    expect(state.activeAssistantMessageId).toBe(assistantMessageId)
    expect(state.lastSubmittedMessages).toBe(retryMessages)
    expect(state.lastAssistantMessageId).toBe(assistantMessageId)
    expect(assistant.id).toBe(assistantMessageId)
    expect(assistant.content).toBe('')
    expect(assistant.status).toBe('pending')
    expect(assistant.error).toBeUndefined()
    expect(assistant.canRetry).toBe(false)
  })

  it('clears the chat back to the initial state', () => {
    const state = nyxChatReducer(submittedState(), {
      type: 'clear-chat',
    })

    expect(state).toBe(initialNyxChatState)
  })
})
