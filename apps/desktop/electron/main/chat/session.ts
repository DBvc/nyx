import type { WebContents } from 'electron'

import type { NyxChatEvent, NyxChatErrorEvent } from '../../../shared/chat/events'
import type { NyxCurrentThreadResetResult } from '../../../shared/chat/snapshot'
import {
  isNyxChatTurnIntent,
  type NyxChatCancellationRequest,
  type NyxChatRequest,
} from '../../../shared/chat/types'
import { NYX_CHAT_IPC_CHANNELS } from '../../../shared/chat/ipc'
import {
  readEnvChatTarget,
  type ChatTargetResolver,
  type ResolvedChatTarget,
} from '../connections/provider-resolver'
import { replayCurrentThread } from '../current-thread/runtime-replay'
import {
  CurrentThreadSessionCoordinator,
  CurrentThreadSessionError,
  type PreparedCurrentThreadTurn,
} from '../current-thread/session-coordinator'
import { streamChatCompletion } from './client'
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
  request: NyxChatRequest
  sender: WebContents
  abortController: AbortController
  finalContent: string
  runtimeChatStateClient?: RuntimeChatStateClient
  currentThreadSession?: CurrentThreadSessionCoordinator
  preparedCurrentThread?: PreparedCurrentThreadTurn
  operation?: Promise<void>
}

interface RuntimeChatStateSession {
  sender: WebContents
  client: RuntimeChatStateClient
  onSenderDestroyed: () => void
  hydratedThreadId?: string
}

interface ChatSessionEnv {
  NYX_RUNTIME_CHAT_STATE?: string
  [key: string]: string | undefined
}

interface ChatSessionManagerOptions {
  env?: ChatSessionEnv
  createRuntimeChatStateClient?: () => RuntimeChatStateClient
  resolveChatTarget?: ChatTargetResolver
  resolveCurrentThreadSession?: () => CurrentThreadSessionCoordinator
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

function isPromiseLike<TValue>(value: TValue | Promise<TValue>): value is Promise<TValue> {
  return typeof (value as Promise<TValue>).then === 'function'
}

function currentThreadResetFailure(): NyxCurrentThreadResetResult {
  return {
    ok: false,
    error: {
      code: 'reset_failed',
      message: 'Nyx could not start a fresh thread.',
    },
  }
}

export class ChatSessionManager {
  private activeSession: ActiveChatSession | undefined
  private readonly runtimeChatStateEnabled: boolean
  private readonly createRuntimeChatStateClient: () => RuntimeChatStateClient
  private readonly resolveChatTarget: ChatTargetResolver
  private readonly resolveCurrentThreadSession: (() => CurrentThreadSessionCoordinator) | undefined
  private readonly runtimeChatStateSessions = new Map<WebContents, RuntimeChatStateSession>()
  private resetOperation: Promise<NyxCurrentThreadResetResult> | undefined

  constructor({
    env = process.env,
    createRuntimeChatStateClient = createRuntimeChatStateClientDefault,
    resolveChatTarget = readEnvChatTarget,
    resolveCurrentThreadSession,
  }: ChatSessionManagerOptions = {}) {
    this.runtimeChatStateEnabled = isRuntimeChatStateEnabled(env)
    this.createRuntimeChatStateClient = createRuntimeChatStateClient
    this.resolveChatTarget = resolveChatTarget
    this.resolveCurrentThreadSession = resolveCurrentThreadSession
  }

