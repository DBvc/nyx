import type { WebContents } from 'electron'

import type { NyxChatEvent, NyxChatErrorEvent } from '../../../shared/chat/events'
import type {
  NyxChatError,
  NyxChatTargetAttribution,
  NyxThreadChatCancellationRequest,
  NyxThreadChatRequest,
  NyxThreadChatSettlementRetryRequest,
} from '../../../shared/chat/types'
import {
  resolveEnvChatTargetSelection,
  type ChatTargetResolver,
  type ResolvedChatTarget,
} from '../connections/provider-resolver'
import { createSafeThreadErrorRecord, type SafeThreadErrorRecord } from '../current-thread/schemas'
import {
  ThreadLibraryCoordinator,
  ThreadLibraryCoordinatorError,
  type PreparedThreadTurn,
} from '../thread-library/coordinator'
import {
  createRuntimeChatStateClient as createRuntimeChatStateClientDefault,
  NYX_RUNTIME_CHAT_STATE_ENV,
  RuntimeChatStateClientError,
  type RuntimeChatStateClient,
} from '../runtime/chat-state-client'
import { streamChatCompletion } from './client'
import { isAbortError, toChatError } from './errors'

export type UnclockedNyxChatEvent = NyxChatEvent extends infer Event
  ? Event extends NyxChatEvent
    ? Omit<Event, 'eventEpoch' | 'cursor'>
    : never
  : never

interface ActiveChatSession {
  threadId: string
  requestId: string
  turnIntent: NyxThreadChatRequest['turnIntent']
  request: NyxThreadChatRequest
  sender: WebContents
  abortController: AbortController
  finalContent: string
  prepared?: PreparedThreadTurn
  runtime: RuntimeChatStateClient | undefined
  targetAttribution?: NyxChatTargetAttribution
  operation?: Promise<void>
}

interface ChatSessionEnv {
  NYX_RUNTIME_CHAT_STATE?: string
  [key: string]: string | undefined
}

interface ChatSessionManagerOptions {
  resolveThreadLibraryCoordinator: () => ThreadLibraryCoordinator
  publishChatEvent: (sender: WebContents, event: UnclockedNyxChatEvent) => void
  env?: ChatSessionEnv
  createRuntimeChatStateClient?: () => RuntimeChatStateClient
  resolveChatTarget?: ChatTargetResolver
  now?: () => string
}

type ChatRequestCorrelation = Pick<NyxThreadChatRequest, 'threadId' | 'requestId'>

type ChatRequestParseResult =
  | { ok: true; request: NyxThreadChatRequest; correlation: ChatRequestCorrelation }
  | {
      ok: false
      error: NyxChatErrorEvent['error']
      correlation: ChatRequestCorrelation | null
    }

const threadIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
const newTurnKeys = new Set(['threadId', 'requestId', 'turnIntent', 'expectedDraftRevision'])
const retryTurnKeys = new Set([...newTurnKeys, 'turnOrdinal', 'expectedAttemptRequestId'])
const identityKeys = new Set(['threadId', 'requestId'])

function invalidRequest(message: string): NyxChatErrorEvent['error'] {
  return { code: 'invalid_request', message, retryable: false }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>) {
  return Object.keys(value).every((key) => allowed.has(key))
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function nonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0
}

function requestCorrelation(value: unknown): ChatRequestCorrelation | null {
  if (
    !isRecord(value) ||
    !nonEmptyString(value.threadId) ||
    !threadIdPattern.test(value.threadId) ||
    !nonEmptyString(value.requestId)
  ) {
    return null
  }
  return { threadId: value.threadId, requestId: value.requestId }
}

function parseChatRequest(value: unknown): ChatRequestParseResult {
  const correlation = requestCorrelation(value)
  const malformed = (message: string): ChatRequestParseResult => ({
    ok: false,
    error: invalidRequest(message),
    correlation,
  })
  if (!isRecord(value)) return malformed('Chat request shape is invalid.')

  if (
    value.turnIntent === 'new_user_message' &&
    hasOnlyKeys(value, newTurnKeys) &&
    correlation &&
    nonNegativeInteger(value.expectedDraftRevision)
  ) {
    return {
      ok: true,
      correlation,
      request: {
        ...correlation,
        turnIntent: 'new_user_message',
        expectedDraftRevision: value.expectedDraftRevision,
      },
    }
  }

  if (
    value.turnIntent === 'retry_failed_response' &&
    hasOnlyKeys(value, retryTurnKeys) &&
    correlation &&
    nonNegativeInteger(value.turnOrdinal) &&
    nonEmptyString(value.expectedAttemptRequestId) &&
    nonNegativeInteger(value.expectedDraftRevision)
  ) {
    return {
      ok: true,
      correlation,
      request: {
        ...correlation,
        turnIntent: 'retry_failed_response',
        turnOrdinal: value.turnOrdinal,
        expectedAttemptRequestId: value.expectedAttemptRequestId,
        expectedDraftRevision: value.expectedDraftRevision,
      },
    }
  }

  return malformed('Chat request shape is invalid.')
}

