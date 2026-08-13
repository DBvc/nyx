import { EventEmitter } from 'node:events'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ImportedV5Rows, ThreadLibraryOperationInput, ThreadLibraryRequest } from './protocol'

const workerMock = vi.hoisted(() => ({
  instances: [] as unknown[],
  maxActive: 0,
}))

vi.mock('node:worker_threads', async () => {
  const { EventEmitter } = await import('node:events')

  class FakeWorker extends EventEmitter {
    readonly posts: ThreadLibraryRequest[] = []
    readonly specifier: URL
    readonly options: { name?: string }
    exited = false
    throwOnPost = false

    constructor(specifier: URL, options: { name?: string }) {
      super()
      this.specifier = specifier
      this.options = options
      workerMock.instances.push(this)
      workerMock.maxActive = Math.max(
        workerMock.maxActive,
        (workerMock.instances as FakeWorker[]).filter((worker) => !worker.exited).length,
      )
    }

    postMessage(message: ThreadLibraryRequest) {
      if (this.throwOnPost) {
        throw new Error('post failed')
      }
      this.posts.push(message)
    }

    terminate() {
      queueMicrotask(() => this.exit(1))
      return Promise.resolve(1)
    }

    exit(code: number) {
      if (!this.exited) {
        this.exited = true
        this.emit('exit', code)
      }
    }
  }

  return { Worker: FakeWorker }
})

import { ThreadLibraryClient, ThreadLibraryTransportError } from './client'

type FakeWorker = EventEmitter & {
  posts: ThreadLibraryRequest[]
  specifier: URL
  options: { name?: string }
  exited: boolean
  throwOnPost: boolean
  exit(code: number): void
}

const timestamp = '2026-08-12T00:00:00.000Z'
const threadId = '00000000-0000-4000-8000-000000000001'
const materializeInput: ThreadLibraryOperationInput['materialize'] = {
  threadId,
  title: 'First thread',
  targetSelection: {
    kind: 'connection',
    providerId: 'provider-1',
    modelId: 'model-1',
  },
  fallbackLocalSecond: null,
  createdAt: timestamp,
}

function materializedDetail(input: ThreadLibraryOperationInput['materialize'] = materializeInput) {
  return {
    summary: {
      id: input.threadId,
      location: 'available',
      trashedFromLocation: null,
      trashedPinPosition: null,
      pinPosition: null,
      title: input.title,
      titleSource: 'auto',
      fallbackLocalSecond: input.fallbackLocalSecond,
      fallbackOrdinal: input.fallbackLocalSecond ? 1 : null,
      threadRevision: 1,
      lastUserActivityAt: input.createdAt,
      resultRevision: 0,
      seenResultRevision: 0,
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
    },
    draft: {
      threadId: input.threadId,
      draftRevision: 0,
      text: '',
      targetSelection: input.targetSelection,
      updatedAt: input.createdAt,
    },
    turns: [],
    images: [],
    documents: [],
    providerStateRefs: [],
  } as const
}

