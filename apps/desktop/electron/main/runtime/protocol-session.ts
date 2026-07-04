import { spawn } from 'node:child_process'

export type RuntimeProtocolSessionErrorCode =
  | 'spawn_failed'
  | 'stdin_failed'
  | 'runtime_exit'
  | 'protocol_error'
  | 'timeout'
  | 'closed'

interface RuntimeProtocolSessionErrorDetails {
  code: RuntimeProtocolSessionErrorCode
  message: string
  cause?: unknown
  stderr?: string
  exitCode?: number | null
  signal?: NodeJS.Signals | null
  requestId?: string
}

export class RuntimeProtocolSessionError extends Error {
  readonly code: RuntimeProtocolSessionErrorCode
  readonly stderr?: string
  readonly exitCode?: number | null
  readonly signal?: NodeJS.Signals | null
  readonly requestId?: string

  constructor({
    code,
    message,
    cause,
    stderr,
    exitCode,
    signal,
    requestId,
  }: RuntimeProtocolSessionErrorDetails) {
    super(message, cause === undefined ? undefined : { cause })
    this.name = 'RuntimeProtocolSessionError'
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

    if (requestId !== undefined) {
      this.requestId = requestId
    }
  }
}

export interface RuntimeProtocolRequest {
  id: string
  [key: string]: unknown
}

export interface RuntimeProtocolResponse {
  id: string
  [key: string]: unknown
}

type RuntimeErrorListener = (error: Error) => void
type RuntimeCloseListener = (exitCode: number | null, signal: NodeJS.Signals | null) => void
type RuntimeDataListener = (chunk: Buffer | string) => void

interface RuntimeProtocolWritable {
  write(chunk: string): boolean
  end(): unknown
  once(event: 'error', listener: RuntimeErrorListener): unknown
  off(event: 'error', listener: RuntimeErrorListener): unknown
}

interface RuntimeProtocolReadable {
  on(event: 'data', listener: RuntimeDataListener): unknown
  off(event: 'data', listener: RuntimeDataListener): unknown
}

interface RuntimeProtocolProcess {
  stdin: RuntimeProtocolWritable
  stdout: RuntimeProtocolReadable
  stderr: RuntimeProtocolReadable
  kill(signal?: NodeJS.Signals | number): boolean
  once(event: 'error', listener: RuntimeErrorListener): unknown
  once(event: 'close', listener: RuntimeCloseListener): unknown
  off(event: 'error', listener: RuntimeErrorListener): unknown
  off(event: 'close', listener: RuntimeCloseListener): unknown
}

type SpawnRuntimeProtocolProcess = (
  runtimePath: string,
  runtimeArgs: ReadonlyArray<string>,
  options: { cwd?: string },
) => RuntimeProtocolProcess

export interface RuntimeProtocolSessionOptions {
  runtimePath: string
  runtimeArgs?: ReadonlyArray<string>
  cwd?: string
  requestTimeoutMs?: number
  spawnRuntimeProcess?: SpawnRuntimeProtocolProcess
}

export interface RuntimeProtocolRequestOptions {
  timeoutMs?: number
}

interface PendingRuntimeProtocolRequest {
  resolve: (response: RuntimeProtocolResponse) => void
  reject: (error: RuntimeProtocolSessionError) => void
  timeout: NodeJS.Timeout
}

const DEFAULT_RUNTIME_ARGS = ['protocol'] as const
const DEFAULT_REQUEST_TIMEOUT_MS = 5_000

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

function isProtocolObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseProtocolResponseLine(line: string): RuntimeProtocolResponse {
  let payload: unknown

  try {
    payload = JSON.parse(line)
  } catch (error) {
    throw new RuntimeProtocolSessionError({
      code: 'protocol_error',
      message: 'Nyx runtime wrote invalid protocol JSON.',
      cause: error,
    })
  }

  if (!isProtocolObject(payload)) {
    throw new RuntimeProtocolSessionError({
      code: 'protocol_error',
      message: 'Nyx runtime protocol response must be a JSON object.',
    })
  }

  if (typeof payload.id !== 'string' || payload.id.length === 0) {
    throw new RuntimeProtocolSessionError({
      code: 'protocol_error',
      message: 'Nyx runtime protocol response must include a non-empty string id.',
    })
  }

  return payload as RuntimeProtocolResponse
}

