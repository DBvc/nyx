import { app, BrowserWindow, ipcMain, safeStorage } from 'electron'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { NYX_CHAT_IPC_CHANNELS } from '../../shared/chat/ipc'
import type { NyxChatCancellationRequest, NyxChatRequest } from '../../shared/chat/types'
import { NYX_PROVIDER_IPC_CHANNELS } from '../../shared/provider/ipc'
import { readProviderStatus } from './chat/env'
import { ChatSessionManager } from './chat/session'
import {
  createLazyConnectionsService,
  type ConnectionsController,
} from './connections/connection-service'
import { ConnectionStore } from './connections/connection-store'
import { createConnectionsSettingsPaths } from './connections/config-file'
import { registerConnectionsIpcHandlers } from './connections/ipc-handlers'
import { createLazyChatProviderConfigResolver } from './connections/provider-resolver'
import { createSafeStorageSecretCrypto, SecretStore } from './connections/secret-store'
import {
  CurrentThreadSnapshotService,
  type CurrentThreadSnapshotController,
} from './current-thread/snapshot'
import { CurrentThreadStore } from './current-thread/store'
import { createRuntimeChatStateClient } from './runtime/chat-state-client'
import { configureMainAutoUpdate } from './update/service'

const moduleDir = dirname(fileURLToPath(import.meta.url))
const rendererDistPath = join(moduleDir, '../renderer')
const preloadPath = join(moduleDir, '../preload/index.cjs')
const devServerUrl = resolveDevServerUrl(process.env)

export function resolveDevServerUrl(env: NodeJS.ProcessEnv) {
  return env.ELECTRON_RENDERER_URL || env.VITE_DEV_SERVER_URL
}

function createMainRuntimeChatStateClient() {
  return createRuntimeChatStateClient({
    path: {
      isPackaged: app.isPackaged,
      resourcesPath: process.resourcesPath,
    },
  })
}

function createMainChatProviderConfigResolver() {
  return createLazyChatProviderConfigResolver({
    createDependencies: () => {
      const paths = createConnectionsSettingsPaths(app.getPath('userData'))

      return {
        connectionStore: new ConnectionStore({ filePath: paths.connectionsFilePath }),
        secretStore: new SecretStore({
          filePath: paths.secretsFilePath,
          crypto: createSafeStorageSecretCrypto(safeStorage),
        }),
      }
    },
  })
}

function createMainConnectionsService() {
  return createLazyConnectionsService({
    createDependencies: () => {
      const paths = createConnectionsSettingsPaths(app.getPath('userData'))

      return {
        connectionStore: new ConnectionStore({ filePath: paths.connectionsFilePath }),
        secretStore: new SecretStore({
          filePath: paths.secretsFilePath,
          crypto: createSafeStorageSecretCrypto(safeStorage),
        }),
      }
    },
  })
}

function createMainCurrentThreadStoreResolver() {
  let store: CurrentThreadStore | undefined

  return () => {
    store ??= new CurrentThreadStore({
      filePath: join(app.getPath('userData'), 'threads', 'current-thread.json'),
    })

    return store
  }
}

const chatSessionManager = new ChatSessionManager({
  createRuntimeChatStateClient: createMainRuntimeChatStateClient,
  resolveProviderConfig: createMainChatProviderConfigResolver(),
})
const connectionsService = createMainConnectionsService()
const resolveCurrentThreadStore = createMainCurrentThreadStoreResolver()
const currentThreadSnapshotService = new CurrentThreadSnapshotService({
  resolveReader: resolveCurrentThreadStore,
})

type ChatSessionController = Pick<ChatSessionManager, 'start' | 'cancel' | 'reset'>

export interface RegisterIpcHandlersOptions {
  chatSessionManager?: ChatSessionController
  connections?: ConnectionsController
  currentThreadSnapshot?: CurrentThreadSnapshotController
  providerStatusReader?: typeof readProviderStatus
}

export function registerIpcHandlers({
  chatSessionManager: manager = chatSessionManager,
  connections = connectionsService,
  currentThreadSnapshot = currentThreadSnapshotService,
  providerStatusReader = readProviderStatus,
}: RegisterIpcHandlersOptions = {}) {
  ipcMain.removeHandler(NYX_CHAT_IPC_CHANNELS.start)
  ipcMain.removeHandler(NYX_CHAT_IPC_CHANNELS.cancel)
  ipcMain.removeHandler(NYX_CHAT_IPC_CHANNELS.reset)
  ipcMain.removeHandler(NYX_CHAT_IPC_CHANNELS.currentThreadSnapshot)
  ipcMain.removeHandler(NYX_PROVIDER_IPC_CHANNELS.status)

  ipcMain.handle(NYX_CHAT_IPC_CHANNELS.start, (event, request: NyxChatRequest) => {
    manager.start(event.sender, request)
  })

  ipcMain.handle(NYX_CHAT_IPC_CHANNELS.cancel, (_event, request: NyxChatCancellationRequest) => {
    manager.cancel(request)
  })

  ipcMain.handle(NYX_CHAT_IPC_CHANNELS.reset, (event) => {
    return manager.reset(event.sender)
  })

  ipcMain.handle(NYX_CHAT_IPC_CHANNELS.currentThreadSnapshot, () => {
    return currentThreadSnapshot.getSnapshot()
  })

  ipcMain.handle(NYX_PROVIDER_IPC_CHANNELS.status, () => providerStatusReader())

  registerConnectionsIpcHandlers({
    ipcMain,
    connections,
  })
}

function createMainWindow() {
  const window = new BrowserWindow({
    width: 1360,
    height: 920,
    minWidth: 1080,
    minHeight: 720,
    title: 'Nyx',
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  })

  if (devServerUrl) {
    void window.loadURL(devServerUrl)
    window.webContents.openDevTools({ mode: 'detach' })
    return window
  }

  void window.loadFile(join(rendererDistPath, 'index.html'))
  return window
}

function configureAutoUpdate() {
  return configureMainAutoUpdate({
    appName: app.getName(),
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
  })
}

app.whenReady().then(() => {
  registerIpcHandlers()
  createMainWindow()
  configureAutoUpdate()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
