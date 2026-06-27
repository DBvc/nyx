import { contextBridge, ipcRenderer } from 'electron'

import type { NyxChatEvent } from '../../shared/chat/events'
import { NYX_CHAT_IPC_CHANNELS } from '../../shared/chat/ipc'
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
}

if (!process.contextIsolated) {
  throw new Error('Nyx preload requires contextIsolation=true.')
}

contextBridge.exposeInMainWorld('nyx', api)
