import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'

import { describe, expect, it } from 'vitest'

import {
  RuntimeProtocolSession,
  RuntimeProtocolSessionError,
  createRuntimeProtocolSession,
} from './protocol-session'

class FakeRuntimeProcess extends EventEmitter {
  readonly stdin = new PassThrough()
  readonly stdout = new PassThrough()
  readonly stderr = new PassThrough()
  killCount = 0
  endCount = 0

  constructor() {
    super()

    this.stdin.on('finish', () => {
      this.endCount += 1
    })
  }

  kill(_signal?: NodeJS.Signals | number) {
    this.killCount += 1
    return true
  }
}

function createSession(
  fakeProcess: FakeRuntimeProcess,
  options: Partial<ConstructorParameters<typeof RuntimeProtocolSession>[0]> = {},
) {
  return createRuntimeProtocolSession({
    runtimePath: '/fake/nyx-runtime',
    requestTimeoutMs: 1_000,
    spawnRuntimeProcess() {
      return fakeProcess
    },
    ...options,
  })
}

function makeStdinWritesThrow(fakeProcess: FakeRuntimeProcess, message: string) {
  fakeProcess.stdin.write = (() => {
    throw new Error(message)
  }) as typeof fakeProcess.stdin.write
}

describe('RuntimeProtocolSession', () => {
  it('spawns runtime protocol mode by default and correlates responses by id', async () => {
    const fakeProcess = new FakeRuntimeProcess()
    const spawnCalls: Array<{
      runtimePath: string
      runtimeArgs: ReadonlyArray<string>
      cwd: string | undefined
    }> = []

    const session = createRuntimeProtocolSession({
      runtimePath: '/fake/nyx-runtime',
      cwd: '/repo',
      requestTimeoutMs: 1_000,
      spawnRuntimeProcess(runtimePath, runtimeArgs, options) {
        spawnCalls.push({ runtimePath, runtimeArgs, cwd: options.cwd })
        return fakeProcess
      },
    })

    const firstResponse = session.request({ type: 'ping', id: 'req_1' })
    const secondResponse = session.request({ type: 'ping', id: 'req_2' })

    fakeProcess.stdout.write('{"type":"pong","id":"req_2"}\n')
    fakeProcess.stdout.write('{"type":"pong","id":"req_1"}\n')

    await expect(secondResponse).resolves.toEqual({ type: 'pong', id: 'req_2' })
    await expect(firstResponse).resolves.toEqual({ type: 'pong', id: 'req_1' })
    expect(spawnCalls).toEqual([
      {
        runtimePath: '/fake/nyx-runtime',
        runtimeArgs: ['protocol'],
        cwd: '/repo',
      },
    ])

    session.close()
  })

  it('handles protocol response lines split across stdout chunks', async () => {
    const fakeProcess = new FakeRuntimeProcess()
    const session = createSession(fakeProcess)
    const response = session.request({ type: 'ping', id: 'req_split' })

    fakeProcess.stdout.write('{"type":"pong",')
    fakeProcess.stdout.write('"id":"req_split"}\n')

    await expect(response).resolves.toEqual({ type: 'pong', id: 'req_split' })

    session.close()
  })

  it('rejects pending requests and kills the runtime on invalid protocol JSON', async () => {
    const fakeProcess = new FakeRuntimeProcess()
    const session = createSession(fakeProcess)
    const response = session.request({ type: 'ping', id: 'req_invalid_json' })

    fakeProcess.stdout.write('{invalid json}\n')

    await expect(response).rejects.toBeInstanceOf(RuntimeProtocolSessionError)
    await expect(response).rejects.toMatchObject({
      code: 'protocol_error',
      message: 'Nyx runtime wrote invalid protocol JSON.',
    })
    expect(fakeProcess.killCount).toBe(1)
  })

  it('rejects pending requests and kills the runtime on unexpected response ids', async () => {
    const fakeProcess = new FakeRuntimeProcess()
    const session = createSession(fakeProcess)
    const response = session.request({ type: 'ping', id: 'req_expected' })

    fakeProcess.stdout.write('{"type":"pong","id":"req_unexpected"}\n')

    await expect(response).rejects.toMatchObject({
      code: 'protocol_error',
      message: 'Nyx runtime protocol response id did not match a pending request.',
      requestId: 'req_unexpected',
    })
    expect(fakeProcess.killCount).toBe(1)
  })

  it('rejects pending requests when the runtime exits', async () => {
    const fakeProcess = new FakeRuntimeProcess()
    const session = createSession(fakeProcess)
    const response = session.request({ type: 'ping', id: 'req_exit' })

    fakeProcess.stderr.write('runtime failed\n')
    fakeProcess.emit('close', 7, null)

    await expect(response).rejects.toMatchObject({
      code: 'runtime_exit',
      stderr: 'runtime failed',
      exitCode: 7,
      signal: null,
    })
  })

  it('kills the runtime and rejects pending requests on timeout', async () => {
    const fakeProcess = new FakeRuntimeProcess()
    const session = createSession(fakeProcess, { requestTimeoutMs: 1 })
    const response = session.request({ type: 'ping', id: 'req_timeout' })

    await expect(response).rejects.toMatchObject({
      code: 'timeout',
      requestId: 'req_timeout',
    })
    expect(fakeProcess.killCount).toBe(1)
  })

  it('kills the runtime and rejects pending requests on stdin errors', async () => {
    const fakeProcess = new FakeRuntimeProcess()
    const session = createSession(fakeProcess)
    const response = session.request({ type: 'ping', id: 'req_stdin_error' })

    fakeProcess.stdin.emit('error', new Error('stdin failed'))

    await expect(response).rejects.toMatchObject({
      code: 'stdin_failed',
      message: 'Nyx runtime protocol stdin failed.',
    })
    expect(fakeProcess.killCount).toBe(1)
  })

  it('closes the session when writing to stdin throws', async () => {
    const fakeProcess = new FakeRuntimeProcess()
    makeStdinWritesThrow(fakeProcess, 'stdin destroyed')

    const session = createSession(fakeProcess)
    const response = session.request({ type: 'ping', id: 'req_write_throw' })

    await expect(response).rejects.toMatchObject({
      code: 'stdin_failed',
      message: 'Failed to write request to Nyx runtime protocol session.',
      requestId: 'req_write_throw',
    })
    expect(fakeProcess.killCount).toBe(1)
    await expect(
      session.request({ type: 'ping', id: 'req_after_write_throw' }),
    ).rejects.toMatchObject({
      code: 'stdin_failed',
      requestId: 'req_write_throw',
    })
  })

  it('rejects pending requests and closes the runtime process on close', async () => {
    const fakeProcess = new FakeRuntimeProcess()
    const session = createSession(fakeProcess)
    const response = session.request({ type: 'ping', id: 'req_close' })
    const stdinFinished = new Promise<void>((resolve) => {
      fakeProcess.stdin.once('finish', resolve)
    })

    session.close()

    await expect(response).rejects.toMatchObject({
      code: 'closed',
      message: 'Nyx runtime protocol session is closed.',
    })
    await stdinFinished
    expect(fakeProcess.endCount).toBe(1)
    expect(fakeProcess.killCount).toBe(1)
  })

  it('rejects new requests after a process error closes the session', async () => {
    const fakeProcess = new FakeRuntimeProcess()
    const session = createSession(fakeProcess)

    fakeProcess.emit('error', new Error('spawn failed'))

    await expect(session.request({ type: 'ping', id: 'req_after_error' })).rejects.toMatchObject({
      code: 'spawn_failed',
      message: 'Failed to spawn Nyx runtime protocol session.',
    })
  })
})
