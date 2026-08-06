import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import type { NyxChatRequest } from '../../../shared/chat/types'
import { CurrentThreadSessionCoordinator, CurrentThreadSessionError } from './session-coordinator'
import { parseCurrentThreadRecordV1 } from './schemas'
import { CurrentThreadStore } from './store'

const tempDirs: string[] = []
const firstAttribution = {
  kind: 'connection',
  providerId: 'provider-1',
  providerDisplayName: 'Provider One',
  modelId: 'model-1',
  modelDisplayName: 'Model One',
} as const

async function createCoordinator() {
  const dir = await mkdtemp(join(tmpdir(), 'nyx-current-thread-session-'))
  tempDirs.push(dir)
  const store = new CurrentThreadStore({
    filePath: join(dir, 'current-thread.json'),
    generateId: () => 'thread-1',
    now: () => '2026-07-11T00:00:00.000Z',
  })

  return {
    filePath: join(dir, 'current-thread.json'),
    store,
    coordinator: new CurrentThreadSessionCoordinator({
      store,
      now: () => '2026-07-11T01:00:00.000Z',
    }),
  }
}

function newRequest(overrides: Partial<NyxChatRequest> = {}): NyxChatRequest {
  return {
    requestId: 'request-1',
    userMessageId: 'user-1',
    assistantMessageId: 'assistant-1',
    turnIntent: 'new_user_message',
    turnUserMessage: { id: 'user-1', content: 'Hello' },
    messages: [{ role: 'user', content: 'Hello' }],
    ...overrides,
    targetSelection: overrides.targetSelection ?? {
      kind: 'connection',
      providerId: 'provider-1',
      modelId: 'model-1',
    },
  }
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('CurrentThreadSessionCoordinator', () => {
  it('validates the full renderer sequence before creating a pending thread', async () => {
    const { coordinator, store } = await createCoordinator()

    await expect(
      coordinator.prepare(newRequest({ messages: [{ role: 'user', content: 'Tampered' }] })),
    ).rejects.toMatchObject({
      code: 'invalid_request',
    } satisfies Partial<CurrentThreadSessionError>)
    await expect(store.read()).resolves.toBeNull()

    const prepared = await coordinator.prepare(newRequest())

    expect(prepared.providerMessages).toEqual([{ role: 'user', content: 'Hello' }])
    expect(prepared.replayRecord).toBeNull()
    expect(prepared.pendingRecord).toMatchObject({
      version: 2,
      threadId: 'thread-1',
      turns: [
        {
          attemptRequestId: 'request-1',
          assistantStatus: 'pending',
          targetBinding: {
            selection: {
              kind: 'connection',
              providerId: 'provider-1',
              modelId: 'model-1',
            },
            attribution: null,
          },
        },
      ],
    })
  })

  it('binds attribution exactly once without settling the pending turn', async () => {
    const { coordinator, store } = await createCoordinator()
    await coordinator.prepare(newRequest())

    await coordinator.bindResolvedTarget('request-1', 'assistant-1', firstAttribution)

    await expect(store.read()).resolves.toMatchObject({
      turns: [
        {
          assistantStatus: 'pending',
          targetBinding: {
            selection: newRequest().targetSelection,
            attribution: firstAttribution,
          },
        },
      ],
    })
    await expect(
      coordinator.bindResolvedTarget('request-1', 'assistant-1', firstAttribution),
    ).rejects.toMatchObject({ code: 'invalid_request' })
  })

  it('derives later provider context from durable terminal turns', async () => {
    const { coordinator } = await createCoordinator()
    await coordinator.prepare(newRequest())
    await coordinator.complete('request-1', 'assistant-1', 'First answer')

    const prepared = await coordinator.prepare(
      newRequest({
        requestId: 'request-2',
        userMessageId: 'user-2',
        assistantMessageId: 'assistant-2',
        turnUserMessage: { id: 'user-2', content: 'Continue' },
        messages: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'First answer' },
          { role: 'user', content: 'Continue' },
        ],
      }),
    )

    expect(prepared.providerMessages).toEqual([
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'First answer' },
      { role: 'user', content: 'Continue' },
    ])
    expect(prepared.replayRecord?.turns).toHaveLength(1)
    expect(prepared.pendingRecord.turns).toHaveLength(2)
  })

  it('upgrades version 1 only while appending a real selected turn', async () => {
    const { coordinator, filePath } = await createCoordinator()
    const version1 = parseCurrentThreadRecordV1({
      version: 1,
      threadId: 'thread-1',
      turns: [
        {
          attemptRequestId: 'request-1',
          userMessageId: 'user-1',
          assistantMessageId: 'assistant-1',
          userContent: 'Hello',
          assistantContent: 'Done',
          assistantStatus: 'completed',
          error: null,
          createdAt: '2026-07-10T00:00:00.000Z',
          updatedAt: '2026-07-10T00:01:00.000Z',
        },
      ],
      createdAt: '2026-07-10T00:00:00.000Z',
      updatedAt: '2026-07-10T00:01:00.000Z',
    })
    await writeFile(filePath, `${JSON.stringify(version1)}\n`, 'utf8')

    const prepared = await coordinator.prepare(
      newRequest({
        requestId: 'request-2',
        userMessageId: 'user-2',
        assistantMessageId: 'assistant-2',
        turnUserMessage: { id: 'user-2', content: 'Continue' },
        messages: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Done' },
          { role: 'user', content: 'Continue' },
        ],
      }),
    )

    expect(prepared.replayRecord?.version).toBe(1)
    expect(prepared.pendingRecord).toMatchObject({
      version: 2,
      turns: [
        { targetBinding: null },
        {
          attemptRequestId: 'request-2',
          targetBinding: {
            selection: newRequest().targetSelection,
            attribution: null,
          },
        },
      ],
    })
  })

  it('captures the failed replay record before writing a retry pending attempt', async () => {
    const { coordinator } = await createCoordinator()
    await coordinator.prepare(newRequest())
    await coordinator.bindResolvedTarget('request-1', 'assistant-1', firstAttribution)
    await coordinator.fail('request-1', 'assistant-1', 'Partial', {
      code: 'network_error',
      message: 'Raw network detail must not persist.',
      retryable: true,
    })

    const prepared = await coordinator.prepare({
      ...newRequest(),
      requestId: 'request-2',
      turnIntent: 'retry_failed_response',
      targetSelection: { kind: 'env_fallback' },
    })

    expect(prepared.replayRecord?.turns[0]).toMatchObject({
      attemptRequestId: 'request-1',
      assistantStatus: 'failed',
      assistantContent: 'Partial',
      error: {
        code: 'network_error',
        message: 'Nyx could not reach the provider.',
      },
      targetBinding: {
        attribution: firstAttribution,
      },
    })
    expect(prepared.pendingRecord.turns[0]).toMatchObject({
      attemptRequestId: 'request-2',
      userMessageId: 'user-1',
      assistantMessageId: 'assistant-1',
      assistantStatus: 'pending',
      assistantContent: '',
      error: null,
      targetBinding: {
        selection: { kind: 'env_fallback' },
        attribution: null,
      },
    })
  })

  it('rejects terminal writes that do not match the durable pending attempt', async () => {
    const { coordinator } = await createCoordinator()
    await coordinator.prepare(newRequest())

    await expect(
      coordinator.complete('stale-request', 'assistant-1', 'Wrong'),
    ).rejects.toMatchObject({
      code: 'invalid_request',
    } satisfies Partial<CurrentThreadSessionError>)
  })
})
