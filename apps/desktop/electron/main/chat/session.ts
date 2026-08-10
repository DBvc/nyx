import type { WebContents } from 'electron'

import type { NyxChatEvent, NyxChatErrorEvent } from '../../../shared/chat/events'
import type { NyxCurrentThreadResetResult } from '../../../shared/chat/snapshot'
import {
  type NyxChatDocumentRef,
  isNyxChatTurnIntent,
  type NyxChatCancellationRequest,
  type NyxChatImageRef,
  type NyxChatInputMessage,
  type NyxChatNewImage,
  type NyxChatNewDocument,
  type NyxChatRequest,
  type NyxChatTargetAttribution,
  type NyxChatTargetSelection,
} from '../../../shared/chat/types'
import { isNyxChatDocumentName, nyxChatDocumentLimits } from '../../../shared/chat/document-file'
import { NYX_CHAT_IPC_CHANNELS } from '../../../shared/chat/ipc'
import {
  resolveEnvChatTargetSelection,
  type ChatTargetResolver,
  type ResolvedChatTarget,
} from '../connections/provider-resolver'
import { replayCurrentThread } from '../current-thread/runtime-replay'
import {
  CurrentThreadSessionCoordinator,
  CurrentThreadSessionError,
  type CurrentThreadProviderMessage,
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
  providerMessages?: ReadonlyArray<CurrentThreadProviderMessage>
  boundTargetAttribution?: NyxChatTargetAttribution
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

export function validateChatRequest(request: unknown): NyxChatErrorEvent['error'] | null {
  const result = parseChatRequest(request)
  return result.ok ? null : result.error
}

type ChatRequestCorrelation = Pick<NyxChatRequest, 'requestId' | 'assistantMessageId'>

type ChatRequestParseResult =
  | { ok: true; request: NyxChatRequest; correlation: ChatRequestCorrelation }
  | {
      ok: false
      error: NyxChatErrorEvent['error']
      correlation: ChatRequestCorrelation | null
    }

const requestKeys = new Set([
  'requestId',
  'userMessageId',
  'assistantMessageId',
  'turnIntent',
  'turnUserMessage',
  'messages',
  'targetSelection',
  'newImages',
  'newDocuments',
  'systemPrompt',
])
const turnUserMessageKeys = new Set(['id', 'content', 'imageRefs', 'documentRefs'])
const imageRefKeys = new Set(['imageId', 'mediaType', 'width', 'height'])
const newImageKeys = new Set(['imageId', 'canonicalBytes', 'previewBytes'])
const documentRefKeys = new Set([
  'documentId',
  'name',
  'mediaType',
  'byteLength',
  'extractedByteLength',
])
const newDocumentKeys = new Set([
  'documentId',
  'sourceBytes',
  'extractedTextBytes',
  'extractedFromSha256',
])
const imageIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function invalidRequest(message: string): NyxChatErrorEvent['error'] {
  return { code: 'invalid_request', message, retryable: false }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasOnlyKeys(value: Record<string, unknown>, allowedKeys: ReadonlySet<string>) {
  return Object.keys(value).every((key) => allowedKeys.has(key))
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function requestCorrelation(value: unknown): ChatRequestCorrelation | null {
  if (
    !isRecord(value) ||
    !nonEmptyString(value.requestId) ||
    !nonEmptyString(value.assistantMessageId)
  ) {
    return null
  }

  return {
    requestId: value.requestId,
    assistantMessageId: value.assistantMessageId,
  }
}

function parseTargetSelection(value: unknown): NyxChatTargetSelection | null {
  if (!isRecord(value) || typeof value.kind !== 'string') {
    return null
  }

  if (value.kind === 'env_fallback') {
    return hasOnlyKeys(value, new Set(['kind'])) ? { kind: 'env_fallback' } : null
  }

  if (
    value.kind !== 'connection' ||
    !hasOnlyKeys(value, new Set(['kind', 'providerId', 'modelId'])) ||
    !nonEmptyString(value.providerId) ||
    !value.providerId.trim() ||
    !nonEmptyString(value.modelId) ||
    !value.modelId.trim()
  ) {
    return null
  }

  return {
    kind: 'connection',
    providerId: value.providerId,
    modelId: value.modelId,
  }
}

function parseInputMessages(value: unknown): NyxChatInputMessage[] | null {
  if (!Array.isArray(value) || value.length === 0) {
    return null
  }

  const messages: NyxChatInputMessage[] = []

  for (const message of value) {
    if (
      !isRecord(message) ||
      !hasOnlyKeys(message, new Set(['role', 'content'])) ||
      (message.role !== 'system' && message.role !== 'user' && message.role !== 'assistant') ||
      typeof message.content !== 'string'
    ) {
      return null
    }

    messages.push({ role: message.role, content: message.content })
  }

  return messages
}

function parseImageRefs(value: unknown): NyxChatImageRef[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 4) {
    return null
  }

  const refs: NyxChatImageRef[] = []

  for (const ref of value) {
    if (
      !isRecord(ref) ||
      !hasOnlyKeys(ref, imageRefKeys) ||
      typeof ref.imageId !== 'string' ||
      !imageIdPattern.test(ref.imageId) ||
      (ref.mediaType !== 'image/png' && ref.mediaType !== 'image/jpeg') ||
      !Number.isInteger(ref.width) ||
      !Number.isInteger(ref.height) ||
      (ref.width as number) <= 0 ||
      (ref.height as number) <= 0
    ) {
      return null
    }

    refs.push({
      imageId: ref.imageId,
      mediaType: ref.mediaType,
      width: ref.width as number,
      height: ref.height as number,
    })
  }

  return new Set(refs.map((ref) => ref.imageId)).size === refs.length ? refs : null
}

function parseNewImages(value: unknown): NyxChatNewImage[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 4) {
    return null
  }

  const images: NyxChatNewImage[] = []

  for (const image of value) {
    if (
      !isRecord(image) ||
      !hasOnlyKeys(image, newImageKeys) ||
      typeof image.imageId !== 'string' ||
      !imageIdPattern.test(image.imageId) ||
      !(image.canonicalBytes instanceof Uint8Array) ||
      !(image.previewBytes instanceof Uint8Array)
    ) {
      return null
    }

    images.push({
      imageId: image.imageId,
      canonicalBytes: image.canonicalBytes,
      previewBytes: image.previewBytes,
    })
  }

  return new Set(images.map((image) => image.imageId)).size === images.length ? images : null
}

function parseDocumentRefs(value: unknown): NyxChatDocumentRef[] | null {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > nyxChatDocumentLimits.documentsPerTurn
  ) {
    return null
  }

  const refs: NyxChatDocumentRef[] = []

  for (const ref of value) {
    if (
      !isRecord(ref) ||
      !hasOnlyKeys(ref, documentRefKeys) ||
      typeof ref.documentId !== 'string' ||
      !imageIdPattern.test(ref.documentId) ||
      typeof ref.name !== 'string' ||
      (ref.mediaType !== 'application/pdf' &&
        ref.mediaType !== 'text/plain' &&
        ref.mediaType !== 'text/markdown' &&
        ref.mediaType !== 'text/csv') ||
      !isNyxChatDocumentName(ref.name, ref.mediaType) ||
      !Number.isInteger(ref.byteLength) ||
      (ref.byteLength as number) <= 0 ||
      (ref.byteLength as number) > nyxChatDocumentLimits.sourceBytesPerDocument ||
      !Number.isInteger(ref.extractedByteLength) ||
      (ref.extractedByteLength as number) <= 0 ||
      (ref.extractedByteLength as number) > nyxChatDocumentLimits.extractedBytesPerDocument
    ) {
      return null
    }

    refs.push({
      documentId: ref.documentId,
      name: ref.name,
      mediaType: ref.mediaType,
      byteLength: ref.byteLength as number,
      extractedByteLength: ref.extractedByteLength as number,
    })
  }

  return new Set(refs.map((ref) => ref.documentId)).size === refs.length ? refs : null
}

