import { afterEach, describe, expect, it, vi } from 'vitest'

import type { NyxChatRequest } from '../../../shared/chat/types'
import type { ResolvedChatTarget } from '../connections/provider-resolver'
import {
  buildChatCompletionsUrl,
  buildOpenAiCompatibleChatRequest,
  buildProviderMessages,
  iterateSseData,
  streamChatCompletion,
} from './client'

function requestWithMessages(messages: NyxChatRequest['messages']): NyxChatRequest {
  return {
    requestId: 'request-1',
    userMessageId: 'user-1',
    assistantMessageId: 'assistant-1',
    turnIntent: 'new_user_message',
    turnUserMessage: {
      id: 'user-1',
      content: 'Hello',
    },
    messages,
    targetSelection: { kind: 'env_fallback' },
  }
}

function streamFromChunks(chunks: ReadonlyArray<string>) {
  const encoder = new TextEncoder()

  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk))
      }

      controller.close()
    },
  })
}

function responseFromPayloads(payloads: ReadonlyArray<unknown>) {
  return new Response(
    streamFromChunks(
      payloads.map((payload) =>
        typeof payload === 'string'
          ? `data: ${payload}\n\n`
          : `data: ${JSON.stringify(payload)}\n\n`,
      ),
    ),
    {
      headers: {
        'Content-Type': 'text/event-stream',
      },
      status: 200,
    },
  )
}

const resolvedTarget: ResolvedChatTarget = {
  providerId: 'provider-1',
  baseUrl: 'https://api.example.test/v1/',
  token: 'secret-token',
  modelId: 'glm-5.2',
  protocol: 'openai-chat-completions',
  targetAttribution: {
    kind: 'connection',
    providerId: 'provider-1',
    providerDisplayName: 'Provider One',
    modelId: 'glm-5.2',
    modelDisplayName: 'GLM 5.2',
  },
}

async function streamWithResponse(
  response: Response,
  signal = new AbortController().signal,
  onDelta = vi.fn(),
) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => response),
  )

  const result = await streamChatCompletion({
    target: resolvedTarget,
    request: requestWithMessages([{ role: 'user', content: 'Hello' }]),
    signal,
    onDelta,
  })

  return { onDelta, result }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

async function collectSseData(chunks: ReadonlyArray<string>) {
  const payloads: string[] = []

  for await (const payload of iterateSseData(streamFromChunks(chunks))) {
    payloads.push(payload)
  }

  return payloads
}

describe('buildChatCompletionsUrl', () => {
  it.each([
    ['https://example.com', 'https://example.com/v1/chat/completions'],
    ['https://example.com/v1/', 'https://example.com/v1/chat/completions'],
    ['https://example.com/custom/v1/', 'https://example.com/custom/v1/chat/completions'],
  ])('builds chat completions URL from %s', (baseUrl, expected) => {
    expect(buildChatCompletionsUrl(baseUrl)).toBe(expected)
  })
})

describe('buildProviderMessages', () => {
  it('prepends the default system prompt when no system message exists', () => {
    const messages = buildProviderMessages(
      requestWithMessages([
        {
          role: 'user',
          content: 'Hello',
        },
      ]),
    )

    expect(messages).toEqual([
      {
        role: 'system',
        content: 'You are Nyx, a concise and reliable desktop AI assistant.',
      },
      {
        role: 'user',
        content: 'Hello',
      },
    ])
  })

  it('does not add another system message when one already exists', () => {
    const request = requestWithMessages([
      {
        role: 'system',
        content: 'Existing system prompt.',
      },
      {
        role: 'user',
        content: 'Hello',
      },
    ])

    expect(buildProviderMessages(request)).toBe(request.messages)
  })

  it('uses a custom system prompt when no system message exists', () => {
    expect(
      buildProviderMessages({
        ...requestWithMessages([
          {
            role: 'user',
            content: 'Hello',
          },
        ]),
        systemPrompt: 'Custom system prompt.',
      }),
    ).toEqual([
      {
        role: 'system',
        content: 'Custom system prompt.',
      },
      {
        role: 'user',
        content: 'Hello',
      },
    ])
  })

  it('keeps turn user message identity out of provider messages', () => {
    expect(
      buildProviderMessages({
        ...requestWithMessages([
          {
            role: 'user',
            content: 'Provider context only.',
          },
        ]),
        turnUserMessage: {
          id: 'user-with-id',
          content: 'Explicit current prompt.',
        },
      }),
    ).toEqual([
      {
        role: 'system',
        content: 'You are Nyx, a concise and reliable desktop AI assistant.',
      },
      {
        role: 'user',
        content: 'Provider context only.',
      },
    ])
  })
})

