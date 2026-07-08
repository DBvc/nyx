import type { IpcMain } from 'electron'

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

export function registerConnectionsIpcHandlers({
  ipcMain,
  connections,
}: RegisterConnectionsIpcHandlersOptions) {
  ipcMain.removeHandler(NYX_CONNECTIONS_IPC_CHANNELS.overview)
  ipcMain.removeHandler(NYX_CONNECTIONS_IPC_CHANNELS.listProviders)
  ipcMain.removeHandler(NYX_CONNECTIONS_IPC_CHANNELS.getProvider)
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
