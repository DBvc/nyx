import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { createCurrentThreadFileAdapter, type CurrentThreadFileAdapter } from './file-adapter'
import {
  createSafeThreadErrorRecordV1,
  createSafeThreadErrorRecordV2,
  parseCurrentThreadRecordV1,
  parseCurrentThreadRecordV2,
  upgradeCurrentThreadRecordForMutation,
  type CurrentThreadRecordV1,
  type CurrentThreadRecordV2,
} from './schemas'
import { CurrentThreadStore, CurrentThreadStoreError } from './store'

const tempDirs: string[] = []

async function createTempFilePath() {
  const dir = await mkdtemp(join(tmpdir(), 'nyx-current-thread-'))
  tempDirs.push(dir)
  return join(dir, 'threads', 'current-thread.json')
}

function createStore(
  filePath: string,
  options: {
    now?: () => string
    fileAdapter?: CurrentThreadFileAdapter
  } = {},
) {
  return new CurrentThreadStore({
    filePath,
    generateId: () => 'thread-1',
    now: options.now ?? (() => '2026-07-11T00:00:00.000Z'),
    ...(options.fileAdapter ? { fileAdapter: options.fileAdapter } : {}),
  })
}

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

function pendingRecord(overrides: Partial<CurrentThreadRecordV2> = {}) {
  return parseCurrentThreadRecordV2({
    version: 2,
    threadId: 'thread-1',
    turns: [
      {
        attemptRequestId: 'request-1',
        userMessageId: 'user-1',
        assistantMessageId: 'assistant-1',
        userContent: 'Hello',
        assistantContent: '',
        assistantStatus: 'pending',
        error: null,
        targetBinding: {
          selection: targetSelection,
          attribution: null,
        },
        createdAt: '2026-07-10T00:00:00.000Z',
        updatedAt: '2026-07-10T00:00:00.000Z',
      },
    ],
    createdAt: '2026-07-10T00:00:00.000Z',
    updatedAt: '2026-07-10T00:00:00.000Z',
    ...overrides,
  })
}

function pendingRecordV1(overrides: Partial<CurrentThreadRecordV1> = {}) {
  return parseCurrentThreadRecordV1({
    version: 1,
    threadId: 'thread-1',
    turns: [
      {
        attemptRequestId: 'request-1',
        userMessageId: 'user-1',
        assistantMessageId: 'assistant-1',
        userContent: 'Hello',
        assistantContent: '',
        assistantStatus: 'pending',
        error: null,
        createdAt: '2026-07-10T00:00:00.000Z',
        updatedAt: '2026-07-10T00:00:00.000Z',
      },
    ],
    createdAt: '2026-07-10T00:00:00.000Z',
    updatedAt: '2026-07-10T00:00:00.000Z',
    ...overrides,
  })
}

function completedRecord(requestId: string, content: string) {
  const record = bindRecord(pendingRecord())

  return completeRecord(record, requestId, content)
}

function bindRecord(record: CurrentThreadRecordV2) {
  const latestTurnIndex = record.turns.length - 1

  return parseCurrentThreadRecordV2({
    ...record,
    turns: record.turns.map((turn, index) =>
      index === latestTurnIndex
        ? {
            ...turn,
            targetBinding: {
              selection: targetSelection,
              attribution: targetAttribution,
            },
            updatedAt: record.updatedAt,
          }
        : turn,
    ),
    updatedAt: record.updatedAt,
  })
}

function completeRecord(record: CurrentThreadRecordV2, requestId: string, content: string) {
  return parseCurrentThreadRecordV2({
    ...record,
    turns: [
      {
        ...record.turns[0]!,
        attemptRequestId: requestId,
        assistantContent: content,
        assistantStatus: 'completed',
        updatedAt: '2026-07-11T00:00:00.000Z',
      },
    ],
    updatedAt: '2026-07-11T00:00:00.000Z',
  })
}

function completedRecordV1(requestId: string, content: string) {
  const record = pendingRecordV1()

  return parseCurrentThreadRecordV1({
    ...record,
    turns: [
      {
        ...record.turns[0]!,
        attemptRequestId: requestId,
        assistantContent: content,
        assistantStatus: 'completed',
        updatedAt: '2026-07-11T00:00:00.000Z',
      },
    ],
    updatedAt: '2026-07-11T00:00:00.000Z',
  })
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })))
})