describe('buildOpenAiCompatibleChatRequest', () => {
  it('preserves the existing generic request mapping', () => {
    const request = requestWithMessages([{ role: 'user', content: 'Hello' }])

    expect(buildOpenAiCompatibleChatRequest(resolvedTarget, request)).toEqual({
      url: 'https://api.example.test/v1/chat/completions',
      options: {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer secret-token',
        },
        body: JSON.stringify({
          model: 'glm-5.2',
          stream: true,
          messages: [
            {
              role: 'system',
              content: 'You are Nyx, a concise and reliable desktop AI assistant.',
            },
            {
              role: 'user',
              content: 'Hello',
            },
          ],
        }),
      },
    })
  })
})

describe('iterateSseData', () => {
  it('yields a single data event', async () => {
    await expect(collectSseData(['data: {"message":"hello"}\n\n'])).resolves.toEqual([
      '{"message":"hello"}',
    ])
  })

  it('yields multiple events from one chunk', async () => {
    await expect(collectSseData(['data: {"index":1}\n\ndata: {"index":2}\n\n'])).resolves.toEqual([
      '{"index":1}',
      '{"index":2}',
    ])
  })

  it('handles an event split across chunks', async () => {
    await expect(collectSseData(['data: {"mes', 'sage":"hello"}\n\n'])).resolves.toEqual([
      '{"message":"hello"}',
    ])
  })

  it('normalizes CRLF separators', async () => {
    await expect(collectSseData(['data: {"message":"hello"}\r\n\r\n'])).resolves.toEqual([
      '{"message":"hello"}',
    ])
  })

  it('yields DONE payloads for the caller to handle', async () => {
    await expect(collectSseData(['data: [DONE]\n\n'])).resolves.toEqual(['[DONE]'])
  })

  it('yields a trailing event without a final blank line', async () => {
    await expect(collectSseData(['data: {"message":"trailing"}'])).resolves.toEqual([
      '{"message":"trailing"}',
    ])
  })
})

