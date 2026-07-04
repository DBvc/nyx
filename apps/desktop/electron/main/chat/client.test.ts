import { describe, expect, it } from 'vitest'

import type { NyxChatRequest } from '../../../shared/chat/types'
import { buildChatCompletionsUrl, buildProviderMessages, iterateSseData } from './client'

function requestWithMessages(messages: NyxChatRequest['messages']): NyxChatRequest {
  return {
    requestId: 'request-1',
    userMessageId: 'user-1',
    assistantMessageId: 'assistant-1',
    turnIntent: 'new_user_message',
    messages,
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
