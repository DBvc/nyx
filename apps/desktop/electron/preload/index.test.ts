import { beforeEach, describe, expect, it, vi } from 'vitest'

const electron = vi.hoisted(() => ({
  exposeInMainWorld: vi.fn(),
  invoke: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn(),
}))

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: electron.exposeInMainWorld },
  ipcRenderer: {
    invoke: electron.invoke,
    on: electron.on,
    removeListener: electron.removeListener,
  },
}))

describe('preload Thread Library bridge', () => {
  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    Object.defineProperty(process, 'contextIsolated', { configurable: true, value: true })
    await import('./index')
  })

  it('exposes only the C1 Thread and chat methods', () => {
    const api = electron.exposeInMainWorld.mock.calls[0]?.[1]

    expect(Object.keys(api.chat).sort()).toEqual([
      'cancel',
      'retrySettlement',
      'start',
      'subscribe',
    ])
    expect(Object.keys(api.threads).sort()).toEqual([
      'get',
      'listPage',
      'markSeen',
      'materialize',
      'rename',
      'retryOpen',
      'saveDraft',
      'subscribe',
      'updatePin',
    ])
  })

  it('uses the narrow Thread channels and removes its listener', () => {
    const api = electron.exposeInMainWorld.mock.calls[0]?.[1]
    const listener = vi.fn()
    const unsubscribe = api.threads.subscribe(listener)
    const subscription = electron.on.mock.calls[0]?.[1]
    const event = {
      type: 'threads:removed',
      threadId: '018f4f34-b147-7a30-8f40-e9bd067c80aa',
      eventEpoch: 'epoch',
      includedThroughCursor: 1,
    }

    subscription({}, event)
    expect(listener).toHaveBeenCalledWith(event)

    api.threads.get({ threadId: event.threadId })
    expect(electron.invoke).toHaveBeenCalledWith('nyx:threads:get', {
      threadId: event.threadId,
    })

    api.threads.updatePin({
      threadId: event.threadId,
      action: 'pin',
      expectedPinPosition: null,
    })
    expect(electron.invoke).toHaveBeenCalledWith('nyx:threads:update-pin', {
      threadId: event.threadId,
      action: 'pin',
      expectedPinPosition: null,
    })

    api.threads.rename({
      threadId: event.threadId,
      title: 'Renamed thread',
      expectedThreadRevision: 1,
    })
    expect(electron.invoke).toHaveBeenCalledWith('nyx:threads:rename', {
      threadId: event.threadId,
      title: 'Renamed thread',
      expectedThreadRevision: 1,
    })

    unsubscribe()
    expect(electron.removeListener).toHaveBeenCalledWith('nyx:threads:event', subscription)
  })
})