function validateProtocolRequest(request: RuntimeProtocolRequest) {
  if (typeof request.id !== 'string' || request.id.length === 0) {
    throw new RuntimeProtocolSessionError({
      code: 'protocol_error',
      message: 'Nyx runtime protocol requests must include a non-empty string id.',
    })
  }
}

function serializeProtocolRequest(request: RuntimeProtocolRequest) {
  try {
    return `${JSON.stringify(request)}\n`
  } catch (error) {
    throw new RuntimeProtocolSessionError({
      code: 'protocol_error',
      message: 'Nyx runtime protocol request could not be serialized.',
      cause: error,
      requestId: request.id,
    })
  }
}

export class RuntimeProtocolSession {
  private readonly runtimeProcess: RuntimeProtocolProcess
  private readonly requestTimeoutMs: number
  private readonly pendingRequests = new Map<string, PendingRuntimeProtocolRequest>()
  private stdoutBuffer = ''
  private stderr = ''
  private closed = false
  private sessionError: RuntimeProtocolSessionError | undefined

  constructor({
    runtimePath,
    runtimeArgs = DEFAULT_RUNTIME_ARGS,
    cwd,
    requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
    spawnRuntimeProcess: spawnRuntime = spawnRuntimeProcess,
  }: RuntimeProtocolSessionOptions) {
    const spawnOptions = cwd === undefined ? {} : { cwd }

    this.runtimeProcess = spawnRuntime(runtimePath, runtimeArgs, spawnOptions)
    this.requestTimeoutMs = requestTimeoutMs

    this.runtimeProcess.stdin.once('error', this.onStdinError)
    this.runtimeProcess.stdout.on('data', this.onStdoutData)
    this.runtimeProcess.stderr.on('data', this.onStderrData)
    this.runtimeProcess.once('error', this.onProcessError)
    this.runtimeProcess.once('close', this.onProcessClose)
  }

  request(
    request: RuntimeProtocolRequest,
    { timeoutMs = this.requestTimeoutMs }: RuntimeProtocolRequestOptions = {},
  ): Promise<RuntimeProtocolResponse> {
    if (this.closed) {
      return Promise.reject(this.sessionError ?? this.closedError())
    }

    try {
      validateProtocolRequest(request)
    } catch (error) {
      return Promise.reject(error)
    }

    if (this.pendingRequests.has(request.id)) {
      return Promise.reject(
        new RuntimeProtocolSessionError({
          code: 'protocol_error',
          message: 'Nyx runtime protocol request id is already pending.',
          requestId: request.id,
        }),
      )
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.failSession(
          new RuntimeProtocolSessionError({
            code: 'timeout',
            message: 'Timed out waiting for Nyx runtime protocol response.',
            requestId: request.id,
          }),
          true,
        )
      }, timeoutMs)

      this.pendingRequests.set(request.id, {
        resolve,
        reject,
        timeout,
      })

      let requestLine: string

      try {
        requestLine = serializeProtocolRequest(request)
      } catch (error) {
        this.rejectPendingRequest(request.id, this.protocolErrorFromUnknown(error))
        return
      }

