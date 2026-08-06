import { describe, expect, it } from 'vitest'

import type { NyxConnectionsOverview } from '../../../shared/connections/types'
import type { NyxProviderStatus } from '../../../shared/provider/types'
import {
  isChatTargetAvailable,
  selectInitialChatTarget,
  summarizeConnectionsOverview,
} from './connection-status'

const provider = {
  id: 'provider-1',
  kind: 'openai-compatible',
  displayName: 'Local Relay',
  baseUrlHost: 'relay.example.test',
  enabled: true,
  credentialStatus: 'stored',
  modelCount: 1,
  defaultModelId: 'model-1',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
} as const

function overview(overrides: Partial<NyxConnectionsOverview> = {}): NyxConnectionsOverview {
  return {
    providers: [provider],
    defaultTarget: {
      providerId: 'provider-1',
      modelId: 'model-1',
    },
    defaultTargetSource: 'persisted_default',
    targetCatalog: {
      connectionTargets: [],
      envFallback: null,
    },
    ...overrides,
  }
}

const envStatus = {
  configured: true,
  model: 'env-model',
  baseUrlHost: 'env.example.test',
  missingEnv: [],
} satisfies NyxProviderStatus

describe('connection status presenters', () => {
  it('summarizes a persisted default without private URL details', () => {
    const summary = summarizeConnectionsOverview(overview())

    expect(summary).toEqual({
      configured: true,
      source: 'persisted_default',
      tone: 'ready',
      title: 'Saved connection ready',
      detail: 'Local Relay · model-1 · relay.example.test',
    })
    expect(JSON.stringify(summary)).not.toContain('https://')
    expect(JSON.stringify(summary)).not.toContain('api_key')
  })

  it('marks a persisted default without a stored key as setup needed', () => {
    const summary = summarizeConnectionsOverview(
      overview({
        providers: [
          {
            ...provider,
            credentialStatus: 'missing',
          },
        ],
      }),
    )

    expect(summary).toMatchObject({
      configured: false,
      source: 'persisted_default',
      tone: 'warning',
      title: 'Saved provider needs an API key',
    })
  })

  it('summarizes env fallback with redacted host and model only', () => {
    const summary = summarizeConnectionsOverview(
      overview({
        providers: [],
        defaultTarget: null,
        defaultTargetSource: 'env_fallback',
      }),
      envStatus,
    )

    expect(summary).toEqual({
      configured: true,
      source: 'env_fallback',
      tone: 'ready',
      title: 'Environment fallback ready',
      detail: 'env.example.test · env-model',
    })
  })

  it('uses a generic env fallback summary without provider status', () => {
    const summary = summarizeConnectionsOverview(
      overview({
        providers: [],
        defaultTarget: null,
        defaultTargetSource: 'env_fallback',
      }),
    )

    expect(summary.detail).toBe('Using .env provider settings')
  })

  it('marks missing connection setup as not configured', () => {
    const summary = summarizeConnectionsOverview(
      overview({
        providers: [],
        defaultTarget: null,
        defaultTargetSource: 'missing',
      }),
    )

    expect(summary).toMatchObject({
      configured: false,
      source: 'missing',
      tone: 'warning',
    })
  })
})

describe('Composer target projection', () => {
  it('keeps a committed unavailable target ahead of the global default', () => {
    const committed = {
      kind: 'connection',
      providerId: 'deleted-provider',
      modelId: 'deleted-model',
    } as const
    const currentOverview = overview({
      targetCatalog: {
        connectionTargets: [
          {
            providerId: 'provider-1',
            providerDisplayName: 'Local Relay',
            modelId: 'model-1',
            modelDisplayName: 'Model One',
          },
        ],
        envFallback: { modelId: 'env-model' },
      },
    })

    expect(selectInitialChatTarget(committed, currentOverview)).toEqual(committed)
    expect(isChatTargetAvailable(committed, currentOverview)).toBe(false)
  })

  it('seeds the persisted default, then env fallback, only when no target is committed', () => {
    expect(selectInitialChatTarget(null, overview())).toEqual({
      kind: 'connection',
      providerId: 'provider-1',
      modelId: 'model-1',
    })

    expect(
      selectInitialChatTarget(
        null,
        overview({
          defaultTarget: null,
          defaultTargetSource: 'env_fallback',
          targetCatalog: {
            connectionTargets: [],
            envFallback: { modelId: 'env-model' },
          },
        }),
      ),
    ).toEqual({ kind: 'env_fallback' })
  })
})
