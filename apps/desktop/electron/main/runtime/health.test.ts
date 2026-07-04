import { describe, expect, it } from 'vitest'

import { checkNyxRuntimeHealth } from './health'
import { NyxRuntimePingError, type PingNyxRuntimeOptions } from './ping'

describe('checkNyxRuntimeHealth', () => {
  it('returns unavailable without pinging when the runtime path cannot be resolved', async () => {
    let pingCount = 0

    await expect(
      checkNyxRuntimeHealth({
        resolveRuntimePath() {
          return {
            status: 'unavailable',
            reason: 'repo_dev_fallback_missing',
            checkedPaths: ['/repo/runtime/ocaml/_build/install/default/bin/nyx-runtime'],
          }
        },
        pingRuntimeOnce() {
          pingCount += 1
          return Promise.resolve({ requestId: 'req_should_not_run' })
        },
      }),
    ).resolves.toEqual({
      status: 'unavailable',
      reason: 'repo_dev_fallback_missing',
      checkedPaths: ['/repo/runtime/ocaml/_build/install/default/bin/nyx-runtime'],
    })
    expect(pingCount).toBe(0)
  })

  it('pings the resolved runtime executable and returns success', async () => {
    const pingCalls: PingNyxRuntimeOptions[] = []

    await expect(
      checkNyxRuntimeHealth({
        requestId: 'req_health',
        timeoutMs: 250,
        resolveRuntimePath() {
          return {
            status: 'available',
            source: 'repo-dev-fallback',
            runtimePath: '/repo/runtime/ocaml/_build/install/default/bin/nyx-runtime',
          }
        },
        async pingRuntimeOnce(options) {
          pingCalls.push(options)
          return { requestId: 'req_health' }
        },
      }),
    ).resolves.toEqual({
      status: 'success',
      source: 'repo-dev-fallback',
      runtimePath: '/repo/runtime/ocaml/_build/install/default/bin/nyx-runtime',
      requestId: 'req_health',
    })
    expect(pingCalls).toEqual([
      {
        runtimePath: '/repo/runtime/ocaml/_build/install/default/bin/nyx-runtime',
        requestId: 'req_health',
        timeoutMs: 250,
      },
    ])
  })

  it('normalizes ping failures into an internal health error result', async () => {
    await expect(
      checkNyxRuntimeHealth({
        resolveRuntimePath() {
          return {
            status: 'available',
            source: 'env',
            runtimePath: '/opt/nyx/bin/nyx-runtime',
          }
        },
        async pingRuntimeOnce() {
          throw new NyxRuntimePingError({
            code: 'runtime_exit',
            message: 'Nyx runtime exited before returning a successful pong.',
            stderr: 'runtime failed',
            exitCode: 7,
            signal: null,
          })
        },
      }),
    ).resolves.toEqual({
      status: 'error',
      source: 'env',
      runtimePath: '/opt/nyx/bin/nyx-runtime',
      code: 'runtime_exit',
      message: 'Nyx runtime exited before returning a successful pong.',
      stderr: 'runtime failed',
      exitCode: 7,
      signal: null,
    })
  })

  it('normalizes unexpected failures without exposing a raw thrown value', async () => {
    await expect(
      checkNyxRuntimeHealth({
        resolveRuntimePath() {
          return {
            status: 'available',
            source: 'env',
            runtimePath: '/opt/nyx/bin/nyx-runtime',
          }
        },
        async pingRuntimeOnce() {
          throw new Error('unexpected failure')
        },
      }),
    ).resolves.toEqual({
      status: 'error',
      source: 'env',
      runtimePath: '/opt/nyx/bin/nyx-runtime',
      code: 'unknown',
      message: 'unexpected failure',
    })
  })
})
