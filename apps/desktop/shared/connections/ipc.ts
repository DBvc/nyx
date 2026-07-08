export const NYX_CONNECTIONS_IPC_CHANNELS = {
  overview: 'nyx:connections:overview',
  listProviders: 'nyx:connections:list-providers',
  getProvider: 'nyx:connections:get-provider',
  saveProvider: 'nyx:connections:save-provider',
  deleteProvider: 'nyx:connections:delete-provider',
  setDefaultTarget: 'nyx:connections:set-default-target',
  testProvider: 'nyx:connections:test-provider',
  refreshModels: 'nyx:connections:refresh-models',
} as const

export type NyxConnectionsIpcChannel =
  (typeof NYX_CONNECTIONS_IPC_CHANNELS)[keyof typeof NYX_CONNECTIONS_IPC_CHANNELS]
