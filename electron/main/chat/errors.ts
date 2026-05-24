import type { NyxChatError } from '../../../shared/chat/types'

export class NyxChatBridgeError extends Error {
  readonly chatError: NyxChatError

  constructor(chatError: NyxChatError) {
    super(chatError.message)
    this.name = 'NyxChatBridgeError'
    this.chatError = chatError
  }
}

export function createNyxChatBridgeError(chatError: NyxChatError) {
  return new NyxChatBridgeError(chatError)
}

export function isAbortError(error: unknown) {
  return error instanceof Error && error.name === 'AbortError'
}

export function toNyxChatError(error: unknown): NyxChatError {
  if (error instanceof NyxChatBridgeError) {
    return error.chatError
  }

  if (isAbortError(error)) {
    return {
      code: 'cancelled',
      message: 'Generation stopped.',
      retryable: false,
    }
  }

  if (error instanceof TypeError) {
    return {
      code: 'network_error',
      message: 'Nyx could not reach the relay API.',
      retryable: true,
      details: error.message,
    }
  }

  if (error instanceof Error) {
    return {
      code: 'unknown',
      message: error.message || 'Unexpected chat error.',
      retryable: true,
    }
  }

  return {
    code: 'unknown',
    message: 'Unexpected chat error.',
    retryable: true,
  }
}
