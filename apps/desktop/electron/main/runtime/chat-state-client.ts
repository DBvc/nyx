import { createChatBridgeError } from '../chat/errors'
import {
  resolveRuntimePath as resolveRuntimePathDefault,
  type ResolveRuntimePathOptions,
} from './path'
import {
  createRuntimeProtocolSession,
  type RuntimeProtocolRequest,
  type RuntimeProtocolResponse,
  type RuntimeProtocolSessionOptions,
} from './protocol-session'

export const NYX_RUNTIME_CHAT_STATE_ENV = 'NYX_RUNTIME_CHAT_STATE' as const

interface ProtocolSession {
  request(request: RuntimeProtocolRequest): Promise<RuntimeProtocolResponse>
  close(): void
}

type ResolveRuntimePath = (
  options?: ResolveRuntimePathOptions,
) => ReturnType<typeof resolveRuntimePathDefault>
type CreateProtocolSession = (options: RuntimeProtocolSessionOptions) => ProtocolSession

export interface RuntimeChatTurn {
  turnRequestId: string
  assistantMessageId: string
}

export interface RuntimeSubmitUserMessage extends RuntimeChatTurn {
  userMessageId: string
  content: string
}

export interface RuntimeFailTurn extends RuntimeChatTurn {
  message: string
}

export interface RuntimeFinishTurn extends RuntimeChatTurn {
  finalContent: string
}

export interface RuntimeAppendDelta extends RuntimeChatTurn {
  snapshot: string
}

export interface RuntimeRetryFailed {
  turnRequestId: string
}

type RuntimeChatReducerRole = 'system' | 'user' | 'assistant'
type RuntimeChatReducerPhase = 'submitted' | 'streaming'

interface RuntimeChatReducerMessage {
  id: string
  role: RuntimeChatReducerRole
  content: string
}

interface RuntimeChatReducerNoTurn {
  type: 'no_turn'
}

interface RuntimeChatReducerActiveTurn {
  type: 'active'
  turn_request_id: string
  user_message_id: string
  assistant_message_id: string
  draft: string
  phase: RuntimeChatReducerPhase
}

interface RuntimeChatReducerFailedTurn {
  type: 'failed'
  turn_request_id: string
  user_message_id: string
  assistant_message_id: string
  draft: string
  error: {
    message: string
  }
}

type RuntimeChatReducerCurrentTurn =
  | RuntimeChatReducerNoTurn
  | RuntimeChatReducerActiveTurn
  | RuntimeChatReducerFailedTurn

export interface RuntimeChatReducerState {
  transcript: RuntimeChatReducerMessage[]
  current_turn: RuntimeChatReducerCurrentTurn
}

export interface RuntimeChatStateClient {
  submitUserMessage(turn: RuntimeSubmitUserMessage): Promise<RuntimeChatReducerState>
  retryFailed(turn: RuntimeRetryFailed): Promise<RuntimeChatReducerState>
  startAssistant(turn: RuntimeChatTurn): Promise<RuntimeChatReducerState>
  appendDelta(turn: RuntimeAppendDelta): Promise<RuntimeChatReducerState>
  complete(turn: RuntimeFinishTurn): Promise<RuntimeChatReducerState>
  cancel(turn: RuntimeFinishTurn): Promise<RuntimeChatReducerState>
  fail(turn: RuntimeFailTurn): Promise<RuntimeChatReducerState>
  clear(): Promise<RuntimeChatReducerState>
  close(): void
}

export class RuntimeChatStateClientError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause })
    this.name = 'RuntimeChatStateClientError'
  }
}

export interface RuntimeChatStateClientOptions {
  session: ProtocolSession
}

export interface CreateRuntimeChatStateClientOptions {
  path?: ResolveRuntimePathOptions
  requestTimeoutMs?: number
  resolveRuntimePath?: ResolveRuntimePath
  createProtocolSession?: CreateProtocolSession
}

function isProtocolObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function isRuntimeChatReducerRole(value: unknown): value is RuntimeChatReducerRole {
  return value === 'system' || value === 'user' || value === 'assistant'
}

function isRuntimeChatReducerPhase(value: unknown): value is RuntimeChatReducerPhase {
  return value === 'submitted' || value === 'streaming'
}

function validateChatReducerMessage(value: unknown): RuntimeChatReducerMessage {
  if (!isProtocolObject(value)) {
    throw new RuntimeChatStateClientError('Nyx runtime chat reducer message must be an object.')
  }

  const { id, role, content } = value

  if (!isString(id) || !isRuntimeChatReducerRole(role) || !isString(content)) {
    throw new RuntimeChatStateClientError('Nyx runtime chat reducer message shape is invalid.')
  }

  return {
    id,
    role,
    content,
  }
}

function validateNoTurn(value: Record<string, unknown>): RuntimeChatReducerNoTurn {
  if (value.type !== 'no_turn') {
    throw new RuntimeChatStateClientError('Nyx runtime chat reducer no-turn shape is invalid.')
  }

  return {
    type: 'no_turn',
  }
}

