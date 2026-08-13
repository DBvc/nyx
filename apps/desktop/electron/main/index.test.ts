import type { Session, WebContents, WebFrameMain } from 'electron'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { NYX_CHAT_IPC_CHANNELS } from '../../shared/chat/ipc'
import { NYX_CONNECTIONS_IPC_CHANNELS } from '../../shared/connections/ipc'
import type { NyxConnectionsOverviewResult } from '../../shared/connections/types'

type RegisteredIpcHandler = (
  event: { sender: WebContents; senderFrame?: WebFrameMain | null },
  request?: unknown,
) => unknown

const electronMock = vi.hoisted(() => {
  const handlers = new Map<string, RegisteredIpcHandler>()
  const BrowserWindow = Object.assign(vi.fn(), {
    getAllWindows: vi.fn<() => Array<Record<string, unknown>>>(() => []),
  })

  return {
    handlers,
    app: {
      getPath: vi.fn(() => '/tmp/nyx-test-user-data'),
      whenReady: vi.fn(() => new Promise<void>(() => {})),
      on: vi.fn(),
      quit: vi.fn(),
      requestSingleInstanceLock: vi.fn(() => true),
    },
    BrowserWindow,
    clipboard: {
      writeText: vi.fn(),
    },
    dialog: {
      showMessageBox: vi.fn(async () => ({ response: 1 })),
    },
    ipcMain: {
      removeHandler: vi.fn((channel: string) => {
        handlers.delete(channel)
      }),
      handle: vi.fn((channel: string, handler: RegisteredIpcHandler) => {
        handlers.set(channel, handler)
      }),
    },
    nativeTheme: {
      themeSource: 'system',
    },
    nativeImage: {
      createFromBuffer: vi.fn(),
    },
    net: {
      fetch: vi.fn(),
    },
    protocol: {
      registerSchemesAsPrivileged: vi.fn(),
    },
    session: {
      defaultSession: {
        protocol: {
          handle: vi.fn(),
        },
        setPermissionCheckHandler: vi.fn(),
        setPermissionRequestHandler: vi.fn(),
      },
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
  clipboard: electronMock.clipboard,
  dialog: electronMock.dialog,
  ipcMain: electronMock.ipcMain,
  nativeTheme: electronMock.nativeTheme,
  nativeImage: electronMock.nativeImage,
  net: electronMock.net,
  protocol: electronMock.protocol,
  safeStorage: electronMock.safeStorage,
  session: electronMock.session,
}))

import {
  acquireSingleInstanceOwnership,
  configureRendererPermissions,
  registerIpcHandlers,
  resolveDevServerUrl,
  resolveMainWindowChromeOptions,
} from './index'

const appGetPathCallCountAfterImport = electronMock.app.getPath.mock.calls.length
const safeStorageAvailabilityCallCountAfterImport =
  electronMock.safeStorage.isEncryptionAvailable.mock.calls.length
const registeredImageSchemesAfterImport =
  electronMock.protocol.registerSchemesAsPrivileged.mock.calls[0]?.[0]
const secondInstanceHandlerAfterImport = electronMock.app.on.mock.calls.find(
  ([event]) => event === 'second-instance',
)?.[1] as (() => void) | undefined

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

describe('resolveMainWindowChromeOptions', () => {
  it('integrates native window controls into the app shell on macOS only', () => {
    expect(resolveMainWindowChromeOptions('darwin')).toEqual({
      titleBarStyle: 'hidden',
      trafficLightPosition: { x: 18, y: 18 },
    })
    expect(resolveMainWindowChromeOptions('win32')).toEqual({})
    expect(resolveMainWindowChromeOptions('linux')).toEqual({})
  })
})

describe('configureRendererPermissions', () => {
  it('denies clipboard reads without changing other permission defaults', () => {
    configureRendererPermissions(electronMock.session.defaultSession)

    type PermissionCheckHandler = NonNullable<Parameters<Session['setPermissionCheckHandler']>[0]>
    type PermissionRequestHandler = NonNullable<
      Parameters<Session['setPermissionRequestHandler']>[0]
    >
    const checkHandler = electronMock.session.defaultSession.setPermissionCheckHandler.mock
      .calls[0]?.[0] as PermissionCheckHandler
    const requestHandler = electronMock.session.defaultSession.setPermissionRequestHandler.mock
      .calls[0]?.[0] as PermissionRequestHandler
    const requestCallback = vi.fn()

    expect(
      checkHandler(null, 'clipboard-read', '', {} as Parameters<PermissionCheckHandler>[3]),
    ).toBe(false)
    expect(
      checkHandler(null, 'notifications', '', {} as Parameters<PermissionCheckHandler>[3]),
    ).toBe(true)
    requestHandler(
      {} as WebContents,
      'clipboard-read',
      requestCallback,
      {} as Parameters<PermissionRequestHandler>[3],
    )
    requestHandler(
      {} as WebContents,
      'notifications',
      requestCallback,
      {} as Parameters<PermissionRequestHandler>[3],
    )
    expect(requestCallback.mock.calls).toEqual([[false], [true]])
  })
})

describe('image protocol scheme registration', () => {
  it('registers only the standard and secure privileges before app ready', () => {
    expect(electronMock.app.requestSingleInstanceLock.mock.invocationCallOrder[0]).toBeLessThan(
      electronMock.protocol.registerSchemesAsPrivileged.mock.invocationCallOrder[0]!,
    )
    expect(registeredImageSchemesAfterImport).toEqual([
      {
        scheme: 'nyx-image',
        privileges: { standard: true, secure: true },
      },
    ])
  })
})

describe('single-instance ownership', () => {
  it('exits a rejected secondary before registering privileged data access', () => {
    vi.clearAllMocks()
    electronMock.app.requestSingleInstanceLock.mockReturnValueOnce(false)

    expect(acquireSingleInstanceOwnership()).toBe(false)
    expect(electronMock.app.quit).toHaveBeenCalledTimes(1)
    expect(electronMock.protocol.registerSchemesAsPrivileged).not.toHaveBeenCalled()
    expect(electronMock.app.on).not.toHaveBeenCalled()
  })

  it('only restores, shows, and focuses the existing primary window', () => {
    const window = {
      focus: vi.fn(),
      isMinimized: vi.fn(() => true),
      restore: vi.fn(),
      show: vi.fn(),
    }
    electronMock.BrowserWindow.getAllWindows.mockReturnValueOnce([window])

    secondInstanceHandlerAfterImport?.()

    expect(window.restore).toHaveBeenCalledTimes(1)
    expect(window.show).toHaveBeenCalledTimes(1)
    expect(window.focus).toHaveBeenCalledTimes(1)
  })
})

describe('registerIpcHandlers', () => {
  beforeEach(() => {
    electronMock.handlers.clear()
    vi.clearAllMocks()
  })

  it('returns the safe async reset result to ipcRenderer.invoke callers', () => {
    const sender = {} as WebContents
    const resetPromise = Promise.resolve({ ok: true } as const)
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

  it('returns the safe current thread snapshot promise to ipcRenderer.invoke callers', () => {
    const snapshotResult = {
      ok: true,
      value: null,
    } as const
    const snapshotPromise = Promise.resolve(snapshotResult)
    const currentThreadSnapshot = {
      getSnapshot: vi.fn(() => snapshotPromise),
    }

    registerIpcHandlers({ currentThreadSnapshot })

    const result = registeredHandler(NYX_CHAT_IPC_CHANNELS.currentThreadSnapshot)({
      sender: {} as WebContents,
    })

    expect(currentThreadSnapshot.getSnapshot).toHaveBeenCalledTimes(1)
    expect(result).toBe(snapshotPromise)
  })

  it('returns connection IPC handler promises to ipcRenderer.invoke callers', () => {
    const overviewResult: NyxConnectionsOverviewResult = {
      ok: true,
      value: {
        providers: [],
        defaultTarget: null,
        defaultTargetSource: 'missing',
        targetCatalog: {
          connectionTargets: [],
          envFallback: null,
        },
      },
    }
    const overviewPromise = Promise.resolve(overviewResult)
    const connections = {
      overview: vi.fn(() => overviewPromise),
      listProviders: vi.fn(),
      getProvider: vi.fn(),
      revealProviderCredential: vi.fn(),
      copyProviderCredential: vi.fn(),
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
        reset: vi.fn(async () => ({ ok: true as const })),
      },
      connections,
    })

    const result = registeredHandler(NYX_CONNECTIONS_IPC_CHANNELS.overview)({
      sender: {} as WebContents,
    })

    expect(connections.overview).toHaveBeenCalledTimes(1)
    expect(result).toBe(overviewPromise)
  })

  it('allows credential actions only from the sender main frame', () => {
    const mainFrame = {} as WebFrameMain
    const sender = { mainFrame } as WebContents
    const revealResult = Promise.resolve({
      ok: true,
      value: { providerId: 'provider-1' },
    } as const)
    const connections = {
      overview: vi.fn(),
      listProviders: vi.fn(),
      getProvider: vi.fn(),
      revealProviderCredential: vi.fn(() => revealResult),
      copyProviderCredential: vi.fn(),
      saveProvider: vi.fn(),
      deleteProvider: vi.fn(),
      setDefaultTarget: vi.fn(),
      testProvider: vi.fn(),
      refreshModels: vi.fn(),
    }

    registerIpcHandlers({ connections })

    const handler = registeredHandler(NYX_CONNECTIONS_IPC_CHANNELS.revealProviderCredential)
    const input = { providerId: 'provider-1' }

    expect(handler({ sender, senderFrame: mainFrame }, input)).toBe(revealResult)
    expect(() => handler({ sender, senderFrame: {} as WebFrameMain }, input)).toThrow(
      'Credential actions are only available from the main app frame.',
    )
    expect(connections.revealProviderCredential).toHaveBeenCalledTimes(1)
  })

  it('does not touch connection storage while registering injected IPC handlers', () => {
    const chatSessionManager = {
      start: vi.fn(),
      cancel: vi.fn(),
      reset: vi.fn(async () => ({ ok: true as const })),
    }
    const connections = {
      overview: vi.fn(),
      listProviders: vi.fn(),
      getProvider: vi.fn(),
      revealProviderCredential: vi.fn(),
      copyProviderCredential: vi.fn(),
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
