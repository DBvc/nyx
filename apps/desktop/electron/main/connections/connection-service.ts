import type { NyxProviderStatus } from '../../../shared/provider/types'
import type {
  NyxConnectionDeleteProviderInput,
  NyxConnectionDeleteProviderResult,
  NyxConnectionCredentialActionResult,
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
import {
  ConnectionsProviderError,
  createProviderConnectionClient,
  type ProviderConnectionClient,
} from './provider-test'
import type { ConnectionProviderRecord } from './schemas'
import { SecretStore, SecretStoreError } from './secret-store'
import { normalizeConnectionBaseUrl, readConnectionBaseUrlHost } from './url'

export interface ConnectionsServiceDependencies {
  connectionStore: Pick<
    ConnectionStore,
    | 'deleteProvider'
    | 'getProvider'
    | 'listProviders'
    | 'mergeDiscoveredModels'
    | 'readState'
    | 'saveProvider'
    | 'setDefaultTarget'
  >
  secretStore: Pick<SecretStore, 'deleteSecret' | 'hasSecret' | 'readSecret' | 'writeSecret'>
  credentialActions: {
    reveal(value: string): void | Promise<void>
    copy(value: string): void | Promise<void>
  }
  providerClient?: ProviderConnectionClient
  providerStatusReader?: () => NyxProviderStatus
  now?: () => string
}

export interface LazyConnectionsServiceOptions {
  createDependencies: () => ConnectionsServiceDependencies
}

export interface ConnectionsController {
  overview(): Promise<NyxConnectionsOverviewResult>
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

function ok<TValue>(value: TValue): NyxConnectionsResult<TValue> {
  return { ok: true, value }
}

function fail<TValue>(error: NyxConnectionsSafeError): NyxConnectionsResult<TValue> {
  return { ok: false, error }
}

function operationError(error: NyxConnectionsSafeError): never {
  throw new ConnectionsProviderError(error)
}

function toSafeError(error: unknown): NyxConnectionsSafeError {
  if (error instanceof ConnectionsProviderError) {
    return error.safeError
  }

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
  private readonly credentialActions: ConnectionsServiceDependencies['credentialActions']
  private readonly providerClient: ProviderConnectionClient
  private readonly providerStatusReader: () => NyxProviderStatus
  private readonly now: () => string

  constructor({
    connectionStore,
    secretStore,
    credentialActions,
    providerClient = createProviderConnectionClient(),
    providerStatusReader = readProviderStatus,
    now = () => new Date().toISOString(),
  }: ConnectionsServiceDependencies) {
    this.connectionStore = connectionStore
    this.secretStore = secretStore
    this.credentialActions = credentialActions
    this.providerClient = providerClient
    this.providerStatusReader = providerStatusReader
    this.now = now
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

  async revealProviderCredential(input: NyxConnectionProviderLookupInput) {
    return this.runCredentialAction(input, (value) => this.credentialActions.reveal(value))
  }

  async copyProviderCredential(input: NyxConnectionProviderLookupInput) {
    return this.runCredentialAction(input, (value) => this.credentialActions.copy(value))
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

  async testProvider(input: NyxConnectionTestInput): Promise<NyxConnectionTestResult> {
    return safeResult(async () => {
      const provider = await this.readUsableProvider(input.providerId)
      const model = this.resolveEnabledTestModel(provider, input.modelId)
      const apiKey = await this.readRequiredSecret(provider.id)
      const result = await this.providerClient.testConnection({
        apiKey,
        baseUrl: normalizeConnectionBaseUrl(provider.baseUrl),
        modelId: model.id,
      })

      return {
        providerId: provider.id,
        modelId: model.id,
        checkedAt: this.now(),
        latencyMs: result.latencyMs,
      } satisfies NyxConnectionTestSuccess
    })
  }

  async refreshModels(
    input: NyxConnectionRefreshModelsInput,
  ): Promise<NyxConnectionRefreshModelsResult> {
    return safeResult(async () => {
      const provider = await this.readUsableProvider(input.providerId)
      const apiKey = await this.readRequiredSecret(provider.id)
      const result = await this.providerClient.refreshModels({
        apiKey,
        baseUrl: normalizeConnectionBaseUrl(provider.baseUrl),
      })
      const merged = await this.connectionStore.mergeDiscoveredModels(provider.id, result.modelIds)

      return {
        providerId: provider.id,
        refreshedAt: this.now(),
        models: merged.provider.models.map((model) => ({ ...model })),
        discoveredCount: merged.discoveredCount,
        preservedManualCount: merged.preservedManualCount,
      } satisfies NyxConnectionRefreshModelsSuccess
    })
  }

  private async readOverview(): Promise<NyxConnectionsOverview> {
    const state = await this.connectionStore.readState()
    const providerStatus = this.providerStatusReader()
    const [providers, connectionTargetGroups] = await Promise.all([
      Promise.all(state.providers.map((provider) => this.toProviderSummary(provider))),
      Promise.all(state.providers.map((provider) => this.toConnectionTargets(provider))),
    ])
    const defaultTargetSource: NyxConnectionDefaultTargetSource = state.defaultTarget
      ? 'persisted_default'
      : providerStatus.configured
        ? 'env_fallback'
        : 'missing'

    return {
      providers,
      defaultTarget: state.defaultTarget ? { ...state.defaultTarget } : null,
      defaultTargetSource,
      targetCatalog: {
        connectionTargets: connectionTargetGroups.flat(),
        envFallback:
          providerStatus.configured && providerStatus.model
            ? { modelId: providerStatus.model }
            : null,
      },
    }
  }

  private async toConnectionTargets(provider: ConnectionProviderRecord) {
    if (!provider.enabled) {
      return []
    }

    const enabledModels = provider.models.filter((model) => model.enabled)

    if (enabledModels.length === 0) {
      return []
    }

    let secret: string | null

    try {
      secret = await this.secretStore.readSecret(provider.id)
    } catch {
      return []
    }

    if (!secret?.trim()) {
      return []
    }

    return enabledModels.map((model) => ({
      providerId: provider.id,
      providerDisplayName: provider.displayName,
      modelId: model.id,
      modelDisplayName: model.displayName,
    }))
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

  private async readUsableProvider(providerId: string) {
    const provider = await this.connectionStore.getProvider(trimRequired(providerId, 'providerId'))

    if (!provider) {
      throw new ConnectionStoreError('not_found', 'Provider was not found.')
    }

    if (!provider.enabled) {
      operationError({
        code: 'invalid_input',
        message: 'Provider must be enabled before contacting the provider.',
        retryable: false,
      })
    }

    return provider
  }

  private resolveEnabledTestModel(provider: ConnectionProviderRecord, inputModelId?: string) {
    const requestedModelId = inputModelId?.trim()

    if (requestedModelId) {
      const model = provider.models.find((candidate) => candidate.id === requestedModelId)

      if (!model || !model.enabled) {
        operationError({
          code: 'invalid_input',
          message: 'Requested test model must be enabled.',
          retryable: false,
        })
      }

      return model
    }

    const defaultModel = provider.defaultModelId
      ? provider.models.find((candidate) => candidate.id === provider.defaultModelId)
      : null

    if (!defaultModel || !defaultModel.enabled) {
      operationError({
        code: 'invalid_input',
        message: 'Provider needs an enabled default model before testing.',
        retryable: false,
      })
    }

    return defaultModel
  }

  private async readRequiredSecret(providerId: string) {
    const secret = await this.secretStore.readSecret(providerId)
    const apiKey = secret?.trim()

    if (!apiKey) {
      operationError({
        code: 'config_missing',
        message: 'Saved provider credentials are missing.',
        retryable: false,
      })
    }

    return apiKey
  }

  private async runCredentialAction(
    input: NyxConnectionProviderLookupInput,
    action: (value: string) => void | Promise<void>,
  ): Promise<NyxConnectionCredentialActionResult> {
    return safeResult(async () => {
      const providerId = trimRequired(input.providerId, 'providerId')
      const provider = await this.connectionStore.getProvider(providerId)

      if (!provider) {
        throw new ConnectionStoreError('not_found', 'Provider was not found.')
      }

      await action(await this.readRequiredSecret(providerId))

      return { providerId }
    })
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
    revealProviderCredential: (input) => {
      return getService().revealProviderCredential(input)
    },
    copyProviderCredential: (input) => {
      return getService().copyProviderCredential(input)
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
