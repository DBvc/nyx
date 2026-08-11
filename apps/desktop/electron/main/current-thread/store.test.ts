import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { createCurrentThreadFileAdapter, type CurrentThreadFileAdapter } from './file-adapter'
import {
  createSafeThreadErrorRecord,
  parseCurrentThreadRecord,
  type CurrentThreadRecord,
  type ProviderStateRef,
} from './schemas'
import { CurrentThreadStore } from './store'

const tempDirs: string[] = []
const timestamp = '2026-08-11T00:00:00.000Z'
const targetSelection = {
  kind: 'connection',
  providerId: 'provider-1',
  modelId: 'model-1',
} as const
const targetAttribution = {
  kind: 'connection',
  providerId: 'provider-1',
  providerDisplayName: 'Provider One',
  modelId: 'model-1',
  modelDisplayName: 'Model One',
} as const
const imageRef = {
  imageId: '00000000-0000-4000-8000-000000000001',
  mediaType: 'image/png',
  width: 640,
  height: 480,
} as const
const documentRef = {
  documentId: '00000000-0000-4000-8000-000000000010',
  name: 'notes.txt',
  mediaType: 'text/plain',
  byteLength: 5,
  extractedByteLength: 5,
  sourceSha256: 'a'.repeat(64),
  extractedTextSha256: 'b'.repeat(64),
} as const

async function createTempFilePath() {
  const dir = await mkdtemp(join(tmpdir(), 'nyx-current-thread-'))
  tempDirs.push(dir)
  return join(dir, 'threads', 'current-thread.json')
}

async function writeRaw(filePath: string, contents: string) {
  await createCurrentThreadFileAdapter().ensureParentDirectory(filePath)
  await writeFile(filePath, contents, 'utf8')
}

function createStore(
  filePath: string,
  options: { now?: () => string; fileAdapter?: CurrentThreadFileAdapter } = {},
) {
  return new CurrentThreadStore({
    filePath,
    generateId: () => 'thread-1',
    now: options.now ?? (() => timestamp),
    ...(options.fileAdapter ? { fileAdapter: options.fileAdapter } : {}),
  })
}

function pendingRecord(): CurrentThreadRecord {
  return parseCurrentThreadRecord({
    version: 5,
    threadId: 'thread-1',
    turns: [
      {
        attemptRequestId: 'request-1',
        userMessageId: 'user-1',
        assistantMessageId: 'assistant-1',
        userContent: 'Hello',
        imageRefs: [],
        documentRefs: [],
        assistantContent: '',
        assistantStatus: 'pending',
        error: null,
        targetBinding: { selection: targetSelection, attribution: null },
        providerStateRef: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    createdAt: timestamp,
    updatedAt: timestamp,
  })
}

function bindRecord(record: CurrentThreadRecord) {
  return parseCurrentThreadRecord({
    ...record,
    turns: record.turns.map((turn, index) =>
      index === record.turns.length - 1
        ? {
            ...turn,
            targetBinding: { selection: targetSelection, attribution: targetAttribution },
          }
        : turn,
    ),
  })
}

function completeRecord(
  record: CurrentThreadRecord,
  content = 'Done',
  providerStateRef: ProviderStateRef | null = null,
) {
  return parseCurrentThreadRecord({
    ...record,
    turns: record.turns.map((turn, index) =>
      index === record.turns.length - 1
        ? {
            ...turn,
            assistantContent: content,
            assistantStatus: 'completed',
            providerStateRef,
          }
        : turn,
    ),
  })
}

function providerStateRef(
  stateId = '00000000-0000-4000-8000-000000000020',
  executionIdentity = 'c'.repeat(64),
): ProviderStateRef {
  return {
    protocol: 'openai-responses',
    stateId,
    executionIdentity,
    byteLength: 128,
    sha256: 'd'.repeat(64),
  }
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })))
})

