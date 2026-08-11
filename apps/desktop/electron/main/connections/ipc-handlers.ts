import type { IpcMain, IpcMainInvokeEvent } from 'electron'

import { NYX_CONNECTIONS_IPC_CHANNELS } from '../../../shared/connections/ipc'
import type {
  NyxConnectionDeleteProviderInput,
  NyxConnectionProviderLookupInput,
  NyxConnectionRefreshModelsInput,
  NyxConnectionSaveProviderInput,
  NyxConnectionSetDefaultTargetInput,
  NyxConnectionTestInput,
} from '../../../shared/connections/types'
import type { ConnectionsController } from './connection-service'

export interface RegisterConnectionsIpcHandlersOptions {
  ipcMain: Pick<IpcMain, 'handle' | 'removeHandler'>
  connections: ConnectionsController
}

function requireMainFrame(event: IpcMainInvokeEvent) {
  if (!event.senderFrame || event.senderFrame !== event.sender.mainFrame) {
    throw new Error('Credential actions are only available from the main app frame.')
  }
}

export function registerConnectionsIpcHandlers({
  ipcMain,
  connections,
}: RegisterConnectionsIpcHandlersOptions) {
  ipcMain.removeHandler(NYX_CONNECTIONS_IPC_CHANNELS.overview)
  ipcMain.removeHandler(NYX_CONNECTIONS_IPC_CHANNELS.listProviders)
  ipcMain.removeHandler(NYX_CONNECTIONS_IPC_CHANNELS.getProvider)
  ipcMain.removeHandler(NYX_CONNECTIONS_IPC_CHANNELS.revealProviderCredential)
  ipcMain.removeHandler(NYX_CONNECTIONS_IPC_CHANNELS.copyProviderCredential)
  ipcMain.removeHandler(NYX_CONNECTIONS_IPC_CHANNELS.saveProvider)
  ipcMain.removeHandler(NYX_CONNECTIONS_IPC_CHANNELS.deleteProvider)
  ipcMain.removeHandler(NYX_CONNECTIONS_IPC_CHANNELS.setDefaultTarget)
  ipcMain.removeHandler(NYX_CONNECTIONS_IPC_CHANNELS.testProvider)
  ipcMain.removeHandler(NYX_CONNECTIONS_IPC_CHANNELS.refreshModels)

  ipcMain.handle(NYX_CONNECTIONS_IPC_CHANNELS.overview, () => connections.overview())
  ipcMain.handle(NYX_CONNECTIONS_IPC_CHANNELS.listProviders, () => connections.listProviders())
  ipcMain.handle(
    NYX_CONNECTIONS_IPC_CHANNELS.getProvider,
    (_event, input: NyxConnectionProviderLookupInput) => connections.getProvider(input),
  )
  ipcMain.handle(
    NYX_CONNECTIONS_IPC_CHANNELS.revealProviderCredential,
    (event, input: NyxConnectionProviderLookupInput) => {
      requireMainFrame(event)
      return connections.revealProviderCredential(input)
    },
  )
  ipcMain.handle(
    NYX_CONNECTIONS_IPC_CHANNELS.copyProviderCredential,
    (event, input: NyxConnectionProviderLookupInput) => {
      requireMainFrame(event)
      return connections.copyProviderCredential(input)
    },
  )
  ipcMain.handle(
    NYX_CONNECTIONS_IPC_CHANNELS.saveProvider,
    (_event, input: NyxConnectionSaveProviderInput) => connections.saveProvider(input),
  )
  ipcMain.handle(
    NYX_CONNECTIONS_IPC_CHANNELS.deleteProvider,
    (_event, input: NyxConnectionDeleteProviderInput) => connections.deleteProvider(input),
  )
  ipcMain.handle(
    NYX_CONNECTIONS_IPC_CHANNELS.setDefaultTarget,
    (_event, input: NyxConnectionSetDefaultTargetInput) => connections.setDefaultTarget(input),
  )
  ipcMain.handle(
    NYX_CONNECTIONS_IPC_CHANNELS.testProvider,
    (_event, input: NyxConnectionTestInput) => connections.testProvider(input),
  )
  ipcMain.handle(
    NYX_CONNECTIONS_IPC_CHANNELS.refreshModels,
    (_event, input: NyxConnectionRefreshModelsInput) => connections.refreshModels(input),
  )
}
