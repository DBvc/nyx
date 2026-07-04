import { describe, expect, it } from 'vitest'

import type { NyxChatRequest } from '../../../shared/chat/types'
import { validateNyxChatRequest } from './session'

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