function parseIdentityRequest(value: unknown) {
  const correlation = requestCorrelation(value)
  return isRecord(value) && hasOnlyKeys(value, identityKeys) && correlation ? correlation : null
}

export function validateChatRequest(request: unknown): NyxChatErrorEvent['error'] | null {
  const result = parseChatRequest(request)
  return result.ok ? null : result.error
}

function isRuntimeChatStateEnabled(env: ChatSessionEnv) {
  return env[NYX_RUNTIME_CHAT_STATE_ENV] !== '0'
}

function toNonRetryableChatError(error: unknown): NyxChatError {
  return { ...toChatError(error), retryable: false }
}

export class ChatSessionManager {
  private activeSession: ActiveChatSession | undefined
  private readonly coordinator: () => ThreadLibraryCoordinator
  private readonly publish: ChatSessionManagerOptions['publishChatEvent']
  private readonly runtimeChatStateEnabled: boolean
  private readonly createRuntimeChatStateClient: () => RuntimeChatStateClient
  private readonly resolveChatTarget: ChatTargetResolver
  private readonly now: () => string

  constructor({
    resolveThreadLibraryCoordinator,
    publishChatEvent,
    env = process.env,
    createRuntimeChatStateClient = createRuntimeChatStateClientDefault,
    resolveChatTarget = resolveEnvChatTargetSelection,
    now = () => new Date().toISOString(),
  }: ChatSessionManagerOptions) {
    this.coordinator = resolveThreadLibraryCoordinator
    this.publish = publishChatEvent
    this.runtimeChatStateEnabled = isRuntimeChatStateEnabled(env)
    this.createRuntimeChatStateClient = createRuntimeChatStateClient
    this.resolveChatTarget = resolveChatTarget
    this.now = now
  }

  start(sender: WebContents, value: unknown) {
    const parsed = parseChatRequest(value)
    if (!parsed.ok) {
      if (parsed.correlation) this.emitError(sender, parsed.correlation, parsed.error)
      return
    }
    if (this.activeSession) {
      this.emitError(sender, parsed.request, {
        code: 'invalid_request',
        message: 'Nyx only supports one active assistant response at a time right now.',
        retryable: false,
      })
      return
    }

    const session: ActiveChatSession = {
      threadId: parsed.request.threadId,
      requestId: parsed.request.requestId,
      turnIntent: parsed.request.turnIntent,
      request: parsed.request,
      sender,
      abortController: new AbortController(),
      finalContent: '',
      runtime: undefined,
    }
    this.activeSession = session
    session.operation = this.run(session)
    void session.operation
  }

  cancel(value: NyxThreadChatCancellationRequest | unknown) {
    const request = parseIdentityRequest(value)
    if (
      request &&
      this.activeSession?.threadId === request.threadId &&
      this.activeSession.requestId === request.requestId
    ) {
      this.activeSession.abortController.abort()
    }
  }

  async retrySettlement(sender: WebContents, value: NyxThreadChatSettlementRetryRequest | unknown) {
    const request = parseIdentityRequest(value)
    if (!request) return

    let reply: Awaited<ReturnType<ThreadLibraryCoordinator['retrySettlement']>>
    try {
      reply = await this.coordinator().retrySettlement(request.threadId, request.requestId)
    } catch (error) {
      this.emitError(
        sender,
        request,
        error instanceof ThreadLibraryCoordinatorError && error.code === 'invalid_request'
          ? invalidRequest(error.message)
          : this.settlementError(),
      )
      return
    }
    if (!reply.ok) {
      this.emitError(sender, request, this.settlementError())
      return
    }

    const turn = reply.value.turns.find(
      (candidate) => candidate.attemptRequestId === request.requestId,
    )
    if (!turn) {
      this.emitError(sender, request, invalidRequest('The settlement Retry identity is invalid.'))
      return
    }
    if (turn.assistantStatus === 'failed') {
      this.emitError(
        sender,
        { ...request, assistantMessageId: turn.assistantMessageId },
        turn.error!,
        turn.targetAttribution ?? undefined,
      )
    } else if (turn.assistantStatus === 'completed' || turn.assistantStatus === 'cancelled') {
      this.emitDone(
        sender,
        { ...request, assistantMessageId: turn.assistantMessageId },
        turn.assistantStatus,
        turn.assistantContent,
      )
    } else {
      this.emitError(sender, request, invalidRequest('The settlement Retry is still pending.'))
    }
  }

