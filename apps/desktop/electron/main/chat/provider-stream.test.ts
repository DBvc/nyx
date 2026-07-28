import { describe, expect, it } from 'vitest'

import {
  decodeOpenAiCompatibleStream,
  normalizeOpenAiCompatibleFinishReason,
} from './provider-stream'

describe('decodeOpenAiCompatibleStream', () => {
  it('normalizes reasoning, text, and finish data in wire order', () => {
    expect(
      decodeOpenAiCompatibleStream(
        JSON.stringify({
          choices: [
            {
              delta: {
                reasoning_content: 'private reasoning',
                content: 'Final answer',
              },
              finish_reason: 'stop',
            },
          ],
        }),
      ),
    ).toEqual([
      { type: 'reasoning-activity' },
      { type: 'text-delta', text: 'Final answer' },
      { type: 'finish', reason: 'stop', nativeReason: 'stop' },
    ])
  })

  it('maps provider and malformed payload failures to internal diagnostics', () => {
    expect(decodeOpenAiCompatibleStream({ error: { message: 'private provider detail' } })).toEqual(
      [{ type: 'error', diagnostic: 'provider_error' }],
    )
    expect(decodeOpenAiCompatibleStream('{"choices":[')).toEqual([
      { type: 'error', diagnostic: 'invalid_payload' },
    ])
    expect(decodeOpenAiCompatibleStream(null)).toEqual([
      { type: 'error', diagnostic: 'invalid_payload' },
    ])
  })

  it('ignores envelopes without a usable first choice', () => {
    expect(decodeOpenAiCompatibleStream({ usage: { total_tokens: 10 } })).toEqual([])
    expect(decodeOpenAiCompatibleStream({ choices: [] })).toEqual([])
  })
})

describe('normalizeOpenAiCompatibleFinishReason', () => {
  it.each(['stop', 'length', 'content_filter', 'tool_calls', 'error'] as const)(
    'normalizes the known %s reason',
    (reason) => {
      expect(normalizeOpenAiCompatibleFinishReason(reason)).toEqual({
        reason,
        nativeReason: reason,
      })
    },
  )

  it('preserves a safe unknown reason for main-only diagnostics', () => {
    expect(normalizeOpenAiCompatibleFinishReason('provider_specific')).toEqual({
      reason: 'unknown',
      nativeReason: 'provider_specific',
    })
  })

  it('drops an unsafe native reason', () => {
    expect(normalizeOpenAiCompatibleFinishReason('unsafe reason with spaces')).toEqual({
      reason: 'unknown',
      nativeReason: null,
    })
  })
})
