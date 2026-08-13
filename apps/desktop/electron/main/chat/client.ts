import {
  nyxChatAttachmentContentRejectedMessage,
  nyxChatContentRejectedMessage,
  type NyxChatInputMessage,
} from '../../../shared/chat/types'
import type { ResolvedChatTarget } from '../connections/provider-resolver'
import { createChatBridgeError } from './errors'
import {
  decodeOpenAiResponsesStream,
  decodeOpenAiCompatibleStream,
  readResponsesVisibleText,
  responsesContinuationLimits,
  validateResponsesOutputItems,
  type JsonValue,
  type NormalizedFinishReason,
  type ProviderStreamEvent,
  type ResponsesContinuationStateV1,
} from './provider-stream'

const DEFAULT_SYSTEM_PROMPT = 'You are Nyx, a concise and reliable desktop AI assistant.'

export type ChatProviderRichUserPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

export type ChatProviderMessage =
  | NyxChatInputMessage
  | { kind: 'responses-output-item'; item: JsonValue }
  | {
      role: 'user'
      content: ReadonlyArray<ChatProviderRichUserPart>
    }

type ChatProviderRequestOptions = { systemPrompt?: string }

interface StreamChatCompletionOptions {
  target: ResolvedChatTarget
  request: ChatProviderRequestOptions
  providerMessages: ReadonlyArray<ChatProviderMessage>
  documentBearing?: boolean
  signal: AbortSignal
  onDelta: (delta: string, snapshot: string) => void | Promise<void>
}

function isResponsesOutputItem(
  message: ChatProviderMessage,
): message is Extract<ChatProviderMessage, { kind: 'responses-output-item' }> {
  return 'kind' in message && message.kind === 'responses-output-item'
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

export function buildProviderMessages(
  request: ChatProviderRequestOptions,
  messages: ReadonlyArray<ChatProviderMessage>,
) {
  if (messages.some(isResponsesOutputItem)) {
    throw new Error('Chat Completions cannot receive Responses continuation items.')
  }

  const chatMessages = messages as ReadonlyArray<
    Exclude<ChatProviderMessage, { kind: 'responses-output-item' }>
  >
  const alreadyHasSystemMessage = chatMessages.some((message) => message.role === 'system')

  if (alreadyHasSystemMessage) {
    return chatMessages
  }

  return [
    {
      role: 'system' as const,
      content: request.systemPrompt ?? DEFAULT_SYSTEM_PROMPT,
    },
    ...chatMessages,
  ]
}

export function buildOpenAiCompatibleChatRequest(
  target: ResolvedChatTarget,
  request: ChatProviderRequestOptions,
  providerMessages: ReadonlyArray<ChatProviderMessage>,
) {
  return {
    url: buildChatCompletionsUrl(target.baseUrl),
    options: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${target.token}`,
      },
      body: JSON.stringify({
        model: target.modelId,
        stream: true,
        messages: buildProviderMessages(request, providerMessages),
      }),
    } satisfies RequestInit,
  }
}

export function buildResponsesUrl(baseUrl: string) {
  const url = new URL(baseUrl)

  if (url.pathname === '/' || url.pathname === '') {
    url.pathname = '/v1/responses'
    return url.toString()
  }

  if (url.pathname.endsWith('/v1/')) {
    url.pathname = `${url.pathname}responses`
    return url.toString()
  }

  url.pathname = `${url.pathname}responses`
  return url.toString()
}

export function buildOpenAiResponsesInput(
  providerMessages: ReadonlyArray<ChatProviderMessage>,
): JsonValue[] {
  return providerMessages.flatMap((message): JsonValue[] => {
    if (isResponsesOutputItem(message)) {
      return [message.item]
    }

    if (message.role === 'system') {
      return []
    }

    if (typeof message.content === 'string') {
      return [
        {
          role: message.role,
          content: [{ type: 'input_text', text: message.content }],
        },
      ]
    }

    return [
      {
        role: 'user',
        content: message.content.map((part) =>
          part.type === 'text'
            ? { type: 'input_text', text: part.text }
            : { type: 'input_image', image_url: part.image_url.url },
        ),
      },
    ]
  })
}

export function buildOpenAiResponsesInstructions(
  request: ChatProviderRequestOptions,
  providerMessages: ReadonlyArray<ChatProviderMessage>,
) {
  const systemMessage = providerMessages.find(
    (message): message is Exclude<ChatProviderMessage, { kind: 'responses-output-item' }> =>
      !isResponsesOutputItem(message) && message.role === 'system',
  )

  return (
    (typeof systemMessage?.content === 'string' ? systemMessage.content : null) ??
    request.systemPrompt ??
    DEFAULT_SYSTEM_PROMPT
  )
}

export function buildOpenAiResponsesRequest({
  target,
  instructions,
  input,
}: {
  target: ResolvedChatTarget
  instructions: string
  input: ReadonlyArray<JsonValue>
}) {
  if (target.protocolConfig.protocol !== 'openai-responses') {
    throw new Error('A Responses request requires a Responses target.')
  }

  return {
    url: buildResponsesUrl(target.baseUrl),
    options: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${target.token}`,
      },
      body: JSON.stringify({
        model: target.modelId,
        store: false,
        stream: true,
        include: ['reasoning.encrypted_content'],
        instructions,
        ...(target.protocolConfig.reasoningContext === 'auto'
          ? {}
          : { reasoning: { context: target.protocolConfig.reasoningContext } }),
        input,
      }),
    } satisfies RequestInit,
  }
}