function validateActiveTurn(value: Record<string, unknown>): RuntimeChatReducerActiveTurn {
  const {
    type,
    turn_request_id: turnRequestId,
    user_message_id: userMessageId,
    assistant_message_id: assistantMessageId,
    draft,
    phase,
  } = value

  if (
    type !== 'active' ||
    !isString(turnRequestId) ||
    !isString(userMessageId) ||
    !isString(assistantMessageId) ||
    !isString(draft) ||
    !isRuntimeChatReducerPhase(phase)
  ) {
    throw new RuntimeChatStateClientError('Nyx runtime chat reducer active turn shape is invalid.')
  }

  return {
    type: 'active',
    turn_request_id: turnRequestId,
    user_message_id: userMessageId,
    assistant_message_id: assistantMessageId,
    draft,
    phase,
  }
}

function validateFailedTurn(value: Record<string, unknown>): RuntimeChatReducerFailedTurn {
  const {
    type,
    turn_request_id: turnRequestId,
    user_message_id: userMessageId,
    assistant_message_id: assistantMessageId,
    draft,
    error,
  } = value

  if (
    type !== 'failed' ||
    !isString(turnRequestId) ||
    !isString(userMessageId) ||
    !isString(assistantMessageId) ||
    !isString(draft) ||
    !isProtocolObject(error) ||
    !isString(error.message)
  ) {
    throw new RuntimeChatStateClientError('Nyx runtime chat reducer failed turn shape is invalid.')
  }

  return {
    type: 'failed',
    turn_request_id: turnRequestId,
    user_message_id: userMessageId,
    assistant_message_id: assistantMessageId,
    draft,
    error: {
      message: error.message,
    },
  }
}

function validateCurrentTurn(value: unknown): RuntimeChatReducerCurrentTurn {
  if (!isProtocolObject(value)) {
    throw new RuntimeChatStateClientError(
      'Nyx runtime chat reducer current turn must be an object.',
    )
  }

  switch (value.type) {
    case 'no_turn':
      return validateNoTurn(value)

    case 'active':
      return validateActiveTurn(value)

    case 'failed':
      return validateFailedTurn(value)

    default:
      throw new RuntimeChatStateClientError(
        'Nyx runtime chat reducer current turn type is invalid.',
      )
  }
}

function validateChatReducerStateResponse(
  response: RuntimeProtocolResponse,
): RuntimeChatReducerState {
  if (response.type !== 'chat_reducer_state') {
    throw new RuntimeChatStateClientError('Nyx runtime chat reducer returned an unexpected type.')
  }

  if (!isProtocolObject(response.state)) {
    throw new RuntimeChatStateClientError('Nyx runtime chat reducer state must be an object.')
  }

  const { transcript, current_turn: currentTurn } = response.state

  if (!Array.isArray(transcript)) {
    throw new RuntimeChatStateClientError('Nyx runtime chat reducer state shape is invalid.')
  }

  return {
    transcript: transcript.map(validateChatReducerMessage),
    current_turn: validateCurrentTurn(currentTurn),
  }
}

function expectNoTurn(action: string, state: RuntimeChatReducerState) {
  if (state.current_turn.type !== 'no_turn') {
    throw new RuntimeChatStateClientError(
      `Nyx runtime chat reducer did not apply ${action}; expected no active turn.`,
    )
  }
}

function expectClearedState(state: RuntimeChatReducerState) {
  expectNoTurn('clear', state)

  if (state.transcript.length !== 0) {
    throw new RuntimeChatStateClientError('Nyx runtime chat reducer did not clear the transcript.')
  }
}

function expectActiveTurn(
  action: string,
  state: RuntimeChatReducerState,
  expected: {
    turnRequestId: string
    assistantMessageId?: string
    userMessageId?: string
    draft?: string
    phase: RuntimeChatReducerPhase
  },
) {
  const turn = state.current_turn

  if (
    turn.type !== 'active' ||
    turn.turn_request_id !== expected.turnRequestId ||
    turn.phase !== expected.phase ||
    (expected.assistantMessageId !== undefined &&
      turn.assistant_message_id !== expected.assistantMessageId) ||
    (expected.userMessageId !== undefined && turn.user_message_id !== expected.userMessageId) ||
    (expected.draft !== undefined && turn.draft !== expected.draft)
  ) {
    throw new RuntimeChatStateClientError(
      `Nyx runtime chat reducer did not apply ${action}; active turn invariant failed.`,
    )
  }
}

function expectFailedTurn(
  action: string,
  state: RuntimeChatReducerState,
  expected: {
    turnRequestId: string
    assistantMessageId: string
    message: string
  },
) {
  const turn = state.current_turn

  if (
    turn.type !== 'failed' ||
    turn.turn_request_id !== expected.turnRequestId ||
    turn.assistant_message_id !== expected.assistantMessageId ||
    turn.error.message !== expected.message
  ) {
    throw new RuntimeChatStateClientError(
      `Nyx runtime chat reducer did not apply ${action}; failed turn invariant failed.`,
    )
  }
}

