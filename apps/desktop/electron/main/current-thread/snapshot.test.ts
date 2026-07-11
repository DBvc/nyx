import { describe, expect, it, vi } from 'vitest'

import { createSafeThreadErrorRecordV1, parseCurrentThreadRecordV1 } from './schemas'
import { CurrentThreadSnapshotService, toCurrentThreadSnapshot } from './snapshot'

function completedThenFailedRecord() {
  return parseCurrentThreadRecordV1({
    version: 1,
    threadId: 'thread-1',
    turns: [
      {
        attemptRequestId: 'request-1',
        userMessageId: 'user-1',
        assistantMessageId: 'assistant-1',
        userContent: 'First question',
        assistantContent: 'First answer',
        assistantStatus: 'completed',
        error: null,
        createdAt: '2026-07-11T00:00:00.000Z',
        updatedAt: '2026-07-11T00:01:00.000Z',
      },
      {
        attemptRequestId: 'request-2',
        userMessageId: 'user-2',
        assistantMessageId: 'assistant-2',
        userContent: 'Second question',
        assistantContent: 'Unpersisted provider details are not here.',
        assistantStatus: 'failed',
        error: createSafeThreadErrorRecordV1({ code: 'network_error', retryable: true }),
        createdAt: '2026-07-11T00:02:00.000Z',
        updatedAt: '2026-07-11T00:03:00.000Z',
      },
    ],
    createdAt: '2026-07-11T00:00:00.000Z',
    updatedAt: '2026-07-11T00:03:00.000Z',
  })
}

describe('toCurrentThreadSnapshot', () => {
  it('maps terminal messages without exposing persisted metadata', () => {
    const record = completedThenFailedRecord()
    const snapshot = toCurrentThreadSnapshot(record)

    expect(snapshot.messages).toEqual([
      {
        id: 'user-1',
        role: 'user',
        content: 'First question',
        status: 'completed',
      },
      {
        id: 'assistant-1',
        role: 'assistant',
        content: 'First answer',
        status: 'completed',
      },
      {
        id: 'user-2',
        role: 'user',
        content: 'Second question',
        status: 'completed',
      },
      {
        id: 'assistant-2',
        role: 'assistant',
        content: 'Unpersisted provider details are not here.',
        status: 'failed',
        error: {
          code: 'network_error',
          message: 'Nyx could not reach the provider.',
          retryable: true,
        },
        canRetry: true,
      },
    ])
    expect(snapshot.runStatus).toBe('failed')
    expect(snapshot).not.toHaveProperty('threadId')
    expect(snapshot).not.toHaveProperty('version')
    expect(snapshot).not.toHaveProperty('updatedAt')
  })

  it('rebuilds retry metadata while excluding the failed assistant from provider messages', () => {
    const snapshot = toCurrentThreadSnapshot(completedThenFailedRecord())

    expect(snapshot.retryableTurn).toEqual({
      userMessageId: 'user-2',
      assistantMessageId: 'assistant-2',
      turnUserMessage: {
        id: 'user-2',
        content: 'Second question',
      },
      submittedMessages: [
        { role: 'user', content: 'First question' },
        { role: 'assistant', content: 'First answer' },
        { role: 'user', content: 'Second question' },
      ],
    })
  })

  it('does not expose Retry on a historical failure after a later turn completes', () => {
    const record = completedThenFailedRecord()
    const laterCompletedRecord = parseCurrentThreadRecordV1({
      ...record,
      turns: [
        ...record.turns,
        {
          attemptRequestId: 'request-3',
          userMessageId: 'user-3',
          assistantMessageId: 'assistant-3',
          userContent: 'Third question',
          assistantContent: 'Third answer',
          assistantStatus: 'completed',
          error: null,
          createdAt: '2026-07-11T00:04:00.000Z',
          updatedAt: '2026-07-11T00:05:00.000Z',
        },
      ],
      updatedAt: '2026-07-11T00:05:00.000Z',
    })

    const snapshot = toCurrentThreadSnapshot(laterCompletedRecord)
    const historicalFailure = snapshot.messages.find((message) => message.id === 'assistant-2')

    expect(historicalFailure).toMatchObject({
      status: 'failed',
      canRetry: false,
    })
    expect(snapshot.retryableTurn).toBeNull()
    expect(snapshot.runStatus).toBe('completed')
  })

  it('rejects pending records that were not recovered by the store', () => {
    const record = completedThenFailedRecord()
    const pendingRecord = parseCurrentThreadRecordV1({
      ...record,
      turns: [
        record.turns[0]!,
        {
          ...record.turns[1]!,
          assistantContent: '',
          assistantStatus: 'pending',
          error: null,
        },
      ],
    })

    expect(() => toCurrentThreadSnapshot(pendingRecord)).toThrow()
  })
})

describe('CurrentThreadSnapshotService', () => {
  it('returns an empty success without exposing store details', async () => {
    const read = vi.fn(async () => null)
    const service = new CurrentThreadSnapshotService({ resolveReader: () => ({ read }) })

    await expect(service.getSnapshot()).resolves.toEqual({ ok: true, value: null })
  })

  it('maps storage and schema failures to one fixed safe error', async () => {
    const service = new CurrentThreadSnapshotService({
      resolveReader: () => ({
        read: async () => {
          throw new Error('Authorization: Bearer secret at /private/user/current-thread.json')
        },
      }),
    })

    await expect(service.getSnapshot()).resolves.toEqual({
      ok: false,
      error: {
        code: 'load_failed',
        message: 'Nyx could not load the current thread.',
      },
    })
  })
})
