import { describe, expect, it, vi } from 'vitest'

import type { RuntimeProtocolRequest, RuntimeProtocolResponse } from './protocol-session'
import {
  RuntimeChatStateClientError,
  RuntimeProtocolChatStateClient,
  createRuntimeChatStateClient,
} from './chat-state-client'

function message(id: string, role: 'user' | 'assistant', content: string) {
  return {
    id,
    role,
    content,
  }
}

function noTurn() {
  return {
    type: 'no_turn',
  }
}

function activeTurn(
  turnRequestId: string,
  userMessageId: string,
  assistantMessageId: string,
  draft: string,
  phase: 'submitted' | 'streaming',
) {
  return {
    type: 'active',
    turn_request_id: turnRequestId,
    user_message_id: userMessageId,
    assistant_message_id: assistantMessageId,
    draft,
    phase,
  }
}

function failedTurn(
  turnRequestId: string,
  userMessageId: string,
  assistantMessageId: string,
  draft: string,
  errorMessage: string,
) {
  return {
    type: 'failed',
    turn_request_id: turnRequestId,
    user_message_id: userMessageId,
    assistant_message_id: assistantMessageId,
    draft,
    error: {
      message: errorMessage,
    },
  }
}

function stateResponse(
  id: string,
  currentTurn: Record<string, unknown> = noTurn(),
  transcript: Array<Record<string, unknown>> = [],
): RuntimeProtocolResponse {
  return {
    type: 'chat_reducer_state',
    id,
    state: {
      transcript,
      current_turn: currentTurn,
    },
  }
}

function stringField(request: RuntimeProtocolRequest, field: string) {
  const value = request[field]

  if (typeof value !== 'string') {
    throw new Error(`Expected string field ${field}`)
  }

  return value
}

function stateForRequest(request: RuntimeProtocolRequest) {
  switch (request.action) {
    case 'submit_user_message':
      return stateResponse(
        request.id,
        activeTurn(
          stringField(request, 'turn_request_id'),
          stringField(request, 'user_message_id'),
          stringField(request, 'assistant_message_id'),
          '',
          'submitted',
        ),
        [message(stringField(request, 'user_message_id'), 'user', stringField(request, 'content'))],
      )

    case 'start_assistant':
      return stateResponse(
        request.id,
        activeTurn(
          stringField(request, 'turn_request_id'),
          'user-1',
          stringField(request, 'assistant_message_id'),
          '',
          'streaming',
        ),
        [message('user-1', 'user', 'Hello Nyx')],
      )

    case 'append_delta':
      return stateResponse(
        request.id,
        activeTurn(
          stringField(request, 'turn_request_id'),
          'user-1',
          stringField(request, 'assistant_message_id'),
          stringField(request, 'snapshot'),
          'streaming',
        ),
        [message('user-1', 'user', 'Hello Nyx')],
      )

    case 'complete':
      return stateResponse(request.id, noTurn(), [
        message('user-1', 'user', 'Hello Nyx'),
        message(
          stringField(request, 'assistant_message_id'),
          'assistant',
          stringField(request, 'final_content'),
        ),
      ])

    case 'cancel':
      return stateResponse(request.id)

    case 'fail':
      return stateResponse(
        request.id,
        failedTurn(
          stringField(request, 'turn_request_id'),
          'user-1',
          stringField(request, 'assistant_message_id'),
          'Partial',
          (request.error as { message: string }).message,
        ),
        [message('user-1', 'user', 'Hello Nyx')],
      )

    case 'retry_failed':
      return stateResponse(
        request.id,
        activeTurn(
          stringField(request, 'turn_request_id'),
          'user-1',
          'assistant-1',
          '',
          'submitted',
        ),
        [message('user-1', 'user', 'Hello Nyx')],
      )

    case 'clear':
      return stateResponse(request.id)

    default:
      throw new Error(`Unexpected action ${String(request.action)}`)
  }
}

function fakeProtocolSession(
  respond: (request: RuntimeProtocolRequest) => RuntimeProtocolResponse = (request) =>
    stateForRequest(request),
) {
  const requests: RuntimeProtocolRequest[] = []
  const request = vi.fn(async (protocolRequest: RuntimeProtocolRequest) => {
    requests.push(protocolRequest)
    return respond(protocolRequest)
  })
  const close = vi.fn()

  return {
    requests,
    session: {
      request,
      close,
    },
    request,
    close,
  }
}

