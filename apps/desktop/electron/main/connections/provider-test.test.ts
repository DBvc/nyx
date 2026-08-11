import { describe, expect, it, vi } from 'vitest'

import {
  buildProviderChatCompletionsUrl,
  buildProviderModelsUrl,
  ConnectionsProviderError,
  createProviderConnectionClient,
  type FetchLike,
} from './provider-test'

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  })
}

function responsesStream(text: string) {
  const response = {
    status: 'completed',
    reasoning: { context: null },
    output: [
      {
        type: 'message',
        role: 'assistant',
        status: 'completed',
        content: [{ type: 'output_text', text, annotations: [] }],
      },
    ],
  }
  const body = [
    { type: 'response.output_text.delta', delta: text },
    { type: 'response.completed', response },
  ]
    .map((event) => `data: ${JSON.stringify(event)}\n\n`)
    .join('')

  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
}

function abortError() {
  const error = new Error('request url https://api.example.test/v1/chat/completions timed out')
  error.name = 'AbortError'

  return error
}

async function readProviderError(operation: Promise<unknown>) {
  try {
    await operation
  } catch (error) {
    expect(error).toBeInstanceOf(ConnectionsProviderError)

    return error as ConnectionsProviderError
  }

  throw new Error('Expected provider operation to fail.')
}

describe('provider connection URL builders', () => {
  it.each([
    ['https://api.example.test', 'https://api.example.test/v1/chat/completions'],
    ['https://api.example.test/v1/', 'https://api.example.test/v1/chat/completions'],
    ['https://api.example.test/custom/v1/', 'https://api.example.test/custom/v1/chat/completions'],
  ])('builds chat completions URL from %s', (baseUrl, expected) => {
    expect(buildProviderChatCompletionsUrl(baseUrl)).toBe(expected)
  })

  it.each([
    ['https://api.example.test', 'https://api.example.test/v1/models'],
    ['https://api.example.test/v1/', 'https://api.example.test/v1/models'],
    ['https://api.example.test/custom/v1/', 'https://api.example.test/custom/v1/models'],
  ])('builds models URL from %s', (baseUrl, expected) => {
    expect(buildProviderModelsUrl(baseUrl)).toBe(expected)
  })
})

