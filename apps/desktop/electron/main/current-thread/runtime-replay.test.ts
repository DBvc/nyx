import { describe, expect, it, vi } from 'vitest'

import type { RuntimeChatStateClient } from '../runtime/chat-state-client'
import {
  createSafeThreadErrorRecordV1,
  parseCurrentThreadRecordV1,
  parseCurrentThreadRecordV2,
  parseCurrentThreadRecordV3,
  parseCurrentThreadRecordV4,
  upgradeCurrentThreadRecordForMutation,
} from './schemas'
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

  it('ignores version-2 target metadata and replays only message-level fields', async () => {
    const order: string[] = []
    const runtime = client(order)
    const v1 = parseCurrentThreadRecordV1({
      version: 1,
      threadId: 'thread-1',
      turns: [
        {
          attemptRequestId: 'request-1',
          userMessageId: 'user-1',
          assistantMessageId: 'assistant-1',
          userContent: 'Question',
          assistantContent: 'Answer',
          assistantStatus: 'completed',
          error: null,
          createdAt: '2026-07-11T00:00:00.000Z',
          updatedAt: '2026-07-11T00:00:00.000Z',
        },
      ],
      createdAt: '2026-07-11T00:00:00.000Z',
      updatedAt: '2026-07-11T00:00:00.000Z',
    })
    const upgraded = upgradeCurrentThreadRecordForMutation(v1)
    const record = parseCurrentThreadRecordV2({
      ...upgraded,
      turns: [
        {
          ...upgraded.turns[0]!,
          targetBinding: {
            selection: { kind: 'env_fallback' },
            attribution: { kind: 'env_fallback', modelId: 'env-model' },
          },
        },
      ],
    })

    await replayCurrentThread(runtime, record)

    expect(order).toEqual(['submit', 'start', 'append', 'complete'])
  })

  it('projects an image-only version-3 turn as empty Runtime text', async () => {
    const order: string[] = []
    const runtime = client(order)
    const record = parseCurrentThreadRecordV3({
      version: 3,
      threadId: 'thread-1',
      turns: [
        {
          attemptRequestId: 'request-1',
          userMessageId: 'user-1',
          assistantMessageId: 'assistant-1',
          userContent: '',
          imageRefs: [
            {
              imageId: '00000000-0000-4000-8000-000000000001',
              mediaType: 'image/png',
              width: 2,
              height: 1,
            },
          ],
          assistantContent: 'Answer',
          assistantStatus: 'completed',
          error: null,
          targetBinding: {
            selection: { kind: 'env_fallback' },
            attribution: { kind: 'env_fallback', modelId: 'model' },
          },
          createdAt: '2026-08-09T00:00:00.000Z',
          updatedAt: '2026-08-09T00:00:00.000Z',
        },
      ],
      createdAt: '2026-08-09T00:00:00.000Z',
      updatedAt: '2026-08-09T00:00:00.000Z',
    })

    await replayCurrentThread(runtime, record)

    expect(runtime.submitUserMessage).toHaveBeenCalledWith({
      turnRequestId: 'request-1',
      userMessageId: 'user-1',
      assistantMessageId: 'assistant-1',
      content: '',
    })
    expect(order).toEqual(['submit', 'start', 'append', 'complete'])
  })

  it('projects a document-only version-4 turn as empty Runtime text', async () => {
    const order: string[] = []
    const runtime = client(order)
    const record = parseCurrentThreadRecordV4({
      version: 4,
      threadId: 'thread-1',
      turns: [
        {
          attemptRequestId: 'request-1',
          userMessageId: 'user-1',
          assistantMessageId: 'assistant-1',
          userContent: '',
          imageRefs: [],
          documentRefs: [
            {
              documentId: '00000000-0000-4000-8000-000000000010',
              name: 'notes.txt',
              mediaType: 'text/plain',
              byteLength: 5,
              extractedByteLength: 5,
              sourceSha256: 'a'.repeat(64),
              extractedTextSha256: 'b'.repeat(64),
            },
          ],
          assistantContent: 'Answer',
          assistantStatus: 'completed',
          error: null,
          targetBinding: {
            selection: { kind: 'env_fallback' },
            attribution: { kind: 'env_fallback', modelId: 'model' },
          },
          createdAt: '2026-08-10T00:00:00.000Z',
          updatedAt: '2026-08-10T00:00:00.000Z',
        },
      ],
      createdAt: '2026-08-10T00:00:00.000Z',
      updatedAt: '2026-08-10T00:00:00.000Z',
    })

    await replayCurrentThread(runtime, record)

    expect(runtime.submitUserMessage).toHaveBeenCalledWith(expect.objectContaining({ content: '' }))
  })
})
