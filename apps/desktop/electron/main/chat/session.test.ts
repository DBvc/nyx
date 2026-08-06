import type { WebContents } from 'electron'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { NyxChatEvent } from '../../../shared/chat/events'
import type { NyxChatRequest } from '../../../shared/chat/types'
import { NYX_CHAT_IPC_CHANNELS } from '../../../shared/chat/ipc'
import {
  CurrentThreadSessionError,
  type CurrentThreadSessionCoordinator,
  type PreparedCurrentThreadTurn,
} from '../current-thread/session-coordinator'
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

import { createChatBridgeError } from './errors'
import { ChatSessionManager, validateChatRequest } from './session'

const runtimeChatStateDisabledEnv = {
  NYX_RUNTIME_CHAT_STATE: '0',
}
const targetSelection = {
  kind: 'env_fallback',
} as const
const targetAttribution = {
  kind: 'env_fallback',
  modelId: 'model',
} as const

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
    targetSelection,
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

function deferred<TValue>() {
  let resolve!: (value: TValue) => void
  const promise = new Promise<TValue>((resolvePromise) => {
    resolve = resolvePromise
  })

  return { promise, resolve }
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

function preparedTurn(providerContent = 'Durable hello'): PreparedCurrentThreadTurn {
  return {
    providerMessages: [{ role: 'user', content: providerContent }],
    replayRecord: null,
    pendingRecord: {
      version: 2,
      threadId: 'thread-1',
      turns: [
        {
          attemptRequestId: 'request-1',
          userMessageId: 'user-1',
          assistantMessageId: 'assistant-1',
          userContent: providerContent,
          assistantContent: '',
          assistantStatus: 'pending',
          error: null,
          targetBinding: { selection: targetSelection, attribution: null },
          createdAt: '2026-07-11T00:00:00.000Z',
          updatedAt: '2026-07-11T00:00:00.000Z',
        },
      ],
      createdAt: '2026-07-11T00:00:00.000Z',
      updatedAt: '2026-07-11T00:00:00.000Z',
    },
  }
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

  it.each([
    null,
    { ...validRequest(), targetSelection: null },
    { ...validRequest(), targetSelection: { kind: 'env_fallback', token: 'secret' } },
    { ...validRequest(), baseUrl: 'https://secret.example.test' },
    {
      ...validRequest(),
      messages: [{ role: 'user', content: 'Hello Nyx', token: 'secret' }],
    },
  ])('rejects malformed or secret-bearing trust-boundary input', (request) => {
    expect(validateChatRequest(request)).toMatchObject({
      code: 'invalid_request',
      retryable: false,
    })
  })
})

