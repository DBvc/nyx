import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  nativeImage,
  nativeTheme,
  net,
  protocol,
  safeStorage,
  session as electronSession,
  type Session,
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
import { CurrentThreadDocumentFiles } from './current-thread/document-files'
import { registerNyxImageProtocol, registerNyxImageScheme } from './current-thread/image-protocol'
import { createRuntimeChatStateClient } from './runtime/chat-state-client'
import { configureMainAutoUpdate } from './update/service'

const moduleDir = dirname(fileURLToPath(import.meta.url))
const rendererDistPath = join(moduleDir, '../renderer')
const preloadPath = join(moduleDir, '../preload/index.cjs')
const devServerUrl = resolveDevServerUrl(process.env)

function focusExistingMainWindow() {
  const window = BrowserWindow.getAllWindows()[0]

  if (!window) {
    return
  }

  if (window.isMinimized()) {
    window.restore()
  }
  window.show()
  window.focus()
}

export function acquireSingleInstanceOwnership() {
  if (!app.requestSingleInstanceLock()) {
    app.quit()
    return false
  }

  registerNyxImageScheme(protocol)
  app.on('second-instance', focusExistingMainWindow)
  return true
}

const ownsSingleInstance = acquireSingleInstanceOwnership()

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

export function configureRendererPermissions(
  session: Pick<Session, 'setPermissionCheckHandler' | 'setPermissionRequestHandler'>,
) {
  session.setPermissionCheckHandler((_webContents, permission) => permission !== 'clipboard-read')
  session.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission !== 'clipboard-read')
  })
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
        credentialActions: {
          reveal: async (value: string) => {
            const result = await dialog.showMessageBox({
              type: 'info',
              title: 'Stored API key',
              message: value,
              detail: 'This key is stored encrypted locally.',
              buttons: ['Copy', 'Done'],
              defaultId: 1,
              cancelId: 1,
              noLink: true,
            })

            if (result.response === 0) {
              clipboard.writeText(value)
            }
          },
          copy: (value: string) => {
            clipboard.writeText(value)
          },
        },
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
  resolveDocuments: ReturnType<typeof createMainCurrentThreadDocumentFilesResolver>,
) {
  let session: CurrentThreadSessionCoordinator | undefined

  return () => {
    session ??= new CurrentThreadSessionCoordinator({
      store: resolveStore(),
      images: resolveImages(),
      documents: resolveDocuments(),
    })
    return session
  }
}

function createMainCurrentThreadDocumentFilesResolver() {
  let documents: CurrentThreadDocumentFiles | undefined

  return () => {
    documents ??= new CurrentThreadDocumentFiles({
      directoryPath: join(app.getPath('userData'), 'threads', 'current-thread-documents'),
    })
    return documents
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

function createMainServices() {
  const resolveCurrentThreadStore = createMainCurrentThreadStoreResolver()
  const resolveCurrentThreadImages = createMainCurrentThreadImageFilesResolver()
  const resolveCurrentThreadDocuments = createMainCurrentThreadDocumentFilesResolver()
  const resolveCurrentThreadSession = createMainCurrentThreadSessionResolver(
    resolveCurrentThreadStore,
    resolveCurrentThreadImages,
    resolveCurrentThreadDocuments,
  )

  return {
    chatSessionManager: new ChatSessionManager({
      createRuntimeChatStateClient: createMainRuntimeChatStateClient,
      resolveChatTarget: createMainChatTargetResolver(),
      resolveCurrentThreadSession,
    }),
    connectionsService: createMainConnectionsService(),
    currentThreadSnapshotService: new CurrentThreadSnapshotService({
      resolveReader: resolveCurrentThreadStore,
      resolveImages: resolveCurrentThreadImages,
      resolveDocuments: resolveCurrentThreadDocuments,
    }),
    resolveCurrentThreadDocuments,
    resolveCurrentThreadImages,
    resolveCurrentThreadStore,
  }
}

let mainServices: ReturnType<typeof createMainServices> | undefined

function resolveMainServices() {
  mainServices ??= createMainServices()
  return mainServices
}

type ChatSessionController = Pick<ChatSessionManager, 'start' | 'cancel' | 'reset'>

export interface RegisterIpcHandlersOptions {
  chatSessionManager?: ChatSessionController
  connections?: ConnectionsController
  currentThreadSnapshot?: CurrentThreadSnapshotController
  providerStatusReader?: typeof readProviderStatus
}

export function registerIpcHandlers(options: RegisterIpcHandlersOptions = {}) {
  const defaults = resolveMainServices()
  const manager = options.chatSessionManager ?? defaults.chatSessionManager
  const connections = options.connections ?? defaults.connectionsService
  const currentThreadSnapshot =
    options.currentThreadSnapshot ?? defaults.currentThreadSnapshotService
  const providerStatusReader = options.providerStatusReader ?? readProviderStatus

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

if (ownsSingleInstance) {
  app.whenReady().then(async () => {
    const services = resolveMainServices()

    nativeTheme.themeSource = 'dark'
    configureRendererPermissions(electronSession.defaultSession)
    registerNyxImageProtocol({
      protocol: electronSession.defaultSession.protocol,
      net,
      recordReader: services.resolveCurrentThreadStore(),
      images: services.resolveCurrentThreadImages(),
    })

    try {
      const record = await services.resolveCurrentThreadStore().read()
      await services.resolveCurrentThreadImages().reconcile(record)
      await services.resolveCurrentThreadDocuments().reconcile(record)
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
}
