import type { WebContents } from 'electron'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { NyxThreadChatRequest } from '../../../shared/chat/types'
import type { ResolvedChatTarget } from '../connections/provider-resolver'
import {
  RuntimeChatStateClientError,
  type RuntimeChatStateClient,
} from '../runtime/chat-state-client'
import {
  ThreadLibraryCoordinatorError,
  type ThreadLibraryCoordinator,
  type PreparedThreadTurn,
} from '../thread-library/coordinator'
import type { ThreadLibraryThreadDetail } from '../thread-library/protocol'

const streamChatCompletion = vi.hoisted(() => vi.fn())
vi.mock('./client', () => ({ streamChatCompletion }))

import type { ChatProviderMessage } from './client'
import { createChatBridgeError } from './errors'
import { ChatSessionManager, type UnclockedNyxChatEvent, validateChatRequest } from './session'

type CapacityEvent = Extract<UnclockedNyxChatEvent, { type: 'chat:capacity' }>
type BusinessEvent = Exclude<UnclockedNyxChatEvent, CapacityEvent>

function collectEvent(
  events: BusinessEvent[],
  capacityEvents: CapacityEvent[],
  event: UnclockedNyxChatEvent,
) {
  if (event.type === 'chat:capacity') capacityEvents.push(event)
  else events.push(event)
}

const threadId = '00000000-0000-4000-8000-000000000001'
const otherThreadId = '00000000-0000-4000-8000-000000000002'
const thirdThreadId = '00000000-0000-4000-8000-000000000005'
const imageId = '00000000-0000-4000-8000-000000000003'
const documentId = '00000000-0000-4000-8000-000000000004'
const timestamp = '2026-08-13T00:00:00.000Z'
const selection = { kind: 'env_fallback' } as const
const attribution = { kind: 'env_fallback', modelId: 'model' } as const

function request(overrides: Partial<NyxThreadChatRequest> = {}): NyxThreadChatRequest {
  return {
    threadId,
    requestId: 'request-1',
    turnIntent: 'new_user_message',
    expectedDraftRevision: 0,
    ...overrides,
  } as NyxThreadChatRequest
}

