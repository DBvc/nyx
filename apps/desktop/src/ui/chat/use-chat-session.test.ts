import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { NyxChatEvent } from '../../../shared/chat/events'
import type { NyxCurrentThreadSnapshot } from '../../../shared/chat/snapshot'
import type { NyxChatRequest } from '../../../shared/chat/types'
import type { NyxConnectionsOverview } from '../../../shared/connections/types'
import { chatReducer } from './chat-reducer'
import { summarizeConnectionsOverview, type ConnectionStatusState } from './connection-status'
import { initialChatState, type ChatState } from './chat-types'
import {
  canSubmitChat,
  deriveTargetCatalogAction,
  revokeDraftPreviewUrls,
  toRequestMessages,
  useChatSession,
} from './use-chat-session'

const hookHarness = vi.hoisted(() => ({
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
      hookHarness.state ??= initialState

      return [
        hookHarness.state,
        (action: unknown) => {
          hookHarness.state = reducer(hookHarness.state, action)
        },
      ]
    },
    useRef(initialValue: unknown) {
      const index = hookHarness.refIndex++
      hookHarness.refs[index] ??= { current: initialValue }
      return hookHarness.refs[index]
    },
    useEffect(effect: () => void | (() => void)) {
      if (!hookHarness.runEffects) {
        return
      }

      const cleanup = effect()

      if (cleanup) {
        hookHarness.cleanups.push(cleanup)
      }
    },
  }
})

type ReadyConnectionStatus = Extract<ConnectionStatusState, { kind: 'ready' }>

const committedTarget = {
  kind: 'connection',
  providerId: 'provider-1',
  modelId: 'model-1',
} as const

function overview(): NyxConnectionsOverview {
  return {
    providers: [
      {
        id: 'provider-1',
        kind: 'openai-compatible',
        displayName: 'Provider One',
        baseUrlHost: 'api.example.test',
        enabled: true,
        credentialStatus: 'stored',
        modelCount: 1,
        defaultModelId: 'model-1',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    defaultTarget: {
      providerId: 'provider-1',
      modelId: 'model-1',
    },
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
      envFallback: { modelId: 'env-model' },
    },
  }
}

function readyStatus(requestEpoch = 1): ReadyConnectionStatus {
  const value = overview()

  return {
    kind: 'ready',
    requestEpoch,
    overview: value,
    summary: summarizeConnectionsOverview(value),
  }
}

function hydrate(state: ChatState) {
  const snapshot: NyxCurrentThreadSnapshot = {
    messages: [],
    runStatus: 'completed',
    retryableTurn: null,
    selectedTarget: committedTarget,
  }

  return chatReducer(state, {
    type: 'current-thread-hydrated',
    generation: state.projectionGeneration,
    snapshot,
  })
}

function applyTargetCatalog(state: ChatState, status: ConnectionStatusState) {
  const action = deriveTargetCatalogAction(state, status)

  return action ? chatReducer(state, action) : state
}

class TestWorker {
  static instances: TestWorker[] = []
  static constructorError: Error | null = null
  static postMessageError: Error | null = null

  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  readonly postMessage = vi.fn(() => {
    if (TestWorker.postMessageError) {
      throw TestWorker.postMessageError
    }
  })
  readonly terminate = vi.fn()

  constructor() {
    if (TestWorker.constructorError) {
      throw TestWorker.constructorError
    }

    TestWorker.instances.push(this)
  }

  emit(data: unknown) {
    this.onmessage?.({ data } as MessageEvent)
  }
}

function resetHookHarness(state = applyTargetCatalog(hydrate(initialChatState), readyStatus())) {
  for (const cleanup of hookHarness.cleanups.splice(0)) {
    cleanup()
  }

  hookHarness.state = state
  hookHarness.refs = []
  hookHarness.refIndex = 0
  hookHarness.runEffects = false
  TestWorker.instances = []
  TestWorker.constructorError = null
  TestWorker.postMessageError = null
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })

  return { promise, resolve }
}

function renderSession(runEffects = false) {
  hookHarness.refIndex = 0
  hookHarness.runEffects = runEffects
  const session = useChatSession({
    connectionStatus: readyStatus(),
    refreshConnections: vi.fn(async () => undefined),
    getLatestConnectionRequestEpoch: () => 1,
  })
  hookHarness.runEffects = false
  return session
}

