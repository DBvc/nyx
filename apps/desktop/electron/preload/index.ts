import { contextBridge, ipcRenderer } from 'electron'

import type { NyxChatEvent } from '../../shared/chat/events'
import { NYX_CHAT_IPC_CHANNELS } from '../../shared/chat/ipc'
import { NYX_CONNECTIONS_IPC_CHANNELS } from '../../shared/connections/ipc'
import type {
  NyxConnectionDeleteProviderInput,
  NyxConnectionDeleteProviderResult,
  NyxConnectionCredentialActionResult,
  NyxConnectionGetProviderResult,
  NyxConnectionListProvidersResult,
  NyxConnectionProviderLookupInput,
  NyxConnectionRefreshModelsInput,
  NyxConnectionRefreshModelsResult,
  NyxConnectionSaveProviderInput,
  NyxConnectionSaveProviderResult,
  NyxConnectionSetDefaultTargetInput,
  NyxConnectionSetDefaultTargetResult,
  NyxConnectionTestInput,
  NyxConnectionTestResult,
  NyxConnectionsOverviewResult,
} from '../../shared/connections/types'
import type { NyxDesktopApi } from '../../shared/contracts/desktop'
import { NYX_PROVIDER_IPC_CHANNELS } from '../../shared/provider/ipc'
import type { NyxProviderStatus } from '../../shared/provider/types'
import type { NyxThreadEvent } from '../../shared/threads/events'
import { NYX_THREADS_IPC_CHANNELS } from '../../shared/threads/ipc'

const api: NyxDesktopApi = {
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
  chat: {
    start: (request) => ipcRenderer.invoke(NYX_CHAT_IPC_CHANNELS.start, request) as Promise<void>,
    cancel: (request) => ipcRenderer.invoke(NYX_CHAT_IPC_CHANNELS.cancel, request) as Promise<void>,
    retrySettlement: (request) =>
      ipcRenderer.invoke(NYX_CHAT_IPC_CHANNELS.retrySettlement, request) as Promise<void>,
    subscribe: (listener) => {
      const subscription = (_event: Electron.IpcRendererEvent, chatEvent: NyxChatEvent) => {
        listener(chatEvent)
      }

      ipcRenderer.on(NYX_CHAT_IPC_CHANNELS.event, subscription)

      return () => {
        ipcRenderer.removeListener(NYX_CHAT_IPC_CHANNELS.event, subscription)
      }
    },
  },
  threads: {
    listPage: (input) => ipcRenderer.invoke(NYX_THREADS_IPC_CHANNELS.listPage, input),
    get: (input) => ipcRenderer.invoke(NYX_THREADS_IPC_CHANNELS.get, input),
    materialize: (input) => ipcRenderer.invoke(NYX_THREADS_IPC_CHANNELS.materialize, input),
    saveDraft: (input) => ipcRenderer.invoke(NYX_THREADS_IPC_CHANNELS.saveDraft, input),
    retryOpen: (input) => ipcRenderer.invoke(NYX_THREADS_IPC_CHANNELS.retryOpen, input),
    markSeen: (input) => ipcRenderer.invoke(NYX_THREADS_IPC_CHANNELS.markSeen, input),
    updatePin: (input) => ipcRenderer.invoke(NYX_THREADS_IPC_CHANNELS.updatePin, input),
    rename: (input) => ipcRenderer.invoke(NYX_THREADS_IPC_CHANNELS.rename, input),
    subscribe: (listener) => {
      const subscription = (_event: Electron.IpcRendererEvent, threadEvent: NyxThreadEvent) => {
        listener(threadEvent)
      }

      ipcRenderer.on(NYX_THREADS_IPC_CHANNELS.event, subscription)

      return () => {
        ipcRenderer.removeListener(NYX_THREADS_IPC_CHANNELS.event, subscription)
      }
    },
  },
  provider: {
    getStatus: () =>
      ipcRenderer.invoke(NYX_PROVIDER_IPC_CHANNELS.status) as Promise<NyxProviderStatus>,
  },
  connections: {
    getOverview: () =>
      ipcRenderer.invoke(
        NYX_CONNECTIONS_IPC_CHANNELS.overview,
      ) as Promise<NyxConnectionsOverviewResult>,
    listProviders: () =>
      ipcRenderer.invoke(
        NYX_CONNECTIONS_IPC_CHANNELS.listProviders,
      ) as Promise<NyxConnectionListProvidersResult>,
    getProvider: (input: NyxConnectionProviderLookupInput) =>
      ipcRenderer.invoke(
        NYX_CONNECTIONS_IPC_CHANNELS.getProvider,
        input,
      ) as Promise<NyxConnectionGetProviderResult>,
    revealProviderCredential: (input: NyxConnectionProviderLookupInput) =>
      ipcRenderer.invoke(
        NYX_CONNECTIONS_IPC_CHANNELS.revealProviderCredential,
        input,
      ) as Promise<NyxConnectionCredentialActionResult>,
    copyProviderCredential: (input: NyxConnectionProviderLookupInput) =>
      ipcRenderer.invoke(
        NYX_CONNECTIONS_IPC_CHANNELS.copyProviderCredential,
        input,
      ) as Promise<NyxConnectionCredentialActionResult>,
    saveProvider: (input: NyxConnectionSaveProviderInput) =>
      ipcRenderer.invoke(
        NYX_CONNECTIONS_IPC_CHANNELS.saveProvider,
        input,
      ) as Promise<NyxConnectionSaveProviderResult>,
    deleteProvider: (input: NyxConnectionDeleteProviderInput) =>
      ipcRenderer.invoke(
        NYX_CONNECTIONS_IPC_CHANNELS.deleteProvider,
        input,
      ) as Promise<NyxConnectionDeleteProviderResult>,
    setDefaultTarget: (input: NyxConnectionSetDefaultTargetInput) =>
      ipcRenderer.invoke(
        NYX_CONNECTIONS_IPC_CHANNELS.setDefaultTarget,
        input,
      ) as Promise<NyxConnectionSetDefaultTargetResult>,
    testProvider: (input: NyxConnectionTestInput) =>
      ipcRenderer.invoke(
        NYX_CONNECTIONS_IPC_CHANNELS.testProvider,
        input,
      ) as Promise<NyxConnectionTestResult>,
    refreshModels: (input: NyxConnectionRefreshModelsInput) =>
      ipcRenderer.invoke(
        NYX_CONNECTIONS_IPC_CHANNELS.refreshModels,
        input,
      ) as Promise<NyxConnectionRefreshModelsResult>,
  },
}

if (!process.contextIsolated) {
  throw new Error('Nyx preload requires contextIsolation=true.')
}

contextBridge.exposeInMainWorld('nyx', api)
