import { describe, expect, it, vi } from 'vitest'

import type { ChatProviderConfig } from '../chat/env'
import {
  createChatProviderConfigResolver,
  createLazyChatProviderConfigResolver,
} from './provider-resolver'
import type { ConnectionStoreState } from './schemas'

const timestamp = '2026-01-01T00:00:00.000Z'

function providerState(overrides: Partial<ConnectionStoreState> = {}): ConnectionStoreState {
  return {
    version: 1,
    providers: [
      {
        id: 'provider-1',
        kind: 'openai-compatible',
        displayName: 'Provider One',
        baseUrl: 'https://api.example.com/custom/v1',
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
      },
    ],
    defaultTarget: {
      providerId: 'provider-1',
      modelId: 'model-1',
    },
    ...overrides,
  }
}

function envConfig(): ChatProviderConfig {
  return {
    baseUrl: 'https://env.example.com/v1/',
    token: 'env-token',
    model: 'env-model',
  }
}

describe('createChatProviderConfigResolver', () => {
  it('resolves the persisted default target before using the env fallback', async () => {
    const envConfigReader = vi.fn(envConfig)
    const resolver = createChatProviderConfigResolver({
      connectionStore: {
        readState: vi.fn(async () => providerState()),
      },
      secretStore: {
        readSecret: vi.fn(async () => 'stored-secret'),
      },
      envConfigReader,
    })

    await expect(resolver()).resolves.toEqual({
      baseUrl: 'https://api.example.com/custom/v1/',
      token: 'stored-secret',
      model: 'model-1',
    })
    expect(envConfigReader).not.toHaveBeenCalled()
  })

  it('strips credentials and query secrets from persisted provider base URLs', async () => {
    const resolver = createChatProviderConfigResolver({
      connectionStore: {
        readState: vi.fn(async () =>
          providerState({
            providers: [
              {
                ...providerState().providers[0]!,
                baseUrl: 'https://user:secret@api.example.com/custom/v1?api_key=hidden#secret',
              },
            ],
          }),
        ),
      },
      secretStore: {
        readSecret: vi.fn(async () => 'stored-secret'),
      },
      envConfigReader: vi.fn(envConfig),
    })

    await expect(resolver()).resolves.toMatchObject({
      baseUrl: 'https://api.example.com/custom/v1/',
    })
  })

  it('falls back to env config when no persisted default target exists', async () => {
    const secretStore = {
      readSecret: vi.fn(async () => 'stored-secret'),
    }
    const envConfigReader = vi.fn(envConfig)
    const resolver = createChatProviderConfigResolver({
      connectionStore: {
        readState: vi.fn(async () => providerState({ defaultTarget: null })),
      },
      secretStore,
      envConfigReader,
    })

    await expect(resolver()).resolves.toEqual(envConfig())
    expect(secretStore.readSecret).not.toHaveBeenCalled()
    expect(envConfigReader).toHaveBeenCalledTimes(1)
  })

  it('fails closed when persisted settings cannot be read', async () => {
    const envConfigReader = vi.fn(envConfig)
    const resolver = createChatProviderConfigResolver({
      connectionStore: {
        readState: vi.fn(async () => {
          throw new Error('raw persisted provider failure')
        }),
      },
      secretStore: {
        readSecret: vi.fn(async () => 'stored-secret'),
      },
      envConfigReader,
    })

    await expect(resolver()).rejects.toMatchObject({
      chatError: {
        code: 'config_missing',
        message: 'No usable chat provider configuration is available.',
        retryable: false,
      },
    })
    expect(envConfigReader).not.toHaveBeenCalled()
  })

  it('maps a missing persisted secret to config_missing without falling back to env', async () => {
    const envConfigReader = vi.fn(envConfig)
    const resolver = createChatProviderConfigResolver({
      connectionStore: {
        readState: vi.fn(async () => providerState()),
      },
      secretStore: {
        readSecret: vi.fn(async () => null),
      },
      envConfigReader,
    })

    await expect(resolver()).rejects.toMatchObject({
      chatError: {
        code: 'config_missing',
        retryable: false,
      },
    })
    expect(envConfigReader).not.toHaveBeenCalled()
  })

  it('maps secret decrypt failures to config_missing without leaking the raw failure', async () => {
    const resolver = createChatProviderConfigResolver({
      connectionStore: {
        readState: vi.fn(async () => providerState()),
      },
      secretStore: {
        readSecret: vi.fn(async () => {
          throw new Error('decrypt failed with raw secret context')
        }),
      },
      envConfigReader: vi.fn(envConfig),
    })

    let caughtError: unknown

    try {
      await resolver()
    } catch (error) {
      caughtError = error
    }

    expect(caughtError).toMatchObject({
      chatError: {
        code: 'config_missing',
        message: 'No usable chat provider configuration is available.',
        retryable: false,
      },
    })
    expect(JSON.stringify(caughtError)).not.toContain('raw secret context')
  })

  it('maps invalid persisted default targets to config_missing', async () => {
    const resolver = createChatProviderConfigResolver({
      connectionStore: {
        readState: vi.fn(async () =>
          providerState({
            providers: [
              {
                ...providerState().providers[0]!,
                enabled: false,
              },
            ],
          }),
        ),
      },
      secretStore: {
        readSecret: vi.fn(async () => 'stored-secret'),
      },
      envConfigReader: vi.fn(envConfig),
    })

    await expect(resolver()).rejects.toMatchObject({
      chatError: {
        code: 'config_missing',
        retryable: false,
      },
    })
  })

  it('maps a missing future explicit target to invalid_request', async () => {
    const envConfigReader = vi.fn(envConfig)
    const resolver = createChatProviderConfigResolver({
      connectionStore: {
        readState: vi.fn(async () => providerState({ defaultTarget: null })),
      },
      secretStore: {
        readSecret: vi.fn(async () => 'stored-secret'),
      },
      envConfigReader,
    })

    await expect(
      resolver({
        target: {
          providerId: 'missing-provider',
          modelId: 'missing-model',
        },
      }),
    ).rejects.toMatchObject({
      chatError: {
        code: 'invalid_request',
        retryable: false,
      },
    })
    expect(envConfigReader).not.toHaveBeenCalled()
  })
})

describe('createLazyChatProviderConfigResolver', () => {
  it('creates store dependencies only on first resolution and then reuses them', async () => {
    const createDependencies = vi.fn(() => ({
      connectionStore: {
        readState: vi.fn(async () => providerState({ defaultTarget: null })),
      },
      secretStore: {
        readSecret: vi.fn(async () => 'stored-secret'),
      },
      envConfigReader: vi.fn(envConfig),
    }))
    const resolver = createLazyChatProviderConfigResolver({ createDependencies })

    expect(createDependencies).not.toHaveBeenCalled()

    await expect(resolver()).resolves.toEqual(envConfig())
    await expect(resolver()).resolves.toEqual(envConfig())
    expect(createDependencies).toHaveBeenCalledTimes(1)
  })
})
