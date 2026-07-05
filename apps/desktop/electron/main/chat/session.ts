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
import {
  createRuntimeChatStateClient as createRuntimeChatStateClientDefault,
  NYX_RUNTIME_CHAT_STATE_ENV,
  RuntimeChatStateClientError,
  type RuntimeChatStateClient,
} from '../runtime/chat-state-client'

interface ActiveChatSession {
  requestId: string
  userMessageId: string
  assistantMessageId: string
  turnIntent: NyxChatRequest['turnIntent']
  sender: WebContents
  abortController: AbortController
  finalContent: string
  runtimeChatStateClient?: RuntimeChatStateClient
}

interface RuntimeChatStateSession {
  sender: WebContents
  client: RuntimeChatStateClient
  onSenderDestroyed: () => void
}

interface ChatSessionEnv {
  NYX_RUNTIME_CHAT_STATE?: string
  [key: string]: string | undefined
}

interface ChatSessionManagerOptions {
  env?: ChatSessionEnv
  createRuntimeChatStateClient?: () => RuntimeChatStateClient
}

export function validateChatRequest(request: NyxChatRequest): NyxChatErrorEvent['error'] | null {
  const hasMessages = Array.isArray(request.messages) && request.messages.length > 0
  const hasTurnUserMessage =
    typeof request.turnUserMessage?.id === 'string' &&
    request.turnUserMessage.id.length > 0 &&
    typeof request.turnUserMessage?.content === 'string' &&
    request.turnUserMessage.content.length > 0

  if (
    !request.requestId ||
    !request.userMessageId ||
    !request.assistantMessageId ||
    !hasMessages ||
    !hasTurnUserMessage
  ) {
    return {
      code: 'invalid_request',
      message:
        'Chat requests must include ids, intent, the current user message, and at least one provider message.',
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

  if (request.turnUserMessage.id !== request.userMessageId) {
    return {
      code: 'invalid_request',
      message: 'Chat requests must keep the current user message id aligned with userMessageId.',
      retryable: false,
    }
  }

  if (latestProviderUserMessageContent(request) !== request.turnUserMessage.content) {
    return {
      code: 'invalid_request',
      message:
        'Chat requests must keep the current user message content aligned with provider messages.',
      retryable: false,
    }
  }

  return null
}

function isRuntimeChatStateEnabled(env: ChatSessionEnv) {
  return env[NYX_RUNTIME_CHAT_STATE_ENV] !== '0'
}

function latestProviderUserMessageContent(request: NyxChatRequest) {
  for (let index = request.messages.length - 1; index >= 0; index -= 1) {
    const message = request.messages[index]

    if (message?.role === 'user') {
      return message.content
    }
  }

  return undefined
}

function toNonRetryableRuntimeChatError(error: unknown): NyxChatErrorEvent['error'] {
  const chatError = toChatError(error)

  return {
    ...chatError,
    retryable: false,
  }
}

export class ChatSessionManager {
  private activeSession: ActiveChatSession | undefined
  private readonly runtimeChatStateEnabled: boolean
  private readonly createRuntimeChatStateClient: () => RuntimeChatStateClient
  private readonly runtimeChatStateSessions = new Map<WebContents, RuntimeChatStateSession>()

  constructor({
    env = process.env,
    createRuntimeChatStateClient = createRuntimeChatStateClientDefault,
  }: ChatSessionManagerOptions = {}) {
    this.runtimeChatStateEnabled = isRuntimeChatStateEnabled(env)
    this.createRuntimeChatStateClient = createRuntimeChatStateClient
  }

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

    if (!this.runtimeChatStateEnabled) {
      this.emitStart(session)
      void this.runSession(session, config, request)
      return
    }

    void this.prepareRuntimeAndRunSession(session, config, request)
  }

  cancel(request: NyxChatCancellationRequest) {
    if (!this.activeSession || this.activeSession.requestId !== request.requestId) {
      return
    }

    this.activeSession.abortController.abort()
  }

  async reset(sender: WebContents) {
    if (this.activeSession?.sender === sender) {
      this.activeSession.abortController.abort()
      this.activeSession = undefined
    }

    const runtimeChatStateSession = this.runtimeChatStateSessions.get(sender)

    if (!runtimeChatStateSession) {
      return
    }

    this.detachRuntimeChatStateSession(runtimeChatStateSession)

    try {
      await runtimeChatStateSession.client.clear()
    } catch {
      // Reset detaches the old runtime client so the next turn starts from a fresh session.
    } finally {
      runtimeChatStateSession.client.close()
    }
  }

  private async prepareRuntimeAndRunSession(
    session: ActiveChatSession,
    config: ReturnType<typeof readChatProviderConfig>,
    request: NyxChatRequest,
  ) {
    try {
      const runtimeChatStateClient = this.getRuntimeChatStateClient(session.sender)

      session.runtimeChatStateClient = runtimeChatStateClient

      await this.startRuntimeTurn(runtimeChatStateClient, request)

      if (this.activeSession !== session) {
        return
      }

      this.emitStart(session)

      if (session.abortController.signal.aborted) {
        await runtimeChatStateClient.cancel({
          turnRequestId: session.requestId,
          assistantMessageId: session.assistantMessageId,
          finalContent: session.finalContent,
        })
        this.emitDone(session, 'cancelled')
        this.activeSession = undefined
        return
      }

      await this.runSession(session, config, request)
    } catch (error) {
      if (this.activeSession !== session) {
        return
      }

      this.discardRuntimeChatStateClient(session.runtimeChatStateClient)
      this.emitError(session.sender, request, toNonRetryableRuntimeChatError(error))
      this.activeSession = undefined
    }
  }

  private getRuntimeChatStateClient(sender: WebContents) {
    const existingSession = this.runtimeChatStateSessions.get(sender)

    if (existingSession && !sender.isDestroyed()) {
      return existingSession.client
    }

    if (existingSession) {
      this.closeRuntimeChatStateSession(existingSession)
    }

    const runtimeChatStateClient = this.createRuntimeChatStateClient()
    const runtimeChatStateSession = this.createRuntimeChatStateSession(
      sender,
      runtimeChatStateClient,
    )

    this.runtimeChatStateSessions.set(sender, runtimeChatStateSession)

    return runtimeChatStateClient
  }

  private discardRuntimeChatStateClient(runtimeChatStateClient?: RuntimeChatStateClient) {
    if (!runtimeChatStateClient) {
      return
    }

    const runtimeChatStateSession = this.findRuntimeChatStateSession(runtimeChatStateClient)

    if (runtimeChatStateSession) {
      this.closeRuntimeChatStateSession(runtimeChatStateSession)
      return
    }

    runtimeChatStateClient.close()
  }

  private createRuntimeChatStateSession(
    sender: WebContents,
    client: RuntimeChatStateClient,
  ): RuntimeChatStateSession {
    let runtimeChatStateSession: RuntimeChatStateSession | undefined
    const onSenderDestroyed = () => {
      if (runtimeChatStateSession) {
        this.handleRuntimeChatStateSenderDestroyed(runtimeChatStateSession)
      }
    }
    const createdSession = {
      sender,
      client,
      onSenderDestroyed,
    }

    runtimeChatStateSession = createdSession
    sender.once('destroyed', onSenderDestroyed)

    return createdSession
  }

  private detachRuntimeChatStateSession(runtimeChatStateSession: RuntimeChatStateSession) {
    if (
      this.runtimeChatStateSessions.get(runtimeChatStateSession.sender) === runtimeChatStateSession
    ) {
      this.runtimeChatStateSessions.delete(runtimeChatStateSession.sender)
    }

    runtimeChatStateSession.sender.off('destroyed', runtimeChatStateSession.onSenderDestroyed)
  }

  private findRuntimeChatStateSession(runtimeChatStateClient: RuntimeChatStateClient) {
    for (const runtimeChatStateSession of this.runtimeChatStateSessions.values()) {
      if (runtimeChatStateSession.client === runtimeChatStateClient) {
        return runtimeChatStateSession
      }
    }

    return undefined
  }

  private closeRuntimeChatStateSession(runtimeChatStateSession: RuntimeChatStateSession) {
    this.detachRuntimeChatStateSession(runtimeChatStateSession)
    runtimeChatStateSession.client.close()
  }

  private handleRuntimeChatStateSenderDestroyed(runtimeChatStateSession: RuntimeChatStateSession) {
    if (this.activeSession?.sender === runtimeChatStateSession.sender) {
      this.activeSession.abortController.abort()
      this.activeSession = undefined
    }

    this.closeRuntimeChatStateSession(runtimeChatStateSession)
  }

  private async startRuntimeTurn(
    runtimeChatStateClient: RuntimeChatStateClient,
    request: NyxChatRequest,
  ) {
    if (request.turnIntent === 'new_user_message') {
      await runtimeChatStateClient.submitUserMessage({
        turnRequestId: request.requestId,
        userMessageId: request.userMessageId,
        assistantMessageId: request.assistantMessageId,
        content: request.turnUserMessage.content,
      })
    } else {
      await runtimeChatStateClient.retryFailed({
        turnRequestId: request.requestId,
        userMessageId: request.userMessageId,
        assistantMessageId: request.assistantMessageId,
      })
    }

    await runtimeChatStateClient.startAssistant({
      turnRequestId: request.requestId,
      assistantMessageId: request.assistantMessageId,
    })
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
        onDelta: async (delta, snapshot) => {
          if (this.activeSession !== session) {
            return
          }

          session.finalContent = snapshot
          await session.runtimeChatStateClient?.appendDelta({
            turnRequestId: session.requestId,
            assistantMessageId: session.assistantMessageId,
            snapshot,
          })

          if (this.activeSession !== session) {
            return
          }

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
        await session.runtimeChatStateClient?.complete({
          turnRequestId: session.requestId,
          assistantMessageId: session.assistantMessageId,
          finalContent: session.finalContent,
        })

        if (this.activeSession === session) {
          this.emitDone(session, 'completed')
        }
      }
    } catch (error) {
      if (this.activeSession !== session) {
        return
      }

      if (error instanceof RuntimeChatStateClientError) {
        this.discardRuntimeChatStateClient(session.runtimeChatStateClient)
        this.emitError(session.sender, request, toNonRetryableRuntimeChatError(error))
        return
      }

      if (isAbortError(error)) {
        try {
          await session.runtimeChatStateClient?.cancel({
            turnRequestId: session.requestId,
            assistantMessageId: session.assistantMessageId,
            finalContent: session.finalContent,
          })
        } catch (runtimeError) {
          this.discardRuntimeChatStateClient(session.runtimeChatStateClient)
          this.emitError(session.sender, request, toNonRetryableRuntimeChatError(runtimeError))
          return
        }

        this.emitDone(session, 'cancelled')
      } else {
        const chatError = toChatError(error)

        try {
          await session.runtimeChatStateClient?.fail({
            turnRequestId: session.requestId,
            assistantMessageId: session.assistantMessageId,
            message: chatError.message,
          })
        } catch (runtimeError) {
          this.discardRuntimeChatStateClient(session.runtimeChatStateClient)
          this.emitError(session.sender, request, toNonRetryableRuntimeChatError(runtimeError))
          return
        }

        this.emitError(session.sender, request, chatError)
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

  private emitStart(session: ActiveChatSession) {
    this.emitEvent(session.sender, {
      type: 'chat:start',
      requestId: session.requestId,
      assistantMessageId: session.assistantMessageId,
      status: 'streaming',
    })
  }

  private emitDone(session: ActiveChatSession, status: 'completed' | 'cancelled') {
    this.emitEvent(session.sender, {
      type: 'chat:done',
      requestId: session.requestId,
      assistantMessageId: session.assistantMessageId,
      status,
      finalContent: session.finalContent,
    })
  }

  private emitEvent(sender: WebContents, event: NyxChatEvent) {
    if (sender.isDestroyed()) {
      return
    }

    sender.send(NYX_CHAT_IPC_CHANNELS.event, event)
  }
}
