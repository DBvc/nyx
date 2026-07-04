import {
  resolveRuntimePath as resolveRuntimePathDefault,
  type RuntimePathSource,
  type RuntimePathUnavailableReason,
  type ResolveRuntimePathOptions,
} from './path'
import {
  RuntimePingError,
  type RuntimePingErrorCode,
  type PingRuntimeOptions,
  type PingRuntimeResult,
  pingRuntimeOnce as pingRuntimeOnceDefault,
} from './ping'

export type RuntimeHealthErrorCode = RuntimePingErrorCode | 'unknown'

export interface RuntimeHealthSuccess {
  status: 'success'
  source: RuntimePathSource
  runtimePath: string
  requestId: string
}

export interface RuntimeHealthUnavailable {
  status: 'unavailable'
  reason: RuntimePathUnavailableReason
  checkedPaths: ReadonlyArray<string>
}

export interface RuntimeHealthError {
  status: 'error'
  source: RuntimePathSource
  runtimePath: string
  code: RuntimeHealthErrorCode
  message: string
  stderr?: string
  exitCode?: number | null
  signal?: NodeJS.Signals | null
}

export type RuntimeHealthResult =
  | RuntimeHealthSuccess
  | RuntimeHealthUnavailable
  | RuntimeHealthError

type ResolveRuntimePath = (
  options?: ResolveRuntimePathOptions,
) => ReturnType<typeof resolveRuntimePathDefault>
type PingRuntimeOnce = (options: PingRuntimeOptions) => Promise<PingRuntimeResult>

export interface CheckRuntimeHealthOptions {
  path?: ResolveRuntimePathOptions
  requestId?: string
  timeoutMs?: number
  resolveRuntimePath?: ResolveRuntimePath
  pingRuntimeOnce?: PingRuntimeOnce
}

function messageFromUnknown(error: unknown) {
  return error instanceof Error ? error.message : 'Unknown Nyx runtime health error.'
}

function runtimeErrorResult({
  source,
  runtimePath,
  error,
}: {
  source: RuntimePathSource
  runtimePath: string
  error: unknown
}): RuntimeHealthError {
  if (error instanceof RuntimePingError) {
    return {
      status: 'error',
      source,
      runtimePath,
      code: error.code,
      message: error.message,
      ...(error.stderr === undefined ? {} : { stderr: error.stderr }),
      ...(error.exitCode === undefined ? {} : { exitCode: error.exitCode }),
      ...(error.signal === undefined ? {} : { signal: error.signal }),
    }
  }

  return {
    status: 'error',
    source,
    runtimePath,
    code: 'unknown',
    message: messageFromUnknown(error),
  }
}

export async function checkRuntimeHealth({
  path,
  requestId,
  timeoutMs,
  resolveRuntimePath = resolveRuntimePathDefault,
  pingRuntimeOnce = pingRuntimeOnceDefault,
}: CheckRuntimeHealthOptions = {}): Promise<RuntimeHealthResult> {
  const pathResolution = resolveRuntimePath(path)

  if (pathResolution.status === 'unavailable') {
    return {
      status: 'unavailable',
      reason: pathResolution.reason,
      checkedPaths: pathResolution.checkedPaths,
    }
  }

  try {
    const pingOptions: PingRuntimeOptions = {
      runtimePath: pathResolution.runtimePath,
    }

    if (requestId !== undefined) {
      pingOptions.requestId = requestId
    }

    if (timeoutMs !== undefined) {
      pingOptions.timeoutMs = timeoutMs
    }

    const pingResult = await pingRuntimeOnce(pingOptions)

    return {
      status: 'success',
      source: pathResolution.source,
      runtimePath: pathResolution.runtimePath,
      requestId: pingResult.requestId,
    }
  } catch (error) {
    return runtimeErrorResult({
      source: pathResolution.source,
      runtimePath: pathResolution.runtimePath,
      error,
    })
  }
}
