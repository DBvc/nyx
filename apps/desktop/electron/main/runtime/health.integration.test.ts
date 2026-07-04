import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { checkNyxRuntimeHealth } from './health'

const repoRoot = fileURLToPath(new URL('../../../../..', import.meta.url))
const artifactPath = join(repoRoot, 'apps', 'desktop', '.runtime-artifacts', 'nyx-runtime')
const missingFallbackRoot = join(repoRoot, '.missing-runtime-artifact-health-fallback')
const integrationIt = process.env.NYX_RUNTIME_ARTIFACT_HEALTH === '1' ? it : it.skip

function configuredRuntimeArtifactPath() {
  const configuredRuntimePath = process.env.NYX_RUNTIME_PATH

  if (!configuredRuntimePath) {
    throw new Error('NYX_RUNTIME_PATH must point at the generated runtime artifact.')
  }

  return resolve(configuredRuntimePath)
}

describe('nyx runtime artifact health integration', () => {
  integrationIt('checks health through the explicit NYX_RUNTIME_PATH artifact', async () => {
    const runtimePath = configuredRuntimeArtifactPath()
    const requestId = 'req_runtime_artifact_health'

    expect(runtimePath).toBe(artifactPath)
    expect(existsSync(runtimePath)).toBe(true)

    await expect(
      checkNyxRuntimeHealth({
        requestId,
        timeoutMs: 5_000,
        path: {
          repoRoot: missingFallbackRoot,
        },
      }),
    ).resolves.toEqual({
      status: 'success',
      source: 'env',
      runtimePath,
      requestId,
    })
  })
})
