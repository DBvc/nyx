import { join, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { resolveRuntimePath } from './path'

function existingOnly(...paths: ReadonlyArray<string>) {
  const existingPaths = new Set(paths)

  return (runtimePath: string) => existingPaths.has(runtimePath)
}

describe('resolveRuntimePath', () => {
  it('uses only the bundled runtime path in packaged mode', () => {
    const resourcesPath = '/Nyx.app/Contents/Resources'
    const runtimePath = join(resourcesPath, 'runtime', 'nyx-runtime')
    const envRuntimePath = resolve('/opt/nyx/bin/nyx-runtime')
    const repoRuntimePath = join(
      '/repo',
      'runtime',
      'ocaml',
      '_build',
      'install',
      'default',
      'bin',
      'nyx-runtime',
    )
    const probedPaths: string[] = []

    const resolution = resolveRuntimePath({
      env: {
        NYX_RUNTIME_PATH: envRuntimePath,
      },
      isPackaged: true,
      resourcesPath,
      repoRoot: '/repo',
      fileExists(path) {
        probedPaths.push(path)
        return path === runtimePath || path === envRuntimePath || path === repoRuntimePath
      },
    })

    expect(resolution).toEqual({
      status: 'available',
      source: 'packaged',
      runtimePath,
    })
    expect(probedPaths).toEqual([runtimePath])
  })

  it('fails closed when the bundled runtime is missing in packaged mode', () => {
    const resourcesPath = '/Nyx.app/Contents/Resources'
    const runtimePath = join(resourcesPath, 'runtime', 'nyx-runtime')
    const probedPaths: string[] = []

    const resolution = resolveRuntimePath({
      env: {
        NYX_RUNTIME_PATH: resolve('/opt/nyx/bin/nyx-runtime'),
      },
      isPackaged: true,
      resourcesPath,
      repoRoot: '/repo',
      fileExists(path) {
        probedPaths.push(path)
        return false
      },
    })

    expect(resolution).toEqual({
      status: 'unavailable',
      reason: 'packaged_runtime_missing',
      checkedPaths: [runtimePath],
    })
    expect(probedPaths).toEqual([runtimePath])
  })

  it('prefers a configured NYX_RUNTIME_PATH when the file exists', () => {
    const runtimePath = resolve('/opt/nyx/bin/nyx-runtime')

    expect(
      resolveRuntimePath({
        env: {
          NYX_RUNTIME_PATH: ` ${runtimePath} `,
        },
        fileExists: existingOnly(runtimePath),
      }),
    ).toEqual({
      status: 'available',
      source: 'env',
      runtimePath,
    })
  })

  it('reports an unavailable configured path without falling back', () => {
    const runtimePath = resolve('/missing/nyx-runtime')
    const probedPaths: string[] = []

    const resolution = resolveRuntimePath({
      env: {
        NYX_RUNTIME_PATH: runtimePath,
      },
      repoRoot: '/repo',
      fileExists(path) {
        probedPaths.push(path)
        return false
      },
    })

    expect(resolution).toEqual({
      status: 'unavailable',
      reason: 'configured_path_missing',
      checkedPaths: [runtimePath],
    })
    expect(probedPaths).toEqual([runtimePath])
  })

  it('uses the repo development fallback when NYX_RUNTIME_PATH is absent', () => {
    const repoRoot = '/repo'
    const runtimePath = join(
      repoRoot,
      'runtime',
      'ocaml',
      '_build',
      'install',
      'default',
      'bin',
      'nyx-runtime',
    )

    expect(
      resolveRuntimePath({
        env: {},
        repoRoot,
        fileExists: existingOnly(runtimePath),
      }),
    ).toEqual({
      status: 'available',
      source: 'repo-dev-fallback',
      runtimePath,
    })
  })

  it('finds the repo development fallback from an apps/desktop cwd', () => {
    const repoRoot = '/repo'
    const runtimePath = join(
      repoRoot,
      'runtime',
      'ocaml',
      '_build',
      'install',
      'default',
      'bin',
      'nyx-runtime',
    )

    expect(
      resolveRuntimePath({
        env: {},
        cwd: join(repoRoot, 'apps', 'desktop'),
        fileExists: existingOnly(runtimePath),
      }),
    ).toEqual({
      status: 'available',
      source: 'repo-dev-fallback',
      runtimePath,
    })
  })

  it('treats a blank NYX_RUNTIME_PATH as absent', () => {
    const repoRoot = '/repo'
    const runtimePath = join(
      repoRoot,
      'runtime',
      'ocaml',
      '_build',
      'install',
      'default',
      'bin',
      'nyx-runtime',
    )

    expect(
      resolveRuntimePath({
        env: {
          NYX_RUNTIME_PATH: '   ',
        },
        repoRoot,
        fileExists: existingOnly(runtimePath),
      }),
    ).toEqual({
      status: 'available',
      source: 'repo-dev-fallback',
      runtimePath,
    })
  })

  it('reports unavailable when no configured path or repo fallback exists', () => {
    const repoRoot = '/repo'
    const runtimePath = join(
      repoRoot,
      'runtime',
      'ocaml',
      '_build',
      'install',
      'default',
      'bin',
      'nyx-runtime',
    )

    expect(
      resolveRuntimePath({
        env: {},
        repoRoot,
        fileExists: () => false,
      }),
    ).toEqual({
      status: 'unavailable',
      reason: 'repo_dev_fallback_missing',
      checkedPaths: [runtimePath],
    })
  })
})