describe('RuntimeProtocolChatStateClient', () => {
  it('maps chat lifecycle calls to existing runtime chat reducer actions', async () => {
    const fakeRuntime = fakeProtocolSession()
    const client = new RuntimeProtocolChatStateClient({
      session: fakeRuntime.session,
    })

    await client.submitUserMessage({
      turnRequestId: 'request-1',
      userMessageId: 'user-1',
      assistantMessageId: 'assistant-1',
      content: 'Hello Nyx',
    })
    await client.startAssistant({
      turnRequestId: 'request-1',
      assistantMessageId: 'assistant-1',
    })
    await client.appendDelta({
      turnRequestId: 'request-1',
      assistantMessageId: 'assistant-1',
      snapshot: 'Partial',
    })
    await client.complete({
      turnRequestId: 'request-1',
      assistantMessageId: 'assistant-1',
      finalContent: 'Final',
    })
    await client.cancel({
      turnRequestId: 'request-2',
      assistantMessageId: 'assistant-2',
      finalContent: 'Stopped',
    })
    await client.fail({
      turnRequestId: 'request-3',
      assistantMessageId: 'assistant-3',
      message: 'Provider failed',
    })
    await client.retryFailed({
      turnRequestId: 'request-4',
    })
    await client.clear()

    expect(fakeRuntime.requests).toEqual([
      {
        type: 'chat_reducer_action',
        id: 'chat_state_submit_user_message_1',
        action: 'submit_user_message',
        turn_request_id: 'request-1',
        user_message_id: 'user-1',
        assistant_message_id: 'assistant-1',
        content: 'Hello Nyx',
      },
      {
        type: 'chat_reducer_action',
        id: 'chat_state_start_assistant_2',
        action: 'start_assistant',
        turn_request_id: 'request-1',
        assistant_message_id: 'assistant-1',
      },
      {
        type: 'chat_reducer_action',
        id: 'chat_state_append_delta_3',
        action: 'append_delta',
        turn_request_id: 'request-1',
        assistant_message_id: 'assistant-1',
        snapshot: 'Partial',
      },
      {
        type: 'chat_reducer_action',
        id: 'chat_state_complete_4',
        action: 'complete',
        turn_request_id: 'request-1',
        assistant_message_id: 'assistant-1',
        final_content: 'Final',
      },
      {
        type: 'chat_reducer_action',
        id: 'chat_state_cancel_5',
        action: 'cancel',
        turn_request_id: 'request-2',
        assistant_message_id: 'assistant-2',
        final_content: 'Stopped',
      },
      {
        type: 'chat_reducer_action',
        id: 'chat_state_fail_6',
        action: 'fail',
        turn_request_id: 'request-3',
        assistant_message_id: 'assistant-3',
        error: {
          message: 'Provider failed',
        },
      },
      {
        type: 'chat_reducer_action',
        id: 'chat_state_retry_failed_7',
        action: 'retry_failed',
        turn_request_id: 'request-4',
      },
      {
        type: 'chat_reducer_action',
        id: 'chat_state_clear_8',
        action: 'clear',
      },
    ])
  })

  it('rejects non chat reducer state responses', async () => {
    const fakeRuntime = fakeProtocolSession((request) => ({
      type: 'pong',
      id: request.id,
    }))
    const client = new RuntimeProtocolChatStateClient({
      session: fakeRuntime.session,
    })

    await expect(client.clear()).rejects.toBeInstanceOf(RuntimeChatStateClientError)
  })

  it('rejects reducer states that do not match the requested transition', async () => {
    const fakeRuntime = fakeProtocolSession((request) => stateResponse(request.id))
    const client = new RuntimeProtocolChatStateClient({
      session: fakeRuntime.session,
    })

    await expect(
      client.startAssistant({
        turnRequestId: 'request-1',
        assistantMessageId: 'assistant-1',
      }),
    ).rejects.toMatchObject({
      message:
        'Nyx runtime chat reducer did not apply start_assistant; active turn invariant failed.',
    })
  })

  it('wraps protocol request failures as runtime chat state errors', async () => {
    const fakeRuntime = fakeProtocolSession()
    fakeRuntime.request.mockRejectedValueOnce(new Error('runtime exited'))
    const client = new RuntimeProtocolChatStateClient({
      session: fakeRuntime.session,
    })
    const failure = client.clear()

    await expect(failure).rejects.toBeInstanceOf(RuntimeChatStateClientError)
    await expect(failure).rejects.toThrow('Nyx runtime chat reducer request failed.')
  })

  it('closes the underlying protocol session', () => {
    const fakeRuntime = fakeProtocolSession()
    const client = new RuntimeProtocolChatStateClient({
      session: fakeRuntime.session,
    })

    client.close()

    expect(fakeRuntime.close).toHaveBeenCalledTimes(1)
  })
})

describe('createRuntimeChatStateClient', () => {
  it('resolves the runtime path and creates a protocol session', async () => {
    const fakeRuntime = fakeProtocolSession()
    const createProtocolSession = vi.fn(() => fakeRuntime.session)
    const client = createRuntimeChatStateClient({
      resolveRuntimePath: () => ({
        status: 'available',
        source: 'env',
        runtimePath: '/opt/nyx/nyx-runtime',
      }),
      createProtocolSession,
    })

    await client.clear()

    expect(createProtocolSession).toHaveBeenCalledWith({
      runtimePath: '/opt/nyx/nyx-runtime',
    })
    expect(fakeRuntime.requests).toHaveLength(1)
  })

  it('throws a chat error when the runtime path cannot be resolved', () => {
    expect(() =>
      createRuntimeChatStateClient({
        resolveRuntimePath: () => ({
          status: 'unavailable',
          reason: 'repo_dev_fallback_missing',
          checkedPaths: ['/missing/nyx-runtime'],
        }),
      }),
    ).toThrow('NYX_RUNTIME_CHAT_STATE is enabled')
  })
})
