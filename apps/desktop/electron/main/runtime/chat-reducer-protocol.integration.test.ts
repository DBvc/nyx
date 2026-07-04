import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const repoRoot = fileURLToPath(new URL('../../../../..', import.meta.url))
const artifactPath = join(repoRoot, 'apps', 'desktop', '.runtime-artifacts', 'nyx-runtime')
const integrationIt = process.env.NYX_RUNTIME_CHAT_REDUCER_PROTOCOL === '1' ? it : it.skip

type ProtocolObject = Record<string, unknown>
type ActivePhase = 'submitted' | 'streaming'

function configuredRuntimeArtifactPath() {
  const configuredRuntimePath = process.env.NYX_RUNTIME_PATH

  if (!configuredRuntimePath) {
    throw new Error('NYX_RUNTIME_PATH must point at the generated runtime artifact.')
  }

  return resolve(configuredRuntimePath)
}

function checkedRuntimeArtifactPath() {
  const runtimePath = configuredRuntimeArtifactPath()

  expect(runtimePath).toBe(artifactPath)
  expect(existsSync(runtimePath)).toBe(true)

  return runtimePath
}

function isProtocolObject(value: unknown): value is ProtocolObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseProtocolResponses(stdout: string, expectedCount: number) {
  const lines = stdout
    .replaceAll('\r\n', '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  if (lines.length !== expectedCount) {
    throw new Error(
      `Expected ${expectedCount} protocol response line(s), got ${lines.length}. stdout: ${stdout}`,
    )
  }

  return lines.map((line) => {
    const payload: unknown = JSON.parse(line)

    if (!isProtocolObject(payload)) {
      throw new Error('Nyx runtime protocol response must be a JSON object.')
    }

    return payload
  })
}

function runtimeExitDescription(exitCode: number | null, signal: NodeJS.Signals | null) {
  if (exitCode !== null) {
    return `exit code ${exitCode}`
  }

  return `signal ${signal ?? 'unknown'}`
}

function runRuntimeProtocolFixture(
  runtimePath: string,
  requests: ReadonlyArray<ProtocolObject>,
  timeoutMs = 5_000,
) {
  return new Promise<ProtocolObject[]>((resolveFixture, rejectFixture) => {
    const runtimeProcess: ChildProcessWithoutNullStreams = spawn(runtimePath, ['protocol'])
    const requestLines = `${requests.map((request) => JSON.stringify(request)).join('\n')}\n`
    let stdout = ''
    let stderr = ''
    let settled = false
    let timeout: NodeJS.Timeout

    function cleanup() {
      clearTimeout(timeout)
      runtimeProcess.stdin.off('error', onStdinError)
      runtimeProcess.stdout.off('data', onStdoutData)
      runtimeProcess.stderr.off('data', onStderrData)
      runtimeProcess.off('error', onProcessError)
      runtimeProcess.off('close', onProcessClose)
    }

    function settleWithError(error: Error, shouldKillRuntime = true) {
      if (settled) {
        return
      }

      settled = true
      cleanup()

      if (shouldKillRuntime) {
        runtimeProcess.kill()
      }

      rejectFixture(error)
    }

    function settleWithSuccess(payloads: ProtocolObject[]) {
      if (settled) {
        return
      }

      settled = true
      cleanup()
      resolveFixture(payloads)
    }

    function onStdoutData(chunk: Buffer | string) {
      stdout += chunk.toString()
    }

    function onStderrData(chunk: Buffer | string) {
      stderr += chunk.toString()
    }

    function onStdinError(error: Error) {
      settleWithError(new Error(`Failed to write chat reducer protocol fixture: ${error.message}`))
    }

    function onProcessError(error: Error) {
      settleWithError(new Error(`Failed to spawn Nyx runtime protocol fixture: ${error.message}`))
    }

    function onProcessClose(exitCode: number | null, signal: NodeJS.Signals | null) {
      if (settled) {
        return
      }

      if (exitCode !== 0) {
        const stderrSuffix = stderr.trim().length > 0 ? ` stderr: ${stderr.trim()}` : ''

        settleWithError(
          new Error(
            `Nyx runtime protocol exited with ${runtimeExitDescription(exitCode, signal)}.${stderrSuffix}`,
          ),
          false,
        )
        return
      }

      try {
        settleWithSuccess(parseProtocolResponses(stdout, requests.length))
      } catch (error) {
        settleWithError(error instanceof Error ? error : new Error(String(error)), false)
      }
    }

    timeout = setTimeout(() => {
      settleWithError(new Error('Timed out waiting for Nyx runtime chat reducer protocol fixture.'))
    }, timeoutMs)

    runtimeProcess.stdin.once('error', onStdinError)
    runtimeProcess.stdout.on('data', onStdoutData)
    runtimeProcess.stderr.on('data', onStderrData)
    runtimeProcess.once('error', onProcessError)
    runtimeProcess.once('close', onProcessClose)
    runtimeProcess.stdin.end(requestLines)
  })
}