      try {
        this.runtimeProcess.stdin.write(requestLine)
      } catch (error) {
        this.failSession(
          new RuntimeProtocolSessionError({
            code: 'stdin_failed',
            message: 'Failed to write request to Nyx runtime protocol session.',
            cause: error,
            requestId: request.id,
          }),
          true,
        )
      }
    })
  }

  close() {
    if (this.closed) {
      return
    }

    const error = this.closedError()

    this.closed = true
    this.sessionError = error
    this.cleanup()
    this.rejectPendingRequests(error)

    try {
      this.runtimeProcess.stdin.end()
    } catch {
      // The session is already closed from the caller's perspective.
    }

    this.runtimeProcess.kill()
  }

  private readonly onStdoutData = (chunk: Buffer | string) => {
    this.stdoutBuffer += chunk.toString()
    this.processBufferedStdout()
  }

  private readonly onStderrData = (chunk: Buffer | string) => {
    this.stderr += chunk.toString()
  }

  private readonly onStdinError = (error: Error) => {
    this.failSession(
      new RuntimeProtocolSessionError({
        code: 'stdin_failed',
        message: 'Nyx runtime protocol stdin failed.',
        cause: error,
      }),
      true,
    )
  }

  private readonly onProcessError = (error: Error) => {
    this.failSession(
      new RuntimeProtocolSessionError({
        code: 'spawn_failed',
        message: 'Failed to spawn Nyx runtime protocol session.',
        cause: error,
      }),
      false,
    )
  }

  private readonly onProcessClose = (exitCode: number | null, signal: NodeJS.Signals | null) => {
    this.failSession(
      new RuntimeProtocolSessionError({
        code: 'runtime_exit',
        message: 'Nyx runtime protocol session exited.',
        stderr: this.stderr.trim(),
        exitCode,
        signal,
      }),
      false,
    )
  }

  private processBufferedStdout() {
    let lineEndIndex = this.stdoutBuffer.indexOf('\n')

    while (lineEndIndex >= 0) {
      const rawLine = this.stdoutBuffer.slice(0, lineEndIndex)
      const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine

      this.stdoutBuffer = this.stdoutBuffer.slice(lineEndIndex + 1)

      if (line.length > 0) {
        this.handleProtocolResponseLine(line)
      }

      lineEndIndex = this.stdoutBuffer.indexOf('\n')
    }
  }

  private handleProtocolResponseLine(line: string) {
    if (this.closed) {
      return
    }

    let response: RuntimeProtocolResponse

    try {
      response = parseProtocolResponseLine(line)
    } catch (error) {
      this.failSession(this.protocolErrorFromUnknown(error), true)
      return
    }

    const pendingRequest = this.pendingRequests.get(response.id)

    if (!pendingRequest) {
      this.failSession(
        new RuntimeProtocolSessionError({
          code: 'protocol_error',
          message: 'Nyx runtime protocol response id did not match a pending request.',
          requestId: response.id,
        }),
        true,
      )
      return
    }

    clearTimeout(pendingRequest.timeout)
    this.pendingRequests.delete(response.id)
    pendingRequest.resolve(response)
  }

  private protocolErrorFromUnknown(error: unknown) {
    if (error instanceof RuntimeProtocolSessionError) {
      return error
    }

    return new RuntimeProtocolSessionError({
      code: 'protocol_error',
      message: 'Nyx runtime protocol response could not be validated.',
      cause: error,
    })
  }

  private rejectPendingRequest(requestId: string, error: RuntimeProtocolSessionError) {
    const pendingRequest = this.pendingRequests.get(requestId)

    if (!pendingRequest) {
      return
    }

    clearTimeout(pendingRequest.timeout)
    this.pendingRequests.delete(requestId)
    pendingRequest.reject(error)
  }

  private rejectPendingRequests(error: RuntimeProtocolSessionError) {
    for (const pendingRequest of this.pendingRequests.values()) {
      clearTimeout(pendingRequest.timeout)
      pendingRequest.reject(error)
    }

    this.pendingRequests.clear()
  }

  private failSession(error: RuntimeProtocolSessionError, shouldKillRuntime: boolean) {
    if (this.closed) {
      return
    }

    this.closed = true
    this.sessionError = error
    this.cleanup()
    this.rejectPendingRequests(error)

    if (shouldKillRuntime) {
      this.runtimeProcess.kill()
    }
  }

  private cleanup() {
    this.runtimeProcess.stdin.off('error', this.onStdinError)
    this.runtimeProcess.stdout.off('data', this.onStdoutData)
    this.runtimeProcess.stderr.off('data', this.onStderrData)
    this.runtimeProcess.off('error', this.onProcessError)
    this.runtimeProcess.off('close', this.onProcessClose)
  }

  private closedError() {
    return new RuntimeProtocolSessionError({
      code: 'closed',
      message: 'Nyx runtime protocol session is closed.',
    })
  }
}

export function createRuntimeProtocolSession(options: RuntimeProtocolSessionOptions) {
  return new RuntimeProtocolSession(options)
}
