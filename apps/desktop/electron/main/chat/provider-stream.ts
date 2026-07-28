export type NormalizedFinishReason =
  | 'stop'
  | 'length'
  | 'content_filter'
  | 'tool_calls'
  | 'error'
  | 'unknown'

export type ProviderStreamEvent =
  | { type: 'text-delta'; text: string }
  | { type: 'reasoning-activity' }
  | {
      type: 'finish'
      reason: NormalizedFinishReason
      nativeReason: string | null
    }
  | {
      type: 'error'
      diagnostic: 'provider_error' | 'invalid_payload'
    }

const SAFE_FINISH_REASON_PATTERN = /^[a-z0-9_.-]{1,64}$/i

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readPayload(payload: unknown) {
  if (typeof payload !== 'string') {
    return payload
  }

  try {
    return JSON.parse(payload) as unknown
  } catch {
    return undefined
  }
}

export function normalizeOpenAiCompatibleFinishReason(
  value: string,
): Pick<Extract<ProviderStreamEvent, { type: 'finish' }>, 'reason' | 'nativeReason'> {
  const nativeReason = SAFE_FINISH_REASON_PATTERN.test(value) ? value : null

  switch (nativeReason) {
    case 'stop':
    case 'length':
    case 'content_filter':
    case 'tool_calls':
    case 'error':
      return { reason: nativeReason, nativeReason }
    default:
      return { reason: 'unknown', nativeReason }
  }
}

export function decodeOpenAiCompatibleStream(payload: unknown): ReadonlyArray<ProviderStreamEvent> {
  const chunk = readPayload(payload)

  if (!isRecord(chunk)) {
    return [{ type: 'error', diagnostic: 'invalid_payload' }]
  }

  if (chunk.error) {
    return [{ type: 'error', diagnostic: 'provider_error' }]
  }

  const events: ProviderStreamEvent[] = []
  const choice = Array.isArray(chunk.choices) ? chunk.choices[0] : undefined

  if (!isRecord(choice)) {
    return events
  }

  const delta = isRecord(choice.delta) ? choice.delta : undefined
  const reasoningDelta = delta?.reasoning_content
  const textDelta = delta?.content

  if (typeof reasoningDelta === 'string' && reasoningDelta.length > 0) {
    events.push({ type: 'reasoning-activity' })
  }

  if (typeof textDelta === 'string' && textDelta.length > 0) {
    events.push({ type: 'text-delta', text: textDelta })
  }

  if (typeof choice.finish_reason === 'string' && choice.finish_reason.length > 0) {
    events.push({
      type: 'finish',
      ...normalizeOpenAiCompatibleFinishReason(choice.finish_reason),
    })
  }

  return events
}