function chatAction(id: string, action: string, fields: ProtocolObject = {}) {
  return {
    type: 'chat_reducer_action',
    id,
    action,
    ...fields,
  }
}

function submitUserMessage(
  id: string,
  turnRequestId: string,
  userMessageId: string,
  assistantMessageId: string,
) {
  return chatAction(id, 'submit_user_message', {
    turn_request_id: turnRequestId,
    user_message_id: userMessageId,
    assistant_message_id: assistantMessageId,
    content: 'Hello Nyx',
  })
}

function startAssistant(id: string, turnRequestId: string, assistantMessageId: string) {
  return chatAction(id, 'start_assistant', {
    turn_request_id: turnRequestId,
    assistant_message_id: assistantMessageId,
  })
}

function appendDelta(
  id: string,
  turnRequestId: string,
  assistantMessageId: string,
  snapshot: string,
) {
  return chatAction(id, 'append_delta', {
    turn_request_id: turnRequestId,
    assistant_message_id: assistantMessageId,
    snapshot,
  })
}

function complete(
  id: string,
  turnRequestId: string,
  assistantMessageId: string,
  finalContent: string,
) {
  return chatAction(id, 'complete', {
    turn_request_id: turnRequestId,
    assistant_message_id: assistantMessageId,
    final_content: finalContent,
  })
}

function cancel(
  id: string,
  turnRequestId: string,
  assistantMessageId: string,
  finalContent: string,
) {
  return chatAction(id, 'cancel', {
    turn_request_id: turnRequestId,
    assistant_message_id: assistantMessageId,
    final_content: finalContent,
  })
}

function fail(id: string, turnRequestId: string, assistantMessageId: string, message: string) {
  return chatAction(id, 'fail', {
    turn_request_id: turnRequestId,
    assistant_message_id: assistantMessageId,
    error: { message },
  })
}

function retryFailed(id: string, turnRequestId: string) {
  return chatAction(id, 'retry_failed', {
    turn_request_id: turnRequestId,
  })
}

function clear(id: string) {
  return chatAction(id, 'clear')
}

function userMessage(id: string, content = 'Hello Nyx') {
  return { id, role: 'user', content }
}

function assistantMessage(id: string, content: string) {
  return { id, role: 'assistant', content }
}

function noTurn() {
  return { type: 'no_turn' }
}

function activeTurn(
  turnRequestId: string,
  userMessageId: string,
  assistantMessageId: string,
  draft: string,
  phase: ActivePhase,
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
    error: { message: errorMessage },
  }
}

function stateResponse(
  id: string,
  transcript: ReadonlyArray<ProtocolObject>,
  currentTurn: ProtocolObject,
) {
  return {
    type: 'chat_reducer_state',
    id,
    state: {
      transcript,
      current_turn: currentTurn,
    },
  }
}

function submittedState(
  id: string,
  turnRequestId: string,
  userMessageId: string,
  assistantMessageId: string,
) {
  return stateResponse(
    id,
    [userMessage(userMessageId)],
    activeTurn(turnRequestId, userMessageId, assistantMessageId, '', 'submitted'),
  )
}

async function expectProtocolFixture(
  requests: ReadonlyArray<ProtocolObject>,
  expectedResponses: ReadonlyArray<ProtocolObject>,
) {
  await expect(runRuntimeProtocolFixture(checkedRuntimeArtifactPath(), requests)).resolves.toEqual(
    expectedResponses,
  )
}