describe('CurrentThreadStore', () => {
  it('treats a missing file as no current thread without creating it', async () => {
    const filePath = await createTempFilePath()
    const store = createStore(filePath)

    await expect(store.read()).resolves.toBeNull()
    await expect(stat(filePath)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('creates a main-owned thread id and keeps message ids stable across retry attempts', async () => {
    const filePath = await createTempFilePath()
    const store = createStore(filePath)
    const created = await store.create({
      attemptRequestId: 'request-1',
      userMessageId: 'user-1',
      assistantMessageId: 'assistant-1',
      userContent: 'Hello',
      targetSelection,
    })
    const bound = bindRecord(created)
    await store.write(bound)
    const failed = parseCurrentThreadRecordV2({
      ...bound,
      turns: [
        {
          ...bound.turns[0]!,
          assistantStatus: 'failed',
          error: createSafeThreadErrorRecordV2({
            code: 'network_error',
            retryable: true,
          }),
        },
      ],
    })

    await store.write(failed)
    await store.write({
      ...failed,
      turns: [
        {
          ...failed.turns[0]!,
          attemptRequestId: 'request-2',
          assistantContent: '',
          assistantStatus: 'pending',
          error: null,
          targetBinding: {
            selection: targetSelection,
            attribution: null,
          },
        },
      ],
    })

    await expect(store.read()).resolves.toMatchObject({
      threadId: 'thread-1',
      turns: [
        {
          attemptRequestId: 'request-2',
          userMessageId: 'user-1',
          assistantMessageId: 'assistant-1',
        },
      ],
    })
  })

  it('normalizes a persisted pending turn to a durable interrupted failure on first load', async () => {
    const filePath = await createTempFilePath()
    const adapter = createCurrentThreadFileAdapter()
    await adapter.ensureParentDirectory(filePath)
    await writeFile(filePath, `${JSON.stringify(pendingRecordV1())}\n`, 'utf8')
    const store = createStore(filePath, { now: () => '2026-07-11T01:00:00.000Z' })

    await expect(store.read()).resolves.toMatchObject({
      version: 2,
      updatedAt: '2026-07-11T01:00:00.000Z',
      turns: [
        {
          attemptRequestId: 'request-1',
          assistantContent: '',
          assistantStatus: 'failed',
          error: {
            code: 'unknown',
            message: 'The previous response was interrupted before it finished.',
            retryable: true,
          },
          targetBinding: null,
          updatedAt: '2026-07-11T01:00:00.000Z',
        },
      ],
    })

    expect(JSON.parse(await readFile(filePath, 'utf8'))).toMatchObject({
      version: 2,
      turns: [{ assistantStatus: 'failed', targetBinding: null }],
    })
  })

  it('reads a stable version-1 record without rewriting it', async () => {
    const filePath = await createTempFilePath()
    const adapter = createCurrentThreadFileAdapter()
    const record = completedRecordV1('request-1', 'Done')
    const contents = `${JSON.stringify(record, null, 2)}\n`
    await adapter.ensureParentDirectory(filePath)
    await writeFile(filePath, contents, 'utf8')

    await expect(createStore(filePath).read()).resolves.toEqual(record)
    await expect(readFile(filePath, 'utf8')).resolves.toBe(contents)
  })

  it('rejects a pure version-1 to version-2 rewrite without a real mutation', async () => {
    const filePath = await createTempFilePath()
    const adapter = createCurrentThreadFileAdapter()
    const record = completedRecordV1('request-1', 'Done')
    const contents = `${JSON.stringify(record, null, 2)}\n`
    await adapter.ensureParentDirectory(filePath)
    await writeFile(filePath, contents, 'utf8')
    const store = createStore(filePath)
    const loaded = await store.read()

    await expect(store.write(upgradeCurrentThreadRecordForMutation(loaded!))).rejects.toMatchObject(
      { code: 'invalid_transition' },
    )
    await expect(readFile(filePath, 'utf8')).resolves.toBe(contents)
  })

  it('does not reinterpret a pending turn created by the live store as interrupted', async () => {
    const store = createStore(await createTempFilePath())

    await store.create({
      attemptRequestId: 'request-1',
      userMessageId: 'user-1',
      assistantMessageId: 'assistant-1',
      userContent: 'Hello',
      targetSelection,
    })

    await expect(store.read()).resolves.toMatchObject({
      turns: [{ assistantStatus: 'pending', error: null }],
    })
  })

  it('rejects ordinary terminal settlement before target attribution is bound', async () => {
    const store = createStore(await createTempFilePath())
    const created = await store.create({
      attemptRequestId: 'request-1',
      userMessageId: 'user-1',
      assistantMessageId: 'assistant-1',
      userContent: 'Hello',
      targetSelection,
    })
    const cancelled = parseCurrentThreadRecordV2({
      ...created,
      turns: [{ ...created.turns[0]!, assistantStatus: 'cancelled' }],
    })
    const failed = parseCurrentThreadRecordV2({
      ...created,
      turns: [
        {
          ...created.turns[0]!,
          assistantStatus: 'failed',
          error: createSafeThreadErrorRecordV2({ code: 'network_error', retryable: true }),
        },
      ],
    })

    for (const terminalRecord of [
      completeRecord(created, 'request-1', 'Done'),
      cancelled,
      failed,
    ]) {
      await expect(store.write(terminalRecord)).rejects.toMatchObject({
        code: 'invalid_transition',
      } satisfies Partial<CurrentThreadStoreError>)
    }

    await expect(store.read()).resolves.toEqual(created)
  })

  it('settles only retryable target-resolution failure before attribution is bound', async () => {
    const store = createStore(await createTempFilePath())
    const created = await store.create({
      attemptRequestId: 'request-1',
      userMessageId: 'user-1',
      assistantMessageId: 'assistant-1',
      userContent: 'Hello',
      targetSelection,
    })
    const nonRetryable = parseCurrentThreadRecordV2({
      ...created,
      turns: [
        {
          ...created.turns[0]!,
          assistantStatus: 'failed',
          error: createSafeThreadErrorRecordV2({
            code: 'target_unavailable',
            retryable: false,
          }),
        },
      ],
    })
    const resolutionFailed = parseCurrentThreadRecordV2({
      ...nonRetryable,
      turns: [
        {
          ...nonRetryable.turns[0]!,
          error: createSafeThreadErrorRecordV2({
            code: 'target_unavailable',
            retryable: true,
          }),
        },
      ],
    })
    const resolutionFailedWithContent = parseCurrentThreadRecordV2({
      ...resolutionFailed,
      turns: [{ ...resolutionFailed.turns[0]!, assistantContent: 'Unexpected content' }],
    })

    await expect(store.write(nonRetryable)).rejects.toMatchObject({
      code: 'invalid_transition',
    } satisfies Partial<CurrentThreadStoreError>)
    await expect(store.write(resolutionFailedWithContent)).rejects.toMatchObject({
      code: 'invalid_transition',
    } satisfies Partial<CurrentThreadStoreError>)
    await expect(store.write(resolutionFailed)).resolves.toEqual(resolutionFailed)
  })

  it('rejects replacement of an existing thread or message identity', async () => {
    const store = createStore(await createTempFilePath())
    const created = await store.create({
      attemptRequestId: 'request-1',
      userMessageId: 'user-1',
      assistantMessageId: 'assistant-1',
      userContent: 'Hello',
      targetSelection,
    })

    await expect(store.write({ ...created, threadId: 'replacement-thread' })).rejects.toMatchObject(
      {
        code: 'identity_mismatch',
      } satisfies Partial<CurrentThreadStoreError>,
    )
    await expect(
      store.write({
        ...created,
        turns: [{ ...created.turns[0]!, assistantMessageId: 'replacement-assistant' }],
      }),
    ).rejects.toMatchObject({
      code: 'identity_mismatch',
    } satisfies Partial<CurrentThreadStoreError>)
    await expect(store.read()).resolves.toEqual(created)
  })

  it('requires create to establish the initial main-owned thread identity', async () => {
    const filePath = await createTempFilePath()
    const store = createStore(filePath)

    await expect(store.write(pendingRecord())).rejects.toMatchObject({
      code: 'thread_missing',
    } satisfies Partial<CurrentThreadStoreError>)
    await expect(stat(filePath)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('rejects mutation of terminal history and retry without a new request id', async () => {
    const store = createStore(await createTempFilePath())
    const created = await store.create({
      attemptRequestId: 'request-1',
      userMessageId: 'user-1',
      assistantMessageId: 'assistant-1',
      userContent: 'Hello',
      targetSelection,
    })
    const bound = bindRecord(created)
    await store.write(bound)
    const completed = completeRecord(bound, 'request-1', 'Done')
    await store.write(completed)

    await expect(
      store.write(completeRecord(completed, 'request-1', 'Rewritten')),
    ).rejects.toMatchObject({
      code: 'invalid_transition',
    } satisfies Partial<CurrentThreadStoreError>)
    await expect(
      store.write({ ...completed, updatedAt: '2099-01-01T00:00:00.000Z' }),
    ).rejects.toMatchObject({
      code: 'invalid_transition',
    } satisfies Partial<CurrentThreadStoreError>)

    await store.reset()
    const retriedStore = createStore(await createTempFilePath())
    const retryCreated = await retriedStore.create({
      attemptRequestId: 'request-1',
      userMessageId: 'user-1',
      assistantMessageId: 'assistant-1',
      userContent: 'Hello',
      targetSelection,
    })
    const retryBound = bindRecord(retryCreated)
    await retriedStore.write(retryBound)
    const failed = parseCurrentThreadRecordV2({
      ...retryBound,
      turns: [
        {
          ...retryBound.turns[0]!,
          assistantStatus: 'failed',
          error: createSafeThreadErrorRecordV2({ code: 'unknown', retryable: true }),
        },
      ],
    })
    await retriedStore.write(failed)

    await expect(
      retriedStore.write({
        ...failed,
        turns: [
          {
            ...failed.turns[0]!,
            assistantStatus: 'pending',
            assistantContent: '',
            error: null,
          },
        ],
      }),
    ).rejects.toMatchObject({
      code: 'invalid_transition',
    } satisfies Partial<CurrentThreadStoreError>)
  })

  it('keeps earlier terminal turns immutable after another turn is appended', async () => {
    const store = createStore(await createTempFilePath())
    const created = await store.create({
      attemptRequestId: 'request-1',
      userMessageId: 'user-1',
      assistantMessageId: 'assistant-1',
      userContent: 'First',
      targetSelection,
    })
    const firstBound = bindRecord(created)
    await store.write(firstBound)
    const firstCompleted = completeRecord(firstBound, 'request-1', 'First answer')
    await store.write(firstCompleted)
    const secondPending = parseCurrentThreadRecordV2({
      ...firstCompleted,
      turns: [
        ...firstCompleted.turns,
        {
          attemptRequestId: 'request-2',
          userMessageId: 'user-2',
          assistantMessageId: 'assistant-2',
          userContent: 'Second',
          assistantContent: '',
          assistantStatus: 'pending',
          error: null,
          targetBinding: {
            selection: targetSelection,
            attribution: null,
          },
          createdAt: '2026-07-11T01:00:00.000Z',
          updatedAt: '2026-07-11T01:00:00.000Z',
        },
      ],
      updatedAt: '2026-07-11T01:00:00.000Z',
    })
    await store.write(secondPending)
    const secondBound = bindRecord(secondPending)
    await store.write(secondBound)
    const secondCompleted = parseCurrentThreadRecordV2({
      ...secondBound,
      turns: [
        secondBound.turns[0]!,
        {
          ...secondBound.turns[1]!,
          assistantContent: 'Second answer',
          assistantStatus: 'completed',
          updatedAt: '2026-07-11T02:00:00.000Z',
        },
      ],
      updatedAt: '2026-07-11T02:00:00.000Z',
    })
    await store.write(secondCompleted)

    await expect(
      store.write({
        ...secondCompleted,
        turns: [
          { ...secondCompleted.turns[0]!, assistantContent: 'Rewritten first answer' },
          secondCompleted.turns[1]!,
        ],
      }),
    ).rejects.toMatchObject({
      code: 'invalid_transition',
    } satisfies Partial<CurrentThreadStoreError>)
  })

  it('fails closed on malformed JSON without overwriting it', async () => {
    const filePath = await createTempFilePath()
    const adapter = createCurrentThreadFileAdapter()
    await adapter.ensureParentDirectory(filePath)
    await writeFile(filePath, '{not-json', 'utf8')
    const store = createStore(filePath)

    await expect(store.read()).rejects.toMatchObject({
      code: 'malformed_json',
    } satisfies Partial<CurrentThreadStoreError>)
    await expect(store.write(completedRecord('request-1', 'Done'))).rejects.toMatchObject({
      code: 'malformed_json',
    } satisfies Partial<CurrentThreadStoreError>)
    await expect(readFile(filePath, 'utf8')).resolves.toBe('{not-json')
  })

  it('fails closed on schema-invalid JSON without overwriting it', async () => {
    const filePath = await createTempFilePath()
    const adapter = createCurrentThreadFileAdapter()
    const invalidJson = JSON.stringify({ version: 1, threadId: 'thread-1', turns: [] })
    await adapter.ensureParentDirectory(filePath)
    await writeFile(filePath, invalidJson, 'utf8')
    const store = createStore(filePath)

    await expect(store.read()).rejects.toMatchObject({
      code: 'schema_invalid',
    } satisfies Partial<CurrentThreadStoreError>)
    await expect(store.write(completedRecord('request-1', 'Done'))).rejects.toMatchObject({
      code: 'schema_invalid',
    } satisfies Partial<CurrentThreadStoreError>)
    await expect(readFile(filePath, 'utf8')).resolves.toBe(invalidJson)
  })

  it('leaves an unknown future record untouched until explicit reset', async () => {
    const filePath = await createTempFilePath()
    const adapter = createCurrentThreadFileAdapter()
    const unknownRecord = `${JSON.stringify({ version: 99, future: true })}\n`
    await adapter.ensureParentDirectory(filePath)
    await writeFile(filePath, unknownRecord, 'utf8')
    const store = createStore(filePath)

    await expect(store.read()).rejects.toMatchObject({ code: 'schema_invalid' })
    await expect(readFile(filePath, 'utf8')).resolves.toBe(unknownRecord)

    await store.reset()
    await expect(stat(filePath)).rejects.toMatchObject({ code: 'ENOENT' })
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
      attemptRequestId: 'request-0',
      userMessageId: 'user-1',
      assistantMessageId: 'assistant-1',
      userContent: 'Hello',
      targetSelection,
    })
    const bound = bindRecord(created)
    await store.write(bound)
    const failed = parseCurrentThreadRecordV2({
      ...bound,
      turns: [
        {
          ...bound.turns[0]!,
          assistantStatus: 'failed',
          error: createSafeThreadErrorRecordV2({ code: 'network_error', retryable: true }),
        },
      ],
    })
    const retried = parseCurrentThreadRecordV2({
      ...failed,
      turns: [
        {
          ...failed.turns[0]!,
          attemptRequestId: 'request-1',
          assistantStatus: 'pending',
          assistantContent: '',
          error: null,
          targetBinding: {
            selection: targetSelection,
            attribution: null,
          },
        },
      ],
    })
    await Promise.all([store.write(failed), store.write(retried)])

    expect(maximumActiveWrites).toBe(1)
    await expect(store.read()).resolves.toMatchObject({
      turns: [{ attemptRequestId: 'request-1', assistantStatus: 'pending' }],
    })
  })

  it('writes through a same-directory temp file with mode 0600 before rename', async () => {
    const filePath = await createTempFilePath()
    const baseAdapter = createCurrentThreadFileAdapter()
    const writes: Array<{ filePath: string; mode: number }> = []
    const renames: Array<{ sourcePath: string; destinationPath: string }> = []
    const adapter: CurrentThreadFileAdapter = {
      ...baseAdapter,
      createTempPath: (destinationPath) => `${destinationPath}.fixed.tmp`,
      writeText: async (targetPath, contents, mode) => {
        writes.push({ filePath: targetPath, mode })
        await baseAdapter.writeText(targetPath, contents, mode)
      },
      rename: async (sourcePath, destinationPath) => {
        renames.push({ sourcePath, destinationPath })
        await baseAdapter.rename(sourcePath, destinationPath)
      },
    }
    const store = createStore(filePath, { fileAdapter: adapter })

    await store.create({
      attemptRequestId: 'request-1',
      userMessageId: 'user-1',
      assistantMessageId: 'assistant-1',
      userContent: 'Hello',
      targetSelection,
    })

    expect(writes).toEqual([{ filePath: `${filePath}.fixed.tmp`, mode: 0o600 }])
    expect(renames).toEqual([{ sourcePath: `${filePath}.fixed.tmp`, destinationPath: filePath }])
    expect((await stat(filePath)).mode & 0o777).toBe(0o600)
  })

  it('preserves the previous record and recovers the queue when atomic rename fails', async () => {
    const filePath = await createTempFilePath()
    const tempPath = `${filePath}.fixed.tmp`
    const baseAdapter = createCurrentThreadFileAdapter()
    let failNextRename = false
    const adapter: CurrentThreadFileAdapter = {
      ...baseAdapter,
      createTempPath: () => tempPath,
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
    const completed = completeRecord(bound, 'request-1', 'Done')

    failNextRename = true
    await expect(store.write(completed)).rejects.toMatchObject({
      code: 'io_error',
    } satisfies Partial<CurrentThreadStoreError>)
    expect(JSON.parse(await readFile(filePath, 'utf8'))).toMatchObject({
      turns: [{ assistantStatus: 'pending' }],
    })
    await expect(stat(tempPath)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(store.read()).resolves.toEqual(bound)

    await store.write(completed)
    await expect(store.read()).resolves.toEqual(completed)
  })

  it('allows explicit reset to remove a malformed file', async () => {
    const filePath = await createTempFilePath()
    const adapter = createCurrentThreadFileAdapter()
    await adapter.ensureParentDirectory(filePath)
    await writeFile(filePath, '{not-json', 'utf8')
    const store = createStore(filePath)

    await expect(store.read()).rejects.toMatchObject({ code: 'malformed_json' })
    await store.reset()

    await expect(store.read()).resolves.toBeNull()
    await expect(stat(filePath)).rejects.toMatchObject({ code: 'ENOENT' })
  })
})

describe('CurrentThreadRecordV1 schema', () => {
  it('projects errors to fixed safe messages and rejects unsafe persisted content', () => {
    const record = completedRecordV1('request-1', '')
    const rawError = {
      code: 'unknown' as const,
      message: 'Authorization: Bearer secret',
      retryable: true,
      details: 'raw exception',
    }

    expect(createSafeThreadErrorRecordV1(rawError)).toEqual({
      code: 'unknown',
      message: 'The response failed unexpectedly.',
      retryable: true,
    })

    expect(() =>
      parseCurrentThreadRecordV1({
        ...record,
        Authorization: 'Bearer secret',
      }),
    ).toThrow()
    expect(() =>
      parseCurrentThreadRecordV1({
        ...record,
        turns: [
          {
            ...record.turns[0]!,
            assistantStatus: 'failed',
            error: {
              code: 'unknown',
              message: rawError.message,
              retryable: true,
            },
          },
        ],
      }),
    ).toThrow()
  })

  it('rejects duplicate message identities', () => {
    const first = completedRecordV1('request-1', 'First').turns[0]!

    expect(() =>
      parseCurrentThreadRecordV1({
        ...completedRecordV1('request-1', 'First'),
        turns: [
          first,
          {
            ...first,
            attemptRequestId: 'request-2',
          },
        ],
      }),
    ).toThrow()
  })

  it('rejects a pending turn before the final position', () => {
    const first = pendingRecordV1().turns[0]!

    expect(() =>
      parseCurrentThreadRecordV1({
        ...pendingRecordV1(),
        turns: [
          first,
          {
            ...first,
            attemptRequestId: 'request-2',
            userMessageId: 'user-2',
            assistantMessageId: 'assistant-2',
            assistantStatus: 'completed',
          },
        ],
      }),
    ).toThrow()
  })
})

describe('CurrentThreadRecordV2 schema', () => {
  it('keeps selection and resolved attribution identity aligned', () => {
    const record = pendingRecord()

    expect(() =>
      parseCurrentThreadRecordV2({
        ...record,
        turns: [
          {
            ...record.turns[0]!,
            targetBinding: {
              selection: targetSelection,
              attribution: {
                kind: 'connection',
                providerId: 'other-provider',
                providerDisplayName: 'Other Provider',
                modelId: 'other-model',
                modelDisplayName: 'Other Model',
              },
            },
          },
        ],
      }),
    ).toThrow()
  })

  it('persists target_unavailable with one fixed safe message', () => {
    expect(createSafeThreadErrorRecordV2({ code: 'target_unavailable', retryable: true })).toEqual({
      code: 'target_unavailable',
      message: 'The selected chat target is unavailable.',
      retryable: true,
    })
  })
})