function unavailableRuntimeDetails(checkedPaths: ReadonlyArray<string>) {
  if (checkedPaths.length === 0) {
    return undefined
  }

  return `Checked paths: ${checkedPaths.join(', ')}`
}

export class RuntimeProtocolChatStateClient implements RuntimeChatStateClient {
  private requestSequence = 0

  constructor(private readonly options: RuntimeChatStateClientOptions) {}

  async submitUserMessage(turn: RuntimeSubmitUserMessage) {
    const state = await this.request('submit_user_message', {
      turn_request_id: turn.turnRequestId,
      user_message_id: turn.userMessageId,
      assistant_message_id: turn.assistantMessageId,
      content: turn.content,
    })

    expectActiveTurn('submit_user_message', state, {
      turnRequestId: turn.turnRequestId,
      userMessageId: turn.userMessageId,
      assistantMessageId: turn.assistantMessageId,
      draft: '',
      phase: 'submitted',
    })

    return state
  }

  async retryFailed(turn: RuntimeRetryFailed) {
    const state = await this.request('retry_failed', {
      turn_request_id: turn.turnRequestId,
    })

    expectActiveTurn('retry_failed', state, {
      turnRequestId: turn.turnRequestId,
      draft: '',
      phase: 'submitted',
    })

    return state
  }

  async startAssistant(turn: RuntimeChatTurn) {
    const state = await this.request('start_assistant', {
      turn_request_id: turn.turnRequestId,
      assistant_message_id: turn.assistantMessageId,
    })

    expectActiveTurn('start_assistant', state, {
      turnRequestId: turn.turnRequestId,
      assistantMessageId: turn.assistantMessageId,
      phase: 'streaming',
    })

    return state
  }

  async appendDelta(turn: RuntimeAppendDelta) {
    const state = await this.request('append_delta', {
      turn_request_id: turn.turnRequestId,
      assistant_message_id: turn.assistantMessageId,
      snapshot: turn.snapshot,
    })

    expectActiveTurn('append_delta', state, {
      turnRequestId: turn.turnRequestId,
      assistantMessageId: turn.assistantMessageId,
      draft: turn.snapshot,
      phase: 'streaming',
    })

    return state
  }

  async complete(turn: RuntimeFinishTurn) {
    const state = await this.request('complete', {
      turn_request_id: turn.turnRequestId,
      assistant_message_id: turn.assistantMessageId,
      final_content: turn.finalContent,
    })

    expectNoTurn('complete', state)

    return state
  }

  async cancel(turn: RuntimeFinishTurn) {
    const state = await this.request('cancel', {
      turn_request_id: turn.turnRequestId,
      assistant_message_id: turn.assistantMessageId,
      final_content: turn.finalContent,
    })

    expectNoTurn('cancel', state)

    return state
  }

  async fail(turn: RuntimeFailTurn) {
    const state = await this.request('fail', {
      turn_request_id: turn.turnRequestId,
      assistant_message_id: turn.assistantMessageId,
      error: {
        message: turn.message,
      },
    })

    expectFailedTurn('fail', state, {
      turnRequestId: turn.turnRequestId,
      assistantMessageId: turn.assistantMessageId,
      message: turn.message,
    })

    return state
  }

  async clear() {
    const state = await this.request('clear')

    expectClearedState(state)

    return state
  }

  close() {
    this.options.session.close()
  }

  private async request(action: string, fields: Record<string, unknown> = {}) {
    this.requestSequence += 1

    let response: RuntimeProtocolResponse

    try {
      response = await this.options.session.request({
        type: 'chat_reducer_action',
        id: `chat_state_${action}_${this.requestSequence}`,
        action,
        ...fields,
      })
    } catch (error) {
      throw new RuntimeChatStateClientError('Nyx runtime chat reducer request failed.', error)
    }

    return validateChatReducerStateResponse(response)
  }
}

export function createRuntimeChatStateClient({
  path,
  requestTimeoutMs,
  resolveRuntimePath = resolveRuntimePathDefault,
  createProtocolSession = createRuntimeProtocolSession,
}: CreateRuntimeChatStateClientOptions = {}): RuntimeChatStateClient {
  const pathResolution = resolveRuntimePath(path)

  if (pathResolution.status === 'unavailable') {
    throw createChatBridgeError({
      code: 'config_missing',
      message: 'NYX_RUNTIME_CHAT_STATE is enabled, but the Nyx runtime executable was not found.',
      retryable: false,
      ...(() => {
        const details = unavailableRuntimeDetails(pathResolution.checkedPaths)
        return details === undefined ? {} : { details }
      })(),
    })
  }

  return new RuntimeProtocolChatStateClient({
    session: createProtocolSession({
      runtimePath: pathResolution.runtimePath,
      ...(requestTimeoutMs === undefined ? {} : { requestTimeoutMs }),
    }),
  })
}
