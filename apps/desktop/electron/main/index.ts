import {
  app,
  BrowserWindow,
  ipcMain,
  nativeImage,
  nativeTheme,
  net,
  protocol,
  safeStorage,
  session as electronSession,
} from 'electron'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { NYX_CHAT_IPC_CHANNELS } from '../../shared/chat/ipc'
import type { NyxChatCancellationRequest } from '../../shared/chat/types'
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
import { createLazyChatTargetResolver } from './connections/provider-resolver'
import { createSafeStorageSecretCrypto, SecretStore } from './connections/secret-store'
import {
  CurrentThreadSnapshotService,
  type CurrentThreadSnapshotController,
} from './current-thread/snapshot'
import { CurrentThreadSessionCoordinator } from './current-thread/session-coordinator'
import { CurrentThreadStore } from './current-thread/store'
import { CurrentThreadImageFiles } from './current-thread/image-files'
import { registerNyxImageProtocol, registerNyxImageScheme } from './current-thread/image-protocol'
import { createRuntimeChatStateClient } from './runtime/chat-state-client'
import { configureMainAutoUpdate } from './update/service'

const moduleDir = dirname(fileURLToPath(import.meta.url))
const rendererDistPath = join(moduleDir, '../renderer')
const preloadPath = join(moduleDir, '../preload/index.cjs')
const devServerUrl = resolveDevServerUrl(process.env)

registerNyxImageScheme(protocol)

export function resolveDevServerUrl(env: NodeJS.ProcessEnv) {
  return env.ELECTRON_RENDERER_URL || env.VITE_DEV_SERVER_URL
}

export function resolveMainWindowChromeOptions(platform: NodeJS.Platform) {
  if (platform !== 'darwin') {
    return {}
  }

  return {
    titleBarStyle: 'hidden' as const,
    trafficLightPosition: { x: 18, y: 18 },
  }
}

function createMainRuntimeChatStateClient() {
  return createRuntimeChatStateClient({
    path: {
      isPackaged: app.isPackaged,
      resourcesPath: process.resourcesPath,
    },
  })
}

function createMainChatTargetResolver() {
  return createLazyChatTargetResolver({
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

function createMainCurrentThreadSessionResolver(
  resolveStore: ReturnType<typeof createMainCurrentThreadStoreResolver>,
  resolveImages: ReturnType<typeof createMainCurrentThreadImageFilesResolver>,
) {
  let session: CurrentThreadSessionCoordinator | undefined

  return () => {
    session ??= new CurrentThreadSessionCoordinator({
      store: resolveStore(),
      images: resolveImages(),
    })
    return session
  }
}

function createMainCurrentThreadImageFilesResolver() {
  let images: CurrentThreadImageFiles | undefined

  return () => {
    images ??= new CurrentThreadImageFiles({
      directoryPath: join(app.getPath('userData'), 'threads', 'current-thread-assets'),
      decodeImageSize: (bytes) => {
        const image = nativeImage.createFromBuffer(
          Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength),
        )

        return image.isEmpty() ? null : image.getSize()
      },
    })

    return images
  }
}

const resolveCurrentThreadStore = createMainCurrentThreadStoreResolver()
const resolveCurrentThreadImages = createMainCurrentThreadImageFilesResolver()
const resolveCurrentThreadSession = createMainCurrentThreadSessionResolver(
  resolveCurrentThreadStore,
  resolveCurrentThreadImages,
)
const chatSessionManager = new ChatSessionManager({
  createRuntimeChatStateClient: createMainRuntimeChatStateClient,
  resolveChatTarget: createMainChatTargetResolver(),
  resolveCurrentThreadSession,
})
const connectionsService = createMainConnectionsService()
const currentThreadSnapshotService = new CurrentThreadSnapshotService({
  resolveReader: resolveCurrentThreadStore,
  resolveImages: resolveCurrentThreadImages,
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

  ipcMain.handle(NYX_CHAT_IPC_CHANNELS.start, (event, request: unknown) => {
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
    backgroundColor: '#131417',
    ...resolveMainWindowChromeOptions(process.platform),
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

app.whenReady().then(async () => {
  nativeTheme.themeSource = 'dark'
  registerNyxImageProtocol({
    protocol: electronSession.defaultSession.protocol,
    net,
    recordReader: resolveCurrentThreadStore(),
    images: resolveCurrentThreadImages(),
  })

  try {
    const record = await resolveCurrentThreadStore().read()
    await resolveCurrentThreadImages().reconcile(record)
  } catch {
    // Malformed or unknown records must not authorize cleanup.
  }

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