function parseNewDocuments(value: unknown): NyxChatNewDocument[] | null {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > nyxChatDocumentLimits.documentsPerTurn
  ) {
    return null
  }

  const documents: NyxChatNewDocument[] = []

  for (const document of value) {
    if (
      !isRecord(document) ||
      !hasOnlyKeys(document, newDocumentKeys) ||
      typeof document.documentId !== 'string' ||
      !imageIdPattern.test(document.documentId) ||
      !(document.sourceBytes instanceof Uint8Array) ||
      !(document.extractedTextBytes instanceof Uint8Array) ||
      document.sourceBytes.byteLength <= 0 ||
      document.sourceBytes.byteLength > nyxChatDocumentLimits.sourceBytesPerDocument ||
      document.extractedTextBytes.byteLength <= 0 ||
      document.extractedTextBytes.byteLength > nyxChatDocumentLimits.extractedBytesPerDocument ||
      typeof document.extractedFromSha256 !== 'string' ||
      !/^[0-9a-f]{64}$/u.test(document.extractedFromSha256)
    ) {
      return null
    }

    documents.push({
      documentId: document.documentId,
      sourceBytes: document.sourceBytes,
      extractedTextBytes: document.extractedTextBytes,
      extractedFromSha256: document.extractedFromSha256,
    })
  }

  return new Set(documents.map((document) => document.documentId)).size === documents.length
    ? documents
    : null
}

