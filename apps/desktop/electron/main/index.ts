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
import { NYX_PROVIDER_IPC_CHANNELS } from '../../shared/provider/ipc'
import { NYX_THREADS_IPC_CHANNELS } from '../../shared/threads/ipc'
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
import { registerNyxImageProtocol, registerNyxImageScheme } from './current-thread/image-protocol'
import { createRuntimeChatStateClient } from './runtime/chat-state-client'
import { activateThreadLibrary } from './thread-library/activation'
import { ThreadLibraryService } from './thread-library/service'
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

function createMainServices() {
  const threadLibraryService = new ThreadLibraryService({
    activate: () =>
      activateThreadLibrary({
        userDataPath: app.getPath('userData'),
        decodeImageSize: (bytes) => {
          const image = nativeImage.createFromBuffer(
            Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength),
          )
          return image.isEmpty() ? null : image.getSize()
        },
      }),
    broadcastThreadEvent: (event) => {
      for (const window of BrowserWindow.getAllWindows()) {
        window.webContents.send(NYX_THREADS_IPC_CHANNELS.event, event)
      }
    },
  })

  return {
    chatSessionManager: new ChatSessionManager({
      createRuntimeChatStateClient: createMainRuntimeChatStateClient,
      resolveChatTarget: createMainChatTargetResolver(),
      resolveThreadLibraryCoordinator: () => threadLibraryService.resolveCoordinator(),
      publishChatEvent: (sender, event) => threadLibraryService.publishChatEvent(sender, event),
    }),
    connectionsService: createMainConnectionsService(),
    threadLibraryService,
  }
}

let mainServices: ReturnType<typeof createMainServices> | undefined

function resolveMainServices() {
  mainServices ??= createMainServices()
  return mainServices
}

type ChatSessionController = Pick<ChatSessionManager, 'start' | 'cancel' | 'retrySettlement'>
type ThreadLibraryController = Pick<
  ThreadLibraryService,
  'listPage' | 'get' | 'materialize' | 'saveDraft' | 'retryOpen' | 'markSeen' | 'updatePin'
>

export interface RegisterIpcHandlersOptions {
  chatSessionManager?: ChatSessionController
  connections?: ConnectionsController
  threads?: ThreadLibraryController
  providerStatusReader?: typeof readProviderStatus
}

export function registerIpcHandlers(options: RegisterIpcHandlersOptions = {}) {
  const defaults = resolveMainServices()
  const manager = options.chatSessionManager ?? defaults.chatSessionManager
  const connections = options.connections ?? defaults.connectionsService
  const threads = options.threads ?? defaults.threadLibraryService
  const providerStatusReader = options.providerStatusReader ?? readProviderStatus

  ipcMain.removeHandler(NYX_CHAT_IPC_CHANNELS.start)
  ipcMain.removeHandler(NYX_CHAT_IPC_CHANNELS.cancel)
  ipcMain.removeHandler(NYX_CHAT_IPC_CHANNELS.retrySettlement)
  for (const channel of Object.values(NYX_THREADS_IPC_CHANNELS)) {
    if (channel !== NYX_THREADS_IPC_CHANNELS.event) ipcMain.removeHandler(channel)
  }
  ipcMain.removeHandler(NYX_PROVIDER_IPC_CHANNELS.status)

  ipcMain.handle(NYX_CHAT_IPC_CHANNELS.start, (event, request: unknown) => {
    manager.start(event.sender, request)
  })

  ipcMain.handle(NYX_CHAT_IPC_CHANNELS.cancel, (_event, request: unknown) => {
    manager.cancel(request)
  })

  ipcMain.handle(NYX_CHAT_IPC_CHANNELS.retrySettlement, (event, request: unknown) => {
    return manager.retrySettlement(event.sender, request)
  })

  ipcMain.handle(NYX_THREADS_IPC_CHANNELS.listPage, (_event, input) => threads.listPage(input))
  ipcMain.handle(NYX_THREADS_IPC_CHANNELS.get, (_event, input) => threads.get(input))
  ipcMain.handle(NYX_THREADS_IPC_CHANNELS.materialize, (_event, input) =>
    threads.materialize(input),
  )
  ipcMain.handle(NYX_THREADS_IPC_CHANNELS.saveDraft, (_event, input) => threads.saveDraft(input))
  ipcMain.handle(NYX_THREADS_IPC_CHANNELS.retryOpen, (_event, input) => threads.retryOpen(input))
  ipcMain.handle(NYX_THREADS_IPC_CHANNELS.markSeen, (_event, input) => threads.markSeen(input))
  ipcMain.handle(NYX_THREADS_IPC_CHANNELS.updatePin, (_event, input) => threads.updatePin(input))

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
  bindRendererProjectionTeardown(window, () =>
    resolveMainServices().threadLibraryService.rendererTeardown(),
  )

  if (devServerUrl) {
    void window.loadURL(devServerUrl)
    window.webContents.openDevTools({ mode: 'detach' })
    return window
  }

  void window.loadFile(join(rendererDistPath, 'index.html'))
  return window
}

export function bindRendererProjectionTeardown(
  window: Pick<BrowserWindow, 'on' | 'webContents'>,
  teardown: () => void,
) {
  window.on('closed', teardown)
  window.webContents.on('render-process-gone', teardown)
  window.webContents.on('did-start-navigation', (details) => {
    if (details.isMainFrame && !details.isSameDocument) teardown()
  })
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
    await services.threadLibraryService.initialize()

    nativeTheme.themeSource = 'dark'
    configureRendererPermissions(electronSession.defaultSession)
    registerNyxImageProtocol({
      protocol: electronSession.defaultSession.protocol,
      net,
      authorization: {
        resolve: (imageId) => services.threadLibraryService.resolveAuthorizedImage(imageId),
      },
      images: {
        resolveImageProtocolFile: (threadId, ref, variant) =>
          services.threadLibraryService.resolveImageProtocolFile(threadId, ref, variant),
      },
    })

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
