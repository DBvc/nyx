import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { WebContents } from 'electron'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ResolvedChatTarget } from '../connections/provider-resolver'
import {
  createRuntimeChatStateClient,
  type RuntimeChatStateClient,
} from '../runtime/chat-state-client'
import { type PreparedThreadTurn, ThreadLibraryCoordinator } from '../thread-library/coordinator'
import type { ThreadLibraryThreadDetail } from '../thread-library/protocol'

const streamChatCompletion = vi.hoisted(() => vi.fn())
vi.mock('./client', () => ({ streamChatCompletion }))

import { ChatSessionManager, type UnclockedNyxChatEvent } from './session'

type BusinessEvent = Exclude<UnclockedNyxChatEvent, { type: 'chat:capacity' }>

function businessEvents(events: ReadonlyArray<UnclockedNyxChatEvent>): BusinessEvent[] {
  return events.filter((event): event is BusinessEvent => event.type !== 'chat:capacity')
}

const repoRoot = fileURLToPath(new URL('../../../../..', import.meta.url))
const artifactPath = join(repoRoot, 'apps', 'desktop', '.runtime-artifacts', 'nyx-runtime')
const integrationIt = process.env.NYX_RUNTIME_CHAT_STATE_INTEGRATION === '1' ? it : it.skip
const threadId = '00000000-0000-4000-8000-000000000001'
const imageId = '00000000-0000-4000-8000-000000000002'
const timestamp = '2026-08-13T00:00:00.000Z'
const selection = { kind: 'env_fallback' } as const
const attribution = { kind: 'env_fallback', modelId: 'model' } as const

function checkedRuntimeArtifactPath() {
  const runtimePath = resolve(process.env.NYX_RUNTIME_PATH ?? '')
  expect(process.env.NYX_RUNTIME_CHAT_STATE).toBeUndefined()
  expect(runtimePath).toBe(artifactPath)
  expect(existsSync(runtimePath)).toBe(true)
}