  private async run(session: ActiveChatSession) {
    try {
      session.prepared = await this.coordinator().prepareTurn(session.request)
      if (this.activeSession !== session) return
      this.emitAccepted(session)

      if (session.abortController.signal.aborted) {
        await this.finishCancelled(session)
        return
      }

      const target = await this.resolveChatTarget(session.prepared.targetSelection)
      if (this.activeSession !== session) return
      if (session.abortController.signal.aborted) {
        await this.finishCancelled(session)
        return
      }

      await this.coordinator().bindPreparedTarget(session.prepared, target.targetAttribution)
      session.targetAttribution = target.targetAttribution
      if (this.activeSession !== session) return
      if (session.abortController.signal.aborted) {
        await this.finishCancelled(session)
        return
      }

      const providerMessages = await this.coordinator().materializeProviderMessages(
        session.prepared.detail,
        target,
      )
      if (this.activeSession !== session) return

      if (this.runtimeChatStateEnabled) {
        session.runtime = this.createRuntimeChatStateClient()
        await this.coordinator().replayRuntimeHistory(
          session.runtime,
          session.prepared.runtimeReplayDetail,
        )
        await this.startRuntimeTurn(session.runtime, session)
      }
      if (this.activeSession !== session) return
      if (session.abortController.signal.aborted) {
        await this.finishCancelled(session)
        return
      }

      this.emitStart(session)
      await this.runProvider(session, target, providerMessages)
    } catch (error) {
      if (this.activeSession !== session) return
      if (session.prepared) {
        if (session.abortController.signal.aborted || isAbortError(error)) {
          await this.finishCancelled(session)
        } else {
          const chatError =
            error instanceof ThreadLibraryCoordinatorError && error.code === 'invalid_request'
              ? invalidRequest(error.message)
              : error instanceof RuntimeChatStateClientError
                ? toNonRetryableChatError(error)
                : toChatError(error)
          await this.finishFailed(session, chatError)
        }
      } else {
        const chatError =
          error instanceof ThreadLibraryCoordinatorError && error.code === 'invalid_request'
            ? invalidRequest(error.message)
            : toNonRetryableChatError(error)
        this.emitError(session.sender, session, chatError)
      }
    } finally {
      if (this.activeSession === session) this.activeSession = undefined
      session.runtime?.close()
    }
  }

  private async runProvider(
    session: ActiveChatSession,
    target: ResolvedChatTarget,
    providerMessages: Awaited<ReturnType<ThreadLibraryCoordinator['materializeProviderMessages']>>,
  ) {
    const result = await streamChatCompletion({
      target,
      request: {},
      providerMessages,
      documentBearing: session.prepared!.documentBearing,
      signal: session.abortController.signal,
      onDelta: async (delta, snapshot) => {
        if (this.activeSession !== session) return
        session.finalContent = snapshot
        await session.runtime?.appendDelta({
          turnRequestId: session.requestId,
          assistantMessageId: session.prepared!.assistantMessageId,
          snapshot,
        })
        if (this.activeSession === session) {
          this.publish(session.sender, {
            type: 'chat:delta',
            threadId: session.threadId,
            requestId: session.requestId,
            assistantMessageId: session.prepared!.assistantMessageId,
            delta,
            snapshot,
          })
        }
      },
    })

    if (session.abortController.signal.aborted) {
      await this.finishCancelled(session)
      return
    }

    if ('providerState' in result && !target.executionIdentity) {
      throw new Error('A Responses target requires a durable execution identity.')
    }
    session.finalContent = result.finalContent
    const saved = await this.settle(session, {
      assistantStatus: 'completed',
      error: null,
      continuation:
        'providerState' in result && target.executionIdentity
          ? { state: result.providerState, executionIdentity: target.executionIdentity }
          : undefined,
    })
    if (!saved) return

    try {
      await session.runtime?.complete({
        turnRequestId: session.requestId,
        assistantMessageId: session.prepared!.assistantMessageId,
        finalContent: session.finalContent,
      })
    } catch {
      session.runtime?.close()
      session.runtime = undefined
    }
    if (this.activeSession === session) {
      this.emitDone(session.sender, session.prepared!, 'completed', session.finalContent)
    }
  }

