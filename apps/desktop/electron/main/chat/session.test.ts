import type { WebContents } from 'electron'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { NyxChatRequest } from '../../../shared/chat/types'
import { NYX_CHAT_IPC_CHANNELS } from '../../../shared/chat/ipc'

const streamChatCompletion = vi.hoisted(() => vi.fn())

vi.mock('./client', () => ({
  streamChatCompletion,
}))

vi.mock('./env', () => ({
  readNyxChatRuntimeConfig: () => ({
    baseUrl: 'https://example.com/v1/',
    token: 'token',
    model: 'model',
  }),
}))

import { NyxChatSessionManager, validateNyxChatRequest } from './session'

function validRequest(): NyxChatRequest {
  return {
    requestId: 'request-1',
    userMessageId: 'user-1',
    assistantMessageId: 'assistant-1',
    turnIntent: 'new_user_message',
    messages: [
      {
        role: 'user',
        content: 'Hello Nyx',
      },
    ],
  }
}

function mockSender() {
  return {
    isDestroyed: vi.fn(() => false),
    send: vi.fn(),
  } as unknown as WebContents
}

describe('validateNyxChatRequest', () => {
  it('accepts a complete new user message request', () => {
    expect(validateNyxChatRequest(validRequest())).toBeNull()
  })

  it('accepts a complete retry failed response request', () => {
    expect(
      validateNyxChatRequest({
        ...validRequest(),
        turnIntent: 'retry_failed_response',
      }),
    ).toBeNull()
  })

  it('requires a stable user message id', () => {
    expect(
      validateNyxChatRequest({
        ...validRequest(),
        userMessageId: '',
      }),
    ).toEqual({
      code: 'invalid_request',
      message: 'Chat requests must include ids, intent, and at least one message.',
      retryable: false,
    })
  })

  it('requires a known product turn intent', () => {
    expect(
      validateNyxChatRequest({
        ...validRequest(),
        turnIntent: 'unknown_intent' as NyxChatRequest['turnIntent'],
      }),
    ).toEqual({
      code: 'invalid_request',
      message: 'Chat requests must use a known turn intent.',
      retryable: false,
    })
  })
})

describe('NyxChatSessionManager reset', () => {
  beforeEach(() => {
    streamChatCompletion.mockReset()
  })

  it('aborts and clears the active session for the same sender', () => {
    let signal: AbortSignal | undefined
    streamChatCompletion.mockImplementation(({ signal: activeSignal }: { signal: AbortSignal }) => {
      signal = activeSignal
      return new Promise(() => {})
    })
    const sender = mockSender()
    const manager = new NyxChatSessionManager()

    manager.start(sender, validRequest())
    manager.reset(sender)

    expect(signal?.aborted).toBe(true)
    expect(sender.send).toHaveBeenCalledWith(NYX_CHAT_IPC_CHANNELS.event, {
      type: 'chat:start',
      requestId: 'request-1',
      assistantMessageId: 'assistant-1',
      status: 'streaming',
    })

    manager.start(sender, {
      ...validRequest(),
      requestId: 'request-2',
      assistantMessageId: 'assistant-2',
    })

    expect(streamChatCompletion).toHaveBeenCalledTimes(2)
  })

  it('does not reset an active session owned by another sender', () => {
    let signal: AbortSignal | undefined
    streamChatCompletion.mockImplementation(({ signal: activeSignal }: { signal: AbortSignal }) => {
      signal = activeSignal
      return new Promise(() => {})
    })
    const sender = mockSender()
    const otherSender = mockSender()
    const manager = new NyxChatSessionManager()

    manager.start(sender, validRequest())
    manager.reset(otherSender)

    expect(signal?.aborted).toBe(false)
  })
})
