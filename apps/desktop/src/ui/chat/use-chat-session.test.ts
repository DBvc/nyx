import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { NyxChatEvent } from '../../../shared/chat/events'
import type { NyxThreadChatRequest } from '../../../shared/chat/types'
import type { NyxThreadEvent } from '../../../shared/threads/events'
import type {
  NyxThreadDetail,
  NyxThreadMaterializeResult,
  NyxThreadResult,
  NyxThreadSaveDraftResult,
} from '../../../shared/threads/types'
import type { NyxConnectionsOverview } from '../../../shared/connections/types'
import { chatReducer } from './chat-reducer'
import { summarizeConnectionsOverview, type ConnectionStatusState } from './connection-status'
import { initialChatState, type ChatState } from './chat-types'
import {
  canSubmitChat,
  deriveTargetCatalogAction,
  revokeDraftPreviewUrls,
  useChatSession,
} from './use-chat-session'

const harness = vi.hoisted(() => ({
  state: undefined as unknown,
  refs: [] as Array<{ current: unknown }>,
  refIndex: 0,
  runEffects: false,
  cleanups: [] as Array<() => void>,
}))

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  return {
    ...actual,
    useReducer(reducer: (state: unknown, action: unknown) => unknown, initialState: unknown) {
      harness.state ??= initialState
      return [
        harness.state,
        (action: unknown) => {
          harness.state = reducer(harness.state, action)
        },
      ]
    },
    useRef(initialValue: unknown) {
      const index = harness.refIndex++
      harness.refs[index] ??= { current: initialValue }
      return harness.refs[index]
    },
    useEffect(effect: () => void | (() => void)) {
      if (!harness.runEffects) return
      const cleanup = effect()
      if (cleanup) harness.cleanups.push(cleanup)
    },
  }
})

const target = { kind: 'connection', providerId: 'provider-1', modelId: 'model-1' } as const

class TestWorker {
  static instances: TestWorker[] = []
  static constructorError: Error | null = null
  static postMessageError: Error | null = null

  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  readonly postMessage = vi.fn(() => {
    if (TestWorker.postMessageError) throw TestWorker.postMessageError
  })
  readonly terminate = vi.fn()

  constructor() {
    if (TestWorker.constructorError) throw TestWorker.constructorError
    TestWorker.instances.push(this)
  }

  emit(data: unknown) {
    this.onmessage?.({ data } as MessageEvent)
  }
}

function overview(): NyxConnectionsOverview {
  return {
    providers: [],
    defaultTarget: { providerId: 'provider-1', modelId: 'model-1' },
    defaultTargetSource: 'persisted_default',
    targetCatalog: {
      connectionTargets: [
        {
          providerId: 'provider-1',
          providerDisplayName: 'Provider One',
          modelId: 'model-1',
          modelDisplayName: 'Model One',
        },
      ],
      envFallback: null,
    },
  }
}

function readyStatus(): Extract<ConnectionStatusState, { kind: 'ready' }> {
  const value = overview()
  return {
    kind: 'ready',
    requestEpoch: 1,
    overview: value,
    summary: summarizeConnectionsOverview(value),
  }
}

