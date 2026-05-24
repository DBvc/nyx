import type { WebContents } from 'electron'

import type { NyxChatEvent, NyxChatErrorEvent } from '../../../shared/chat/events'
import type { NyxChatCancellationRequest, NyxChatRequest } from '../../../shared/chat/types'
import { NYX_CHAT_IPC_CHANNELS } from '../../../shared/chat/ipc'
import { streamChatCompletion } from './client'
import { readNyxChatRuntimeConfig } from './env'
import { isAbortError, toNyxChatError } from './errors'

interface ActiveChatSession {
  requestId: string
  assistantMessageId: string
  sender: WebContents
  abortController: AbortController
  finalContent: string
}

export class NyxChatSessionManager {
  private activeSession: ActiveChatSession | undefined

  start(sender: WebContents, request: NyxChatRequest) {
    if (!request.requestId || !request.assistantMessageId || request.messages.length === 0) {
      this.emitError(sender, request, {
        code: 'invalid_request',
        message: 'Chat requests must include ids and at least one message.',
        retryable: false,
      })
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
      config = readNyxChatRuntimeConfig()
    } catch (error) {
      this.emitError(sender, request, toNyxChatError(error))
      return
    }

    const session: ActiveChatSession = {
      requestId: request.requestId,
      assistantMessageId: request.assistantMessageId,
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

  private async runSession(
    session: ActiveChatSession,
    config: ReturnType<typeof readNyxChatRuntimeConfig>,
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
        this.emitError(session.sender, request, toNyxChatError(error))
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
