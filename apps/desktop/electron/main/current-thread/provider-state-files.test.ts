import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import type { ResponsesContinuationStateV1 } from '../chat/provider-stream'
import { createCurrentThreadFileAdapter, type CurrentThreadFileAdapter } from './file-adapter'
import {
  CurrentThreadProviderStateFiles,
  CurrentThreadProviderStateFilesError,
} from './provider-state-files'
import { parseCurrentThreadRecord, type ProviderStateRef } from './schemas'

const tempDirs: string[] = []
const stateId = '00000000-0000-4000-8000-000000000020'
const executionIdentity = 'a'.repeat(64)
const timestamp = '2026-08-11T00:00:00.000Z'

function continuationState(): ResponsesContinuationStateV1 {
  return {
    version: 1,
    protocol: 'openai-responses',
    effectiveReasoningContext: null,
    outputItems: [
      {
        type: 'reasoning',
        encrypted_content: 'opaque-state',
        summary: [],
        content: [],
      },
      {
        type: 'message',
        role: 'assistant',
        status: 'completed',
        content: [{ type: 'output_text', text: 'Answer', annotations: [] }],
      },
    ],
  }
}

async function createFiles(fileAdapter?: CurrentThreadFileAdapter) {
  const directoryPath = await mkdtemp(join(tmpdir(), 'nyx-current-thread-provider-state-'))
  tempDirs.push(directoryPath)
  return {
    directoryPath,
    files: new CurrentThreadProviderStateFiles({
      directoryPath,
      generateId: () => stateId,
      ...(fileAdapter ? { fileAdapter } : {}),
    }),
  }
}

function recordWithRef(ref: ProviderStateRef) {
  return parseCurrentThreadRecord({
    version: 5,
    threadId: 'thread-1',
    turns: [
      {
        attemptRequestId: 'request-1',
        userMessageId: 'user-1',
        assistantMessageId: 'assistant-1',
        userContent: 'Question',
        imageRefs: [],
        documentRefs: [],
        assistantContent: 'Answer',
        assistantStatus: 'completed',
        error: null,
        targetBinding: {
          selection: { kind: 'connection', providerId: 'provider-1', modelId: 'model-1' },
          attribution: {
            kind: 'connection',
            providerId: 'provider-1',
            providerDisplayName: 'Provider One',
            modelId: 'model-1',
            modelDisplayName: 'Model One',
          },
        },
        providerStateRef: ref,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    createdAt: timestamp,
    updatedAt: timestamp,
  })
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('CurrentThreadProviderStateFiles', () => {
  it('prepares, verifies, commits, reads, reconciles, and resets one bounded sidecar', async () => {
    const { directoryPath, files } = await createFiles()
    const ref = await files.prepare(continuationState(), executionIdentity)
    const pendingPath = join(directoryPath, `${stateId}.pending`)
    const committedPath = join(directoryPath, `${stateId}.json`)

    expect(ref).toMatchObject({
      protocol: 'openai-responses',
      stateId,
      executionIdentity,
    })
    expect(ref.byteLength).toBeGreaterThan(0)
    expect(ref.sha256).toMatch(/^[0-9a-f]{64}$/u)
    expect((await stat(pendingPath)).mode & 0o777).toBe(0o600)
    await expect(stat(committedPath)).rejects.toMatchObject({ code: 'ENOENT' })

    await expect(files.commit(ref)).resolves.toEqual(ref)
    await expect(files.commit(ref)).resolves.toEqual(ref)
    await expect(files.read(ref)).resolves.toEqual(continuationState())
    await expect(stat(pendingPath)).rejects.toMatchObject({ code: 'ENOENT' })
    expect((await stat(committedPath)).mode & 0o777).toBe(0o600)

    const orphanPath = join(directoryPath, '00000000-0000-4000-8000-000000000099.json')
    const abandonedPendingPath = join(directoryPath, '00000000-0000-4000-8000-000000000098.pending')
    await writeFile(orphanPath, 'orphan', 'utf8')
    await writeFile(abandonedPendingPath, 'pending', 'utf8')
    await files.reconcile(recordWithRef(ref))
    await expect(stat(committedPath)).resolves.toBeDefined()
    await expect(stat(orphanPath)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(stat(abandonedPendingPath)).rejects.toMatchObject({ code: 'ENOENT' })

    await files.reset()
    await expect(stat(directoryPath)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('rejects unsupported, plaintext-reasoning, and over-capacity state before writing', async () => {
    const { directoryPath, files } = await createFiles()

    for (const state of [
      { ...continuationState(), future: true },
      {
        ...continuationState(),
        outputItems: [
          {
            type: 'reasoning',
            encrypted_content: 'opaque-state',
            summary: [{ type: 'summary_text', text: 'private reasoning' }],
          },
        ],
      },
      {
        ...continuationState(),
        outputItems: Array.from({ length: 65 }, () => continuationState().outputItems[1]),
      },
    ]) {
      await expect(files.prepare(state as never, executionIdentity)).rejects.toBeInstanceOf(
        CurrentThreadProviderStateFilesError,
      )
    }

    await expect(stat(join(directoryPath, `${stateId}.pending`))).rejects.toMatchObject({
      code: 'ENOENT',
    })
  })

  it('fails closed on missing or corrupt committed bytes and supports rollback', async () => {
    const { directoryPath, files } = await createFiles()
    const ref = await files.prepare(continuationState(), executionIdentity)

    await files.rollback(ref)
    await expect(files.read(ref)).rejects.toMatchObject({ code: 'unavailable' })

    const committedRef = await files.prepare(continuationState(), executionIdentity)
    await files.commit(committedRef)
    await writeFile(join(directoryPath, `${stateId}.json`), '{"changed":true}', 'utf8')
    await expect(files.read(committedRef)).rejects.toMatchObject({ code: 'unavailable' })
  })

  it('removes staged and final bytes when commit rename fails', async () => {
    const baseAdapter = createCurrentThreadFileAdapter()
    const adapter: CurrentThreadFileAdapter = {
      ...baseAdapter,
      rename: async () => {
        throw new Error('injected rename failure')
      },
    }
    const { directoryPath, files } = await createFiles(adapter)
    const ref = await files.prepare(continuationState(), executionIdentity)

    await expect(files.commit(ref)).rejects.toMatchObject({ code: 'io_error' })
    await expect(stat(join(directoryPath, `${stateId}.pending`))).rejects.toMatchObject({
      code: 'ENOENT',
    })
    await expect(stat(join(directoryPath, `${stateId}.json`))).rejects.toMatchObject({
      code: 'ENOENT',
    })
  })
})