function installChatBridge(options?: {
  resetResult?: { ok: false; error: { code: 'reset_failed'; message: string } }
}) {
  let listener: ((event: NyxChatEvent) => void) | null = null
  const startChat = vi.fn(async (_request: NyxChatRequest) => undefined)
  const cancelChat = vi.fn(async () => undefined)
  const resetChatSession = vi.fn(async () =>
    options?.resetResult ? options.resetResult : { ok: true as const },
  )
  const testWindow = {
    ...globalThis,
    clearTimeout,
    setTimeout,
    nyx: {
      chat: {
        subscribe(nextListener: (event: NyxChatEvent) => void) {
          listener = nextListener
          return () => {
            listener = null
          }
        },
        getCurrentThreadSnapshot: vi.fn(() => new Promise(() => undefined)),
        startChat,
        cancelChat,
        resetChatSession,
      },
    },
  }
  vi.stubGlobal('window', testWindow)
  vi.stubGlobal('Worker', TestWorker)

  return {
    emit(event: NyxChatEvent) {
      if (!listener) {
        throw new Error('Chat bridge is not subscribed.')
      }

      listener(event)
    },
    cancelChat,
    resetChatSession,
    startChat,
  }
}

async function prepareReadyDocument(session: ReturnType<typeof renderSession>) {
  const source = new File(['hello'], 'notes.txt', { type: 'text/plain' })
  session.addDraftDocuments([source])
  const worker = TestWorker.instances.at(-1)

  expect(worker).toBeDefined()
  worker!.emit({
    ok: true,
    draftId: (hookHarness.state as ChatState).draftDocuments[0]!.id,
    extractedText: new TextEncoder().encode('hello').buffer,
    sourceSha256: 'a'.repeat(64),
  })
  await vi.waitFor(() => {
    expect((hookHarness.state as ChatState).draftDocuments[0]?.status).toBe('ready')
  })

  return { source, worker: worker!, session: renderSession() }
}

beforeEach(() => {
  resetHookHarness()
})

