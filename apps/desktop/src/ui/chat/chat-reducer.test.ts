import { describe, expect, it } from 'vitest'

import type { NyxChatError, NyxChatInputMessage, NyxChatMessage } from '../../../shared/chat/types'
import type { NyxCurrentThreadSnapshot } from '../../../shared/chat/snapshot'
import { chatReducer } from './chat-reducer'
import { initialChatState } from './chat-types'

const requestId = 'request-1'
const userMessageId = 'user-1'
const assistantMessageId = 'assistant-1'
const staleRequestId = 'request-stale'
const staleAssistantMessageId = 'assistant-stale'
const targetSelection = {
  kind: 'connection',
  providerId: 'provider-1',
  modelId: 'model-1',
} as const
const targetAttribution = {
  kind: 'connection',
  providerId: 'provider-1',
  providerDisplayName: 'Provider One',
  modelId: 'model-1',
  modelDisplayName: 'Model One',
} as const

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
      targetSelection,
    },
  )
}

function streamingState() {
  return chatReducer(submittedState(), {
    type: 'request-started',
    requestId,
    assistantMessageId,
    targetAttribution,
  })
}

function assistantFrom(messages: ReadonlyArray<NyxChatMessage>) {
  const message = messages.find((candidate) => candidate.id === assistantMessageId)

  expect(message).toBeDefined()

  return message as NyxChatMessage
}