  start(sender: WebContents, request: NyxChatRequest) {
    const validationError = validateChatRequest(request)

    if (validationError) {
      this.emitError(sender, request, validationError)
      return
    }

    if (this.resetOperation) {
      this.emitError(sender, request, {
        code: 'invalid_request',
        message: 'Nyx is still starting a fresh thread.',
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

    const session: ActiveChatSession = {
      requestId: request.requestId,
      userMessageId: request.userMessageId,
      assistantMessageId: request.assistantMessageId,
      turnIntent: request.turnIntent,
      request,
      sender,
      abortController: new AbortController(),
      finalContent: '',
    }

    this.activeSession = session

    const operation = this.resolveCurrentThreadSession
      ? this.prepareDurableSession(session, request)
      : this.resolveTargetAndStart(session, request)

    session.operation = operation
    void operation
  }

  private async prepareDurableSession(session: ActiveChatSession, request: NyxChatRequest) {
    const currentThreadSession = this.resolveCurrentThreadSession!()
    session.currentThreadSession = currentThreadSession

    try {
      const preparedCurrentThread = await currentThreadSession.prepare(request)

      if (this.activeSession !== session) {
        return
      }

      session.preparedCurrentThread = preparedCurrentThread
      const durableRequest = {
        ...request,
        messages: preparedCurrentThread.providerMessages,
      }
      session.request = durableRequest
      await this.resolveTargetAndStart(session, durableRequest)
    } catch (error) {
      if (this.activeSession !== session) {
        return
      }

      const chatError =
        error instanceof CurrentThreadSessionError && error.code === 'invalid_request'
          ? {
              code: 'invalid_request' as const,
              message: error.message,
              retryable: false,
            }
          : toNonRetryableRuntimeChatError(error)

      this.emitError(session.sender, request, chatError)
      this.activeSession = undefined
    }
  }

  private resolveTargetAndStart(
    session: ActiveChatSession,
    request: NyxChatRequest,
  ): Promise<void> {
    let targetResult

    try {
      targetResult = this.resolveChatTarget()
    } catch (error) {
      return this.handleChatTargetError(session, request, error)
    }

    if (isPromiseLike(targetResult)) {
      return this.startAfterAsyncChatTarget(session, targetResult, request)
    }

    return this.startWithChatTarget(session, targetResult, request)
  }

  private async startAfterAsyncChatTarget(
    session: ActiveChatSession,
    targetResult: Promise<ResolvedChatTarget>,
    request: NyxChatRequest,
  ) {
    try {
      await this.startWithChatTarget(session, await targetResult, request)
    } catch (error) {
      await this.handleChatTargetError(session, request, error)
    }
  }

  private startWithChatTarget(
    session: ActiveChatSession,
    target: ResolvedChatTarget,
    request: NyxChatRequest,
  ): Promise<void> {
    if (this.activeSession !== session) {
      return Promise.resolve()
    }

    if (!this.runtimeChatStateEnabled) {
      this.emitStart(session)
      return this.runSession(session, target, request)
    }

    return this.prepareRuntimeAndRunSession(session, target, request)
  }

  private async handleChatTargetError(
    session: ActiveChatSession,
    request: NyxChatRequest,
    error: unknown,
  ) {
    if (this.activeSession !== session) {
      return
    }

    const chatError = toChatError(error)

    if (!(await this.persistFailure(session, chatError))) {
      return
    }

    this.emitError(session.sender, request, chatError)
    this.activeSession = undefined
  }

  cancel(request: NyxChatCancellationRequest) {
    if (!this.activeSession || this.activeSession.requestId !== request.requestId) {
      return
    }

    this.activeSession.abortController.abort()
  }

  async reset(_sender: WebContents): Promise<NyxCurrentThreadResetResult> {
    if (this.resetOperation) {
      return this.resetOperation
    }

    const resetOperation = this.performReset()
    this.resetOperation = resetOperation

    try {
      return await resetOperation
    } finally {
      if (this.resetOperation === resetOperation) {
        this.resetOperation = undefined
      }
    }
  }

  private async performReset(): Promise<NyxCurrentThreadResetResult> {
    try {
      if (this.activeSession) {
        const session = this.activeSession
        session.abortController.abort()
        this.activeSession = undefined

        try {
          await session.operation
        } catch {
          // Explicit reset still owns cleanup when an abandoned session exits unexpectedly.
        }
      }

      for (const runtimeChatStateSession of this.runtimeChatStateSessions.values()) {
        this.detachRuntimeChatStateSession(runtimeChatStateSession)

        try {
          await runtimeChatStateSession.client.clear()
        } catch {
          // Reset detaches the old runtime client so the next turn starts from a fresh session.
        } finally {
          runtimeChatStateSession.client.close()
        }
      }

      if (this.resolveCurrentThreadSession) {
        await this.resolveCurrentThreadSession().reset()
      }

      return { ok: true }
    } catch {
      return currentThreadResetFailure()
    }
  }

  private async prepareRuntimeAndRunSession(
    session: ActiveChatSession,
    target: ResolvedChatTarget,
    request: NyxChatRequest,
  ) {
    try {
      const runtimeChatStateSession = this.getRuntimeChatStateSession(session.sender)
      const runtimeChatStateClient = runtimeChatStateSession.client

      session.runtimeChatStateClient = runtimeChatStateClient

      if (
        session.preparedCurrentThread &&
        runtimeChatStateSession.hydratedThreadId !==
          session.preparedCurrentThread.pendingRecord.threadId
      ) {
        await replayCurrentThread(
          runtimeChatStateClient,
          session.preparedCurrentThread.replayRecord,
        )
        runtimeChatStateSession.hydratedThreadId =
          session.preparedCurrentThread.pendingRecord.threadId
      }

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

        if (await this.persistCancelled(session)) {
          this.emitDone(session, 'cancelled')
        }
        this.activeSession = undefined
        return
      }

      await this.runSession(session, target, request)
    } catch (error) {
      if (this.activeSession !== session) {
        return
      }

      this.discardRuntimeChatStateClient(session.runtimeChatStateClient)
      const chatError = toNonRetryableRuntimeChatError(error)

      if (await this.persistFailure(session, chatError)) {
        this.emitError(session.sender, request, chatError)
      }
      this.activeSession = undefined
    }
  }

  private getRuntimeChatStateSession(sender: WebContents) {
    const existingSession = this.runtimeChatStateSessions.get(sender)

    if (existingSession && !sender.isDestroyed()) {
      return existingSession
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

    return runtimeChatStateSession
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

  private discardRuntimeChatStateForSender(sender: WebContents) {
    const runtimeChatStateSession = this.runtimeChatStateSessions.get(sender)

    if (runtimeChatStateSession) {
      this.closeRuntimeChatStateSession(runtimeChatStateSession)
    }
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
    target: ResolvedChatTarget,
    request: NyxChatRequest,
  ) {
    try {
      const result = await streamChatCompletion({
        target,
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

        if (this.activeSession === session && (await this.persistCompleted(session))) {
          this.emitDone(session, 'completed')
        }
      }
    } catch (error) {
      if (this.activeSession !== session) {
        return
      }

      if (error instanceof RuntimeChatStateClientError) {
        this.discardRuntimeChatStateClient(session.runtimeChatStateClient)
        const chatError = toNonRetryableRuntimeChatError(error)

        if (await this.persistFailure(session, chatError)) {
          this.emitError(session.sender, request, chatError)
        }
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
          const chatError = toNonRetryableRuntimeChatError(runtimeError)

          if (await this.persistFailure(session, chatError)) {
            this.emitError(session.sender, request, chatError)
          }
          return
        }

        if (await this.persistCancelled(session)) {
          this.emitDone(session, 'cancelled')
        }
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
          const runtimeChatError = toNonRetryableRuntimeChatError(runtimeError)

          if (await this.persistFailure(session, runtimeChatError)) {
            this.emitError(session.sender, request, runtimeChatError)
          }
          return
        }

        if (await this.persistFailure(session, chatError)) {
          this.emitError(session.sender, request, chatError)
        }
      }
    } finally {
      if (this.activeSession === session) {
        this.activeSession = undefined
      }
    }
  }

  private persistCompleted(session: ActiveChatSession) {
    return this.persistTerminal(session, () =>
      session.currentThreadSession!.complete(
        session.requestId,
        session.assistantMessageId,
        session.finalContent,
      ),
    )
  }

  private persistCancelled(session: ActiveChatSession) {
    return this.persistTerminal(session, () =>
      session.currentThreadSession!.cancel(
        session.requestId,
        session.assistantMessageId,
        session.finalContent,
      ),
    )
  }

  private async persistFailure(session: ActiveChatSession, error: NyxChatErrorEvent['error']) {
    const persisted = await this.persistTerminal(session, () =>
      session.currentThreadSession!.fail(
        session.requestId,
        session.assistantMessageId,
        session.finalContent,
        error,
      ),
    )

    if (persisted && session.currentThreadSession && session.preparedCurrentThread) {
      this.discardRuntimeChatStateForSender(session.sender)
    }

    return persisted
  }

  private async persistTerminal(session: ActiveChatSession, persist: () => Promise<unknown>) {
    if (!session.currentThreadSession || !session.preparedCurrentThread) {
      return true
    }

    try {
      await persist()
      return true
    } catch {
      this.discardRuntimeChatStateClient(session.runtimeChatStateClient)
      this.emitError(session.sender, session.request, {
        code: 'unknown',
        message: 'Nyx could not save the current thread.',
        retryable: false,
      })
      return false
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