function importedRows(): ImportedV5Rows {
  return {
    thread: {
      ...materializedDetail().summary,
      title: 'Imported',
      lastUserActivityAt: timestamp,
    },
    draft: {
      ...materializedDetail().draft,
      draftRevision: 1,
    },
    turns: [
      {
        threadId,
        ordinal: 0,
        attemptRequestId: 'request-1',
        userMessageId: 'user-1',
        assistantMessageId: 'assistant-1',
        userContent: 'Hello',
        assistantContent: 'Done',
        assistantStatus: 'completed',
        error: null,
        targetSelection: materializeInput.targetSelection,
        targetAttribution: {
          kind: 'connection',
          providerId: 'provider-1',
          providerDisplayName: 'Provider One',
          modelId: 'model-1',
          modelDisplayName: 'Model One',
        },
        providerStateId: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    images: [],
    documents: [],
    providerStateRefs: [],
  }
}

function importedDetail(rows: ImportedV5Rows) {
  return {
    summary: rows.thread,
    draft: rows.draft,
    turns: rows.turns,
    images: rows.images,
    documents: rows.documents,
    providerStateRefs: rows.providerStateRefs,
  }
}

function conflictingMaterializedDetail() {
  const detail = materializedDetail()
  return { ...detail, summary: { ...detail.summary, title: 'Different thread' } }
}

function conflictingImportedDetail(rows: ImportedV5Rows) {
  const detail = importedDetail(rows)
  return { ...detail, draft: { ...detail.draft, text: 'Different draft' } }
}

function posts(operation: ThreadLibraryRequest['operation']) {
  return (workerMock.instances as FakeWorker[])
    .flatMap((candidate) => candidate.posts)
    .filter((request) => request.operation === operation)
}

function worker(index: number) {
  return workerMock.instances[index] as FakeWorker
}

async function waitForWorker(index: number) {
  await vi.waitFor(() => expect(workerMock.instances.length).toBeGreaterThan(index))
  return worker(index)
}

async function waitForPost(instance: FakeWorker, index: number) {
  await vi.waitFor(() => expect(instance.posts.length).toBeGreaterThan(index))
  return instance.posts[index]!
}

function succeed(instance: FakeWorker, request: ThreadLibraryRequest, value: unknown) {
  instance.emit('message', { id: request.id, ok: true, value })
}

function fail(
  instance: FakeWorker,
  request: ThreadLibraryRequest,
  code: 'already_exists' | 'library_unavailable',
  outcome: 'definitely_not_committed' | 'outcome_unknown' = 'definitely_not_committed',
) {
  const messages = {
    already_exists: 'This thread already exists.',
    library_unavailable: 'The Thread Library is unavailable.',
  } as const
  instance.emit('message', {
    id: request.id,
    ok: false,
    safeError: { code, message: messages[code] },
    outcome,
  })
}

async function openClient() {
  const index = workerMock.instances.length
  const client = new ThreadLibraryClient('/tmp/nyx-thread-library.sqlite')
  const opening = client.open()
  const instance = await waitForWorker(index)
  const request = await waitForPost(instance, 0)
  expect(request.operation).toBe('open')
  succeed(instance, request, { schemaVersion: 1 })
  await expect(opening).resolves.toEqual({ id: request.id, ok: true, value: { schemaVersion: 1 } })
  return { client, instance }
}

beforeEach(() => {
  workerMock.instances.length = 0
  workerMock.maxActive = 0
  vi.useRealTimers()
})

describe('ThreadLibraryClient', () => {
  it('uses one fixed Worker entry, validates normal replies, and closes cleanly', async () => {
    const { client, instance } = await openClient()
    expect(String(instance.specifier)).toMatch(/thread-library-worker\.js$/)
    expect(instance.options).toEqual({ name: 'thread-library' })

    const listing = client.listPage({ location: 'available', cursor: null, limit: 50 })
    const listRequest = await waitForPost(instance, 1)
    succeed(instance, listRequest, {
      rows: [],
      nextCursor: null,
      includedThroughCursor: 0,
    })
    await expect(listing).resolves.toMatchObject({ ok: true, value: { rows: [] } })

    const closing = client.close()
    const closeRequest = await waitForPost(instance, 2)
    succeed(instance, closeRequest, { closed: true })
    instance.exit(0)
    await expect(closing).resolves.toMatchObject({ ok: true, value: { closed: true } })
    expect(workerMock.instances).toHaveLength(1)
  })

  it('rereads a committed materialize after reply loss and reuses the same id on explicit Retry', async () => {
    const { client, instance: first } = await openClient()
    const materializing = client.materialize(materializeInput)
    const firstMaterialize = await waitForPost(first, 1)
    expect(firstMaterialize.operation).toBe('materialize')
    first.exit(1)

    const replacement = await waitForWorker(1)
    expect(first.exited).toBe(true)
    const replacementOpen = await waitForPost(replacement, 0)
    succeed(replacement, replacementOpen, { schemaVersion: 1 })
    const canonicalRead = await waitForPost(replacement, 1)
    first.emit('message', { id: firstMaterialize.id, ok: true, value: materializedDetail() })
    succeed(replacement, canonicalRead, materializedDetail())

    await expect(materializing).resolves.toMatchObject({
      id: firstMaterialize.id,
      ok: true,
      value: { summary: { id: threadId } },
    })

    const explicitRetry = client.materialize(materializeInput)
    const retryRequest = await waitForPost(replacement, 2)
    expect(retryRequest.input).toMatchObject({ threadId })
    fail(replacement, retryRequest, 'already_exists')
    const retryRead = await waitForPost(replacement, 3)
    succeed(replacement, retryRead, materializedDetail())
    await expect(explicitRetry).resolves.toMatchObject({
      ok: true,
      value: { summary: { id: threadId } },
    })

    expect(posts('materialize')).toHaveLength(2)
    expect(workerMock.maxActive).toBe(1)
  })

  it.each([
    {
      branch: 'an exact match as committed',
      canonical: materializedDetail(),
      expected: { ok: true, value: { summary: { id: threadId } } },
    },
    {
      branch: 'an absent id as not committed',
      canonical: null,
      expected: {
        ok: false,
        safeError: { code: 'not_found' },
        outcome: 'definitely_not_committed',
      },
    },
    {
      branch: 'a conflicting stable id as already existing',
      canonical: conflictingMaterializedDetail(),
      expected: {
        ok: false,
        safeError: { code: 'already_exists' },
        outcome: 'definitely_not_committed',
      },
    },
  ])('classifies legal unknown materialize: $branch', async ({ canonical, expected }) => {
    const { client, instance: first } = await openClient()
    const materializing = client.materialize(materializeInput)
    const materializeRequest = await waitForPost(first, 1)
    fail(first, materializeRequest, 'library_unavailable', 'outcome_unknown')

    const replacement = await waitForWorker(1)
    const replacementOpen = await waitForPost(replacement, 0)
    succeed(replacement, replacementOpen, { schemaVersion: 1 })
    const canonicalRead = await waitForPost(replacement, 1)
    succeed(replacement, canonicalRead, canonical)

    await expect(materializing).resolves.toMatchObject(expected)
    expect(posts('materialize')).toHaveLength(1)
    expect(workerMock.instances).toHaveLength(2)
    expect(workerMock.maxActive).toBe(1)
  })

  it('reconciles explicit unknown replies and shares one replacement across pending mutations', async () => {
    const { client, instance: first } = await openClient()
    const firstMaterializePromise = client.materialize(materializeInput)
    const secondInput = { ...materializeInput, threadId: '00000000-0000-4000-8000-000000000002' }
    const secondMaterializePromise = client.materialize(secondInput)
    const firstRequest = await waitForPost(first, 1)
    const secondRequest = await waitForPost(first, 2)
    fail(first, firstRequest, 'library_unavailable', 'outcome_unknown')
    fail(first, secondRequest, 'library_unavailable', 'outcome_unknown')

    const replacement = await waitForWorker(1)
    const replacementOpen = await waitForPost(replacement, 0)
    succeed(replacement, replacementOpen, { schemaVersion: 1 })
    const firstRead = await waitForPost(replacement, 1)
    const secondRead = await waitForPost(replacement, 2)
    for (const request of [firstRead, secondRead]) {
      const readThreadId = (request.input as ThreadLibraryOperationInput['readThread']).threadId
      succeed(
        replacement,
        request,
        readThreadId === threadId ? materializedDetail() : materializedDetail(secondInput),
      )
    }

    await expect(firstMaterializePromise).resolves.toMatchObject({ ok: true })
    await expect(secondMaterializePromise).resolves.toMatchObject({ ok: true })
    expect(workerMock.instances).toHaveLength(2)
    expect(workerMock.maxActive).toBe(1)
    expect(replacement.posts.filter((request) => request.operation === 'materialize')).toHaveLength(
      0,
    )
  })

  it('uses one replacement when an already-exists reread loses its Worker', async () => {
    const { client, instance: first } = await openClient()
    const materializing = client.materialize(materializeInput)
    const materializeRequest = await waitForPost(first, 1)
    fail(first, materializeRequest, 'already_exists')
    await waitForPost(first, 2)
    first.exit(1)

    const replacement = await waitForWorker(1)
    const replacementOpen = await waitForPost(replacement, 0)
    succeed(replacement, replacementOpen, { schemaVersion: 1 })
    const canonicalRead = await waitForPost(replacement, 1)
    succeed(replacement, canonicalRead, materializedDetail())

    await expect(materializing).resolves.toMatchObject({ ok: true })
    expect(workerMock.instances).toHaveLength(2)
    expect(posts('materialize')).toHaveLength(1)
    expect(workerMock.maxActive).toBe(1)
  })

  it('reconciles an import after reply loss without replaying it', async () => {
    const rows = importedRows()
    const { client, instance: first } = await openClient()
    const importing = client.importV5(rows)
    const importRequest = await waitForPost(first, 1)
    expect(importRequest.operation).toBe('importV5')
    first.exit(1)

    const replacement = await waitForWorker(1)
    const replacementOpen = await waitForPost(replacement, 0)
    succeed(replacement, replacementOpen, { schemaVersion: 1 })
    const canonicalRead = await waitForPost(replacement, 1)
    succeed(replacement, canonicalRead, importedDetail(rows))

    await expect(importing).resolves.toEqual({
      id: importRequest.id,
      ok: true,
      value: { threadId, imported: true },
    })
    expect(posts('importV5')).toHaveLength(1)
    expect(workerMock.maxActive).toBe(1)
  })

  it.each([
    {
      branch: 'an exact match as committed',
      canonical: (rows: ImportedV5Rows) => importedDetail(rows),
      expected: { ok: true, value: { threadId, imported: true } },
    },
    {
      branch: 'an absent id as not committed',
      canonical: () => null,
      expected: {
        ok: false,
        safeError: { code: 'not_found' },
        outcome: 'definitely_not_committed',
      },
    },
    {
      branch: 'a conflicting stable id as already existing',
      canonical: (rows: ImportedV5Rows) => conflictingImportedDetail(rows),
      expected: {
        ok: false,
        safeError: { code: 'already_exists' },
        outcome: 'definitely_not_committed',
      },
    },
  ])('classifies legal unknown import: $branch', async ({ canonical, expected }) => {
    const rows = importedRows()
    const { client, instance: first } = await openClient()
    const importing = client.importV5(rows)
    const importRequest = await waitForPost(first, 1)
    fail(first, importRequest, 'library_unavailable', 'outcome_unknown')

    const replacement = await waitForWorker(1)
    const replacementOpen = await waitForPost(replacement, 0)
    succeed(replacement, replacementOpen, { schemaVersion: 1 })
    const canonicalRead = await waitForPost(replacement, 1)
    succeed(replacement, canonicalRead, canonical(rows))

    await expect(importing).resolves.toMatchObject(expected)
    expect(posts('importV5')).toHaveLength(1)
    expect(workerMock.instances).toHaveLength(2)
    expect(workerMock.maxActive).toBe(1)
  })

  it.each(['materialize', 'importV5'] as const)(
    'does not start a third Worker when %s replacement reread crashes',
    async (operation) => {
      const rows = importedRows()
      const { client, instance: first } = await openClient()
      const mutation =
        operation === 'materialize' ? client.materialize(materializeInput) : client.importV5(rows)
      const mutationRequest = await waitForPost(first, 1)
      fail(first, mutationRequest, 'library_unavailable', 'outcome_unknown')

      const replacement = await waitForWorker(1)
      const replacementOpen = await waitForPost(replacement, 0)
      succeed(replacement, replacementOpen, { schemaVersion: 1 })
      await waitForPost(replacement, 1)
      replacement.exit(1)

      await expect(mutation).resolves.toMatchObject({
        ok: false,
        safeError: { code: 'library_unavailable' },
        outcome: 'outcome_unknown',
      })
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(workerMock.instances).toHaveLength(2)
      expect(posts(operation)).toHaveLength(1)
      expect(workerMock.maxActive).toBe(1)
    },
  )

  it('fails closed on malformed, unknown, and unsendable replies', async () => {
    for (const inject of [
      (instance: FakeWorker) => instance.emit('message', { nope: true }),
      (instance: FakeWorker) =>
        instance.emit('message', { id: 'unknown', ok: true, value: materializedDetail() }),
    ]) {
      const { client, instance } = await openClient()
      const reading = client.readThread({ threadId })
      await waitForPost(instance, 1)
      inject(instance)
      await expect(reading).rejects.toBeInstanceOf(ThreadLibraryTransportError)
      await vi.waitFor(() => expect(instance.exited).toBe(true))
    }

    const { client, instance } = await openClient()
    instance.throwOnPost = true
    await expect(client.readThread({ threadId })).rejects.toBeInstanceOf(
      ThreadLibraryTransportError,
    )
    await vi.waitFor(() => expect(instance.exited).toBe(true))

    const beforeUnsentMutation = workerMock.instances.length
    const { client: mutationClient, instance: mutationWorker } = await openClient()
    mutationWorker.throwOnPost = true
    await expect(mutationClient.materialize(materializeInput)).resolves.toMatchObject({
      ok: false,
      safeError: { code: 'library_unavailable' },
      outcome: 'definitely_not_committed',
    })
    await vi.waitFor(() => expect(mutationWorker.exited).toBe(true))
    expect(workerMock.instances).toHaveLength(beforeUnsentMutation + 1)
  })

  it('invalidates the generation on timeout', async () => {
    const { client, instance } = await openClient()
    vi.useFakeTimers()
    const reading = client.readThread({ threadId })
    const rejected = expect(reading).rejects.toBeInstanceOf(ThreadLibraryTransportError)
    expect(instance.posts.at(-1)?.operation).toBe('readThread')

    await vi.advanceTimersByTimeAsync(5_000)

    await rejected
    await vi.runAllTimersAsync()
    expect(instance.exited).toBe(true)
  })
})