function detail(text = '', threadId = 'thread-a'): NyxThreadDetail {
  return {
    summary: {
      availability: 'available',
      id: threadId,
      location: 'available',
      title: 'Canonical title',
      threadRevision: 1,
      resultRevision: 0,
      seenResultRevision: 0,
      lastUserActivityAt: '2026-01-01T00:00:00.000Z',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    draft: { revision: 2, text, targetSelection: target, images: [], documents: [] },
    messages: [],
    runStatus: 'idle',
    activeRun: null,
    retryableTurn: null,
    settlementFailure: null,
  }
}

function readyThreadState(value = detail()) {
  const hydrated = chatReducer(initialChatState, {
    type: 'thread-library-hydrated',
    generation: 0,
    summary: value.summary,
    detail: value,
    eventEpoch: 'epoch-1',
    listCursor: 0,
    detailCursor: 0,
  })
  return chatReducer(hydrated, {
    type: 'target-context-ready',
    generation: 0,
    catalogEpoch: 1,
    selection: target,
    available: true,
  })
}

function readyPlaceholderState() {
  const hydrated = chatReducer(initialChatState, {
    type: 'thread-library-hydrated',
    generation: 0,
    summary: null,
    detail: null,
    eventEpoch: 'epoch-1',
    listCursor: 0,
    detailCursor: 0,
  })
  return chatReducer(hydrated, {
    type: 'target-context-ready',
    generation: 0,
    catalogEpoch: 1,
    selection: target,
    available: true,
  })
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((next) => {
    resolve = next
  })
  return { promise, resolve }
}

function selectedSnapshot(value: NyxThreadDetail) {
  return {
    list: async () => ({
      ok: true as const,
      value: {
        rows: [value.summary],
        nextCursor: null,
        eventEpoch: 'epoch-1',
        includedThroughCursor: 0,
      },
    }),
    get: async () => ({
      ok: true as const,
      value: { detail: value, eventEpoch: 'epoch-1', includedThroughCursor: 0 },
    }),
  }
}

function reset(state: ChatState = initialChatState) {
  for (const cleanup of harness.cleanups.splice(0)) cleanup()
  harness.state = state
  harness.refs = []
  harness.refIndex = 0
  harness.runEffects = false
  TestWorker.instances = []
  TestWorker.constructorError = null
  TestWorker.postMessageError = null
}

function render(
  runEffects = false,
  options: {
    refreshConnections?: () => Promise<void>
    getLatestConnectionRequestEpoch?: () => number
    connectionStatus?: ConnectionStatusState
  } = {},
) {
  harness.refIndex = 0
  harness.runEffects = runEffects
  const session = useChatSession({
    connectionStatus: options.connectionStatus ?? readyStatus(),
    refreshConnections: options.refreshConnections ?? vi.fn(async () => undefined),
    getLatestConnectionRequestEpoch: options.getLatestConnectionRequestEpoch ?? (() => 1),
  })
  harness.runEffects = false
  return session
}

function installBridge(options?: {
  list?: () => Promise<
    NyxThreadResult<{
      rows: NyxThreadDetail['summary'][]
      nextCursor: string | null
      eventEpoch: string
      includedThroughCursor: number
    }>
  >
  get?: () => Promise<
    NyxThreadResult<{
      detail: NyxThreadDetail | null
      eventEpoch: string
      includedThroughCursor: number
    }>
  >
  materializeResult?: NyxThreadResult<NyxThreadMaterializeResult>
  saveDraftResult?: NyxThreadResult<NyxThreadSaveDraftResult>
  retryOpenResult?: NyxThreadResult<null>
  selectedId?: string | null
}) {
  let chatListener: ((event: NyxChatEvent) => void) | null = null
  let threadListener: ((event: NyxThreadEvent) => void) | null = null
  const listPage = vi.fn(
    options?.list ??
      (async () => ({
        ok: true as const,
        value: {
          rows: [],
          nextCursor: null,
          eventEpoch: 'epoch-1',
          includedThroughCursor: 0,
        },
      })),
  )
  const get = vi.fn(
    options?.get ??
      (async () => ({
        ok: true as const,
        value: { detail: null, eventEpoch: 'epoch-1', includedThroughCursor: 0 },
      })),
  )
  const materialize = vi.fn(async (input) =>
    options?.materializeResult
      ? options.materializeResult
      : {
          ok: true as const,
          value: {
            detail: { ...detail(input.text), draft: { ...detail(input.text).draft, ...input } },
            eventEpoch: 'epoch-1',
            includedThroughCursor: 3,
          },
        },
  )
  const saveDraft = vi.fn(async (input) =>
    options?.saveDraftResult
      ? options.saveDraftResult
      : {
          ok: true as const,
          value: {
            detail: {
              ...detail(input.text),
              draft: { ...detail(input.text).draft, revision: input.expectedDraftRevision + 1 },
            },
            eventEpoch: 'epoch-1',
            includedThroughCursor: 3,
            discarded: false,
          },
        },
  )
  const start = vi.fn(async (_input: NyxThreadChatRequest) => undefined)
  const cancel = vi.fn(async () => undefined)
  const retrySettlement = vi.fn(async () => undefined)
  const retryOpen = vi.fn(
    async () => options?.retryOpenResult ?? { ok: true as const, value: null },
  )
  const localStorage = { getItem: vi.fn(() => options?.selectedId ?? null), setItem: vi.fn() }
  vi.stubGlobal('window', {
    ...globalThis,
    clearTimeout,
    setTimeout,
    localStorage,
    nyx: {
      chat: {
        start,
        cancel,
        retrySettlement,
        subscribe(listener: (event: NyxChatEvent) => void) {
          chatListener = listener
          return () => {
            chatListener = null
          }
        },
      },
      threads: {
        listPage,
        get,
        materialize,
        saveDraft,
        retryOpen,
        markSeen: vi.fn(),
        subscribe(listener: (event: NyxThreadEvent) => void) {
          threadListener = listener
          return () => {
            threadListener = null
          }
        },
      },
    },
  })
  vi.stubGlobal('Worker', TestWorker)

  return {
    start,
    cancel,
    retrySettlement,
    materialize,
    saveDraft,
    listPage,
    get,
    retryOpen,
    localStorage,
    emitChat(event: NyxChatEvent) {
      chatListener?.(event)
    },
    emitThread(event: NyxThreadEvent) {
      threadListener?.(event)
    },
  }
}

async function settleSelectedHydration(
  bridge: ReturnType<typeof installBridge>,
  value: NyxThreadDetail,
) {
  reset(readyThreadState(value))
  render(true)
  await vi.waitFor(() => expect(bridge.get).toHaveBeenCalledOnce())
  await vi.waitFor(() => expect((harness.state as ChatState).targetInitialized).toBe(false))
  harness.state = chatReducer(harness.state as ChatState, {
    type: 'target-context-ready',
    generation: 0,
    catalogEpoch: 1,
    selection: target,
    available: true,
  })
  return render()
}

beforeEach(() => reset())
afterEach(() => {
  reset()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('C1 hydration', () => {
  it('subscribes before list/get and replays list/detail against separate watermarks', async () => {
    const page = deferred<
      NyxThreadResult<{
        rows: NyxThreadDetail['summary'][]
        nextCursor: null
        eventEpoch: string
        includedThroughCursor: number
      }>
    >()
    const snapshot = deferred<
      NyxThreadResult<{
        detail: NyxThreadDetail | null
        eventEpoch: string
        includedThroughCursor: number
      }>
    >()
    const bridge = installBridge({ list: () => page.promise, get: () => snapshot.promise })
    render(true)
    page.resolve({
      ok: true,
      value: {
        rows: [detail().summary],
        nextCursor: null,
        eventEpoch: 'epoch-1',
        includedThroughCursor: 4,
      },
    })
    await Promise.resolve()
    bridge.emitThread({
      type: 'threads:changed',
      detail: detail('at-five'),
      eventEpoch: 'epoch-1',
      includedThroughCursor: 5,
    })
    bridge.emitThread({
      type: 'threads:changed',
      detail: detail('at-six'),
      eventEpoch: 'epoch-1',
      includedThroughCursor: 6,
    })
    snapshot.resolve({
      ok: true,
      value: { detail: detail('snapshot'), eventEpoch: 'epoch-1', includedThroughCursor: 5 },
    })

    await vi.waitFor(() => expect((harness.state as ChatState).detailCursor).toBe(6))
    expect((harness.state as ChatState).input).toBe('at-six')
    expect((harness.state as ChatState).listCursor).toBe(6)
  })

  it('reconnects buffered stream events to the active Main run after Renderer reload', async () => {
    const snapshot = deferred<
      NyxThreadResult<{
        detail: NyxThreadDetail | null
        eventEpoch: string
        includedThroughCursor: number
      }>
    >()
    const value = detail()
    value.runStatus = 'streaming'
    value.activeRun = {
      requestId: 'request-live',
      assistantMessageId: 'assistant-live',
      turnIntent: 'new_user_message',
    }
    value.messages = [
      { id: 'user-live', role: 'user', content: 'Hello', status: 'completed' },
      { id: 'assistant-live', role: 'assistant', content: '', status: 'streaming' },
    ]
    const bridge = installBridge({
      list: async () => ({
        ok: true,
        value: {
          rows: [value.summary],
          nextCursor: null,
          eventEpoch: 'epoch-1',
          includedThroughCursor: 0,
        },
      }),
      get: () => snapshot.promise,
    })
    render(true)
    await vi.waitFor(() => expect(bridge.get).toHaveBeenCalledOnce())
    bridge.emitChat({
      type: 'chat:delta',
      threadId: 'thread-a',
      requestId: 'request-live',
      assistantMessageId: 'assistant-live',
      delta: 'Live',
      snapshot: 'Live after reload',
      eventEpoch: 'epoch-1',
      cursor: 1,
    })
    snapshot.resolve({
      ok: true,
      value: { detail: value, eventEpoch: 'epoch-1', includedThroughCursor: 0 },
    })

    await vi.waitFor(() =>
      expect((harness.state as ChatState).messages.at(-1)?.content).toBe('Live after reload'),
    )
    await render().stopActiveResponse()
    expect(bridge.cancel).toHaveBeenCalledWith({
      threadId: 'thread-a',
      requestId: 'request-live',
    })
  })

  it('continues after a reload snapshot that already includes earlier stream events', async () => {
    const value = detail()
    value.runStatus = 'streaming'
    value.activeRun = {
      requestId: 'request-live',
      assistantMessageId: 'assistant-live',
      turnIntent: 'new_user_message',
    }
    value.messages = [
      { id: 'user-live', role: 'user', content: 'Hello', status: 'completed' },
      {
        id: 'assistant-live',
        role: 'assistant',
        content: 'Before reload',
        status: 'streaming',
      },
    ]
    const bridge = installBridge({
      list: async () => ({
        ok: true,
        value: {
          rows: [value.summary],
          nextCursor: null,
          eventEpoch: 'epoch-1',
          includedThroughCursor: 3,
        },
      }),
      get: async () => ({
        ok: true,
        value: { detail: value, eventEpoch: 'epoch-1', includedThroughCursor: 3 },
      }),
    })
    render(true)
    await vi.waitFor(() =>
      expect((harness.state as ChatState).messages.at(-1)?.content).toBe('Before reload'),
    )

    bridge.emitChat({
      type: 'chat:delta',
      threadId: 'thread-a',
      requestId: 'request-live',
      assistantMessageId: 'assistant-live',
      delta: ' and after',
      snapshot: 'Before reload and after',
      eventEpoch: 'epoch-1',
      cursor: 4,
    })

    await vi.waitFor(() =>
      expect((harness.state as ChatState).messages.at(-1)?.content).toBe('Before reload and after'),
    )
    expect(bridge.get).toHaveBeenCalledOnce()
    await render().stopActiveResponse()
    expect(bridge.cancel).toHaveBeenCalledWith({
      threadId: 'thread-a',
      requestId: 'request-live',
    })
  })

  it('clears a stale accepted run after a terminal event gap rehydrates canonical state', async () => {
    const live = detail()
    live.runStatus = 'streaming'
    live.activeRun = {
      requestId: 'request-live',
      assistantMessageId: 'assistant-live',
      turnIntent: 'new_user_message',
    }
    live.messages = [
      { id: 'user-live', role: 'user', content: 'Hello', status: 'completed' },
      { id: 'assistant-live', role: 'assistant', content: 'Partial', status: 'streaming' },
    ]
    const terminal = detail()
    terminal.runStatus = 'completed'
    terminal.activeRun = null
    terminal.messages = [
      { id: 'user-live', role: 'user', content: 'Hello', status: 'completed' },
      { id: 'assistant-live', role: 'assistant', content: 'Done', status: 'completed' },
    ]
    let hydration = 0
    const bridge = installBridge({
      list: async () => {
        hydration += 1
        const value = hydration === 1 ? live : terminal
        return {
          ok: true,
          value: {
            rows: [value.summary],
            nextCursor: null,
            eventEpoch: 'epoch-1',
            includedThroughCursor: hydration === 1 ? 0 : 2,
          },
        }
      },
      get: async () => ({
        ok: true,
        value: {
          detail: hydration === 1 ? live : terminal,
          eventEpoch: 'epoch-1',
          includedThroughCursor: hydration === 1 ? 0 : 2,
        },
      }),
    })
    render(true)
    await vi.waitFor(() =>
      expect((harness.state as ChatState).activeRequestId).toBe('request-live'),
    )
    harness.state = chatReducer(harness.state as ChatState, {
      type: 'set-input',
      value: 'dirty overlay',
    })
    render()

    bridge.emitChat({
      type: 'chat:done',
      threadId: 'thread-a',
      requestId: 'request-live',
      assistantMessageId: 'assistant-live',
      status: 'completed',
      finalContent: 'Done',
      eventEpoch: 'epoch-1',
      cursor: 2,
    })

    await vi.waitFor(() => expect(bridge.listPage).toHaveBeenCalledTimes(2))
    await vi.waitFor(() => expect((harness.state as ChatState).runStatus).toBe('completed'))
    expect(harness.state).toMatchObject({ input: 'dirty overlay', activeTurn: null })
    expect((harness.state as ChatState).activeRequestId).toBeUndefined()
  })

  it('hydrates the locally selected row instead of treating list order as selection truth', async () => {
    const selected = detail('selected', 'thread-b')
    const bridge = installBridge({
      selectedId: 'thread-b',
      list: async () => ({
        ok: true,
        value: {
          rows: [detail('first').summary, selected.summary],
          nextCursor: null,
          eventEpoch: 'epoch-1',
          includedThroughCursor: 2,
        },
      }),
      get: async () => ({
        ok: true,
        value: { detail: selected, eventEpoch: 'epoch-1', includedThroughCursor: 2 },
      }),
    })
    render(true)

    await vi.waitFor(() => expect((harness.state as ChatState).selectedThreadId).toBe('thread-b'))
    expect(bridge.get).toHaveBeenCalledWith({ threadId: 'thread-b' })
    expect(bridge.localStorage.setItem).toHaveBeenCalledWith('nyx.thread.selected.v1', 'thread-b')
  })

  it('restores a stored Thread outside the first list page by exact id', async () => {
    const selected = detail('selected outside page', 'thread-b')
    const bridge = installBridge({
      selectedId: 'thread-b',
      list: async () => ({
        ok: true,
        value: {
          rows: [detail('first page').summary],
          nextCursor: 'next-page',
          eventEpoch: 'epoch-1',
          includedThroughCursor: 2,
        },
      }),
      get: async () => ({
        ok: true,
        value: { detail: selected, eventEpoch: 'epoch-1', includedThroughCursor: 2 },
      }),
    })
    render(true)

    await vi.waitFor(() => expect((harness.state as ChatState).selectedThreadId).toBe('thread-b'))
    expect(bridge.get).toHaveBeenCalledWith({ threadId: 'thread-b' })
  })

  it('keeps an identifiable unavailable Thread selected and Retry-only', async () => {
    const selected = detail().summary
    installBridge({
      list: async () => ({
        ok: true,
        value: {
          rows: [selected],
          nextCursor: null,
          eventEpoch: 'epoch-1',
          includedThroughCursor: 2,
        },
      }),
      get: async () => ({
        ok: false,
        error: { code: 'thread_unavailable', message: 'Canonical content failed.' },
      }),
    })
    render(true)

    await vi.waitFor(() => expect((harness.state as ChatState).hydrationStatus).toBe('error'))
    expect(harness.state).toMatchObject({
      selectedThreadId: 'thread-a',
      hydrationErrorThreadId: 'thread-a',
      threadSummary: { availability: 'unavailable', title: "Couldn't open this thread" },
    })
  })

  it('rehydrates on a cursor gap instead of applying a partial projection', async () => {
    const selected = detail()
    const bridge = installBridge({
      list: async () => ({
        ok: true,
        value: {
          rows: [selected.summary],
          nextCursor: null,
          eventEpoch: 'epoch-1',
          includedThroughCursor: 0,
        },
      }),
      get: async () => ({
        ok: true,
        value: { detail: selected, eventEpoch: 'epoch-1', includedThroughCursor: 0 },
      }),
    })
    reset(readyThreadState(selected))
    render(true)
    await vi.waitFor(() => expect(bridge.listPage).toHaveBeenCalledOnce())

    bridge.emitThread({
      type: 'threads:changed',
      detail: detail('must not apply'),
      eventEpoch: 'epoch-1',
      includedThroughCursor: 2,
    })

    await vi.waitFor(() => expect(bridge.listPage).toHaveBeenCalledTimes(2))
    expect((harness.state as ChatState).input).not.toBe('must not apply')
  })

  it('does not let a late event for Thread A replace selected Thread B', async () => {
    const selected = detail('selected B', 'thread-b')
    const bridge = installBridge({ ...selectedSnapshot(selected), selectedId: 'thread-b' })
    reset(readyThreadState(selected))
    render(true)
    await vi.waitFor(() => expect(bridge.get).toHaveBeenCalledOnce())

    bridge.emitThread({
      type: 'threads:changed',
      detail: detail('late A', 'thread-a'),
      eventEpoch: 'epoch-1',
      includedThroughCursor: 1,
    })

    expect(harness.state).toMatchObject({ selectedThreadId: 'thread-b', input: 'selected B' })
  })

  it('does not let a late Thread A snapshot replace a newer Thread B hydration', async () => {
    const staleA = deferred<
      NyxThreadResult<{
        detail: NyxThreadDetail | null
        eventEpoch: string
        includedThroughCursor: number
      }>
    >()
    const threadA = detail('draft A', 'thread-a')
    threadA.messages = [
      { id: 'message-a', role: 'user', content: 'message A', status: 'completed' },
    ]
    const threadB = detail('draft B', 'thread-b')
    threadB.messages = [
      { id: 'message-b', role: 'user', content: 'message B', status: 'completed' },
    ]
    let listCalls = 0
    let getCalls = 0
    const bridge = installBridge({
      selectedId: 'thread-a',
      list: async () => {
        listCalls += 1
        const selected = listCalls === 1 ? threadA : threadB
        return {
          ok: true,
          value: {
            rows: [selected.summary],
            nextCursor: null,
            eventEpoch: 'epoch-1',
            includedThroughCursor: listCalls === 1 ? 2 : 10,
          },
        }
      },
      get: async () => {
        getCalls += 1
        return getCalls === 1
          ? staleA.promise
          : {
              ok: true,
              value: { detail: threadB, eventEpoch: 'epoch-1', includedThroughCursor: 12 },
            }
      },
    })
    render(true)
    await vi.waitFor(() => expect(bridge.get).toHaveBeenCalledWith({ threadId: 'thread-a' }))

    bridge.localStorage.getItem.mockReturnValue('thread-b')
    harness.state = chatReducer(harness.state as ChatState, {
      type: 'thread-library-hydration-failed',
      generation: 0,
      error: { code: 'library_unavailable', message: "Couldn't open Thread Library" },
    })
    await render().retryOpen()
    await vi.waitFor(() => expect((harness.state as ChatState).selectedThreadId).toBe('thread-b'))

    staleA.resolve({
      ok: true,
      value: { detail: threadA, eventEpoch: 'epoch-1', includedThroughCursor: 4 },
    })
    await staleA.promise
    await Promise.resolve()

    expect(harness.state).toMatchObject({
      selectedThreadId: 'thread-b',
      input: 'draft B',
      messages: [{ id: 'message-b', content: 'message B' }],
      listCursor: 10,
      detailCursor: 12,
    })
  })

  it('rehydrates after a Worker epoch-change event', async () => {
    const selected = detail()
    const bridge = installBridge(selectedSnapshot(selected))
    reset(readyThreadState(selected))
    render(true)
    await vi.waitFor(() => expect(bridge.listPage).toHaveBeenCalledOnce())

    bridge.emitThread({
      type: 'threads:epoch-changed',
      eventEpoch: 'epoch-2',
      includedThroughCursor: 0,
    })

    await vi.waitFor(() => expect(bridge.listPage).toHaveBeenCalledTimes(2))
  })

  it('retries hydration when list and detail epochs do not describe one projection', async () => {
    const selected = detail('canonical')
    let getCalls = 0
    const bridge = installBridge({
      list: async () => ({
        ok: true,
        value: {
          rows: [selected.summary],
          nextCursor: null,
          eventEpoch: 'epoch-2',
          includedThroughCursor: 0,
        },
      }),
      get: async () => {
        getCalls += 1
        return {
          ok: true,
          value: {
            detail: selected,
            eventEpoch: getCalls === 1 ? 'epoch-1' : 'epoch-2',
            includedThroughCursor: 0,
          },
        }
      },
    })
    render(true)

    await vi.waitFor(() => expect(bridge.get).toHaveBeenCalledTimes(2))
    await vi.waitFor(() => expect((harness.state as ChatState).input).toBe('canonical'))
    expect((harness.state as ChatState).eventEpoch).toBe('epoch-2')
  })

  it.each([
    {
      name: 'Library',
      state: chatReducer(initialChatState, {
        type: 'thread-library-hydration-failed',
        generation: 0,
        error: { code: 'library_unavailable', message: "Couldn't open Thread Library" },
      }),
      expected: { scope: 'library' as const },
    },
    {
      name: 'Thread',
      state: chatReducer(readyThreadState(), {
        type: 'thread-library-hydration-failed',
        generation: 0,
        threadId: 'thread-a',
        error: { code: 'thread_unavailable', message: "Couldn't open this thread" },
      }),
      expected: { scope: 'thread' as const, threadId: 'thread-a' },
    },
  ])('uses the exact $name Retry scope', async ({ state, expected }) => {
    const pending = deferred<never>()
    const bridge = installBridge({ list: () => pending.promise })
    reset(state)
    const session = render(true)

    void session.retryOpen()
    await vi.waitFor(() => expect(bridge.retryOpen).toHaveBeenCalledWith(expected))

    expect((harness.state as ChatState).hydrationRetrying).toBe(true)
  })

  it('promotes a failed exact Thread Retry to a Library error', async () => {
    const state = chatReducer(readyThreadState(), {
      type: 'thread-library-hydration-failed',
      generation: 0,
      threadId: 'thread-a',
      error: { code: 'thread_unavailable', message: "Couldn't open this thread" },
    })
    installBridge({
      retryOpenResult: {
        ok: false,
        error: { code: 'library_unavailable', message: "Couldn't open Thread Library" },
      },
    })
    reset(state)

    await render().retryOpen()

    expect((harness.state as ChatState).hydrationError).toEqual({
      code: 'library_unavailable',
      message: "Couldn't open Thread Library",
    })
    expect((harness.state as ChatState).hydrationErrorThreadId).toBeNull()
    expect((harness.state as ChatState).threadSummary).toBeNull()
  })
})

describe('target and attachment readiness', () => {
  it('keeps a committed unavailable target blocked until an available draft is chosen', () => {
    const status = readyStatus()
    const unavailableOverview = {
      ...status.overview,
      defaultTarget: null,
      defaultTargetSource: 'env_fallback' as const,
      targetCatalog: { connectionTargets: [], envFallback: { modelId: 'env-model' } },
    }
    const unavailableStatus: Extract<ConnectionStatusState, { kind: 'ready' }> = {
      ...status,
      overview: unavailableOverview,
      summary: summarizeConnectionsOverview(unavailableOverview),
    }
    const initialized = chatReducer(
      chatReducer(initialChatState, {
        type: 'thread-library-hydrated',
        generation: 0,
        summary: detail().summary,
        detail: detail(),
        eventEpoch: 'epoch-1',
        listCursor: 0,
        detailCursor: 0,
      }),
      {
        type: 'target-context-ready',
        generation: 0,
        catalogEpoch: 1,
        selection: target,
        available: false,
      },
    )
    const withInput = chatReducer(initialized, { type: 'set-input', value: 'Hello' })
    const available = chatReducer(withInput, {
      type: 'target-draft-changed',
      selection: { kind: 'env_fallback' },
      available: true,
    })

    expect(canSubmitChat(withInput, unavailableStatus)).toBe(false)
    expect(canSubmitChat(available, unavailableStatus)).toBe(true)
  })

  it('rechecks the latest catalog and requires every attachment to be ready', () => {
    const status = readyStatus()
    const base = readyThreadState(detail('Hello'))
    const preparing = {
      ...base,
      draftImages: [
        { id: 'image-1', name: 'one.png', status: 'preparing' as const, source: new Blob() },
      ],
      draftDocuments: [
        {
          id: 'document-1',
          name: 'notes.txt',
          mediaType: 'text/plain' as const,
          status: 'preparing' as const,
          source: new File(['hello'], 'notes.txt'),
        },
      ],
    }
    const removedTargetOverview = {
      ...status.overview,
      targetCatalog: { ...status.overview.targetCatalog, connectionTargets: [] },
    }

    expect(canSubmitChat(preparing, status)).toBe(false)
    expect(
      canSubmitChat(base, {
        ...status,
        requestEpoch: 2,
        overview: removedTargetOverview,
        summary: summarizeConnectionsOverview(removedTargetOverview),
      }),
    ).toBe(false)
  })
})

describe('C1 save and execution boundary', () => {
  it('materializes the first nonblank draft and starts with no Renderer history or ids', async () => {
    const bridge = installBridge()
    const ready = chatReducer(initialChatState, {
      type: 'thread-library-hydrated',
      generation: 0,
      summary: null,
      detail: null,
      eventEpoch: 'epoch-1',
      listCursor: 0,
      detailCursor: 0,
    })
    reset(
      chatReducer(ready, {
        type: 'target-context-ready',
        generation: 0,
        catalogEpoch: 1,
        selection: target,
        available: true,
      }),
    )
    let session = render()
    session.setInput('hello')
    session = render()
    await session.sendCurrentInput()

    expect(bridge.materialize).toHaveBeenCalledWith(expect.objectContaining({ text: 'hello' }))
    expect(bridge.start).toHaveBeenCalledOnce()
    expect(bridge.start.mock.calls[0]![0]).toEqual({
      threadId: 'thread-a',
      requestId: expect.any(String),
      turnIntent: 'new_user_message',
      expectedDraftRevision: 2,
    })
    expect(bridge.start.mock.calls[0]![0]).not.toHaveProperty('messages')
    expect(bridge.start.mock.calls[0]![0]).not.toHaveProperty('userMessageId')
  })

  it('materializes ready image and document refs with their new bytes before Send', async () => {
    const bridge = installBridge()
    const canonicalBytes = new Uint8Array([1])
    const previewBytes = new Uint8Array([2])
    const sourceBytes = new TextEncoder().encode('hello')
    const extractedTextBytes = new TextEncoder().encode('hello')
    reset({
      ...readyPlaceholderState(),
      draftImages: [
        {
          id: 'image-1',
          name: 'one.png',
          status: 'ready',
          source: null,
          image: { mediaType: 'image/png', width: 2, height: 3 },
          canonicalBytes,
          previewBytes,
          previewUrl: 'blob:one',
        },
      ],
      draftDocuments: [
        {
          id: 'document-1',
          name: 'notes.txt',
          mediaType: 'text/plain',
          status: 'ready',
          source: null,
          document: {
            name: 'notes.txt',
            mediaType: 'text/plain',
            byteLength: 5,
            extractedByteLength: 5,
          },
          sourceBytes,
          extractedTextBytes,
          extractedFromSha256: 'a'.repeat(64),
        },
      ],
      draftEditVersion: 2,
    })

    await render().sendCurrentInput()

    expect(bridge.materialize).toHaveBeenCalledWith({
      text: '',
      targetSelection: target,
      images: [
        {
          imageId: 'image-1',
          mediaType: 'image/png',
          width: 2,
          height: 3,
          position: 0,
        },
      ],
      documents: [
        {
          documentId: 'document-1',
          name: 'notes.txt',
          mediaType: 'text/plain',
          byteLength: 5,
          extractedByteLength: 5,
          position: 0,
        },
      ],
      newImages: [{ imageId: 'image-1', canonicalBytes, previewBytes }],
      newDocuments: [
        {
          documentId: 'document-1',
          sourceBytes,
          extractedTextBytes,
          extractedFromSha256: 'a'.repeat(64),
        },
      ],
    })
    expect(bridge.start).toHaveBeenCalledOnce()
  })

  it('retains a placeholder overlay when materialization fails and never starts Provider work', async () => {
    const bridge = installBridge({
      materializeResult: {
        ok: false,
        error: { code: 'conflict', message: 'Not saved.' },
      },
    })
    reset(readyPlaceholderState())
    let session = render()
    session.setInput('keep me')
    session = render()
    await session.sendCurrentInput()

    expect(bridge.materialize).toHaveBeenCalledWith(expect.objectContaining({ text: 'keep me' }))
    expect(bridge.start).not.toHaveBeenCalled()
    expect(harness.state).toMatchObject({
      selectedThreadId: null,
      input: 'keep me',
      composerError: { message: 'Not saved.' },
    })
  })

  it('saves an edit made while materialization is in flight before Send', async () => {
    const older = detail('older')
    older.draft.revision = 0
    const newer = detail('newer')
    newer.draft.revision = 1
    const pending = deferred<NyxThreadResult<NyxThreadMaterializeResult>>()
    const bridge = installBridge({
      saveDraftResult: {
        ok: true,
        value: {
          detail: newer,
          discarded: false,
          eventEpoch: 'epoch-1',
          includedThroughCursor: 2,
        },
      },
    })
    bridge.materialize.mockImplementationOnce(() => pending.promise)
    reset(chatReducer(readyPlaceholderState(), { type: 'set-input', value: 'older' }))

    let session = render()
    const sending = session.sendCurrentInput()
    await vi.waitFor(() => expect(bridge.materialize).toHaveBeenCalledOnce())
    session.setInput('newer')
    render()
    pending.resolve({
      ok: true,
      value: { detail: older, eventEpoch: 'epoch-1', includedThroughCursor: 1 },
    })
    await sending

    expect(bridge.materialize).toHaveBeenCalledWith(expect.objectContaining({ text: 'older' }))
    expect(bridge.saveDraft).toHaveBeenCalledWith(
      expect.objectContaining({ threadId: 'thread-a', expectedDraftRevision: 0, text: 'newer' }),
    )
    expect(bridge.start).toHaveBeenCalledWith(
      expect.objectContaining({ threadId: 'thread-a', expectedDraftRevision: 1 }),
    )
    expect((harness.state as ChatState).input).toBe('newer')
  })

  it('does not materialize or Send a ready image removed in the same event-loop turn', async () => {
    const bridge = installBridge()
    reset({
      ...readyPlaceholderState(),
      draftImages: [
        {
          id: 'image-1',
          name: 'one.png',
          status: 'ready',
          source: null,
          image: { mediaType: 'image/png', width: 1, height: 1 },
          canonicalBytes: new Uint8Array([1]),
          previewBytes: new Uint8Array([2]),
          previewUrl: 'blob:one',
        },
      ],
      draftEditVersion: 1,
    })
    const session = render()

    session.removeDraftImage('image-1')
    await session.sendCurrentInput()

    expect(bridge.materialize).not.toHaveBeenCalled()
    expect(bridge.start).not.toHaveBeenCalled()
    expect((harness.state as ChatState).draftImages).toEqual([])
  })

  it('does not materialize or Send a ready document removed in the same event-loop turn', async () => {
    const bridge = installBridge()
    reset({
      ...readyPlaceholderState(),
      draftDocuments: [
        {
          id: 'document-1',
          name: 'notes.txt',
          mediaType: 'text/plain',
          status: 'ready',
          source: null,
          document: {
            name: 'notes.txt',
            mediaType: 'text/plain',
            byteLength: 5,
            extractedByteLength: 5,
          },
          sourceBytes: new TextEncoder().encode('hello'),
          extractedTextBytes: new TextEncoder().encode('hello'),
          extractedFromSha256: 'a'.repeat(64),
        },
      ],
      draftEditVersion: 1,
    })
    const session = render()

    session.removeDraftDocument('document-1')
    await session.sendCurrentInput()

    expect(bridge.materialize).not.toHaveBeenCalled()
    expect(bridge.start).not.toHaveBeenCalled()
    expect((harness.state as ChatState).draftDocuments).toEqual([])
  })

  it('streams, stops, and preserves the cancelled canonical projection with thread identity', async () => {
    const value = detail('Hello')
    const bridge = installBridge(selectedSnapshot(value))
    const session = await settleSelectedHydration(bridge, value)

    await session.sendCurrentInput()
    const request = bridge.start.mock.calls[0]![0]
    render()
    bridge.emitChat({
      type: 'chat:accepted',
      threadId: 'thread-a',
      requestId: request.requestId,
      userMessageId: 'user-main',
      assistantMessageId: 'assistant-main',
      turnIntent: 'new_user_message',
      eventEpoch: 'epoch-1',
      cursor: 1,
    })
    render()
    bridge.emitChat({
      type: 'chat:start',
      threadId: 'thread-a',
      requestId: request.requestId,
      assistantMessageId: 'assistant-main',
      status: 'streaming',
      targetAttribution: {
        kind: 'connection',
        providerId: 'provider-1',
        providerDisplayName: 'Provider One',
        modelId: 'model-1',
        modelDisplayName: 'Model One',
      },
      eventEpoch: 'epoch-1',
      cursor: 2,
    })
    bridge.emitChat({
      type: 'chat:delta',
      threadId: 'thread-a',
      requestId: request.requestId,
      assistantMessageId: 'assistant-main',
      delta: 'Partial',
      snapshot: 'Partial response',
      eventEpoch: 'epoch-1',
      cursor: 3,
    })

    expect((harness.state as ChatState).messages.at(-1)).toMatchObject({
      content: 'Partial response',
      status: 'streaming',
    })
    await render().stopActiveResponse()
    expect(bridge.cancel).toHaveBeenCalledWith({
      threadId: 'thread-a',
      requestId: request.requestId,
    })
    bridge.emitChat({
      type: 'chat:done',
      threadId: 'thread-a',
      requestId: request.requestId,
      assistantMessageId: 'assistant-main',
      status: 'cancelled',
      finalContent: 'Partial response',
      eventEpoch: 'epoch-1',
      cursor: 4,
    })

    expect((harness.state as ChatState).runStatus).toBe('cancelled')
    expect((harness.state as ChatState).messages.at(-1)).toMatchObject({
      content: 'Partial response',
      status: 'cancelled',
    })
  })

  it('retains a pre-accepted draft, supports Stop, and blocks a same-tick double Send', async () => {
    const value = detail('Hello')
    const bridge = installBridge(selectedSnapshot(value))
    const session = await settleSelectedHydration(bridge, value)

    await Promise.all([session.sendCurrentInput(), session.sendCurrentInput()])
    expect(bridge.start).toHaveBeenCalledOnce()
    const request = bridge.start.mock.calls[0]![0]
    await render().stopActiveResponse()
    expect(bridge.cancel).toHaveBeenCalledWith({
      threadId: 'thread-a',
      requestId: request.requestId,
    })
    bridge.emitChat({
      type: 'chat:error',
      threadId: 'thread-a',
      requestId: request.requestId,
      status: 'failed',
      error: { code: 'cancelled', message: 'Request cancelled.', retryable: false },
      eventEpoch: 'epoch-1',
      cursor: 1,
    })

    expect((harness.state as ChatState).input).toBe('Hello')
    expect((harness.state as ChatState).messages).toEqual([])
  })

  it('sends an ordinary Retry with only canonical Thread/Turn identity', async () => {
    const value = detail()
    value.messages = [
      { id: 'user-1', role: 'user', content: 'Hello', status: 'completed' },
      {
        id: 'assistant-1',
        role: 'assistant',
        content: 'Partial',
        status: 'failed',
        error: { code: 'network_error', message: 'Network failed.', retryable: true },
        canRetry: true,
      },
    ]
    value.runStatus = 'failed'
    value.retryableTurn = {
      turnOrdinal: 4,
      expectedAttemptRequestId: 'attempt-1',
      expectedDraftRevision: 2,
      userMessageId: 'user-1',
      assistantMessageId: 'assistant-1',
    }
    const bridge = installBridge(selectedSnapshot(value))
    const session = await settleSelectedHydration(bridge, value)

    await session.retryMessage('assistant-1')

    expect(bridge.start).toHaveBeenCalledWith({
      threadId: 'thread-a',
      requestId: expect.any(String),
      turnIntent: 'retry_failed_response',
      turnOrdinal: 4,
      expectedAttemptRequestId: 'attempt-1',
      expectedDraftRevision: 2,
    })
    expect(bridge.start.mock.calls[0]![0]).not.toHaveProperty('messages')
  })

  it('routes settlement Retry to retrySettlement without another start', async () => {
    const failedDetail = detail()
    failedDetail.messages = [
      {
        id: 'assistant-1',
        role: 'assistant',
        content: 'complete answer',
        status: 'failed',
        error: { code: 'unknown', message: "Couldn't save result", retryable: true },
        canRetry: true,
      },
    ]
    failedDetail.settlementFailure = { requestId: 'request-1', assistantMessageId: 'assistant-1' }
    const bridge = installBridge(selectedSnapshot(failedDetail))
    const session = await settleSelectedHydration(bridge, failedDetail)
    await session.retryMessage('assistant-1')

    expect(bridge.retrySettlement).toHaveBeenCalledWith({
      threadId: 'thread-a',
      requestId: 'request-1',
    })
    expect(bridge.start).not.toHaveBeenCalled()

    const canonicalFailure = detail()
    canonicalFailure.messages = [
      {
        id: 'assistant-1',
        role: 'assistant',
        content: 'complete answer',
        status: 'failed',
        error: {
          code: 'upstream_error',
          message: 'The provider could not complete the response.',
          retryable: true,
        },
        canRetry: true,
      },
    ]
    canonicalFailure.retryableTurn = {
      turnOrdinal: 4,
      expectedAttemptRequestId: 'request-1',
      expectedDraftRevision: 2,
      userMessageId: 'user-1',
      assistantMessageId: 'assistant-1',
    }
    bridge.get.mockResolvedValueOnce({
      ok: true,
      value: { detail: canonicalFailure, eventEpoch: 'epoch-1', includedThroughCursor: 1 },
    })

    bridge.emitChat({
      type: 'chat:error',
      threadId: 'thread-a',
      requestId: 'request-1',
      assistantMessageId: 'assistant-1',
      status: 'failed',
      error: {
        code: 'upstream_error',
        message: 'The provider could not complete the response.',
        retryable: true,
      },
      eventEpoch: 'epoch-1',
      cursor: 1,
    })

    expect((harness.state as ChatState).settlementFailure).toBeNull()
    expect((harness.state as ChatState).messages.at(-1)).toMatchObject({
      id: 'assistant-1',
      status: 'failed',
      error: { code: 'upstream_error' },
      canRetry: true,
    })

    await vi.waitFor(() => expect((harness.state as ChatState).retryableTurn).not.toBeNull())
    await render().retryMessage('assistant-1')
    expect(bridge.start).toHaveBeenCalledWith({
      threadId: 'thread-a',
      requestId: expect.any(String),
      turnIntent: 'retry_failed_response',
      turnOrdinal: 4,
      expectedAttemptRequestId: 'request-1',
      expectedDraftRevision: 2,
    })
  })

  it('keeps New locked while settlement recovery hydration finishes late', async () => {
    const failedDetail = detail()
    failedDetail.messages = [
      {
        id: 'assistant-1',
        role: 'assistant',
        content: 'complete answer',
        status: 'failed',
        error: { code: 'unknown', message: "Couldn't save result", retryable: true },
        canRetry: true,
      },
    ]
    failedDetail.settlementFailure = { requestId: 'request-1', assistantMessageId: 'assistant-1' }
    const bridge = installBridge(selectedSnapshot(failedDetail))
    const session = await settleSelectedHydration(bridge, failedDetail)
    await session.retryMessage('assistant-1')

    const lateHydration = deferred<
      NyxThreadResult<{
        detail: NyxThreadDetail | null
        eventEpoch: string
        includedThroughCursor: number
      }>
    >()
    const cleared = deferred<
      NyxThreadResult<{
        detail: NyxThreadDetail | null
        eventEpoch: string
        includedThroughCursor: number
      }>
    >()
    bridge.get.mockImplementationOnce(() => lateHydration.promise)
    bridge.get.mockImplementationOnce(() => cleared.promise)
    bridge.emitChat({
      type: 'chat:error',
      threadId: 'thread-a',
      requestId: 'request-1',
      assistantMessageId: 'assistant-1',
      status: 'failed',
      error: {
        code: 'upstream_error',
        message: 'The provider could not complete the response.',
        retryable: true,
      },
      eventEpoch: 'epoch-1',
      cursor: 1,
    })
    await vi.waitFor(() => expect(bridge.get).toHaveBeenCalledTimes(2))

    const newThread = render().startNewChat()
    await vi.waitFor(() => expect(bridge.get).toHaveBeenCalledTimes(3))
    lateHydration.resolve({
      ok: true,
      value: { detail: failedDetail, eventEpoch: 'epoch-1', includedThroughCursor: 1 },
    })
    await Promise.resolve()

    expect((harness.state as ChatState).newThreadPending).toBe(true)
    render().setInput('blocked')
    await render().sendCurrentInput()
    expect(bridge.start).not.toHaveBeenCalled()
    expect(await render().startNewChat()).toBe(false)

    cleared.resolve({
      ok: true,
      value: { detail: null, eventEpoch: 'epoch-1', includedThroughCursor: 1 },
    })
    expect(await newThread).toBe(true)
    expect((harness.state as ChatState).newThreadPending).toBe(false)
    expect((harness.state as ChatState).selectedThreadId).toBeNull()
  })

  it.each(['save', 'clear'] as const)(
    'rehydrates Retry identity when New %s fails after ignoring a late recovery snapshot',
    async (failureBoundary) => {
      const failedDetail = detail('keep me')
      failedDetail.messages = [
        {
          id: 'assistant-1',
          role: 'assistant',
          content: 'complete answer',
          status: 'failed',
          error: { code: 'unknown', message: "Couldn't save result", retryable: true },
          canRetry: true,
        },
      ]
      failedDetail.settlementFailure = { requestId: 'request-1', assistantMessageId: 'assistant-1' }
      const bridge = installBridge(selectedSnapshot(failedDetail))
      const session = await settleSelectedHydration(bridge, failedDetail)
      await session.retryMessage('assistant-1')

      const lateHydration = deferred<
        NyxThreadResult<{
          detail: NyxThreadDetail | null
          eventEpoch: string
          includedThroughCursor: number
        }>
      >()
      const canonicalFailure = detail('keep me')
      canonicalFailure.messages = [
        {
          id: 'assistant-1',
          role: 'assistant',
          content: 'complete answer',
          status: 'failed',
          error: {
            code: 'upstream_error',
            message: 'The provider could not complete the response.',
            retryable: true,
          },
          canRetry: true,
        },
      ]
      canonicalFailure.retryableTurn = {
        turnOrdinal: 4,
        expectedAttemptRequestId: 'request-1',
        expectedDraftRevision: 2,
        userMessageId: 'user-1',
        assistantMessageId: 'assistant-1',
      }
      bridge.get.mockImplementationOnce(() => lateHydration.promise)
      if (failureBoundary === 'clear') {
        bridge.get.mockResolvedValueOnce({
          ok: false,
          error: { code: 'library_unavailable', message: "Couldn't open Thread Library" },
        })
      } else {
        bridge.saveDraft.mockResolvedValueOnce({
          ok: false,
          error: { code: 'conflict', message: 'Not saved.' },
        })
      }
      bridge.get.mockResolvedValueOnce({
        ok: true,
        value: { detail: canonicalFailure, eventEpoch: 'epoch-1', includedThroughCursor: 1 },
      })
      bridge.emitChat({
        type: 'chat:error',
        threadId: 'thread-a',
        requestId: 'request-1',
        assistantMessageId: 'assistant-1',
        status: 'failed',
        error: {
          code: 'upstream_error',
          message: 'The provider could not complete the response.',
          retryable: true,
        },
        eventEpoch: 'epoch-1',
        cursor: 1,
      })
      await vi.waitFor(() => expect(bridge.get).toHaveBeenCalledTimes(2))

      expect(await render().startNewChat()).toBe(false)
      expect(harness.state).toMatchObject({
        selectedThreadId: 'thread-a',
        input: 'keep me',
        newThreadPending: false,
        retryableTurn: {
          turnOrdinal: 4,
          expectedAttemptRequestId: 'request-1',
          assistantMessageId: 'assistant-1',
        },
      })
      await render().retryMessage('assistant-1')
      expect(bridge.start).toHaveBeenCalledWith(
        expect.objectContaining({
          threadId: 'thread-a',
          turnIntent: 'retry_failed_response',
          turnOrdinal: 4,
          expectedAttemptRequestId: 'request-1',
        }),
      )
    },
  )

  it('uses the save barrier and exact empty-shell discard before New', async () => {
    const bridge = installBridge()
    reset(
      chatReducer(initialChatState, {
        type: 'thread-library-hydrated',
        generation: 0,
        summary: detail().summary,
        detail: detail(),
        eventEpoch: 'epoch-1',
        listCursor: 2,
        detailCursor: 2,
      }),
    )

    expect(await render().startNewChat()).toBe(true)
    expect(bridge.saveDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: 'thread-a',
        expectedDraftRevision: 2,
        discardEmptyShell: true,
      }),
    )
    expect(bridge.get).toHaveBeenLastCalledWith({ threadId: null })
    expect((harness.state as ChatState).selectedThreadId).toBeNull()
  })

  it('keeps the current Thread and dirty overlay when the New save barrier fails', async () => {
    const value = detail('keep me')
    const bridge = installBridge({
      ...selectedSnapshot(value),
      saveDraftResult: {
        ok: false,
        error: { code: 'conflict', message: 'Not saved.' },
      },
    })
    const session = await settleSelectedHydration(bridge, value)

    expect(await session.startNewChat()).toBe(false)
    expect(harness.state).toMatchObject({ selectedThreadId: 'thread-a', input: 'keep me' })
    expect(bridge.saveDraft).toHaveBeenCalledWith(
      expect.objectContaining({ threadId: 'thread-a', discardEmptyShell: true }),
    )
  })

  it('keeps the current Thread and unlocks editing when Main cannot clear authorization', async () => {
    const value = detail('keep me')
    const bridge = installBridge({
      get: async () => ({
        ok: false,
        error: { code: 'library_unavailable', message: "Couldn't open Thread Library" },
      }),
    })
    reset(readyThreadState(value))

    expect(await render().startNewChat()).toBe(false)
    expect(harness.state as ChatState).toMatchObject({
      selectedThreadId: 'thread-a',
      input: 'keep me',
      newThreadPending: false,
    })
    expect(bridge.get).toHaveBeenCalledWith({ threadId: null })
  })

  it('unlocks New when clearing Main authorization rejects', async () => {
    const value = detail('keep me')
    const bridge = installBridge({
      get: async () => {
        throw new Error('Worker exited')
      },
    })
    reset(readyThreadState(value))

    expect(await render().startNewChat()).toBe(false)
    expect(harness.state as ChatState).toMatchObject({
      selectedThreadId: 'thread-a',
      input: 'keep me',
      newThreadPending: false,
      hydrationError: { code: 'library_unavailable' },
    })
    expect(bridge.get).toHaveBeenCalledWith({ threadId: null })
  })

  it('keeps New locked when the discarded Thread event arrives before its reply', async () => {
    const cleared = deferred<
      NyxThreadResult<{
        detail: NyxThreadDetail | null
        eventEpoch: string
        includedThroughCursor: number
      }>
    >()
    const bridge = installBridge(selectedSnapshot(detail()))
    const session = await settleSelectedHydration(bridge, detail())
    bridge.get.mockImplementationOnce(() => cleared.promise)
    bridge.saveDraft.mockImplementationOnce(async () => {
      bridge.emitThread({
        type: 'threads:removed',
        threadId: 'thread-a',
        eventEpoch: 'epoch-1',
        includedThroughCursor: 1,
      })
      return {
        ok: true,
        value: {
          detail: null,
          discarded: true,
          eventEpoch: 'epoch-1',
          includedThroughCursor: 1,
        },
      }
    })

    const newThread = session.startNewChat()
    await vi.waitFor(() => expect(bridge.get).toHaveBeenLastCalledWith({ threadId: null }))
    expect((harness.state as ChatState).newThreadPending).toBe(true)
    render().setInput('blocked edit')
    cleared.resolve({
      ok: true,
      value: { detail: null, eventEpoch: 'epoch-1', includedThroughCursor: 1 },
    })

    expect(await newThread).toBe(true)
    expect((harness.state as ChatState).input).toBe('')
  })

  it('does not hide a complete result that is still waiting to be saved', async () => {
    const bridge = installBridge()
    const value = detail()
    value.settlementFailure = { requestId: 'request-1', assistantMessageId: 'assistant-1' }
    reset(readyThreadState(value))

    expect(await render().startNewChat()).toBe(false)
    expect(bridge.saveDraft).not.toHaveBeenCalled()
    expect(bridge.get).not.toHaveBeenCalled()
    expect((harness.state as ChatState).selectedThreadId).toBe('thread-a')
  })

  it('stays on the current Thread while an attachment is still preparing', async () => {
    const bridge = installBridge()
    const state = chatReducer(readyThreadState(), {
      type: 'draft-images-added',
      images: [{ id: 'preparing', name: 'image.png', status: 'preparing', source: new Blob() }],
    })
    reset(state)

    expect(await render().startNewChat()).toBe(false)
    expect(bridge.saveDraft).not.toHaveBeenCalled()
    expect(bridge.get).not.toHaveBeenCalled()
    expect((harness.state as ChatState).selectedThreadId).toBe('thread-a')
    expect((harness.state as ChatState).newThreadPending).toBe(false)
  })

  it('blocks edits while New waits for Main to clear authorization', async () => {
    const cleared = deferred<
      NyxThreadResult<{
        detail: NyxThreadDetail | null
        eventEpoch: string
        includedThroughCursor: number
      }>
    >()
    let clearCalls = 0
    const bridge = installBridge({
      get: async () => {
        clearCalls += 1
        return clearCalls === 1
          ? cleared.promise
          : {
              ok: true,
              value: { detail: null, eventEpoch: 'epoch-1', includedThroughCursor: 4 },
            }
      },
    })
    bridge.saveDraft.mockResolvedValueOnce({
      ok: true,
      value: {
        detail: null,
        discarded: true,
        eventEpoch: 'epoch-1',
        includedThroughCursor: 3,
      },
    } as never)
    reset(readyThreadState())

    const newThread = render().startNewChat()
    await vi.waitFor(() => expect(bridge.get).toHaveBeenCalledWith({ threadId: null }))
    render().setInput('edited while clearing')
    cleared.resolve({
      ok: true,
      value: { detail: null, eventEpoch: 'epoch-1', includedThroughCursor: 3 },
    })

    expect(await newThread).toBe(true)
    expect(bridge.materialize).not.toHaveBeenCalled()
    expect(bridge.get).toHaveBeenCalledOnce()
    expect((harness.state as ChatState).selectedThreadId).toBeNull()
  })

  it('stops an active Run and waits for terminal settlement before New', async () => {
    const value = detail('Hello')
    const bridge = installBridge(selectedSnapshot(value))
    const session = await settleSelectedHydration(bridge, value)
    await session.sendCurrentInput()
    const request = bridge.start.mock.calls[0]![0]
    render()
    bridge.emitChat({
      type: 'chat:accepted',
      threadId: 'thread-a',
      requestId: request.requestId,
      userMessageId: 'user-main',
      assistantMessageId: 'assistant-main',
      turnIntent: 'new_user_message',
      eventEpoch: 'epoch-1',
      cursor: 1,
    })
    const newThread = render().startNewChat()
    await vi.waitFor(() => expect(bridge.cancel).toHaveBeenCalledOnce())
    expect(bridge.saveDraft).toHaveBeenCalledTimes(1)

    bridge.emitChat({
      type: 'chat:done',
      threadId: 'thread-a',
      requestId: request.requestId,
      assistantMessageId: 'assistant-main',
      status: 'cancelled',
      finalContent: '',
      eventEpoch: 'epoch-1',
      cursor: 2,
    })

    expect(await newThread).toBe(true)
    expect(bridge.saveDraft).toHaveBeenCalledTimes(2)
    expect((harness.state as ChatState).selectedThreadId).toBeNull()
  })

  it('reuses an untouched placeholder without creating or saving a Thread', async () => {
    const bridge = installBridge()
    reset(readyPlaceholderState())

    expect(await render().startNewChat()).toBe(true)
    expect(bridge.materialize).not.toHaveBeenCalled()
    expect(bridge.saveDraft).not.toHaveBeenCalled()
  })

  it('does not treat target-only placeholder changes as sendable content', () => {
    const status = readyStatus()
    const ready = chatReducer(initialChatState, {
      type: 'thread-library-hydrated',
      generation: 0,
      summary: null,
      detail: null,
      eventEpoch: 'epoch-1',
      listCursor: 0,
      detailCursor: 0,
    })
    const selected = chatReducer(ready, {
      type: 'target-context-ready',
      generation: 0,
      catalogEpoch: 1,
      selection: target,
      available: true,
    })

    expect(canSubmitChat(selected, status)).toBe(false)
    expect(deriveTargetCatalogAction(selected, status)?.type).toBe('target-catalog-updated')
  })

  it('revokes only selected ready local preview URLs', () => {
    const revoke = vi.fn()
    revokeDraftPreviewUrls(
      [
        {
          id: 'ready',
          name: 'ready.png',
          status: 'ready',
          source: null,
          image: { mediaType: 'image/png', width: 1, height: 1 },
          canonicalBytes: new Uint8Array([1]),
          previewBytes: new Uint8Array([2]),
          previewUrl: 'blob:ready',
        },
        {
          id: 'unselected',
          name: 'unselected.png',
          status: 'ready',
          source: null,
          image: { mediaType: 'image/png', width: 1, height: 1 },
          previewUrl: 'blob:unselected',
        },
        {
          id: 'failed',
          name: 'failed.png',
          status: 'failed',
          source: new Blob(),
          error: 'failed',
        },
      ],
      new Set(['ready', 'failed']),
      revoke,
    )
    expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:ready')
  })
})

describe('document draft lifecycle', () => {
  it.each(['constructor', 'postMessage'] as const)(
    'moves a synchronous Worker %s failure into the failed Draft Retry path',
    async (failure) => {
      installBridge()
      reset(readyThreadState())
      TestWorker[`${failure}Error`] = new Error('Worker failed')
      let session = render()
      session.addDraftDocuments([new File(['hello'], 'notes.txt', { type: 'text/plain' })])

      await vi.waitFor(() => {
        expect((harness.state as ChatState).draftDocuments[0]?.status).toBe('failed')
      })

      TestWorker[`${failure}Error`] = null
      session = render()
      const documentId = session.state.draftDocuments[0]!.id
      session.retryDraftDocument(documentId)
      TestWorker.instances.at(-1)!.emit({
        ok: true,
        draftId: documentId,
        extractedText: new TextEncoder().encode('hello').buffer,
        sourceSha256: 'a'.repeat(64),
      })

      await vi.waitFor(() => {
        expect((harness.state as ChatState).draftDocuments[0]?.status).toBe('ready')
      })
    },
  )

  it('keeps the 10-second deadline active during the post-Worker source read', async () => {
    vi.useFakeTimers()
    installBridge()
    reset(readyThreadState())
    const source = new File(['hello'], 'notes.txt', { type: 'text/plain' })
    vi.spyOn(source, 'arrayBuffer').mockReturnValue(new Promise(() => undefined))
    const session = render()
    session.addDraftDocuments([source])
    const worker = TestWorker.instances[0]!
    worker.emit({
      ok: true,
      draftId: (harness.state as ChatState).draftDocuments[0]!.id,
      extractedText: new TextEncoder().encode('hello').buffer,
      sourceSha256: 'a'.repeat(64),
    })

    await vi.advanceTimersByTimeAsync(10_000)

    expect(worker.terminate).toHaveBeenCalledOnce()
    expect((harness.state as ChatState).draftDocuments[0]?.status).toBe('failed')
  })

  it('ignores a stale post-Worker read after Retry starts for the same Draft', async () => {
    vi.useFakeTimers()
    installBridge()
    reset(readyThreadState())
    const source = new File(['hello'], 'notes.txt', { type: 'text/plain' })
    const staleRead = deferred<ArrayBuffer>()
    const retryRead = deferred<ArrayBuffer>()
    vi.spyOn(source, 'arrayBuffer')
      .mockReturnValueOnce(staleRead.promise)
      .mockReturnValueOnce(retryRead.promise)
    let session = render()
    session.addDraftDocuments([source])
    const documentId = (harness.state as ChatState).draftDocuments[0]!.id
    TestWorker.instances[0]!.emit({
      ok: true,
      draftId: documentId,
      extractedText: new TextEncoder().encode('stale').buffer,
      sourceSha256: 'a'.repeat(64),
    })
    await vi.advanceTimersByTimeAsync(10_000)

    session = render()
    session.retryDraftDocument(documentId)
    const retryWorker = TestWorker.instances[1]!
    retryWorker.emit({
      ok: true,
      draftId: documentId,
      extractedText: new TextEncoder().encode('fresh').buffer,
      sourceSha256: 'b'.repeat(64),
    })
    staleRead.resolve(new TextEncoder().encode('hello').buffer)
    await staleRead.promise
    await Promise.resolve()

    expect((harness.state as ChatState).draftDocuments[0]?.status).toBe('preparing')
    expect(retryWorker.terminate).not.toHaveBeenCalled()

    retryRead.resolve(new TextEncoder().encode('hello').buffer)
    await retryRead.promise
    await Promise.resolve()

    expect((harness.state as ChatState).draftDocuments[0]).toMatchObject({
      status: 'ready',
      extractedTextBytes: new TextEncoder().encode('fresh'),
    })
  })

  it('terminates a preparing Worker when its Draft is removed', () => {
    installBridge()
    reset(readyThreadState())
    let session = render()
    session.addDraftDocuments([new File(['hello'], 'notes.txt', { type: 'text/plain' })])
    const worker = TestWorker.instances[0]!
    session = render()
    session.removeDraftDocument(session.state.draftDocuments[0]!.id)

    expect(worker.terminate).toHaveBeenCalledOnce()
    expect((harness.state as ChatState).draftDocuments).toEqual([])
  })
})
