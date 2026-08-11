import { createHash } from 'node:crypto'

import type { NyxChatTargetAttribution, NyxChatTargetSelection } from '../../../shared/chat/types'
import type { NyxConnectionModelProtocolConfig } from '../../../shared/connections/types'
import type { ChatProviderConfig } from '../chat/env'
import { readChatProviderConfig } from '../chat/env'
import { ChatBridgeError, createChatBridgeError } from '../chat/errors'
import type { ConnectionStore } from './connection-store'
import type { ConnectionProviderRecord, ConnectionStoreState } from './schemas'
import type { SecretStore } from './secret-store'
import { normalizeConnectionBaseUrl } from './url'

export interface ResolvedChatTarget {
  providerId: string | null
  baseUrl: string
  token: string
  modelId: string
  protocolConfig: NyxConnectionModelProtocolConfig
  executionIdentity: string | null
  targetAttribution: NyxChatTargetAttribution
}

export type ChatTargetResolver = (
  selection: NyxChatTargetSelection,
) => ResolvedChatTarget | Promise<ResolvedChatTarget>

export interface ChatTargetResolverDependencies {
  connectionStore: Pick<ConnectionStore, 'readState'>
  secretStore: Pick<SecretStore, 'readCredential'>
  envConfigReader?: () => ChatProviderConfig
}

export interface LazyChatTargetResolverOptions {
  createDependencies: () => ChatTargetResolverDependencies
}

function createConfigMissingError() {
  return createChatBridgeError({
    code: 'config_missing',
    message: 'No usable chat provider configuration is available.',
    retryable: false,
  })
}

function createTargetUnavailableError() {
  return createChatBridgeError({
    code: 'target_unavailable',
    message: 'The selected chat target is unavailable.',
    retryable: true,
  })
}

function normalizeBaseUrl(rawBaseUrl: string) {
  try {
    return normalizeConnectionBaseUrl(rawBaseUrl)
  } catch {
    throw createTargetUnavailableError()
  }
}

function findTarget(
  state: ConnectionStoreState,
  target: Extract<NyxChatTargetSelection, { kind: 'connection' }>,
) {
  const provider = state.providers.find((candidate) => candidate.id === target.providerId)
  const model = provider?.models.find((candidate) => candidate.id === target.modelId)

  if (!provider || !provider.enabled || !model || !model.enabled) {
    throw createTargetUnavailableError()
  }

  return { provider, model }
}

async function readState(connectionStore: Pick<ConnectionStore, 'readState'>) {
  try {
    return await connectionStore.readState()
  } catch {
    throw createTargetUnavailableError()
  }
}

async function readCredential(
  secretStore: Pick<SecretStore, 'readCredential'>,
  providerId: string,
) {
  try {
    const credential = await secretStore.readCredential(providerId)
    const value = credential?.value.trim()

    if (!credential || !value) {
      throw createTargetUnavailableError()
    }

    return { value, credentialRevision: credential.credentialRevision }
  } catch (error) {
    if (error instanceof ChatBridgeError) {
      throw error
    }

    throw createTargetUnavailableError()
  }
}

export function createTargetExecutionIdentity({
  providerId,
  normalizedBaseUrl,
  modelId,
  modelProtocolConfig,
  credentialRevision,
}: {
  providerId: string
  normalizedBaseUrl: string
  modelId: string
  modelProtocolConfig: NyxConnectionModelProtocolConfig
  credentialRevision: string
}) {
  const canonicalProtocolConfig =
    modelProtocolConfig.protocol === 'openai-responses'
      ? {
          protocol: modelProtocolConfig.protocol,
          reasoningContext: modelProtocolConfig.reasoningContext,
        }
      : { protocol: modelProtocolConfig.protocol }
  const canonical = JSON.stringify({
    providerId,
    normalizedBaseUrl,
    modelId,
    modelProtocolConfig: canonicalProtocolConfig,
    credentialRevision,
  })

  return createHash('sha256').update(canonical).digest('hex')
}

function readEnvFallback(envConfigReader: () => ChatProviderConfig) {
  try {
    const config = envConfigReader()

    return {
      providerId: null,
      baseUrl: config.baseUrl,
      token: config.token,
      modelId: config.model,
      protocolConfig: { protocol: 'openai-chat-completions' },
      executionIdentity: null,
      targetAttribution: {
        kind: 'env_fallback',
        modelId: config.model,
      },
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
  secretStore: Pick<SecretStore, 'readCredential'>
}) {
  const baseUrl = normalizeBaseUrl(provider.baseUrl)
  const credential = await readCredential(secretStore, provider.id)

  return {
    providerId: provider.id,
    baseUrl,
    token: credential.value,
    modelId: model.id,
    protocolConfig: { ...model.protocolConfig },
    executionIdentity: createTargetExecutionIdentity({
      providerId: provider.id,
      normalizedBaseUrl: baseUrl,
      modelId: model.id,
      modelProtocolConfig: model.protocolConfig,
      credentialRevision: credential.credentialRevision,
    }),
    targetAttribution: {
      kind: 'connection',
      providerId: provider.id,
      providerDisplayName: provider.displayName,
      modelId: model.id,
      modelDisplayName: model.displayName,
    },
  } satisfies ResolvedChatTarget
}

export function readEnvChatTarget() {
  return readEnvFallback(readChatProviderConfig)
}

export function resolveEnvChatTargetSelection(
  selection: NyxChatTargetSelection,
): ResolvedChatTarget {
  if (selection.kind !== 'env_fallback') {
    throw createTargetUnavailableError()
  }

  try {
    return readEnvChatTarget()
  } catch {
    throw createTargetUnavailableError()
  }
}

export function createChatTargetResolver({
  connectionStore,
  secretStore,
  envConfigReader = readChatProviderConfig,
}: ChatTargetResolverDependencies): ChatTargetResolver {
  return async (selection) => {
    if (selection.kind === 'env_fallback') {
      try {
        return readEnvFallback(envConfigReader)
      } catch {
        throw createTargetUnavailableError()
      }
    }

    const state = await readState(connectionStore)

    return resolvePersistedTarget({
      ...findTarget(state, selection),
      secretStore,
    })
  }
}

export function createLazyChatTargetResolver({
  createDependencies,
}: LazyChatTargetResolverOptions): ChatTargetResolver {
  let resolver: ChatTargetResolver | undefined

  return (selection) => {
    try {
      resolver ??= createChatTargetResolver(createDependencies())
    } catch {
      throw createTargetUnavailableError()
    }

    return resolver(selection)
  }
}