describe('ChatSessionManager reset', () => {
  beforeEach(() => {
    streamChatCompletion.mockReset()
  })

  it('aborts and clears the active session for the same sender', async () => {
    let signal: AbortSignal | undefined
    streamChatCompletion
      .mockImplementationOnce(({ signal: activeSignal }: { signal: AbortSignal }) => {
        signal = activeSignal
        return new Promise((_resolve, reject) => {
          activeSignal.addEventListener('abort', () => reject(abortError()), { once: true })
        })
      })
      .mockResolvedValueOnce({ finalContent: 'Fresh' })
    const sender = mockSender()
    const manager = new ChatSessionManager({
      env: runtimeChatStateDisabledEnv,
    })

    manager.start(sender, validRequest())
    await waitForAssertion(() => expect(streamChatCompletion).toHaveBeenCalledTimes(1))
    await expect(manager.reset(sender)).resolves.toEqual({ ok: true })

    expect(signal?.aborted).toBe(true)
    expect(sender.send).toHaveBeenCalledWith(NYX_CHAT_IPC_CHANNELS.event, {
      type: 'chat:start',
      requestId: 'request-1',
      assistantMessageId: 'assistant-1',
      status: 'streaming',
      targetAttribution,
    })

    manager.start(sender, {
      ...validRequest(),
      requestId: 'request-2',
      assistantMessageId: 'assistant-2',
    })

    await waitForAssertion(() => expect(streamChatCompletion).toHaveBeenCalledTimes(2))
  })

  it('resets the manager-owned active session from another sender', async () => {
    let signal: AbortSignal | undefined
    streamChatCompletion.mockImplementation(({ signal: activeSignal }: { signal: AbortSignal }) => {
      signal = activeSignal
      return new Promise((_resolve, reject) => {
        activeSignal.addEventListener('abort', () => reject(abortError()), { once: true })
      })
    })
    const sender = mockSender()
    const otherSender = mockSender()
    const manager = new ChatSessionManager({
      env: runtimeChatStateDisabledEnv,
    })

    manager.start(sender, validRequest())
    await waitForAssertion(() => expect(streamChatCompletion).toHaveBeenCalledTimes(1))
    await expect(manager.reset(otherSender)).resolves.toEqual({ ok: true })

    expect(signal?.aborted).toBe(true)
  })

  it('waits for durable preparation before deleting the current thread', async () => {
    const order: string[] = []
    const prepareGate = deferred<PreparedCurrentThreadTurn>()
    const coordinator = {
      prepare: vi.fn(async () => {
        order.push('durable:prepare')
        const prepared = await prepareGate.promise
        order.push('durable:prepared')
        return prepared
      }),
      reset: vi.fn(async () => {
        order.push('durable:reset')
      }),
    } as unknown as CurrentThreadSessionCoordinator
    const sender = mockSender(order)
    const manager = new ChatSessionManager({
      env: runtimeChatStateDisabledEnv,
      resolveCurrentThreadSession: () => coordinator,
    })

    manager.start(sender, validRequest())
    await waitForAssertion(() => expect(coordinator.prepare).toHaveBeenCalledTimes(1))

    const resetPromise = manager.reset(sender)
    expect(coordinator.reset).not.toHaveBeenCalled()

    prepareGate.resolve(preparedTurn())
    await expect(resetPromise).resolves.toEqual({ ok: true })

    expect(order).toEqual(['durable:prepare', 'durable:prepared', 'durable:reset'])
    expect(streamChatCompletion).not.toHaveBeenCalled()
    expect(sender.send).not.toHaveBeenCalled()
  })

  it('waits for provider abort before clearing runtime and durable state', async () => {
    const order: string[] = []
    const providerExit = deferred<void>()
    let activeSignal: AbortSignal | undefined
    streamChatCompletion.mockImplementationOnce(
      ({ signal }: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          activeSignal = signal
          signal.addEventListener(
            'abort',
            () => {
              order.push('provider:aborted')
              void providerExit.promise.then(() => reject(abortError()))
            },
            { once: true },
          )
        }),
    )
    const runtimeClient = fakeRuntimeChatStateClient(order)
    const coordinator = {
      prepare: vi.fn(async () => preparedTurn()),
      bindResolvedTarget: vi.fn(async () => undefined),
      reset: vi.fn(async () => {
        order.push('durable:reset')
      }),
    } as unknown as CurrentThreadSessionCoordinator
    const sender = mockSender(order)
    const manager = new ChatSessionManager({
      env: {},
      createRuntimeChatStateClient: () => runtimeClient,
      resolveCurrentThreadSession: () => coordinator,
    })

    manager.start(sender, validRequest())
    await waitForAssertion(() => expect(streamChatCompletion).toHaveBeenCalledTimes(1))

    const resetPromise = manager.reset(sender)
    await waitForAssertion(() => expect(order).toContain('provider:aborted'))
    expect(activeSignal?.aborted).toBe(true)
    expect(runtimeClient.clear).not.toHaveBeenCalled()
    expect(coordinator.reset).not.toHaveBeenCalled()

    providerExit.resolve()
    await expect(resetPromise).resolves.toEqual({ ok: true })

    expect(order.slice(-4)).toEqual([
      'provider:aborted',
      'runtime:clear',
      'runtime:close',
      'durable:reset',
    ])
    expect(sentChatEvents(sender).map((event) => event.type)).toEqual(['chat:start'])
  })

  it('returns one safe reset error without exposing store details', async () => {
    const coordinator = {
      reset: vi.fn(async () => {
        throw new Error('Authorization: Bearer secret at /private/current-thread.json')
      }),
    } as unknown as CurrentThreadSessionCoordinator
    const manager = new ChatSessionManager({
      env: runtimeChatStateDisabledEnv,
      resolveCurrentThreadSession: () => coordinator,
    })

    const result = await manager.reset(mockSender())

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'reset_failed',
        message: 'Nyx could not start a fresh thread.',
      },
    })
    expect(JSON.stringify(result)).not.toContain('Bearer secret')
    expect(JSON.stringify(result)).not.toContain('/private')
  })
})

