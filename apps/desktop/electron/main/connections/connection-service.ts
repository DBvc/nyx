import type { NyxProviderStatus } from '../../../shared/provider/types'
import type {
  NyxConnectionDeleteProviderInput,
  NyxConnectionDeleteProviderResult,
  NyxConnectionGetProviderResult,
  NyxConnectionListProvidersResult,
  NyxConnectionProviderDetail,
  NyxConnectionProviderLookupInput,
  NyxConnectionProviderSummary,
  NyxConnectionRefreshModelsSuccess,
  NyxConnectionRefreshModelsInput,
  NyxConnectionRefreshModelsResult,
  NyxConnectionsOverview,
  NyxConnectionsOverviewResult,
  NyxConnectionsResult,
  NyxConnectionsSafeError,
  NyxConnectionSaveProviderInput,
  NyxConnectionSaveProviderResult,
  NyxConnectionSetDefaultTargetInput,
  NyxConnectionSetDefaultTargetResult,
  NyxConnectionTestSuccess,
  NyxConnectionTestInput,
  NyxConnectionTestResult,
  NyxConnectionDefaultTargetSource,
} from '../../../shared/connections/types'
import { readProviderStatus } from '../chat/env'
import { ConfigFileError } from './config-file'
import { ConnectionStore, ConnectionStoreError } from './connection-store'
import type { ConnectionProviderRecord } from './schemas'
import { SecretStore, SecretStoreError } from './secret-store'
import { normalizeConnectionBaseUrl, readConnectionBaseUrlHost } from './url'

export interface ConnectionsServiceDependencies {
  connectionStore: Pick<
    ConnectionStore,
    | 'deleteProvider'
    | 'getProvider'
    | 'listProviders'
    | 'readState'
    | 'saveProvider'
    | 'setDefaultTarget'
  >
  secretStore: Pick<SecretStore, 'deleteSecret' | 'hasSecret' | 'writeSecret'>
  providerStatusReader?: () => NyxProviderStatus
}

export interface LazyConnectionsServiceOptions {
  createDependencies: () => ConnectionsServiceDependencies
}

export interface ConnectionsController {
  overview(): Promise<NyxConnectionsOverviewResult>
  listProviders(): Promise<NyxConnectionListProvidersResult>
  getProvider(input: NyxConnectionProviderLookupInput): Promise<NyxConnectionGetProviderResult>
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

function ok<TValue>(value: TValue): NyxConnectionsResult<TValue> {
  return { ok: true, value }
}

function fail<TValue>(error: NyxConnectionsSafeError): NyxConnectionsResult<TValue> {
  return { ok: false, error }
}

function unsupportedError(message: string): NyxConnectionsSafeError {
  return {
    code: 'unsupported',
    message,
    retryable: false,
  }
}

function toSafeError(error: unknown): NyxConnectionsSafeError {
  if (error instanceof ConnectionStoreError) {
    return {
      code: error.code,
      message: error.message,
      retryable: false,
    }
  }

  if (error instanceof SecretStoreError) {
    return {
      code: error.code === 'decrypt_failed' ? 'config_missing' : error.code,
      message:
        error.code === 'decrypt_failed'
          ? 'Stored provider credentials could not be read.'
          : error.message,
      retryable: false,
    }
  }

  if (error instanceof ConfigFileError) {
    return {
      code: 'storage_unavailable',
      message: 'Stored connections settings could not be read.',
      retryable: false,
    }
  }

  return {
    code: 'unknown',
    message: 'Connections settings operation failed.',
    retryable: true,
  }
}

async function safeResult<TValue>(operation: () => Promise<TValue>) {
  try {
    return ok(await operation())
  } catch (error) {
    return fail<TValue>(toSafeError(error))
  }
}

function trimRequired(value: string, field: string) {
  const trimmed = value.trim()

  if (!trimmed) {
    throw new ConnectionStoreError('invalid_input', `${field} is required.`)
  }

  return trimmed
}

function baseUrlHost(baseUrl: string) {
  return readConnectionBaseUrlHost(baseUrl)
}

function normalizeCredentialInput(credential: NyxConnectionSaveProviderInput['credential']) {
  if (!credential) {
    return null
  }

  if (credential.kind !== 'api_key') {
    throw new ConnectionStoreError('invalid_input', 'credential.kind is unsupported.')
  }

  return {
    kind: 'api_key' as const,
    value: trimRequired(credential.value, 'credential.value'),
  }
}

export class ConnectionsService implements ConnectionsController {
  private readonly connectionStore: ConnectionsServiceDependencies['connectionStore']
  private readonly secretStore: ConnectionsServiceDependencies['secretStore']
  private readonly providerStatusReader: () => NyxProviderStatus