function detail(): ThreadLibraryThreadDetail {
  return {
    summary: {
      id: threadId,
      location: 'available',
      trashedFromLocation: null,
      trashedPinPosition: null,
      pinPosition: null,
      title: 'Thread',
      titleSource: 'auto',
      fallbackLocalSecond: null,
      fallbackOrdinal: null,
      threadRevision: 1,
      lastUserActivityAt: timestamp,
      resultRevision: 0,
      seenResultRevision: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    draft: {
      threadId,
      draftRevision: 1,
      text: '',
      targetSelection: selection,
      updatedAt: timestamp,
    },
    turns: [
      {
        threadId,
        ordinal: 0,
        attemptRequestId: 'request-1',
        userMessageId: 'user-1',
        assistantMessageId: 'assistant-1',
        userContent: 'Hello Nyx',
        assistantContent: '',
        assistantStatus: 'pending',
        error: null,
        targetSelection: selection,
        targetAttribution: attribution,
        providerStateId: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    images: [],
    documents: [],
    providerStateRefs: [],
  }
}

function prepared(): PreparedThreadTurn {
  const pending = detail()
  return {
    detail: pending,
    runtimeReplayDetail: { ...pending, turns: [] },
    threadId,
    requestId: 'request-1',
    userMessageId: 'user-1',
    assistantMessageId: 'assistant-1',
    targetSelection: selection,
    documentBearing: false,
    attachmentBearing: false,
  }
}

function target(): ResolvedChatTarget {
  return {
    providerId: 'env',
    baseUrl: 'https://example.test/v1',
    token: 'token',
    modelId: 'model',
    protocolConfig: { protocol: 'openai-chat-completions' },
    executionIdentity: 'a'.repeat(64),
    targetAttribution: attribution,
  }
}

function abortError() {
  const error = new Error('Aborted')
  error.name = 'AbortError'
  return error
}

async function waitFor(assertion: () => void) {
  let lastError: unknown
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try {
      assertion()
      return
    } catch (error) {
      lastError = error
      await new Promise((done) => setTimeout(done, 25))
    }
  }
  throw lastError
}

describe('ChatSessionManager runtime chat state artifact integration', () => {
  beforeEach(() => streamChatCompletion.mockReset())

  integrationIt('projects one canonical Thread turn through the real Runtime reducer', async () => {
    checkedRuntimeArtifactPath()
    const events: UnclockedNyxChatEvent[] = []
    const runtimeClients: RuntimeChatStateClient[] = []
    const pending = prepared()
    const coordinator = {
      classifyTurn: vi.fn(async () => false),
      prepareTurn: vi.fn(async () => pending),
      bindPreparedTarget: vi.fn(async () => pending.detail),
      materializeProviderMessages: vi.fn(async () => [
        { role: 'user' as const, content: 'Hello Nyx' },
      ]),
      replayRuntimeHistory: vi.fn(async () => undefined),
      settleTurn: vi.fn(async () => ({ id: 'settled', ok: true, value: detail() })),
    }
    streamChatCompletion.mockImplementationOnce(async ({ onDelta }) => {
      await onDelta('Hel', 'Hel')
      await onDelta('lo', 'Hello')
      return { finalContent: 'Hello' }
    })
    const manager = new ChatSessionManager({
      resolveThreadLibraryCoordinator: () => coordinator as unknown as ThreadLibraryCoordinator,
      publishChatEvent: (_sender, event) => events.push(event),
      resolveChatTarget: async () => target(),
      createRuntimeChatStateClient: () => {
        const client = createRuntimeChatStateClient()
        runtimeClients.push(client)
        return client
      },
      now: () => timestamp,
    })

    manager.start({} as WebContents, {
      threadId,
      requestId: 'request-1',
      turnIntent: 'new_user_message',
      expectedDraftRevision: 0,
    })
    await waitFor(() => expect(businessEvents(events).at(-1)?.type).toBe('chat:done'))
    await waitFor(() =>
      expect(events.at(-1)).toEqual({
        type: 'chat:capacity',
        activeRuns: 0,
        attachmentRunActive: false,
      }),
    )

    expect(businessEvents(events).map((event) => event.type)).toEqual([
      'chat:accepted',
      'chat:start',
      'chat:delta',
      'chat:delta',
      'chat:done',
    ])
    expect(coordinator.settleTurn).toHaveBeenCalledOnce()
    expect(runtimeClients).toHaveLength(1)
  })

  integrationIt('projects an image-only Thread turn as empty Runtime text', async () => {
    checkedRuntimeArtifactPath()
    const events: UnclockedNyxChatEvent[] = []
    const pending = prepared()
    pending.detail.turns[0] = { ...pending.detail.turns[0]!, userContent: '' }
    pending.detail.images = [
      {
        threadId,
        owner: 'turn',
        turnOrdinal: 0,
        position: 0,
        imageId,
        mediaType: 'image/png',
        width: 2,
        height: 1,
        available: true,
      },
    ]
    const providerMessages = [
      {
        role: 'user' as const,
        content: [{ type: 'image_url' as const, image_url: { url: 'data:image/png;base64,AQ==' } }],
      },
    ]
    const coordinator = {
      classifyTurn: vi.fn(async () => false),
      prepareTurn: vi.fn(async () => pending),
      bindPreparedTarget: vi.fn(async () => pending.detail),
      materializeProviderMessages: vi.fn(async () => providerMessages),
      replayRuntimeHistory: vi.fn(async () => undefined),
      settleTurn: vi.fn(async () => ({ id: 'settled', ok: true, value: pending.detail })),
    }
    streamChatCompletion.mockImplementationOnce(async ({ providerMessages: actual, onDelta }) => {
      expect(actual).toEqual(providerMessages)
      await onDelta('Image answer', 'Image answer')
      return { finalContent: 'Image answer' }
    })
    const manager = new ChatSessionManager({
      resolveThreadLibraryCoordinator: () => coordinator as unknown as ThreadLibraryCoordinator,
      publishChatEvent: (_sender, event) => events.push(event),
      resolveChatTarget: async () => target(),
      createRuntimeChatStateClient,
      now: () => timestamp,
    })

    manager.start({} as WebContents, {
      threadId,
      requestId: 'request-1',
      turnIntent: 'new_user_message',
      expectedDraftRevision: 0,
    })
    await waitFor(() => expect(businessEvents(events).at(-1)?.type).toBe('chat:done'))

    expect(businessEvents(events).at(-1)).toMatchObject({ finalContent: 'Image answer' })
  })

  integrationIt('cancels a streaming Runtime turn with its partial content', async () => {
    checkedRuntimeArtifactPath()
    const events: UnclockedNyxChatEvent[] = []
    const pending = prepared()
    const coordinator = {
      classifyTurn: vi.fn(async () => false),
      prepareTurn: vi.fn(async () => pending),
      bindPreparedTarget: vi.fn(async () => pending.detail),
      materializeProviderMessages: vi.fn(async () => [
        { role: 'user' as const, content: 'Hello Nyx' },
      ]),
      replayRuntimeHistory: vi.fn(async () => undefined),
      settleTurn: vi.fn(async () => ({ id: 'settled', ok: true, value: pending.detail })),
    }
    streamChatCompletion.mockImplementationOnce(async ({ signal, onDelta }) => {
      await onDelta('Part', 'Partial answer')
      return await new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(abortError()), { once: true })
      })
    })
    const manager = new ChatSessionManager({
      resolveThreadLibraryCoordinator: () => coordinator as unknown as ThreadLibraryCoordinator,
      publishChatEvent: (_sender, event) => events.push(event),
      resolveChatTarget: async () => target(),
      createRuntimeChatStateClient,
      now: () => timestamp,
    })

    manager.start({} as WebContents, {
      threadId,
      requestId: 'request-1',
      turnIntent: 'new_user_message',
      expectedDraftRevision: 0,
    })
    await waitFor(() => expect(businessEvents(events).at(-1)?.type).toBe('chat:delta'))
    manager.cancel({ threadId, requestId: 'request-1' })
    await waitFor(() => expect(businessEvents(events).at(-1)?.type).toBe('chat:done'))

    expect(coordinator.settleTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        assistantStatus: 'cancelled',
        assistantContent: 'Partial answer',
      }),
    )
    expect(businessEvents(events).at(-1)).toMatchObject({
      status: 'cancelled',
      finalContent: 'Partial answer',
    })
  })

  integrationIt('records a Provider failure through the real Runtime reducer', async () => {
    checkedRuntimeArtifactPath()
    const events: UnclockedNyxChatEvent[] = []
    const pending = prepared()
    const coordinator = {
      classifyTurn: vi.fn(async () => false),
      prepareTurn: vi.fn(async () => pending),
      bindPreparedTarget: vi.fn(async () => pending.detail),
      materializeProviderMessages: vi.fn(async () => [
        { role: 'user' as const, content: 'Hello Nyx' },
      ]),
      replayRuntimeHistory: vi.fn(async () => undefined),
      settleTurn: vi.fn(async () => ({ id: 'settled', ok: true, value: pending.detail })),
    }
    streamChatCompletion.mockRejectedValueOnce(new Error('Provider failed'))
    const manager = new ChatSessionManager({
      resolveThreadLibraryCoordinator: () => coordinator as unknown as ThreadLibraryCoordinator,
      publishChatEvent: (_sender, event) => events.push(event),
      resolveChatTarget: async () => target(),
      createRuntimeChatStateClient,
      now: () => timestamp,
    })

    manager.start({} as WebContents, {
      threadId,
      requestId: 'request-1',
      turnIntent: 'new_user_message',
      expectedDraftRevision: 0,
    })
    await waitFor(() => expect(businessEvents(events).at(-1)?.type).toBe('chat:error'))

    expect(coordinator.settleTurn).toHaveBeenCalledWith(
      expect.objectContaining({ assistantStatus: 'failed', assistantContent: '' }),
    )
    expect(businessEvents(events).at(-1)).toMatchObject({
      targetAttribution: attribution,
      error: { message: 'Provider failed', retryable: true },
    })
  })

  integrationIt('replays a completed Thread before starting the next canonical turn', async () => {
    checkedRuntimeArtifactPath()
    const events: UnclockedNyxChatEvent[] = []
    const beforeNext = detail()
    beforeNext.turns[0] = {
      ...beforeNext.turns[0]!,
      assistantStatus: 'completed',
      assistantContent: 'Earlier answer',
    }
    const pending = detail()
    pending.turns = [
      beforeNext.turns[0]!,
      {
        ...pending.turns[0]!,
        ordinal: 1,
        attemptRequestId: 'request-2',
        userMessageId: 'user-2',
        assistantMessageId: 'assistant-2',
        userContent: 'Continue',
      },
    ]
    const nextPrepared: PreparedThreadTurn = {
      ...prepared(),
      detail: pending,
      runtimeReplayDetail: beforeNext,
      requestId: 'request-2',
      userMessageId: 'user-2',
      assistantMessageId: 'assistant-2',
    }
    const coordinator = {
      classifyTurn: vi.fn(async () => false),
      prepareTurn: vi.fn(async () => nextPrepared),
      bindPreparedTarget: vi.fn(async () => pending),
      materializeProviderMessages: vi.fn(async () => [
        { role: 'user' as const, content: 'Hello Nyx' },
        { role: 'assistant' as const, content: 'Earlier answer' },
        { role: 'user' as const, content: 'Continue' },
      ]),
      replayRuntimeHistory: vi.fn(
        (runtime: RuntimeChatStateClient, history: ThreadLibraryThreadDetail) =>
          ThreadLibraryCoordinator.prototype.replayRuntimeHistory.call(
            {} as ThreadLibraryCoordinator,
            runtime,
            history,
          ),
      ),
      settleTurn: vi.fn(async () => ({ id: 'settled', ok: true, value: pending })),
    }
    streamChatCompletion.mockResolvedValueOnce({ finalContent: 'Next answer' })
    const manager = new ChatSessionManager({
      resolveThreadLibraryCoordinator: () => coordinator as unknown as ThreadLibraryCoordinator,
      publishChatEvent: (_sender, event) => events.push(event),
      resolveChatTarget: async () => target(),
      createRuntimeChatStateClient,
      now: () => timestamp,
    })

    manager.start({} as WebContents, {
      threadId,
      requestId: 'request-2',
      turnIntent: 'new_user_message',
      expectedDraftRevision: 1,
    })
    await waitFor(() => expect(businessEvents(events).at(-1)?.type).toBe('chat:done'))

    expect(coordinator.replayRuntimeHistory).toHaveBeenCalledWith(expect.anything(), beforeNext)
    expect(businessEvents(events).at(-1)).toMatchObject({ finalContent: 'Next answer' })
  })

  integrationIt('replays one canonical failure before applying its exact Retry', async () => {
    checkedRuntimeArtifactPath()
    const events: UnclockedNyxChatEvent[] = []
    const beforeRetry = detail()
    beforeRetry.turns[0] = {
      ...beforeRetry.turns[0]!,
      attemptRequestId: 'request-failed',
      assistantStatus: 'failed',
      error: {
        code: 'network_error',
        message: 'Nyx could not reach the provider.',
        retryable: true,
      },
    }
    const pending = detail()
    pending.turns[0] = { ...pending.turns[0]!, attemptRequestId: 'request-retry' }
    const retryPrepared: PreparedThreadTurn = {
      ...prepared(),
      requestId: 'request-retry',
      detail: pending,
      runtimeReplayDetail: beforeRetry,
    }
    const coordinator = {
      classifyTurn: vi.fn(async () => false),
      prepareTurn: vi.fn(async () => retryPrepared),
      bindPreparedTarget: vi.fn(async () => pending),
      materializeProviderMessages: vi.fn(async () => [
        { role: 'user' as const, content: 'Hello Nyx' },
      ]),
      replayRuntimeHistory: vi.fn(
        (runtime: RuntimeChatStateClient, history: ThreadLibraryThreadDetail) =>
          ThreadLibraryCoordinator.prototype.replayRuntimeHistory.call(
            {} as ThreadLibraryCoordinator,
            runtime,
            history,
          ),
      ),
      settleTurn: vi.fn(async () => ({ id: 'settled', ok: true, value: pending })),
    }
    streamChatCompletion.mockResolvedValueOnce({ finalContent: 'Retried answer' })
    const manager = new ChatSessionManager({
      resolveThreadLibraryCoordinator: () => coordinator as unknown as ThreadLibraryCoordinator,
      publishChatEvent: (_sender, event) => events.push(event),
      resolveChatTarget: async () => target(),
      createRuntimeChatStateClient,
      now: () => timestamp,
    })

    manager.start({} as WebContents, {
      threadId,
      requestId: 'request-retry',
      turnIntent: 'retry_failed_response',
      turnOrdinal: 0,
      expectedAttemptRequestId: 'request-failed',
      expectedDraftRevision: 1,
    })
    await waitFor(() => expect(businessEvents(events).at(-1)?.type).toBe('chat:done'))

    expect(coordinator.replayRuntimeHistory).toHaveBeenCalledWith(expect.anything(), beforeRetry)
    expect(coordinator.settleTurn).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 'request-retry', assistantStatus: 'completed' }),
    )
  })
})