describe('ProviderConnectionClient', () => {
  it('sends a tiny non-streaming chat request and reports latency on 2xx', async () => {
    const fetch = vi.fn<FetchLike>(async () => jsonResponse({ id: 'chatcmpl-ok' }))
    const client = createProviderConnectionClient({
      fetch,
      nowMs: vi.fn().mockReturnValueOnce(100).mockReturnValueOnce(147),
    })

    await expect(
      client.testConnection({
        apiKey: 'sk-secret',
        baseUrl: 'https://api.example.test/v1',
        modelId: 'model-1',
        protocolConfig: { protocol: 'openai-chat-completions' },
      }),
    ).resolves.toEqual({ latencyMs: 47 })
    expect(fetch).toHaveBeenCalledWith(
      'https://api.example.test/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer sk-secret',
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          model: 'model-1',
          stream: false,
          max_tokens: 1,
          messages: [
            {
              role: 'user',
              content: 'Reply with OK.',
            },
          ],
        }),
      }),
    )
  })

  it('tests Responses with a semantic two-request continuation replay', async () => {
    const fetch = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(responsesStream('TEST_ONE'))
      .mockResolvedValueOnce(responsesStream('TEST_ONE TEST_TWO'))
    const client = createProviderConnectionClient({
      fetch,
      nowMs: vi.fn().mockReturnValueOnce(100).mockReturnValueOnce(180),
    })

    await expect(
      client.testConnection({
        apiKey: 'sk-secret',
        baseUrl: 'https://api.example.test/v1',
        modelId: 'gpt-5.6-sol',
        protocolConfig: { protocol: 'openai-responses', reasoningContext: 'auto' },
      }),
    ).resolves.toEqual({ latencyMs: 80 })

    expect(fetch).toHaveBeenCalledTimes(2)
    const firstBody = JSON.parse(fetch.mock.calls[0]![1]!.body as string)
    const secondBody = JSON.parse(fetch.mock.calls[1]![1]!.body as string)
    expect(firstBody).toMatchObject({
      store: false,
      stream: true,
      include: ['reasoning.encrypted_content'],
    })
    expect(firstBody).not.toHaveProperty('reasoning')
    expect(secondBody.input).toEqual([
      firstBody.input[0],
      {
        type: 'message',
        role: 'assistant',
        status: 'completed',
        content: [{ type: 'output_text', text: 'TEST_ONE', annotations: [] }],
      },
      expect.objectContaining({ role: 'user' }),
    ])
  })

  it.each([401, 403])(
    'maps HTTP %s to auth_failed without raw response details',
    async (status) => {
      const fetch = vi.fn<FetchLike>(async () =>
        jsonResponse({ error: { message: 'raw sk-secret Authorization detail' } }, status),
      )
      const client = createProviderConnectionClient({ fetch })
      const error = await readProviderError(
        client.testConnection({
          apiKey: 'sk-secret',
          baseUrl: 'https://api.example.test/v1',
          modelId: 'model-1',
          protocolConfig: { protocol: 'openai-chat-completions' },
        }),
      )

      expect(error.safeError).toEqual({
        code: 'auth_failed',
        message: 'Nyx could not authenticate with this provider.',
        retryable: false,
        safeDetails: `HTTP ${status}`,
      })
      expect(JSON.stringify(error.safeError)).not.toContain('sk-secret')
      expect(JSON.stringify(error.safeError)).not.toContain('Authorization')
    },
  )

  it('maps HTTP 429 to a retryable rate_limited error', async () => {
    const client = createProviderConnectionClient({
      fetch: vi.fn<FetchLike>(async () => jsonResponse({}, 429)),
    })
    const error = await readProviderError(
      client.testConnection({
        apiKey: 'sk-secret',
        baseUrl: 'https://api.example.test/v1',
        modelId: 'model-1',
        protocolConfig: { protocol: 'openai-chat-completions' },
      }),
    )

    expect(error.safeError).toEqual({
      code: 'rate_limited',
      message: 'The provider is rate limiting this request.',
      retryable: true,
      safeDetails: 'HTTP 429',
    })
  })

  it('maps timeout aborts to network_error without leaking the request URL', async () => {
    const client = createProviderConnectionClient({
      fetch: vi.fn<FetchLike>(async () => {
        throw abortError()
      }),
    })
    const error = await readProviderError(
      client.testConnection({
        apiKey: 'sk-secret',
        baseUrl: 'https://api.example.test/v1',
        modelId: 'model-1',
        protocolConfig: { protocol: 'openai-chat-completions' },
      }),
    )

    expect(error.safeError).toEqual({
      code: 'network_error',
      message: 'Timed out while contacting the provider.',
      retryable: true,
    })
    expect(JSON.stringify(error.safeError)).not.toContain('api.example.test')
  })

  it('refreshes model ids from /v1/models and removes duplicate ids', async () => {
    const client = createProviderConnectionClient({
      fetch: vi.fn<FetchLike>(async () =>
        jsonResponse({
          data: [{ id: 'model-1' }, { id: ' model-2 ' }, { id: 'model-1' }, { id: '' }],
        }),
      ),
    })

    await expect(
      client.refreshModels({
        apiKey: 'sk-secret',
        baseUrl: 'https://api.example.test/v1',
      }),
    ).resolves.toEqual({
      modelIds: ['model-1', 'model-2'],
    })
  })

  it('maps unsupported /v1/models responses to unsupported', async () => {
    const client = createProviderConnectionClient({
      fetch: vi.fn<FetchLike>(async () => jsonResponse({}, 404)),
    })
    const error = await readProviderError(
      client.refreshModels({
        apiKey: 'sk-secret',
        baseUrl: 'https://api.example.test/v1',
      }),
    )

    expect(error.safeError).toEqual({
      code: 'unsupported',
      message: 'This provider does not expose a compatible models endpoint.',
      retryable: false,
      safeDetails: 'HTTP 404',
    })
  })
})
