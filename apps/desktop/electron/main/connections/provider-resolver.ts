import type { NyxConnectionTarget } from '../../../shared/connections/types'
import type { ChatProviderConfig } from '../chat/env'
import { readChatProviderConfig } from '../chat/env'
import { ChatBridgeError, createChatBridgeError } from '../chat/errors'
import type { ConnectionStore } from './connection-store'
import type { ConnectionProviderRecord, ConnectionStoreState } from './schemas'
import type { SecretStore } from './secret-store'

export interface ResolveChatProviderConfigInput {
  target?: NyxConnectionTarget
}

export type ChatProviderConfigResolver = (
  input?: ResolveChatProviderConfigInput,
) => ChatProviderConfig | Promise<ChatProviderConfig>

export interface ChatProviderResolverDependencies {
  connectionStore: Pick<ConnectionStore, 'readState'>
  secretStore: Pick<SecretStore, 'readSecret'>
  envConfigReader?: () => ChatProviderConfig
}

export interface LazyChatProviderConfigResolverOptions {
  createDependencies: () => ChatProviderResolverDependencies
}

type TargetSource = 'explicit' | 'persisted_default'

function createConfigMissingError() {
  return createChatBridgeError({
    code: 'config_missing',
    message: 'No usable chat provider configuration is available.',
    retryable: false,
  })
}

function createInvalidTargetError() {
  return createChatBridgeError({
    code: 'invalid_request',
    message: 'Requested provider target is not available.',
    retryable: false,
  })
}

function normalizeBaseUrl(rawBaseUrl: string) {
  let url: URL

  try {
    url = new URL(rawBaseUrl)
  } catch {
    throw createConfigMissingError()
  }

  if (!url.pathname.endsWith('/')) {
    url.pathname = `${url.pathname}/`
  }

  return url.toString()
}

function findTarget(
  state: ConnectionStoreState,
  target: NyxConnectionTarget,
  source: TargetSource,
) {
  const provider = state.providers.find((candidate) => candidate.id === target.providerId)
  const model = provider?.models.find((candidate) => candidate.id === target.modelId)

  if (!provider || !provider.enabled || !model || !model.enabled) {
    if (source === 'explicit') {
      throw createInvalidTargetError()
    }

    throw createConfigMissingError()
  }

  return { provider, model }
}

async function readState(connectionStore: Pick<ConnectionStore, 'readState'>) {
  try {
    return await connectionStore.readState()
  } catch {
    throw createConfigMissingError()
  }
}

async function readSecret(secretStore: Pick<SecretStore, 'readSecret'>, providerId: string) {
  try {
    const secret = await secretStore.readSecret(providerId)
    const trimmedSecret = secret?.trim()

    if (!trimmedSecret) {
      throw createConfigMissingError()
    }

    return trimmedSecret
  } catch (error) {
    if (error instanceof ChatBridgeError) {
      throw error
    }

    throw createConfigMissingError()
  }
}

function readEnvFallback(envConfigReader: () => ChatProviderConfig) {
  try {
    return envConfigReader()
  } catch (error) {
    if (error instanceof ChatBridgeError && error.chatError.code === 'config_missing') {
      throw error
    }

    throw createConfigMissingError()
  }
}

async function resolvePersistedTarget({
  provider,
  model,
  secretStore,
}: {
  provider: ConnectionProviderRecord
  model: ConnectionProviderRecord['models'][number]
  secretStore: Pick<SecretStore, 'readSecret'>
}) {
  return {
    baseUrl: normalizeBaseUrl(provider.baseUrl),
    token: await readSecret(secretStore, provider.id),
    model: model.id,
  } satisfies ChatProviderConfig
}

export function createChatProviderConfigResolver({
  connectionStore,
  secretStore,
  envConfigReader = readChatProviderConfig,
}: ChatProviderResolverDependencies): ChatProviderConfigResolver {
  return async (input = {}) => {
    const state = await readState(connectionStore)

    if (input.target) {
      return resolvePersistedTarget({
        ...findTarget(state, input.target, 'explicit'),
        secretStore,
      })
    }

    if (!state.defaultTarget) {
      return readEnvFallback(envConfigReader)
    }

    return resolvePersistedTarget({
      ...findTarget(state, state.defaultTarget, 'persisted_default'),
      secretStore,
    })
  }
}

export function createLazyChatProviderConfigResolver({
  createDependencies,
}: LazyChatProviderConfigResolverOptions): ChatProviderConfigResolver {
  let resolver: ChatProviderConfigResolver | undefined

  return (input) => {
    try {
      resolver ??= createChatProviderConfigResolver(createDependencies())
    } catch {
      throw createConfigMissingError()
    }

    return resolver(input)
  }
}
