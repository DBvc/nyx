import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'

export type RuntimePingErrorCode =
  | 'spawn_failed'
  | 'stdin_failed'
  | 'runtime_exit'
  | 'protocol_error'
  | 'timeout'

interface RuntimePingErrorDetails {
  code: RuntimePingErrorCode
  message: string
  cause?: unknown
  stderr?: string
  exitCode?: number | null
  signal?: NodeJS.Signals | null
}

export class RuntimePingError extends Error {
  readonly code: RuntimePingErrorCode
  readonly stderr?: string
  readonly exitCode?: number | null
  readonly signal?: NodeJS.Signals | null

  constructor({ code, message, cause, stderr, exitCode, signal }: RuntimePingErrorDetails) {
    super(message, cause === undefined ? undefined : { cause })
    this.name = 'RuntimePingError'
    this.code = code

    if (stderr !== undefined) {
      this.stderr = stderr
    }

    if (exitCode !== undefined) {
      this.exitCode = exitCode
    }

    if (signal !== undefined) {
      this.signal = signal
    }
  }
}

type RuntimeErrorListener = (error: Error) => void
type RuntimeCloseListener = (exitCode: number | null, signal: NodeJS.Signals | null) => void
type RuntimeDataListener = (chunk: Buffer | string) => void

interface RuntimePingWritable {
  once(event: 'error', listener: RuntimeErrorListener): unknown
  off(event: 'error', listener: RuntimeErrorListener): unknown
  end(chunk: string): unknown
}

interface RuntimePingReadable {
  on(event: 'data', listener: RuntimeDataListener): unknown
  off(event: 'data', listener: RuntimeDataListener): unknown
}

interface RuntimePingProcess {
  stdin: RuntimePingWritable
  stdout: RuntimePingReadable
  stderr: RuntimePingReadable
  kill(signal?: NodeJS.Signals | number): boolean
  once(event: 'error', listener: RuntimeErrorListener): unknown
  once(event: 'close', listener: RuntimeCloseListener): unknown
  off(event: 'error', listener: RuntimeErrorListener): unknown
  off(event: 'close', listener: RuntimeCloseListener): unknown
}

type SpawnRuntimeProcess = (
  runtimePath: string,
  runtimeArgs: ReadonlyArray<string>,
  options: { cwd?: string },
) => RuntimePingProcess

export interface PingRuntimeOptions {
  runtimePath: string
  runtimeArgs?: ReadonlyArray<string>
  cwd?: string
  requestId?: string
  timeoutMs?: number
  spawnRuntimeProcess?: SpawnRuntimeProcess
}

export interface PingRuntimeResult {
  requestId: string
}

interface RuntimePongPayload {
  type?: unknown
  id?: unknown
}

const DEFAULT_RUNTIME_ARGS = ['protocol'] as const
const DEFAULT_TIMEOUT_MS = 5_000

function spawnRuntimeProcess(
  runtimePath: string,
  runtimeArgs: ReadonlyArray<string>,
  options: { cwd?: string },
) {
  const spawnOptions = options.cwd === undefined ? {} : { cwd: options.cwd }

  return spawn(runtimePath, [...runtimeArgs], {
    ...spawnOptions,
  })
}

function firstStdoutLine(stdout: string) {
  return stdout
    .replaceAll('\r\n', '\n')
    .split('\n')
    .find((line) => line.length > 0)
}

function parsePong(stdout: string, requestId: string) {
  const line = firstStdoutLine(stdout)

  if (!line) {
    throw new RuntimePingError({
      code: 'protocol_error',
      message: 'Nyx runtime did not write a protocol response.',
    })
  }

  let payload: RuntimePongPayload

  try {
    payload = JSON.parse(line) as RuntimePongPayload
  } catch (error) {
    throw new RuntimePingError({
      code: 'protocol_error',
      message: 'Nyx runtime wrote invalid protocol JSON.',
      cause: error,
    })
  }

  if (payload.type !== 'pong') {
    throw new RuntimePingError({
      code: 'protocol_error',
      message: 'Nyx runtime response was not a pong.',
    })
  }

  if (payload.id !== requestId) {
    throw new RuntimePingError({
      code: 'protocol_error',
      message: 'Nyx runtime pong id did not match the ping id.',
    })
  }
}

export function pingRuntimeOnce({
  runtimePath,
  runtimeArgs = DEFAULT_RUNTIME_ARGS,
  cwd,
  requestId = `req_${randomUUID()}`,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  spawnRuntimeProcess: spawnRuntime = spawnRuntimeProcess,
}: PingRuntimeOptions): Promise<PingRuntimeResult> {
  return new Promise((resolve, reject) => {
    const spawnOptions = cwd === undefined ? {} : { cwd }
    const runtimeProcess = spawnRuntime(runtimePath, runtimeArgs, spawnOptions)
    const requestLine = `${JSON.stringify({ type: 'ping', id: requestId })}\n`
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

    function settleWithError(error: RuntimePingError) {
      if (settled) {
        return
      }

      settled = true
      cleanup()
      reject(error)
    }

    function settleWithSuccess() {
      if (settled) {
        return
      }

      settled = true
      cleanup()
      resolve({ requestId })
    }

    function onStdoutData(chunk: Buffer | string) {
      stdout += chunk.toString()
    }

    function onStderrData(chunk: Buffer | string) {
      stderr += chunk.toString()
    }

    function onStdinError(error: Error) {
      settleWithError(
        new RuntimePingError({
          code: 'stdin_failed',
          message: 'Failed to write ping request to Nyx runtime.',
          cause: error,
        }),
      )
    }

    function onProcessError(error: Error) {
      settleWithError(
        new RuntimePingError({
          code: 'spawn_failed',
          message: 'Failed to spawn Nyx runtime.',
          cause: error,
        }),
      )
    }

    function onProcessClose(exitCode: number | null, signal: NodeJS.Signals | null) {
      if (settled) {
        return
      }

      if (exitCode !== 0) {
        settleWithError(
          new RuntimePingError({
            code: 'runtime_exit',
            message: 'Nyx runtime exited before returning a successful pong.',
            stderr: stderr.trim(),
            exitCode,
            signal,
          }),
        )
        return
      }

      try {
        parsePong(stdout, requestId)
      } catch (error) {
        if (error instanceof RuntimePingError) {
          settleWithError(error)
          return
        }

        settleWithError(
          new RuntimePingError({
            code: 'protocol_error',
            message: 'Nyx runtime response could not be validated.',
            cause: error,
          }),
        )
        return
      }

      settleWithSuccess()
    }

    timeout = setTimeout(() => {
      const didSignalRuntime = runtimeProcess.kill()

      settleWithError(
        new RuntimePingError({
          code: 'timeout',
          message: didSignalRuntime
            ? 'Timed out waiting for Nyx runtime pong.'
            : 'Timed out waiting for Nyx runtime pong; runtime process was already stopped.',
        }),
      )
    }, timeoutMs)

    runtimeProcess.stdin.once('error', onStdinError)
    runtimeProcess.stdout.on('data', onStdoutData)
    runtimeProcess.stderr.on('data', onStderrData)
    runtimeProcess.once('error', onProcessError)
    runtimeProcess.once('close', onProcessClose)

    runtimeProcess.stdin.end(requestLine)
  })
}
