import type { WebContents } from 'electron'

import type { NyxChatEvent, NyxChatErrorEvent } from '../../../shared/chat/events'
import {
  isNyxChatTurnIntent,
  type NyxChatCancellationRequest,
  type NyxChatRequest,
} from '../../../shared/chat/types'
import { NYX_CHAT_IPC_CHANNELS } from '../../../shared/chat/ipc'
import { streamChatCompletion } from './client'
import { readChatProviderConfig } from './env'
import { isAbortError, toChatError } from './errors'

interface ActiveChatSession {
  requestId: string
  userMessageId: string
  assistantMessageId: string
  turnIntent: NyxChatRequest['turnIntent']
  sender: WebContents
  abortController: AbortController
  finalContent: string
}

export function validateChatRequest(request: NyxChatRequest): NyxChatErrorEvent['error'] | null {
  const hasMessages = Array.isArray(request.messages) && request.messages.length > 0

  if (!request.requestId || !request.userMessageId || !request.assistantMessageId || !hasMessages) {
    return {
      code: 'invalid_request',
      message: 'Chat requests must include ids, intent, and at least one message.',
      retryable: false,
    }
  }

  if (!isNyxChatTurnIntent(request.turnIntent)) {
    return {
      code: 'invalid_request',
      message: 'Chat requests must use a known turn intent.',
      retryable: false,
    }
  }

  return null
}

export class ChatSessionManager {
  private activeSession: ActiveChatSession | undefined

  start(sender: WebContents, request: NyxChatRequest) {
    const validationError = validateChatRequest(request)

    if (validationError) {
      this.emitError(sender, request, validationError)
      return
    }

    if (this.activeSession) {
      this.emitError(sender, request, {
        code: 'invalid_request',
        message: 'Nyx only supports one active assistant response at a time right now.',
        retryable: false,
      })
      return
    }

    let config

    try {
      config = readChatProviderConfig()
    } catch (error) {
      this.emitError(sender, request, toChatError(error))
      return
    }

    const session: ActiveChatSession = {
      requestId: request.requestId,
      userMessageId: request.userMessageId,
      assistantMessageId: request.assistantMessageId,
      turnIntent: request.turnIntent,
      sender,
      abortController: new AbortController(),
      finalContent: '',
    }

    this.activeSession = session
    this.emitEvent(sender, {
      type: 'chat:start',
      requestId: request.requestId,
      assistantMessageId: request.assistantMessageId,
      status: 'streaming',
    })

    void this.runSession(session, config, request)
  }

  cancel(request: NyxChatCancellationRequest) {
    if (!this.activeSession || this.activeSession.requestId !== request.requestId) {
      return
    }

    this.activeSession.abortController.abort()
  }

  reset(sender: WebContents) {
    if (!this.activeSession || this.activeSession.sender !== sender) {
      return
    }

    this.activeSession.abortController.abort()
    this.activeSession = undefined
  }

  private async runSession(
    session: ActiveChatSession,
    config: ReturnType<typeof readChatProviderConfig>,
    request: NyxChatRequest,
  ) {
    try {
      const result = await streamChatCompletion({
        config,
        request,
        signal: session.abortController.signal,
        onDelta: (delta, snapshot) => {
          if (this.activeSession !== session) {
            return
          }

          session.finalContent = snapshot
          this.emitEvent(session.sender, {
            type: 'chat:delta',
            requestId: session.requestId,
            assistantMessageId: session.assistantMessageId,
            delta,
            snapshot,
          })
        },
      })

      session.finalContent = result.finalContent

      if (this.activeSession === session) {
        this.emitEvent(session.sender, {
          type: 'chat:done',
          requestId: session.requestId,
          assistantMessageId: session.assistantMessageId,
          status: 'completed',
          finalContent: session.finalContent,
        })
      }
    } catch (error) {
      if (this.activeSession !== session) {
        return
      }

      if (isAbortError(error)) {
        this.emitEvent(session.sender, {
          type: 'chat:done',
          requestId: session.requestId,
          assistantMessageId: session.assistantMessageId,
          status: 'cancelled',
          finalContent: session.finalContent,
        })
      } else {
        this.emitError(session.sender, request, toChatError(error))
      }
    } finally {
      if (this.activeSession === session) {
        this.activeSession = undefined
      }
    }
  }

  private emitError(
    sender: WebContents,
    request: NyxChatRequest,
    error: NyxChatErrorEvent['error'],
  ) {
    this.emitEvent(sender, {
      type: 'chat:error',
      requestId: request.requestId,
      assistantMessageId: request.assistantMessageId,
      status: 'failed',
      error,
    })
  }

  private emitEvent(sender: WebContents, event: NyxChatEvent) {
    if (sender.isDestroyed()) {
      return
    }

    sender.send(NYX_CHAT_IPC_CHANNELS.event, event)
  }
}
