import { describe, expect, it, vi } from 'vitest'

import type { NyxConnectionModelProtocolConfig } from '../../../shared/connections/types'
import type { ChatProviderConfig } from '../chat/env'
import {
  createChatTargetResolver,
  createLazyChatTargetResolver,
  createTargetExecutionIdentity,
  type ResolvedChatTarget,
} from './provider-resolver'
import type { ConnectionStoreState } from './schemas'

const timestamp = '2026-01-01T00:00:00.000Z'
const credentialRevision = '00000000-0000-4000-8000-000000000001'
const chatProtocolConfig = { protocol: 'openai-chat-completions' } as const
const connectionSelection = {
  kind: 'connection',
  providerId: 'provider-1',
  modelId: 'model-1',
} as const
const envSelection = { kind: 'env_fallback' } as const

function providerState(
  protocolConfig: NyxConnectionModelProtocolConfig = chatProtocolConfig,
): ConnectionStoreState {
  return {
    version: 2,
    providers: [
      {
        id: 'provider-1',
        kind: 'openai-compatible',
        displayName: 'Provider One',
        baseUrl: 'https://api.example.com/custom/v1',
        enabled: true,
        defaultProtocolConfigForNewModels: chatProtocolConfig,
        models: [
          {
            id: 'model-1',
            displayName: 'Model One',
            enabled: true,
            source: 'manual',
            protocolConfig,
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        ],
        defaultModelId: 'model-1',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    defaultTarget: connectionSelection,
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
    protocolConfig: chatProtocolConfig,
    executionIdentity: null,
    targetAttribution: { kind: 'env_fallback', modelId: 'env-model' },
  }
}

function credentialStore(value = 'stored-secret', revision = credentialRevision) {
  return {
    readCredential: vi.fn(async () => ({ value, credentialRevision: revision })),
  }
}

describe('createChatTargetResolver', () => {
  it.each([
    chatProtocolConfig,
    { protocol: 'openai-responses', reasoningContext: 'auto' } as const,
  ])('resolves an explicit model protocol and exact execution identity', async (protocolConfig) => {
    const resolver = createChatTargetResolver({
      connectionStore: { readState: vi.fn(async () => providerState(protocolConfig)) },
      secretStore: credentialStore(),
      envConfigReader: vi.fn(envConfig),
    })

    await expect(resolver(connectionSelection)).resolves.toEqual({
      providerId: 'provider-1',
      baseUrl: 'https://api.example.com/custom/v1/',
      token: 'stored-secret',
      modelId: 'model-1',
      protocolConfig,
      executionIdentity: createTargetExecutionIdentity({
        providerId: 'provider-1',
        normalizedBaseUrl: 'https://api.example.com/custom/v1/',
        modelId: 'model-1',
        modelProtocolConfig: protocolConfig,
        credentialRevision,
      }),
      targetAttribution: {
        kind: 'connection',
        providerId: 'provider-1',
        providerDisplayName: 'Provider One',
        modelId: 'model-1',
        modelDisplayName: 'Model One',
      },
    })
  })

  it('resolves env fallback as Chat Completions without native execution identity', async () => {
    const secretStore = credentialStore()
    const resolver = createChatTargetResolver({
      connectionStore: { readState: vi.fn(async () => providerState()) },
      secretStore,
      envConfigReader: vi.fn(envConfig),
    })

    await expect(resolver(envSelection)).resolves.toEqual(envTarget())
    expect(secretStore.readCredential).not.toHaveBeenCalled()
  })

  it('sanitizes the persisted endpoint before using it or hashing execution identity', async () => {
    const state = providerState()
    state.providers[0]!.baseUrl =
      'https://user:secret@api.example.com/custom/v1?api_key=hidden#secret'
    const resolver = createChatTargetResolver({
      connectionStore: { readState: vi.fn(async () => state) },
      secretStore: credentialStore(),
      envConfigReader: vi.fn(envConfig),
    })

    await expect(resolver(connectionSelection)).resolves.toMatchObject({
      baseUrl: 'https://api.example.com/custom/v1/',
      executionIdentity: createTargetExecutionIdentity({
        providerId: 'provider-1',
        normalizedBaseUrl: 'https://api.example.com/custom/v1/',
        modelId: 'model-1',
        modelProtocolConfig: chatProtocolConfig,
        credentialRevision,
      }),
    })
  })

  it('fails the env target closed without reading persisted settings', async () => {
    const readState = vi.fn(async () => providerState())
    const resolver = createChatTargetResolver({
      connectionStore: { readState },
      secretStore: credentialStore(),
      envConfigReader: vi.fn(() => {
        throw new Error('private env detail')
      }),
    })

    await expect(resolver(envSelection)).rejects.toMatchObject({
      chatError: { code: 'target_unavailable', retryable: true },
    })
    expect(readState).not.toHaveBeenCalled()
  })

  it('fails selected connection targets closed when settings or credentials cannot be read', async () => {
    const settingsResolver = createChatTargetResolver({
      connectionStore: {
        readState: vi.fn(async () => {
          throw new Error('private settings detail')
        }),
      },
      secretStore: credentialStore(),
      envConfigReader: vi.fn(envConfig),
    })
    const credentialResolver = createChatTargetResolver({
      connectionStore: { readState: vi.fn(async () => providerState()) },
      secretStore: {
        readCredential: vi.fn(async () => {
          throw new Error('private credential detail')
        }),
      },
      envConfigReader: vi.fn(envConfig),
    })

    for (const resolver of [settingsResolver, credentialResolver]) {
      let caught: unknown

      try {
        await resolver(connectionSelection)
      } catch (error) {
        caught = error
      }

      expect(caught).toMatchObject({
        chatError: { code: 'target_unavailable', retryable: true },
      })
      expect(JSON.stringify(caught)).not.toContain('private')
    }
  })

  it.each(['provider', 'model', 'missing'] as const)(
    'fails a disabled or %s selected target closed without env fallback',
    async (variant) => {
      const state = providerState()

      if (variant === 'provider') {
        state.providers[0]!.enabled = false
      } else if (variant === 'model') {
        state.providers[0]!.models[0]!.enabled = false
      }

      const envConfigReader = vi.fn(envConfig)
      const resolver = createChatTargetResolver({
        connectionStore: { readState: vi.fn(async () => state) },
        secretStore: credentialStore(),
        envConfigReader,
      })
      const selection =
        variant === 'missing'
          ? { kind: 'connection' as const, providerId: 'missing', modelId: 'missing' }
          : connectionSelection

      await expect(resolver(selection)).rejects.toMatchObject({
        chatError: { code: 'target_unavailable', retryable: true },
      })
      expect(envConfigReader).not.toHaveBeenCalled()
    },
  )

  it('does not fall back when the selected credential is missing', async () => {
    const envConfigReader = vi.fn(envConfig)
    const resolver = createChatTargetResolver({
      connectionStore: { readState: vi.fn(async () => providerState()) },
      secretStore: { readCredential: vi.fn(async () => null) },
      envConfigReader,
    })

    await expect(resolver(connectionSelection)).rejects.toMatchObject({
      chatError: { code: 'target_unavailable', retryable: true },
    })
    expect(envConfigReader).not.toHaveBeenCalled()
  })
})

describe('createTargetExecutionIdentity', () => {
  it('changes for endpoint, model, protocol, or credential revision without hashing the secret', () => {
    const base = {
      providerId: 'provider-1',
      normalizedBaseUrl: 'https://api.example.com/v1/',
      modelId: 'model-1',
      modelProtocolConfig: chatProtocolConfig,
      credentialRevision,
    }
    const identity = createTargetExecutionIdentity(base)

    expect(identity).toMatch(/^[a-f0-9]{64}$/)
    expect(identity).not.toContain('stored-secret')
    expect(
      new Set([
        identity,
        createTargetExecutionIdentity({ ...base, normalizedBaseUrl: 'https://other.test/v1/' }),
        createTargetExecutionIdentity({ ...base, modelId: 'model-2' }),
        createTargetExecutionIdentity({
          ...base,
          modelProtocolConfig: { protocol: 'openai-responses', reasoningContext: 'auto' },
        }),
        createTargetExecutionIdentity({
          ...base,
          credentialRevision: '00000000-0000-4000-8000-000000000002',
        }),
      ]).size,
    ).toBe(5)
  })
})

describe('createLazyChatTargetResolver', () => {
  it('creates dependencies once', async () => {
    const createDependencies = vi.fn(() => ({
      connectionStore: { readState: vi.fn(async () => providerState()) },
      secretStore: credentialStore(),
      envConfigReader: vi.fn(envConfig),
    }))
    const resolver = createLazyChatTargetResolver({ createDependencies })

    await expect(resolver(envSelection)).resolves.toEqual(envTarget())
    await expect(resolver(envSelection)).resolves.toEqual(envTarget())
    expect(createDependencies).toHaveBeenCalledTimes(1)
  })

  it('fails closed when resolver dependencies cannot be created', () => {
    const resolver = createLazyChatTargetResolver({
      createDependencies: () => {
        throw new Error('private storage detail')
      },
    })

    expect(() => resolver(envSelection)).toThrowError(
      expect.objectContaining({
        chatError: expect.objectContaining({ code: 'target_unavailable' }),
      }),
    )
  })
})
