import { describe, expect, it, vi } from 'vitest'

import type { RuntimeChatStateClient } from '../runtime/chat-state-client'
import { createSafeThreadErrorRecordV1, parseCurrentThreadRecordV1 } from './schemas'
import { replayCurrentThread } from './runtime-replay'

function client(order: string[]) {
  const action = (name: string) =>
    vi.fn(async () => {
      order.push(name)
      return { transcript: [], current_turn: { type: 'no_turn' as const } }
    })

  return {
    submitUserMessage: action('submit'),
    retryFailed: action('retry'),
    startAssistant: action('start'),
    appendDelta: action('append'),
    complete: action('complete'),
    cancel: action('cancel'),
    fail: action('fail'),
    clear: action('clear'),
    close: vi.fn(),
  } satisfies RuntimeChatStateClient
}

describe('replayCurrentThread', () => {
  it('replays completed, cancelled, and failed turns through existing runtime actions', async () => {
    const order: string[] = []
    const runtime = client(order)
    const baseTurn = {
      userContent: 'Question',
      assistantContent: 'Answer',
      error: null,
      createdAt: '2026-07-11T00:00:00.000Z',
      updatedAt: '2026-07-11T00:00:00.000Z',
    }
    const record = parseCurrentThreadRecordV1({
      version: 1,
      threadId: 'thread-1',
      turns: [
        {
          ...baseTurn,
          attemptRequestId: 'request-1',
          userMessageId: 'user-1',
          assistantMessageId: 'assistant-1',
          assistantStatus: 'completed',
        },
        {
          ...baseTurn,
          attemptRequestId: 'request-2',
          userMessageId: 'user-2',
          assistantMessageId: 'assistant-2',
          assistantStatus: 'cancelled',
        },
        {
          ...baseTurn,
          attemptRequestId: 'request-3',
          userMessageId: 'user-3',
          assistantMessageId: 'assistant-3',
          assistantStatus: 'failed',
          error: createSafeThreadErrorRecordV1({ code: 'unknown', retryable: true }),
        },
      ],
      createdAt: '2026-07-11T00:00:00.000Z',
      updatedAt: '2026-07-11T00:00:00.000Z',
    })

    await replayCurrentThread(runtime, record)

    expect(order).toEqual([
      'submit',
      'start',
      'append',
      'complete',
      'submit',
      'start',
      'append',
      'cancel',
      'submit',
      'start',
      'append',
      'fail',
    ])
  })
})
