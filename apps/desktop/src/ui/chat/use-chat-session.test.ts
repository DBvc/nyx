import { describe, expect, it, vi } from 'vitest'

import type { NyxCurrentThreadSnapshot } from '../../../shared/chat/snapshot'
import type { NyxConnectionsOverview } from '../../../shared/connections/types'
import { chatReducer } from './chat-reducer'
import { summarizeConnectionsOverview, type ConnectionStatusState } from './connection-status'
import { initialChatState, type ChatState } from './chat-types'
import {
  canSubmitChat,
  deriveTargetCatalogAction,
  revokeDraftPreviewUrls,
  toRequestMessages,
} from './use-chat-session'

type ReadyConnectionStatus = Extract<ConnectionStatusState, { kind: 'ready' }>

const committedTarget = {
  kind: 'connection',
  providerId: 'provider-1',
  modelId: 'model-1',
} as const

function overview(): NyxConnectionsOverview {
  return {
    providers: [
      {
        id: 'provider-1',
        kind: 'openai-compatible',
        displayName: 'Provider One',
        baseUrlHost: 'api.example.test',
        enabled: true,
        credentialStatus: 'stored',
        modelCount: 1,
        defaultModelId: 'model-1',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    defaultTarget: {
      providerId: 'provider-1',
      modelId: 'model-1',
    },
    defaultTargetSource: 'persisted_default',
    targetCatalog: {
      connectionTargets: [
        {
          providerId: 'provider-1',
          providerDisplayName: 'Provider One',
          modelId: 'model-1',
          modelDisplayName: 'Model One',
        },
      ],
      envFallback: { modelId: 'env-model' },
    },
  }
}

function readyStatus(requestEpoch = 1): ReadyConnectionStatus {
  const value = overview()

  return {
    kind: 'ready',
    requestEpoch,
    overview: value,
    summary: summarizeConnectionsOverview(value),
  }
}

function hydrate(state: ChatState) {
  const snapshot: NyxCurrentThreadSnapshot = {
    messages: [],
    runStatus: 'completed',
    retryableTurn: null,
    selectedTarget: committedTarget,
  }

  return chatReducer(state, {
    type: 'current-thread-hydrated',
    generation: state.projectionGeneration,
    snapshot,
  })
}

function applyTargetCatalog(state: ChatState, status: ConnectionStatusState) {
  const action = deriveTargetCatalogAction(state, status)

  return action ? chatReducer(state, action) : state
}

describe('target catalog lifecycle', () => {
  it('converges on the same draft when catalog or snapshot completes first', () => {
    const status = readyStatus(2)

    let catalogFirst = applyTargetCatalog(initialChatState, status)
    catalogFirst = hydrate(catalogFirst)
    catalogFirst = applyTargetCatalog(catalogFirst, status)

    let snapshotFirst = hydrate(initialChatState)
    snapshotFirst = applyTargetCatalog(snapshotFirst, {
      kind: 'loading',
      requestEpoch: 1,
      overview: null,
    })
    snapshotFirst = applyTargetCatalog(snapshotFirst, status)

    expect(catalogFirst).toMatchObject({
      targetDraft: committedTarget,
      targetAvailable: true,
      targetCatalogEpoch: 2,
      projectionGeneration: 0,
    })
    expect(snapshotFirst).toEqual(catalogFirst)
  })

  it('blocks Send for a committed unavailable target until an available draft is chosen', () => {
    const status = readyStatus()
    const unavailableOverview = {
      ...status.overview,
      defaultTarget: null,
      defaultTargetSource: 'env_fallback' as const,
      targetCatalog: {
        connectionTargets: [],
        envFallback: { modelId: 'env-model' },
      },
    }
    const unavailableStatus: ReadyConnectionStatus = {
      ...status,
      overview: unavailableOverview,
      summary: summarizeConnectionsOverview(unavailableOverview),
    }
    const hydrated = hydrate(initialChatState)
    const initialized = applyTargetCatalog(hydrated, unavailableStatus)
    const withInput = chatReducer(initialized, { type: 'set-input', value: 'Hello' })

    expect(withInput.targetDraft).toEqual(committedTarget)
    expect(withInput.targetAvailable).toBe(false)
    expect(canSubmitChat(withInput, unavailableStatus)).toBe(false)

    const available = chatReducer(withInput, {
      type: 'target-draft-changed',
      selection: { kind: 'env_fallback' },
      available: true,
    })

    expect(canSubmitChat(available, unavailableStatus)).toBe(true)
  })

  it('blocks Send when a new ready overview removes the draft before catalog state updates', () => {
    const status = readyStatus()
    const withInput = chatReducer(applyTargetCatalog(hydrate(initialChatState), status), {
      type: 'set-input',
      value: 'Hello',
    })
    const changedOverview = {
      ...status.overview,
      targetCatalog: {
        ...status.overview.targetCatalog,
        connectionTargets: [],
      },
    }

    expect(
      canSubmitChat(withInput, {
        ...status,
        requestEpoch: 2,
        overview: changedOverview,
        summary: summarizeConnectionsOverview(changedOverview),
      }),
    ).toBe(false)
  })

  it('allows image-only Send only after every draft is ready', () => {
    const status = readyStatus()
    const base = applyTargetCatalog(hydrate(initialChatState), status)
    const preparing = {
      ...base,
      draftImages: [
        {
          id: 'draft-1',
          name: 'image.png',
          status: 'preparing' as const,
          source: new Blob(),
        },
      ],
    }

    expect(canSubmitChat(preparing, status)).toBe(false)
    expect(
      canSubmitChat(
        {
          ...preparing,
          draftImages: [
            {
              id: 'draft-1',
              name: 'image.png',
              status: 'ready',
              source: null,
              image: { mediaType: 'image/png', width: 1, height: 1 },
              canonicalBytes: new Uint8Array([1]),
              previewBytes: new Uint8Array([2]),
              previewUrl: 'blob:preview-1',
            },
          ],
        },
        status,
      ),
    ).toBe(true)
  })

  it('keeps image-only user entries in compatibility request history', () => {
    expect(
      toRequestMessages([
        {
          id: 'user-1',
          role: 'user',
          content: '',
          status: 'completed',
          images: [
            {
              imageId: '00000000-0000-4000-8000-000000000001',
              mediaType: 'image/png',
              width: 1,
              height: 1,
              available: true,
            },
          ],
        },
      ]),
    ).toEqual([{ role: 'user', content: '' }])
  })

  it('revokes only selected ready draft URLs', () => {
    const revoke = vi.fn()

    revokeDraftPreviewUrls(
      [
        {
          id: 'ready',
          name: 'ready.png',
          status: 'ready',
          source: null,
          image: { mediaType: 'image/png', width: 1, height: 1 },
          canonicalBytes: new Uint8Array([1]),
          previewBytes: new Uint8Array([2]),
          previewUrl: 'blob:ready',
        },
        {
          id: 'failed',
          name: 'failed.png',
          status: 'failed',
          source: new Blob(),
          error: 'failed',
        },
      ],
      new Set(['ready', 'failed']),
      revoke,
    )

    expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:ready')
  })
})
