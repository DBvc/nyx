import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { pingNyxRuntimeOnce } from './ping'

const repoRoot = fileURLToPath(new URL('../../../../..', import.meta.url))
const runtimeDir = join(repoRoot, 'runtime', 'ocaml')
const runtimePath = join(runtimeDir, '_build', 'install', 'default', 'bin', 'nyx-runtime')
const integrationIt = process.env.NYX_RUNTIME_INTEGRATION === '1' ? it : it.skip

function buildRuntimeInstallBinary() {
  execFileSync('opam', ['exec', '--', 'dune', 'build', '@install'], {
    cwd: runtimeDir,
    stdio: 'inherit',
  })
}

describe('nyx runtime integration', () => {
  integrationIt('pings the real OCaml runtime over the Electron main stdio helper', async () => {
    const requestId = 'req_desktop_runtime_integration'

    buildRuntimeInstallBinary()

    expect(existsSync(runtimePath)).toBe(true)
    await expect(
      pingNyxRuntimeOnce({
        runtimePath,
        requestId,
        timeoutMs: 5_000,
      }),
    ).resolves.toEqual({ requestId })
  })
})
