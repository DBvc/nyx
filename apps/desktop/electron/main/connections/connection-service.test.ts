import { describe, expect, it, vi } from 'vitest'

import type { NyxConnectionSetDefaultTargetInput } from '../../../shared/connections/types'
import { ConfigFileError } from './config-file'
import { ConnectionsService, type ConnectionsServiceDependencies } from './connection-service'
import type { SaveProviderSettingsInput } from './connection-store'
import { ConnectionStoreError } from './connection-store'
import type { ConnectionProviderRecord, ConnectionStoreState } from './schemas'

const timestamp = '2026-01-01T00:00:00.000Z'

function providerRecord(
  overrides: Partial<ConnectionProviderRecord> = {},
): ConnectionProviderRecord {
  return {
    id: 'provider-1',
    kind: 'openai-compatible',
    displayName: 'Provider One',
    baseUrl: 'https://token-user:secret@api.example.com/custom/v1?api_key=hidden',
    enabled: true,
    models: [
      {
        id: 'model-1',
        displayName: 'Model One',
        enabled: true,
        source: 'manual',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    defaultModelId: 'model-1',
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  }
}

function cloneProvider(provider: ConnectionProviderRecord): ConnectionProviderRecord {
  return {
    ...provider,
    models: provider.models.map((model) => ({ ...model })),
  }
}

function cloneState(state: ConnectionStoreState): ConnectionStoreState {
  return {
    version: 1,
    providers: state.providers.map(cloneProvider),
    defaultTarget: state.defaultTarget ? { ...state.defaultTarget } : null,
  }
}

function createServiceHarness(initialState: ConnectionStoreState) {
  let state = cloneState(initialState)
  const secrets = new Map<string, string>()
  const writeSecret = vi.fn(async (providerId: string, value: string) => {
    secrets.set(providerId, value)
  })
  const deleteSecret = vi.fn(async (providerId: string) => {
    secrets.delete(providerId)

    return { providerId }
  })
  const connectionStore: ConnectionsServiceDependencies['connectionStore'] = {
    readState: vi.fn(async () => cloneState(state)),
    listProviders: vi.fn(async () => cloneState(state).providers),
    getProvider: vi.fn(async (providerId: string) => {
      const provider = state.providers.find((candidate) => candidate.id === providerId)

      return provider ? cloneProvider(provider) : null
    }),
    saveProvider: vi.fn(async (input: SaveProviderSettingsInput) => {
      const now = timestamp
      const provider = {
        id: input.providerId ?? 'provider-new',
        kind: input.kind,
        displayName: input.displayName,
        baseUrl: input.baseUrl,
        enabled: input.enabled ?? true,
        models: input.models.map((model) => ({
          id: model.id,
          displayName: model.displayName ?? model.id,
          enabled: model.enabled ?? true,
          source: 'manual' as const,
          createdAt: now,
          updatedAt: now,
        })),
        defaultModelId: input.defaultModelId ?? input.models[0]?.id ?? null,
        createdAt: now,
        updatedAt: now,
      } satisfies ConnectionProviderRecord
      const existingIndex = state.providers.findIndex((candidate) => candidate.id === provider.id)

      if (existingIndex >= 0) {
        state.providers[existingIndex] = provider
      } else {
        state.providers.push(provider)
      }

      return cloneProvider(provider)
    }),
    deleteProvider: vi.fn(async (providerId: string) => {
      const provider = state.providers.find((candidate) => candidate.id === providerId)

      if (!provider) {
        throw new ConnectionStoreError('not_found', 'Provider was not found.')
      }

      state.providers = state.providers.filter((candidate) => candidate.id !== providerId)

      return { providerId }
    }),
    mergeDiscoveredModels: vi.fn(async (providerId: string, modelIds: ReadonlyArray<string>) => {
      const provider = state.providers.find((candidate) => candidate.id === providerId)

      if (!provider) {
        throw new ConnectionStoreError('not_found', 'Provider was not found.')
      }

      const manualModels = provider.models.filter((model) => model.source === 'manual')
      const manualIds = new Set(manualModels.map((model) => model.id))
      const discoveredModels = modelIds
        .filter((modelId) => !manualIds.has(modelId))
        .map((modelId) => ({
          id: modelId,
          displayName: modelId,
          enabled: true,
          source: 'discovered' as const,
          createdAt: timestamp,
          updatedAt: timestamp,
        }))

      provider.models = [...manualModels, ...discoveredModels]

      if (
        !provider.defaultModelId ||
        !provider.models.some((model) => model.id === provider.defaultModelId)
      ) {
        provider.defaultModelId = provider.models[0]?.id ?? null
      }

      return {
        provider: cloneProvider(provider),
        discoveredCount: modelIds.length,
        preservedManualCount: manualModels.length,
      }
    }),
    setDefaultTarget: vi.fn(async (input: NyxConnectionSetDefaultTargetInput) => {
      state.defaultTarget = input.target ? { ...input.target } : null

      return state.defaultTarget ? { ...state.defaultTarget } : null
    }),
  }
  const secretStore: ConnectionsServiceDependencies['secretStore'] = {
    hasSecret: vi.fn(async (providerId: string) => secrets.has(providerId)),
    readSecret: vi.fn(async (providerId: string) => secrets.get(providerId) ?? null),
    writeSecret,
    deleteSecret,
  }
  const providerClient: NonNullable<ConnectionsServiceDependencies['providerClient']> = {
    testConnection: vi.fn(async () => ({ latencyMs: 42 })),
    refreshModels: vi.fn(async () => ({ modelIds: ['model-2'] })),
  }
  const service = new ConnectionsService({
    connectionStore,
    secretStore,
    providerClient,
    providerStatusReader: () => ({
      configured: false,
      model: null,
      baseUrlHost: null,
      missingEnv: ['NYX_API_BASE_URL', 'NYX_API_TOKEN'],
    }),
    now: () => timestamp,
  })

  return {
    connectionStore,
    providerClient,
    secretStore,
    service,
    secrets,
  }
}

describe('ConnectionsService', () => {
  it('returns a redacted overview without full base URLs or secrets', async () => {
    const harness = createServiceHarness({
      version: 1,
      providers: [providerRecord()],
      defaultTarget: {
        providerId: 'provider-1',
        modelId: 'model-1',
      },
    })
    harness.secrets.set('provider-1', 'sk-super-secret')

    const result = await harness.service.overview()

    expect(result).toEqual({
      ok: true,
      value: {
        providers: [
          {
            id: 'provider-1',
            kind: 'openai-compatible',
            displayName: 'Provider One',
            baseUrlHost: 'api.example.com',
            enabled: true,
            credentialStatus: 'stored',
            modelCount: 1,
            defaultModelId: 'model-1',
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        ],
        defaultTarget: {
          providerId: 'provider-1',
          modelId: 'model-1',
        },
        defaultTargetSource: 'persisted_default',
      },
    })
    expect(JSON.stringify(result)).not.toContain('sk-super-secret')
    expect(JSON.stringify(result)).not.toContain('api_key=hidden')
    expect(JSON.stringify(result)).not.toContain('/custom/v1')
  })

  it('returns editable provider details without URL credentials or query secrets', async () => {
    const harness = createServiceHarness({
      version: 1,
      providers: [providerRecord()],
      defaultTarget: null,
    })

    const result = await harness.service.getProvider({ providerId: 'provider-1' })

    expect(result).toMatchObject({
      ok: true,
      value: {
        baseUrl: 'https://api.example.com/custom/v1/',
      },
    })
    expect(JSON.stringify(result)).not.toContain('token-user')
    expect(JSON.stringify(result)).not.toContain('secret@')
    expect(JSON.stringify(result)).not.toContain('api_key=hidden')
  })

  it('falls back to env source in overview without exposing env secrets', async () => {
    const harness = createServiceHarness({
      version: 1,
      providers: [],
      defaultTarget: null,
    })
    const service = new ConnectionsService({
      connectionStore: harness.connectionStore,
      secretStore: harness.secretStore,
      providerStatusReader: () => ({
        configured: true,
        model: 'env-model',
        baseUrlHost: 'env.example.com',
        missingEnv: [],
      }),
    })

    await expect(service.overview()).resolves.toEqual({
      ok: true,
      value: {
        providers: [],
        defaultTarget: null,
        defaultTargetSource: 'env_fallback',
      },
    })
  })

  it('saves provider settings and writes credentials without returning the credential', async () => {
    const harness = createServiceHarness({
      version: 1,
      providers: [],
      defaultTarget: null,
    })

    const result = await harness.service.saveProvider({
      kind: 'openai-compatible',
      displayName: 'Provider New',
      baseUrl: 'https://api.example.com/v1',
      credential: {
        kind: 'api_key',
        value: 'sk-new-secret',
      },
      models: [
        {
          id: 'model-new',
        },
      ],
    })

    expect(result).toMatchObject({
      ok: true,
      value: {
        id: 'provider-new',
        credentialStatus: 'stored',
        baseUrl: 'https://api.example.com/v1/',
      },
    })
    expect(harness.secretStore.writeSecret).toHaveBeenCalledWith('provider-new', 'sk-new-secret')
    expect(JSON.stringify(result)).not.toContain('sk-new-secret')
  })

  it('rejects blank credentials before provider settings are saved', async () => {
    const harness = createServiceHarness({
      version: 1,
      providers: [],
      defaultTarget: null,
    })

    const result = await harness.service.saveProvider({
      kind: 'openai-compatible',
      displayName: 'Provider New',
      baseUrl: 'https://api.example.com/v1',
      credential: {
        kind: 'api_key',
        value: '   ',
      },
      models: [
        {
          id: 'model-new',
        },
      ],
    })

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'invalid_input',
        message: 'credential.value is required.',
        retryable: false,
      },
    })
    expect(harness.connectionStore.saveProvider).not.toHaveBeenCalled()
    expect(harness.secretStore.writeSecret).not.toHaveBeenCalled()
  })

  it('deletes provider settings and the matching stored credential', async () => {
    const harness = createServiceHarness({
      version: 1,
      providers: [providerRecord()],
      defaultTarget: null,
    })
    harness.secrets.set('provider-1', 'sk-super-secret')

    await expect(harness.service.deleteProvider({ providerId: 'provider-1' })).resolves.toEqual({
      ok: true,
      value: {
        providerId: 'provider-1',
      },
    })
    expect(harness.secretStore.deleteSecret).toHaveBeenCalledWith('provider-1')
    expect(harness.secrets.has('provider-1')).toBe(false)
  })

  it('sets the default target and returns an updated overview', async () => {
    const harness = createServiceHarness({
      version: 1,
      providers: [providerRecord()],
      defaultTarget: null,
    })

    const result = await harness.service.setDefaultTarget({
      target: {
        providerId: 'provider-1',
        modelId: 'model-1',
      },
    })

    expect(result).toMatchObject({
      ok: true,
      value: {
        defaultTarget: {
          providerId: 'provider-1',
          modelId: 'model-1',
        },
        defaultTargetSource: 'persisted_default',
      },
    })
  })

  it('maps storage failures to a safe result without leaking raw details', async () => {
    const harness = createServiceHarness({
      version: 1,
      providers: [],
      defaultTarget: null,
    })
    vi.mocked(harness.connectionStore.readState).mockRejectedValueOnce(
      new ConfigFileError('malformed_json', 'raw token-shaped local file detail'),
    )

    const result = await harness.service.overview()

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'storage_unavailable',
        message: 'Stored connections settings could not be read.',
        retryable: false,
      },
    })
    expect(JSON.stringify(result)).not.toContain('raw token-shaped local file detail')
  })

  it('tests a saved provider with its default enabled model without returning the secret', async () => {
    const harness = createServiceHarness({
      version: 1,
      providers: [providerRecord()],
      defaultTarget: null,
    })
    harness.secrets.set('provider-1', 'sk-super-secret')

    const result = await harness.service.testProvider({ providerId: 'provider-1' })

    expect(result).toEqual({
      ok: true,
      value: {
        providerId: 'provider-1',
        modelId: 'model-1',
        checkedAt: timestamp,
        latencyMs: 42,
      },
    })
    expect(harness.providerClient.testConnection).toHaveBeenCalledWith({
      apiKey: 'sk-super-secret',
      baseUrl: 'https://api.example.com/custom/v1/',
      modelId: 'model-1',
    })
    expect(JSON.stringify(result)).not.toContain('sk-super-secret')
  })

  it('returns a safe config error when provider credentials are missing', async () => {
    const harness = createServiceHarness({
      version: 1,
      providers: [providerRecord()],
      defaultTarget: null,
    })

    const result = await harness.service.testProvider({ providerId: 'provider-1' })

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'config_missing',
        message: 'Saved provider credentials are missing.',
        retryable: false,
      },
    })
    expect(harness.providerClient.testConnection).not.toHaveBeenCalled()
  })

  it('refreshes discovered models while preserving manual models', async () => {
    const harness = createServiceHarness({
      version: 1,
      providers: [providerRecord()],
      defaultTarget: null,
    })
    harness.secrets.set('provider-1', 'sk-super-secret')
    vi.mocked(harness.providerClient.refreshModels).mockResolvedValueOnce({
      modelIds: ['model-1', 'model-2'],
    })

    const result = await harness.service.refreshModels({ providerId: 'provider-1' })

    expect(result).toEqual({
      ok: true,
      value: {
        providerId: 'provider-1',
        refreshedAt: timestamp,
        discoveredCount: 2,
        preservedManualCount: 1,
        models: [
          {
            id: 'model-1',
            displayName: 'Model One',
            enabled: true,
            source: 'manual',
            createdAt: timestamp,
            updatedAt: timestamp,
          },
          {
            id: 'model-2',
            displayName: 'model-2',
            enabled: true,
            source: 'discovered',
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        ],
      },
    })
    expect(harness.connectionStore.mergeDiscoveredModels).toHaveBeenCalledWith('provider-1', [
      'model-1',
      'model-2',
    ])
    expect(JSON.stringify(result)).not.toContain('sk-super-secret')
  })
})
