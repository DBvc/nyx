import type { NyxChatCancellationRequest, NyxChatRequest } from '../chat/types'
import type { NyxChatEventListener } from '../chat/events'
import type { NyxCurrentThreadResetResult, NyxCurrentThreadSnapshotResult } from '../chat/snapshot'
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
} from '../connections/types'
import type { NyxProviderStatus } from '../provider/types'

export interface NyxDesktopChatApi {
  startChat(request: NyxChatRequest): Promise<void>
  cancelChat(request: NyxChatCancellationRequest): Promise<void>
  resetChatSession(): Promise<NyxCurrentThreadResetResult>
  getCurrentThreadSnapshot(): Promise<NyxCurrentThreadSnapshotResult>
  subscribe(listener: NyxChatEventListener): () => void
}

export interface NyxDesktopProviderApi {
  getStatus(): Promise<NyxProviderStatus>
}

export interface NyxDesktopConnectionsApi {
  getOverview(): Promise<NyxConnectionsOverviewResult>
  listProviders(): Promise<NyxConnectionListProvidersResult>
  getProvider(input: NyxConnectionProviderLookupInput): Promise<NyxConnectionGetProviderResult>
  revealProviderCredential(
    input: NyxConnectionProviderLookupInput,
  ): Promise<NyxConnectionCredentialActionResult>
  copyProviderCredential(
    input: NyxConnectionProviderLookupInput,
  ): Promise<NyxConnectionCredentialActionResult>
  saveProvider(input: NyxConnectionSaveProviderInput): Promise<NyxConnectionSaveProviderResult>
  deleteProvider(
    input: NyxConnectionDeleteProviderInput,
  ): Promise<NyxConnectionDeleteProviderResult>
  setDefaultTarget(
    input: NyxConnectionSetDefaultTargetInput,
  ): Promise<NyxConnectionSetDefaultTargetResult>
  testProvider(input: NyxConnectionTestInput): Promise<NyxConnectionTestResult>
  refreshModels(input: NyxConnectionRefreshModelsInput): Promise<NyxConnectionRefreshModelsResult>
}

export interface NyxDesktopApi {
  platform: string
  versions: {
    electron: string
    chrome: string
    node: string
  }
  chat: NyxDesktopChatApi
  provider: NyxDesktopProviderApi
  connections: NyxDesktopConnectionsApi
}
