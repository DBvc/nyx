import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { createRuntimeProtocolSession } from './protocol-session'

const repoRoot = fileURLToPath(new URL('../../../../..', import.meta.url))
const artifactPath = join(repoRoot, 'apps', 'desktop', '.runtime-artifacts', 'nyx-runtime')
const integrationIt = process.env.NYX_RUNTIME_PROTOCOL_SESSION === '1' ? it : it.skip

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

describe('nyx runtime protocol session integration', () => {
  integrationIt('handles multiple ping requests through one runtime protocol process', async () => {
    const session = createRuntimeProtocolSession({
      runtimePath: checkedRuntimeArtifactPath(),
      requestTimeoutMs: 5_000,
    })

    try {
      await expect(
        session.request({ type: 'ping', id: 'req_protocol_session_1' }),
      ).resolves.toEqual({
        type: 'pong',
        id: 'req_protocol_session_1',
      })
      await expect(
        session.request({ type: 'ping', id: 'req_protocol_session_2' }),
      ).resolves.toEqual({
        type: 'pong',
        id: 'req_protocol_session_2',
      })
      await expect(
        session.request({ type: 'ping', id: 'req_protocol_session_3' }),
      ).resolves.toEqual({
        type: 'pong',
        id: 'req_protocol_session_3',
      })
    } finally {
      session.close()
    }
  })
})