describe('chatReducer', () => {
  it('starts with current thread hydration blocking the renderer projection', () => {
    expect(initialChatState.hydrationStatus).toBe('loading')
    expect(initialChatState.hydrationError).toBeNull()
    expect(initialChatState.projectionGeneration).toBe(0)
    expect(initialChatState.resetStatus).toBe('idle')
    expect(initialChatState.resetError).toBeNull()
  })

  it('hydrates an empty current thread into a ready state with no active identity', () => {
    const state = chatReducer(
      {
        ...initialChatState,
        input: 'must be cleared',
        activeRequestId: 'stale-request',
      },
      {
        type: 'current-thread-hydrated',
        generation: 0,
        snapshot: null,
      },
    )

    expect(state).toEqual({
      ...initialChatState,
      hydrationStatus: 'ready',
    })
  })

  it('hydrates terminal messages and retry metadata without restoring active ids or input', () => {
    const snapshot: NyxCurrentThreadSnapshot = {
      messages: [userMessage, { ...assistantMessage, status: 'failed', error: retryableError }],
      runStatus: 'failed',
      retryableTurn: {
        userMessageId,
        assistantMessageId,
        turnUserMessage,
        submittedMessages,
      },
      selectedTarget: targetSelection,
    }
    const state = chatReducer(initialChatState, {
      type: 'current-thread-hydrated',
      generation: 0,
      snapshot,
    })

    expect(state.messages).toEqual(snapshot.messages)
    expect(state.runStatus).toBe('failed')
    expect(state.retryableTurn).toEqual(snapshot.retryableTurn)
    expect(state.input).toBe('')
    expect(state.activeRequestId).toBeUndefined()
    expect(state.activeAssistantMessageId).toBeUndefined()
    expect(state.activeTurn).toBeNull()
    expect(state.hydrationStatus).toBe('ready')
    expect(state.hydrationError).toBeNull()
  })

  it('stores only the safe current thread load error and remains blocked', () => {
    const state = chatReducer(initialChatState, {
      type: 'current-thread-hydration-failed',
      generation: 0,
      error: {
        code: 'load_failed',
        message: 'Nyx could not load the current thread.',
      },
    })

    expect(state.hydrationStatus).toBe('error')
    expect(state.hydrationError).toEqual({
      code: 'load_failed',
      message: 'Nyx could not load the current thread.',
    })
    expect(state.messages).toEqual([])
    expect(state.activeRequestId).toBeUndefined()
  })

  it('seeds once and lets later catalog updates change availability without changing the draft', () => {
    const hydrated = chatReducer(initialChatState, {
      type: 'current-thread-hydrated',
      generation: 0,
      snapshot: null,
    })
    const seeded = chatReducer(hydrated, {
      type: 'target-context-ready',
      generation: 0,
      catalogEpoch: 2,
      selection: targetSelection,
      available: true,
    })
    const refreshed = chatReducer(seeded, {
      type: 'target-catalog-updated',
      generation: 0,
      catalogEpoch: 3,
      available: false,
    })
    const stale = chatReducer(refreshed, {
      type: 'target-catalog-updated',
      generation: 0,
      catalogEpoch: 2,
      available: true,
    })

    expect(refreshed.targetDraft).toEqual(targetSelection)
    expect(refreshed.targetAvailable).toBe(false)
    expect(stale).toBe(refreshed)
  })

  it('accepts only the registered post-reset catalog epoch for a new seed', () => {
    const resetting = chatReducer(initialChatState, {
      type: 'reset-started',
      generation: 1,
      minimumCatalogEpoch: 6,
    })
    const cleared = chatReducer(resetting, {
      type: 'clear-chat',
      generation: 1,
      minimumCatalogEpoch: 6,
    })
    const stale = chatReducer(cleared, {
      type: 'target-context-ready',
      generation: 1,
      catalogEpoch: 5,
      selection: targetSelection,
      available: true,
    })
    const seeded = chatReducer(stale, {
      type: 'target-context-ready',
      generation: 1,
      catalogEpoch: 6,
      selection: { kind: 'env_fallback' },
      available: true,
    })

    expect(stale).toBe(cleared)
    expect(seeded.targetDraft).toEqual({ kind: 'env_fallback' })
    expect(seeded.targetInitialized).toBe(true)
  })

  it('blocks the projection while reset is in progress', () => {
    const state = chatReducer(submittedState(), {
      type: 'reset-started',
      generation: 1,
      minimumCatalogEpoch: 2,
    })

    expect(state.resetStatus).toBe('resetting')
    expect(state.resetError).toBeNull()
    expect(state.projectionGeneration).toBe(1)
    expect(state.activeRequestId).toBeUndefined()
    expect(state.activeAssistantMessageId).toBeUndefined()
    expect(state.activeTurn).toBeNull()
    expect(state.retryableTurn).toBeNull()
  })

  it('ignores a stale hydration result after reset advances the projection generation', () => {
    const resettingState = chatReducer(submittedState(), {
      type: 'reset-started',
      generation: 1,
      minimumCatalogEpoch: 2,
    })
    const state = chatReducer(resettingState, {
      type: 'current-thread-hydrated',
      generation: 0,
      snapshot: null,
    })

    expect(state).toBe(resettingState)
    expect(state.resetStatus).toBe('resetting')
    expect(state.projectionGeneration).toBe(1)
  })

  it('keeps reset failure safe and blocks stale conversation actions', () => {
    const resettingState = chatReducer(submittedState(), {
      type: 'reset-started',
      generation: 1,
      minimumCatalogEpoch: 2,
    })
    const state = chatReducer(resettingState, {
      type: 'reset-failed',
      generation: 1,
      error: {
        code: 'reset_failed',
        message: 'Nyx could not start a fresh thread.',
      },
      restoreTargetInitialized: true,
      restoreTargetAvailable: true,
      restoreMinimumCatalogEpoch: 0,
    })

    expect(state.hydrationStatus).toBe('error')
    expect(state.resetStatus).toBe('idle')
    expect(state.resetError).toEqual({
      code: 'reset_failed',
      message: 'Nyx could not start a fresh thread.',
    })
    expect(state.activeRequestId).toBeUndefined()
    expect(state.activeAssistantMessageId).toBeUndefined()
    expect(state.activeTurn).toBeNull()
    expect(state.retryableTurn).toBeNull()
  })

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
      targetSelection,
    })
    expect(state.retryableTurn).toBeNull()
    expect(state.messages).toEqual([userMessage, assistantMessage])
  })

  it('keeps the active selection immutable when the Composer draft changes', () => {
    const submitted = {
      ...submittedState(),
      targetInitialized: true,
      targetAvailable: true,
      targetDraft: targetSelection,
    }
    const changed = chatReducer(submitted, {
      type: 'target-draft-changed',
      selection: { kind: 'env_fallback' },
      available: true,
    })

    expect(changed.activeTurn?.targetSelection).toEqual(targetSelection)
    expect(changed.targetDraft).toEqual({ kind: 'env_fallback' })
  })

  it('keeps active attribution after the Composer draft changes during generation', () => {
    const streaming = {
      ...streamingState(),
      targetInitialized: true,
      targetAvailable: true,
      targetDraft: targetSelection,
    }
    const changed = chatReducer(streaming, {
      type: 'target-draft-changed',
      selection: { kind: 'env_fallback' },
      available: true,
    })
    const completed = chatReducer(changed, {
      type: 'request-completed',
      requestId,
      assistantMessageId,
      status: 'completed',
      finalContent: 'Final response',
    })

    expect(changed.activeTurn?.targetSelection).toEqual(targetSelection)
    expect(assistantFrom(completed.messages).targetAttribution).toEqual(targetAttribution)
  })

  it('marks the pending assistant message as streaming when the request starts', () => {
    const state = streamingState()

    expect(state.runStatus).toBe('streaming')
    expect(assistantFrom(state.messages).status).toBe('streaming')
    expect(assistantFrom(state.messages).targetAttribution).toEqual(targetAttribution)
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
        targetAttribution,
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
        targetAttribution,
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

  it('retains attribution on a post-bind failure even when chat:start was not observed', () => {
    const state = chatReducer(submittedState(), {
      type: 'request-failed',
      requestId,
      assistantMessageId,
      error: retryableError,
      targetAttribution,
    })

    expect(assistantFrom(state.messages).targetAttribution).toEqual(targetAttribution)
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

  it('reuses message identity and binds the current Composer draft when retrying', () => {
    const failedState = chatReducer(streamingState(), {
      type: 'request-failed',
      requestId,
      assistantMessageId,
      error: retryableError,
    })

    const selectedForRetry = chatReducer(
      {
        ...failedState,
        targetInitialized: true,
        targetDraft: targetSelection,
      },
      {
        type: 'target-draft-changed',
        selection: { kind: 'env_fallback' },
        available: true,
      },
    )

    const state = chatReducer(selectedForRetry, {
      type: 'retry-requested',
      requestId: 'request-2',
      userMessageId,
      assistantMessageId,
      turnUserMessage,
      submittedMessages,
      targetSelection: { kind: 'env_fallback' },
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
      targetSelection: { kind: 'env_fallback' },
    })
    expect(state.retryableTurn).toBeNull()
    expect(assistant.id).toBe(assistantMessageId)
    expect(assistant.content).toBe('')
    expect(assistant.status).toBe('pending')
    expect(assistant.error).toBeUndefined()
    expect(assistant.canRetry).toBe(false)
    expect(assistant.targetAttribution).toBeUndefined()
  })

  it('clears the chat back to the initial state', () => {
    const resettingState = chatReducer(submittedState(), {
      type: 'reset-started',
      generation: 1,
      minimumCatalogEpoch: 2,
    })
    const state = chatReducer(resettingState, {
      type: 'clear-chat',
      generation: 1,
      minimumCatalogEpoch: 3,
    })

    expect(state).toEqual({
      ...initialChatState,
      hydrationStatus: 'ready',
      projectionGeneration: 1,
      targetMinimumCatalogEpoch: 3,
    })
  })
})