  private async finishCancelled(session: ActiveChatSession) {
    if (!(await this.settle(session, { assistantStatus: 'cancelled', error: null }))) return
    try {
      await session.runtime?.cancel({
        turnRequestId: session.requestId,
        assistantMessageId: session.prepared!.assistantMessageId,
        finalContent: session.finalContent,
      })
    } catch {
      session.runtime?.close()
      session.runtime = undefined
    }
    this.emitDone(session.sender, session.prepared!, 'cancelled', session.finalContent)
  }

  private async finishFailed(session: ActiveChatSession, error: NyxChatError) {
    const safeError = createSafeThreadErrorRecord({
      code: error.code,
      retryable: error.retryable,
    })
    if (!(await this.settle(session, { assistantStatus: 'failed', error: safeError }))) return
    try {
      await session.runtime?.fail({
        turnRequestId: session.requestId,
        assistantMessageId: session.prepared!.assistantMessageId,
        message: error.message,
      })
    } catch {
      session.runtime?.close()
      session.runtime = undefined
    }
    this.emitError(session.sender, session.prepared!, error, session.targetAttribution)
  }

  private async settle(
    session: ActiveChatSession,
    terminal: {
      assistantStatus: 'completed' | 'cancelled' | 'failed'
      error: SafeThreadErrorRecord | null
      continuation?: Parameters<ThreadLibraryCoordinator['settleTurn']>[0]['continuation']
    },
  ) {
    try {
      const reply = await this.coordinator().settleTurn({
        threadId: session.threadId,
        requestId: session.requestId,
        assistantStatus: terminal.assistantStatus,
        assistantContent: session.finalContent,
        error: terminal.error,
        settledAt: this.now(),
        ...(terminal.continuation ? { continuation: terminal.continuation } : {}),
      })
      if (reply.ok) return true
    } catch {
      // The coordinator retains the exact terminal input for explicit Retry.
    }
    session.runtime?.close()
    session.runtime = undefined
    this.emitError(
      session.sender,
      session.prepared!,
      this.settlementError(),
      session.targetAttribution,
    )
    return false
  }

  private startRuntimeTurn(runtime: RuntimeChatStateClient, session: ActiveChatSession) {
    const prepared = session.prepared!
    const start =
      session.turnIntent === 'new_user_message'
        ? runtime.submitUserMessage({
            turnRequestId: session.requestId,
            userMessageId: prepared.userMessageId,
            assistantMessageId: prepared.assistantMessageId,
            content: prepared.detail.turns.find(
              (turn) => turn.attemptRequestId === session.requestId,
            )!.userContent,
          })
        : runtime.retryFailed({
            turnRequestId: session.requestId,
            userMessageId: prepared.userMessageId,
            assistantMessageId: prepared.assistantMessageId,
          })
    return start.then(() =>
      runtime.startAssistant({
        turnRequestId: session.requestId,
        assistantMessageId: prepared.assistantMessageId,
      }),
    )
  }

  private settlementError(): NyxChatError {
    return { code: 'unknown', message: "Couldn't save result", retryable: true }
  }

  private emitAccepted(session: ActiveChatSession) {
    this.publish(session.sender, {
      type: 'chat:accepted',
      threadId: session.threadId,
      requestId: session.requestId,
      userMessageId: session.prepared!.userMessageId,
      assistantMessageId: session.prepared!.assistantMessageId,
      turnIntent: session.turnIntent,
    })
  }

  private emitStart(session: ActiveChatSession) {
    this.publish(session.sender, {
      type: 'chat:start',
      threadId: session.threadId,
      requestId: session.requestId,
      assistantMessageId: session.prepared!.assistantMessageId,
      status: 'streaming',
      targetAttribution: session.targetAttribution!,
    })
  }

  private emitDone(
    sender: WebContents,
    request: ChatRequestCorrelation & { assistantMessageId: string },
    status: 'completed' | 'cancelled',
    finalContent: string,
  ) {
    this.publish(sender, {
      type: 'chat:done',
      threadId: request.threadId,
      requestId: request.requestId,
      assistantMessageId: request.assistantMessageId,
      status,
      finalContent,
    })
  }

  private emitError(
    sender: WebContents,
    request: ChatRequestCorrelation & { assistantMessageId?: string },
    error: NyxChatError,
    targetAttribution?: NyxChatTargetAttribution,
  ) {
    this.publish(sender, {
      type: 'chat:error',
      threadId: request.threadId,
      requestId: request.requestId,
      ...(request.assistantMessageId ? { assistantMessageId: request.assistantMessageId } : {}),
      status: 'failed',
      error,
      ...(targetAttribution ? { targetAttribution } : {}),
    })
  }
}
