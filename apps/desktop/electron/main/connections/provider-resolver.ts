import type { NyxConnectionTarget } from '../../../shared/connections/types'
import type { ChatProviderConfig } from '../chat/env'
import { readChatProviderConfig } from '../chat/env'
import { ChatBridgeError, createChatBridgeError } from '../chat/errors'
import type { ConnectionStore } from './connection-store'
import type { ConnectionProviderRecord, ConnectionStoreState } from './schemas'
import type { SecretStore } from './secret-store'
import { normalizeConnectionBaseUrl } from './url'

export interface ResolveChatTargetInput {
  target?: NyxConnectionTarget
}

export interface ResolvedChatTarget {
  providerId: string | null
  baseUrl: string
  token: string
  modelId: string
  protocol: 'openai-chat-completions'
}

export type ChatTargetResolver = (
  input?: ResolveChatTargetInput,
) => ResolvedChatTarget | Promise<ResolvedChatTarget>

export interface ChatTargetResolverDependencies {
  connectionStore: Pick<ConnectionStore, 'readState'>
  secretStore: Pick<SecretStore, 'readSecret'>
  envConfigReader?: () => ChatProviderConfig
}

export interface LazyChatTargetResolverOptions {
  createDependencies: () => ChatTargetResolverDependencies
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
  try {
    return normalizeConnectionBaseUrl(rawBaseUrl)
  } catch {
    throw createConfigMissingError()
  }
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
    const config = envConfigReader()

    return {
      providerId: null,
      baseUrl: config.baseUrl,
      token: config.token,
      modelId: config.model,
      protocol: 'openai-chat-completions',
    } satisfies ResolvedChatTarget
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
    providerId: provider.id,
    baseUrl: normalizeBaseUrl(provider.baseUrl),
    token: await readSecret(secretStore, provider.id),
    modelId: model.id,
    protocol: 'openai-chat-completions',
  } satisfies ResolvedChatTarget
}

export function readEnvChatTarget() {
  return readEnvFallback(readChatProviderConfig)
}

export function createChatTargetResolver({
  connectionStore,
  secretStore,
  envConfigReader = readChatProviderConfig,
}: ChatTargetResolverDependencies): ChatTargetResolver {
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

export function createLazyChatTargetResolver({
  createDependencies,
}: LazyChatTargetResolverOptions): ChatTargetResolver {
  let resolver: ChatTargetResolver | undefined

  return (input) => {
    try {
      resolver ??= createChatTargetResolver(createDependencies())
    } catch {
      throw createConfigMissingError()
    }

    return resolver(input)
  }
}
