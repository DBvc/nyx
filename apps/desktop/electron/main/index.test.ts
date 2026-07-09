import type { WebContents } from 'electron'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { NYX_CHAT_IPC_CHANNELS } from '../../shared/chat/ipc'
import { NYX_CONNECTIONS_IPC_CHANNELS } from '../../shared/connections/ipc'
import type { NyxConnectionsOverviewResult } from '../../shared/connections/types'

type RegisteredIpcHandler = (event: { sender: WebContents }, request?: unknown) => unknown

const electronMock = vi.hoisted(() => {
  const handlers = new Map<string, RegisteredIpcHandler>()

  return {
    handlers,
    app: {
      getPath: vi.fn(() => '/tmp/nyx-test-user-data'),
      whenReady: vi.fn(() => new Promise<void>(() => {})),
      on: vi.fn(),
      quit: vi.fn(),
    },
    BrowserWindow: vi.fn(),
    ipcMain: {
      removeHandler: vi.fn((channel: string) => {
        handlers.delete(channel)
      }),
      handle: vi.fn((channel: string, handler: RegisteredIpcHandler) => {
        handlers.set(channel, handler)
      }),
    },
    safeStorage: {
      isEncryptionAvailable: vi.fn(() => true),
      encryptString: vi.fn((value: string) => Buffer.from(value)),
      decryptString: vi.fn((value: Buffer) => value.toString('utf8')),
    },
  }
})

vi.mock('electron', () => ({
  app: electronMock.app,
  BrowserWindow: electronMock.BrowserWindow,
  ipcMain: electronMock.ipcMain,
  safeStorage: electronMock.safeStorage,
}))

import { registerIpcHandlers, resolveDevServerUrl } from './index'

const appGetPathCallCountAfterImport = electronMock.app.getPath.mock.calls.length
const safeStorageAvailabilityCallCountAfterImport =
  electronMock.safeStorage.isEncryptionAvailable.mock.calls.length

function registeredHandler(channel: string) {
  const handler = electronMock.handlers.get(channel)

  if (!handler) {
    throw new Error(`Expected handler for ${channel}`)
  }

  return handler
}

describe('resolveDevServerUrl', () => {
  it('uses the electron-vite renderer URL in dev', () => {
    expect(
      resolveDevServerUrl({
        ELECTRON_RENDERER_URL: 'http://127.0.0.1:5173/',
        VITE_DEV_SERVER_URL: 'http://127.0.0.1:3000/',
      }),
    ).toBe('http://127.0.0.1:5173/')
  })

  it('keeps the legacy VITE dev server URL as a fallback', () => {
    expect(
      resolveDevServerUrl({
        VITE_DEV_SERVER_URL: 'http://127.0.0.1:3000/',
      }),
    ).toBe('http://127.0.0.1:3000/')
  })
})

describe('registerIpcHandlers', () => {
  beforeEach(() => {
    electronMock.handlers.clear()
    vi.clearAllMocks()
  })

  it('returns the async reset promise to ipcRenderer.invoke callers', () => {
    const sender = {} as WebContents
    const resetPromise = Promise.resolve()
    const chatSessionManager = {
      start: vi.fn(),
      cancel: vi.fn(),
      reset: vi.fn(() => resetPromise),
    }

    registerIpcHandlers({ chatSessionManager })

    const result = registeredHandler(NYX_CHAT_IPC_CHANNELS.reset)({ sender })

    expect(chatSessionManager.reset).toHaveBeenCalledWith(sender)
    expect(result).toBe(resetPromise)
  })

  it('returns connection IPC handler promises to ipcRenderer.invoke callers', () => {
    const overviewResult: NyxConnectionsOverviewResult = {
      ok: true,
      value: {
        providers: [],
        defaultTarget: null,
        defaultTargetSource: 'missing',
      },
    }
    const overviewPromise = Promise.resolve(overviewResult)
    const connections = {
      overview: vi.fn(() => overviewPromise),
      listProviders: vi.fn(),
      getProvider: vi.fn(),
      saveProvider: vi.fn(),
      deleteProvider: vi.fn(),
      setDefaultTarget: vi.fn(),
      testProvider: vi.fn(),
      refreshModels: vi.fn(),
    }

    registerIpcHandlers({
      chatSessionManager: {
        start: vi.fn(),
        cancel: vi.fn(),
        reset: vi.fn(),
      },
      connections,
    })

    const result = registeredHandler(NYX_CONNECTIONS_IPC_CHANNELS.overview)({
      sender: {} as WebContents,
    })

    expect(connections.overview).toHaveBeenCalledTimes(1)
    expect(result).toBe(overviewPromise)
  })

  it('does not touch connection storage while registering injected IPC handlers', () => {
    const chatSessionManager = {
      start: vi.fn(),
      cancel: vi.fn(),
      reset: vi.fn(),
    }
    const connections = {
      overview: vi.fn(),
      listProviders: vi.fn(),
      getProvider: vi.fn(),
      saveProvider: vi.fn(),
      deleteProvider: vi.fn(),
      setDefaultTarget: vi.fn(),
      testProvider: vi.fn(),
      refreshModels: vi.fn(),
    }

    registerIpcHandlers({ chatSessionManager, connections })

    expect(appGetPathCallCountAfterImport).toBe(0)
    expect(safeStorageAvailabilityCallCountAfterImport).toBe(0)
    expect(electronMock.app.getPath).not.toHaveBeenCalled()
    expect(electronMock.safeStorage.isEncryptionAvailable).not.toHaveBeenCalled()
  })
})