describe('ChatSessionManager provider resolver', () => {
  beforeEach(() => {
    streamChatCompletion.mockReset()
  })

  it('rejects malformed target input before any durable or execution side effect', () => {
    const prepare = vi.fn()
    const resolveChatTarget = vi.fn()
    const sender = mockSender()
    const manager = new ChatSessionManager({
      resolveChatTarget,
      resolveCurrentThreadSession: () =>
        ({ prepare }) as unknown as CurrentThreadSessionCoordinator,
    })

    manager.start(sender, {
      ...validRequest(),
      targetSelection: { kind: 'env_fallback', token: 'must-not-cross' },
    })
    manager.start(sender, null)

    expect(sentChatEvents(sender)).toEqual([
      {
        type: 'chat:error',
        requestId: 'request-1',
        assistantMessageId: 'assistant-1',
        status: 'failed',
        error: {
          code: 'invalid_request',
          message: 'Chat requests must include one valid target selection.',
          retryable: false,
        },
      },
    ])
    expect(prepare).not.toHaveBeenCalled()
    expect(resolveChatTarget).not.toHaveBeenCalled()
    expect(streamChatCompletion).not.toHaveBeenCalled()
  })

  it('uses the injected chat target resolver for chat streaming', async () => {
    const target = {
      providerId: 'provider-1',
      baseUrl: 'https://persisted.example.com/v1/',
      token: 'stored-token',
      modelId: 'stored-model',
      protocol: 'openai-chat-completions' as const,
      targetAttribution,
    }
    const resolveChatTarget = vi.fn(() => target)
    const sender = mockSender()
    const manager = new ChatSessionManager({
      env: runtimeChatStateDisabledEnv,
      resolveChatTarget,
    })

    streamChatCompletion.mockResolvedValue({ finalContent: 'Done' })
    manager.start(sender, validRequest())

    await waitForAssertion(() => {
      expect(streamChatCompletion).toHaveBeenCalledTimes(1)
    })
    expect(resolveChatTarget).toHaveBeenCalledTimes(1)
    expect(streamChatCompletion.mock.calls[0]?.[0]).toMatchObject({ target })
  })

  it('emits a config error without calling the provider and clears the active session', async () => {
    const resolveChatTarget = vi
      .fn()
      .mockRejectedValueOnce(
        createChatBridgeError({
          code: 'config_missing',
          message: 'No usable chat provider configuration is available.',
          retryable: false,
        }),
      )
      .mockReturnValueOnce({
        providerId: 'provider-1',
        baseUrl: 'https://persisted.example.com/v1/',
        token: 'stored-token',
        modelId: 'stored-model',
        protocol: 'openai-chat-completions',
        targetAttribution,
      })
    const sender = mockSender()
    const manager = new ChatSessionManager({
      env: runtimeChatStateDisabledEnv,
      resolveChatTarget,
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
            code: 'config_missing',
            message: 'No usable chat provider configuration is available.',
            retryable: false,
          },
        },
      ])
    })
    expect(streamChatCompletion).not.toHaveBeenCalled()

    streamChatCompletion.mockResolvedValue({ finalContent: 'Recovered' })
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
  })
})

