import { afterEach, describe, expect, it, vi } from 'vitest'

import type { NyxChatRequest } from '../../../shared/chat/types'
import type { ResolvedChatTarget } from '../connections/provider-resolver'
import type { CurrentThreadProviderMessage } from '../current-thread/session-coordinator'
import {
  buildChatCompletionsUrl,
  buildOpenAiCompatibleChatRequest,
  buildOpenAiResponsesInput,
  buildOpenAiResponsesRequest,
  buildResponsesUrl,
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
  protocolConfig: { protocol: 'openai-chat-completions' },
  executionIdentity: 'a'.repeat(64),
  targetAttribution: {
    kind: 'connection',
    providerId: 'provider-1',
    providerDisplayName: 'Provider One',
    modelId: 'glm-5.2',
    modelDisplayName: 'GLM 5.2',
  },
}

const responsesTarget: ResolvedChatTarget = {
  ...resolvedTarget,
  modelId: 'gpt-5.6-sol',
  protocolConfig: { protocol: 'openai-responses', reasoningContext: 'auto' },
}

function completedResponse(text = 'Hello') {
  return {
    status: 'completed',
    reasoning: { context: null },
    output: [
      {
        id: 'reasoning-1',
        type: 'reasoning',
        encrypted_content: 'encrypted-state',
        summary: [],
        content: [],
      },
      {
        type: 'message',
        role: 'assistant',
        status: 'completed',
        content: [{ type: 'output_text', text, annotations: [] }],
      },
    ],
  }
}

async function streamWithResponse(
  response: Response,
  signal = new AbortController().signal,
  onDelta = vi.fn(),
  providerMessages?: ReadonlyArray<CurrentThreadProviderMessage>,
  documentBearing = false,
) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => response),
  )

  const result = await streamChatCompletion({
    target: resolvedTarget,
    request: requestWithMessages([{ role: 'user', content: 'Hello' }]),
    ...(providerMessages ? { providerMessages } : {}),
    documentBearing,
    signal,
    onDelta,
  })

  return { onDelta, result }
}

async function streamResponses(
  payloads: ReadonlyArray<unknown>,
  target: ResolvedChatTarget = responsesTarget,
  onDelta = vi.fn(),
) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => responseFromPayloads(payloads)),
  )

  return {
    onDelta,
    result: await streamChatCompletion({
      target,
      request: requestWithMessages([{ role: 'user', content: 'Hello' }]),
      signal: new AbortController().signal,
      onDelta,
    }),
  }
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

  it('maps text first and ordered main-only image data without durable ids or paths', () => {
    const providerMessages: CurrentThreadProviderMessage[] = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Inspect these' },
          { type: 'image_url', image_url: { url: 'data:image/png;base64,AQ==' } },
          { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,Ag==' } },
        ],
      },
    ]
    const request = buildOpenAiCompatibleChatRequest(
      resolvedTarget,
      requestWithMessages([{ role: 'user', content: 'Inspect these' }]),
      providerMessages,
    )
    const body = JSON.parse(request.options.body)

    expect(body.messages).toEqual([
      {
        role: 'system',
        content: 'You are Nyx, a concise and reliable desktop AI assistant.',
      },
      ...providerMessages,
    ])
    expect(request.options.body).not.toContain('00000000-')
    expect(request.options.body).not.toContain('/private/')
  })

  it('rejects native Responses items on the Chat Completions path', () => {
    expect(() =>
      buildOpenAiCompatibleChatRequest(
        resolvedTarget,
        requestWithMessages([{ role: 'user', content: 'Hello' }]),
        [
          {
            kind: 'responses-output-item',
            item: { type: 'reasoning', encrypted_content: 'encrypted' },
          },
        ],
      ),
    ).toThrow('Chat Completions cannot receive Responses continuation items.')
  })
})

