import type { WebContents } from 'electron'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { NyxChatEvent } from '../../../shared/chat/events'
import type { NyxChatRequest } from '../../../shared/chat/types'
import { NYX_CHAT_IPC_CHANNELS } from '../../../shared/chat/ipc'
import {
  RuntimeChatStateClientError,
  type RuntimeChatStateClient,
  type RuntimeChatReducerState,
} from '../runtime/chat-state-client'

const streamChatCompletion = vi.hoisted(() => vi.fn())

vi.mock('./client', () => ({
  streamChatCompletion,
}))

vi.mock('./env', () => ({
  readChatProviderConfig: () => ({
    baseUrl: 'https://example.com/v1/',
    token: 'token',
    model: 'model',
  }),
}))

import { ChatSessionManager, validateChatRequest } from './session'

function validRequest(): NyxChatRequest {
  return {
    requestId: 'request-1',
    userMessageId: 'user-1',
    assistantMessageId: 'assistant-1',
    turnIntent: 'new_user_message',
    turnUserMessage: {
      id: 'user-1',
      content: 'Hello Nyx',
    },
    messages: [
      {
        role: 'user',
        content: 'Hello Nyx',
      },
    ],
  }
}

function requestWithIds({
  requestId,
  userMessageId,
  assistantMessageId,
  content,
}: {
  requestId: string
  userMessageId: string
  assistantMessageId: string
  content: string
}): NyxChatRequest {
  return {
    ...validRequest(),
    requestId,
    userMessageId,
    assistantMessageId,
    turnUserMessage: {
      id: userMessageId,
      content,
    },
    messages: [
      {
        role: 'user',
        content,
      },
    ],
  }
}

function mockSender(eventOrder?: string[]) {
  const listeners = new Map<string, Set<() => void>>()
  const sender = {
    isDestroyed: vi.fn(() => false),
    send: vi.fn((_channel: string, event: NyxChatEvent) => {
      eventOrder?.push(`event:${event.type}`)
    }),
    once: vi.fn(),
    off: vi.fn(),
    emitDestroyed: vi.fn(),
  }

  sender.once.mockImplementation((event: string, listener: () => void) => {
    const eventListeners = listeners.get(event) ?? new Set<() => void>()

    eventListeners.add(listener)
    listeners.set(event, eventListeners)

    return sender
  })
  sender.off.mockImplementation((event: string, listener: () => void) => {
    listeners.get(event)?.delete(listener)

    return sender
  })
  sender.emitDestroyed.mockImplementation(() => {
    sender.isDestroyed.mockReturnValue(true)

    const destroyedListeners = listeners.get('destroyed')

    if (destroyedListeners) {
      for (const listener of destroyedListeners) {
        listener()
      }
    }

    listeners.delete('destroyed')
  })

  return sender as unknown as WebContents & typeof sender
}

function sentChatEvents(sender: ReturnType<typeof mockSender>) {
  return sender.send.mock.calls.map(([_channel, event]) => event as NyxChatEvent)
}

async function waitForAssertion(assertion: () => void) {
  let lastError: unknown

  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      assertion()
      return
    } catch (error) {
      lastError = error
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
  }

  throw lastError
}

function abortError() {
  const error = new Error('Aborted')
  error.name = 'AbortError'
  return error
}

function runtimeState(): RuntimeChatReducerState {
  return {
    transcript: [],
    current_turn: {
      type: 'no_turn',
    },
  }
}

function fakeRuntimeChatStateClient(order?: string[]) {
  const track = (name: string) =>
    vi.fn(async () => {
      order?.push(`runtime:${name}`)
      return runtimeState()
    })
  const client: RuntimeChatStateClient = {
    submitUserMessage: track('submitUserMessage'),
    retryFailed: track('retryFailed'),
    startAssistant: track('startAssistant'),
    appendDelta: track('appendDelta'),
    complete: track('complete'),
    cancel: track('cancel'),
    fail: track('fail'),
    clear: track('clear'),
    close: vi.fn(() => {
      order?.push('runtime:close')
    }),
  }

  return client
}