  constructor({
    connectionStore,
    secretStore,
    providerStatusReader = readProviderStatus,
  }: ConnectionsServiceDependencies) {
    this.connectionStore = connectionStore
    this.secretStore = secretStore
    this.providerStatusReader = providerStatusReader
  }

  async overview() {
    return safeResult(() => this.readOverview())
  }

  async listProviders() {
    return safeResult(async () => {
      const providers = await this.connectionStore.listProviders()

      return Promise.all(providers.map((provider) => this.toProviderSummary(provider)))
    })
  }

  async getProvider(input: NyxConnectionProviderLookupInput) {
    return safeResult(async () => {
      const providerId = trimRequired(input.providerId, 'providerId')
      const provider = await this.connectionStore.getProvider(providerId)

      if (!provider) {
        throw new ConnectionStoreError('not_found', 'Provider was not found.')
      }

      return this.toProviderDetail(provider)
    })
  }

  async saveProvider(input: NyxConnectionSaveProviderInput) {
    return safeResult(async () => {
      const credential = normalizeCredentialInput(input.credential)
      const { credential: _credential, ...settingsInput } = input
      const provider = await this.connectionStore.saveProvider(settingsInput)

      if (credential) {
        await this.secretStore.writeSecret(provider.id, credential.value)
      }

      return this.toProviderDetail(provider)
    })
  }

  async deleteProvider(input: NyxConnectionDeleteProviderInput) {
    return safeResult(async () => {
      const providerId = trimRequired(input.providerId, 'providerId')
      const result = await this.connectionStore.deleteProvider(providerId)

      await this.secretStore.deleteSecret(providerId)

      return result
    })
  }

  async setDefaultTarget(input: NyxConnectionSetDefaultTargetInput) {
    return safeResult(async () => {
      await this.connectionStore.setDefaultTarget(input)

      return this.readOverview()
    })
  }

  async testProvider(_input: NyxConnectionTestInput): Promise<NyxConnectionTestResult> {
    return fail<NyxConnectionTestSuccess>(
      unsupportedError('Test connection is not implemented yet.'),
    )
  }

  async refreshModels(
    _input: NyxConnectionRefreshModelsInput,
  ): Promise<NyxConnectionRefreshModelsResult> {
    return fail<NyxConnectionRefreshModelsSuccess>(
      unsupportedError('Refresh models is not implemented yet.'),
    )
  }

  private async readOverview(): Promise<NyxConnectionsOverview> {
    const state = await this.connectionStore.readState()
    const providers = await Promise.all(
      state.providers.map((provider) => this.toProviderSummary(provider)),
    )
    const defaultTargetSource: NyxConnectionDefaultTargetSource = state.defaultTarget
      ? 'persisted_default'
      : this.providerStatusReader().configured
        ? 'env_fallback'
        : 'missing'

    return {
      providers,
      defaultTarget: state.defaultTarget ? { ...state.defaultTarget } : null,
      defaultTargetSource,
    }
  }

  private async toProviderSummary(
    provider: ConnectionProviderRecord,
  ): Promise<NyxConnectionProviderSummary> {
    return {
      id: provider.id,
      kind: provider.kind,
      displayName: provider.displayName,
      baseUrlHost: baseUrlHost(provider.baseUrl),
      enabled: provider.enabled,
      credentialStatus: (await this.secretStore.hasSecret(provider.id)) ? 'stored' : 'missing',
      modelCount: provider.models.length,
      defaultModelId: provider.defaultModelId,
      createdAt: provider.createdAt,
      updatedAt: provider.updatedAt,
    }
  }

  private async toProviderDetail(
    provider: ConnectionProviderRecord,
  ): Promise<NyxConnectionProviderDetail> {
    return {
      ...(await this.toProviderSummary(provider)),
      baseUrl: normalizeConnectionBaseUrl(provider.baseUrl),
      models: provider.models.map((model) => ({ ...model })),
    }
  }
}

export function createConnectionsService(dependencies: ConnectionsServiceDependencies) {
  return new ConnectionsService(dependencies)
}

export function createLazyConnectionsService({
  createDependencies,
}: LazyConnectionsServiceOptions): ConnectionsController {
  let service: ConnectionsController | undefined
  const getService = () => {
    service ??= createConnectionsService(createDependencies())

    return service
  }

  return {
    overview: () => {
      return getService().overview()
    },
    listProviders: () => {
      return getService().listProviders()
    },
    getProvider: (input) => {
      return getService().getProvider(input)
    },
    saveProvider: (input) => {
      return getService().saveProvider(input)
    },
    deleteProvider: (input) => {
      return getService().deleteProvider(input)
    },
    setDefaultTarget: (input) => {
      return getService().setDefaultTarget(input)
    },
    testProvider: (input) => {
      return getService().testProvider(input)
    },
    refreshModels: (input) => {
      return getService().refreshModels(input)
    },
  }
}
