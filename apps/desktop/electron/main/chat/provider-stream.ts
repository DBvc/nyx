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

export const responsesContinuationLimits = {
  maxSerializedBytes: 8_388_608,
  maxOutputItems: 64,
  maxDepth: 16,
  maxArrayEntries: 4_096,
  maxObjectKeys: 256,
  maxStringBytes: 6_291_456,
} as const

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue }

export interface ResponsesContinuationStateV1 {
  version: 1
  protocol: 'openai-responses'
  effectiveReasoningContext: 'all_turns' | 'current_turn' | null
  outputItems: JsonValue[]
}

export type OpenAiResponsesStreamEvent =
  | { type: 'text-delta'; text: string }
  | { type: 'reasoning-activity' }
  | { type: 'completed'; response: Record<string, unknown> }
  | { type: 'terminal-error'; diagnostic: 'incomplete' | 'failed' | 'provider_error' }
  | { type: 'error'; diagnostic: 'provider_error' | 'invalid_payload' }
  | { type: 'lifecycle' }

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

function isJsonValue(value: unknown, depth = 0): value is JsonValue {
  if (depth > responsesContinuationLimits.maxDepth) {
    return false
  }

  if (
    value === null ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  ) {
    return true
  }

  if (typeof value === 'string') {
    return Buffer.byteLength(value) <= responsesContinuationLimits.maxStringBytes
  }

  if (Array.isArray(value)) {
    return (
      value.length <= responsesContinuationLimits.maxArrayEntries &&
      value.every((item) => isJsonValue(item, depth + 1))
    )
  }

  if (!isRecord(value)) {
    return false
  }

  const entries = Object.entries(value)
  return (
    entries.length <= responsesContinuationLimits.maxObjectKeys &&
    entries.every(
      ([key, item]) =>
        Buffer.byteLength(key) <= responsesContinuationLimits.maxStringBytes &&
        isJsonValue(item, depth + 1),
    )
  )
}

function isCompletedAssistantMessage(item: Record<string, unknown>) {
  if (item.type !== 'message' || item.role !== 'assistant' || item.status !== 'completed') {
    return false
  }

  return (
    Array.isArray(item.content) &&
    item.content.every(
      (part) =>
        isRecord(part) &&
        ((part.type === 'output_text' && typeof part.text === 'string') ||
          (part.type === 'refusal' && typeof part.refusal === 'string')),
    )
  )
}

function isEncryptedReasoning(item: Record<string, unknown>) {
  return (
    item.type === 'reasoning' &&
    typeof item.encrypted_content === 'string' &&
    item.encrypted_content.length > 0 &&
    (!('summary' in item) || (Array.isArray(item.summary) && item.summary.length === 0)) &&
    (!('content' in item) || (Array.isArray(item.content) && item.content.length === 0))
  )
}

export function validateResponsesOutputItems(value: unknown): JsonValue[] | null {
  if (!Array.isArray(value) || value.length > responsesContinuationLimits.maxOutputItems) {
    return null
  }

  if (
    !value.every(
      (item) =>
        isRecord(item) &&
        isJsonValue(item) &&
        (isEncryptedReasoning(item) || isCompletedAssistantMessage(item)),
    )
  ) {
    return null
  }

  return value
}

export function readResponsesVisibleText(outputItems: ReadonlyArray<JsonValue>) {
  const text: string[] = []

  for (const item of outputItems) {
    if (!isRecord(item) || item.type !== 'message' || !Array.isArray(item.content)) {
      continue
    }

    for (const part of item.content) {
      if (!isRecord(part)) {
        continue
      }

      if (part.type === 'output_text' && typeof part.text === 'string') {
        text.push(part.text)
      } else if (part.type === 'refusal' && typeof part.refusal === 'string') {
        text.push(part.refusal)
      }
    }
  }

  return text.join('')
}

export function decodeOpenAiResponsesStream(payload: unknown): OpenAiResponsesStreamEvent {
  const event = readPayload(payload)

  if (!isRecord(event) || typeof event.type !== 'string') {
    return { type: 'error', diagnostic: 'invalid_payload' }
  }

  switch (event.type) {
    case 'response.output_text.delta':
    case 'response.refusal.delta':
      return typeof event.delta === 'string' && event.delta.length > 0
        ? { type: 'text-delta', text: event.delta }
        : { type: 'error', diagnostic: 'invalid_payload' }
    case 'response.reasoning_summary_text.delta':
    case 'response.reasoning_text.delta':
      return typeof event.delta === 'string'
        ? { type: 'reasoning-activity' }
        : { type: 'error', diagnostic: 'invalid_payload' }
    case 'response.completed':
      return isRecord(event.response)
        ? { type: 'completed', response: event.response }
        : { type: 'error', diagnostic: 'invalid_payload' }
    case 'response.incomplete':
      return { type: 'terminal-error', diagnostic: 'incomplete' }
    case 'response.failed':
      return { type: 'terminal-error', diagnostic: 'failed' }
    case 'error':
      return { type: 'terminal-error', diagnostic: 'provider_error' }
    default:
      if (event.type === 'response.output_item.added' && isRecord(event.item)) {
        return event.item.type === 'reasoning'
          ? { type: 'reasoning-activity' }
          : { type: 'lifecycle' }
      }

      return { type: 'lifecycle' }
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
