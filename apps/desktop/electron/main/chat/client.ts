import type { NyxChatRequest } from '../../../shared/chat/types'
import { createChatBridgeError } from './errors'
import type { ChatProviderConfig } from './env'

const DEFAULT_SYSTEM_PROMPT = 'You are Nyx, a concise and reliable desktop AI assistant.'

interface StreamChatCompletionOptions {
  config: ChatProviderConfig
  request: NyxChatRequest
  signal: AbortSignal
  onDelta: (delta: string, snapshot: string) => void | Promise<void>
}

interface ChatCompletionChunk {
  choices?: Array<{
    delta?: {
      content?: string
      reasoning_content?: string
    }
    finish_reason?: string | null
  }>
  error?: unknown
}

export function buildChatCompletionsUrl(baseUrl: string) {
  const url = new URL(baseUrl)

  if (url.pathname === '/' || url.pathname === '') {
    url.pathname = '/v1/chat/completions'
    return url.toString()
  }

  if (url.pathname.endsWith('/v1/')) {
    url.pathname = `${url.pathname}chat/completions`
    return url.toString()
  }

  url.pathname = `${url.pathname}chat/completions`
  return url.toString()
}

export function buildProviderMessages(request: NyxChatRequest) {
  const alreadyHasSystemMessage = request.messages.some((message) => message.role === 'system')

  if (alreadyHasSystemMessage) {
    return request.messages
  }

  return [
    {
      role: 'system' as const,
      content: request.systemPrompt ?? DEFAULT_SYSTEM_PROMPT,
    },
    ...request.messages,
  ]
}

async function readErrorDetails(response: Response) {
  try {
    const payload = (await response.json()) as { error?: { message?: string } }
    return payload.error?.message ?? `HTTP ${response.status}`
  } catch {
    return `HTTP ${response.status}`
  }
}

function toUpstreamError(response: Response, details: string) {
  if (response.status === 400) {
    return createChatBridgeError({
      code: 'invalid_request',
      message: 'The relay rejected this chat request.',
      retryable: false,
      details,
    })
  }

  if (response.status === 401 || response.status === 403) {
    return createChatBridgeError({
      code: 'auth_failed',
      message: 'Nyx could not authenticate with the relay API.',
      retryable: false,
      details,
    })
  }

  if (response.status === 429) {
    return createChatBridgeError({
      code: 'rate_limited',
      message: 'The relay API is rate limiting this request.',
      retryable: true,
      details,
    })
  }

  return createChatBridgeError({
    code: 'upstream_error',
    message: 'The relay API returned an unexpected error.',
    retryable: true,
    details,
  })
}

function createProviderStreamError(message: string, details?: string, retryable = true) {
  return createChatBridgeError({
    code: 'upstream_error',
    message,
    retryable,
    ...(details ? { details } : {}),
  })
}

function normalizeFinishReason(value: string) {
  return /^[a-z0-9_.-]{1,64}$/i.test(value) ? value : 'unknown'
}

function parseChatCompletionChunk(payload: string) {
  try {
    return JSON.parse(payload) as ChatCompletionChunk
  } catch {
    throw createProviderStreamError(
      'The provider returned an invalid streaming response.',
      'stream_parse_error=true',
    )
  }
}

function createEmptyProviderResponseError({
  finishReason,
  reasoningReceived,
}: {
  finishReason: string | null
  reasoningReceived: boolean
}) {
  const details = [
    finishReason ? `finish_reason=${finishReason}` : null,
    `reasoning_received=${reasoningReceived}`,
  ]
    .filter((detail): detail is string => Boolean(detail))
    .join('; ')

  if (finishReason === 'length') {
    return createProviderStreamError(
      'The provider reached its output limit before returning an answer.',
      details,
    )
  }

  if (reasoningReceived) {
    return createProviderStreamError(
      'The provider finished reasoning without returning an answer.',
      details,
    )
  }

  return createProviderStreamError(
    'The provider returned an empty response.',
    details,
    finishReason !== 'content_filter',
  )
}

export async function* iterateSseData(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()

    if (done) {
      break
    }

    buffer += decoder.decode(value, { stream: true })
    buffer = buffer.replace(/\r\n/g, '\n')

    let separatorIndex = buffer.indexOf('\n\n')

    while (separatorIndex >= 0) {
      const rawEvent = buffer.slice(0, separatorIndex)
      buffer = buffer.slice(separatorIndex + 2)

      const payload = rawEvent
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n')
        .trim()

      if (payload) {
        yield payload
      }

      separatorIndex = buffer.indexOf('\n\n')
    }
  }

  const trailingPayload = buffer
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart())
    .join('\n')
    .trim()

  if (trailingPayload) {
    yield trailingPayload
  }
}

export async function streamChatCompletion({
  config,
  request,
  signal,
  onDelta,
}: StreamChatCompletionOptions) {
  const response = await fetch(buildChatCompletionsUrl(config.baseUrl), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.token}`,
    },
    body: JSON.stringify({
      model: config.model,
      stream: true,
      messages: buildProviderMessages(request),
    }),
    signal,
  })

  if (!response.ok) {
    throw toUpstreamError(response, await readErrorDetails(response))
  }

  if (!response.body) {
    throw createChatBridgeError({
      code: 'upstream_error',
      message: 'The relay API did not return a response body.',
      retryable: true,
    })
  }

  let finalContent = ''
  let finishReason: string | null = null
  let reasoningReceived = false

  for await (const payload of iterateSseData(response.body)) {
    if (payload === '[DONE]') {
      break
    }

    const chunk = parseChatCompletionChunk(payload)

    if (chunk.error) {
      throw createProviderStreamError(
        'The provider returned an error while streaming.',
        'stream_error=true',
      )
    }

    const choice = chunk.choices?.[0]
    const delta = choice?.delta?.content
    const reasoningDelta = choice?.delta?.reasoning_content

    if (typeof reasoningDelta === 'string' && reasoningDelta.length > 0) {
      reasoningReceived = true
    }

    if (typeof delta === 'string' && delta.length > 0) {
      finalContent += delta
      await onDelta(delta, finalContent)
    }

    if (typeof choice?.finish_reason === 'string' && choice.finish_reason.length > 0) {
      finishReason = normalizeFinishReason(choice.finish_reason)

      if (finishReason === 'error') {
        throw createProviderStreamError(
          'The provider returned an error while streaming.',
          'finish_reason=error',
        )
      }

      break
    }
  }

  if (finalContent.trim().length === 0) {
    throw createEmptyProviderResponseError({ finishReason, reasoningReceived })
  }

  return {
    finalContent,
  }
}
