import { contextBridge, ipcRenderer } from 'electron'

import type { NyxChatEvent } from '../../shared/chat/events'
import { NYX_CHAT_IPC_CHANNELS } from '../../shared/chat/ipc'
import { NYX_CONNECTIONS_IPC_CHANNELS } from '../../shared/connections/ipc'
import type {
  NyxConnectionDeleteProviderInput,
  NyxConnectionDeleteProviderResult,
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

const api: NyxDesktopApi = {
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
  chat: {
    startChat: (request) =>
      ipcRenderer.invoke(NYX_CHAT_IPC_CHANNELS.start, request) as Promise<void>,
    cancelChat: (request) =>
      ipcRenderer.invoke(NYX_CHAT_IPC_CHANNELS.cancel, request) as Promise<void>,
    resetChatSession: () => ipcRenderer.invoke(NYX_CHAT_IPC_CHANNELS.reset) as Promise<void>,
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