describe('validateChatRequest', () => {
  it('accepts a complete new user message request', () => {
    expect(validateChatRequest(validRequest())).toBeNull()
  })

  it('accepts a complete retry failed response request', () => {
    expect(
      validateChatRequest({
        ...validRequest(),
        turnIntent: 'retry_failed_response',
      }),
    ).toBeNull()
  })

  it('requires a stable user message id', () => {
    expect(
      validateChatRequest({
        ...validRequest(),
        userMessageId: '',
      }),
    ).toEqual({
      code: 'invalid_request',
      message:
        'Chat requests must include ids, intent, the current user message, and at least one provider message.',
      retryable: false,
    })
  })

  it('requires an explicit current user message identity', () => {
    const { turnUserMessage: _turnUserMessage, ...request } = validRequest()

    expect(validateChatRequest(request as NyxChatRequest)).toEqual({
      code: 'invalid_request',
      message:
        'Chat requests must include ids, intent, the current user message, and at least one provider message.',
      retryable: false,
    })
  })

  it('requires the current user message id to match userMessageId', () => {
    expect(
      validateChatRequest({
        ...validRequest(),
        turnUserMessage: {
          id: 'other-user',
          content: 'Hello Nyx',
        },
      }),
    ).toEqual({
      code: 'invalid_request',
      message: 'Chat requests must keep the current user message id aligned with userMessageId.',
      retryable: false,
    })
  })

  it('requires the current user message content to match the provider-visible prompt', () => {
    expect(
      validateChatRequest({
        ...validRequest(),
        turnUserMessage: {
          id: 'user-1',
          content: 'Runtime prompt',
        },
        messages: [
          {
            role: 'user',
            content: 'Provider prompt',
          },
        ],
      }),
    ).toEqual({
      code: 'invalid_request',
      message:
        'Chat requests must keep the current user message content aligned with provider messages.',
      retryable: false,
    })
  })

  it('requires a known product turn intent', () => {
    expect(
      validateChatRequest({
        ...validRequest(),
        turnIntent: 'unknown_intent' as NyxChatRequest['turnIntent'],
      }),
    ).toEqual({
      code: 'invalid_request',
      message: 'Chat requests must use a known turn intent.',
      retryable: false,
    })
  })
})

describe('ChatSessionManager reset', () => {
  beforeEach(() => {
    streamChatCompletion.mockReset()
  })

  it('aborts and clears the active session for the same sender', () => {
    let signal: AbortSignal | undefined
    streamChatCompletion.mockImplementation(({ signal: activeSignal }: { signal: AbortSignal }) => {
      signal = activeSignal
      return new Promise(() => {})
    })
    const sender = mockSender()
    const manager = new ChatSessionManager()

    manager.start(sender, validRequest())
    manager.reset(sender)

    expect(signal?.aborted).toBe(true)
    expect(sender.send).toHaveBeenCalledWith(NYX_CHAT_IPC_CHANNELS.event, {
      type: 'chat:start',
      requestId: 'request-1',
      assistantMessageId: 'assistant-1',
      status: 'streaming',
    })

    manager.start(sender, {
      ...validRequest(),
      requestId: 'request-2',
      assistantMessageId: 'assistant-2',
    })

    expect(streamChatCompletion).toHaveBeenCalledTimes(2)
  })

  it('does not reset an active session owned by another sender', () => {
    let signal: AbortSignal | undefined
    streamChatCompletion.mockImplementation(({ signal: activeSignal }: { signal: AbortSignal }) => {
      signal = activeSignal
      return new Promise(() => {})
    })
    const sender = mockSender()
    const otherSender = mockSender()
    const manager = new ChatSessionManager()

    manager.start(sender, validRequest())
    manager.reset(otherSender)

    expect(signal?.aborted).toBe(false)
  })
})

