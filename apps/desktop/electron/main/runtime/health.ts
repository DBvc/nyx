import {
  resolveNyxRuntimePath,
  type NyxRuntimePathSource,
  type NyxRuntimePathUnavailableReason,
  type ResolveNyxRuntimePathOptions,
} from './path'
import {
  NyxRuntimePingError,
  type NyxRuntimePingErrorCode,
  type PingNyxRuntimeOptions,
  type PingNyxRuntimeResult,
  pingNyxRuntimeOnce,
} from './ping'

export type NyxRuntimeHealthErrorCode = NyxRuntimePingErrorCode | 'unknown'

export interface NyxRuntimeHealthSuccess {
  status: 'success'
  source: NyxRuntimePathSource
  runtimePath: string
  requestId: string
}

export interface NyxRuntimeHealthUnavailable {
  status: 'unavailable'
  reason: NyxRuntimePathUnavailableReason
  checkedPaths: ReadonlyArray<string>
}

export interface NyxRuntimeHealthError {
  status: 'error'
  source: NyxRuntimePathSource
  runtimePath: string
  code: NyxRuntimeHealthErrorCode
  message: string
  stderr?: string
  exitCode?: number | null
  signal?: NodeJS.Signals | null
}

export type NyxRuntimeHealthResult =
  | NyxRuntimeHealthSuccess
  | NyxRuntimeHealthUnavailable
  | NyxRuntimeHealthError

type ResolveRuntimePath = (
  options?: ResolveNyxRuntimePathOptions,
) => ReturnType<typeof resolveNyxRuntimePath>
type PingRuntimeOnce = (options: PingNyxRuntimeOptions) => Promise<PingNyxRuntimeResult>

export interface CheckNyxRuntimeHealthOptions {
  path?: ResolveNyxRuntimePathOptions
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
  source: NyxRuntimePathSource
  runtimePath: string
  error: unknown
}): NyxRuntimeHealthError {
  if (error instanceof NyxRuntimePingError) {
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

export async function checkNyxRuntimeHealth({
  path,
  requestId,
  timeoutMs,
  resolveRuntimePath = resolveNyxRuntimePath,
  pingRuntimeOnce = pingNyxRuntimeOnce,
}: CheckNyxRuntimeHealthOptions = {}): Promise<NyxRuntimeHealthResult> {
  const pathResolution = resolveRuntimePath(path)

  if (pathResolution.status === 'unavailable') {
    return {
      status: 'unavailable',
      reason: pathResolution.reason,
      checkedPaths: pathResolution.checkedPaths,
    }
  }

  try {
    const pingOptions: PingNyxRuntimeOptions = {
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