describe('CurrentThreadStore', () => {
  it('treats a missing file as empty and creates one strict v5 record', async () => {
    const filePath = await createTempFilePath()
    const store = createStore(filePath)

    await expect(store.read()).resolves.toBeNull()
    const created = await store.create({
      attemptRequestId: 'request-1',
      userMessageId: 'user-1',
      assistantMessageId: 'assistant-1',
      userContent: '',
      imageRefs: [imageRef],
      documentRefs: [documentRef],
      targetSelection,
    })

    expect(created).toMatchObject({
      version: 5,
      threadId: 'thread-1',
      turns: [
        {
          imageRefs: [imageRef],
          documentRefs: [documentRef],
          assistantStatus: 'pending',
          providerStateRef: null,
        },
      ],
    })
    expect((await stat(filePath)).mode & 0o777).toBe(0o600)
  })

  it('recovers one persisted pending v5 turn without changing durable identity', async () => {
    const filePath = await createTempFilePath()
    const adapter = createCurrentThreadFileAdapter()
    const pending = pendingRecord()
    await adapter.ensureParentDirectory(filePath)
    await writeRaw(filePath, JSON.stringify(pending))

    const recovered = await createStore(filePath, {
      now: () => '2026-08-11T01:00:00.000Z',
    }).read()

    expect(recovered).toMatchObject({
      version: 5,
      threadId: pending.threadId,
      turns: [
        {
          userMessageId: 'user-1',
          assistantMessageId: 'assistant-1',
          assistantStatus: 'failed',
          providerStateRef: null,
          error: {
            code: 'unknown',
            message: 'The previous response was interrupted before it finished.',
            retryable: true,
          },
        },
      ],
    })
  })

  it('allows append, bind, settlement, and Retry while keeping prior terminal turns immutable', async () => {
    const store = createStore(await createTempFilePath())
    const created = await store.create({
      attemptRequestId: 'request-1',
      userMessageId: 'user-1',
      assistantMessageId: 'assistant-1',
      userContent: 'Hello',
      targetSelection,
    })
    const bound = await store.write(bindRecord(created))
    const completed = await store.write(completeRecord(bound))
    const appended = parseCurrentThreadRecord({
      ...completed,
      turns: [
        ...completed.turns,
        {
          attemptRequestId: 'request-2',
          userMessageId: 'user-2',
          assistantMessageId: 'assistant-2',
          userContent: 'Continue',
          imageRefs: [],
          documentRefs: [],
          assistantContent: '',
          assistantStatus: 'pending',
          error: null,
          targetBinding: { selection: targetSelection, attribution: null },
          providerStateRef: null,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ],
    })
    await store.write(appended)
    const secondBound = await store.write(bindRecord(appended))
    const failed = parseCurrentThreadRecord({
      ...secondBound,
      turns: secondBound.turns.map((turn, index) =>
        index === 1
          ? {
              ...turn,
              assistantStatus: 'failed',
              error: createSafeThreadErrorRecord({ code: 'network_error', retryable: true }),
            }
          : turn,
      ),
    })
    await store.write(failed)
    const retried = parseCurrentThreadRecord({
      ...failed,
      turns: failed.turns.map((turn, index) =>
        index === 1
          ? {
              ...turn,
              attemptRequestId: 'request-3',
              assistantContent: '',
              assistantStatus: 'pending',
              error: null,
              targetBinding: { selection: { kind: 'env_fallback' }, attribution: null },
              providerStateRef: null,
            }
          : turn,
      ),
    })

    await expect(store.write(retried)).resolves.toEqual(retried)
    expect((await store.read())!.turns[0]).toEqual(completed.turns[0])
  })

  it('rejects identity replacement and mutation of terminal history', async () => {
    const store = createStore(await createTempFilePath())
    const created = await store.create({
      attemptRequestId: 'request-1',
      userMessageId: 'user-1',
      assistantMessageId: 'assistant-1',
      userContent: 'Hello',
      targetSelection,
    })
    const bound = await store.write(bindRecord(created))
    const completed = await store.write(completeRecord(bound))

    await expect(
      store.write(parseCurrentThreadRecord({ ...completed, threadId: 'replacement' })),
    ).rejects.toMatchObject({ code: 'identity_mismatch' })
    await expect(
      store.write(
        parseCurrentThreadRecord({
          ...completed,
          turns: [{ ...completed.turns[0]!, assistantContent: 'Rewritten' }],
        }),
      ),
    ).rejects.toMatchObject({ code: 'invalid_transition' })
  })

  it.each([1, 2, 3, 4, 6, 99])(
    'rejects old or unknown current-thread version %s',
    async (version) => {
      const filePath = await createTempFilePath()
      const oldJson = JSON.stringify({ ...pendingRecord(), version })
      await writeRaw(filePath, oldJson)
      const store = createStore(filePath)

      await expect(store.read()).rejects.toMatchObject({ code: 'schema_invalid' })
      await expect(readFile(filePath, 'utf8')).resolves.toBe(oldJson)
    },
  )

  it('fails closed on malformed and schema-invalid JSON without overwriting it', async () => {
    for (const raw of ['{not-json', JSON.stringify({ ...pendingRecord(), turns: [] })]) {
      const filePath = await createTempFilePath()
      await writeRaw(filePath, raw)
      const store = createStore(filePath)

      await expect(store.read()).rejects.toMatchObject({
        code: raw.startsWith('{not') ? 'malformed_json' : 'schema_invalid',
      })
      await expect(readFile(filePath, 'utf8')).resolves.toBe(raw)
    }
  })

  it('serializes concurrent writes in call order', async () => {
    const filePath = await createTempFilePath()
    const baseAdapter = createCurrentThreadFileAdapter()
    let activeWrites = 0
    let maximumActiveWrites = 0
    const adapter: CurrentThreadFileAdapter = {
      ...baseAdapter,
      writeText: async (...arguments_) => {
        activeWrites += 1
        maximumActiveWrites = Math.max(maximumActiveWrites, activeWrites)
        await new Promise((resolve) => setTimeout(resolve, 5))
        try {
          await baseAdapter.writeText(...arguments_)
        } finally {
          activeWrites -= 1
        }
      },
    }
    const store = createStore(filePath, { fileAdapter: adapter })
    const created = await store.create({
      attemptRequestId: 'request-1',
      userMessageId: 'user-1',
      assistantMessageId: 'assistant-1',
      userContent: 'Hello',
      targetSelection,
    })
    const bound = bindRecord(created)
    await store.write(bound)
    const failed = parseCurrentThreadRecord({
      ...bound,
      turns: [
        {
          ...bound.turns[0]!,
          assistantStatus: 'failed',
          error: createSafeThreadErrorRecord({ code: 'network_error', retryable: true }),
        },
      ],
    })
    const retried = parseCurrentThreadRecord({
      ...failed,
      turns: [
        {
          ...failed.turns[0]!,
          attemptRequestId: 'request-2',
          assistantContent: '',
          assistantStatus: 'pending',
          error: null,
          targetBinding: { selection: targetSelection, attribution: null },
          providerStateRef: null,
        },
      ],
    })

    await Promise.all([store.write(failed), store.write(retried)])
    expect(maximumActiveWrites).toBe(1)
    await expect(store.read()).resolves.toMatchObject({
      turns: [{ attemptRequestId: 'request-2', assistantStatus: 'pending' }],
    })
  })

  it('writes through one same-directory 0600 temp and preserves the record on rename failure', async () => {
    const filePath = await createTempFilePath()
    const tempPath = `${filePath}.fixed.tmp`
    const baseAdapter = createCurrentThreadFileAdapter()
    let failNextRename = false
    const writes: Array<{ path: string; mode: number }> = []
    const adapter: CurrentThreadFileAdapter = {
      ...baseAdapter,
      createTempPath: () => tempPath,
      writeText: async (path, contents, mode) => {
        writes.push({ path, mode })
        await baseAdapter.writeText(path, contents, mode)
      },
      rename: async (...arguments_) => {
        if (failNextRename) {
          failNextRename = false
          throw new Error('injected rename failure')
        }
        await baseAdapter.rename(...arguments_)
      },
    }
    const store = createStore(filePath, { fileAdapter: adapter })
    const created = await store.create({
      attemptRequestId: 'request-1',
      userMessageId: 'user-1',
      assistantMessageId: 'assistant-1',
      userContent: 'Hello',
      targetSelection,
    })
    const bound = bindRecord(created)
    await store.write(bound)
    const completed = completeRecord(bound)

    failNextRename = true
    await expect(store.write(completed)).rejects.toMatchObject({ code: 'io_error' })
    expect(JSON.parse(await readFile(filePath, 'utf8'))).toMatchObject({
      turns: [{ assistantStatus: 'pending' }],
    })
    await expect(stat(tempPath)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(store.read()).resolves.toEqual(bound)
    expect(writes.every((write) => write.mode === 0o600)).toBe(true)
  })

  it('clears every same-identity provider ref without changing visible content', async () => {
    const filePath = await createTempFilePath()
    const identityA = 'a'.repeat(64)
    const identityB = 'b'.repeat(64)
    const first = completeRecord(
      bindRecord(pendingRecord()),
      'Answer 1',
      providerStateRef('00000000-0000-4000-8000-000000000020', identityA),
    )
    const record = parseCurrentThreadRecord({
      ...first,
      turns: [
        first.turns[0]!,
        {
          ...first.turns[0]!,
          attemptRequestId: 'request-2',
          userMessageId: 'user-2',
          assistantMessageId: 'assistant-2',
          userContent: 'Question 2',
          assistantContent: 'Answer 2',
          providerStateRef: providerStateRef('00000000-0000-4000-8000-000000000021', identityA),
        },
        {
          ...first.turns[0]!,
          attemptRequestId: 'request-3',
          userMessageId: 'user-3',
          assistantMessageId: 'assistant-3',
          userContent: 'Question 3',
          assistantContent: 'Answer 3',
          providerStateRef: providerStateRef('00000000-0000-4000-8000-000000000022', identityB),
        },
      ],
    })
    await writeRaw(filePath, JSON.stringify(record))
    const store = createStore(filePath)

    await expect(store.repairProviderStateRefs(identityA)).resolves.toMatchObject({
      clearedCount: 2,
      record: {
        turns: [
          { assistantContent: 'Answer 1', providerStateRef: null },
          { assistantContent: 'Answer 2', providerStateRef: null },
          { assistantContent: 'Answer 3', providerStateRef: { executionIdentity: identityB } },
        ],
      },
    })
  })

  it('allows explicit reset to remove an unreadable record', async () => {
    const filePath = await createTempFilePath()
    await writeRaw(filePath, '{not-json')
    const store = createStore(filePath)

    await expect(store.read()).rejects.toMatchObject({ code: 'malformed_json' })
    await store.reset()
    await expect(store.read()).resolves.toBeNull()
  })
})

describe('CurrentThreadRecord v5 schema', () => {
  it('accepts provider state only on a completed resolved connection turn', () => {
    const ref = providerStateRef()
    expect(
      completeRecord(bindRecord(pendingRecord()), 'Done', ref).turns[0]!.providerStateRef,
    ).toEqual(ref)

    for (const invalid of [
      { ...pendingRecord().turns[0]!, providerStateRef: ref },
      {
        ...completeRecord(bindRecord(pendingRecord())).turns[0]!,
        assistantStatus: 'cancelled',
        providerStateRef: ref,
      },
      {
        ...completeRecord(bindRecord(pendingRecord())).turns[0]!,
        targetBinding: {
          selection: { kind: 'env_fallback' },
          attribution: { kind: 'env_fallback', modelId: 'env-model' },
        },
        providerStateRef: ref,
      },
    ]) {
      expect(() => parseCurrentThreadRecord({ ...pendingRecord(), turns: [invalid] })).toThrow()
    }
  })

  it('rejects unsafe errors, empty turns, duplicate ids, and unknown fields', () => {
    const base = pendingRecord()
    expect(() =>
      parseCurrentThreadRecord({
        ...base,
        turns: [
          {
            ...base.turns[0]!,
            assistantStatus: 'failed',
            error: { code: 'unknown', message: 'Authorization: Bearer secret', retryable: true },
          },
        ],
      }),
    ).toThrow()
    expect(() =>
      parseCurrentThreadRecord({
        ...base,
        turns: [{ ...base.turns[0]!, userContent: '', imageRefs: [], documentRefs: [] }],
      }),
    ).toThrow()
    expect(() =>
      parseCurrentThreadRecord({
        ...base,
        turns: [base.turns[0]!, { ...base.turns[0]!, assistantStatus: 'completed' }],
      }),
    ).toThrow()
    expect(() => parseCurrentThreadRecord({ ...base, future: true })).toThrow()
  })
})