describe('streamChatCompletion', () => {
  it('recognizes reasoning activity without exposing it as assistant content', async () => {
    const { onDelta, result } = await streamWithResponse(
      responseFromPayloads([
        {
          choices: [{ delta: { reasoning_content: 'private reasoning' }, finish_reason: null }],
        },
        { choices: [{ delta: { content: 'Hello' }, finish_reason: null }] },
        { choices: [{ delta: { content: ' world' }, finish_reason: 'stop' }] },
      ]),
    )

    expect(result).toEqual({ finalContent: 'Hello world' })
    expect(onDelta).toHaveBeenNthCalledWith(1, 'Hello', 'Hello')
    expect(onDelta).toHaveBeenNthCalledWith(2, ' world', 'Hello world')
  })

  it('fails when a provider finishes reasoning without answer text', async () => {
    await expect(
      streamWithResponse(
        responseFromPayloads([
          {
            choices: [{ delta: { reasoning_content: 'private reasoning' }, finish_reason: null }],
          },
          { choices: [{ delta: {}, finish_reason: 'stop' }] },
        ]),
      ),
    ).rejects.toMatchObject({
      chatError: {
        code: 'upstream_error',
        details: 'finish_reason=stop; reasoning_received=true',
        retryable: true,
      },
    })
  })

  it('fails clearly when reasoning exhausts the provider output limit', async () => {
    await expect(
      streamWithResponse(
        responseFromPayloads([
          {
            choices: [
              { delta: { reasoning_content: 'private reasoning' }, finish_reason: 'length' },
            ],
          },
        ]),
      ),
    ).rejects.toMatchObject({
      chatError: {
        code: 'upstream_error',
        details: 'finish_reason=length; reasoning_received=true',
        retryable: true,
      },
    })
  })

  it('fails retryably after preserving partial text when output length is exhausted', async () => {
    const onDelta = vi.fn()

    await expect(
      streamWithResponse(
        responseFromPayloads([
          {
            choices: [{ delta: { content: 'Partial answer' }, finish_reason: 'length' }],
          },
        ]),
        new AbortController().signal,
        onDelta,
      ),
    ).rejects.toMatchObject({
      chatError: {
        code: 'upstream_error',
        details: 'finish_reason=length; reasoning_received=false',
        message: 'The provider reached its output limit before completing the answer.',
        retryable: true,
      },
    })

    expect(onDelta).toHaveBeenCalledWith('Partial answer', 'Partial answer')
  })

  it('maps a provider error delivered inside the stream', async () => {
    await expect(
      streamWithResponse(
        responseFromPayloads([
          {
            choices: [{ delta: {}, finish_reason: null }],
            error: { message: 'Provider overloaded.' },
          },
        ]),
      ),
    ).rejects.toMatchObject({
      chatError: {
        code: 'upstream_error',
        details: 'stream_error=true',
        retryable: true,
      },
    })
  })

  it('maps an error finish reason without a top-level error', async () => {
    await expect(
      streamWithResponse(
        responseFromPayloads([{ choices: [{ delta: {}, finish_reason: 'error' }] }]),
      ),
    ).rejects.toMatchObject({
      chatError: {
        code: 'upstream_error',
        details: 'finish_reason=error',
        retryable: true,
      },
    })
  })

  it('fails when a provider returns an empty terminal response', async () => {
    await expect(
      streamWithResponse(
        responseFromPayloads([{ choices: [{ delta: {}, finish_reason: 'stop' }] }]),
      ),
    ).rejects.toMatchObject({
      chatError: {
        code: 'upstream_error',
        details: 'finish_reason=stop; reasoning_received=false',
        message: 'The provider returned an empty response.',
        retryable: true,
      },
    })
  })

  it('preserves non-retryable empty content-filter termination', async () => {
    await expect(
      streamWithResponse(
        responseFromPayloads([{ choices: [{ delta: {}, finish_reason: 'content_filter' }] }]),
      ),
    ).rejects.toMatchObject({
      chatError: {
        code: 'upstream_error',
        details: 'finish_reason=content_filter; reasoning_received=false',
        retryable: false,
      },
    })
  })

  it('retains a safe unknown finish reason in main-owned diagnostics', async () => {
    await expect(
      streamWithResponse(
        responseFromPayloads([{ choices: [{ delta: {}, finish_reason: 'provider_specific' }] }]),
      ),
    ).rejects.toMatchObject({
      chatError: {
        code: 'upstream_error',
        details: 'finish_reason=provider_specific; reasoning_received=false',
        retryable: true,
      },
    })
  })

  it('maps malformed stream data to a safe upstream error', async () => {
    await expect(streamWithResponse(responseFromPayloads(['{"choices":[']))).rejects.toMatchObject({
      chatError: {
        code: 'upstream_error',
        details: 'stream_parse_error=true',
        retryable: true,
      },
    })
  })

  it.each([
    ['reasoning', { reasoning_content: 'private reasoning' }],
    ['text', { content: 'Partial answer' }],
  ])('preserves abort semantics while %s is streaming', async (_streamKind, delta) => {
    const abortController = new AbortController()
    const encoder = new TextEncoder()
    const response = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                choices: [{ delta, finish_reason: null }],
              })}\n\n`,
            ),
          )
          abortController.signal.addEventListener(
            'abort',
            () => {
              controller.error(new DOMException('The operation was aborted.', 'AbortError'))
            },
            { once: true },
          )
        },
      }),
      { status: 200 },
    )

    const operation = streamWithResponse(response, abortController.signal)

    await vi.waitFor(() => {
      expect(fetch).toHaveBeenCalledOnce()
    })
    abortController.abort()

    await expect(operation).rejects.toMatchObject({ name: 'AbortError' })
  })
})