describe('ChatSessionManager runtime chat state gate', () => {
  beforeEach(() => {
    streamChatCompletion.mockReset()
  })

  it('does not create a runtime chat state client when the env gate is off', async () => {
    streamChatCompletion.mockImplementation(
      async ({ onDelta }: { onDelta: (delta: string, snapshot: string) => Promise<void> }) => {
        await onDelta('Hi', 'Hi')
        return { finalContent: 'Hi' }
      },
    )
    const createRuntimeChatStateClient = vi.fn(() => fakeRuntimeChatStateClient())
    const sender = mockSender()
    const manager = new ChatSessionManager({
      env: {},
      createRuntimeChatStateClient,
    })

    manager.start(sender, validRequest())

    expect(createRuntimeChatStateClient).not.toHaveBeenCalled()
    expect(sender.send).toHaveBeenCalledWith(NYX_CHAT_IPC_CHANNELS.event, {
      type: 'chat:start',
      requestId: 'request-1',
      assistantMessageId: 'assistant-1',
      status: 'streaming',
    })

    await waitForAssertion(() => {
      expect(sentChatEvents(sender).at(-1)).toEqual({
        type: 'chat:done',
        requestId: 'request-1',
        assistantMessageId: 'assistant-1',
        status: 'completed',
        finalContent: 'Hi',
      })
    })
  })

  it('runs a new user message through runtime state before streaming events', async () => {
    const order: string[] = []
    streamChatCompletion.mockImplementation(
      async ({ onDelta }: { onDelta: (delta: string, snapshot: string) => Promise<void> }) => {
        order.push('provider:start')
        await onDelta('Hel', 'Hel')
        order.push('provider:afterDelta')
        return { finalContent: 'Hello' }
      },
    )
    const runtimeClient = fakeRuntimeChatStateClient(order)
    const sender = mockSender(order)
    const manager = new ChatSessionManager({
      env: {
        NYX_RUNTIME_CHAT_STATE: '1',
      },
      createRuntimeChatStateClient: () => {
        order.push('runtime:factory')
        return runtimeClient
      },
    })

    manager.start(sender, validRequest())

    await waitForAssertion(() => {
      expect(sentChatEvents(sender).at(-1)).toEqual({
        type: 'chat:done',
        requestId: 'request-1',
        assistantMessageId: 'assistant-1',
        status: 'completed',
        finalContent: 'Hello',
      })
    })

    expect(runtimeClient.submitUserMessage).toHaveBeenCalledWith({
      turnRequestId: 'request-1',
      userMessageId: 'user-1',
      assistantMessageId: 'assistant-1',
      content: 'Hello Nyx',
    })
    expect(runtimeClient.startAssistant).toHaveBeenCalledWith({
      turnRequestId: 'request-1',
      assistantMessageId: 'assistant-1',
    })
    expect(runtimeClient.appendDelta).toHaveBeenCalledWith({
      turnRequestId: 'request-1',
      assistantMessageId: 'assistant-1',
      snapshot: 'Hel',
    })
    expect(runtimeClient.complete).toHaveBeenCalledWith({
      turnRequestId: 'request-1',
      assistantMessageId: 'assistant-1',
      finalContent: 'Hello',
    })
    expect(order).toEqual([
      'runtime:factory',
      'runtime:submitUserMessage',
      'runtime:startAssistant',
      'event:chat:start',
      'provider:start',
      'runtime:appendDelta',
      'event:chat:delta',
      'provider:afterDelta',
      'runtime:complete',
      'event:chat:done',
    ])
  })

  it('uses explicit turn user message content for runtime submit when provider context is aligned', async () => {
    streamChatCompletion.mockResolvedValue({ finalContent: 'Hello' })
    const runtimeClient = fakeRuntimeChatStateClient()
    const sender = mockSender()
    const manager = new ChatSessionManager({
      env: {
        NYX_RUNTIME_CHAT_STATE: '1',
      },
      createRuntimeChatStateClient: () => runtimeClient,
    })

    manager.start(sender, {
      ...validRequest(),
      turnUserMessage: {
        id: 'user-1',
        content: 'Explicit current prompt',
      },
      messages: [
        {
          role: 'user',
          content: 'Earlier provider context',
        },
        {
          role: 'assistant',
          content: 'Earlier assistant context',
        },
        {
          role: 'user',
          content: 'Explicit current prompt',
        },
      ],
    })

    await waitForAssertion(() => {
      expect(sentChatEvents(sender).at(-1)).toEqual({
        type: 'chat:done',
        requestId: 'request-1',
        assistantMessageId: 'assistant-1',
        status: 'completed',
        finalContent: 'Hello',
      })
    })

    expect(runtimeClient.submitUserMessage).toHaveBeenCalledWith({
      turnRequestId: 'request-1',
      userMessageId: 'user-1',
      assistantMessageId: 'assistant-1',
      content: 'Explicit current prompt',
    })
  })

  it('retries a failed response without resubmitting the user message', async () => {
    streamChatCompletion.mockResolvedValue({ finalContent: 'Retried answer' })
    const runtimeClient = fakeRuntimeChatStateClient()
    const sender = mockSender()
    const manager = new ChatSessionManager({
      env: {
        NYX_RUNTIME_CHAT_STATE: '1',
      },
      createRuntimeChatStateClient: () => runtimeClient,
    })

    manager.start(sender, {
      ...validRequest(),
      requestId: 'request-retry-1',
      turnIntent: 'retry_failed_response',
    })

    await waitForAssertion(() => {
      expect(sentChatEvents(sender).at(-1)).toEqual({
        type: 'chat:done',
        requestId: 'request-retry-1',
        assistantMessageId: 'assistant-1',
        status: 'completed',
        finalContent: 'Retried answer',
      })
    })

    expect(runtimeClient.submitUserMessage).not.toHaveBeenCalled()
    expect(runtimeClient.retryFailed).toHaveBeenCalledWith({
      turnRequestId: 'request-retry-1',
      userMessageId: 'user-1',
      assistantMessageId: 'assistant-1',
    })
    expect(runtimeClient.startAssistant).toHaveBeenCalledWith({
      turnRequestId: 'request-retry-1',
      assistantMessageId: 'assistant-1',
    })
  })

  it('records provider failures in runtime state before emitting chat errors', async () => {
    const order: string[] = []
    streamChatCompletion.mockRejectedValue(new Error('Provider exploded'))
    const runtimeClient = fakeRuntimeChatStateClient(order)
    const sender = mockSender(order)
    const manager = new ChatSessionManager({
      env: {
        NYX_RUNTIME_CHAT_STATE: '1',
      },
      createRuntimeChatStateClient: () => runtimeClient,
    })

    manager.start(sender, validRequest())

    await waitForAssertion(() => {
      expect(sentChatEvents(sender).at(-1)).toEqual({
        type: 'chat:error',
        requestId: 'request-1',
        assistantMessageId: 'assistant-1',
        status: 'failed',
        error: {
          code: 'unknown',
          message: 'Provider exploded',
          retryable: true,
        },
      })
    })

    expect(runtimeClient.fail).toHaveBeenCalledWith({
      turnRequestId: 'request-1',
      assistantMessageId: 'assistant-1',
      message: 'Provider exploded',
    })
    expect(order.slice(-2)).toEqual(['runtime:fail', 'event:chat:error'])
  })

  it('records cancellation in runtime state before emitting cancelled done', async () => {
    let activeSignal: AbortSignal | undefined
    streamChatCompletion.mockImplementation(
      async ({
        signal,
        onDelta,
      }: {
        signal: AbortSignal
        onDelta: (delta: string, snapshot: string) => Promise<void>
      }) => {
        activeSignal = signal
        await onDelta('Part', 'Part')

        return await new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(abortError()), { once: true })
        })
      },
    )
    const runtimeClient = fakeRuntimeChatStateClient()
    const sender = mockSender()
    const manager = new ChatSessionManager({
      env: {
        NYX_RUNTIME_CHAT_STATE: '1',
      },
      createRuntimeChatStateClient: () => runtimeClient,
    })

    manager.start(sender, validRequest())

    await waitForAssertion(() => {
      expect(sentChatEvents(sender).at(-1)).toMatchObject({
        type: 'chat:delta',
        snapshot: 'Part',
      })
    })

    manager.cancel({ requestId: 'request-1' })

    await waitForAssertion(() => {
      expect(sentChatEvents(sender).at(-1)).toEqual({
        type: 'chat:done',
        requestId: 'request-1',
        assistantMessageId: 'assistant-1',
        status: 'cancelled',
        finalContent: 'Part',
      })
    })

    expect(activeSignal?.aborted).toBe(true)
    expect(runtimeClient.cancel).toHaveBeenCalledWith({
      turnRequestId: 'request-1',
      assistantMessageId: 'assistant-1',
      finalContent: 'Part',
    })
  })

  it('clears runtime chat state on reset', async () => {
    let activeSignal: AbortSignal | undefined
    streamChatCompletion.mockImplementation(({ signal }: { signal: AbortSignal }) => {
      activeSignal = signal
      return new Promise(() => {})
    })
    const runtimeClient = fakeRuntimeChatStateClient()
    const sender = mockSender()
    const manager = new ChatSessionManager({
      env: {
        NYX_RUNTIME_CHAT_STATE: '1',
      },
      createRuntimeChatStateClient: () => runtimeClient,
    })

    manager.start(sender, validRequest())

    await waitForAssertion(() => {
      expect(streamChatCompletion).toHaveBeenCalledTimes(1)
    })

    await manager.reset(sender)

    expect(activeSignal?.aborted).toBe(true)
    expect(runtimeClient.clear).toHaveBeenCalledTimes(1)
    expect(runtimeClient.close).toHaveBeenCalledTimes(1)
  })

  it('does not clear runtime chat state for another sender', async () => {
    streamChatCompletion.mockResolvedValue({ finalContent: 'Done' })
    const runtimeClient = fakeRuntimeChatStateClient()
    const sender = mockSender()
    const otherSender = mockSender()
    const manager = new ChatSessionManager({
      env: {
        NYX_RUNTIME_CHAT_STATE: '1',
      },
      createRuntimeChatStateClient: () => runtimeClient,
    })

    manager.start(sender, validRequest())

    await waitForAssertion(() => {
      expect(sentChatEvents(sender).at(-1)).toEqual({
        type: 'chat:done',
        requestId: 'request-1',
        assistantMessageId: 'assistant-1',
        status: 'completed',
        finalContent: 'Done',
      })
    })

    await manager.reset(otherSender)

    expect(runtimeClient.clear).not.toHaveBeenCalled()
    expect(runtimeClient.close).not.toHaveBeenCalled()
  })

  it('keeps separate runtime chat state clients per sender', async () => {
    streamChatCompletion.mockResolvedValue({ finalContent: 'Done' })
    const firstRuntimeClient = fakeRuntimeChatStateClient()
    const secondRuntimeClient = fakeRuntimeChatStateClient()
    const createRuntimeChatStateClient = vi
      .fn()
      .mockReturnValueOnce(firstRuntimeClient)
      .mockReturnValueOnce(secondRuntimeClient)
    const sender = mockSender()
    const otherSender = mockSender()
    const manager = new ChatSessionManager({
      env: {
        NYX_RUNTIME_CHAT_STATE: '1',
      },
      createRuntimeChatStateClient,
    })

    manager.start(sender, validRequest())

    await waitForAssertion(() => {
      expect(sentChatEvents(sender).at(-1)).toEqual({
        type: 'chat:done',
        requestId: 'request-1',
        assistantMessageId: 'assistant-1',
        status: 'completed',
        finalContent: 'Done',
      })
    })

    manager.start(
      otherSender,
      requestWithIds({
        requestId: 'request-2',
        userMessageId: 'user-2',
        assistantMessageId: 'assistant-2',
        content: 'Hello from another sender',
      }),
    )

    await waitForAssertion(() => {
      expect(sentChatEvents(otherSender).at(-1)).toEqual({
        type: 'chat:done',
        requestId: 'request-2',
        assistantMessageId: 'assistant-2',
        status: 'completed',
        finalContent: 'Done',
      })
    })

    expect(firstRuntimeClient.close).not.toHaveBeenCalled()
    expect(secondRuntimeClient.submitUserMessage).toHaveBeenCalledWith({
      turnRequestId: 'request-2',
      userMessageId: 'user-2',
      assistantMessageId: 'assistant-2',
      content: 'Hello from another sender',
    })
    expect(createRuntimeChatStateClient).toHaveBeenCalledTimes(2)

    manager.start(
      sender,
      requestWithIds({
        requestId: 'request-3',
        userMessageId: 'user-3',
        assistantMessageId: 'assistant-3',
        content: 'Back to the first sender',
      }),
    )

    await waitForAssertion(() => {
      expect(sentChatEvents(sender).at(-1)).toEqual({
        type: 'chat:done',
        requestId: 'request-3',
        assistantMessageId: 'assistant-3',
        status: 'completed',
        finalContent: 'Done',
      })
    })

    expect(createRuntimeChatStateClient).toHaveBeenCalledTimes(2)
    expect(firstRuntimeClient.submitUserMessage).toHaveBeenCalledWith({
      turnRequestId: 'request-3',
      userMessageId: 'user-3',
      assistantMessageId: 'assistant-3',
      content: 'Back to the first sender',
    })
  })

  it('clears an idle sender runtime state without aborting another active sender', async () => {
    let activeSignal: AbortSignal | undefined
    streamChatCompletion
      .mockResolvedValueOnce({ finalContent: 'Done' })
      .mockImplementationOnce(({ signal }: { signal: AbortSignal }) => {
        activeSignal = signal

        return new Promise(() => {})
      })
    const idleRuntimeClient = fakeRuntimeChatStateClient()
    const activeRuntimeClient = fakeRuntimeChatStateClient()
    const createRuntimeChatStateClient = vi
      .fn()
      .mockReturnValueOnce(idleRuntimeClient)
      .mockReturnValueOnce(activeRuntimeClient)
    const sender = mockSender()
    const otherSender = mockSender()
    const manager = new ChatSessionManager({
      env: {
        NYX_RUNTIME_CHAT_STATE: '1',
      },
      createRuntimeChatStateClient,
    })

    manager.start(sender, validRequest())

    await waitForAssertion(() => {
      expect(sentChatEvents(sender).at(-1)).toEqual({
        type: 'chat:done',
        requestId: 'request-1',
        assistantMessageId: 'assistant-1',
        status: 'completed',
        finalContent: 'Done',
      })
    })

    manager.start(
      otherSender,
      requestWithIds({
        requestId: 'request-2',
        userMessageId: 'user-2',
        assistantMessageId: 'assistant-2',
        content: 'Keep streaming',
      }),
    )

    await waitForAssertion(() => {
      expect(streamChatCompletion).toHaveBeenCalledTimes(2)
    })

    await manager.reset(sender)

    expect(activeSignal?.aborted).toBe(false)
    expect(idleRuntimeClient.clear).toHaveBeenCalledTimes(1)
    expect(idleRuntimeClient.close).toHaveBeenCalledTimes(1)
    expect(activeRuntimeClient.clear).not.toHaveBeenCalled()
    expect(activeRuntimeClient.close).not.toHaveBeenCalled()
  })

  it('closes runtime chat state when the owning sender is destroyed', async () => {
    let activeSignal: AbortSignal | undefined
    streamChatCompletion.mockImplementation(({ signal }: { signal: AbortSignal }) => {
      activeSignal = signal

      return new Promise(() => {})
    })
    const runtimeClient = fakeRuntimeChatStateClient()
    const sender = mockSender()
    const manager = new ChatSessionManager({
      env: {
        NYX_RUNTIME_CHAT_STATE: '1',
      },
      createRuntimeChatStateClient: () => runtimeClient,
    })

    manager.start(sender, validRequest())

    await waitForAssertion(() => {
      expect(streamChatCompletion).toHaveBeenCalledTimes(1)
    })

    sender.emitDestroyed()

    expect(activeSignal?.aborted).toBe(true)
    expect(runtimeClient.close).toHaveBeenCalledTimes(1)
  })

  it('emits a chat error without calling the provider when runtime state setup fails', async () => {
    const runtimeClient = fakeRuntimeChatStateClient()
    vi.mocked(runtimeClient.submitUserMessage).mockRejectedValueOnce(new Error('Runtime failed'))
    const sender = mockSender()
    const manager = new ChatSessionManager({
      env: {
        NYX_RUNTIME_CHAT_STATE: '1',
      },
      createRuntimeChatStateClient: () => runtimeClient,
    })

    manager.start(sender, validRequest())

    await waitForAssertion(() => {
      expect(sentChatEvents(sender)).toEqual([
        {
          type: 'chat:error',
          requestId: 'request-1',
          assistantMessageId: 'assistant-1',
          status: 'failed',
          error: {
            code: 'unknown',
            message: 'Runtime failed',
            retryable: false,
          },
        },
      ])
    })
    expect(streamChatCompletion).not.toHaveBeenCalled()
    expect(runtimeClient.close).toHaveBeenCalledTimes(1)
  })

  it('recreates the runtime client after a setup failure is discarded', async () => {
    streamChatCompletion.mockResolvedValue({ finalContent: 'Recovered' })
    const failedRuntimeClient = fakeRuntimeChatStateClient()
    const recoveredRuntimeClient = fakeRuntimeChatStateClient()
    vi.mocked(failedRuntimeClient.submitUserMessage).mockRejectedValueOnce(
      new RuntimeChatStateClientError('Runtime setup failed'),
    )
    const createRuntimeChatStateClient = vi
      .fn()
      .mockReturnValueOnce(failedRuntimeClient)
      .mockReturnValueOnce(recoveredRuntimeClient)
    const sender = mockSender()
    const manager = new ChatSessionManager({
      env: {
        NYX_RUNTIME_CHAT_STATE: '1',
      },
      createRuntimeChatStateClient,
    })

    manager.start(sender, validRequest())

    await waitForAssertion(() => {
      expect(sentChatEvents(sender).at(-1)).toEqual({
        type: 'chat:error',
        requestId: 'request-1',
        assistantMessageId: 'assistant-1',
        status: 'failed',
        error: {
          code: 'unknown',
          message: 'Runtime setup failed',
          retryable: false,
        },
      })
    })

    manager.start(sender, {
      ...validRequest(),
      requestId: 'request-2',
      assistantMessageId: 'assistant-2',
    })

    await waitForAssertion(() => {
      expect(sentChatEvents(sender).at(-1)).toEqual({
        type: 'chat:done',
        requestId: 'request-2',
        assistantMessageId: 'assistant-2',
        status: 'completed',
        finalContent: 'Recovered',
      })
    })

    expect(createRuntimeChatStateClient).toHaveBeenCalledTimes(2)
    expect(failedRuntimeClient.close).toHaveBeenCalledTimes(1)
    expect(recoveredRuntimeClient.submitUserMessage).toHaveBeenCalledWith({
      turnRequestId: 'request-2',
      userMessageId: 'user-1',
      assistantMessageId: 'assistant-2',
      content: 'Hello Nyx',
    })
  })

  it('discards runtime client failures during streaming before emitting a non-retryable error', async () => {
    streamChatCompletion.mockImplementation(
      async ({ onDelta }: { onDelta: (delta: string, snapshot: string) => Promise<void> }) => {
        await onDelta('Part', 'Part')
        return { finalContent: 'Part' }
      },
    )
    const runtimeClient = fakeRuntimeChatStateClient()
    vi.mocked(runtimeClient.appendDelta).mockRejectedValueOnce(
      new RuntimeChatStateClientError('Runtime append failed'),
    )
    const sender = mockSender()
    const manager = new ChatSessionManager({
      env: {
        NYX_RUNTIME_CHAT_STATE: '1',
      },
      createRuntimeChatStateClient: () => runtimeClient,
    })

    manager.start(sender, validRequest())

    await waitForAssertion(() => {
      expect(sentChatEvents(sender).at(-1)).toEqual({
        type: 'chat:error',
        requestId: 'request-1',
        assistantMessageId: 'assistant-1',
        status: 'failed',
        error: {
          code: 'unknown',
          message: 'Runtime append failed',
          retryable: false,
        },
      })
    })

    expect(runtimeClient.fail).not.toHaveBeenCalled()
    expect(runtimeClient.close).toHaveBeenCalledTimes(1)
  })
})