function parseChatRequest(value: unknown): ChatRequestParseResult {
  const correlation = requestCorrelation(value)
  const malformed = (message: string): ChatRequestParseResult => ({
    ok: false,
    error: invalidRequest(message),
    correlation,
  })

  if (!isRecord(value) || !hasOnlyKeys(value, requestKeys)) {
    return malformed('Chat request shape is invalid.')
  }

  const messages = parseInputMessages(value.messages)
  const imageRefs =
    isRecord(value.turnUserMessage) && value.turnUserMessage.imageRefs !== undefined
      ? parseImageRefs(value.turnUserMessage.imageRefs)
      : []
  const newImages = value.newImages === undefined ? [] : parseNewImages(value.newImages)
  const documentRefs =
    isRecord(value.turnUserMessage) && value.turnUserMessage.documentRefs !== undefined
      ? parseDocumentRefs(value.turnUserMessage.documentRefs)
      : []
  const newDocuments = value.newDocuments === undefined ? [] : parseNewDocuments(value.newDocuments)

  if (
    !nonEmptyString(value.requestId) ||
    !nonEmptyString(value.userMessageId) ||
    !nonEmptyString(value.assistantMessageId) ||
    !messages ||
    !isRecord(value.turnUserMessage) ||
    !hasOnlyKeys(value.turnUserMessage, turnUserMessageKeys) ||
    !nonEmptyString(value.turnUserMessage.id) ||
    typeof value.turnUserMessage.content !== 'string' ||
    !imageRefs ||
    !newImages ||
    !documentRefs ||
    !newDocuments ||
    (value.turnUserMessage.content.length === 0 &&
      imageRefs.length === 0 &&
      documentRefs.length === 0)
  ) {
    return malformed(
      'Chat requests must include ids, intent, the current user message, and at least one provider message.',
    )
  }

  if (!isNyxChatTurnIntent(value.turnIntent)) {
    return malformed('Chat requests must use a known turn intent.')
  }

  if (
    (value.turnIntent === 'new_user_message' &&
      ((imageRefs.length === 0 && newImages.length !== 0) ||
        (imageRefs.length !== newImages.length && imageRefs.length > 0) ||
        imageRefs.some((ref, index) => ref.imageId !== newImages[index]?.imageId))) ||
    (value.turnIntent === 'retry_failed_response' && newImages.length !== 0)
  ) {
    return malformed('Chat image refs and new payloads do not match the turn intent.')
  }

  if (
    (value.turnIntent === 'new_user_message' &&
      ((documentRefs.length === 0 && newDocuments.length !== 0) ||
        (documentRefs.length !== newDocuments.length && documentRefs.length > 0) ||
        documentRefs.some((ref, index) => ref.documentId !== newDocuments[index]?.documentId))) ||
    (value.turnIntent === 'retry_failed_response' && newDocuments.length !== 0)
  ) {
    return malformed('Chat document refs and new payloads do not match the turn intent.')
  }

  const targetSelection = parseTargetSelection(value.targetSelection)

  if (!targetSelection) {
    return malformed('Chat requests must include one valid target selection.')
  }

  if (value.systemPrompt !== undefined && typeof value.systemPrompt !== 'string') {
    return malformed('Chat request systemPrompt must be a string when provided.')
  }

  const request: NyxChatRequest = {
    requestId: value.requestId,
    userMessageId: value.userMessageId,
    assistantMessageId: value.assistantMessageId,
    turnIntent: value.turnIntent,
    turnUserMessage: {
      id: value.turnUserMessage.id,
      content: value.turnUserMessage.content,
      ...(imageRefs.length > 0 ? { imageRefs } : {}),
      ...(documentRefs.length > 0 ? { documentRefs } : {}),
    },
    messages,
    targetSelection,
    ...(newImages.length > 0 ? { newImages } : {}),
    ...(newDocuments.length > 0 ? { newDocuments } : {}),
    ...(value.systemPrompt === undefined ? {} : { systemPrompt: value.systemPrompt }),
  }

  if (request.turnUserMessage.id !== request.userMessageId) {
    return malformed(
      'Chat requests must keep the current user message id aligned with userMessageId.',
    )
  }

  if (latestProviderUserMessageContent(request) !== request.turnUserMessage.content) {
    return malformed(
      'Chat requests must keep the current user message content aligned with provider messages.',
    )
  }

  return { ok: true, request, correlation: correlation! }
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
    resolveChatTarget = resolveEnvChatTargetSelection,
    resolveCurrentThreadSession,
  }: ChatSessionManagerOptions = {}) {
    this.runtimeChatStateEnabled = isRuntimeChatStateEnabled(env)
    this.createRuntimeChatStateClient = createRuntimeChatStateClient
    this.resolveChatTarget = resolveChatTarget
    this.resolveCurrentThreadSession = resolveCurrentThreadSession
  }

  start(sender: WebContents, value: unknown) {
    const parsedRequest = parseChatRequest(value)

    if (!parsedRequest.ok) {
      if (parsedRequest.correlation) {
        this.emitError(sender, parsedRequest.correlation, parsedRequest.error)
      }
      return
    }

    const request = parsedRequest.request

    if (request.turnUserMessage.documentRefs || request.newDocuments) {
      this.emitError(sender, request, {
        code: 'invalid_request',
        message: 'Document attachments are not available yet.',
        retryable: false,
      })
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
      const preparedCurrentThread = await currentThreadSession.prepare(
        request,
        session.abortController.signal,
      )

      if (this.activeSession !== session) {
        return
      }

      session.preparedCurrentThread = preparedCurrentThread
      this.emitAccepted(session)

      if (await this.finishCancelledCommittedSession(session)) {
        return
      }

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

      this.emitSessionError(session, chatError)
      this.activeSession = undefined
    }
  }

  private async resolveTargetAndStart(session: ActiveChatSession, request: NyxChatRequest) {
    let target: ResolvedChatTarget

    try {
      target = await this.resolveChatTarget(request.targetSelection)
    } catch (error) {
      if (await this.finishCancelledCommittedSession(session)) {
        return
      }

      await this.handleChatTargetError(session, request, error)
      return
    }

    if (this.activeSession !== session || (await this.finishCancelledCommittedSession(session))) {
      return
    }

    if (session.currentThreadSession && session.preparedCurrentThread) {
      try {
        await session.currentThreadSession.bindResolvedTarget(
          session.requestId,
          session.assistantMessageId,
          target.targetAttribution,
        )
      } catch {
        if (this.activeSession === session) {
          this.emitSessionError(session, {
            code: 'unknown',
            message: 'Nyx could not save the current thread.',
            retryable: false,
          })
          this.activeSession = undefined
        }
        return
      }
    }

    if (this.activeSession !== session || (await this.finishCancelledCommittedSession(session))) {
      return
    }

    session.boundTargetAttribution = target.targetAttribution

    if (
      session.currentThreadSession &&
      (session.preparedCurrentThread?.pendingRecord.version === 3 ||
        session.preparedCurrentThread?.pendingRecord.version === 4)
    ) {
      try {
        session.providerMessages = await session.currentThreadSession.materializeProviderMessages(
          session.preparedCurrentThread.pendingRecord,
        )
      } catch (error) {
        if (
          this.activeSession !== session ||
          (await this.finishCancelledCommittedSession(session))
        ) {
          return
        }

        const chatError =
          error instanceof CurrentThreadSessionError && error.code === 'invalid_request'
            ? {
                code: 'invalid_request' as const,
                message: 'A current-thread image is unavailable.',
                retryable: false,
              }
            : toNonRetryableRuntimeChatError(error)

        if (await this.persistFailure(session, chatError)) {
          this.emitSessionError(session, chatError)
        }
        this.activeSession = undefined
        return
      }
    }

    if (this.activeSession !== session || (await this.finishCancelledCommittedSession(session))) {
      return
    }

    await this.startWithChatTarget(session, target, request)
  }

  private async finishCancelledCommittedSession(session: ActiveChatSession) {
    if (
      this.activeSession !== session ||
      !session.preparedCurrentThread ||
      !session.abortController.signal.aborted
    ) {
      return false
    }

    if (await this.persistCancelled(session)) {
      this.emitDone(session, 'cancelled')
    }
    this.activeSession = undefined
    return true
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

    this.emitSessionError(session, chatError)
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
        this.emitSessionError(session, chatError)
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
        ...(session.providerMessages ? { providerMessages: session.providerMessages } : {}),
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
          this.emitSessionError(session, chatError)
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
            this.emitSessionError(session, chatError)
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
            this.emitSessionError(session, runtimeChatError)
          }
          return
        }

        if (await this.persistFailure(session, chatError)) {
          this.emitSessionError(session, chatError)
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
      this.emitSessionError(session, {
        code: 'unknown',
        message: 'Nyx could not save the current thread.',
        retryable: false,
      })
      return false
    }
  }

  private emitError(
    sender: WebContents,
    request: ChatRequestCorrelation,
    error: NyxChatErrorEvent['error'],
    targetAttribution?: NyxChatTargetAttribution,
  ) {
    this.emitEvent(sender, {
      type: 'chat:error',
      requestId: request.requestId,
      assistantMessageId: request.assistantMessageId,
      status: 'failed',
      error,
      ...(targetAttribution ? { targetAttribution } : {}),
    })
  }

  private emitSessionError(session: ActiveChatSession, error: NyxChatErrorEvent['error']) {
    this.emitError(session.sender, session.request, error, session.boundTargetAttribution)
  }

  private emitStart(session: ActiveChatSession) {
    this.emitEvent(session.sender, {
      type: 'chat:start',
      requestId: session.requestId,
      assistantMessageId: session.assistantMessageId,
      status: 'streaming',
      targetAttribution: session.boundTargetAttribution!,
    })
  }

  private emitAccepted(session: ActiveChatSession) {
    this.emitEvent(session.sender, {
      type: 'chat:accepted',
      requestId: session.requestId,
      userMessageId: session.userMessageId,
      assistantMessageId: session.assistantMessageId,
      turnIntent: session.turnIntent,
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
