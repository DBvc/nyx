import { describe, expect, it } from 'vitest'

import arkCompatibleContentFixture from './fixtures/ark-compatible-content.json'
import genericOpenAiContentFixture from './fixtures/generic-openai-content.json'
import glmReasoningContentFixture from './fixtures/glm-reasoning-content.json'
import {
  decodeOpenAiCompatibleStream,
  decodeOpenAiResponsesStream,
  normalizeOpenAiCompatibleFinishReason,
  readResponsesVisibleText,
  validateResponsesOutputItems,
} from './provider-stream'

interface ProviderStreamFixture {
  name: string
  source: {
    kind: string
    url: string
    retrievedAt: string
    redaction: string
  }
  payloads: unknown[]
}

const providerStreamFixtures: ProviderStreamFixture[] = [
  genericOpenAiContentFixture,
  arkCompatibleContentFixture,
  glmReasoningContentFixture,
]

function decodeFixture(fixture: ProviderStreamFixture) {
  return fixture.payloads.flatMap((payload) => decodeOpenAiCompatibleStream(payload))
}

describe('decodeOpenAiCompatibleStream', () => {
  it.each(providerStreamFixtures)('records redacted official provenance for $name', (fixture) => {
    expect(fixture.source).toMatchObject({
      kind: 'official-contract-derived',
      retrievedAt: '2026-07-29',
    })
    expect(fixture.source.url).toMatch(/^https:\/\//)
    expect(fixture.source.redaction).toContain('replaced')

    const serializedPayloads = JSON.stringify(fixture.payloads)
    expect(serializedPayloads).not.toMatch(
      /authorization|bearer|api[_-]?key|prompt|localhost|127\.0\.0\.1/i,
    )
  })

  it('decodes generic OpenAI-compatible content fixture', () => {
    expect(decodeFixture(genericOpenAiContentFixture)).toEqual([
      { type: 'text-delta', text: 'Hello' },
      { type: 'text-delta', text: ' world' },
      { type: 'finish', reason: 'stop', nativeReason: 'stop' },
    ])
  })

  it('decodes Ark-compatible content fixture', () => {
    expect(decodeFixture(arkCompatibleContentFixture)).toEqual([
      { type: 'text-delta', text: 'Ark' },
      { type: 'text-delta', text: ' compatible' },
      { type: 'finish', reason: 'stop', nativeReason: 'stop' },
    ])
  })

  it('redacts GLM reasoning while preserving activity and final text', () => {
    const events = decodeFixture(glmReasoningContentFixture)

    expect(events).toEqual([
      { type: 'reasoning-activity' },
      { type: 'text-delta', text: 'Final answer' },
      { type: 'finish', reason: 'stop', nativeReason: 'stop' },
    ])
    expect(JSON.stringify(events)).not.toContain('[redacted reasoning activity]')
  })

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

describe('Responses semantic stream and output validation', () => {
  it('decodes text, refusal, reasoning activity, terminal, and failure events', () => {
    expect(
      decodeOpenAiResponsesStream({ type: 'response.output_text.delta', delta: 'Hello' }),
    ).toEqual({
      type: 'text-delta',
      text: 'Hello',
    })
    expect(decodeOpenAiResponsesStream({ type: 'response.refusal.delta', delta: 'No' })).toEqual({
      type: 'text-delta',
      text: 'No',
    })
    expect(
      decodeOpenAiResponsesStream({
        type: 'response.output_item.added',
        item: { type: 'reasoning' },
      }),
    ).toEqual({ type: 'reasoning-activity' })
    expect(
      decodeOpenAiResponsesStream({
        type: 'response.completed',
        response: { status: 'completed' },
      }),
    ).toEqual({ type: 'completed', response: { status: 'completed' } })
    expect(decodeOpenAiResponsesStream({ type: 'response.incomplete' })).toEqual({
      type: 'terminal-error',
      diagnostic: 'incomplete',
    })
    expect(decodeOpenAiResponsesStream({ type: 'response.failed' })).toEqual({
      type: 'terminal-error',
      diagnostic: 'failed',
    })
    expect(decodeOpenAiResponsesStream('{')).toEqual({
      type: 'error',
      diagnostic: 'invalid_payload',
    })
  })

  it('accepts only encrypted reasoning and completed assistant messages', () => {
    const output = [
      {
        id: 'reasoning-1',
        type: 'reasoning',
        encrypted_content: 'opaque',
        summary: [],
        content: [],
      },
      {
        type: 'message',
        role: 'assistant',
        status: 'completed',
        content: [
          { type: 'output_text', text: 'Answer', annotations: [] },
          { type: 'refusal', refusal: ' refusal' },
        ],
      },
    ]

    expect(validateResponsesOutputItems(output)).toEqual(output)
    expect(readResponsesVisibleText(output)).toBe('Answer refusal')
    expect(validateResponsesOutputItems([{ type: 'function_call' }])).toBeNull()
    expect(
      validateResponsesOutputItems([
        {
          type: 'reasoning',
          encrypted_content: 'opaque',
          summary: [{ type: 'summary_text', text: 'raw reasoning' }],
        },
      ]),
    ).toBeNull()
    expect(validateResponsesOutputItems(Array.from({ length: 65 }, () => output[1]))).toBeNull()
  })
})
