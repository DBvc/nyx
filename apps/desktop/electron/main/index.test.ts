import type { WebContents } from 'electron'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { NYX_CHAT_IPC_CHANNELS } from '../../shared/chat/ipc'

type RegisteredIpcHandler = (event: { sender: WebContents }, request?: unknown) => unknown

const electronMock = vi.hoisted(() => {
  const handlers = new Map<string, RegisteredIpcHandler>()

  return {
    handlers,
    app: {
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
  }
})

vi.mock('electron', () => ({
  app: electronMock.app,
  BrowserWindow: electronMock.BrowserWindow,
  ipcMain: electronMock.ipcMain,
}))

import { registerIpcHandlers } from './index'

function registeredHandler(channel: string) {
  const handler = electronMock.handlers.get(channel)

  if (!handler) {
    throw new Error(`Expected handler for ${channel}`)
  }

  return handler
}

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
})