function detail(status: 'pending' | 'completed' | 'cancelled' | 'failed' = 'pending') {
  return {
    summary: {
      id: threadId,
      location: 'available',
      trashedFromLocation: null,
      trashedPinPosition: null,
      pinPosition: null,
      title: 'Thread',
      titleSource: 'auto',
      fallbackLocalSecond: null,
      fallbackOrdinal: null,
      threadRevision: 1,
      lastUserActivityAt: timestamp,
      resultRevision: status === 'pending' ? 0 : 1,
      seenResultRevision: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    draft: {
      threadId,
      draftRevision: 1,
      text: '',
      targetSelection: selection,
      updatedAt: timestamp,
    },
    turns: [
      {
        threadId,
        ordinal: 0,
        attemptRequestId: 'request-1',
        userMessageId: 'user-1',
        assistantMessageId: 'assistant-1',
        userContent: 'Canonical prompt',
        assistantContent: status === 'pending' ? '' : 'Answer',
        assistantStatus: status,
        error:
          status === 'failed'
            ? {
                code: 'network_error',
                message: 'Nyx could not reach the provider.',
                retryable: true,
              }
            : null,
        targetSelection: selection,
        targetAttribution: attribution,
        providerStateId: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    images: [],
    documents: [],
    providerStateRefs: [],
  } satisfies ThreadLibraryThreadDetail
}

function prepared(): PreparedThreadTurn {
  const pending = detail()
  return {
    detail: pending,
    runtimeReplayDetail: { ...pending, turns: [] },
    threadId,
    requestId: 'request-1',
    userMessageId: 'user-1',
    assistantMessageId: 'assistant-1',
    targetSelection: selection,
    documentBearing: false,
    attachmentBearing: false,
  }
}

function preparedFor(input: NyxThreadChatRequest) {
  const next = prepared()
  next.threadId = input.threadId
  next.requestId = input.requestId
  next.detail.summary.id = input.threadId
  next.detail.draft.threadId = input.threadId
  const pending = next.detail.turns[0]!
  pending.threadId = input.threadId
  pending.attemptRequestId = input.requestId
  if (input.requestId !== 'request-1') {
    pending.userMessageId = `user-${input.requestId}`
    pending.assistantMessageId = `assistant-${input.requestId}`
    next.userMessageId = pending.userMessageId
    next.assistantMessageId = pending.assistantMessageId
  }
  next.runtimeReplayDetail.summary.id = input.threadId
  next.runtimeReplayDetail.draft.threadId = input.threadId
  return next
}

function resolvedTarget(): ResolvedChatTarget {
  return {
    providerId: 'env',
    baseUrl: 'https://example.test/v1',
    token: 'token',
    modelId: 'model',
    protocolConfig: { protocol: 'openai-chat-completions' },
    executionIdentity: 'a'.repeat(64),
    targetAttribution: attribution,
  }
}

function abortError() {
  const error = new Error('Aborted')
  error.name = 'AbortError'
  return error
}

function runtime() {
  const state = { transcript: [], current_turn: { type: 'no_turn' as const } }
  return {
    submitUserMessage: vi.fn(async () => state),
    retryFailed: vi.fn(async () => state),
    startAssistant: vi.fn(async () => state),
    appendDelta: vi.fn(async () => state),
    complete: vi.fn(async () => state),
    cancel: vi.fn(async () => state),
    fail: vi.fn(async () => state),
    clear: vi.fn(async () => state),
    close: vi.fn(),
  } as unknown as RuntimeChatStateClient
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

function setup() {
  const events: BusinessEvent[] = []
  const capacityEvents: CapacityEvent[] = []
  const runtimeClient = runtime()
  const canonicalMessages: ChatProviderMessage[] = [{ role: 'user', content: 'Canonical prompt' }]
  const coordinator = {
    classifyTurn: vi.fn(async (_request: NyxThreadChatRequest) => false),
    prepareTurn: vi.fn(async (input: NyxThreadChatRequest, _signal?: AbortSignal) =>
      preparedFor(input),
    ),
    bindPreparedTarget: vi.fn(async (turn: PreparedThreadTurn) => turn.detail),
    materializeProviderMessages: vi.fn(async () => canonicalMessages),
    replayRuntimeHistory: vi.fn(async () => undefined),
    settleTurn: vi.fn(async () => ({ id: 'settle', ok: true, value: detail('completed') })),
    retrySettlement: vi.fn(async () => ({ id: 'retry', ok: true, value: detail('completed') })),
  }
  const resolveChatTarget = vi.fn(async () => resolvedTarget())
  const createRuntimeChatStateClient = vi.fn(() => runtimeClient)
  const manager = new ChatSessionManager({
    resolveThreadLibraryCoordinator: () => coordinator as unknown as ThreadLibraryCoordinator,
    publishChatEvent: (_sender, event) => collectEvent(events, capacityEvents, event),
    resolveChatTarget,
    createRuntimeChatStateClient,
    now: () => timestamp,
  })
  return {
    coordinator,
    capacityEvents,
    createRuntimeChatStateClient,
    events,
    manager,
    resolveChatTarget,
    runtimeClient,
    sender: {} as WebContents,
  }
}

async function waitFor(assertion: () => void) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      assertion()
      return
    } catch (error) {
      if (attempt === 29) throw error
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
  }
}

describe('validateChatRequest', () => {
  it('accepts only the thread-scoped live request shape', () => {
    expect(validateChatRequest(request())).toBeNull()
    expect(
      validateChatRequest(
        request({
          requestId: 'request-retry',
          turnIntent: 'retry_failed_response',
          turnOrdinal: 0,
          expectedAttemptRequestId: 'request-failed',
          expectedDraftRevision: 1,
        }),
      ),
    ).toBeNull()
    expect(
      validateChatRequest({ ...request(), messages: [{ role: 'user', content: 'stale' }] }),
    ).toMatchObject({
      code: 'invalid_request',
    })
    expect(validateChatRequest({ requestId: 'request-1', messages: [] })).toMatchObject({
      code: 'invalid_request',
    })
    expect(validateChatRequest(request({ threadId: 'not-a-thread-id' }))).toMatchObject({
      code: 'invalid_request',
    })
    expect(validateChatRequest(request({ expectedDraftRevision: -1 }))).toMatchObject({
      code: 'invalid_request',
    })
    expect(
      validateChatRequest(
        request({
          turnIntent: 'retry_failed_response',
          turnOrdinal: 0,
          expectedDraftRevision: 1,
        } as Partial<NyxThreadChatRequest>),
      ),
    ).toMatchObject({ code: 'invalid_request' })
  })
})

describe('ChatSessionManager canonical execution', () => {
  beforeEach(() => {
    streamChatCompletion.mockReset()
    streamChatCompletion.mockResolvedValue({ finalContent: 'Answer' })
  })

  it('waits for the pending Worker acknowledgement before any Provider effect', async () => {
    const pending = deferred<PreparedThreadTurn>()
    const { coordinator, events, manager, sender } = setup()
    coordinator.prepareTurn.mockReturnValueOnce(pending.promise)

    manager.start(sender, request())
    await Promise.resolve()
    expect(streamChatCompletion).not.toHaveBeenCalled()
    expect(events).toEqual([])

    pending.resolve(prepared())
    await waitFor(() => expect(streamChatCompletion).toHaveBeenCalledTimes(1))
    expect(events[0]).toMatchObject({
      type: 'chat:accepted',
      threadId,
      requestId: 'request-1',
    })
  })

  it('rejects stale canonical identity before acceptance or execution', async () => {
    const { coordinator, events, manager, resolveChatTarget, sender } = setup()
    coordinator.prepareTurn.mockRejectedValueOnce(
      new ThreadLibraryCoordinatorError(
        'This draft changed. Reload it and try again.',
        'invalid_request',
      ),
    )

    manager.start(sender, request())
    await waitFor(() => expect(events.at(-1)?.type).toBe('chat:error'))

    expect(events).toEqual([
      expect.objectContaining({
        type: 'chat:error',
        threadId,
        requestId: 'request-1',
        error: expect.objectContaining({ code: 'invalid_request', retryable: false }),
      }),
    ])
    expect(coordinator.settleTurn).not.toHaveBeenCalled()
    expect(resolveChatTarget).not.toHaveBeenCalled()
    expect(streamChatCompletion).not.toHaveBeenCalled()
  })

  it('uses only canonical Provider history and projects thread-scoped events', async () => {
    const { capacityEvents, coordinator, events, manager, resolveChatTarget, sender } = setup()
    streamChatCompletion.mockImplementationOnce(
      async ({ documentBearing, providerMessages, onDelta }) => {
        expect(providerMessages).toEqual([{ role: 'user', content: 'Canonical prompt' }])
        expect(documentBearing).toBe(false)
        await onDelta('An', 'An')
        return { finalContent: 'Answer' }
      },
    )

    manager.start(sender, request())
    await waitFor(() => expect(events.at(-1)?.type).toBe('chat:done'))

    expect(coordinator.prepareTurn).toHaveBeenCalledWith(request(), expect.any(AbortSignal))
    expect(coordinator.bindPreparedTarget).toHaveBeenCalledWith(
      expect.objectContaining({ threadId, requestId: 'request-1' }),
      attribution,
    )
    expect(resolveChatTarget).toHaveBeenCalledWith(selection)
    expect(streamChatCompletion).toHaveBeenCalledWith(
      expect.objectContaining({ request: {}, target: resolvedTarget() }),
    )
    expect(events.map((event) => event.type)).toEqual([
      'chat:accepted',
      'chat:start',
      'chat:delta',
      'chat:done',
    ])
    expect(events.every((event) => event.threadId === threadId)).toBe(true)
    expect(events.at(-1)).toStrictEqual({
      type: 'chat:done',
      threadId,
      requestId: 'request-1',
      assistantMessageId: 'assistant-1',
      status: 'completed',
      finalContent: 'Answer',
    })
    expect(capacityEvents).toEqual([
      { type: 'chat:capacity', activeRuns: 1, attachmentRunActive: false },
      { type: 'chat:capacity', activeRuns: 0, attachmentRunActive: false },
    ])
  })

  it('continues an accepted Run after its initiating WebContents is destroyed', async () => {
    const { coordinator, createRuntimeChatStateClient, resolveChatTarget } = setup()
    const providerMayContinue = deferred<void>()
    const windowA: UnclockedNyxChatEvent[] = []
    const windowB: UnclockedNyxChatEvent[] = []
    let liveWindows = [windowA]
    streamChatCompletion.mockImplementationOnce(async ({ onDelta }) => {
      await providerMayContinue.promise
      await onDelta('Later', 'Later')
      return { finalContent: 'Later' }
    })
    const manager = new ChatSessionManager({
      resolveThreadLibraryCoordinator: () => coordinator as unknown as ThreadLibraryCoordinator,
      publishChatEvent: (_sender, event) => {
        for (const events of liveWindows) events.push(event)
      },
      resolveChatTarget,
      createRuntimeChatStateClient,
      now: () => timestamp,
    })
    const sender = {
      send: () => {
        throw new Error('destroyed WebContents')
      },
    } as unknown as WebContents

    manager.start(sender, request())
    await waitFor(() => expect(windowA.some((event) => event.type === 'chat:start')).toBe(true))
    liveWindows = [windowB]
    providerMayContinue.resolve()
    await waitFor(() => expect(windowB.some((event) => event.type === 'chat:done')).toBe(true))

    expect(windowB.map((event) => event.type)).toEqual(['chat:delta', 'chat:done', 'chat:capacity'])
  })

  it('streams normally while the Runtime projection is explicitly disabled', async () => {
    const { capacityEvents, coordinator, events, runtimeClient, sender } = setup()
    const createRuntimeChatStateClient = vi.fn(() => runtimeClient)
    const manager = new ChatSessionManager({
      resolveThreadLibraryCoordinator: () => coordinator as unknown as ThreadLibraryCoordinator,
      publishChatEvent: (_sender, event) => collectEvent(events, capacityEvents, event),
      resolveChatTarget: async () => resolvedTarget(),
      createRuntimeChatStateClient,
      env: { NYX_RUNTIME_CHAT_STATE: '0' },
      now: () => timestamp,
    })
    streamChatCompletion.mockImplementationOnce(async ({ onDelta }) => {
      await onDelta('An', 'Answer')
      return { finalContent: 'Answer' }
    })

    manager.start(sender, request())
    await waitFor(() => expect(events.at(-1)?.type).toBe('chat:done'))

    expect(createRuntimeChatStateClient).not.toHaveBeenCalled()
    expect(events.map((event) => event.type)).toEqual([
      'chat:accepted',
      'chat:start',
      'chat:delta',
      'chat:done',
    ])
  })

  it('replays canonical Runtime history and settles before Runtime completion', async () => {
    const order: string[] = []
    const { coordinator, manager, runtimeClient, sender } = setup()
    coordinator.replayRuntimeHistory.mockImplementationOnce(async () => {
      order.push('runtime:replay')
    })
    coordinator.settleTurn.mockImplementationOnce(async () => {
      order.push('worker:settle')
      return { id: 'settle', ok: true, value: detail('completed') }
    })
    vi.mocked(runtimeClient.complete).mockImplementationOnce(async () => {
      order.push('runtime:complete')
      return { transcript: [], current_turn: { type: 'no_turn' } }
    })

    manager.start(sender, request())
    await waitFor(() => expect(order).toContain('runtime:complete'))
    expect(order).toEqual(['runtime:replay', 'worker:settle', 'runtime:complete'])
  })

  it('uses the exact Retry identity without resubmitting the user message', async () => {
    const { coordinator, events, manager, runtimeClient, sender } = setup()
    const retry = prepared()
    retry.requestId = 'request-retry'
    coordinator.prepareTurn.mockResolvedValueOnce(retry)
    const retryRequest = request({
      requestId: 'request-retry',
      turnIntent: 'retry_failed_response',
      turnOrdinal: 0,
      expectedAttemptRequestId: 'request-failed',
      expectedDraftRevision: 1,
    })

    manager.start(sender, retryRequest)
    await waitFor(() => expect(events.at(-1)?.type).toBe('chat:done'))

    expect(coordinator.prepareTurn).toHaveBeenCalledWith(retryRequest, expect.any(AbortSignal))
    expect(runtimeClient.submitUserMessage).not.toHaveBeenCalled()
    expect(runtimeClient.retryFailed).toHaveBeenCalledWith({
      turnRequestId: 'request-retry',
      userMessageId: 'user-1',
      assistantMessageId: 'assistant-1',
    })
  })

  it('re-resolves and binds target attribution for each ordinary Retry attempt', async () => {
    const { capacityEvents, coordinator, events, sender } = setup()
    const retry = prepared()
    retry.requestId = 'request-2'
    const attributionA = { kind: 'env_fallback', modelId: 'model-a' } as const
    const attributionB = { kind: 'env_fallback', modelId: 'model-b' } as const
    const resolveChatTarget = vi
      .fn()
      .mockResolvedValueOnce({
        ...resolvedTarget(),
        modelId: 'model-a',
        targetAttribution: attributionA,
      })
      .mockResolvedValueOnce({
        ...resolvedTarget(),
        modelId: 'model-b',
        targetAttribution: attributionB,
      })
    coordinator.prepareTurn.mockResolvedValueOnce(prepared()).mockResolvedValueOnce(retry)
    coordinator.settleTurn
      .mockResolvedValueOnce({ id: 'failed', ok: true, value: detail('failed') })
      .mockResolvedValueOnce({ id: 'completed', ok: true, value: detail('completed') })
    streamChatCompletion
      .mockRejectedValueOnce(new Error('Provider failed'))
      .mockResolvedValueOnce({ finalContent: 'Retried answer' })
    const manager = new ChatSessionManager({
      resolveThreadLibraryCoordinator: () => coordinator as unknown as ThreadLibraryCoordinator,
      publishChatEvent: (_sender, event) => collectEvent(events, capacityEvents, event),
      resolveChatTarget,
      env: { NYX_RUNTIME_CHAT_STATE: '0' },
      now: () => timestamp,
    })

    manager.start(sender, request())
    await waitFor(() => expect(events.at(-1)?.type).toBe('chat:error'))
    manager.start(
      sender,
      request({
        requestId: 'request-2',
        turnIntent: 'retry_failed_response',
        turnOrdinal: 0,
        expectedAttemptRequestId: 'request-1',
        expectedDraftRevision: 1,
      }),
    )
    await waitFor(() => expect(events.at(-1)?.type).toBe('chat:done'))

    expect(resolveChatTarget).toHaveBeenNthCalledWith(1, selection)
    expect(resolveChatTarget).toHaveBeenNthCalledWith(2, selection)
    expect(coordinator.bindPreparedTarget).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ requestId: 'request-1' }),
      attributionA,
    )
    expect(coordinator.bindPreparedTarget).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ requestId: 'request-2' }),
      attributionB,
    )
    expect(events.filter((event) => event.type === 'chat:start')).toMatchObject([
      { requestId: 'request-1', targetAttribution: attributionA },
      { requestId: 'request-2', targetAttribution: attributionB },
    ])
    expect(events.find((event) => event.type === 'chat:error')).toMatchObject({
      requestId: 'request-1',
      targetAttribution: attributionA,
    })
    expect(coordinator.settleTurn).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ requestId: 'request-1', assistantStatus: 'failed' }),
    )
    expect(coordinator.settleTurn).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ requestId: 'request-2', assistantStatus: 'completed' }),
    )
  })

  it('settles Stop after acceptance without resolving a target', async () => {
    const preparation = deferred<PreparedThreadTurn>()
    const {
      coordinator,
      createRuntimeChatStateClient,
      events,
      manager,
      resolveChatTarget,
      sender,
    } = setup()
    coordinator.prepareTurn.mockReturnValueOnce(preparation.promise)

    manager.start(sender, request())
    await waitFor(() => expect(coordinator.prepareTurn).toHaveBeenCalledOnce())
    manager.cancel({ threadId, requestId: 'request-1' })
    preparation.resolve(prepared())
    await waitFor(() => expect(events.at(-1)?.type).toBe('chat:done'))

    expect(events.map((event) => event.type)).toEqual(['chat:accepted', 'chat:done'])
    expect(events.at(-1)).toMatchObject({ status: 'cancelled', finalContent: '' })
    expect(coordinator.settleTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId,
        requestId: 'request-1',
        assistantStatus: 'cancelled',
        assistantContent: '',
      }),
    )
    expect(resolveChatTarget).not.toHaveBeenCalled()
    expect(createRuntimeChatStateClient).not.toHaveBeenCalled()
    expect(streamChatCompletion).not.toHaveBeenCalled()
  })

  it('settles partial content and Runtime cancellation before emitting Stop completion', async () => {
    const { coordinator, events, manager, runtimeClient, sender } = setup()
    streamChatCompletion.mockImplementationOnce(async ({ signal, onDelta }) => {
      await onDelta('Part', 'Partial answer')
      return await new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(abortError()), { once: true })
      })
    })

    manager.start(sender, request())
    await waitFor(() => expect(events.at(-1)?.type).toBe('chat:delta'))
    manager.cancel({ threadId, requestId: 'request-1' })
    await waitFor(() => expect(events.at(-1)?.type).toBe('chat:done'))

    expect(coordinator.settleTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        assistantStatus: 'cancelled',
        assistantContent: 'Partial answer',
      }),
    )
    expect(runtimeClient.cancel).toHaveBeenCalledWith({
      turnRequestId: 'request-1',
      assistantMessageId: 'assistant-1',
      finalContent: 'Partial answer',
    })
    expect(coordinator.settleTurn.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(runtimeClient.cancel).mock.invocationCallOrder[0]!,
    )
    expect(events.at(-1)).toMatchObject({
      threadId,
      status: 'cancelled',
      finalContent: 'Partial answer',
    })
  })

  it('settles Stop after a deferred target bind without starting execution', async () => {
    const binding = deferred<ThreadLibraryThreadDetail>()
    const { coordinator, createRuntimeChatStateClient, events, manager, sender } = setup()
    coordinator.bindPreparedTarget.mockReturnValueOnce(binding.promise)

    manager.start(sender, request())
    await waitFor(() => expect(coordinator.bindPreparedTarget).toHaveBeenCalledOnce())
    manager.cancel({ threadId, requestId: 'request-1' })
    binding.resolve(detail())
    await waitFor(() => expect(events.at(-1)?.type).toBe('chat:done'))

    expect(coordinator.settleTurn).toHaveBeenCalledWith(
      expect.objectContaining({ assistantStatus: 'cancelled', assistantContent: '' }),
    )
    expect(coordinator.materializeProviderMessages).not.toHaveBeenCalled()
    expect(createRuntimeChatStateClient).not.toHaveBeenCalled()
    expect(streamChatCompletion).not.toHaveBeenCalled()
    expect(events.map((event) => event.type)).toEqual(['chat:accepted', 'chat:done'])
  })

  it('runs two Threads concurrently, rejects a third, and cancels only exact identity', async () => {
    const first = deferred<{ finalContent: string }>()
    const second = deferred<{ finalContent: string }>()
    const { capacityEvents, coordinator, events, manager, sender } = setup()
    streamChatCompletion
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
      .mockResolvedValueOnce({ finalContent: 'third answer' })

    manager.start(sender, request())
    await waitFor(() => expect(streamChatCompletion).toHaveBeenCalledTimes(1))
    manager.start(sender, request({ threadId: otherThreadId, requestId: 'request-2' }))
    await waitFor(() => expect(streamChatCompletion).toHaveBeenCalledTimes(2))

    manager.start(sender, request({ threadId: thirdThreadId, requestId: 'request-3' }))
    expect(events.at(-1)).toMatchObject({
      type: 'chat:error',
      threadId: thirdThreadId,
      requestId: 'request-3',
      error: { code: 'invalid_request', message: 'Two assistant responses are already running.' },
    })
    expect(coordinator.classifyTurn).toHaveBeenCalledTimes(2)
    expect(coordinator.prepareTurn).toHaveBeenCalledTimes(2)

    manager.cancel({ threadId: otherThreadId, requestId: 'request-1' })
    expect(streamChatCompletion.mock.calls[0]![0].signal.aborted).toBe(false)
    expect(streamChatCompletion.mock.calls[1]![0].signal.aborted).toBe(false)
    manager.cancel({ threadId, requestId: 'request-1' })
    expect(streamChatCompletion.mock.calls[0]![0].signal.aborted).toBe(true)
    expect(streamChatCompletion.mock.calls[1]![0].signal.aborted).toBe(false)

    first.resolve({ finalContent: 'ignored' })
    await waitFor(() =>
      expect(
        events.find((event) => event.type === 'chat:done' && event.threadId === threadId),
      ).toMatchObject({ status: 'cancelled' }),
    )
    manager.start(sender, request({ threadId: thirdThreadId, requestId: 'request-3b' }))
    await waitFor(() => expect(streamChatCompletion).toHaveBeenCalledTimes(3))
    second.resolve({ finalContent: 'second answer' })
    await waitFor(() =>
      expect(events.filter((event) => event.type === 'chat:done')).toHaveLength(3),
    )
    expect(
      events.find((event) => event.type === 'chat:done' && event.threadId === threadId),
    ).toMatchObject({
      status: 'cancelled',
    })
    expect(
      events.find((event) => event.type === 'chat:done' && event.threadId === otherThreadId),
    ).toMatchObject({ status: 'completed', finalContent: 'second answer' })
    expect(
      events.find((event) => event.type === 'chat:done' && event.threadId === thirdThreadId),
    ).toMatchObject({ status: 'completed', finalContent: 'third answer' })
    expect(capacityEvents.every((event) => event.activeRuns <= 2)).toBe(true)
    expect(capacityEvents.at(-1)).toEqual({
      type: 'chat:capacity',
      activeRuns: 0,
      attachmentRunActive: false,
    })
  })

  it('rejects a second attachment Run before Draft mutation and still admits text', async () => {
    const first = deferred<{ finalContent: string }>()
    const text = deferred<{ finalContent: string }>()
    const { capacityEvents, coordinator, events, manager, sender } = setup()
    coordinator.classifyTurn.mockImplementation(async (input) => input.threadId !== otherThreadId)
    coordinator.prepareTurn.mockImplementation(async (input) => {
      const next = preparedFor(input)
      next.attachmentBearing = input.threadId !== otherThreadId
      return next
    })
    streamChatCompletion.mockReturnValueOnce(first.promise).mockReturnValueOnce(text.promise)

    manager.start(sender, request())
    await waitFor(() => expect(streamChatCompletion).toHaveBeenCalledTimes(1))
    manager.start(sender, request({ threadId: thirdThreadId, requestId: 'request-3' }))
    await waitFor(() =>
      expect(events.at(-1)).toMatchObject({
        type: 'chat:error',
        threadId: thirdThreadId,
        error: { message: 'Another attachment response is already running.' },
      }),
    )
    expect(coordinator.prepareTurn).not.toHaveBeenCalledWith(
      expect.objectContaining({ threadId: thirdThreadId }),
      expect.anything(),
    )

    manager.start(sender, request({ threadId: otherThreadId, requestId: 'request-2' }))
    await waitFor(() => expect(streamChatCompletion).toHaveBeenCalledTimes(2))
    first.resolve({ finalContent: 'attachment answer' })
    text.resolve({ finalContent: 'text answer' })
    await waitFor(() =>
      expect(events.filter((event) => event.type === 'chat:done')).toHaveLength(2),
    )
    expect(capacityEvents).toContainEqual({
      type: 'chat:capacity',
      activeRuns: 1,
      attachmentRunActive: true,
    })
    expect(capacityEvents).toContainEqual({
      type: 'chat:capacity',
      activeRuns: 2,
      attachmentRunActive: true,
    })
    expect(capacityEvents.at(-1)).toEqual({
      type: 'chat:capacity',
      activeRuns: 0,
      attachmentRunActive: false,
    })
  })

  it('preserves the Draft when Stop wins during preflight classification', async () => {
    const classification = deferred<boolean>()
    const { capacityEvents, coordinator, events, manager, sender } = setup()
    coordinator.classifyTurn.mockReturnValueOnce(classification.promise)

    manager.start(sender, request())
    manager.cancel({ threadId, requestId: 'request-1' })
    classification.resolve(false)
    await waitFor(() => expect(events.at(-1)?.type).toBe('chat:error'))

    expect(events.at(-1)).toMatchObject({
      threadId,
      requestId: 'request-1',
      error: { code: 'cancelled', retryable: false },
    })
    expect(coordinator.prepareTurn).not.toHaveBeenCalled()
    expect(streamChatCompletion).not.toHaveBeenCalled()
    expect(capacityEvents).toEqual([
      { type: 'chat:capacity', activeRuns: 1, attachmentRunActive: false },
      { type: 'chat:capacity', activeRuns: 0, attachmentRunActive: false },
    ])
  })

  it('settles a target-resolution failure before exposing its safe error', async () => {
    const {
      coordinator,
      createRuntimeChatStateClient,
      events,
      manager,
      resolveChatTarget,
      sender,
    } = setup()
    resolveChatTarget.mockRejectedValueOnce(
      createChatBridgeError({
        code: 'target_unavailable',
        message: 'The selected chat target is unavailable.',
        retryable: true,
      }),
    )

    manager.start(sender, request())
    await waitFor(() => expect(events.at(-1)?.type).toBe('chat:error'))

    expect(events.map((event) => event.type)).toEqual(['chat:accepted', 'chat:error'])
    expect(events.at(-1)).toMatchObject({
      error: {
        code: 'target_unavailable',
        message: 'The selected chat target is unavailable.',
        retryable: true,
      },
    })
    expect(events.at(-1)).not.toHaveProperty('targetAttribution')
    expect(coordinator.settleTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        assistantStatus: 'failed',
        assistantContent: '',
        error: {
          code: 'target_unavailable',
          message: 'The selected chat target is unavailable.',
          retryable: true,
        },
      }),
    )
    expect(coordinator.bindPreparedTarget).not.toHaveBeenCalled()
    expect(coordinator.materializeProviderMessages).not.toHaveBeenCalled()
    expect(createRuntimeChatStateClient).not.toHaveBeenCalled()
    expect(streamChatCompletion).not.toHaveBeenCalled()
  })

  it('persists a Provider failure with its partial content before Runtime and Renderer', async () => {
    const { coordinator, events, manager, runtimeClient, sender } = setup()
    vi.mocked(runtimeClient.fail).mockRejectedValueOnce(
      new RuntimeChatStateClientError('Runtime failure projection failed'),
    )
    streamChatCompletion.mockImplementationOnce(async ({ onDelta }) => {
      await onDelta('Partial', 'Partial draft')
      throw createChatBridgeError({
        code: 'upstream_error',
        message: 'The provider reached its output limit before completing the answer.',
        retryable: true,
        details: 'finish_reason=length',
      })
    })

    manager.start(sender, request())
    await waitFor(() => expect(events.at(-1)?.type).toBe('chat:error'))

    expect(coordinator.settleTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        assistantStatus: 'failed',
        assistantContent: 'Partial draft',
        error: {
          code: 'upstream_error',
          message: 'The provider could not complete the response.',
          retryable: true,
        },
      }),
    )
    expect(coordinator.settleTurn.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(runtimeClient.fail).mock.invocationCallOrder[0]!,
    )
    expect(runtimeClient.close).toHaveBeenCalledOnce()
    expect(events.at(-1)).toMatchObject({
      targetAttribution: attribution,
      error: {
        code: 'upstream_error',
        details: 'finish_reason=length',
        retryable: true,
      },
    })
  })

  it('persists Provider attachment rejection before exposing its safe retryable error', async () => {
    const { coordinator, events, manager, sender } = setup()
    const attachmentTurn = prepared()
    attachmentTurn.documentBearing = true
    coordinator.prepareTurn.mockResolvedValueOnce(attachmentTurn)
    streamChatCompletion.mockRejectedValueOnce(
      createChatBridgeError({
        code: 'content_rejected',
        message: 'The selected target rejected this attachment request.',
        retryable: true,
      }),
    )

    manager.start(sender, request())
    await waitFor(() => expect(events.at(-1)?.type).toBe('chat:error'))

    expect(streamChatCompletion).toHaveBeenCalledWith(
      expect.objectContaining({ documentBearing: true }),
    )
    expect(coordinator.settleTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        assistantStatus: 'failed',
        error: {
          code: 'content_rejected',
          message: 'The selected target rejected this attachment request.',
          retryable: true,
        },
      }),
    )
    expect(events.at(-1)).toMatchObject({
      targetAttribution: attribution,
      error: { code: 'content_rejected', retryable: true },
    })
  })

  it('passes canonical image and document history with the document-bearing flag', async () => {
    const { coordinator, events, manager, sender } = setup()
    const attachmentTurn = prepared()
    attachmentTurn.documentBearing = true
    attachmentTurn.detail.images = [
      {
        threadId,
        owner: 'turn',
        turnOrdinal: 0,
        position: 0,
        imageId,
        mediaType: 'image/png',
        width: 2,
        height: 1,
        available: true,
      },
    ]
    attachmentTurn.detail.documents = [
      {
        threadId,
        owner: 'turn',
        turnOrdinal: 0,
        position: 0,
        documentId,
        name: 'notes.txt',
        mediaType: 'text/plain',
        byteLength: 5,
        extractedByteLength: 5,
        sourceSha256: 'b'.repeat(64),
        extractedTextSha256: 'c'.repeat(64),
        available: true,
        extractedText: 'notes',
      },
    ]
    const providerMessages = [
      {
        role: 'user' as const,
        content: [
          { type: 'image_url' as const, image_url: { url: 'data:image/png;base64,AQ==' } },
          { type: 'text' as const, text: 'Attached document "notes.txt".\n\nnotes' },
        ],
      },
    ]
    coordinator.prepareTurn.mockResolvedValueOnce(attachmentTurn)
    coordinator.materializeProviderMessages.mockResolvedValueOnce(providerMessages)

    manager.start(sender, request())
    await waitFor(() => expect(events.at(-1)?.type).toBe('chat:done'))

    expect(streamChatCompletion).toHaveBeenCalledWith(
      expect.objectContaining({ providerMessages, documentBearing: true }),
    )
  })

  it('settles an unavailable attachment without starting Runtime or Provider', async () => {
    const { coordinator, createRuntimeChatStateClient, events, manager, sender } = setup()
    coordinator.materializeProviderMessages.mockRejectedValueOnce(
      new ThreadLibraryCoordinatorError('A Thread document is unavailable.', 'invalid_request'),
    )

    manager.start(sender, request())
    await waitFor(() => expect(events.at(-1)?.type).toBe('chat:error'))

    expect(events.map((event) => event.type)).toEqual(['chat:accepted', 'chat:error'])
    expect(events.at(-1)).toMatchObject({
      error: {
        code: 'invalid_request',
        message: 'A Thread document is unavailable.',
        retryable: false,
      },
    })
    expect(coordinator.settleTurn).toHaveBeenCalledWith(
      expect.objectContaining({ assistantStatus: 'failed', assistantContent: '' }),
    )
    expect(createRuntimeChatStateClient).not.toHaveBeenCalled()
    expect(streamChatCompletion).not.toHaveBeenCalled()
  })

  it('commits a Responses continuation before treating Runtime completion as rebuildable', async () => {
    const order: string[] = []
    const { coordinator, events, manager, resolveChatTarget, runtimeClient, sender } = setup()
    const responseAttribution = {
      kind: 'connection',
      providerId: 'provider-1',
      providerDisplayName: 'Provider One',
      modelId: 'model-1',
      modelDisplayName: 'Model One',
    } as const
    resolveChatTarget.mockResolvedValueOnce({
      providerId: 'provider-1',
      baseUrl: 'https://example.test/v1',
      token: 'token',
      modelId: 'model-1',
      protocolConfig: { protocol: 'openai-responses', reasoningContext: 'auto' },
      executionIdentity: 'd'.repeat(64),
      targetAttribution: responseAttribution,
    })
    const providerState = {
      version: 1,
      protocol: 'openai-responses',
      effectiveReasoningContext: null,
      outputItems: [
        {
          type: 'message',
          role: 'assistant',
          status: 'completed',
          content: [{ type: 'output_text', text: 'Answer', annotations: [] }],
        },
      ],
    } as const
    streamChatCompletion.mockResolvedValueOnce({ finalContent: 'Answer', providerState })
    coordinator.settleTurn.mockImplementationOnce(async () => {
      order.push('worker:settle')
      return { id: 'settle', ok: true, value: detail('completed') }
    })
    vi.mocked(runtimeClient.complete).mockImplementationOnce(async () => {
      order.push('runtime:complete')
      throw new RuntimeChatStateClientError('Runtime completion failed')
    })

    manager.start(sender, request())
    await waitFor(() => expect(events.at(-1)?.type).toBe('chat:done'))

    expect(coordinator.bindPreparedTarget).toHaveBeenCalledWith(
      expect.objectContaining({ threadId, requestId: 'request-1' }),
      responseAttribution,
    )
    expect(coordinator.settleTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        assistantStatus: 'completed',
        assistantContent: 'Answer',
        continuation: {
          executionIdentity: 'd'.repeat(64),
          state: providerState,
        },
      }),
    )
    expect(order).toEqual(['worker:settle', 'runtime:complete'])
    expect(runtimeClient.close).toHaveBeenCalledOnce()
    expect(events.at(-1)).toMatchObject({ status: 'completed', finalContent: 'Answer' })
  })

  it('settles a Runtime replay failure without starting Provider work', async () => {
    const { coordinator, events, manager, runtimeClient, sender } = setup()
    coordinator.replayRuntimeHistory.mockRejectedValueOnce(
      new RuntimeChatStateClientError('Runtime replay failed'),
    )

    manager.start(sender, request())
    await waitFor(() => expect(events.at(-1)?.type).toBe('chat:error'))

    expect(coordinator.settleTurn).toHaveBeenCalledWith(
      expect.objectContaining({ assistantStatus: 'failed', assistantContent: '' }),
    )
    expect(runtimeClient.fail).toHaveBeenCalledWith({
      turnRequestId: 'request-1',
      assistantMessageId: 'assistant-1',
      message: 'Runtime replay failed',
    })
    expect(events.at(-1)).toMatchObject({
      error: { message: 'Runtime replay failed', retryable: false },
    })
    expect(streamChatCompletion).not.toHaveBeenCalled()
  })

  it('retries an exact terminal settlement without a second Provider or Runtime call', async () => {
    const { capacityEvents, coordinator, events, manager, runtimeClient, sender } = setup()
    coordinator.settleTurn.mockResolvedValueOnce({
      id: 'settle-failed',
      ok: false,
      safeError: { code: 'library_unavailable', message: 'Unavailable' },
      outcome: 'definitely_not_committed',
    } as never)
    manager.start(sender, request())
    await waitFor(() =>
      expect(events.at(-1)).toMatchObject({
        type: 'chat:error',
        error: { code: 'unknown', message: "Couldn't save result" },
      }),
    )
    expect(runtimeClient.complete).not.toHaveBeenCalled()
    expect(capacityEvents.at(-1)).toEqual({
      type: 'chat:capacity',
      activeRuns: 0,
      attachmentRunActive: false,
    })

    await manager.retrySettlement(sender, { threadId, requestId: 'request-1' })
    expect(events.at(-1)).toMatchObject({ type: 'chat:done', finalContent: 'Answer' })
    expect(streamChatCompletion).toHaveBeenCalledTimes(1)
    expect(runtimeClient.complete).not.toHaveBeenCalled()
    expect(coordinator.retrySettlement).toHaveBeenCalledWith(threadId, 'request-1')
  })
})
