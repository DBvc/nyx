import type {
  NyxThreadChatCancellationRequest,
  NyxThreadChatRequest,
  NyxThreadChatSettlementRetryRequest,
} from '../chat/types'
import type { NyxChatEventListener } from '../chat/events'
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
import type { NyxThreadEventListener } from '../threads/events'
import type {
  NyxThreadGetInput,
  NyxThreadListPage,
  NyxThreadListPageInput,
  NyxThreadMarkSeenInput,
  NyxThreadMarkSeenResult,
  NyxThreadMaterializeInput,
  NyxThreadMaterializeResult,
  NyxThreadResult,
  NyxThreadRetryOpenInput,
  NyxThreadSaveDraftInput,
  NyxThreadSaveDraftResult,
  NyxThreadSnapshot,
} from '../threads/types'

export interface NyxDesktopChatApi {
  start(request: NyxThreadChatRequest): Promise<void>
  cancel(request: NyxThreadChatCancellationRequest): Promise<void>
  retrySettlement(request: NyxThreadChatSettlementRetryRequest): Promise<void>
  subscribe(listener: NyxChatEventListener): () => void
}

export interface NyxDesktopThreadsApi {
  listPage(input: NyxThreadListPageInput): Promise<NyxThreadResult<NyxThreadListPage>>
  get(input: NyxThreadGetInput): Promise<NyxThreadResult<NyxThreadSnapshot>>
  materialize(
    input: NyxThreadMaterializeInput,
  ): Promise<NyxThreadResult<NyxThreadMaterializeResult>>
  saveDraft(input: NyxThreadSaveDraftInput): Promise<NyxThreadResult<NyxThreadSaveDraftResult>>
  retryOpen(input: NyxThreadRetryOpenInput): Promise<NyxThreadResult<null>>
  markSeen(input: NyxThreadMarkSeenInput): Promise<NyxThreadResult<NyxThreadMarkSeenResult>>
  subscribe(listener: NyxThreadEventListener): () => void
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
  threads: NyxDesktopThreadsApi
  provider: NyxDesktopProviderApi
  connections: NyxDesktopConnectionsApi
}
