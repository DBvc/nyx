import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { NyxChatEvent } from '../../../shared/chat/events'
import type { NyxThreadChatRequest } from '../../../shared/chat/types'
import type { NyxThreadEvent } from '../../../shared/threads/events'
import type {
  NyxThreadDetail,
  NyxThreadListPage,
  NyxThreadListPageInput,
  NyxThreadMaterializeResult,
  NyxThreadRenameInput,
  NyxThreadRenameResult,
  NyxThreadResult,
  NyxThreadSearchInput,
  NyxThreadSearchResponse,
  NyxThreadSaveDraftResult,
  NyxThreadUpdatePinInput,
  NyxThreadUpdatePinResult,
  NyxThreadUpdateLocationInput,
  NyxThreadUpdateLocationResult,
} from '../../../shared/threads/types'
import type { NyxConnectionsOverview } from '../../../shared/connections/types'
import { chatReducer } from './chat-reducer'
import { summarizeConnectionsOverview, type ConnectionStatusState } from './connection-status'
import { initialChatState, type ChatState } from './chat-types'
import { initialThreadPinActionState } from './thread-collection'
import {
  canSubmitChat,
  deriveTargetCatalogAction,
  revokeDraftPreviewUrls,
  runCapacityBlock,
  useChatSession,
} from './use-chat-session'

const harness = vi.hoisted(() => ({
  state: undefined as unknown,
  refs: [] as Array<{ current: unknown }>,
  refIndex: 0,
  states: [] as unknown[],
  stateIndex: 0,
  effects: [] as Array<() => void | (() => void)>,
  effectIndex: 0,
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
    useState(initialValue: unknown) {
      const index = harness.stateIndex++
      if (!(index in harness.states)) harness.states[index] = initialValue
      return [
        harness.states[index],
        (value: unknown | ((current: unknown) => unknown)) => {
          harness.states[index] =
            typeof value === 'function'
              ? (value as (current: unknown) => unknown)(harness.states[index])
              : value
        },
      ]
    },
    useEffect(effect: () => void | (() => void)) {
      const index = harness.effectIndex++
      harness.effects[index] = effect
      if (!harness.runEffects) return
      const cleanup = effect()
      if (cleanup) harness.cleanups.push(cleanup)
    },
  }
})

