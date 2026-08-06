import { describe, expect, it, vi } from 'vitest'

import type { ChatProviderConfig } from '../chat/env'
import {
  createChatTargetResolver,
  createLazyChatTargetResolver,
  type ResolvedChatTarget,
} from './provider-resolver'
import type { ConnectionStoreState } from './schemas'

const timestamp = '2026-01-01T00:00:00.000Z'
const connectionSelection = {
  kind: 'connection',
  providerId: 'provider-1',
  modelId: 'model-1',
} as const
const envSelection = { kind: 'env_fallback' } as const

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

function envTarget(): ResolvedChatTarget {
  return {
    providerId: null,
    baseUrl: 'https://env.example.com/v1/',
    token: 'env-token',
    modelId: 'env-model',
    protocol: 'openai-chat-completions',
    targetAttribution: {
      kind: 'env_fallback',
      modelId: 'env-model',
    },
  }
}

describe('createChatTargetResolver', () => {
  it('resolves the explicitly selected connection target', async () => {
    const envConfigReader = vi.fn(envConfig)
    const resolver = createChatTargetResolver({
      connectionStore: {
        readState: vi.fn(async () => providerState()),
      },
      secretStore: {
        readSecret: vi.fn(async () => 'stored-secret'),
      },
      envConfigReader,
    })

    await expect(resolver(connectionSelection)).resolves.toEqual({
      providerId: 'provider-1',
      baseUrl: 'https://api.example.com/custom/v1/',
      token: 'stored-secret',
      modelId: 'model-1',
      protocol: 'openai-chat-completions',
      targetAttribution: {
        kind: 'connection',
        providerId: 'provider-1',
        providerDisplayName: 'Provider One',
        modelId: 'model-1',
        modelDisplayName: 'Model One',
      },
    })
    expect(envConfigReader).not.toHaveBeenCalled()
  })

  it('strips credentials and query secrets from persisted provider base URLs', async () => {
    const resolver = createChatTargetResolver({
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

    await expect(resolver(connectionSelection)).resolves.toMatchObject({
      baseUrl: 'https://api.example.com/custom/v1/',
    })
  })

  it('resolves the explicit env fallback without consulting persisted defaults', async () => {
    const secretStore = {
      readSecret: vi.fn(async () => 'stored-secret'),
    }
    const envConfigReader = vi.fn(envConfig)
    const resolver = createChatTargetResolver({
      connectionStore: {
        readState: vi.fn(async () => providerState({ defaultTarget: null })),
      },
      secretStore,
      envConfigReader,
    })

    await expect(resolver(envSelection)).resolves.toEqual(envTarget())
    expect(secretStore.readSecret).not.toHaveBeenCalled()
    expect(envConfigReader).toHaveBeenCalledTimes(1)
  })

  it('fails the explicit env fallback closed when it is no longer configured', async () => {
    const readState = vi.fn(async () => providerState())
    const resolver = createChatTargetResolver({
      connectionStore: { readState },
      secretStore: { readSecret: vi.fn(async () => 'stored-secret') },
      envConfigReader: vi.fn(() => {
        throw new Error('raw env detail')
      }),
    })

    await expect(resolver(envSelection)).rejects.toMatchObject({
      chatError: {
        code: 'target_unavailable',
        message: 'The selected chat target is unavailable.',
        retryable: true,
      },
    })
    expect(readState).not.toHaveBeenCalled()
  })

  it('preserves an explicit Connections target identity', async () => {
    const envConfigReader = vi.fn(envConfig)
    const resolver = createChatTargetResolver({
      connectionStore: {
        readState: vi.fn(async () => providerState({ defaultTarget: null })),
      },
      secretStore: {
        readSecret: vi.fn(async () => 'stored-secret'),
      },
      envConfigReader,
    })

    await expect(resolver(connectionSelection)).resolves.toEqual({
      providerId: 'provider-1',
      baseUrl: 'https://api.example.com/custom/v1/',
      token: 'stored-secret',
      modelId: 'model-1',
      protocol: 'openai-chat-completions',
      targetAttribution: {
        kind: 'connection',
        providerId: 'provider-1',
        providerDisplayName: 'Provider One',
        modelId: 'model-1',
        modelDisplayName: 'Model One',
      },
    })
    expect(envConfigReader).not.toHaveBeenCalled()
  })

  it('fails closed when persisted settings cannot be read', async () => {
    const envConfigReader = vi.fn(envConfig)
    const resolver = createChatTargetResolver({
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

    await expect(resolver(connectionSelection)).rejects.toMatchObject({
      chatError: {
        code: 'target_unavailable',
        message: 'The selected chat target is unavailable.',
        retryable: true,
      },
    })
    expect(envConfigReader).not.toHaveBeenCalled()
  })

  it('maps a missing persisted secret to target_unavailable without falling back to env', async () => {
    const envConfigReader = vi.fn(envConfig)
    const resolver = createChatTargetResolver({
      connectionStore: {
        readState: vi.fn(async () => providerState()),
      },
      secretStore: {
        readSecret: vi.fn(async () => null),
      },
      envConfigReader,
    })

    await expect(resolver(connectionSelection)).rejects.toMatchObject({
      chatError: {
        code: 'target_unavailable',
        retryable: true,
      },
    })
    expect(envConfigReader).not.toHaveBeenCalled()
  })

  it('maps secret decrypt failures to config_missing without leaking the raw failure', async () => {
    const resolver = createChatTargetResolver({
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
      await resolver(connectionSelection)
    } catch (error) {
      caughtError = error
    }

    expect(caughtError).toMatchObject({
      chatError: {
        code: 'target_unavailable',
        message: 'The selected chat target is unavailable.',
        retryable: true,
      },
    })
    expect(JSON.stringify(caughtError)).not.toContain('raw secret context')
  })

  it('maps disabled selected targets to target_unavailable', async () => {
    const resolver = createChatTargetResolver({
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

    await expect(resolver(connectionSelection)).rejects.toMatchObject({
      chatError: {
        code: 'target_unavailable',
        retryable: true,
      },
    })
  })

  it('maps a missing selected target to target_unavailable', async () => {
    const envConfigReader = vi.fn(envConfig)
    const resolver = createChatTargetResolver({
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
        kind: 'connection',
        providerId: 'missing-provider',
        modelId: 'missing-model',
      }),
    ).rejects.toMatchObject({
      chatError: {
        code: 'target_unavailable',
        retryable: true,
      },
    })
    expect(envConfigReader).not.toHaveBeenCalled()
  })
})

describe('createLazyChatTargetResolver', () => {
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
    const resolver = createLazyChatTargetResolver({ createDependencies })

    expect(createDependencies).not.toHaveBeenCalled()

    await expect(resolver(envSelection)).resolves.toEqual(envTarget())
    await expect(resolver(envSelection)).resolves.toEqual(envTarget())
    expect(createDependencies).toHaveBeenCalledTimes(1)
  })

  it('reports unavailable when resolver dependencies cannot be created', () => {
    const resolver = createLazyChatTargetResolver({
      createDependencies: () => {
        throw new Error('Storage unavailable')
      },
    })

    expect.assertions(1)

    try {
      resolver(envSelection)
    } catch (error) {
      expect(error).toMatchObject({
        chatError: {
          code: 'target_unavailable',
          retryable: true,
        },
      })
    }
  })
})
