import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'

import { describe, expect, it } from 'vitest'

import { RuntimePingError, pingRuntimeOnce } from './ping'

class FakeRuntimeProcess extends EventEmitter {
  readonly stdin = new PassThrough()
  readonly stdout = new PassThrough()
  readonly stderr = new PassThrough()
  killCount = 0

  kill(_signal?: NodeJS.Signals | number) {
    this.killCount += 1
    return true
  }
}

function runNodeRuntime(script: string, requestId = 'req_test') {
  return pingRuntimeOnce({
    runtimePath: process.execPath,
    runtimeArgs: ['-e', script],
    requestId,
    timeoutMs: 1_000,
  })
}

const echoPongScript = `
let stdin = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => {
  stdin += chunk
})
process.stdin.on('end', () => {
  const request = JSON.parse(stdin.trim())
  process.stdout.write(JSON.stringify({ type: 'pong', id: request.id }) + '\\n')
})
`

const mismatchedPongScript = `
process.stdin.resume()
process.stdin.on('end', () => {
  process.stdout.write(JSON.stringify({ type: 'pong', id: 'wrong_id' }) + '\\n')
})
`

const failingRuntimeScript = `
process.stdin.resume()
process.stdin.on('end', () => {
  process.stderr.write('runtime failed\\n')
  process.exit(7)
})
`

describe('pingRuntimeOnce', () => {
  it('spawns runtime protocol mode by default and validates a matching pong', async () => {
    const fakeProcess = new FakeRuntimeProcess()
    const spawnCalls: Array<{
      runtimePath: string
      runtimeArgs: ReadonlyArray<string>
      cwd: string | undefined
    }> = []
    const ping = pingRuntimeOnce({
      runtimePath: '/fake/nyx-runtime',
      requestId: 'req_1',
      spawnRuntimeProcess(runtimePath, runtimeArgs, options) {
        spawnCalls.push({ runtimePath, runtimeArgs, cwd: options.cwd })
        return fakeProcess
      },
    })

    fakeProcess.stdout.write('{"type":"pong","id":"req_1"}\n')
    fakeProcess.emit('close', 0, null)

    await expect(ping).resolves.toEqual({ requestId: 'req_1' })
    expect(spawnCalls).toEqual([
      {
        runtimePath: '/fake/nyx-runtime',
        runtimeArgs: ['protocol'],
        cwd: undefined,
      },
    ])
  })

  it('writes a ping line, closes stdin, and accepts a real child process pong', async () => {
    await expect(runNodeRuntime(echoPongScript, 'req_2')).resolves.toEqual({
      requestId: 'req_2',
    })
  })

  it('rejects a pong with a mismatched id', async () => {
    await expect(runNodeRuntime(mismatchedPongScript, 'req_3')).rejects.toMatchObject({
      code: 'protocol_error',
      message: 'Nyx runtime pong id did not match the ping id.',
    })
  })

  it('captures stderr when the runtime exits nonzero', async () => {
    await expect(runNodeRuntime(failingRuntimeScript, 'req_4')).rejects.toMatchObject({
      code: 'runtime_exit',
      stderr: 'runtime failed',
      exitCode: 7,
    })
  })

  it('kills the runtime process on timeout', async () => {
    const fakeProcess = new FakeRuntimeProcess()

    const ping = pingRuntimeOnce({
      runtimePath: '/fake/nyx-runtime',
      requestId: 'req_timeout',
      timeoutMs: 1,
      spawnRuntimeProcess() {
        return fakeProcess
      },
    })

    await expect(ping).rejects.toBeInstanceOf(RuntimePingError)
    await expect(ping).rejects.toMatchObject({
      code: 'timeout',
    })
    expect(fakeProcess.killCount).toBe(1)
  })
})