function buildChatProviderRequest(
  target: ResolvedChatTarget,
  request: ChatProviderRequestOptions,
  providerMessages: ReadonlyArray<ChatProviderMessage>,
) {
  switch (target.protocolConfig.protocol) {
    case 'openai-chat-completions':
      return buildOpenAiCompatibleChatRequest(target, request, providerMessages)
    case 'openai-responses':
      return buildOpenAiResponsesRequest({
        target,
        instructions: buildOpenAiResponsesInstructions(request, providerMessages),
        input: buildOpenAiResponsesInput(providerMessages),
      })
  }
}

async function readErrorDetails(response: Response) {
  try {
    const payload = (await response.json()) as { error?: { message?: string } }
    return payload.error?.message ?? `HTTP ${response.status}`
  } catch {
    return `HTTP ${response.status}`
  }
}

function toUpstreamError(response: Response, details?: string) {
  if (response.status === 400) {
    return createChatBridgeError({
      code: 'invalid_request',
      message: 'The relay rejected this chat request.',
      retryable: false,
      ...(details ? { details } : {}),
    })
  }

  if (response.status === 401 || response.status === 403) {
    return createChatBridgeError({
      code: 'auth_failed',
      message: 'Nyx could not authenticate with the relay API.',
      retryable: false,
      ...(details ? { details } : {}),
    })
  }

  if (response.status === 429) {
    return createChatBridgeError({
      code: 'rate_limited',
      message: 'The relay API is rate limiting this request.',
      retryable: true,
      ...(details ? { details } : {}),
    })
  }

  return createChatBridgeError({
    code: 'upstream_error',
    message: 'The relay API returned an unexpected error.',
    retryable: true,
    ...(details ? { details } : {}),
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

function toProviderStreamEventError(
  diagnostic: Extract<ProviderStreamEvent, { type: 'error' }>['diagnostic'],
) {
  if (diagnostic === 'invalid_payload') {
    return createProviderStreamError(
      'The provider returned an invalid streaming response.',
      'stream_parse_error=true',
    )
  }

  return createProviderStreamError(
    'The provider returned an error while streaming.',
    'stream_error=true',
  )
}

function createProviderTerminalError({
  finishReason,
  nativeFinishReason,
  reasoningReceived,
}: {
  finishReason: NormalizedFinishReason | null
  nativeFinishReason: string | null
  reasoningReceived: boolean
}) {
  const diagnosticFinishReason = nativeFinishReason ?? finishReason
  const details = [
    diagnosticFinishReason ? `finish_reason=${diagnosticFinishReason}` : null,
    `reasoning_received=${reasoningReceived}`,
  ]
    .filter((detail): detail is string => Boolean(detail))
    .join('; ')

  if (finishReason === 'length') {
    return createProviderStreamError(
      'The provider reached its output limit before completing the answer.',
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

function readEffectiveReasoningContext(response: Record<string, unknown>) {
  const reasoning =
    typeof response.reasoning === 'object' && response.reasoning !== null
      ? (response.reasoning as Record<string, unknown>)
      : null
  const context = reasoning?.context

  return context === 'all_turns' || context === 'current_turn' ? context : null
}

function parseCompletedResponsesState(
  response: Record<string, unknown>,
  target: ResolvedChatTarget,
) {
  if (response.status !== 'completed' || target.protocolConfig.protocol !== 'openai-responses') {
    throw createProviderStreamError('The provider returned an invalid completed Response.')
  }

  const outputItems = validateResponsesOutputItems(response.output)

  if (!outputItems) {
    throw createProviderStreamError('The provider returned unsupported Response output items.')
  }

  const finalContent = readResponsesVisibleText(outputItems)

  if (!finalContent.trim()) {
    throw createProviderStreamError('The provider returned an empty Response.')
  }

  const effectiveReasoningContext = readEffectiveReasoningContext(response)

  if (
    target.protocolConfig.reasoningContext !== 'auto' &&
    effectiveReasoningContext !== target.protocolConfig.reasoningContext
  ) {
    throw createProviderStreamError(
      'The provider did not honor the selected reasoning context.',
      'reasoning_context_mismatch=true',
      false,
    )
  }

  const providerState = {
    version: 1,
    protocol: 'openai-responses',
    effectiveReasoningContext,
    outputItems,
  } as const satisfies ResponsesContinuationStateV1

  if (
    Buffer.byteLength(JSON.stringify(providerState)) >
    responsesContinuationLimits.maxSerializedBytes
  ) {
    throw createProviderStreamError(
      'The provider returned too much continuation state.',
      'responses_state_too_large=true',
      false,
    )
  }

  return { finalContent, providerState }
}

export async function streamOpenAiResponses({
  target,
  instructions,
  input,
  attachmentBearing = false,
  documentBearing = false,
  fetcher = fetch,
  signal,
  onDelta,
}: {
  target: ResolvedChatTarget
  instructions: string
  input: ReadonlyArray<JsonValue>
  attachmentBearing?: boolean
  documentBearing?: boolean
  fetcher?: (input: string | URL, init?: RequestInit) => Promise<Response>
  signal: AbortSignal
  onDelta: (delta: string, snapshot: string) => void | Promise<void>
}) {
  const providerRequest = buildOpenAiResponsesRequest({ target, instructions, input })
  const response = await fetcher(providerRequest.url, { ...providerRequest.options, signal })

  if (!response.ok) {
    if (attachmentBearing && [400, 413, 415].includes(response.status)) {
      throw createChatBridgeError({
        code: 'content_rejected',
        message: documentBearing
          ? nyxChatAttachmentContentRejectedMessage
          : nyxChatContentRejectedMessage,
        retryable: true,
      })
    }

    throw toUpstreamError(
      response,
      attachmentBearing ? undefined : await readErrorDetails(response),
    )
  }

  if (!response.body) {
    throw createChatBridgeError({
      code: 'upstream_error',
      message: 'The relay API did not return a response body.',
      retryable: true,
    })
  }

  let streamedContent = ''
  let terminal: ReturnType<typeof parseCompletedResponsesState> | null = null

  for await (const payload of iterateSseData(response.body)) {
    if (payload === '[DONE]') {
      if (!terminal) {
        throw createProviderStreamError('The Responses stream ended before completion.')
      }
      continue
    }

    const event = decodeOpenAiResponsesStream(payload)

    if (terminal) {
      throw createProviderStreamError('The provider emitted events after a terminal Response.')
    }

    switch (event.type) {
      case 'text-delta':
        streamedContent += event.text
        await onDelta(event.text, streamedContent)
        break
      case 'reasoning-activity':
      case 'lifecycle':
        break
      case 'completed':
        if (terminal) {
          throw createProviderStreamError('The provider emitted duplicate terminal Responses.')
        }
        terminal = parseCompletedResponsesState(event.response, target)
        break
      case 'terminal-error':
      case 'error':
        throw createProviderStreamError('The provider could not complete the Response.')
    }
  }

  if (!terminal) {
    throw createProviderStreamError('The Responses stream ended before completion.')
  }

  if (terminal.finalContent !== streamedContent) {
    throw createProviderStreamError(
      'The streamed Response did not match its completed terminal.',
      'responses_terminal_mismatch=true',
      false,
    )
  }

  return terminal
}

export async function streamChatCompletion({
  target,
  request,
  providerMessages,
  documentBearing = false,
  signal,
  onDelta,
}: StreamChatCompletionOptions) {
  const imageBearing = providerMessages.some(
    (message) =>
      !isResponsesOutputItem(message) &&
      Array.isArray(message.content) &&
      message.content.some((part) => part.type === 'image_url'),
  )
  const attachmentBearing = imageBearing || documentBearing

  if (target.protocolConfig.protocol === 'openai-responses') {
    return streamOpenAiResponses({
      target,
      instructions: buildOpenAiResponsesInstructions(request, providerMessages),
      input: buildOpenAiResponsesInput(providerMessages),
      attachmentBearing,
      documentBearing,
      signal,
      onDelta,
    })
  }

  const providerRequest = buildChatProviderRequest(target, request, providerMessages)
  const response = await fetch(providerRequest.url, {
    ...providerRequest.options,
    signal,
  })

  if (!response.ok) {
    if (attachmentBearing && [400, 413, 415].includes(response.status)) {
      throw createChatBridgeError({
        code: 'content_rejected',
        message: documentBearing
          ? nyxChatAttachmentContentRejectedMessage
          : nyxChatContentRejectedMessage,
        retryable: true,
      })
    }

    throw toUpstreamError(
      response,
      attachmentBearing ? undefined : await readErrorDetails(response),
    )
  }

  if (!response.body) {
    throw createChatBridgeError({
      code: 'upstream_error',
      message: 'The relay API did not return a response body.',
      retryable: true,
    })
  }

  let finalContent = ''
  let finishReason: NormalizedFinishReason | null = null
  let nativeFinishReason: string | null = null
  let reasoningReceived = false

  providerStream: for await (const payload of iterateSseData(response.body)) {
    if (payload === '[DONE]') {
      break
    }

    for (const event of decodeOpenAiCompatibleStream(payload)) {
      switch (event.type) {
        case 'reasoning-activity':
          reasoningReceived = true
          break
        case 'text-delta':
          finalContent += event.text
          await onDelta(event.text, finalContent)
          break
        case 'error':
          throw toProviderStreamEventError(event.diagnostic)
        case 'finish':
          finishReason = event.reason
          nativeFinishReason = event.nativeReason

          if (finishReason === 'error') {
            throw createProviderStreamError(
              'The provider returned an error while streaming.',
              'finish_reason=error',
            )
          }

          break providerStream
      }
    }
  }

  if (finishReason === 'length' || finalContent.trim().length === 0) {
    throw createProviderTerminalError({
      finishReason,
      nativeFinishReason,
      reasoningReceived,
    })
  }

  return {
    finalContent,
  }
}
