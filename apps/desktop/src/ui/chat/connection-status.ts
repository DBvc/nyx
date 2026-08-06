import type {
  NyxConnectionProviderSummary,
  NyxConnectionsOverview,
} from '../../../shared/connections/types'
import type { NyxChatTargetSelection } from '../../../shared/chat/types'
import type { NyxProviderStatus } from '../../../shared/provider/types'

export type ConnectionStatusSource = 'persisted_default' | 'env_fallback' | 'missing'
export type ConnectionStatusTone = 'ready' | 'warning' | 'error'

export interface ConnectionStatusSummary {
  configured: boolean
  source: ConnectionStatusSource
  tone: ConnectionStatusTone
  title: string
  detail: string
}

export type ConnectionStatusState =
  | { kind: 'loading'; requestEpoch: number; overview: NyxConnectionsOverview | null }
  | {
      kind: 'ready'
      requestEpoch: number
      overview: NyxConnectionsOverview
      summary: ConnectionStatusSummary
    }
  | {
      kind: 'failed'
      requestEpoch: number
      overview: NyxConnectionsOverview | null
      message: string
    }

export function selectInitialChatTarget(
  committedTarget: NyxChatTargetSelection | null,
  overview: NyxConnectionsOverview,
): NyxChatTargetSelection | null {
  if (committedTarget) {
    return { ...committedTarget }
  }

  if (overview.defaultTarget) {
    return {
      kind: 'connection',
      providerId: overview.defaultTarget.providerId,
      modelId: overview.defaultTarget.modelId,
    }
  }

  return overview.targetCatalog.envFallback ? { kind: 'env_fallback' } : null
}

export function isChatTargetAvailable(
  selection: NyxChatTargetSelection | null,
  overview: NyxConnectionsOverview,
) {
  if (!selection) {
    return false
  }

  if (selection.kind === 'env_fallback') {
    return overview.targetCatalog.envFallback !== null
  }

  return overview.targetCatalog.connectionTargets.some(
    (target) => target.providerId === selection.providerId && target.modelId === selection.modelId,
  )
}

export function chatTargetSelectionKey(selection: NyxChatTargetSelection) {
  return JSON.stringify(selection)
}

function findDefaultProvider(overview: NyxConnectionsOverview) {
  if (!overview.defaultTarget) {
    return null
  }

  return (
    overview.providers.find((provider) => provider.id === overview.defaultTarget?.providerId) ??
    null
  )
}

function modelLabel(provider: NyxConnectionProviderSummary | null, modelId: string | null) {
  return modelId ?? provider?.defaultModelId ?? 'No model'
}

export function summarizeConnectionsOverview(
  overview: NyxConnectionsOverview,
  envStatus: NyxProviderStatus | null = null,
): ConnectionStatusSummary {
  if (overview.defaultTargetSource === 'persisted_default') {
    const provider = findDefaultProvider(overview)
    const modelId = overview.defaultTarget?.modelId ?? null
    const targetLabel = `${provider?.displayName ?? 'Saved provider'} · ${modelLabel(
      provider,
      modelId,
    )}`

    if (!provider) {
      return {
        configured: false,
        source: 'persisted_default',
        tone: 'error',
        title: 'Saved default unavailable',
        detail: 'Choose an enabled provider and model in Connections.',
      }
    }

    if (provider.credentialStatus !== 'stored') {
      return {
        configured: false,
        source: 'persisted_default',
        tone: 'warning',
        title: 'Saved provider needs an API key',
        detail: targetLabel,
      }
    }

    return {
      configured: true,
      source: 'persisted_default',
      tone: 'ready',
      title: 'Saved connection ready',
      detail: provider.baseUrlHost ? `${targetLabel} · ${provider.baseUrlHost}` : targetLabel,
    }
  }

  if (overview.defaultTargetSource === 'env_fallback') {
    const details = [envStatus?.baseUrlHost, envStatus?.model].filter(Boolean)

    return {
      configured: true,
      source: 'env_fallback',
      tone: 'ready',
      title: 'Environment fallback ready',
      detail: details.length > 0 ? details.join(' · ') : 'Using .env provider settings',
    }
  }

  return {
    configured: false,
    source: 'missing',
    tone: 'warning',
    title: 'Connection setup needed',
    detail: 'Add a saved provider or configure the environment fallback.',
  }
}

export function connectionStatusErrorMessage(_error: unknown) {
  return 'Nyx could not read the connection status.'
}