describe('SEARCH1/T3 Renderer Search', () => {
  const hit = {
    threadId: 'thread-b',
    title: 'Search result',
    location: 'available' as const,
    source: 'title' as const,
    snippet: 'Search result',
    messageId: null,
  }

  it('waits for IME composition and 120 ms, and rejects oversized input locally', async () => {
    const bridge = installBridge(selectedSnapshot(detail('', 'thread-a')))
    render(true)
    await vi.waitFor(() => expect((harness.state as ChatState).hydrationStatus).toBe('ready'))
    vi.useFakeTimers()
    window.setTimeout = setTimeout
    window.clearTimeout = clearTimeout

    let session = render()
    session.activateThreadSearch()
    session.beginThreadSearchComposition()
    session.setThreadSearchInput('needle')
    await vi.advanceTimersByTimeAsync(200)
    expect(bridge.search).not.toHaveBeenCalled()

    session.endThreadSearchComposition('needle')
    await vi.advanceTimersByTimeAsync(119)
    expect(bridge.search).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(bridge.search).toHaveBeenCalledOnce()
    expect(bridge.search).toHaveBeenLastCalledWith({ query: 'needle' })

    session = render()
    session.setThreadSearchInput('😀'.repeat(257))
    await vi.advanceTimersByTimeAsync(200)
    expect(bridge.search).toHaveBeenCalledOnce()
    expect(render().threadSearch).toMatchObject({
      phase: 'invalid',
      status: 'Search is limited to 256 characters',
    })
  })

  it('keeps one request unsettled and replaces one latest pending query', async () => {
    const first = deferred<NyxThreadResult<NyxThreadSearchResponse>>()
    const bridge = installBridge({
      ...selectedSnapshot(detail('', 'thread-a')),
      search: async (input) => {
        if (input.query === 'one') return first.promise
        return {
          ok: true,
          value: {
            results: [{ ...hit, title: input.query }],
            truncated: false,
            eventEpoch: 'epoch-1',
            includedThroughCursor: 0,
          },
        }
      },
    })
    render(true)
    await vi.waitFor(() => expect((harness.state as ChatState).hydrationStatus).toBe('ready'))
    vi.useFakeTimers()
    window.setTimeout = setTimeout
    window.clearTimeout = clearTimeout

    let session = render()
    session.activateThreadSearch()
    session.setThreadSearchInput('one')
    await vi.advanceTimersByTimeAsync(120)
    session = render()
    session.setThreadSearchInput('two')
    await vi.advanceTimersByTimeAsync(120)
    session.setThreadSearchInput('three')
    await vi.advanceTimersByTimeAsync(120)
    expect(bridge.search).toHaveBeenCalledTimes(1)

    first.resolve({
      ok: true,
      value: {
        results: [{ ...hit, title: 'stale' }],
        truncated: false,
        eventEpoch: 'epoch-1',
        includedThroughCursor: 0,
      },
    })
    await vi.waitFor(() => expect(bridge.search).toHaveBeenCalledTimes(2))
    expect(bridge.search).toHaveBeenLastCalledWith({ query: 'three' })
    await vi.waitFor(() => expect(render().threadSearch.results[0]?.title).toBe('three'))
  })

  it('accepts a Search response across a contiguous Chat-only event and requeries on Thread change', async () => {
    const first = deferred<NyxThreadResult<NyxThreadSearchResponse>>()
    let calls = 0
    const bridge = installBridge({
      ...selectedSnapshot(detail('', 'thread-a')),
      search: async () => {
        calls += 1
        if (calls === 1) return first.promise
        return {
          ok: true,
          value: {
            results: [hit],
            truncated: false,
            eventEpoch: 'epoch-1',
            includedThroughCursor: 2,
          },
        }
      },
    })
    render(true)
    await vi.waitFor(() => expect((harness.state as ChatState).hydrationStatus).toBe('ready'))
    vi.useFakeTimers()
    window.setTimeout = setTimeout
    window.clearTimeout = clearTimeout
    let session = render()
    session.activateThreadSearch()
    session.setThreadSearchInput('needle')
    await vi.advanceTimersByTimeAsync(120)

    bridge.emitChat({
      type: 'chat:capacity',
      eventEpoch: 'epoch-1',
      cursor: 1,
      activeRuns: 0,
      attachmentRunActive: false,
    })
    first.resolve({
      ok: true,
      value: {
        results: [hit],
        truncated: false,
        eventEpoch: 'epoch-1',
        includedThroughCursor: 0,
      },
    })
    await vi.waitFor(() => expect(render().threadSearch.results).toEqual([hit]))
    expect(bridge.search).toHaveBeenCalledOnce()

    bridge.emitThread({
      type: 'threads:changed',
      eventEpoch: 'epoch-1',
      includedThroughCursor: 1,
      detail: detail('', 'thread-a'),
    })
    expect(bridge.search).toHaveBeenCalledOnce()

    bridge.emitThread({
      type: 'threads:changed',
      eventEpoch: 'epoch-1',
      includedThroughCursor: 2,
      detail: detail('', 'thread-a'),
    })
    await vi.waitFor(() => expect(bridge.search).toHaveBeenCalledTimes(2))
    await vi.waitFor(() => expect(render().threadSearch.results).toEqual([hit]))
    bridge.emitThread({
      type: 'threads:changed',
      eventEpoch: 'epoch-1',
      includedThroughCursor: 2,
      detail: detail('', 'thread-a'),
    })
    expect(bridge.search).toHaveBeenCalledTimes(2)
  })

  it('invalidates before a Chat-exposed cursor-gap hydration and sends one latest requery', async () => {
    const delayed = deferred<NyxThreadResult<NyxThreadSearchResponse>>()
    let hydration = 0
    const bridge = installBridge({
      selectedId: 'thread-a',
      list: async () => {
        const cursor = hydration === 0 ? 0 : 2
        hydration += 1
        return collectionPageResult([detail('', 'thread-a').summary], null, cursor)
      },
      get: async () => ({
        ok: true,
        value: {
          detail: detail('', 'thread-a'),
          eventEpoch: 'epoch-1',
          includedThroughCursor: hydration > 1 ? 2 : 0,
        },
      }),
      search: async () => {
        if (bridge.search.mock.calls.length === 1) return delayed.promise
        return {
          ok: true,
          value: {
            results: [hit],
            truncated: false,
            eventEpoch: 'epoch-1',
            includedThroughCursor: 2,
          },
        }
      },
    })
    render(true)
    await vi.waitFor(() => expect((harness.state as ChatState).hydrationStatus).toBe('ready'))
    vi.useFakeTimers()
    window.setTimeout = setTimeout
    window.clearTimeout = clearTimeout
    const session = render()
    session.activateThreadSearch()
    session.setThreadSearchInput('needle')
    await vi.advanceTimersByTimeAsync(120)
    expect(bridge.search).toHaveBeenCalledOnce()

    bridge.emitChat({
      type: 'chat:capacity',
      eventEpoch: 'epoch-1',
      cursor: 2,
      activeRuns: 0,
      attachmentRunActive: false,
    })
    expect(render().threadSearch.results).toEqual([])
    await vi.waitFor(() => expect(bridge.listPage).toHaveBeenCalledTimes(2))
    expect(bridge.search).toHaveBeenCalledOnce()

    delayed.resolve({
      ok: true,
      value: {
        results: [{ ...hit, title: 'Old result' }],
        truncated: false,
        eventEpoch: 'epoch-1',
        includedThroughCursor: 0,
      },
    })
    await vi.waitFor(() => expect(bridge.search).toHaveBeenCalledTimes(2))
    await vi.waitFor(() => expect(render().threadSearch.results).toEqual([hit]))
  })

  it('does not requery for accepted Thread events already covered by the last Search response', async () => {
    const bridge = installBridge({
      ...selectedSnapshot(detail('', 'thread-a')),
      search: async () => ({
        ok: true,
        value: {
          results: [hit],
          truncated: false,
          eventEpoch: 'epoch-1',
          includedThroughCursor: 2,
        },
      }),
    })
    render(true)
    await vi.waitFor(() => expect((harness.state as ChatState).hydrationStatus).toBe('ready'))
    vi.useFakeTimers()
    window.setTimeout = setTimeout
    window.clearTimeout = clearTimeout
    const session = render()
    session.activateThreadSearch()
    session.setThreadSearchInput('needle')
    await vi.advanceTimersByTimeAsync(120)
    await vi.waitFor(() => expect(render().threadSearch.results).toEqual([hit]))

    bridge.emitThread({
      type: 'threads:changed',
      eventEpoch: 'epoch-1',
      includedThroughCursor: 1,
      detail: detail('', 'thread-a'),
    })
    bridge.emitThread({
      type: 'threads:changed',
      eventEpoch: 'epoch-1',
      includedThroughCursor: 2,
      detail: detail('', 'thread-a'),
    })
    expect(bridge.search).toHaveBeenCalledOnce()
    expect(render().threadSearch.results).toEqual([hit])
  })

  it('opens same-Thread title results without saving and commits cross-Thread after save', async () => {
    const selected = detail('', 'thread-a')
    const targetDetail = detail('', 'thread-b')
    const get = vi.fn(async ({ threadId }: { threadId: string | null }) => ({
      ok: true as const,
      value: {
        detail: threadId === 'thread-b' ? targetDetail : selected,
        eventEpoch: 'epoch-1',
        includedThroughCursor: 0,
      },
    }))
    const bridge = installBridge({
      list: selectedSnapshot(selected).list,
      get,
      selectedId: selected.summary.id,
      search: async () => ({
        ok: true,
        value: {
          results: [hit],
          truncated: false,
          eventEpoch: 'epoch-1',
          includedThroughCursor: 0,
        },
      }),
    })
    render(true)
    await vi.waitFor(() => expect((harness.state as ChatState).hydrationStatus).toBe('ready'))
    vi.useFakeTimers()
    window.setTimeout = setTimeout
    window.clearTimeout = clearTimeout

    let session = render()
    session.activateThreadSearch()
    session.setThreadSearchInput('same')
    await vi.advanceTimersByTimeAsync(120)
    await vi.waitFor(() => expect(render().threadSearch.results).toHaveLength(1))
    const same = { ...hit, threadId: 'thread-a' }
    // The exact current result identity is required, so publish the same-Thread hit first.
    session = render()
    session.setThreadSearchInput('same-thread')
    bridge.search.mockResolvedValueOnce({
      ok: true,
      value: { results: [same], truncated: false, eventEpoch: 'epoch-1', includedThroughCursor: 0 },
    })
    await vi.advanceTimersByTimeAsync(120)
    await vi.waitFor(() => expect(render().threadSearch.results[0]?.threadId).toBe('thread-a'))
    expect(await render().openThreadSearchResult(same)).toBe(true)
    expect(bridge.saveDraft).not.toHaveBeenCalled()
    expect(render().threadFocusTarget).toEqual({ threadId: 'thread-a', messageId: null })

    session = render()
    session.setInput('Edited draft')
    session.activateThreadSearch()
    session.setThreadSearchInput('cross')
    await vi.advanceTimersByTimeAsync(120)
    await vi.waitFor(() => expect(render().threadSearch.results[0]?.threadId).toBe('thread-b'))
    expect(await render().openThreadSearchResult(hit)).toBe(true)
    expect(bridge.saveDraft).toHaveBeenCalledOnce()
    expect(bridge.saveDraft.mock.invocationCallOrder[0]).toBeLessThan(
      get.mock.invocationCallOrder.at(-1)!,
    )
    expect((harness.state as ChatState).selectedThreadId).toBe('thread-b')
    expect(render().threadSearch.active).toBe(false)
    expect(render().threadFocusTarget).toEqual({ threadId: 'thread-b', messageId: null })
  })

  it('hydrates the Archived collection before completing an Available Search open', async () => {
    const available = detail('', 'thread-a')
    const archivedRows = collectionRows(100, 50).map((row) => ({
      ...row,
      location: 'archived' as const,
      pinPosition: null,
    }))
    const archived = detailForSummary(archivedRows[0]!)
    const archivedHit = {
      ...hit,
      threadId: archived.summary.id,
      location: 'archived' as const,
    }
    const bridge = installBridge({
      selectedId: available.summary.id,
      list: async ({ location }) =>
        location === 'available'
          ? collectionPageResult([available.summary], null)
          : collectionPageResult(archivedRows, 'archived-next'),
      get: async ({ threadId }) => ({
        ok: true,
        value: {
          detail: threadId === archived.summary.id ? archived : available,
          eventEpoch: 'epoch-1',
          includedThroughCursor: 0,
        },
      }),
      search: async () => ({
        ok: true,
        value: {
          results: [archivedHit],
          truncated: false,
          eventEpoch: 'epoch-1',
          includedThroughCursor: 0,
        },
      }),
    })
    render(true)
    await vi.waitFor(() => expect(render().state.selectedThreadId).toBe(available.summary.id))
    vi.useFakeTimers()
    window.setTimeout = setTimeout
    window.clearTimeout = clearTimeout
    render().activateThreadSearch()
    render().setThreadSearchInput('archived')
    await vi.advanceTimersByTimeAsync(120)
    await vi.waitFor(() => expect(render().threadSearch.results).toEqual([archivedHit]))

    await expect(render().openThreadSearchResult(archivedHit)).resolves.toBe(true)

    expect(render().threadCollection).toMatchObject({
      location: 'archived',
      status: 'ready',
      nextCursor: 'archived-next',
    })
    expect(render().threadSummaries).toEqual(archivedRows)
    expect(render().state.selectedThreadId).toBe(archived.summary.id)
    expect(render().threadSearch.active).toBe(false)
    expect(bridge.listPage.mock.calls.map(([input]) => input.location)).toEqual([
      'available',
      'archived',
    ])
  })

  it('hydrates the Available collection before completing an Archived Search open', async () => {
    const available = detail('', 'thread-b')
    const archived = detailForSummary({
      ...detail('', 'thread-a').summary,
      location: 'archived',
    })
    const availableHit = { ...hit, threadId: available.summary.id, location: 'available' as const }
    const bridge = installBridge({
      selectedId: available.summary.id,
      list: async ({ location }) =>
        collectionPageResult(
          [location === 'available' ? available.summary : archived.summary],
          null,
        ),
      get: async ({ threadId }) => ({
        ok: true,
        value: {
          detail: threadId === archived.summary.id ? archived : available,
          eventEpoch: 'epoch-1',
          includedThroughCursor: 0,
        },
      }),
      search: async () => ({
        ok: true,
        value: {
          results: [availableHit],
          truncated: false,
          eventEpoch: 'epoch-1',
          includedThroughCursor: 0,
        },
      }),
    })
    render(true)
    await vi.waitFor(() => expect(render().state.selectedThreadId).toBe(available.summary.id))
    await expect(render().switchThreadCollectionLocation('archived')).resolves.toBe(true)
    await vi.waitFor(() => expect(render().state.selectedThreadId).toBe(archived.summary.id))
    vi.useFakeTimers()
    window.setTimeout = setTimeout
    window.clearTimeout = clearTimeout
    render().activateThreadSearch()
    render().setThreadSearchInput('available')
    await vi.advanceTimersByTimeAsync(120)
    await vi.waitFor(() => expect(render().threadSearch.results).toEqual([availableHit]))

    await expect(render().openThreadSearchResult(availableHit)).resolves.toBe(true)

    expect(render().threadCollection).toMatchObject({ location: 'available', status: 'ready' })
    expect(render().threadSummaries).toEqual([available.summary])
    expect(render().state.selectedThreadId).toBe(available.summary.id)
    expect(bridge.listPage.mock.calls.map(([input]) => input.location)).toEqual([
      'available',
      'archived',
      'available',
    ])
  })

  it('recovers the original collection when cross-location Search hydration fails', async () => {
    const available = detail('', 'thread-a')
    const archived = detailForSummary({
      ...detail('', 'thread-b').summary,
      location: 'archived',
    })
    const archivedHit = { ...hit, location: 'archived' as const }
    installBridge({
      selectedId: available.summary.id,
      list: async ({ location }) =>
        location === 'archived'
          ? {
              ok: false,
              error: { code: 'invalid_request', message: 'Could not load Archived.' },
            }
          : collectionPageResult([available.summary], null),
      get: async ({ threadId }) => ({
        ok: true,
        value: {
          detail: threadId === archived.summary.id ? archived : available,
          eventEpoch: 'epoch-1',
          includedThroughCursor: 0,
        },
      }),
      search: async () => ({
        ok: true,
        value: {
          results: [archivedHit],
          truncated: false,
          eventEpoch: 'epoch-1',
          includedThroughCursor: 0,
        },
      }),
    })
    render(true)
    await vi.waitFor(() => expect(render().state.selectedThreadId).toBe(available.summary.id))
    vi.useFakeTimers()
    window.setTimeout = setTimeout
    window.clearTimeout = clearTimeout
    render().activateThreadSearch()
    render().setThreadSearchInput('archived')
    await vi.advanceTimersByTimeAsync(120)
    await vi.waitFor(() => expect(render().threadSearch.results).toEqual([archivedHit]))

    await expect(render().openThreadSearchResult(archivedHit)).resolves.toBe(false)

    expect(render().threadCollection).toMatchObject({ location: 'available', status: 'ready' })
    expect(render().threadSummaries).toEqual([available.summary])
    expect(render().state.selectedThreadId).toBe(available.summary.id)
    expect(render().threadSearch.active).toBe(true)
  })

  it('recovers the original collection when the Search target moves during hydration', async () => {
    const available = detail('', 'thread-a')
    const archived = detailForSummary({
      ...detail('', 'thread-b').summary,
      location: 'archived',
    })
    const moved = detailForSummary({ ...archived.summary, location: 'available' })
    const archivedHit = { ...hit, location: 'archived' as const }
    let targetReads = 0
    installBridge({
      selectedId: available.summary.id,
      list: async ({ location }) =>
        collectionPageResult(
          [location === 'available' ? available.summary : archived.summary],
          null,
        ),
      get: async ({ threadId }) => ({
        ok: true,
        value: {
          detail:
            threadId === archived.summary.id ? (++targetReads === 1 ? archived : moved) : available,
          eventEpoch: 'epoch-1',
          includedThroughCursor: 0,
        },
      }),
      search: async () => ({
        ok: true,
        value: {
          results: [archivedHit],
          truncated: false,
          eventEpoch: 'epoch-1',
          includedThroughCursor: 0,
        },
      }),
    })
    render(true)
    await vi.waitFor(() => expect(render().state.selectedThreadId).toBe(available.summary.id))
    vi.useFakeTimers()
    window.setTimeout = setTimeout
    window.clearTimeout = clearTimeout
    render().activateThreadSearch()
    render().setThreadSearchInput('archived')
    await vi.advanceTimersByTimeAsync(120)
    await vi.waitFor(() => expect(render().threadSearch.results).toEqual([archivedHit]))

    await expect(render().openThreadSearchResult(archivedHit)).resolves.toBe(false)

    expect(targetReads).toBe(2)
    expect(render().threadCollection).toMatchObject({ location: 'available', status: 'ready' })
    expect(render().threadSummaries).toEqual([available.summary])
    expect(render().state.selectedThreadId).toBe(available.summary.id)
    expect(render().threadSearch.active).toBe(true)
  })

  it('does not commit a cross-location Search open after Search is cancelled', async () => {
    const available = detail('', 'thread-a')
    const archived = detailForSummary({
      ...detail('', 'thread-b').summary,
      location: 'archived',
    })
    const archivedHit = { ...hit, location: 'archived' as const }
    const archivedPage = deferred<NyxThreadResult<NyxThreadListPage>>()
    let archivedListCalls = 0
    installBridge({
      selectedId: available.summary.id,
      list: async ({ location }) => {
        if (location === 'available') return collectionPageResult([available.summary], null)
        archivedListCalls += 1
        return archivedPage.promise
      },
      get: async ({ threadId }) => ({
        ok: true,
        value: {
          detail: threadId === archived.summary.id ? archived : available,
          eventEpoch: 'epoch-1',
          includedThroughCursor: 0,
        },
      }),
      search: async () => ({
        ok: true,
        value: {
          results: [archivedHit],
          truncated: false,
          eventEpoch: 'epoch-1',
          includedThroughCursor: 0,
        },
      }),
    })
    render(true)
    await vi.waitFor(() => expect(render().state.selectedThreadId).toBe(available.summary.id))
    vi.useFakeTimers()
    window.setTimeout = setTimeout
    window.clearTimeout = clearTimeout
    render().activateThreadSearch()
    render().setThreadSearchInput('archived')
    await vi.advanceTimersByTimeAsync(120)
    await vi.waitFor(() => expect(render().threadSearch.results).toEqual([archivedHit]))

    const opening = render().openThreadSearchResult(archivedHit)
    await vi.waitFor(() => expect(archivedListCalls).toBe(1))
    render().cancelThreadSearch()
    archivedPage.resolve(collectionPageResult([archived.summary], null))

    await expect(opening).resolves.toBe(false)
    expect(render().threadCollection).toMatchObject({ location: 'available', status: 'ready' })
    expect(render().threadSummaries).toEqual([available.summary])
    expect(render().state.selectedThreadId).toBe(available.summary.id)
    expect(render().threadSearch.active).toBe(false)
  })

  it('restores an originally empty Main selection after a successful noncommitting target get', async () => {
    const trash = {
      ...detail('', 'thread-b'),
      summary: { ...detail('', 'thread-b').summary, location: 'trash' as const },
    }
    const get = vi.fn(async ({ threadId }: { threadId: string | null }) => ({
      ok: true as const,
      value: {
        detail: threadId === 'thread-b' ? trash : null,
        eventEpoch: 'epoch-1',
        includedThroughCursor: 0,
      },
    }))
    installBridge({
      get,
      search: async () => ({
        ok: true,
        value: {
          results: [hit],
          truncated: false,
          eventEpoch: 'epoch-1',
          includedThroughCursor: 0,
        },
      }),
    })
    render(true)
    await vi.waitFor(() => expect((harness.state as ChatState).hydrationStatus).toBe('ready'))
    vi.useFakeTimers()
    window.setTimeout = setTimeout
    window.clearTimeout = clearTimeout
    const session = render()
    session.activateThreadSearch()
    session.setThreadSearchInput('trash')
    await vi.advanceTimersByTimeAsync(120)
    await vi.waitFor(() => expect(render().threadSearch.results).toHaveLength(1))

    expect(await render().openThreadSearchResult(hit)).toBe(false)
    expect(get.mock.calls.map(([input]) => input.threadId)).toEqual(['thread-b', null])
    expect(render().isResetting).toBe(false)
    expect(render().threadSearch.active).toBe(true)
  })

  it('keeps the navigation lock through stale recovery, hydration, and one fresh recovery read', async () => {
    const original = detail('', 'thread-a')
    const trash = {
      ...detail('', 'thread-b'),
      summary: { ...detail('', 'thread-b').summary, location: 'trash' as const },
    }
    const delayedRecovery = deferred<
      NyxThreadResult<{
        detail: NyxThreadDetail | null
        eventEpoch: string
        includedThroughCursor: number
      }>
    >()
    let getCalls = 0
    let listCalls = 0
    let searchCalls = 0
    const bridge = installBridge({
      selectedId: original.summary.id,
      list: async () => {
        listCalls += 1
        return collectionPageResult([original.summary], null, listCalls === 1 ? 0 : 1)
      },
      get: async ({ threadId }) => {
        getCalls += 1
        if (getCalls === 2) {
          return {
            ok: true,
            value: { detail: trash, eventEpoch: 'epoch-1', includedThroughCursor: 0 },
          }
        }
        if (getCalls === 3) return delayedRecovery.promise
        return {
          ok: true,
          value: {
            detail: threadId === original.summary.id ? original : null,
            eventEpoch: 'epoch-1',
            includedThroughCursor: getCalls === 1 ? 0 : 1,
          },
        }
      },
      search: async () => {
        searchCalls += 1
        return {
          ok: true,
          value: {
            results: [hit],
            truncated: false,
            eventEpoch: 'epoch-1',
            includedThroughCursor: searchCalls === 1 ? 0 : 1,
          },
        }
      },
    })
    render(true)
    await vi.waitFor(() => expect((harness.state as ChatState).hydrationStatus).toBe('ready'))
    vi.useFakeTimers()
    window.setTimeout = setTimeout
    window.clearTimeout = clearTimeout
    const session = render()
    session.activateThreadSearch()
    session.setThreadSearchInput('trash')
    await vi.advanceTimersByTimeAsync(120)
    await vi.waitFor(() => expect(render().threadSearch.results).toHaveLength(1))

    const opening = render().openThreadSearchResult(hit)
    await vi.waitFor(() => expect(getCalls).toBe(3))
    expect(render().isResetting).toBe(true)
    bridge.emitThread({
      type: 'threads:changed',
      eventEpoch: 'epoch-1',
      includedThroughCursor: 1,
      detail: original,
    })
    delayedRecovery.resolve({
      ok: true,
      value: { detail: original, eventEpoch: 'epoch-1', includedThroughCursor: 0 },
    })

    await expect(opening).resolves.toBe(false)
    expect(getCalls).toBeGreaterThanOrEqual(5)
    expect(render().isResetting).toBe(false)
    expect((harness.state as ChatState).selectedThreadId).toBe(original.summary.id)
  })

  it('does not count a hydration read started before the target settles as recovery', async () => {
    const original = detail('', 'thread-a')
    const trash = {
      ...detail('', 'thread-b'),
      summary: { ...detail('', 'thread-b').summary, location: 'trash' as const },
    }
    const delayedTarget = deferred<
      NyxThreadResult<{
        detail: NyxThreadDetail | null
        eventEpoch: string
        includedThroughCursor: number
      }>
    >()
    let getCalls = 0
    let listCalls = 0
    let searchCalls = 0
    const bridge = installBridge({
      selectedId: original.summary.id,
      list: async () => {
        listCalls += 1
        return collectionPageResult([original.summary], null, listCalls === 1 ? 0 : 2)
      },
      get: async ({ threadId }) => {
        getCalls += 1
        if (getCalls === 2) return delayedTarget.promise
        return {
          ok: true,
          value: {
            detail: threadId === original.summary.id ? original : null,
            eventEpoch: 'epoch-1',
            includedThroughCursor: getCalls === 1 ? 0 : 2,
          },
        }
      },
      search: async () => {
        searchCalls += 1
        return {
          ok: true,
          value: {
            results: [hit],
            truncated: false,
            eventEpoch: 'epoch-1',
            includedThroughCursor: searchCalls === 1 ? 0 : 2,
          },
        }
      },
    })
    render(true)
    await vi.waitFor(() => expect((harness.state as ChatState).hydrationStatus).toBe('ready'))
    vi.useFakeTimers()
    window.setTimeout = setTimeout
    window.clearTimeout = clearTimeout
    const session = render()
    session.activateThreadSearch()
    session.setThreadSearchInput('trash')
    await vi.advanceTimersByTimeAsync(120)
    await vi.waitFor(() => expect(render().threadSearch.results).toHaveLength(1))

    const opening = render().openThreadSearchResult(hit)
    await vi.waitFor(() => expect(getCalls).toBe(2))
    bridge.emitChat({
      type: 'chat:capacity',
      eventEpoch: 'epoch-1',
      cursor: 2,
      activeRuns: 0,
      attachmentRunActive: false,
    })
    await vi.waitFor(() => expect(getCalls).toBe(3))
    delayedTarget.resolve({
      ok: true,
      value: { detail: trash, eventEpoch: 'epoch-1', includedThroughCursor: 0 },
    })

    await expect(opening).resolves.toBe(false)
    expect(getCalls).toBe(4)
    expect(render().isResetting).toBe(false)
    expect((harness.state as ChatState).selectedThreadId).toBe(original.summary.id)
  })
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
      pinPosition: null,
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

function collectionRows(start: number, count: number, pinnedThrough = 0) {
  return Array.from({ length: count }, (_, index) => {
    const value = start + index
    return {
      ...detail('', `thread-${value}`).summary,
      pinPosition: value <= pinnedThrough ? value : null,
      title: `Thread ${value}`,
    }
  })
}

function collectionPageResult(
  rows: NyxThreadListPage['rows'],
  nextCursor: string | null,
  includedThroughCursor = 0,
  overrides: Partial<Pick<NyxThreadListPage, 'capacity' | 'eventEpoch'>> = {},
): NyxThreadResult<NyxThreadListPage> {
  return {
    ok: true,
    value: {
      rows,
      nextCursor,
      capacity: { activeRuns: 0, attachmentRunActive: false },
      eventEpoch: 'epoch-1',
      includedThroughCursor,
      ...overrides,
    },
  }
}

function detailForSummary(summary: NyxThreadDetail['summary'], text = ''): NyxThreadDetail {
  return { ...detail(text, summary.id), summary }
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
        capacity: { activeRuns: 0, attachmentRunActive: false },
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
  harness.states = []
  harness.stateIndex = 0
  harness.effects = []
  harness.effectIndex = 0
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
  harness.stateIndex = 0
  harness.effectIndex = 0
  harness.runEffects = runEffects
  const session = useChatSession({
    connectionStatus: options.connectionStatus ?? readyStatus(),
    refreshConnections: options.refreshConnections ?? vi.fn(async () => undefined),
    getLatestConnectionRequestEpoch: options.getLatestConnectionRequestEpoch ?? (() => 1),
  })
  harness.runEffects = false
  return session
}

function runAutosaveEffect() {
  const effect = harness.effects.find(
    (candidate) =>
      candidate.toString().includes('setTimeout') &&
      candidate.toString().includes('queueSaveDraft'),
  )
  if (!effect) throw new Error('Autosave effect was not captured')
  const cleanup = effect()
  if (cleanup) harness.cleanups.push(cleanup)
}

function runTargetCatalogEffect() {
  const effect = harness.effects.find((candidate) =>
    candidate.toString().includes('deriveTargetCatalogAction'),
  )
  if (!effect) throw new Error('Target catalog effect was not captured')
  effect()
}

function installBridge(options?: {
  list?: (input: NyxThreadListPageInput) => Promise<NyxThreadResult<NyxThreadListPage>>
  get?: (input: { threadId: string | null }) => Promise<
    NyxThreadResult<{
      detail: NyxThreadDetail | null
      eventEpoch: string
      includedThroughCursor: number
    }>
  >
  materializeResult?: NyxThreadResult<NyxThreadMaterializeResult>
  saveDraftResult?: NyxThreadResult<NyxThreadSaveDraftResult>
  retryOpenResult?: NyxThreadResult<null>
  updatePin?: (input: NyxThreadUpdatePinInput) => Promise<NyxThreadResult<NyxThreadUpdatePinResult>>
  rename?: (input: NyxThreadRenameInput) => Promise<NyxThreadResult<NyxThreadRenameResult>>
  updateLocation?: (
    input: NyxThreadUpdateLocationInput,
  ) => Promise<NyxThreadResult<NyxThreadUpdateLocationResult>>
  search?: (input: NyxThreadSearchInput) => Promise<NyxThreadResult<NyxThreadSearchResponse>>
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
          capacity: { activeRuns: 0, attachmentRunActive: false },
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
              ...detail(input.text, input.threadId),
              draft: {
                ...detail(input.text, input.threadId).draft,
                revision: input.expectedDraftRevision + 1,
              },
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
  const updatePin = vi.fn(
    options?.updatePin ??
      (async (input: NyxThreadUpdatePinInput) => ({
        ok: true as const,
        value: {
          detail: detail('', input.threadId),
          eventEpoch: 'epoch-1',
          includedThroughCursor: 0,
        },
      })),
  )
  const rename = vi.fn(
    options?.rename ??
      (async (input: NyxThreadRenameInput) => {
        const current = detail('', input.threadId)
        return {
          ok: true as const,
          value: {
            detail: {
              ...current,
              summary: {
                ...current.summary,
                title: input.title,
                threadRevision: input.expectedThreadRevision + 1,
              },
            },
            eventEpoch: 'epoch-1',
            includedThroughCursor: 0,
          },
        }
      }),
  )
  const updateLocation = vi.fn(
    options?.updateLocation ??
      (async (input: NyxThreadUpdateLocationInput) => {
        const current = detail('', input.threadId)
        return {
          ok: true as const,
          value: {
            detail: {
              ...current,
              summary: {
                ...current.summary,
                location:
                  input.action === 'archive'
                    ? ('archived' as const)
                    : input.action === 'trash'
                      ? ('trash' as const)
                      : ('available' as const),
                pinPosition: null,
                threadRevision: input.expectedThreadRevision + 1,
              },
            },
            eventEpoch: 'epoch-1',
            includedThroughCursor: 0,
          },
        }
      }),
  )
  const search = vi.fn(
    options?.search ??
      (async () => ({
        ok: true as const,
        value: {
          results: [],
          truncated: false,
          eventEpoch: 'epoch-1',
          includedThroughCursor: 0,
        },
      })),
  )
  let storedSelectedId = options?.selectedId ?? null
  const localStorage = {
    getItem: vi.fn(() => storedSelectedId),
    setItem: vi.fn((_key: string, value: string) => {
      storedSelectedId = value
    }),
    removeItem: vi.fn(() => {
      storedSelectedId = null
    }),
  }
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
        updatePin,
        rename,
        updateLocation,
        search,
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
    updatePin,
    rename,
    updateLocation,
    search,
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
  it('hydrates Main capacity and lets a later buffered capacity event win', async () => {
    const page = deferred<
      NyxThreadResult<{
        rows: NyxThreadDetail['summary'][]
        nextCursor: null
        capacity: { activeRuns: number; attachmentRunActive: boolean }
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
    const value = detail('Hello')
    const bridge = installBridge({ list: () => page.promise, get: () => snapshot.promise })
    render(true)
    page.resolve({
      ok: true,
      value: {
        rows: [value.summary],
        nextCursor: null,
        capacity: { activeRuns: 0, attachmentRunActive: false },
        eventEpoch: 'epoch-1',
        includedThroughCursor: 0,
      },
    })
    await vi.waitFor(() => expect(bridge.get).toHaveBeenCalledOnce())
    bridge.emitChat({
      type: 'chat:capacity',
      activeRuns: 2,
      attachmentRunActive: false,
      eventEpoch: 'epoch-1',
      cursor: 1,
    })
    snapshot.resolve({
      ok: true,
      value: { detail: value, eventEpoch: 'epoch-1', includedThroughCursor: 1 },
    })

    await vi.waitFor(() =>
      expect(render().capacityNotice).toBe('Two responses are already running.'),
    )
  })

  it('refreshes the first page for a buffered terminal event already covered by detail', async () => {
    const page = deferred<
      NyxThreadResult<{
        rows: NyxThreadDetail['summary'][]
        nextCursor: null
        capacity: { activeRuns: number; attachmentRunActive: boolean }
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
    const value = detail('Done')
    const refreshed = { ...value.summary, title: 'Finished' }
    let listCalls = 0
    const bridge = installBridge({
      list: async () => {
        listCalls += 1
        if (listCalls === 1) return page.promise
        return {
          ok: true,
          value: {
            rows: [refreshed],
            nextCursor: null,
            capacity: { activeRuns: 0, attachmentRunActive: false },
            eventEpoch: 'epoch-1',
            includedThroughCursor: 1,
          },
        }
      },
      get: () => snapshot.promise,
    })
    render(true)
    page.resolve({
      ok: true,
      value: {
        rows: [value.summary],
        nextCursor: null,
        capacity: { activeRuns: 0, attachmentRunActive: false },
        eventEpoch: 'epoch-1',
        includedThroughCursor: 0,
      },
    })
    await vi.waitFor(() => expect(bridge.get).toHaveBeenCalledOnce())
    bridge.emitChat({
      type: 'chat:done',
      threadId: 'thread-a',
      requestId: 'request-1',
      assistantMessageId: 'assistant-1',
      status: 'completed',
      finalContent: 'Done',
      eventEpoch: 'epoch-1',
      cursor: 1,
    })
    snapshot.resolve({
      ok: true,
      value: { detail: value, eventEpoch: 'epoch-1', includedThroughCursor: 1 },
    })

    await vi.waitFor(() => expect(bridge.listPage).toHaveBeenCalledTimes(2))
    await vi.waitFor(() => expect(render().threadSummaries[0]?.title).toBe('Finished'))
  })

  it('does not let a list-only refresh overwrite newer capacity', async () => {
    const value = detail('Hello')
    const refreshed = { ...value.summary, title: 'Refreshed title' }
    const refresh = deferred<
      NyxThreadResult<{
        rows: NyxThreadDetail['summary'][]
        nextCursor: null
        capacity: { activeRuns: number; attachmentRunActive: boolean }
        eventEpoch: string
        includedThroughCursor: number
      }>
    >()
    let listCalls = 0
    const bridge = installBridge({
      list: async () => {
        listCalls += 1
        return listCalls === 1
          ? {
              ok: true,
              value: {
                rows: [value.summary],
                nextCursor: null,
                capacity: { activeRuns: 0, attachmentRunActive: false },
                eventEpoch: 'epoch-1',
                includedThroughCursor: 0,
              },
            }
          : refresh.promise
      },
      get: async () => ({
        ok: true,
        value: { detail: value, eventEpoch: 'epoch-1', includedThroughCursor: 0 },
      }),
    })
    render(true)
    await vi.waitFor(() => expect((harness.state as ChatState).hydrationStatus).toBe('ready'))
    bridge.emitThread({
      type: 'threads:changed',
      detail: { ...value, summary: refreshed },
      eventEpoch: 'epoch-1',
      includedThroughCursor: 1,
    })
    await vi.waitFor(() => expect(bridge.listPage).toHaveBeenCalledTimes(2))
    bridge.emitChat({
      type: 'chat:capacity',
      activeRuns: 2,
      attachmentRunActive: false,
      eventEpoch: 'epoch-1',
      cursor: 2,
    })
    refresh.resolve({
      ok: true,
      value: {
        rows: [refreshed],
        nextCursor: null,
        capacity: { activeRuns: 0, attachmentRunActive: false },
        eventEpoch: 'epoch-1',
        includedThroughCursor: 1,
      },
    })

    await vi.waitFor(() => expect(render().threadSummaries[0]?.title).toBe('Refreshed title'))
    expect(render().capacityNotice).toBe('Two responses are already running.')
  })

  it('replaces the canonical 50-row page when rows reorder or leave the page', async () => {
    const rows = Array.from({ length: 50 }, (_, index) => ({
      ...detail('', `thread-${index}`).summary,
      title: `Thread ${index}`,
    }))
    const refreshed = rows.slice(0, 49).reverse()
    let listCalls = 0
    const bridge = installBridge({
      list: async () => {
        listCalls += 1
        return {
          ok: true,
          value: {
            rows: listCalls === 1 ? rows : refreshed,
            nextCursor: null,
            capacity: { activeRuns: 0, attachmentRunActive: false },
            eventEpoch: 'epoch-1',
            includedThroughCursor: listCalls === 1 ? 0 : 1,
          },
        }
      },
      get: async () => ({
        ok: true,
        value: {
          detail: { ...detail('', 'thread-0'), summary: rows[0]! },
          eventEpoch: 'epoch-1',
          includedThroughCursor: 0,
        },
      }),
    })
    render(true)
    await vi.waitFor(() => expect(render().threadSummaries).toHaveLength(50))
    bridge.emitThread({
      type: 'threads:removed',
      threadId: 'thread-49',
      eventEpoch: 'epoch-1',
      includedThroughCursor: 1,
    })

    await vi.waitFor(() => expect(render().threadSummaries).toHaveLength(49))
    expect(render().threadSummaries.map((row) => row.id)).toEqual(refreshed.map((row) => row.id))
  })

  it('discards a stale list-only response after full hydration starts', async () => {
    const threadA = detail('A', 'thread-a')
    const threadB = detail('B', 'thread-b')
    const staleRefresh = deferred<
      NyxThreadResult<{
        rows: NyxThreadDetail['summary'][]
        nextCursor: null
        capacity: { activeRuns: number; attachmentRunActive: boolean }
        eventEpoch: string
        includedThroughCursor: number
      }>
    >()
    let listCalls = 0
    const bridge = installBridge({
      list: async () => {
        listCalls += 1
        if (listCalls === 2) return staleRefresh.promise
        return {
          ok: true,
          value: {
            rows: listCalls === 1 ? [threadA.summary] : [threadB.summary],
            nextCursor: null,
            capacity: { activeRuns: 0, attachmentRunActive: false },
            eventEpoch: 'epoch-1',
            includedThroughCursor: listCalls === 1 ? 0 : 3,
          },
        }
      },
      get: async () => ({
        ok: true,
        value: {
          detail: threadA,
          eventEpoch: 'epoch-1',
          includedThroughCursor: listCalls >= 3 ? 3 : 0,
        },
      }),
    })
    render(true)
    await vi.waitFor(() => expect(render().threadSummaries[0]?.id).toBe('thread-a'))
    bridge.emitThread({
      type: 'threads:changed',
      detail: threadA,
      eventEpoch: 'epoch-1',
      includedThroughCursor: 1,
    })
    await vi.waitFor(() => expect(bridge.listPage).toHaveBeenCalledTimes(2))
    bridge.emitThread({
      type: 'threads:changed',
      detail: threadB,
      eventEpoch: 'epoch-1',
      includedThroughCursor: 3,
    })
    await vi.waitFor(() => expect(bridge.listPage).toHaveBeenCalledTimes(3))
    await vi.waitFor(() => expect(render().threadSummaries[0]?.id).toBe('thread-b'))
    staleRefresh.resolve({
      ok: true,
      value: {
        rows: [{ ...threadA.summary, title: 'Stale' }],
        nextCursor: null,
        capacity: { activeRuns: 0, attachmentRunActive: false },
        eventEpoch: 'epoch-1',
        includedThroughCursor: 1,
      },
    })
    await Promise.resolve()

    expect(render().threadSummaries[0]?.id).toBe('thread-b')
  })

  it('subscribes before list/get and replays list/detail against separate watermarks', async () => {
    const page = deferred<
      NyxThreadResult<{
        rows: NyxThreadDetail['summary'][]
        nextCursor: null
        capacity: { activeRuns: number; attachmentRunActive: boolean }
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
        capacity: { activeRuns: 0, attachmentRunActive: false },
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
          capacity: { activeRuns: 0, attachmentRunActive: false },
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
          capacity: { activeRuns: 0, attachmentRunActive: false },
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
            capacity: { activeRuns: 0, attachmentRunActive: false },
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
          capacity: { activeRuns: 0, attachmentRunActive: false },
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
    const firstPage = Array.from(
      { length: 50 },
      (_, index) => detail(`first page ${index}`, `thread-page-${index}`).summary,
    )
    const bridge = installBridge({
      selectedId: 'thread-b',
      list: async () => ({
        ok: true,
        value: {
          rows: firstPage,
          nextCursor: 'next-page',
          capacity: { activeRuns: 0, attachmentRunActive: false },
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
    selected.pinPosition = 2
    installBridge({
      list: async () => ({
        ok: true,
        value: {
          rows: [selected],
          nextCursor: null,
          capacity: { activeRuns: 0, attachmentRunActive: false },
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
      threadSummary: {
        availability: 'unavailable',
        pinPosition: 2,
        title: "Couldn't open this thread",
      },
    })
  })

  it('fails the Library closed when an unavailable off-page Thread has no safe Pin grouping', async () => {
    const snapshot = deferred<
      NyxThreadResult<{
        detail: NyxThreadDetail | null
        eventEpoch: string
        includedThroughCursor: number
      }>
    >()
    const firstPage = Array.from(
      { length: 50 },
      (_, index) => detail(`first page ${index}`, `thread-page-${index}`).summary,
    )
    const bridge = installBridge({
      selectedId: 'thread-b',
      list: async () => ({
        ok: true,
        value: {
          rows: firstPage,
          nextCursor: 'next-page',
          capacity: { activeRuns: 2, attachmentRunActive: false },
          eventEpoch: 'epoch-1',
          includedThroughCursor: 2,
        },
      }),
      get: () => snapshot.promise,
    })
    render(true)

    await vi.waitFor(() => expect(bridge.get).toHaveBeenCalledOnce())
    expect(render().threadSummaries).toEqual([])
    expect(render().capacityNotice).toBeNull()
    snapshot.resolve({
      ok: false,
      error: { code: 'thread_unavailable', message: 'Canonical content failed.' },
    })

    await vi.waitFor(() => expect((harness.state as ChatState).hydrationStatus).toBe('error'))
    expect(render().threadSummaries).toEqual([])
    expect(render().capacityNotice).toBeNull()
    expect(harness.state).toMatchObject({
      selectedThreadId: null,
      threadSummary: null,
      hydrationError: {
        code: 'library_unavailable',
        message: "Couldn't open Thread Library",
      },
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
          capacity: { activeRuns: 0, attachmentRunActive: false },
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

  it('switches Threads without cancelling a background Run or hydrating each delta', async () => {
    const threadA = detail('draft A', 'thread-a')
    const threadB = detail('draft B', 'thread-b')
    let cursor = 0
    let aRunning = false
    const requestId = 'request-a'
    const bridge = installBridge({
      selectedId: 'thread-a',
      list: async () => ({
        ok: true,
        value: {
          rows: [
            {
              ...threadA.summary,
              activity: aRunning
                ? {
                    status: 'streaming' as const,
                    requestId,
                    attachmentBearing: false,
                  }
                : { status: 'idle' as const },
            },
            threadB.summary,
          ],
          nextCursor: null,
          capacity: { activeRuns: 0, attachmentRunActive: false },
          eventEpoch: 'epoch-1',
          includedThroughCursor: cursor,
        },
      }),
      get: async ({ threadId }) => {
        const selected = threadId === 'thread-b' ? threadB : threadA
        return {
          ok: true,
          value: {
            detail:
              threadId === 'thread-a' && aRunning
                ? {
                    ...selected,
                    runStatus: 'streaming' as const,
                    activeRun: {
                      requestId,
                      assistantMessageId: 'assistant-a',
                      turnIntent: 'new_user_message' as const,
                      attachmentBearing: false,
                    },
                  }
                : selected,
            eventEpoch: 'epoch-1',
            includedThroughCursor: cursor,
          },
        }
      },
    })
    const session = await settleSelectedHydration(bridge, threadA)
    cursor = 1
    aRunning = true
    bridge.emitChat({
      type: 'chat:accepted',
      threadId: 'thread-a',
      requestId,
      userMessageId: 'user-a',
      assistantMessageId: 'assistant-a',
      turnIntent: 'new_user_message',
      attachmentBearing: false,
      eventEpoch: 'epoch-1',
      cursor,
    })

    expect(await session.selectThread('thread-b')).toBe(true)
    expect(bridge.cancel).not.toHaveBeenCalled()
    expect(harness.state).toMatchObject({ selectedThreadId: 'thread-b', input: 'draft B' })
    const listCallsAfterSwitch = bridge.listPage.mock.calls.length

    cursor = 2
    bridge.emitChat({
      type: 'chat:delta',
      threadId: 'thread-a',
      requestId,
      assistantMessageId: 'assistant-a',
      delta: 'Live',
      snapshot: 'Live answer',
      eventEpoch: 'epoch-1',
      cursor,
    })
    expect(bridge.listPage).toHaveBeenCalledTimes(listCallsAfterSwitch)
    expect((harness.state as ChatState).selectedThreadId).toBe('thread-b')
    expect(render().threadSummaries).toMatchObject([
      { id: 'thread-a', activity: { status: 'streaming', requestId } },
      { id: 'thread-b' },
    ])

    expect(await render().selectThread('thread-a')).toBe(true)
    expect(harness.state).toMatchObject({
      selectedThreadId: 'thread-a',
      activeRequestId: requestId,
      runStatus: 'streaming',
    })
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
            capacity: { activeRuns: 0, attachmentRunActive: false },
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
          capacity: { activeRuns: 0, attachmentRunActive: false },
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

describe('CP1 bounded Thread collection', () => {
  it('loads 137 rows as 50/50/37 without publishing partial pages or consuming capacity clocks', async () => {
    const firstRows = collectionRows(1, 50, 50)
    const secondRows = collectionRows(51, 50, 50)
    const thirdRows = collectionRows(101, 37, 50)
    const secondPage = deferred<NyxThreadResult<NyxThreadListPage>>()
    const selected = detailForSummary(firstRows[0]!)
    const bridge = installBridge({
      list: async ({ cursor }) => {
        if (cursor === 'cursor-1') return secondPage.promise
        if (cursor === 'cursor-2') {
          return collectionPageResult(thirdRows, null, 99, {
            capacity: { activeRuns: 2, attachmentRunActive: false },
          })
        }
        return collectionPageResult(firstRows, 'cursor-1', 7)
      },
      get: async () => ({
        ok: true,
        value: { detail: selected, eventEpoch: 'epoch-1', includedThroughCursor: 7 },
      }),
    })
    render(true)
    await vi.waitFor(() => expect(render().threadSummaries).toHaveLength(50))

    const loadingSecond = render().loadMoreThreads()
    await vi.waitFor(() => expect(bridge.listPage).toHaveBeenCalledTimes(2))
    expect(render().threadSummaries).toHaveLength(50)
    expect(render().threadCollection.status).toBe('loading-more')
    secondPage.resolve(
      collectionPageResult(secondRows, 'cursor-2', 99, {
        capacity: { activeRuns: 2, attachmentRunActive: false },
      }),
    )
    await expect(loadingSecond).resolves.toBe(true)
    expect(render().threadSummaries).toHaveLength(100)

    await expect(render().loadMoreThreads()).resolves.toBe(true)
    const session = render()
    expect(session.threadSummaries).toHaveLength(137)
    expect(session.pinnedThreadSummaries).toHaveLength(50)
    expect(session.recentThreadSummaries).toHaveLength(87)
    expect(session.threadCollection).toMatchObject({
      loadedPageCount: 3,
      nextCursor: null,
      status: 'ready',
    })
    expect((harness.state as ChatState).listCursor).toBe(7)
    expect(session.capacityNotice).toBeNull()
    expect(bridge.listPage.mock.calls.map(([input]) => input.cursor ?? null)).toEqual([
      null,
      'cursor-1',
      'cursor-2',
    ])
  })

  it('keeps an off-prefix selected Thread separate until its page is explicitly loaded', async () => {
    const firstRows = collectionRows(1, 50)
    const secondRows = collectionRows(51, 50)
    const selected = detailForSummary(secondRows[24]!, 'selected off page')
    const bridge = installBridge({
      selectedId: selected.summary.id,
      list: async ({ cursor }) =>
        collectionPageResult(cursor ? secondRows : firstRows, cursor ? null : 'cursor-1'),
      get: async ({ threadId }) => ({
        ok: true,
        value: {
          detail: threadId === 'thread-76' ? detailForSummary(secondRows[25]!) : selected,
          eventEpoch: 'epoch-1',
          includedThroughCursor: 0,
        },
      }),
    })
    render(true)
    await vi.waitFor(() => expect((harness.state as ChatState).selectedThreadId).toBe('thread-75'))

    let session = render()
    expect(session.currentThreadSummary?.id).toBe('thread-75')
    expect(session.threadCollection.nextCursor).toBe('cursor-1')

    await expect(session.loadMoreThreads()).resolves.toBe(true)
    session = render()
    expect(session.currentThreadSummary).toBeNull()
    expect(session.threadCollection.nextCursor).toBeNull()
    expect(bridge.get).toHaveBeenCalledWith({ threadId: 'thread-75' })

    await expect(session.selectThread('thread-76')).resolves.toBe(true)
    expect((harness.state as ChatState).selectedThreadId).toBe('thread-76')
    expect(render().threadSummaries).toHaveLength(100)
    expect(render().threadCollection.loadedPageCount).toBe(2)
    expect(render().currentThreadSummary).toBeNull()
  })

  it('rebuilds the bounded prefix once after a stale page cursor', async () => {
    const firstRows = collectionRows(1, 50)
    const refreshedFirst = firstRows.map((row) => ({ ...row, title: `Refreshed ${row.title}` }))
    const secondRows = collectionRows(51, 50)
    let nullCalls = 0
    const bridge = installBridge({
      list: async ({ cursor }) => {
        if (cursor === 'cursor-1') {
          return {
            ok: false,
            error: { code: 'conflict', message: 'The list changed.' },
          }
        }
        if (cursor === 'rebuilt-cursor') {
          return collectionPageResult(secondRows, null, 40)
        }
        nullCalls += 1
        return collectionPageResult(
          nullCalls === 1 ? firstRows : refreshedFirst,
          nullCalls === 1 ? 'cursor-1' : 'rebuilt-cursor',
          nullCalls === 1 ? 0 : 40,
        )
      },
      get: async () => ({
        ok: true,
        value: {
          detail: detailForSummary(firstRows[0]!),
          eventEpoch: 'epoch-1',
          includedThroughCursor: 0,
        },
      }),
    })
    render(true)
    await vi.waitFor(() => expect(render().threadSummaries).toHaveLength(50))

    await expect(render().loadMoreThreads()).resolves.toBe(true)
    expect(render().threadSummaries).toHaveLength(100)
    expect(render().threadSummaries[0]?.title).toBe('Refreshed Thread 1')
    expect((harness.state as ChatState).listCursor).toBe(0)
    expect(bridge.listPage.mock.calls.map(([input]) => input.cursor ?? null)).toEqual([
      null,
      'cursor-1',
      null,
      'rebuilt-cursor',
    ])
  })

  it('preserves accepted rows after two conflicts and retries only the failed page action', async () => {
    const firstRows = collectionRows(1, 50)
    const secondRows = collectionRows(51, 50)
    let failing = true
    let nullCalls = 0
    installBridge({
      list: async ({ cursor }) => {
        if (cursor === 'cursor-1') {
          return failing
            ? { ok: false, error: { code: 'conflict', message: 'The list changed.' } }
            : collectionPageResult(secondRows, null)
        }
        if (cursor === 'rebuilt-cursor') {
          return { ok: false, error: { code: 'conflict', message: 'The list changed again.' } }
        }
        nullCalls += 1
        return collectionPageResult(firstRows, nullCalls === 1 ? 'cursor-1' : 'rebuilt-cursor')
      },
      get: async () => ({
        ok: true,
        value: {
          detail: detailForSummary(firstRows[0]!),
          eventEpoch: 'epoch-1',
          includedThroughCursor: 0,
        },
      }),
    })
    render(true)
    await vi.waitFor(() => expect(render().threadSummaries).toHaveLength(50))

    await expect(render().loadMoreThreads()).resolves.toBe(false)
    expect(render().threadSummaries).toEqual(firstRows)
    expect(render().threadCollection).toMatchObject({
      status: 'error',
      errorPhase: 'load-more',
      retryMode: 'load-more',
    })

    failing = false
    await expect(render().retryThreadCollection()).resolves.toBe(true)
    expect(render().threadSummaries).toHaveLength(100)
    expect(render().threadCollection.status).toBe('ready')
  })

  it('coalesces repeated relevant events into bounded replacement candidates', async () => {
    const firstRows = collectionRows(1, 50)
    const staleSecond = collectionRows(51, 50).map((row) => ({
      ...row,
      title: `Stale ${row.title}`,
    }))
    const freshFirst = firstRows.map((row) => ({ ...row, title: `Fresh ${row.title}` }))
    const freshSecond = collectionRows(51, 50).map((row) => ({
      ...row,
      title: `Fresh ${row.title}`,
    }))
    const pendingPage = deferred<NyxThreadResult<NyxThreadListPage>>()
    const rebuildingFirstPage = deferred<NyxThreadResult<NyxThreadListPage>>()
    let nullCalls = 0
    const bridge = installBridge({
      list: async ({ cursor }) => {
        if (cursor === 'cursor-1') return pendingPage.promise
        if (cursor === 'fresh-cursor') {
          return collectionPageResult(freshSecond, null, 50, {
            capacity: { activeRuns: 2, attachmentRunActive: false },
          })
        }
        nullCalls += 1
        if (nullCalls === 2) return rebuildingFirstPage.promise
        return collectionPageResult(
          nullCalls === 1 ? firstRows : freshFirst,
          nullCalls === 1 ? 'cursor-1' : 'fresh-cursor',
          nullCalls === 1 ? 0 : 50,
        )
      },
      get: async () => ({
        ok: true,
        value: {
          detail: detailForSummary(firstRows[0]!),
          eventEpoch: 'epoch-1',
          includedThroughCursor: 0,
        },
      }),
    })
    render(true)
    await vi.waitFor(() => expect(render().threadSummaries).toHaveLength(50))

    const loading = render().loadMoreThreads()
    await vi.waitFor(() => expect(bridge.listPage).toHaveBeenCalledTimes(2))
    bridge.emitThread({
      type: 'threads:changed',
      detail: detail('changed', 'thread-999'),
      eventEpoch: 'epoch-1',
      includedThroughCursor: 1,
    })
    pendingPage.resolve(
      collectionPageResult(staleSecond, null, 50, {
        capacity: { activeRuns: 2, attachmentRunActive: false },
      }),
    )

    await vi.waitFor(() => expect(bridge.listPage).toHaveBeenCalledTimes(3))
    bridge.emitThread({
      type: 'threads:changed',
      detail: detail('changed twice', 'thread-998'),
      eventEpoch: 'epoch-1',
      includedThroughCursor: 2,
    })
    rebuildingFirstPage.resolve(collectionPageResult(freshFirst, 'fresh-cursor', 2))

    await expect(loading).resolves.toBe(false)
    expect(render().threadSummaries).toHaveLength(100)
    expect(render().threadSummaries[0]?.title).toBe('Fresh Thread 1')
    expect(render().threadSummaries[50]?.title).toBe('Fresh Thread 51')
    expect((harness.state as ChatState).listCursor).toBe(2)
    expect(render().capacityNotice).toBeNull()
  })

  it('discards a late explicit page after replacement hydration starts', async () => {
    const firstRows = collectionRows(1, 50)
    const replacementRows = firstRows.map((row) => ({ ...row, title: `Replacement ${row.title}` }))
    const stalePage = deferred<NyxThreadResult<NyxThreadListPage>>()
    let nullCalls = 0
    const bridge = installBridge({
      list: async ({ cursor }) => {
        if (cursor === 'cursor-1') return stalePage.promise
        nullCalls += 1
        return collectionPageResult(
          nullCalls === 1 ? firstRows : replacementRows,
          nullCalls === 1 ? 'cursor-1' : null,
          0,
          { eventEpoch: nullCalls === 1 ? 'epoch-1' : 'epoch-2' },
        )
      },
      get: async () => ({
        ok: true,
        value: {
          detail: detailForSummary(nullCalls === 1 ? firstRows[0]! : replacementRows[0]!),
          eventEpoch: nullCalls === 1 ? 'epoch-1' : 'epoch-2',
          includedThroughCursor: 0,
        },
      }),
    })
    render(true)
    await vi.waitFor(() => expect(render().threadSummaries).toEqual(firstRows))

    const loading = render().loadMoreThreads()
    await vi.waitFor(() => expect(bridge.listPage).toHaveBeenCalledTimes(2))
    bridge.emitThread({
      type: 'threads:epoch-changed',
      eventEpoch: 'epoch-2',
      includedThroughCursor: 0,
    })
    await vi.waitFor(() => expect(render().threadSummaries[0]?.title).toBe('Replacement Thread 1'))
    stalePage.resolve(collectionPageResult(collectionRows(51, 50), null))

    await expect(loading).resolves.toBe(false)
    expect(render().threadSummaries).toEqual(replacementRows)
  })

  it('falls back deterministically when end-of-list revalidation rejects the pending selection', async () => {
    const firstRows = collectionRows(1, 50)
    const finalRows = collectionRows(51, 20)
    const selected = detail('', 'thread-999')
    let selectedReads = 0
    const bridge = installBridge({
      selectedId: selected.summary.id,
      list: async ({ cursor }) =>
        collectionPageResult(cursor ? finalRows : firstRows, cursor ? null : 'cursor-1'),
      get: async ({ threadId }) => {
        if (threadId === selected.summary.id) {
          selectedReads += 1
          return selectedReads === 1
            ? {
                ok: true,
                value: { detail: selected, eventEpoch: 'epoch-1', includedThroughCursor: 0 },
              }
            : { ok: false, error: { code: 'not_found', message: 'Not found.' } }
        }
        return {
          ok: true,
          value: {
            detail: detailForSummary(firstRows[0]!),
            eventEpoch: 'epoch-1',
            includedThroughCursor: 0,
          },
        }
      },
    })
    render(true)
    await vi.waitFor(() => expect((harness.state as ChatState).selectedThreadId).toBe('thread-999'))

    await expect(render().loadMoreThreads()).resolves.toBe(false)
    await vi.waitFor(() => expect((harness.state as ChatState).selectedThreadId).toBe('thread-1'))
    expect(bridge.localStorage.removeItem).toHaveBeenCalledWith('nyx.thread.selected.v1')
    expect(render().threadSummaries).toEqual(firstRows)
  })

  it('replaces the full accepted budget once and resumes events after bounded Retry conflicts', async () => {
    const firstRows = collectionRows(1, 50)
    const finalRows = collectionRows(51, 20)
    const selected = detail('', 'thread-999')
    const replacementFirst = deferred<NyxThreadResult<NyxThreadListPage>>()
    let firstPageReads = 0
    const bridge = installBridge({
      selectedId: selected.summary.id,
      list: async ({ cursor }) => {
        if (!cursor && ++firstPageReads === 2) return replacementFirst.promise
        return collectionPageResult(cursor ? finalRows : firstRows, cursor ? null : 'cursor-1')
      },
      get: async () => ({
        ok: true,
        value: { detail: selected, eventEpoch: 'epoch-1', includedThroughCursor: 0 },
      }),
    })
    render(true)
    await vi.waitFor(() => expect((harness.state as ChatState).selectedThreadId).toBe('thread-999'))

    await expect(render().loadMoreThreads()).resolves.toBe(false)
    await vi.waitFor(() => expect(bridge.listPage).toHaveBeenCalledTimes(3))
    expect(render().threadCollection).toMatchObject({
      status: 'ready',
      loadedPageCount: 2,
      nextCursor: null,
    })
    expect(render().threadSummaries).toEqual([...firstRows, ...finalRows])

    replacementFirst.resolve(collectionPageResult(firstRows, 'cursor-1'))
    await vi.waitFor(() => expect(render().threadCollection.status).toBe('error'))
    expect(bridge.listPage).toHaveBeenCalledTimes(4)
    expect(render().threadCollection).toMatchObject({
      status: 'error',
      errorPhase: 'load-more',
      retryMode: 'hydrate',
      loadedPageCount: 2,
      nextCursor: null,
    })
    expect(render().currentThreadSummary?.id).toBe('thread-999')

    render().setInput('still editable')
    render()
    const secondConflict = deferred<NyxThreadResult<NyxThreadListPage>>()
    bridge.listPage
      .mockResolvedValueOnce({
        ok: false,
        error: { code: 'conflict', message: 'The list changed.' },
      })
      .mockImplementationOnce(() => secondConflict.promise)
    const retry = render().retryThreadCollection()
    await vi.waitFor(() => expect(bridge.listPage).toHaveBeenCalledTimes(6))
    bridge.emitChat({
      type: 'chat:capacity',
      activeRuns: 2,
      attachmentRunActive: false,
      eventEpoch: 'epoch-1',
      cursor: 1,
    })
    secondConflict.resolve({
      ok: false,
      error: { code: 'conflict', message: 'The list changed again.' },
    })
    await expect(retry).resolves.toBe(true)
    expect((harness.state as ChatState).hydrationStatus).toBe('ready')
    expect(render()).toMatchObject({
      canSend: false,
      capacityNotice: 'Two responses are already running.',
      threadCollection: { status: 'error', retryMode: 'hydrate' },
    })
  })

  it('fails closed on unsafe Pin grouping and keeps the Library retryOpen path', async () => {
    const firstRows = collectionRows(1, 50)
    const unsafeRows = collectionRows(51, 2)
    unsafeRows[1] = { ...unsafeRows[1]!, pinPosition: 1 }
    const failedPage = deferred<NyxThreadResult<NyxThreadListPage>>()
    const bridge = installBridge({
      list: async ({ cursor }) =>
        cursor ? failedPage.promise : collectionPageResult(firstRows, 'cursor-1'),
      get: async () => ({
        ok: true,
        value: {
          detail: detailForSummary(firstRows[0]!),
          eventEpoch: 'epoch-1',
          includedThroughCursor: 0,
        },
      }),
    })
    render(true)
    await vi.waitFor(() => expect(render().threadSummaries).toHaveLength(50))

    const loading = render().loadMoreThreads()
    await vi.waitFor(() => expect(bridge.listPage).toHaveBeenCalledTimes(2))
    bridge.emitThread({
      type: 'threads:changed',
      detail: detail('changed', 'thread-999'),
      eventEpoch: 'epoch-1',
      includedThroughCursor: 1,
    })
    failedPage.resolve(collectionPageResult(unsafeRows, null, 1))

    await expect(loading).resolves.toBe(false)
    expect((harness.state as ChatState).hydrationStatus).toBe('error')
    expect((harness.state as ChatState).hydrationError?.code).toBe('library_unavailable')
    expect(bridge.listPage).toHaveBeenCalledTimes(2)
    expect(render().threadCollection.errorPhase).toBeNull()
    expect(render().threadSummaries).toEqual(firstRows)
    await render().retryOpen()
    expect(bridge.retryOpen).toHaveBeenCalledWith({ scope: 'library' })
  })

  it('bounds initial missing-selection recovery when the first page is already final', async () => {
    const firstRows = collectionRows(1, 2)
    const selected = detail('selected draft', 'thread-999')
    const bridge = installBridge({
      selectedId: selected.summary.id,
      list: async () => collectionPageResult(firstRows, null),
      get: async ({ threadId }) => ({
        ok: true,
        value: {
          detail: threadId === selected.summary.id ? selected : detailForSummary(firstRows[0]!),
          eventEpoch: 'epoch-1',
          includedThroughCursor: 0,
        },
      }),
    })
    render(true)

    await vi.waitFor(() => expect(render().threadCollection.status).toBe('error'))
    const session = render()
    expect(bridge.listPage).toHaveBeenCalledTimes(2)
    expect(bridge.get).toHaveBeenCalledTimes(2)
    expect(bridge.get.mock.calls.map(([input]) => input.threadId)).toEqual([
      'thread-999',
      'thread-999',
    ])
    expect(harness.state as ChatState).toMatchObject({
      selectedThreadId: 'thread-999',
      input: 'selected draft',
    })
    expect(session.currentThreadSummary?.id).toBe('thread-999')
    expect(session.threadSummaries).toEqual(firstRows)
    expect(session.threadSummaries.some((row) => row.id === 'thread-999')).toBe(false)
    expect(session.threadCollection).toMatchObject({
      status: 'error',
      errorPhase: 'initial',
      retryMode: 'hydrate',
      loadedPageCount: 1,
      nextCursor: null,
    })

    await Promise.resolve()
    await Promise.resolve()
    expect(bridge.listPage).toHaveBeenCalledTimes(2)
    expect(bridge.get).toHaveBeenCalledTimes(2)
  })

  it('bounds initial candidate repair and exposes a local Retry instead of a Library error', async () => {
    const firstRows = collectionRows(1, 2)
    let failing = true
    const bridge = installBridge({
      list: async () =>
        failing
          ? { ok: false, error: { code: 'conflict', message: 'The list changed.' } }
          : collectionPageResult(firstRows, null),
      get: async () => ({
        ok: true,
        value: {
          detail: detailForSummary(firstRows[0]!),
          eventEpoch: 'epoch-1',
          includedThroughCursor: 0,
        },
      }),
    })
    render(true)
    await vi.waitFor(() => expect(bridge.listPage).toHaveBeenCalledTimes(2))
    expect(render().threadCollection).toMatchObject({
      status: 'error',
      errorPhase: 'initial',
      retryMode: 'hydrate',
    })
    expect((harness.state as ChatState).hydrationError).toBeNull()

    failing = false
    await expect(render().retryThreadCollection()).resolves.toBe(true)
    expect(render().threadSummaries).toEqual(firstRows)
    expect((harness.state as ChatState).hydrationStatus).toBe('ready')
  })
})

describe('PIN1 Renderer controls', () => {
  it('keeps one action gate and waits for the changed-event refresh without optimistic reorder', async () => {
    const recent = detail('', 'thread-a')
    const pinned = { ...recent, summary: { ...recent.summary, pinPosition: 1 } }
    const update = deferred<NyxThreadResult<NyxThreadUpdatePinResult>>()
    const refresh = deferred<NyxThreadResult<NyxThreadListPage>>()
    let listCalls = 0
    const bridge = installBridge({
      list: async () =>
        ++listCalls === 1 ? collectionPageResult([recent.summary], null) : refresh.promise,
      get: async () => ({
        ok: true,
        value: { detail: recent, eventEpoch: 'epoch-1', includedThroughCursor: 0 },
      }),
      updatePin: () => update.promise,
    })
    render(true)
    await vi.waitFor(() => expect(render().threadSummaries).toEqual([recent.summary]))

    const updating = render().updateThreadPin({
      threadId: recent.summary.id,
      action: 'pin',
      expectedPinPosition: null,
    })
    await vi.waitFor(() => expect(bridge.updatePin).toHaveBeenCalledOnce())
    expect(render().threadPinAction.pending).toBe(true)
    expect(render().threadSummaries[0]?.pinPosition).toBeNull()
    await expect(
      render().updateThreadPin({
        threadId: recent.summary.id,
        action: 'pin',
        expectedPinPosition: null,
      }),
    ).resolves.toBe(false)
    expect(bridge.updatePin).toHaveBeenCalledOnce()

    bridge.emitThread({
      type: 'threads:changed',
      detail: pinned,
      eventEpoch: 'epoch-1',
      includedThroughCursor: 1,
    })
    await vi.waitFor(() => expect(bridge.listPage).toHaveBeenCalledTimes(2))
    update.resolve({
      ok: true,
      value: {
        detail: pinned,
        eventEpoch: 'epoch-1',
        includedThroughCursor: 1,
      },
    })
    await expect(updating).resolves.toBe(true)
    expect(render().threadPinAction.pending).toBe(true)
    expect(render().threadSummaries[0]?.pinPosition).toBeNull()

    refresh.resolve(collectionPageResult([pinned.summary], null, 1))
    await vi.waitFor(() => expect(render().threadPinAction.pending).toBe(false))
    expect(render().threadSummaries[0]?.pinPosition).toBe(1)
  })

  it('performs an explicit bounded refresh for a successful boundary no-op', async () => {
    const pinned = detail('', 'thread-a')
    pinned.summary.pinPosition = 1
    const bridge = installBridge({
      list: async () => collectionPageResult([pinned.summary], null),
      get: async () => ({
        ok: true,
        value: { detail: pinned, eventEpoch: 'epoch-1', includedThroughCursor: 0 },
      }),
      updatePin: async () => ({
        ok: true,
        value: { detail: pinned, eventEpoch: 'epoch-1', includedThroughCursor: 0 },
      }),
    })
    render(true)
    await vi.waitFor(() => expect(render().threadSummaries).toEqual([pinned.summary]))

    await expect(
      render().updateThreadPin({
        threadId: pinned.summary.id,
        action: 'move_up',
        expectedPinPosition: 1,
      }),
    ).resolves.toBe(true)

    await vi.waitFor(() => expect(render().threadPinAction.pending).toBe(false))
    expect(bridge.updatePin).toHaveBeenCalledWith({
      threadId: pinned.summary.id,
      action: 'move_up',
      expectedPinPosition: 1,
    })
    expect(bridge.listPage).toHaveBeenCalledTimes(2)
    expect(render().threadSummaries).toEqual([pinned.summary])
  })

  it('preserves the projection and holds the row error until conflict recovery commits', async () => {
    const recent = detail('', 'thread-a')
    const recovery = deferred<NyxThreadResult<NyxThreadListPage>>()
    let listCalls = 0
    const bridge = installBridge({
      list: async () =>
        ++listCalls === 1 ? collectionPageResult([recent.summary], null) : recovery.promise,
      get: async () => ({
        ok: true,
        value: { detail: recent, eventEpoch: 'epoch-1', includedThroughCursor: 0 },
      }),
      updatePin: async () => ({
        ok: false,
        error: { code: 'conflict', message: 'Thread changed. Try again.' },
      }),
    })
    render(true)
    await vi.waitFor(() => expect(render().threadSummaries).toEqual([recent.summary]))

    await expect(
      render().updateThreadPin({
        threadId: recent.summary.id,
        action: 'pin',
        expectedPinPosition: null,
      }),
    ).resolves.toBe(false)
    await vi.waitFor(() => expect(bridge.listPage).toHaveBeenCalledTimes(2))
    expect(render().threadSummaries).toEqual([recent.summary])
    expect(render().threadPinAction).toEqual({
      pending: true,
      error: { threadId: recent.summary.id, message: 'Thread changed. Try again.' },
    })

    recovery.resolve(collectionPageResult([recent.summary], null))
    await vi.waitFor(() => expect(render().threadPinAction).toEqual(initialThreadPinActionState))
    expect(render().threadSummaries).toEqual([recent.summary])
  })

  it('releases invalid input locally but routes Library failure to whole-Library fail-closed', async () => {
    const recent = detail('', 'thread-a')
    const bridge = installBridge({
      ...selectedSnapshot(recent),
      updatePin: vi
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          error: { code: 'invalid_request', message: 'That action is not available.' },
        })
        .mockResolvedValueOnce({
          ok: false,
          error: { code: 'library_unavailable', message: "Couldn't open Thread Library" },
        }),
    })
    render(true)
    await vi.waitFor(() => expect(render().threadSummaries).toEqual([recent.summary]))

    await expect(
      render().updateThreadPin({
        threadId: recent.summary.id,
        action: 'pin',
        expectedPinPosition: null,
      }),
    ).resolves.toBe(false)
    expect(render().threadPinAction).toEqual({
      pending: false,
      error: { threadId: recent.summary.id, message: 'That action is not available.' },
    })
    expect(bridge.listPage).toHaveBeenCalledOnce()

    await expect(
      render().updateThreadPin({
        threadId: recent.summary.id,
        action: 'pin',
        expectedPinPosition: null,
      }),
    ).resolves.toBe(false)
    expect((harness.state as ChatState).hydrationError?.code).toBe('library_unavailable')
    expect(render().threadPinAction).toEqual(initialThreadPinActionState)
    expect(render().threadSummaries).toEqual([recent.summary])
  })

  it('starts replacement hydration from the response and coalesces the later epoch event', async () => {
    const recent = detail('', 'thread-a')
    const pinned = { ...recent, summary: { ...recent.summary, pinPosition: 1 } }
    const replacementPage = deferred<NyxThreadResult<NyxThreadListPage>>()
    let epoch = 'epoch-1'
    let listCalls = 0
    const bridge = installBridge({
      list: async () =>
        ++listCalls === 1 ? collectionPageResult([recent.summary], null) : replacementPage.promise,
      get: async () => ({
        ok: true,
        value: {
          detail: epoch === 'epoch-1' ? recent : pinned,
          eventEpoch: epoch,
          includedThroughCursor: 0,
        },
      }),
      updatePin: async () => {
        epoch = 'epoch-2'
        return {
          ok: true,
          value: { detail: pinned, eventEpoch: 'epoch-2', includedThroughCursor: 0 },
        }
      },
    })
    render(true)
    await vi.waitFor(() => expect(render().threadSummaries).toEqual([recent.summary]))

    await expect(
      render().updateThreadPin({
        threadId: recent.summary.id,
        action: 'pin',
        expectedPinPosition: null,
      }),
    ).resolves.toBe(true)
    expect(render().threadPinAction.pending).toBe(true)
    expect(bridge.listPage).toHaveBeenCalledTimes(2)

    bridge.emitThread({
      type: 'threads:epoch-changed',
      eventEpoch: 'epoch-2',
      includedThroughCursor: 0,
    })
    expect(bridge.listPage).toHaveBeenCalledTimes(2)
    replacementPage.resolve(
      collectionPageResult([pinned.summary], null, 0, { eventEpoch: 'epoch-2' }),
    )
    await vi.waitFor(() => expect(render().threadPinAction.pending).toBe(false))
    expect(render().threadSummaries).toEqual([pinned.summary])
    expect(bridge.listPage).toHaveBeenCalledTimes(2)
  })

  it('preserves a two-page budget when the replacement epoch event arrives first', async () => {
    const initialFirst = collectionRows(1, 50)
    const initialSecond = collectionRows(51, 50)
    const replacementFirst = collectionRows(1, 50)
    const replacementSecond = collectionRows(51, 50)
    const replacementSecondPage = deferred<NyxThreadResult<NyxThreadListPage>>()
    const update = deferred<NyxThreadResult<NyxThreadUpdatePinResult>>()
    let epoch = 'epoch-1'
    const bridge = installBridge({
      list: async ({ cursor }) => {
        if (epoch === 'epoch-1') {
          return cursor
            ? collectionPageResult(initialSecond, null)
            : collectionPageResult(initialFirst, 'initial-cursor')
        }
        return cursor
          ? replacementSecondPage.promise
          : collectionPageResult(replacementFirst, 'replacement-cursor', 0, {
              eventEpoch: 'epoch-2',
            })
      },
      get: async () => ({
        ok: true,
        value: {
          detail: detailForSummary(epoch === 'epoch-1' ? initialFirst[0]! : replacementFirst[0]!),
          eventEpoch: epoch,
          includedThroughCursor: 0,
        },
      }),
      updatePin: () => update.promise,
    })
    render(true)
    await vi.waitFor(() => expect(render().threadSummaries).toEqual(initialFirst))
    await expect(render().loadMoreThreads()).resolves.toBe(true)

    const updating = render().updateThreadPin({
      threadId: initialFirst[0]!.id,
      action: 'pin',
      expectedPinPosition: null,
    })
    epoch = 'epoch-2'
    bridge.emitThread({
      type: 'threads:epoch-changed',
      eventEpoch: 'epoch-2',
      includedThroughCursor: 0,
    })
    await vi.waitFor(() => expect(bridge.listPage).toHaveBeenCalledTimes(4))
    expect(render().threadCollection.loadedPageCount).toBe(2)
    expect(render().threadSummaries).toEqual([...initialFirst, ...initialSecond])
    expect(render().threadPinAction.pending).toBe(true)

    update.resolve({
      ok: false,
      error: { code: 'conflict', message: 'Thread changed. Try again.' },
    })
    await expect(updating).resolves.toBe(false)
    expect(render().threadPinAction).toEqual({ pending: true, error: null })
    expect(bridge.listPage).toHaveBeenCalledTimes(4)

    replacementSecondPage.resolve(
      collectionPageResult(replacementSecond, null, 0, { eventEpoch: 'epoch-2' }),
    )
    await vi.waitFor(() => expect(render().threadPinAction).toEqual(initialThreadPinActionState))
    expect(render().threadCollection.loadedPageCount).toBe(2)
    expect(render().threadSummaries).toEqual([...initialFirst, ...initialSecond])
    expect(bridge.listPage.mock.calls.map(([input]) => input.cursor ?? null)).toEqual([
      null,
      'initial-cursor',
      null,
      'replacement-cursor',
    ])
  })

  it('preserves a two-page budget when the replacement response arrives first', async () => {
    const initialFirst = collectionRows(1, 50)
    const initialSecond = collectionRows(51, 50)
    const replacementFirst = collectionRows(1, 50)
    const replacementSecond = collectionRows(51, 50)
    const replacementSecondPage = deferred<NyxThreadResult<NyxThreadListPage>>()
    let epoch = 'epoch-1'
    const bridge = installBridge({
      list: async ({ cursor }) => {
        if (epoch === 'epoch-1') {
          return cursor
            ? collectionPageResult(initialSecond, null)
            : collectionPageResult(initialFirst, 'initial-cursor')
        }
        return cursor
          ? replacementSecondPage.promise
          : collectionPageResult(replacementFirst, 'replacement-cursor', 0, {
              eventEpoch: 'epoch-2',
            })
      },
      get: async () => ({
        ok: true,
        value: {
          detail: detailForSummary(epoch === 'epoch-1' ? initialFirst[0]! : replacementFirst[0]!),
          eventEpoch: epoch,
          includedThroughCursor: 0,
        },
      }),
      updatePin: async () => {
        epoch = 'epoch-2'
        return {
          ok: false,
          error: { code: 'conflict', message: 'Thread changed. Try again.' },
        }
      },
    })
    render(true)
    await vi.waitFor(() => expect(render().threadSummaries).toEqual(initialFirst))
    await expect(render().loadMoreThreads()).resolves.toBe(true)

    await expect(
      render().updateThreadPin({
        threadId: initialFirst[0]!.id,
        action: 'pin',
        expectedPinPosition: null,
      }),
    ).resolves.toBe(false)
    await vi.waitFor(() => expect(bridge.listPage).toHaveBeenCalledTimes(4))
    bridge.emitThread({
      type: 'threads:epoch-changed',
      eventEpoch: 'epoch-2',
      includedThroughCursor: 0,
    })
    expect(render().threadCollection.loadedPageCount).toBe(2)
    expect(render().threadSummaries).toEqual([...initialFirst, ...initialSecond])
    expect(render().threadPinAction).toEqual({
      pending: true,
      error: { threadId: initialFirst[0]!.id, message: 'Thread changed. Try again.' },
    })
    expect(bridge.listPage).toHaveBeenCalledTimes(4)

    replacementSecondPage.resolve(
      collectionPageResult(replacementSecond, null, 0, { eventEpoch: 'epoch-2' }),
    )
    await vi.waitFor(() => expect(render().threadPinAction).toEqual(initialThreadPinActionState))
    expect(render().threadCollection.loadedPageCount).toBe(2)
    expect(render().threadSummaries).toEqual([...initialFirst, ...initialSecond])
    bridge.emitThread({
      type: 'threads:epoch-changed',
      eventEpoch: 'epoch-2',
      includedThroughCursor: 0,
    })
    expect(bridge.listPage.mock.calls.map(([input]) => input.cursor ?? null)).toEqual([
      null,
      'initial-cursor',
      null,
      'replacement-cursor',
    ])
  })

  it('does not write a late target error into a replacement projection', async () => {
    const recent = detail('', 'thread-a')
    const replacement = { ...recent, summary: { ...recent.summary, title: 'Replacement' } }
    const update = deferred<NyxThreadResult<NyxThreadUpdatePinResult>>()
    let epoch = 'epoch-1'
    const bridge = installBridge({
      list: async () =>
        collectionPageResult(
          [epoch === 'epoch-1' ? recent.summary : replacement.summary],
          null,
          0,
          {
            eventEpoch: epoch,
          },
        ),
      get: async () => ({
        ok: true,
        value: {
          detail: epoch === 'epoch-1' ? recent : replacement,
          eventEpoch: epoch,
          includedThroughCursor: 0,
        },
      }),
      updatePin: () => update.promise,
    })
    render(true)
    await vi.waitFor(() => expect(render().threadSummaries).toEqual([recent.summary]))

    const updating = render().updateThreadPin({
      threadId: recent.summary.id,
      action: 'pin',
      expectedPinPosition: null,
    })
    epoch = 'epoch-2'
    bridge.emitThread({
      type: 'threads:epoch-changed',
      eventEpoch: 'epoch-2',
      includedThroughCursor: 0,
    })
    await vi.waitFor(() => expect(render().threadSummaries).toEqual([replacement.summary]))
    expect(render().threadPinAction.pending).toBe(true)

    update.resolve({
      ok: false,
      error: { code: 'conflict', message: 'Stale error.' },
    })
    await expect(updating).resolves.toBe(false)
    expect(render().threadPinAction).toEqual(initialThreadPinActionState)
    expect(render().threadSummaries).toEqual([replacement.summary])
  })

  it('joins an in-flight replacement hydration when a target error arrives first', async () => {
    const recent = detail('', 'thread-a')
    const replacement = {
      ...recent,
      summary: { ...recent.summary, title: 'Replacement', pinPosition: 1 },
    }
    const update = deferred<NyxThreadResult<NyxThreadUpdatePinResult>>()
    const replacementDetail = deferred<
      NyxThreadResult<{
        detail: NyxThreadDetail | null
        eventEpoch: string
        includedThroughCursor: number
      }>
    >()
    let epoch = 'epoch-1'
    let getCalls = 0
    const bridge = installBridge({
      list: async () =>
        collectionPageResult(
          [epoch === 'epoch-1' ? recent.summary : replacement.summary],
          null,
          0,
          { eventEpoch: epoch },
        ),
      get: async () => {
        getCalls += 1
        return getCalls === 1
          ? {
              ok: true,
              value: { detail: recent, eventEpoch: 'epoch-1', includedThroughCursor: 0 },
            }
          : replacementDetail.promise
      },
      updatePin: () => update.promise,
    })
    render(true)
    await vi.waitFor(() => expect(render().threadSummaries).toEqual([recent.summary]))

    const updating = render().updateThreadPin({
      threadId: recent.summary.id,
      action: 'pin',
      expectedPinPosition: null,
    })
    epoch = 'epoch-2'
    bridge.emitThread({
      type: 'threads:epoch-changed',
      eventEpoch: 'epoch-2',
      includedThroughCursor: 0,
    })
    await vi.waitFor(() => expect(bridge.get).toHaveBeenCalledTimes(2))

    update.resolve({
      ok: false,
      error: { code: 'conflict', message: 'Stale error.' },
    })
    await expect(updating).resolves.toBe(false)
    expect(render().threadPinAction).toEqual({ pending: true, error: null })
    expect(render().threadSummaries).toEqual([recent.summary])
    expect(bridge.listPage).toHaveBeenCalledTimes(2)

    replacementDetail.resolve({
      ok: true,
      value: { detail: replacement, eventEpoch: 'epoch-2', includedThroughCursor: 0 },
    })
    await vi.waitFor(() => expect(render().threadPinAction).toEqual(initialThreadPinActionState))
    expect(render().threadSummaries).toEqual([replacement.summary])
    expect(bridge.listPage).toHaveBeenCalledTimes(2)
  })
})

describe('Rename Renderer controls', () => {
  it('shares the collection-action gate with Pin and waits for canonical refresh', async () => {
    const recent = detail('', 'thread-a')
    const renamed: NyxThreadDetail = {
      ...recent,
      summary: {
        ...recent.summary,
        title: 'Renamed thread',
        threadRevision: recent.summary.threadRevision + 1,
      },
    }
    const rename = deferred<NyxThreadResult<NyxThreadRenameResult>>()
    const refresh = deferred<NyxThreadResult<NyxThreadListPage>>()
    let listCalls = 0
    const bridge = installBridge({
      list: async () =>
        ++listCalls === 1 ? collectionPageResult([recent.summary], null) : refresh.promise,
      get: async () => ({
        ok: true,
        value: { detail: recent, eventEpoch: 'epoch-1', includedThroughCursor: 0 },
      }),
      rename: () => rename.promise,
    })
    render(true)
    await vi.waitFor(() => expect(render().threadSummaries).toEqual([recent.summary]))

    const renaming = render().renameThread({
      threadId: recent.summary.id,
      title: '  Renamed thread  ',
      expectedThreadRevision: recent.summary.threadRevision,
    })
    await vi.waitFor(() => expect(bridge.rename).toHaveBeenCalledOnce())
    expect(bridge.rename).toHaveBeenCalledWith({
      threadId: recent.summary.id,
      title: 'Renamed thread',
      expectedThreadRevision: recent.summary.threadRevision,
    })
    expect(render().threadPinAction.pending).toBe(true)
    expect(render().threadSummaries[0]?.title).toBe('Canonical title')

    await expect(
      render().updateThreadPin({
        threadId: recent.summary.id,
        action: 'pin',
        expectedPinPosition: null,
      }),
    ).resolves.toBe(false)
    expect(bridge.updatePin).not.toHaveBeenCalled()

    bridge.emitThread({
      type: 'threads:changed',
      detail: renamed,
      eventEpoch: 'epoch-1',
      includedThroughCursor: 1,
    })
    await vi.waitFor(() => expect(bridge.listPage).toHaveBeenCalledTimes(2))
    rename.resolve({
      ok: true,
      value: {
        detail: renamed,
        eventEpoch: 'epoch-1',
        includedThroughCursor: 1,
      },
    })
    await expect(renaming).resolves.toEqual({ ok: true })
    expect(render().threadPinAction.pending).toBe(true)
    expect(render().threadSummaries[0]?.title).toBe('Canonical title')

    refresh.resolve(collectionPageResult([renamed.summary], null, 1))
    await vi.waitFor(() => expect(render().threadPinAction.pending).toBe(false))
    expect(render().threadSummaries[0]?.title).toBe('Renamed thread')
  })

  it('rejects invalid titles before crossing the bridge', async () => {
    const recent = detail('', 'thread-a')
    const bridge = installBridge(selectedSnapshot(recent))
    render(true)
    await vi.waitFor(() => expect(render().threadSummaries).toEqual([recent.summary]))

    await expect(
      render().renameThread({
        threadId: recent.summary.id,
        title: '   ',
        expectedThreadRevision: recent.summary.threadRevision,
      }),
    ).resolves.toEqual({ ok: false, message: 'Enter a title.' })
    await expect(
      render().renameThread({
        threadId: recent.summary.id,
        title: '界'.repeat(49),
        expectedThreadRevision: recent.summary.threadRevision,
      }),
    ).resolves.toEqual({ ok: false, message: 'Use 48 characters or fewer.' })
    expect(bridge.rename).not.toHaveBeenCalled()
  })
})

describe('Archive and Unarchive Renderer controls', () => {
  it('flushes the selected Draft, holds the shared gate, and switches on canonical hydration', async () => {
    const available = detail('', 'thread-a')
    const archived = {
      ...available,
      summary: {
        ...available.summary,
        location: 'archived' as const,
        pinPosition: null,
        threadRevision: available.summary.threadRevision + 1,
      },
      draft: { ...available.draft, text: 'Edited draft', revision: available.draft.revision + 1 },
    }
    const moved = deferred<NyxThreadResult<NyxThreadUpdateLocationResult>>()
    let location: 'available' | 'archived' = 'available'
    let includedThroughCursor = 0
    let availableProjection = available
    const bridge = installBridge({
      list: async () =>
        collectionPageResult(
          [location === 'available' ? availableProjection.summary : archived.summary],
          null,
          includedThroughCursor,
        ),
      get: async () => ({
        ok: true,
        value: {
          detail: location === 'available' ? availableProjection : archived,
          eventEpoch: 'epoch-1',
          includedThroughCursor,
        },
      }),
      updateLocation: () => moved.promise,
    })
    render(true)
    await vi.waitFor(() => expect(render().threadSummaries).toEqual([available.summary]))
    await vi.waitFor(() => expect(render().state.selectedThreadId).toBe(available.summary.id))
    render().setInput('Edited draft')

    const archiving = render().updateThreadLocation({
      threadId: available.summary.id,
      action: 'archive',
      expectedThreadRevision: available.summary.threadRevision,
    })
    await vi.waitFor(() => expect(bridge.saveDraft).toHaveBeenCalledOnce())
    await vi.waitFor(() => expect(bridge.updateLocation).toHaveBeenCalledOnce())
    expect(bridge.saveDraft.mock.invocationCallOrder[0]).toBeLessThan(
      bridge.updateLocation.mock.invocationCallOrder[0]!,
    )
    expect(render().threadCollection.location).toBe('available')
    expect(render().threadPinAction.pending).toBe(true)

    location = 'archived'
    includedThroughCursor = 1
    moved.resolve({
      ok: true,
      value: {
        detail: archived,
        eventEpoch: 'epoch-1',
        includedThroughCursor: 1,
      },
    })
    await expect(archiving).resolves.toBe(true)
    await vi.waitFor(() => expect(render().threadCollection.location).toBe('archived'))
    await vi.waitFor(() => expect(render().threadPinAction.pending).toBe(false))
    expect(render().threadSummaries).toEqual([archived.summary])
    expect(render().state.threadSummary?.location).toBe('archived')
    expect(render().canSend).toBe(false)

    render().setInput('Ignored edit')
    expect(render().state.input).toBe('Edited draft')

    const restored = {
      ...archived,
      summary: {
        ...archived.summary,
        location: 'available' as const,
        threadRevision: archived.summary.threadRevision + 1,
      },
    }
    const restoredResult = deferred<NyxThreadResult<NyxThreadUpdateLocationResult>>()
    bridge.updateLocation.mockImplementationOnce(() => restoredResult.promise)
    const unarchiving = render().updateThreadLocation({
      threadId: archived.summary.id,
      action: 'unarchive',
      expectedThreadRevision: archived.summary.threadRevision,
    })
    await vi.waitFor(() => expect(bridge.updateLocation).toHaveBeenCalledTimes(2))
    await expect(render().startNewChat()).resolves.toBe(false)
    await expect(render().switchThreadCollectionLocation('available')).resolves.toBe(false)
    expect(render().state.selectedThreadId).toBe(archived.summary.id)
    location = 'available'
    includedThroughCursor = 2
    availableProjection = restored
    restoredResult.resolve({
      ok: true,
      value: {
        detail: restored,
        eventEpoch: 'epoch-1',
        includedThroughCursor: 2,
      },
    })
    await expect(unarchiving).resolves.toBe(true)
    await vi.waitFor(() => expect(render().threadPinAction.pending).toBe(false))
    expect(render().threadCollection.location).toBe('available')
    expect(render().state.threadSummary?.location).toBe('available')
    expect(bridge.saveDraft).toHaveBeenCalledOnce()
  })

  it('saves before selected Trash and restores to the canonical saved origin', async () => {
    const available = detail('', 'thread-trash')
    const trashed = {
      ...available,
      summary: {
        ...available.summary,
        location: 'trash' as const,
        pinPosition: null,
        threadRevision: available.summary.threadRevision + 1,
      },
      draft: {
        ...available.draft,
        text: 'Keep this draft',
        revision: available.draft.revision + 1,
      },
    }
    const restoredArchived = {
      ...trashed,
      summary: {
        ...trashed.summary,
        location: 'archived' as const,
        threadRevision: trashed.summary.threadRevision + 1,
      },
    }
    const moved = deferred<NyxThreadResult<NyxThreadUpdateLocationResult>>()
    const restored = deferred<NyxThreadResult<NyxThreadUpdateLocationResult>>()
    let location: 'available' | 'archived' | 'trash' = 'available'
    let includedThroughCursor = 0
    const projection = () =>
      location === 'available' ? available : location === 'trash' ? trashed : restoredArchived
    const bridge = installBridge({
      list: async () => collectionPageResult([projection().summary], null, includedThroughCursor),
      get: async () => ({
        ok: true,
        value: {
          detail: projection(),
          eventEpoch: 'epoch-1',
          includedThroughCursor,
        },
      }),
      updateLocation: vi
        .fn()
        .mockImplementationOnce(() => moved.promise)
        .mockImplementationOnce(() => restored.promise),
    })
    render(true)
    await vi.waitFor(() => expect(render().state.selectedThreadId).toBe(available.summary.id))
    render().setInput('Keep this draft')

    const trashing = render().updateThreadLocation({
      threadId: available.summary.id,
      action: 'trash',
      expectedThreadRevision: available.summary.threadRevision,
    })
    await vi.waitFor(() => expect(bridge.saveDraft).toHaveBeenCalledOnce())
    await vi.waitFor(() => expect(bridge.updateLocation).toHaveBeenCalledOnce())
    expect(bridge.saveDraft.mock.invocationCallOrder[0]).toBeLessThan(
      bridge.updateLocation.mock.invocationCallOrder[0]!,
    )
    location = 'trash'
    includedThroughCursor = 1
    moved.resolve({
      ok: true,
      value: {
        detail: trashed,
        eventEpoch: 'epoch-1',
        includedThroughCursor,
      },
    })
    await expect(trashing).resolves.toBe(true)
    await vi.waitFor(() => expect(render().threadCollection.location).toBe('trash'))
    await vi.waitFor(() => expect(render().threadPinAction.pending).toBe(false))
    expect(render().state.threadSummary?.location).toBe('trash')
    expect(render().canSend).toBe(false)
    render().setInput('Ignored in Trash')
    expect(render().state.input).toBe('Keep this draft')
    expect(render().state.selectedThreadId).toBe(trashed.summary.id)
    expect(render().state.saveStatus).toBe('idle')
    expect(render().threadSummaries[0]).toMatchObject({
      id: trashed.summary.id,
      location: 'trash',
      threadRevision: trashed.summary.threadRevision,
    })
    const restoring = render().updateThreadLocation({
      threadId: trashed.summary.id,
      action: 'restore',
      expectedThreadRevision: trashed.summary.threadRevision,
    })
    await vi.waitFor(() => expect(bridge.updateLocation).toHaveBeenCalledTimes(2))
    location = 'archived'
    includedThroughCursor = 2
    restored.resolve({
      ok: true,
      value: {
        detail: restoredArchived,
        eventEpoch: 'epoch-1',
        includedThroughCursor,
      },
    })
    await expect(restoring).resolves.toBe(true)
    await vi.waitFor(() => expect(render().threadCollection.location).toBe('archived'))
    expect(render().state.threadSummary?.location).toBe('archived')
    expect(bridge.saveDraft).toHaveBeenCalledOnce()
  })

  it('switches between Available and Archived with the existing bounded collection reader', async () => {
    const available = detail('', 'thread-a')
    const archivedSummary = {
      ...detail('', 'thread-b').summary,
      location: 'archived' as const,
      pinPosition: null,
    }
    const archived = detailForSummary(archivedSummary)
    const bridge = installBridge({
      list: async (input) =>
        collectionPageResult(
          [input.location === 'available' ? available.summary : archived.summary],
          null,
        ),
      get: async ({ threadId }) => ({
        ok: true,
        value: {
          detail:
            threadId === available.summary.id
              ? available
              : threadId === archived.summary.id
                ? archived
                : null,
          eventEpoch: 'epoch-1',
          includedThroughCursor: 0,
        },
      }),
    })
    render(true)
    await vi.waitFor(() => expect(render().state.selectedThreadId).toBe(available.summary.id))

    await expect(render().switchThreadCollectionLocation('archived')).resolves.toBe(true)
    await vi.waitFor(() => expect(render().state.selectedThreadId).toBe(archived.summary.id))
    expect(render().threadCollection.location).toBe('archived')
    expect(render().threadSummaries).toEqual([archived.summary])

    await expect(render().switchThreadCollectionLocation('available')).resolves.toBe(true)
    await vi.waitFor(() => expect(render().state.selectedThreadId).toBe(available.summary.id))
    expect(render().threadCollection.location).toBe('available')
    expect(bridge.listPage.mock.calls.map(([input]) => input.location)).toEqual([
      'available',
      'archived',
      'available',
    ])
  })

  it.each(['archived', 'trash'] as const)(
    'keeps an empty %s collection read-only through direct Renderer actions',
    async (location) => {
      const bridge = installBridge({
        list: async () => collectionPageResult([], null),
      })
      render(true)
      await vi.waitFor(() => expect(render().state.hydrationStatus).toBe('ready'))

      await expect(render().switchThreadCollectionLocation(location)).resolves.toBe(true)
      expect(render().threadCollection.location).toBe(location)
      expect(render().state.selectedThreadId).toBeNull()
      expect(render().canSend).toBe(false)
      expect(render().canStartRun).toBe(false)

      render().setInput('Blocked edit')
      render().addDraftImages([new Blob(['image'])])
      await render().sendCurrentInput()
      await render().retryMessage('assistant')
      await expect(render().startNewChat()).resolves.toBe(false)

      expect(render().state.input).toBe('')
      expect(render().state.draftImages).toEqual([])
      expect(bridge.materialize).not.toHaveBeenCalled()
      expect(bridge.saveDraft).not.toHaveBeenCalled()
      expect(bridge.start).not.toHaveBeenCalled()
    },
  )

  it('holds navigation while moving an unselected row and preserves the selected dirty overlay', async () => {
    const selected = detail('', 'thread-a')
    const targetThread = detail('', 'thread-b')
    const archivedTarget = {
      ...targetThread,
      summary: {
        ...targetThread.summary,
        location: 'archived' as const,
        threadRevision: targetThread.summary.threadRevision + 1,
      },
    }
    const moved = deferred<NyxThreadResult<NyxThreadUpdateLocationResult>>()
    let committed = false
    const bridge = installBridge({
      selectedId: selected.summary.id,
      list: async () =>
        collectionPageResult(
          committed ? [selected.summary] : [selected.summary, targetThread.summary],
          null,
          0,
        ),
      get: async ({ threadId }) => ({
        ok: true,
        value: {
          detail:
            threadId === selected.summary.id
              ? selected
              : threadId === targetThread.summary.id
                ? targetThread
                : null,
          eventEpoch: 'epoch-1',
          includedThroughCursor: 0,
        },
      }),
      updateLocation: () => moved.promise,
    })
    render(true)
    await vi.waitFor(() => expect(render().state.selectedThreadId).toBe(selected.summary.id))
    render().setInput('Unsaved selected draft')

    const archiving = render().updateThreadLocation({
      threadId: targetThread.summary.id,
      action: 'archive',
      expectedThreadRevision: targetThread.summary.threadRevision,
    })
    await vi.waitFor(() => expect(bridge.updateLocation).toHaveBeenCalledOnce())

    await expect(render().selectThread(targetThread.summary.id)).resolves.toBe(false)
    await expect(render().startNewChat()).resolves.toBe(false)
    await expect(render().switchThreadCollectionLocation('archived')).resolves.toBe(false)
    render().setInput('Blocked while moving')
    expect(render().state.selectedThreadId).toBe(selected.summary.id)
    expect(render().state.input).toBe('Unsaved selected draft')
    expect(bridge.saveDraft).not.toHaveBeenCalled()

    committed = true
    moved.resolve({
      ok: true,
      value: {
        detail: archivedTarget,
        eventEpoch: 'epoch-1',
        includedThroughCursor: 0,
      },
    })
    await expect(archiving).resolves.toBe(true)
    await vi.waitFor(() => expect(render().threadPinAction.pending).toBe(false))
    expect(render().threadCollection.location).toBe('available')
    expect(render().threadSummaries).toEqual([selected.summary])
    expect(render().state.selectedThreadId).toBe(selected.summary.id)
    expect(render().state.input).toBe('Unsaved selected draft')
  })

  it('preserves a dirty New placeholder through unselected move epoch replacement', async () => {
    const previous = detail('', 'thread-a')
    previous.messages = [
      { id: 'assistant-a', role: 'assistant', content: 'Done', status: 'completed' },
    ]
    const targetThread = detail('', 'thread-b')
    const archivedTarget = {
      ...targetThread,
      summary: {
        ...targetThread.summary,
        location: 'archived' as const,
        threadRevision: targetThread.summary.threadRevision + 1,
      },
    }
    let replacement = false
    const bridge = installBridge({
      selectedId: previous.summary.id,
      list: async () =>
        collectionPageResult(
          replacement ? [previous.summary] : [previous.summary, targetThread.summary],
          null,
          0,
          { eventEpoch: replacement ? 'epoch-2' : 'epoch-1' },
        ),
      get: async ({ threadId }) => ({
        ok: true,
        value: {
          detail: threadId === previous.summary.id ? previous : null,
          eventEpoch: 'epoch-1',
          includedThroughCursor: 0,
        },
      }),
      updateLocation: async () => {
        replacement = true
        return {
          ok: true,
          value: {
            detail: archivedTarget,
            eventEpoch: 'epoch-2',
            includedThroughCursor: 0,
          },
        }
      },
    })
    render(true)
    await vi.waitFor(() => expect(render().state.selectedThreadId).toBe(previous.summary.id))
    await expect(render().startNewChat()).resolves.toBe(true)
    render().setInput('Unmaterialized draft')
    expect(render().state.selectedThreadId).toBeNull()

    await expect(
      render().updateThreadLocation({
        threadId: targetThread.summary.id,
        action: 'archive',
        expectedThreadRevision: targetThread.summary.threadRevision,
      }),
    ).resolves.toBe(true)

    await vi.waitFor(() => expect(render().threadPinAction.pending).toBe(false))
    expect(render().threadCollection.location).toBe('available')
    expect(render().threadSummaries).toEqual([previous.summary])
    expect(render().state.selectedThreadId).toBeNull()
    expect(render().state.threadSummary).toBeNull()
    expect(render().state.input).toBe('Unmaterialized draft')
    expect(render().state.eventEpoch).toBe('epoch-2')
    expect(bridge.get).toHaveBeenCalledTimes(2)
    expect(bridge.materialize).not.toHaveBeenCalled()
  })

  it.each(['archive', 'trash'] as const)(
    'does not autosave a dirty New draft while an unselected %s holds navigation',
    async (locationAction) => {
      vi.useFakeTimers()
      const previous = detail('', 'thread-a')
      const targetThread = detail('', 'thread-b')
      const materializedDraft = detail('Unmaterialized draft', 'thread-new')
      const movedTarget = {
        ...targetThread,
        summary: {
          ...targetThread.summary,
          location: locationAction === 'archive' ? ('archived' as const) : ('trash' as const),
          threadRevision: targetThread.summary.threadRevision + 1,
        },
      }
      const moved = deferred<NyxThreadResult<NyxThreadUpdateLocationResult>>()
      let replacement = false
      const bridge = installBridge({
        selectedId: previous.summary.id,
        list: async () =>
          collectionPageResult(
            replacement ? [previous.summary] : [previous.summary, targetThread.summary],
            null,
            0,
            { eventEpoch: replacement ? 'epoch-2' : 'epoch-1' },
          ),
        get: async ({ threadId }) => ({
          ok: true,
          value: {
            detail: threadId === previous.summary.id ? previous : null,
            eventEpoch: replacement ? 'epoch-2' : 'epoch-1',
            includedThroughCursor: 0,
          },
        }),
        materializeResult: {
          ok: true,
          value: {
            detail: materializedDraft,
            eventEpoch: 'epoch-3',
            includedThroughCursor: 1,
          },
        },
        updateLocation: () => moved.promise,
      })
      render(true)
      await vi.waitFor(() => expect(render().state.selectedThreadId).toBe(previous.summary.id))
      await expect(render().startNewChat()).resolves.toBe(true)
      render(false, { connectionStatus: { ...readyStatus(), requestEpoch: 2 } })
      runTargetCatalogEffect()
      render().setInput('Unmaterialized draft')
      render()
      runAutosaveEffect()

      const moving = render().updateThreadLocation({
        threadId: targetThread.summary.id,
        action: locationAction,
        expectedThreadRevision: targetThread.summary.threadRevision,
      })
      await vi.waitFor(() => expect(bridge.updateLocation).toHaveBeenCalledOnce())
      await vi.advanceTimersByTimeAsync(250)

      expect(bridge.materialize).not.toHaveBeenCalled()
      expect(render().state.selectedThreadId).toBeNull()
      expect(render().state.input).toBe('Unmaterialized draft')

      replacement = true
      moved.resolve({
        ok: true,
        value: {
          detail: movedTarget,
          eventEpoch: 'epoch-2',
          includedThroughCursor: 0,
        },
      })
      await expect(moving).resolves.toBe(true)
      await vi.waitFor(() => expect(render().threadPinAction.pending).toBe(false))
      expect(render().state.selectedThreadId).toBeNull()
      expect(render().state.input).toBe('Unmaterialized draft')

      render()
      runAutosaveEffect()
      await vi.advanceTimersByTimeAsync(250)
      await vi.waitFor(() =>
        expect(render().state.selectedThreadId).toBe(materializedDraft.summary.id),
      )
      expect(render().state.input).toBe('Unmaterialized draft')
    },
  )

  it('does not dispatch a location move while New Draft materialization is in flight', async () => {
    vi.useFakeTimers()
    const previous = detail('', 'thread-a')
    const targetThread = detail('', 'thread-b')
    const materializedDraft = detail('Unmaterialized draft', 'thread-new')
    const pendingMaterialize = deferred<NyxThreadResult<NyxThreadMaterializeResult>>()
    const bridge = installBridge({
      selectedId: previous.summary.id,
      list: async () => collectionPageResult([previous.summary, targetThread.summary], null),
      get: async ({ threadId }) => ({
        ok: true,
        value: {
          detail: threadId === previous.summary.id ? previous : null,
          eventEpoch: 'epoch-1',
          includedThroughCursor: 0,
        },
      }),
    })
    bridge.materialize.mockImplementationOnce(() => pendingMaterialize.promise)
    render(true)
    await vi.waitFor(() => expect(render().state.selectedThreadId).toBe(previous.summary.id))
    await expect(render().startNewChat()).resolves.toBe(true)
    render(false, { connectionStatus: { ...readyStatus(), requestEpoch: 2 } })
    runTargetCatalogEffect()
    render().setInput('Unmaterialized draft')
    render()
    runAutosaveEffect()
    await vi.advanceTimersByTimeAsync(250)
    await vi.waitFor(() => expect(bridge.materialize).toHaveBeenCalledOnce())

    await expect(
      render().updateThreadLocation({
        threadId: targetThread.summary.id,
        action: 'archive',
        expectedThreadRevision: targetThread.summary.threadRevision,
      }),
    ).resolves.toBe(false)
    expect(bridge.updateLocation).not.toHaveBeenCalled()

    pendingMaterialize.resolve({
      ok: true,
      value: {
        detail: materializedDraft,
        eventEpoch: 'epoch-2',
        includedThroughCursor: 1,
      },
    })
    await vi.waitFor(() => expect(render().state.selectedThreadId).toBe('thread-new'))
    expect(render().state.input).toBe('Unmaterialized draft')
  })

  it('blocks Archive for a running row before crossing the bridge', async () => {
    const running = detail('', 'thread-a')
    const runningSummary = {
      ...running.summary,
      activity: {
        status: 'streaming' as const,
        requestId: 'request-running',
        attachmentBearing: false,
      },
    }
    const bridge = installBridge({
      list: async () => collectionPageResult([runningSummary], null),
      get: async () => ({
        ok: true,
        value: { detail: running, eventEpoch: 'epoch-1', includedThroughCursor: 0 },
      }),
    })
    render(true)
    await vi.waitFor(() => expect(render().threadSummaries).toEqual([runningSummary]))

    await expect(
      render().updateThreadLocation({
        threadId: running.summary.id,
        action: 'archive',
        expectedThreadRevision: running.summary.threadRevision,
      }),
    ).resolves.toBe(false)
    expect(bridge.updateLocation).not.toHaveBeenCalled()
  })
})

describe('target and attachment readiness', () => {
  it('blocks the third Run and only serializes attachment-bearing Runs', () => {
    const textState = readyThreadState(detail('Hello'))

    expect(runCapacityBlock(textState, { activeRuns: 1, attachmentRunActive: true })).toBeNull()
    expect(runCapacityBlock(textState, { activeRuns: 2, attachmentRunActive: true })).toBe(
      'Two responses are already running.',
    )
    expect(
      runCapacityBlock(
        {
          ...textState,
          draftImages: [
            { id: 'image', name: 'image.png', status: 'preparing', source: new Blob() },
          ],
        },
        { activeRuns: 1, attachmentRunActive: true },
      ),
    ).toBe('Another attachment response is already running.')

    expect(
      runCapacityBlock(
        {
          ...textState,
          draftImages: [
            { id: 'image', name: 'image.png', status: 'preparing', source: new Blob() },
          ],
        },
        { activeRuns: 1, attachmentRunActive: true },
        'retry_failed_response',
      ),
    ).toBeNull()
  })

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
  it('shares one delayed draft save between Send and immediate Thread selection', async () => {
    const threadA = detail('draft A', 'thread-a')
    const threadB = detail('draft B', 'thread-b')
    const pageRows = [threadA.summary, threadB.summary, ...collectionRows(3, 48)]
    const latePage = deferred<NyxThreadResult<NyxThreadListPage>>()
    const pendingSave = deferred<NyxThreadResult<NyxThreadSaveDraftResult>>()
    const bridge = installBridge({
      selectedId: 'thread-a',
      list: async ({ cursor }) =>
        cursor ? latePage.promise : collectionPageResult(pageRows, 'cursor-1'),
      get: async ({ threadId }) => ({
        ok: true,
        value: {
          detail: threadId === 'thread-b' ? threadB : threadA,
          eventEpoch: 'epoch-1',
          includedThroughCursor: 0,
        },
      }),
    })
    bridge.saveDraft.mockImplementationOnce(() => pendingSave.promise)
    await settleSelectedHydration(bridge, threadA)
    render().setInput('edited A')

    const send = render().sendCurrentInput()
    await vi.waitFor(() => expect(bridge.saveDraft).toHaveBeenCalledOnce())
    const loadingMore = render().loadMoreThreads()
    await vi.waitFor(() => expect(bridge.listPage).toHaveBeenCalledTimes(2))
    const selection = render().selectThread('thread-b')
    latePage.resolve(collectionPageResult(collectionRows(51, 50), null))
    await expect(loadingMore).resolves.toBe(false)
    expect(render().threadSummaries).toEqual(pageRows)
    const savedDetail = detail('edited A', 'thread-a')
    savedDetail.draft.revision = 3
    pendingSave.resolve({
      ok: true,
      value: {
        detail: savedDetail,
        discarded: false,
        eventEpoch: 'epoch-1',
        includedThroughCursor: 1,
      },
    })

    await send
    expect(await selection).toBe(true)
    expect(bridge.saveDraft).toHaveBeenCalledOnce()
    expect(bridge.start).toHaveBeenCalledOnce()
    expect(bridge.cancel).not.toHaveBeenCalled()
    expect((harness.state as ChatState).selectedThreadId).toBe('thread-b')
  })

  it('shares one delayed draft save between Send and immediate New', async () => {
    const threadA = detail('draft A', 'thread-a')
    const pendingSave = deferred<NyxThreadResult<NyxThreadSaveDraftResult>>()
    const bridge = installBridge({
      selectedId: 'thread-a',
      ...selectedSnapshot(threadA),
      get: async ({ threadId }) => ({
        ok: true,
        value: {
          detail: threadId ? threadA : null,
          eventEpoch: 'epoch-1',
          includedThroughCursor: 0,
        },
      }),
    })
    bridge.saveDraft.mockImplementationOnce(() => pendingSave.promise)
    await settleSelectedHydration(bridge, threadA)
    render().setInput('edited A')

    const send = render().sendCurrentInput()
    await vi.waitFor(() => expect(bridge.saveDraft).toHaveBeenCalledOnce())
    const newThread = render().startNewChat()
    const savedDetail = detail('edited A', 'thread-a')
    savedDetail.draft.revision = 3
    pendingSave.resolve({
      ok: true,
      value: {
        detail: savedDetail,
        discarded: false,
        eventEpoch: 'epoch-1',
        includedThroughCursor: 1,
      },
    })

    await send
    expect(await newThread).toBe(true)
    expect(bridge.saveDraft).toHaveBeenCalledOnce()
    expect(bridge.start).toHaveBeenCalledOnce()
    expect(bridge.cancel).not.toHaveBeenCalled()
    expect((harness.state as ChatState).selectedThreadId).toBeNull()
  })

  it('starts an autosaved Draft without writing it again', async () => {
    const value = detail('already saved')
    const bridge = installBridge(selectedSnapshot(value))
    const session = await settleSelectedHydration(bridge, value)

    await session.sendCurrentInput()

    expect(bridge.saveDraft).not.toHaveBeenCalled()
    expect(bridge.start).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: 'thread-a',
        expectedDraftRevision: value.draft.revision,
      }),
    )
  })

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
      attachmentBearing: false,
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

  it.each(['archived', 'trash'] as const)(
    'rejects a direct Retry for a selected %s Thread',
    async (location) => {
      const value = detail()
      value.summary = { ...value.summary, location }
      value.messages = [
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
      reset(readyThreadState(value))
      const bridge = installBridge()

      await render().retryMessage('assistant-1')

      expect(bridge.start).not.toHaveBeenCalled()
      expect(bridge.retrySettlement).not.toHaveBeenCalled()
    },
  )

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

      if (failureBoundary === 'save') render().setInput('keep me edited')

      expect(await render().startNewChat()).toBe(false)
      expect(harness.state).toMatchObject({
        selectedThreadId: 'thread-a',
        input: failureBoundary === 'save' ? 'keep me edited' : 'keep me',
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
    const firstRows = [value.summary, ...collectionRows(2, 49)]
    const secondRows = collectionRows(51, 10)
    const bridge = installBridge({
      ...selectedSnapshot(value),
      list: async ({ cursor }) =>
        collectionPageResult(cursor ? secondRows : firstRows, cursor ? null : 'cursor-1'),
      saveDraftResult: {
        ok: false,
        error: { code: 'conflict', message: 'Not saved.' },
      },
    })
    const session = await settleSelectedHydration(bridge, value)
    await session.loadMoreThreads()
    session.setInput('keep me edited')

    expect(await render().startNewChat()).toBe(false)
    expect(harness.state).toMatchObject({ selectedThreadId: 'thread-a', input: 'keep me edited' })
    expect(render().threadSummaries).toEqual([...firstRows, ...secondRows])
    expect(bridge.listPage.mock.calls.map(([input]) => input.cursor ?? null)).toEqual([
      null,
      'cursor-1',
      null,
      'cursor-1',
    ])
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
    const firstRows = [detail().summary, ...collectionRows(2, 49)]
    const refreshedRows = collectionRows(2, 49)
    const latePage = deferred<NyxThreadResult<NyxThreadListPage>>()
    let firstPageReads = 0
    const cleared = deferred<
      NyxThreadResult<{
        detail: NyxThreadDetail | null
        eventEpoch: string
        includedThroughCursor: number
      }>
    >()
    const bridge = installBridge({
      ...selectedSnapshot(detail()),
      list: ({ cursor }) => {
        if (cursor) return latePage.promise
        firstPageReads += 1
        return Promise.resolve(
          firstPageReads === 1
            ? collectionPageResult(firstRows, 'cursor-1')
            : collectionPageResult(refreshedRows, null, 1),
        )
      },
    })
    const session = await settleSelectedHydration(bridge, detail())
    const loadingMore = session.loadMoreThreads()
    await vi.waitFor(() => expect(bridge.listPage).toHaveBeenCalledTimes(2))
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
    latePage.resolve(collectionPageResult(collectionRows(51, 50), null, 1))
    await expect(loadingMore).resolves.toBe(false)
    await vi.waitFor(() => expect(render().threadSummaries).toEqual(refreshedRows))
    expect((harness.state as ChatState).newThreadPending).toBe(true)
    cleared.resolve({
      ok: true,
      value: { detail: null, eventEpoch: 'epoch-1', includedThroughCursor: 1 },
    })

    expect(await newThread).toBe(true)
    expect((harness.state as ChatState).input).toBe('')
    expect(bridge.listPage.mock.calls.map(([input]) => input.cursor ?? null)).toEqual([
      null,
      'cursor-1',
      null,
    ])
  })

  it('keeps a background save failure reachable after New detaches', async () => {
    const value = detail()
    value.settlementFailure = { requestId: 'request-1', assistantMessageId: 'assistant-1' }
    value.summary.activity = { status: 'saving_failed', requestId: 'request-1' }
    const bridge = installBridge(selectedSnapshot(value))
    const session = await settleSelectedHydration(bridge, value)

    expect(await session.startNewChat()).toBe(true)
    expect(bridge.get).toHaveBeenLastCalledWith({ threadId: null })
    expect((harness.state as ChatState).selectedThreadId).toBeNull()
    expect(render().threadSummaries).toMatchObject([
      { id: 'thread-a', activity: { status: 'saving_failed', requestId: 'request-1' } },
    ])
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

  it('detaches New without cancelling an active Run', async () => {
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
      attachmentBearing: false,
      eventEpoch: 'epoch-1',
      cursor: 1,
    })
    expect(await render().startNewChat()).toBe(true)
    expect(bridge.cancel).not.toHaveBeenCalled()
    expect(bridge.saveDraft).not.toHaveBeenCalled()
    expect((harness.state as ChatState).selectedThreadId).toBeNull()
    expect(render().threadSummaries).toMatchObject([
      {
        id: 'thread-a',
      },
    ])
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