afterEach(() => {
  resetHookHarness(initialChatState)
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('target catalog lifecycle', () => {
  it('converges on the same draft when catalog or snapshot completes first', () => {
    const status = readyStatus(2)

    let catalogFirst = applyTargetCatalog(initialChatState, status)
    catalogFirst = hydrate(catalogFirst)
    catalogFirst = applyTargetCatalog(catalogFirst, status)

    let snapshotFirst = hydrate(initialChatState)
    snapshotFirst = applyTargetCatalog(snapshotFirst, {
      kind: 'loading',
      requestEpoch: 1,
      overview: null,
    })
    snapshotFirst = applyTargetCatalog(snapshotFirst, status)

    expect(catalogFirst).toMatchObject({
      targetDraft: committedTarget,
      targetAvailable: true,
      targetCatalogEpoch: 2,
      projectionGeneration: 0,
    })
    expect(snapshotFirst).toEqual(catalogFirst)
  })

  it('blocks Send for a committed unavailable target until an available draft is chosen', () => {
    const status = readyStatus()
    const unavailableOverview = {
      ...status.overview,
      defaultTarget: null,
      defaultTargetSource: 'env_fallback' as const,
      targetCatalog: {
        connectionTargets: [],
        envFallback: { modelId: 'env-model' },
      },
    }
    const unavailableStatus: ReadyConnectionStatus = {
      ...status,
      overview: unavailableOverview,
      summary: summarizeConnectionsOverview(unavailableOverview),
    }
    const hydrated = hydrate(initialChatState)
    const initialized = applyTargetCatalog(hydrated, unavailableStatus)
    const withInput = chatReducer(initialized, { type: 'set-input', value: 'Hello' })

    expect(withInput.targetDraft).toEqual(committedTarget)
    expect(withInput.targetAvailable).toBe(false)
    expect(canSubmitChat(withInput, unavailableStatus)).toBe(false)

    const available = chatReducer(withInput, {
      type: 'target-draft-changed',
      selection: { kind: 'env_fallback' },
      available: true,
    })

    expect(canSubmitChat(available, unavailableStatus)).toBe(true)
  })

  it('blocks Send when a new ready overview removes the draft before catalog state updates', () => {
    const status = readyStatus()
    const withInput = chatReducer(applyTargetCatalog(hydrate(initialChatState), status), {
      type: 'set-input',
      value: 'Hello',
    })
    const changedOverview = {
      ...status.overview,
      targetCatalog: {
        ...status.overview.targetCatalog,
        connectionTargets: [],
      },
    }

    expect(
      canSubmitChat(withInput, {
        ...status,
        requestEpoch: 2,
        overview: changedOverview,
        summary: summarizeConnectionsOverview(changedOverview),
      }),
    ).toBe(false)
  })

  it('allows image-only Send only after every draft is ready', () => {
    const status = readyStatus()
    const base = applyTargetCatalog(hydrate(initialChatState), status)
    const preparing = {
      ...base,
      draftImages: [
        {
          id: 'draft-1',
          name: 'image.png',
          status: 'preparing' as const,
          source: new Blob(),
        },
      ],
    }

    expect(canSubmitChat(preparing, status)).toBe(false)
    expect(
      canSubmitChat(
        {
          ...preparing,
          draftImages: [
            {
              id: 'draft-1',
              name: 'image.png',
              status: 'ready',
              source: null,
              image: { mediaType: 'image/png', width: 1, height: 1 },
              canonicalBytes: new Uint8Array([1]),
              previewBytes: new Uint8Array([2]),
              previewUrl: 'blob:preview-1',
            },
          ],
        },
        status,
      ),
    ).toBe(true)
  })

  it('keeps image-only user entries in compatibility request history', () => {
    expect(
      toRequestMessages([
        {
          id: 'user-1',
          role: 'user',
          content: '',
          status: 'completed',
          images: [
            {
              imageId: '00000000-0000-4000-8000-000000000001',
              mediaType: 'image/png',
              width: 1,
              height: 1,
              available: true,
            },
          ],
        },
      ]),
    ).toEqual([{ role: 'user', content: '' }])
  })

  it('allows document-only Send only after extraction and keeps its empty history entry', () => {
    const status = readyStatus()
    const base = applyTargetCatalog(hydrate(initialChatState), status)
    const preparing: ChatState = {
      ...base,
      draftDocuments: [
        {
          id: 'document-1',
          name: 'notes.txt',
          mediaType: 'text/plain',
          status: 'preparing',
          source: new File(['hello'], 'notes.txt'),
        },
      ],
    }

    expect(canSubmitChat(preparing, status)).toBe(false)
    expect(
      canSubmitChat(
        {
          ...preparing,
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
        },
        status,
      ),
    ).toBe(true)

    expect(
      toRequestMessages([
        {
          id: 'user-1',
          role: 'user',
          content: '',
          status: 'completed',
          documents: [
            {
              documentId: '00000000-0000-4000-8000-000000000010',
              name: 'notes.txt',
              mediaType: 'text/plain',
              byteLength: 5,
              extractedByteLength: 5,
              available: true,
            },
          ],
        },
      ]),
    ).toEqual([{ role: 'user', content: '' }])
  })

  it('revokes only selected ready draft URLs', () => {
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
    'moves a synchronous Worker %s failure into the failed draft Retry path',
    async (failure) => {
      installChatBridge()
      TestWorker[`${failure}Error`] = new Error('Worker failed')
      let session = renderSession(true)
      session.addDraftDocuments([new File(['hello'], 'notes.txt', { type: 'text/plain' })])

      await vi.waitFor(() => {
        expect((hookHarness.state as ChatState).draftDocuments[0]?.status).toBe('failed')
      })

      TestWorker[`${failure}Error`] = null
      session = renderSession()
      const documentId = session.state.draftDocuments[0]!.id
      session.retryDraftDocument(documentId)
      const retryWorker = TestWorker.instances.at(-1)!
      retryWorker.emit({
        ok: true,
        draftId: documentId,
        extractedText: new TextEncoder().encode('hello').buffer,
        sourceSha256: 'a'.repeat(64),
      })

      await vi.waitFor(() => {
        expect((hookHarness.state as ChatState).draftDocuments[0]?.status).toBe('ready')
      })
    },
  )

  it('keeps the 10-second deadline active during the post-Worker source read', async () => {
    vi.useFakeTimers()
    installChatBridge()
    const source = new File(['hello'], 'notes.txt', { type: 'text/plain' })
    vi.spyOn(source, 'arrayBuffer').mockReturnValue(new Promise(() => undefined))
    const session = renderSession(true)
    session.addDraftDocuments([source])
    const worker = TestWorker.instances[0]!
    worker.emit({
      ok: true,
      draftId: (hookHarness.state as ChatState).draftDocuments[0]!.id,
      extractedText: new TextEncoder().encode('hello').buffer,
      sourceSha256: 'a'.repeat(64),
    })

    await vi.advanceTimersByTimeAsync(10_000)

    expect(worker.terminate).toHaveBeenCalledOnce()
    expect(renderSession().state.draftDocuments[0]?.status).toBe('failed')
  })

  it('ignores a stale post-Worker read after Retry starts for the same draft', async () => {
    vi.useFakeTimers()
    installChatBridge()
    const source = new File(['hello'], 'notes.txt', { type: 'text/plain' })
    const staleRead = deferred<ArrayBuffer>()
    const retryRead = deferred<ArrayBuffer>()
    vi.spyOn(source, 'arrayBuffer')
      .mockReturnValueOnce(staleRead.promise)
      .mockReturnValueOnce(retryRead.promise)
    let session = renderSession(true)
    session.addDraftDocuments([source])
    const documentId = (hookHarness.state as ChatState).draftDocuments[0]!.id
    TestWorker.instances[0]!.emit({
      ok: true,
      draftId: documentId,
      extractedText: new TextEncoder().encode('stale').buffer,
      sourceSha256: 'a'.repeat(64),
    })
    await vi.advanceTimersByTimeAsync(10_000)

    session = renderSession()
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

    expect(renderSession().state.draftDocuments[0]?.status).toBe('preparing')
    expect(retryWorker.terminate).not.toHaveBeenCalled()

    retryRead.resolve(new TextEncoder().encode('hello').buffer)
    await retryRead.promise
    await Promise.resolve()

    expect(renderSession().state.draftDocuments[0]).toMatchObject({
      status: 'ready',
      extractedTextBytes: new TextEncoder().encode('fresh'),
    })
  })

  it('retains a pre-accepted Stop draft and blocks a same-tick double send', async () => {
    const bridge = installChatBridge()
    const prepared = await prepareReadyDocument(renderSession(true))

    await Promise.all([prepared.session.sendCurrentInput(), prepared.session.sendCurrentInput()])
    expect(bridge.startChat).toHaveBeenCalledTimes(1)
    const request = bridge.startChat.mock.calls[0]![0]
    await renderSession().stopActiveResponse()
    expect(bridge.cancelChat).toHaveBeenCalledWith({ requestId: request.requestId })

    bridge.emit({
      type: 'chat:error',
      requestId: request.requestId,
      assistantMessageId: request.assistantMessageId,
      status: 'failed',
      error: { code: 'cancelled', message: 'Request cancelled.', retryable: false },
    })

    const stopped = renderSession().state
    expect(stopped.draftDocuments).toHaveLength(1)
    expect(stopped.draftDocuments[0]?.status).toBe('ready')
    expect(stopped.messages).toEqual([])
  })

  it('clears only after accepted and preserves the cancelled durable projection', async () => {
    const bridge = installChatBridge()
    const prepared = await prepareReadyDocument(renderSession(true))

    await prepared.session.sendCurrentInput()
    const request = bridge.startChat.mock.calls[0]![0]
    renderSession()
    bridge.emit({
      type: 'chat:accepted',
      requestId: request.requestId,
      userMessageId: request.userMessageId,
      assistantMessageId: request.assistantMessageId,
      turnIntent: 'new_user_message',
    })
    await renderSession().stopActiveResponse()
    expect(bridge.cancelChat).toHaveBeenCalledWith({ requestId: request.requestId })
    bridge.emit({
      type: 'chat:done',
      requestId: request.requestId,
      assistantMessageId: request.assistantMessageId,
      status: 'cancelled',
      finalContent: '',
    })

    const stopped = renderSession().state
    expect(stopped.draftDocuments).toEqual([])
    expect(stopped.messages[0]).toMatchObject({
      role: 'user',
      documents: [{ name: 'notes.txt', available: true }],
    })
    expect(stopped.runStatus).toBe('cancelled')
  })

  it('terminates timeout and retry Workers and keeps a failed reset draft', async () => {
    vi.useFakeTimers()
    const bridge = installChatBridge({
      resetResult: {
        ok: false,
        error: { code: 'reset_failed', message: 'Reset failed.' },
      },
    })
    let session = renderSession(true)
    session.addDraftDocuments([new File(['hello'], 'notes.txt', { type: 'text/plain' })])
    const timedOutWorker = TestWorker.instances[0]!

    await vi.advanceTimersByTimeAsync(10_000)
    expect(timedOutWorker.terminate).toHaveBeenCalledOnce()
    session = renderSession()
    expect(session.state.draftDocuments[0]?.status).toBe('failed')

    const documentId = session.state.draftDocuments[0]!.id
    session.retryDraftDocument(documentId)
    const retryWorker = TestWorker.instances[1]!
    session = renderSession()
    session.removeDraftDocument(documentId)
    expect(retryWorker.terminate).toHaveBeenCalledOnce()
    expect(renderSession().state.draftDocuments).toEqual([])

    resetHookHarness()
    session = renderSession(true)
    const prepared = await prepareReadyDocument(session)
    await prepared.session.startNewChat()
    expect(bridge.resetChatSession).toHaveBeenCalledOnce()
    expect(renderSession().state.draftDocuments).toHaveLength(1)
  })

  it('does not submit a document removed in the same turn of the event loop', async () => {
    const bridge = installChatBridge()
    const prepared = await prepareReadyDocument(renderSession(true))
    const documentId = prepared.session.state.draftDocuments[0]!.id

    prepared.session.removeDraftDocument(documentId)
    await prepared.session.sendCurrentInput()

    expect(bridge.startChat).not.toHaveBeenCalled()
    expect(renderSession().state.draftDocuments).toEqual([])
  })
})
