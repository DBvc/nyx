import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const NYX_RUNTIME_PATH_ENV = 'NYX_RUNTIME_PATH' as const

export type NyxRuntimePathSource = 'env' | 'repo-dev-fallback'
export type NyxRuntimePathUnavailableReason =
  | 'configured_path_missing'
  | 'repo_dev_fallback_missing'

export interface NyxRuntimePathAvailable {
  status: 'available'
  source: NyxRuntimePathSource
  runtimePath: string
}

export interface NyxRuntimePathUnavailable {
  status: 'unavailable'
  reason: NyxRuntimePathUnavailableReason
  checkedPaths: ReadonlyArray<string>
}

export type NyxRuntimePathResolution = NyxRuntimePathAvailable | NyxRuntimePathUnavailable

interface RuntimePathEnv {
  NYX_RUNTIME_PATH?: string
  [key: string]: string | undefined
}

export interface ResolveNyxRuntimePathOptions {
  env?: RuntimePathEnv
  repoRoot?: string
  cwd?: string
  fileExists?: (runtimePath: string) => boolean
}

function defaultRepoRoot() {
  return fileURLToPath(new URL('../../../../../', import.meta.url))
}

function uniquePaths(paths: ReadonlyArray<string>) {
  return [...new Set(paths)]
}

function repoRootCandidates(cwd: string) {
  return uniquePaths([cwd, resolve(cwd, '..', '..'), defaultRepoRoot()])
}

function repoDevFallbackPath(repoRoot: string) {
  return join(repoRoot, 'runtime', 'ocaml', '_build', 'install', 'default', 'bin', 'nyx-runtime')
}

function normalizeExplicitPath(runtimePath: string) {
  return resolve(runtimePath)
}

export function resolveNyxRuntimePath({
  env = process.env,
  repoRoot,
  cwd = process.cwd(),
  fileExists = existsSync,
}: ResolveNyxRuntimePathOptions = {}): NyxRuntimePathResolution {
  const configuredRuntimePath = env.NYX_RUNTIME_PATH?.trim()

  if (configuredRuntimePath) {
    const runtimePath = normalizeExplicitPath(configuredRuntimePath)

    if (fileExists(runtimePath)) {
      return {
        status: 'available',
        source: 'env',
        runtimePath,
      }
    }

    return {
      status: 'unavailable',
      reason: 'configured_path_missing',
      checkedPaths: [runtimePath],
    }
  }

  const repoRoots = repoRoot === undefined ? repoRootCandidates(cwd) : [repoRoot]
  const checkedPaths: string[] = []

  for (const candidateRoot of repoRoots) {
    const runtimePath = repoDevFallbackPath(candidateRoot)
    checkedPaths.push(runtimePath)

    if (fileExists(runtimePath)) {
      return {
        status: 'available',
        source: 'repo-dev-fallback',
        runtimePath,
      }
    }
  }

  return {
    status: 'unavailable',
    reason: 'repo_dev_fallback_missing',
    checkedPaths,
  }
}