describe('ChatSessionManager runtime chat state gate', () => {
  beforeEach(() => {
    streamChatCompletion.mockReset()
  })

  it('does not create a runtime chat state client when explicitly disabled', async () => {
    streamChatCompletion.mockImplementation(
      async ({ onDelta }: { onDelta: (delta: string, snapshot: string) => Promise<void> }) => {
        await onDelta('Hi', 'Hi')
        return { finalContent: 'Hi' }
      },
    )
    const createRuntimeChatStateClient = vi.fn(() => fakeRuntimeChatStateClient())
    const sender = mockSender()
    const manager = new ChatSessionManager({
      env: runtimeChatStateDisabledEnv,
      createRuntimeChatStateClient,
    })

    manager.start(sender, validRequest())

    expect(createRuntimeChatStateClient).not.toHaveBeenCalled()
    await waitForAssertion(() => expect(sender.send).toHaveBeenCalled())
    expect(sender.send).toHaveBeenCalledWith(NYX_CHAT_IPC_CHANNELS.event, {
      type: 'chat:start',
      requestId: 'request-1',
      assistantMessageId: 'assistant-1',
      status: 'streaming',
      targetAttribution,
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

  it('runs a new user message through runtime state by default before streaming events', async () => {
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
      env: {},
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
      env: {},
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
      env: {},
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
      env: {},
      createRuntimeChatStateClient: () => runtimeClient,
    })

    manager.start(sender, validRequest())

    await waitForAssertion(() => {
      expect(sentChatEvents(sender).at(-1)).toEqual({
        type: 'chat:error',
        requestId: 'request-1',
        assistantMessageId: 'assistant-1',
        status: 'failed',
        targetAttribution,
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
      env: {},
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
      return new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(abortError()), { once: true })
      })
    })
    const runtimeClient = fakeRuntimeChatStateClient()
    const sender = mockSender()
    const manager = new ChatSessionManager({
      env: {},
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

  it('clears manager-owned runtime chat state from another sender', async () => {
    streamChatCompletion.mockResolvedValue({ finalContent: 'Done' })
    const runtimeClient = fakeRuntimeChatStateClient()
    const sender = mockSender()
    const otherSender = mockSender()
    const manager = new ChatSessionManager({
      env: {},
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

    expect(runtimeClient.clear).toHaveBeenCalledTimes(1)
    expect(runtimeClient.close).toHaveBeenCalledTimes(1)
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
      env: {},
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

  it('aborts the active turn and clears every runtime projection on global reset', async () => {
    let activeSignal: AbortSignal | undefined
    streamChatCompletion
      .mockResolvedValueOnce({ finalContent: 'Done' })
      .mockImplementationOnce(({ signal }: { signal: AbortSignal }) => {
        activeSignal = signal

        return new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(abortError()), { once: true })
        })
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
      env: {},
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

    expect(activeSignal?.aborted).toBe(true)
    expect(idleRuntimeClient.clear).toHaveBeenCalledTimes(1)
    expect(idleRuntimeClient.close).toHaveBeenCalledTimes(1)
    expect(activeRuntimeClient.clear).toHaveBeenCalledTimes(1)
    expect(activeRuntimeClient.close).toHaveBeenCalledTimes(1)
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
      env: {},
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
      env: {},
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
          targetAttribution,
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
      env: {},
      createRuntimeChatStateClient,
    })

    manager.start(sender, validRequest())

    await waitForAssertion(() => {
      expect(sentChatEvents(sender).at(-1)).toEqual({
        type: 'chat:error',
        requestId: 'request-1',
        assistantMessageId: 'assistant-1',
        status: 'failed',
        targetAttribution,
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
      env: {},
      createRuntimeChatStateClient: () => runtimeClient,
    })

    manager.start(sender, validRequest())

    await waitForAssertion(() => {
      expect(sentChatEvents(sender).at(-1)).toEqual({
        type: 'chat:error',
        requestId: 'request-1',
        assistantMessageId: 'assistant-1',
        status: 'failed',
        targetAttribution,
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

describe('ChatSessionManager durable current thread ordering', () => {
  beforeEach(() => {
    streamChatCompletion.mockReset()
  })

  it('uses main-derived messages and persists terminal state before renderer completion', async () => {
    const order: string[] = []
    const prepared = preparedTurn()
    const coordinator = {
      prepare: vi.fn(async () => {
        order.push('durable:pending')
        return prepared
      }),
      bindResolvedTarget: vi.fn(async () => {
        order.push('durable:bind')
      }),
      complete: vi.fn(async () => {
        order.push('durable:complete')
      }),
      cancel: vi.fn(),
      fail: vi.fn(),
    } as unknown as CurrentThreadSessionCoordinator
    const resolveChatTarget = vi.fn(() => {
      order.push('main:resolve')
      return {
        providerId: null,
        baseUrl: 'https://example.com/v1/',
        token: 'token',
        modelId: 'model',
        protocol: 'openai-chat-completions' as const,
        targetAttribution,
      }
    })
    streamChatCompletion.mockImplementation(async ({ request }: { request: NyxChatRequest }) => {
      order.push(`provider:${request.messages[0]?.content}`)
      return { finalContent: 'Done' }
    })
    const sender = mockSender(order)
    const manager = new ChatSessionManager({
      env: runtimeChatStateDisabledEnv,
      resolveCurrentThreadSession: () => coordinator,
      resolveChatTarget,
    })

    manager.start(sender, validRequest())

    await waitForAssertion(() => {
      expect(sentChatEvents(sender).at(-1)?.type).toBe('chat:done')
    })

    expect(order).toEqual([
      'durable:pending',
      'main:resolve',
      'durable:bind',
      'event:chat:start',
      'provider:Durable hello',
      'durable:complete',
      'event:chat:done',
    ])
  })

  it('settles target resolution failure before the renderer error without starting runtime', async () => {
    const order: string[] = []
    const runtimeFactory = vi.fn(() => fakeRuntimeChatStateClient(order))
    const coordinator = {
      prepare: vi.fn(async () => {
        order.push('durable:pending')
        return preparedTurn()
      }),
      bindResolvedTarget: vi.fn(),
      fail: vi.fn(async () => {
        order.push('durable:fail')
      }),
    } as unknown as CurrentThreadSessionCoordinator
    const resolveChatTarget = vi.fn(() => {
      order.push('main:resolve')
      throw createChatBridgeError({
        code: 'target_unavailable',
        message: 'The selected chat target is unavailable.',
        retryable: true,
      })
    })
    const sender = mockSender(order)
    const manager = new ChatSessionManager({
      env: {},
      createRuntimeChatStateClient: runtimeFactory,
      resolveCurrentThreadSession: () => coordinator,
      resolveChatTarget,
    })

    manager.start(sender, validRequest())

    await waitForAssertion(() => expect(sentChatEvents(sender).at(-1)?.type).toBe('chat:error'))
    expect(order).toEqual(['durable:pending', 'main:resolve', 'durable:fail', 'event:chat:error'])
    expect(sentChatEvents(sender).at(-1)).not.toHaveProperty('targetAttribution')
    expect(coordinator.bindResolvedTarget).not.toHaveBeenCalled()
    expect(runtimeFactory).not.toHaveBeenCalled()
    expect(streamChatCompletion).not.toHaveBeenCalled()
  })

  it('stops after a durable attribution bind failure and leaves recovery to the store', async () => {
    const coordinator = {
      prepare: vi.fn(async () => preparedTurn()),
      bindResolvedTarget: vi.fn(async () => {
        throw new CurrentThreadSessionError('store_error', 'bind failed')
      }),
      fail: vi.fn(),
    } as unknown as CurrentThreadSessionCoordinator
    const runtimeFactory = vi.fn(() => fakeRuntimeChatStateClient())
    const sender = mockSender()
    const manager = new ChatSessionManager({
      env: {},
      createRuntimeChatStateClient: runtimeFactory,
      resolveCurrentThreadSession: () => coordinator,
    })

    manager.start(sender, validRequest())

    await waitForAssertion(() => expect(sentChatEvents(sender).at(-1)?.type).toBe('chat:error'))
    expect(sentChatEvents(sender).at(-1)).toMatchObject({
      error: { code: 'unknown', retryable: false },
    })
    expect(sentChatEvents(sender).at(-1)).not.toHaveProperty('targetAttribution')
    expect(coordinator.fail).not.toHaveBeenCalled()
    expect(runtimeFactory).not.toHaveBeenCalled()
    expect(streamChatCompletion).not.toHaveBeenCalled()
  })

  it('keeps bound attribution on a durable terminal write failure', async () => {
    const coordinator = {
      prepare: vi.fn(async () => preparedTurn()),
      bindResolvedTarget: vi.fn(async () => undefined),
      complete: vi.fn(async () => {
        throw new CurrentThreadSessionError('store_error', 'complete failed')
      }),
    } as unknown as CurrentThreadSessionCoordinator
    streamChatCompletion.mockResolvedValueOnce({ finalContent: 'Done' })
    const sender = mockSender()
    const manager = new ChatSessionManager({
      env: runtimeChatStateDisabledEnv,
      resolveCurrentThreadSession: () => coordinator,
    })

    manager.start(sender, validRequest())

    await waitForAssertion(() => expect(sentChatEvents(sender).at(-1)?.type).toBe('chat:error'))
    expect(sentChatEvents(sender).at(-1)).toMatchObject({
      type: 'chat:error',
      targetAttribution,
      error: {
        code: 'unknown',
        message: 'Nyx could not save the current thread.',
        retryable: false,
      },
    })
    expect(sentChatEvents(sender).some((event) => event.type === 'chat:done')).toBe(false)
  })

  it('persists the latest assistant draft when the provider reaches its output limit', async () => {
    const coordinator = {
      prepare: vi.fn(async () => preparedTurn()),
      bindResolvedTarget: vi.fn(async () => undefined),
      fail: vi.fn(async () => undefined),
    } as unknown as CurrentThreadSessionCoordinator
    streamChatCompletion.mockImplementationOnce(
      async ({ onDelta }: { onDelta: (delta: string, snapshot: string) => Promise<void> }) => {
        await onDelta('Partial', 'Partial draft')
        throw createChatBridgeError({
          code: 'upstream_error',
          message: 'The provider reached its output limit before completing the answer.',
          retryable: true,
          details: 'finish_reason=length; reasoning_received=false',
        })
      },
    )
    const sender = mockSender()
    const manager = new ChatSessionManager({
      env: runtimeChatStateDisabledEnv,
      resolveCurrentThreadSession: () => coordinator,
    })

    manager.start(sender, validRequest())

    await waitForAssertion(() => {
      expect(sentChatEvents(sender).at(-1)).toMatchObject({
        type: 'chat:error',
        error: {
          code: 'upstream_error',
          details: 'finish_reason=length; reasoning_received=false',
          retryable: true,
        },
      })
    })
    expect(coordinator.fail).toHaveBeenCalledWith(
      'request-1',
      'assistant-1',
      'Partial draft',
      expect.objectContaining({
        message: 'The provider reached its output limit before completing the answer.',
        retryable: true,
        details: 'finish_reason=length; reasoning_received=false',
      }),
    )
  })

  it('fails closed before provider work when durable request validation fails', async () => {
    const coordinator = {
      prepare: vi.fn(async () => {
        throw new CurrentThreadSessionError('invalid_request', 'Durable messages differ.')
      }),
    } as unknown as CurrentThreadSessionCoordinator
    const sender = mockSender()
    const manager = new ChatSessionManager({
      env: runtimeChatStateDisabledEnv,
      resolveCurrentThreadSession: () => coordinator,
    })

    manager.start(sender, validRequest())

    await waitForAssertion(() => {
      expect(sentChatEvents(sender).at(-1)).toMatchObject({
        type: 'chat:error',
        error: { code: 'invalid_request', retryable: false },
      })
    })
    expect(streamChatCompletion).not.toHaveBeenCalled()
  })

  it('resets durable state even when no runtime client was started', async () => {
    const coordinator = {
      reset: vi.fn(async () => undefined),
    } as unknown as CurrentThreadSessionCoordinator
    const manager = new ChatSessionManager({
      env: runtimeChatStateDisabledEnv,
      resolveCurrentThreadSession: () => coordinator,
    })

    await manager.reset(mockSender())

    expect(coordinator.reset).toHaveBeenCalledTimes(1)
  })

  it('persists a runtime terminal failure before emitting the renderer error', async () => {
    const order: string[] = []
    const runtimeClient = fakeRuntimeChatStateClient(order)
    vi.mocked(runtimeClient.fail).mockImplementationOnce(async () => {
      order.push('runtime:fail')
      throw new RuntimeChatStateClientError('Runtime fail failed')
    })
    const coordinator = {
      prepare: vi.fn(async () => preparedTurn()),
      bindResolvedTarget: vi.fn(async () => undefined),
      fail: vi.fn(async () => {
        order.push('durable:fail')
      }),
    } as unknown as CurrentThreadSessionCoordinator
    streamChatCompletion.mockRejectedValueOnce(new Error('Provider failed'))
    const sender = mockSender(order)
    const manager = new ChatSessionManager({
      env: {},
      createRuntimeChatStateClient: () => runtimeClient,
      resolveCurrentThreadSession: () => coordinator,
    })

    manager.start(sender, validRequest())

    await waitForAssertion(() => {
      expect(sentChatEvents(sender).at(-1)).toMatchObject({
        type: 'chat:error',
        error: { message: 'Runtime fail failed', retryable: false },
      })
    })
    expect(order.indexOf('runtime:fail')).toBeLessThan(order.indexOf('durable:fail'))
    expect(order.indexOf('durable:fail')).toBeLessThan(order.indexOf('event:chat:error'))
    expect(runtimeClient.close).toHaveBeenCalledTimes(1)
  })

  it('persists a failed terminal record when runtime cancel rejects', async () => {
    const runtimeClient = fakeRuntimeChatStateClient()
    vi.mocked(runtimeClient.cancel).mockRejectedValueOnce(
      new RuntimeChatStateClientError('Runtime cancel failed'),
    )
    const coordinator = {
      prepare: vi.fn(async () => preparedTurn()),
      bindResolvedTarget: vi.fn(async () => undefined),
      fail: vi.fn(async () => undefined),
    } as unknown as CurrentThreadSessionCoordinator
    streamChatCompletion.mockImplementationOnce(
      ({ signal }: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(abortError()), { once: true })
        }),
    )
    const sender = mockSender()
    const manager = new ChatSessionManager({
      env: {},
      createRuntimeChatStateClient: () => runtimeClient,
      resolveCurrentThreadSession: () => coordinator,
    })

    manager.start(sender, validRequest())
    await waitForAssertion(() => expect(streamChatCompletion).toHaveBeenCalledTimes(1))
    manager.cancel({ requestId: 'request-1' })

    await waitForAssertion(() => {
      expect(sentChatEvents(sender).at(-1)).toMatchObject({
        type: 'chat:error',
        error: { message: 'Runtime cancel failed', retryable: false },
      })
    })
    expect(coordinator.fail).toHaveBeenCalledTimes(1)
    expect(runtimeClient.close).toHaveBeenCalledTimes(1)
  })

  it('discards an existing runtime when config failure advances only durable state', async () => {
    const runtimeClient = fakeRuntimeChatStateClient()
    const coordinator = {
      prepare: vi.fn(async () => preparedTurn()),
      bindResolvedTarget: vi.fn(async () => undefined),
      complete: vi.fn(async () => undefined),
      fail: vi.fn(async () => undefined),
    } as unknown as CurrentThreadSessionCoordinator
    const resolveChatTarget = vi
      .fn()
      .mockReturnValueOnce({
        providerId: 'provider-1',
        baseUrl: 'https://example.com/v1/',
        token: 'token',
        modelId: 'model',
        protocol: 'openai-chat-completions',
        targetAttribution,
      })
      .mockImplementationOnce(() => {
        throw new Error('Config failed')
      })
    streamChatCompletion.mockResolvedValueOnce({ finalContent: 'Done' })
    const sender = mockSender()
    const manager = new ChatSessionManager({
      env: {},
      createRuntimeChatStateClient: () => runtimeClient,
      resolveCurrentThreadSession: () => coordinator,
      resolveChatTarget,
    })

    manager.start(sender, validRequest())
    await waitForAssertion(() => {
      expect(sentChatEvents(sender).at(-1)?.type).toBe('chat:done')
    })

    manager.start(
      sender,
      requestWithIds({
        requestId: 'request-2',
        userMessageId: 'user-2',
        assistantMessageId: 'assistant-2',
        content: 'Continue',
      }),
    )
    await waitForAssertion(() => {
      expect(sentChatEvents(sender).at(-1)).toMatchObject({
        type: 'chat:error',
        error: { message: 'Config failed' },
      })
    })

    expect(coordinator.fail).toHaveBeenCalledTimes(1)
    expect(runtimeClient.close).toHaveBeenCalledTimes(1)
  })
})
