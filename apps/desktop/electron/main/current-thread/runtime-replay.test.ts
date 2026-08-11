import { describe, expect, it, vi } from 'vitest'

import type { RuntimeChatStateClient } from '../runtime/chat-state-client'
import { createSafeThreadErrorRecord, parseCurrentThreadRecord } from './schemas'
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

const timestamp = '2026-08-11T00:00:00.000Z'
const envBinding = {
  selection: { kind: 'env_fallback' as const },
  attribution: { kind: 'env_fallback' as const, modelId: 'env-model' },
}

describe('replayCurrentThread', () => {
  it('replays terminal turns while ignoring target, attachment, and provider-state metadata', async () => {
    const order: string[] = []
    const runtime = client(order)
    const baseTurn = {
      userContent: 'Question',
      imageRefs: [],
      documentRefs: [],
      assistantContent: 'Answer',
      error: null,
      targetBinding: envBinding,
      providerStateRef: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    const record = parseCurrentThreadRecord({
      version: 5,
      threadId: 'thread-1',
      turns: [
        {
          ...baseTurn,
          attemptRequestId: 'request-1',
          userMessageId: 'user-1',
          assistantMessageId: 'assistant-1',
          assistantStatus: 'completed',
          targetBinding: {
            selection: { kind: 'connection', providerId: 'provider-1', modelId: 'model-1' },
            attribution: {
              kind: 'connection',
              providerId: 'provider-1',
              providerDisplayName: 'Provider One',
              modelId: 'model-1',
              modelDisplayName: 'Model One',
            },
          },
          providerStateRef: {
            protocol: 'openai-responses',
            stateId: '00000000-0000-4000-8000-000000000020',
            executionIdentity: 'a'.repeat(64),
            byteLength: 128,
            sha256: 'b'.repeat(64),
          },
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
          error: createSafeThreadErrorRecord({ code: 'unknown', retryable: true }),
        },
      ],
      createdAt: timestamp,
      updatedAt: timestamp,
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

  it('projects attachment-only turns as empty Runtime text', async () => {
    const order: string[] = []
    const runtime = client(order)
    const record = parseCurrentThreadRecord({
      version: 5,
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
          documentRefs: [],
          assistantContent: 'Answer',
          assistantStatus: 'completed',
          error: null,
          targetBinding: envBinding,
          providerStateRef: null,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ],
      createdAt: timestamp,
      updatedAt: timestamp,
    })

    await replayCurrentThread(runtime, record)

    expect(runtime.submitUserMessage).toHaveBeenCalledWith(expect.objectContaining({ content: '' }))
    expect(order).toEqual(['submit', 'start', 'append', 'complete'])
  })
})