describe('OpenAI Responses request mapping', () => {
  it.each([
    ['https://example.com', 'https://example.com/v1/responses'],
    ['https://example.com/v1/', 'https://example.com/v1/responses'],
    ['https://example.com/custom/v1/', 'https://example.com/custom/v1/responses'],
  ])('builds Responses URL from %s', (baseUrl, expected) => {
    expect(buildResponsesUrl(baseUrl)).toBe(expected)
  })

  it('maps text, image, instructions, stateless continuation, and auto context exactly', () => {
    const providerMessages: CurrentThreadProviderMessage[] = [
      { role: 'system', content: 'System instruction.' },
      { role: 'assistant', content: 'Prior answer.' },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Inspect this.' },
          { type: 'image_url', image_url: { url: 'data:image/png;base64,AQ==' } },
        ],
      },
    ]
    const input = buildOpenAiResponsesInput(providerMessages)
    const request = buildOpenAiResponsesRequest({
      target: responsesTarget,
      instructions: 'System instruction.',
      input,
    })

    expect(request.url).toBe('https://api.example.test/v1/responses')
    expect(JSON.parse(request.options.body)).toEqual({
      model: 'gpt-5.6-sol',
      store: false,
      stream: true,
      include: ['reasoning.encrypted_content'],
      instructions: 'System instruction.',
      input: [
        {
          role: 'assistant',
          content: [{ type: 'input_text', text: 'Prior answer.' }],
        },
        {
          role: 'user',
          content: [
            { type: 'input_text', text: 'Inspect this.' },
            { type: 'input_image', image_url: 'data:image/png;base64,AQ==' },
          ],
        },
      ],
    })
  })

  it('preserves native output items in their exact history position', () => {
    const reasoning = {
      id: 'reasoning-1',
      type: 'reasoning',
      encrypted_content: 'encrypted-state',
      summary: [],
      content: [],
    }
    const message = {
      id: 'message-1',
      type: 'message',
      role: 'assistant',
      status: 'completed',
      content: [{ type: 'output_text', text: 'Native answer' }],
    }

    expect(
      buildOpenAiResponsesInput([
        { role: 'user', content: 'First question' },
        { kind: 'responses-output-item', item: reasoning },
        { kind: 'responses-output-item', item: message },
        { role: 'user', content: 'Continue' },
      ]),
    ).toEqual([
      { role: 'user', content: [{ type: 'input_text', text: 'First question' }] },
      reasoning,
      message,
      { role: 'user', content: [{ type: 'input_text', text: 'Continue' }] },
    ])
  })

  it('sends an explicit reasoning context without inference or fallback', () => {
    const request = buildOpenAiResponsesRequest({
      target: {
        ...responsesTarget,
        protocolConfig: { protocol: 'openai-responses', reasoningContext: 'all_turns' },
      },
      instructions: 'System instruction.',
      input: [],
    })

    expect(JSON.parse(request.options.body)).toMatchObject({
      reasoning: { context: 'all_turns' },
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
  it.each([400, 413, 415])(
    'maps image-bearing HTTP %s to one retryable content rejection without details',
    async (status) => {
      const operation = streamWithResponse(
        new Response('{"error":{"message":"secret provider body"}}', { status }),
        new AbortController().signal,
        vi.fn(),
        [
          {
            role: 'user',
            content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,AQ==' } }],
          },
        ],
      )

      await expect(operation).rejects.toMatchObject({
        chatError: {
          code: 'content_rejected',
          message: 'The selected target rejected this image request.',
          retryable: true,
        },
      })
      await expect(operation).rejects.not.toHaveProperty('chatError.details')
    },
  )

  it.each([400, 413, 415])(
    'maps document-bearing HTTP %s to an attachment-neutral content rejection',
    async (status) => {
      const operation = streamWithResponse(
        new Response('{"error":{"message":"secret provider body"}}', { status }),
        new AbortController().signal,
        vi.fn(),
        [{ role: 'user', content: [{ type: 'text', text: 'document envelope' }] }],
        true,
      )

      await expect(operation).rejects.toMatchObject({
        chatError: {
          code: 'content_rejected',
          message: 'The selected target rejected this attachment request.',
          retryable: true,
        },
      })
      await expect(operation).rejects.not.toHaveProperty('chatError.details')
    },
  )

  it('keeps text-only 400 behavior while suppressing every image-bearing upstream body', async () => {
    const body = '{"error":{"message":"provider detail"}}'

    await expect(streamWithResponse(new Response(body, { status: 400 }))).rejects.toMatchObject({
      chatError: {
        code: 'invalid_request',
        details: 'provider detail',
        retryable: false,
      },
    })

    const imageOperation = streamWithResponse(
      new Response(body, { status: 500 }),
      new AbortController().signal,
      vi.fn(),
      [
        {
          role: 'user',
          content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,AQ==' } }],
        },
      ],
    )
    await expect(imageOperation).rejects.toMatchObject({
      chatError: { code: 'upstream_error', retryable: true },
    })
    await expect(imageOperation).rejects.not.toHaveProperty('chatError.details')
  })

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

describe('streamChatCompletion with Responses', () => {
  it('requires one matching completed terminal and returns bounded main-only output state', async () => {
    const { onDelta, result } = await streamResponses([
      { type: 'response.created' },
      { type: 'response.output_item.added', item: { type: 'reasoning' } },
      { type: 'response.output_text.delta', delta: 'Hel' },
      { type: 'response.output_text.delta', delta: 'lo' },
      { type: 'response.completed', response: completedResponse() },
    ])

    expect(onDelta).toHaveBeenNthCalledWith(1, 'Hel', 'Hel')
    expect(onDelta).toHaveBeenNthCalledWith(2, 'lo', 'Hello')
    expect(result).toEqual({
      finalContent: 'Hello',
      providerState: {
        version: 1,
        protocol: 'openai-responses',
        effectiveReasoningContext: null,
        outputItems: completedResponse().output,
      },
    })
    expect(JSON.stringify(result)).not.toContain('private reasoning')
  })

  it('treats refusal text as the visible assistant answer', async () => {
    const response = {
      status: 'completed',
      reasoning: { context: null },
      output: [
        {
          type: 'message',
          role: 'assistant',
          status: 'completed',
          content: [{ type: 'refusal', refusal: 'Cannot help.' }],
        },
      ],
    }

    await expect(
      streamResponses([
        { type: 'response.refusal.delta', delta: 'Cannot help.' },
        { type: 'response.completed', response },
      ]),
    ).resolves.toMatchObject({ result: { finalContent: 'Cannot help.' } })
  })

  it.each([
    [
      'incomplete',
      [{ type: 'response.output_text.delta', delta: 'Partial' }, { type: 'response.incomplete' }],
    ],
    ['failed', [{ type: 'response.failed' }]],
    ['top-level error', [{ type: 'error', error: { message: 'private' } }]],
    ['malformed event', ['{']],
    ['EOF', [{ type: 'response.output_text.delta', delta: 'Partial' }]],
    [
      'empty completed output',
      [{ type: 'response.completed', response: { ...completedResponse(''), output: [] } }],
    ],
    [
      'reasoning-only completed output',
      [
        {
          type: 'response.completed',
          response: { ...completedResponse(''), output: [completedResponse().output[0]] },
        },
      ],
    ],
    [
      'terminal mismatch',
      [
        { type: 'response.output_text.delta', delta: 'Different' },
        { type: 'response.completed', response: completedResponse() },
      ],
    ],
    [
      'duplicate terminal',
      [
        { type: 'response.output_text.delta', delta: 'Hello' },
        { type: 'response.completed', response: completedResponse() },
        { type: 'response.completed', response: completedResponse() },
      ],
    ],
    [
      'out-of-order lifecycle after terminal',
      [
        { type: 'response.output_text.delta', delta: 'Hello' },
        { type: 'response.completed', response: completedResponse() },
        { type: 'response.in_progress' },
      ],
    ],
  ])('fails closed on %s', async (_case, payloads) => {
    await expect(streamResponses(payloads)).rejects.toMatchObject({
      chatError: { code: 'upstream_error' },
    })
  })

  it('rejects unsupported output items and explicit context mismatches', async () => {
    const unsupported = completedResponse()
    unsupported.output.unshift({ type: 'function_call' } as (typeof unsupported.output)[number])
    await expect(
      streamResponses([
        { type: 'response.output_text.delta', delta: 'Hello' },
        { type: 'response.completed', response: unsupported },
      ]),
    ).rejects.toMatchObject({ chatError: { code: 'upstream_error' } })

    await expect(
      streamResponses(
        [
          { type: 'response.output_text.delta', delta: 'Hello' },
          { type: 'response.completed', response: completedResponse() },
        ],
        {
          ...responsesTarget,
          protocolConfig: { protocol: 'openai-responses', reasoningContext: 'all_turns' },
        },
      ),
    ).rejects.toMatchObject({
      chatError: { details: 'reasoning_context_mismatch=true', retryable: false },
    })
  })
})
