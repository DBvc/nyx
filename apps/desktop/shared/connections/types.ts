export const nyxConnectionProviderKinds = ['openai-compatible'] as const

export type NyxConnectionProviderKind = (typeof nyxConnectionProviderKinds)[number]

export const nyxConnectionModelSources = ['manual', 'discovered'] as const

export type NyxConnectionModelSource = (typeof nyxConnectionModelSources)[number]

export const nyxConnectionDefaultTargetSources = [
  'persisted_default',
  'env_fallback',
  'missing',
] as const

export type NyxConnectionDefaultTargetSource = (typeof nyxConnectionDefaultTargetSources)[number]

export const nyxConnectionsErrorCodes = [
  'invalid_input',
  'not_found',
  'config_missing',
  'auth_failed',
  'rate_limited',
  'network_error',
  'upstream_error',
  'unsupported',
  'storage_unavailable',
  'encryption_unavailable',
  'unknown',
] as const

export type NyxConnectionsErrorCode = (typeof nyxConnectionsErrorCodes)[number]

export interface NyxConnectionsSafeError {
  code: NyxConnectionsErrorCode
  message: string
  retryable: boolean
  safeDetails?: string
}

export type NyxConnectionsResult<TValue> =
  | {
      ok: true
      value: TValue
    }
  | {
      ok: false
      error: NyxConnectionsSafeError
    }

export interface NyxConnectionTarget {
  providerId: string
  modelId: string
}

export interface NyxConnectionModelProfile {
  id: string
  displayName: string
  enabled: boolean
  source: NyxConnectionModelSource
  createdAt: string
  updatedAt: string
}

export interface NyxConnectionProviderSummary {
  id: string
  kind: NyxConnectionProviderKind
  displayName: string
  baseUrlHost: string | null
  enabled: boolean
  credentialStatus: 'stored' | 'missing'
  modelCount: number
  defaultModelId: string | null
  createdAt: string
  updatedAt: string
}

export interface NyxConnectionProviderDetail extends NyxConnectionProviderSummary {
  baseUrl: string
  models: ReadonlyArray<NyxConnectionModelProfile>
}

export interface NyxConnectionsOverview {
  providers: ReadonlyArray<NyxConnectionProviderSummary>
  defaultTarget: NyxConnectionTarget | null
  defaultTargetSource: NyxConnectionDefaultTargetSource
}

export type NyxConnectionsOverviewResult = NyxConnectionsResult<NyxConnectionsOverview>

export type NyxConnectionListProvidersResult = NyxConnectionsResult<
  ReadonlyArray<NyxConnectionProviderSummary>
>

export type NyxConnectionGetProviderResult = NyxConnectionsResult<NyxConnectionProviderDetail>

export interface NyxConnectionModelInput {
  id: string
  displayName?: string
  enabled?: boolean
}

export interface NyxConnectionCredentialInput {
  kind: 'api_key'
  value: string
}

export interface NyxConnectionSaveProviderInput {
  providerId?: string
  kind: NyxConnectionProviderKind
  displayName: string
  baseUrl: string
  enabled?: boolean
  credential?: NyxConnectionCredentialInput
  models: ReadonlyArray<NyxConnectionModelInput>
  defaultModelId?: string | null
}

export type NyxConnectionSaveProviderResult = NyxConnectionsResult<NyxConnectionProviderDetail>

export interface NyxConnectionDeleteProviderInput {
  providerId: string
}

export interface NyxConnectionDeleteProviderSuccess {
  providerId: string
}

export type NyxConnectionDeleteProviderResult =
  NyxConnectionsResult<NyxConnectionDeleteProviderSuccess>

export interface NyxConnectionSetDefaultTargetInput {
  target: NyxConnectionTarget | null
}

export type NyxConnectionSetDefaultTargetResult = NyxConnectionsResult<NyxConnectionsOverview>

export interface NyxConnectionProviderLookupInput {
  providerId: string
}

export interface NyxConnectionTestInput {
  providerId: string
  modelId?: string
}

export interface NyxConnectionTestSuccess {
  providerId: string
  modelId: string
  checkedAt: string
  latencyMs: number | null
}

export type NyxConnectionTestResult = NyxConnectionsResult<NyxConnectionTestSuccess>

export interface NyxConnectionRefreshModelsInput {
  providerId: string
}

export interface NyxConnectionRefreshModelsSuccess {
  providerId: string
  refreshedAt: string
  models: ReadonlyArray<NyxConnectionModelProfile>
  discoveredCount: number
  preservedManualCount: number
}

export type NyxConnectionRefreshModelsResult =
  NyxConnectionsResult<NyxConnectionRefreshModelsSuccess>