describe('nyx runtime chat reducer protocol integration', () => {
  integrationIt(
    'completes an assistant turn with user and assistant transcript messages',
    async () => {
      const turnRequestId = 'turn-complete-1'
      const userMessageId = 'user-complete-1'
      const assistantMessageId = 'assistant-complete-1'

      await expectProtocolFixture(
        [
          submitUserMessage('complete_1', turnRequestId, userMessageId, assistantMessageId),
          startAssistant('complete_2', turnRequestId, assistantMessageId),
          appendDelta('complete_3', turnRequestId, assistantMessageId, 'Draft answer'),
          complete('complete_4', turnRequestId, assistantMessageId, 'Final answer'),
        ],
        [
          submittedState('complete_1', turnRequestId, userMessageId, assistantMessageId),
          stateResponse(
            'complete_2',
            [userMessage(userMessageId)],
            activeTurn(turnRequestId, userMessageId, assistantMessageId, '', 'streaming'),
          ),
          stateResponse(
            'complete_3',
            [userMessage(userMessageId)],
            activeTurn(
              turnRequestId,
              userMessageId,
              assistantMessageId,
              'Draft answer',
              'streaming',
            ),
          ),
          stateResponse(
            'complete_4',
            [userMessage(userMessageId), assistantMessage(assistantMessageId, 'Final answer')],
            noTurn(),
          ),
        ],
      )
    },
  )

  integrationIt('cancels turns using the current OCaml final content semantics', async () => {
    await expectProtocolFixture(
      [
        submitUserMessage(
          'cancel_empty_1',
          'turn-cancel-empty-1',
          'user-cancel-empty-1',
          'assistant-cancel-empty-1',
        ),
        cancel('cancel_empty_2', 'turn-cancel-empty-1', 'assistant-cancel-empty-1', ''),
      ],
      [
        submittedState(
          'cancel_empty_1',
          'turn-cancel-empty-1',
          'user-cancel-empty-1',
          'assistant-cancel-empty-1',
        ),
        stateResponse('cancel_empty_2', [userMessage('user-cancel-empty-1')], noTurn()),
      ],
    )

    await expectProtocolFixture(
      [
        submitUserMessage(
          'cancel_partial_1',
          'turn-cancel-partial-1',
          'user-cancel-partial-1',
          'assistant-cancel-partial-1',
        ),
        appendDelta(
          'cancel_partial_2',
          'turn-cancel-partial-1',
          'assistant-cancel-partial-1',
          'Partial draft',
        ),
        cancel(
          'cancel_partial_3',
          'turn-cancel-partial-1',
          'assistant-cancel-partial-1',
          'Partial answer',
        ),
      ],
      [
        submittedState(
          'cancel_partial_1',
          'turn-cancel-partial-1',
          'user-cancel-partial-1',
          'assistant-cancel-partial-1',
        ),
        stateResponse(
          'cancel_partial_2',
          [userMessage('user-cancel-partial-1')],
          activeTurn(
            'turn-cancel-partial-1',
            'user-cancel-partial-1',
            'assistant-cancel-partial-1',
            'Partial draft',
            'streaming',
          ),
        ),
        stateResponse(
          'cancel_partial_3',
          [
            userMessage('user-cancel-partial-1'),
            assistantMessage('assistant-cancel-partial-1', 'Partial answer'),
          ],
          noTurn(),
        ),
      ],
    )
  })

  integrationIt('keeps the assistant draft and error on a failed turn', async () => {
    const turnRequestId = 'turn-fail-1'
    const userMessageId = 'user-fail-1'
    const assistantMessageId = 'assistant-fail-1'

    await expectProtocolFixture(
      [
        submitUserMessage('fail_1', turnRequestId, userMessageId, assistantMessageId),
        startAssistant('fail_2', turnRequestId, assistantMessageId),
        appendDelta('fail_3', turnRequestId, assistantMessageId, 'Draft before failure'),
        fail('fail_4', turnRequestId, assistantMessageId, 'Network stopped'),
      ],
      [
        submittedState('fail_1', turnRequestId, userMessageId, assistantMessageId),
        stateResponse(
          'fail_2',
          [userMessage(userMessageId)],
          activeTurn(turnRequestId, userMessageId, assistantMessageId, '', 'streaming'),
        ),
        stateResponse(
          'fail_3',
          [userMessage(userMessageId)],
          activeTurn(
            turnRequestId,
            userMessageId,
            assistantMessageId,
            'Draft before failure',
            'streaming',
          ),
        ),
        stateResponse(
          'fail_4',
          [userMessage(userMessageId)],
          failedTurn(
            turnRequestId,
            userMessageId,
            assistantMessageId,
            'Draft before failure',
            'Network stopped',
          ),
        ),
      ],
    )
  })

  integrationIt('clears the chat reducer state back to the initial state', async () => {
    await expectProtocolFixture(
      [
        submitUserMessage('clear_1', 'turn-clear-1', 'user-clear-1', 'assistant-clear-1'),
        clear('clear_2'),
      ],
      [
        submittedState('clear_1', 'turn-clear-1', 'user-clear-1', 'assistant-clear-1'),
        stateResponse('clear_2', [], noTurn()),
      ],
    )
  })

  integrationIt('retries a failed turn without duplicating the user message', async () => {
    await expectProtocolFixture(
      [
        submitUserMessage('retry_1', 'turn-retry-1', 'user-retry-1', 'assistant-retry-1'),
        appendDelta('retry_2', 'turn-retry-1', 'assistant-retry-1', 'Draft before retry'),
        fail('retry_3', 'turn-retry-1', 'assistant-retry-1', 'Provider failed'),
        retryFailed('retry_4', 'turn-retry-2'),
      ],
      [
        submittedState('retry_1', 'turn-retry-1', 'user-retry-1', 'assistant-retry-1'),
        stateResponse(
          'retry_2',
          [userMessage('user-retry-1')],
          activeTurn(
            'turn-retry-1',
            'user-retry-1',
            'assistant-retry-1',
            'Draft before retry',
            'streaming',
          ),
        ),
        stateResponse(
          'retry_3',
          [userMessage('user-retry-1')],
          failedTurn(
            'turn-retry-1',
            'user-retry-1',
            'assistant-retry-1',
            'Draft before retry',
            'Provider failed',
          ),
        ),
        stateResponse(
          'retry_4',
          [userMessage('user-retry-1')],
          activeTurn('turn-retry-2', 'user-retry-1', 'assistant-retry-1', '', 'submitted'),
        ),
      ],
    )
  })
})
