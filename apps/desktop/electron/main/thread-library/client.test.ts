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
    readonly generation: string
    watermark = 0
    throwOnPost = false

    constructor(specifier: URL, options: { name?: string }) {
      super()
      this.specifier = specifier
      this.options = options
      workerMock.instances.push(this)
      this.generation = `00000000-0000-4000-8000-${workerMock.instances.length
        .toString()
        .padStart(12, '0')}`
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
  generation: string
  watermark: number
  throwOnPost: boolean
  exit(code: number): void
}

const timestamp = '2026-08-12T00:00:00.000Z'
const threadId = '00000000-0000-4000-8000-000000000001'

function uuid(value: number) {
  return `00000000-0000-4000-8000-${value.toString(16).padStart(12, '0')}`
}

const materializeInput: ThreadLibraryOperationInput['materialize'] = {
  threadId,
  draft: {
    text: 'First thread',
    targetSelection: {
      kind: 'connection',
      providerId: 'provider-1',
      modelId: 'model-1',
    },
    images: [],
    documents: [],
  },
  fallbackLocalSecond: '2026-08-12T08:00:00',
  createdAt: timestamp,
}
const saveDraftInput: ThreadLibraryOperationInput['saveDraft'] = {
  threadId,
  expectedDraftRevision: 0,
  draft: {
    text: 'Draft text',
    targetSelection: materializeInput.draft.targetSelection,
    images: [],
    documents: [],
  },
  savedAt: '2026-08-12T00:00:01.000Z',
}
const settleInput: ThreadLibraryOperationInput['settleTurn'] = {
  threadId,
  requestId: 'request-1',
  assistantStatus: 'completed',
  assistantContent: 'Done',
  error: null,
  providerStateRef: null,
  settledAt: '2026-08-12T00:00:02.000Z',
}
const renameInput: ThreadLibraryOperationInput['rename'] = {
  threadId,
  title: 'Renamed thread',
  expectedThreadRevision: 1,
  renamedAt: '2026-08-12T00:00:03.000Z',
}
const archiveInput: ThreadLibraryOperationInput['updateLocation'] = {
  threadId,
  action: 'archive',
  expectedThreadRevision: 1,
  movedAt: '2026-08-12T00:00:04.000Z',
}

function materializedDetail(input: ThreadLibraryOperationInput['materialize'] = materializeInput) {
  return {
    summary: {
      id: input.threadId,
      location: 'available',
      trashedFromLocation: null,
      trashedPinPosition: null,
      pinPosition: null,
      title: input.draft.text,
      titleSource: 'auto',
      fallbackLocalSecond: input.fallbackLocalSecond,
      fallbackOrdinal: null,
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
      text: input.draft.text,
      targetSelection: input.draft.targetSelection,
      updatedAt: input.createdAt,
    },
    turns: [],
    images: input.draft.images.map((row) => ({
      ...row,
      threadId: input.threadId,
      owner: 'draft' as const,
      turnOrdinal: null,
    })),
    documents: input.draft.documents.map((row) => ({
      ...row,
      threadId: input.threadId,
      owner: 'draft' as const,
      turnOrdinal: null,
    })),
    providerStateRefs: [],
  } as const
}

function pinDetail(pinPosition: number | null, targetThreadId = threadId) {
  const detail = materializedDetail({ ...materializeInput, threadId: targetThreadId })
  return { ...detail, summary: { ...detail.summary, pinPosition } }
}

function renamedDetail(revision = 2) {
  const detail = materializedDetail()
  return {
    ...detail,
    summary: {
      ...detail.summary,
      title: renameInput.title,
      titleSource: 'manual' as const,
      fallbackLocalSecond: null,
      fallbackOrdinal: null,
      threadRevision: revision,
      updatedAt: renameInput.renamedAt,
    },
  }
}

function locationDetail(location: 'available' | 'archived' | 'trash', revision: number) {
  const detail = materializedDetail()
  return {
    ...detail,
    summary: {
      ...detail.summary,
      location,
      trashedFromLocation: location === 'trash' ? ('available' as const) : null,
      trashedPinPosition: null,
      pinPosition: null,
      threadRevision: revision,
      updatedAt: revision === 1 ? detail.summary.updatedAt : archiveInput.movedAt,
    },
  }
}

function genericMaterializedDetail(
  input: ThreadLibraryOperationInput['materialize'],
  fallbackOrdinal: number,
) {
  const detail = materializedDetail(input)
  const suffix = fallbackOrdinal === 1 ? '' : ` · ${fallbackOrdinal}`
  return {
    ...detail,
    summary: {
      ...detail.summary,
      title: `Image · ${input.fallbackLocalSecond.replace('T', ' ')}${suffix}`,
      fallbackOrdinal,
    },
  }
}

function savedDraftDetail() {
  const detail = materializedDetail()
  return {
    ...detail,
    summary: { ...detail.summary, updatedAt: saveDraftInput.savedAt },
    draft: {
      ...detail.draft,
      draftRevision: 1,
      text: saveDraftInput.draft.text,
      updatedAt: saveDraftInput.savedAt,
    },
  }
}

function terminalDetail(status: 'pending' | 'completed' = 'completed') {
  const detail = materializedDetail()
  return {
    ...detail,
    summary: {
      ...detail.summary,
      lastUserActivityAt: '2026-08-12T00:00:01.000Z',
      resultRevision: status === 'completed' ? 1 : 0,
      updatedAt: status === 'completed' ? settleInput.settledAt : '2026-08-12T00:00:01.000Z',
    },
    draft: { ...detail.draft, draftRevision: 1, updatedAt: '2026-08-12T00:00:01.000Z' },
    turns: [
      {
        threadId,
        ordinal: 0,
        attemptRequestId: settleInput.requestId,
        userMessageId: 'user-1',
        assistantMessageId: 'assistant-1',
        userContent: 'Hello',
        assistantContent: status === 'completed' ? settleInput.assistantContent : '',
        assistantStatus: status,
        error: null,
        targetSelection: materializeInput.draft.targetSelection,
        targetAttribution: {
          kind: 'connection' as const,
          providerId: 'provider-1',
          providerDisplayName: 'Provider One',
          modelId: 'model-1',
          modelDisplayName: 'Model One',
        },
        providerStateId: null,
        createdAt: '2026-08-12T00:00:01.000Z',
        updatedAt: status === 'completed' ? settleInput.settledAt : '2026-08-12T00:00:01.000Z',
      },
    ],
  }
}

function importedRows(): ImportedV5Rows {
  return {
    thread: {
      ...materializedDetail().summary,
      title: 'Imported',
      fallbackLocalSecond: null,
      fallbackOrdinal: null,
      lastUserActivityAt: timestamp,
    },
    draft: {
      ...materializedDetail().draft,
      draftRevision: 1,
      text: '',
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
        targetSelection: materializeInput.draft.targetSelection,
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

function succeed(
  instance: FakeWorker,
  request: ThreadLibraryRequest,
  value: unknown,
  actualMutation = false,
) {
  if (actualMutation) {
    instance.watermark += 1
  }
  instance.emit('message', {
    id: request.id,
    ok: true,
    value,
    clock: {
      generation: instance.generation,
      watermark: instance.watermark,
      actualMutation,
    },
  })
}

function fail(
  instance: FakeWorker,
  request: ThreadLibraryRequest,
  code: 'already_exists' | 'library_unavailable' | 'not_pending',
  outcome: 'definitely_not_committed' | 'outcome_unknown' = 'definitely_not_committed',
) {
  const messages = {
    already_exists: 'This thread already exists.',
    library_unavailable: 'The Thread Library is unavailable.',
    not_pending: 'This turn is no longer pending.',
  } as const
  instance.emit('message', {
    id: request.id,
    ok: false,
    safeError: { code, message: messages[code] },
    outcome,
  })
}

async function openClient(
  observeAcknowledgement?: ConstructorParameters<typeof ThreadLibraryClient>[1],
) {
  const index = workerMock.instances.length
  const client = new ThreadLibraryClient('/tmp/nyx-thread-library.sqlite', observeAcknowledgement)
  const opening = client.open()
  const instance = await waitForWorker(index)
  const request = await waitForPost(instance, 0)
  expect(request.operation).toBe('open')
  succeed(instance, request, { schemaVersion: 1 })
  await expect(opening).resolves.toEqual({
    id: request.id,
    ok: true,
    value: { schemaVersion: 1 },
    clock: { generation: instance.generation, watermark: 0, actualMutation: false },
  })
  return { client, instance }
}

beforeEach(() => {
  workerMock.instances.length = 0
  workerMock.maxActive = 0
  vi.useRealTimers()
})

describe('ThreadLibraryClient', () => {
  it('observes validated FIFO clocks synchronously and exposes only the latest acknowledgement', async () => {
    const observed: Array<{ operation: string; watermark: number; actualMutation: boolean }> = []
    const { client, instance } = await openClient()
    client.setAcknowledgementObserver(({ operation, clock }) => {
      observed.push({
        operation,
        watermark: clock.watermark,
        actualMutation: clock.actualMutation,
      })
    })
    expect(client.currentClock()).toEqual({ generation: instance.generation, watermark: 0 })
    expect(observed).toEqual([])

    const materializing = client.materialize(materializeInput)
    const materializeRequest = await waitForPost(instance, 1)
    succeed(instance, materializeRequest, materializedDetail(), true)
    expect(observed.at(-1)).toEqual({
      operation: 'materialize',
      watermark: 1,
      actualMutation: true,
    })
    await expect(materializing).resolves.toMatchObject({ ok: true })
    expect(client.currentClock()).toEqual({ generation: instance.generation, watermark: 1 })

    const snapshotting = client.snapshot({ threadId: null })
    const snapshotRequest = await waitForPost(instance, 2)
    succeed(instance, snapshotRequest, { detail: null, includedThroughCursor: 1 })
    await expect(snapshotting).resolves.toMatchObject({
      ok: true,
      value: { detail: null, includedThroughCursor: 1 },
    })
    expect(observed.at(-1)).toEqual({
      operation: 'snapshot',
      watermark: 1,
      actualMutation: false,
    })
  })

  it('invalidates a generation whose validated reply clock regresses', async () => {
    const { client, instance } = await openClient()
    const materializing = client.materialize(materializeInput)
    const materializeRequest = await waitForPost(instance, 1)
    succeed(instance, materializeRequest, materializedDetail(), true)
    await materializing

    const snapshotting = client.snapshot({ threadId: null })
    const snapshotRequest = await waitForPost(instance, 2)
    instance.emit('message', {
      id: snapshotRequest.id,
      ok: true,
      value: { detail: null, includedThroughCursor: 0 },
      clock: { generation: instance.generation, watermark: 0, actualMutation: false },
    })
    await expect(snapshotting).rejects.toBeInstanceOf(ThreadLibraryTransportError)
    await vi.waitFor(() => expect(instance.exited).toBe(true))
    expect(() => client.currentClock()).toThrow('no verified acknowledgement clock')
  })

  it('serializes Pin updates with empty-shell discard and preserves boundary no-op clocks', async () => {
    const { client, instance } = await openClient()
    const updating = client.updatePin({
      threadId,
      action: 'pin',
      expectedPinPosition: null,
    })
    const preflight = await waitForPost(instance, 1)
    expect(preflight).toMatchObject({ operation: 'pinState', input: { threadId } })

    const discarding = client.discardEmptyShell({ threadId, expectedDraftRevision: 0 })
    await Promise.resolve()
    expect(instance.posts).toHaveLength(2)

    succeed(instance, preflight, {
      pinnedCount: 0,
      pinPosition: null,
      detail: pinDetail(null),
    })
    const mutation = await waitForPost(instance, 2)
    expect(mutation.operation).toBe('updatePin')
    succeed(instance, mutation, pinDetail(1), true)
    await expect(updating).resolves.toMatchObject({
      ok: true,
      value: { summary: { pinPosition: 1 } },
      clock: { watermark: 1, actualMutation: true },
    })

    const discard = await waitForPost(instance, 3)
    expect(discard.operation).toBe('discardEmptyShell')
    succeed(instance, discard, { discarded: false })
    await expect(discarding).resolves.toMatchObject({ ok: true, value: { discarded: false } })

    const boundary = client.updatePin({
      threadId,
      action: 'move_top',
      expectedPinPosition: 1,
    })
    const boundaryPreflight = await waitForPost(instance, 4)
    succeed(instance, boundaryPreflight, {
      pinnedCount: 1,
      pinPosition: 1,
      detail: pinDetail(1),
    })
    const boundaryMutation = await waitForPost(instance, 5)
    succeed(instance, boundaryMutation, pinDetail(1))
    await expect(boundary).resolves.toMatchObject({
      ok: true,
      clock: { watermark: 1, actualMutation: false },
    })
  })

  it('serializes Rename with Pin and reconciles an unknown result with one read', async () => {
    const { client, instance: first } = await openClient()
    const updating = client.updatePin({ threadId, action: 'pin', expectedPinPosition: null })
    const preflight = await waitForPost(first, 1)
    const renaming = client.rename(renameInput)
    await Promise.resolve()
    expect(posts('rename')).toHaveLength(0)

    succeed(first, preflight, {
      pinnedCount: 0,
      pinPosition: null,
      detail: pinDetail(null),
    })
    const pin = await waitForPost(first, 2)
    succeed(first, pin, pinDetail(1), true)
    await updating

    const rename = await waitForPost(first, 3)
    expect(rename).toMatchObject({ operation: 'rename', input: renameInput })
    fail(first, rename, 'library_unavailable', 'outcome_unknown')

    const replacement = await waitForWorker(1)
    const opening = await waitForPost(replacement, 0)
    succeed(replacement, opening, { schemaVersion: 1 })
    const canonical = await waitForPost(replacement, 1)
    expect(canonical.operation).toBe('readThread')
    succeed(replacement, canonical, renamedDetail())

    await expect(renaming).resolves.toMatchObject({
      ok: true,
      value: { summary: { title: renameInput.title, threadRevision: 2 } },
    })
    expect(posts('rename')).toHaveLength(1)
    expect(replacement.posts.map((request) => request.operation)).toEqual(['open', 'readThread'])
    expect(workerMock.maxActive).toBe(1)
  })

  it('accepts a canonical manual Rename no-op at the expected revision', async () => {
    const { client, instance: first } = await openClient()
    const renaming = client.rename(renameInput)
    const rename = await waitForPost(first, 1)
    fail(first, rename, 'library_unavailable', 'outcome_unknown')

    const replacement = await waitForWorker(1)
    const opening = await waitForPost(replacement, 0)
    succeed(replacement, opening, { schemaVersion: 1 })
    const canonical = await waitForPost(replacement, 1)
    succeed(replacement, canonical, renamedDetail(1))

    await expect(renaming).resolves.toMatchObject({
      ok: true,
      value: { summary: { threadRevision: 1 } },
    })
  })

  it.each([
    {
      branch: 'committed post-state',
      canonical: () => locationDetail('archived', 2),
      expected: { ok: true, value: { summary: { location: 'archived', threadRevision: 2 } } },
    },
    {
      branch: 'exact pre-state',
      canonical: () => locationDetail('available', 1),
      expected: {
        ok: false,
        safeError: { code: 'stale_thread_revision' },
        outcome: 'definitely_not_committed',
      },
    },
    {
      branch: 'third state',
      canonical: () => locationDetail('archived', 3),
      expected: {
        ok: false,
        safeError: { code: 'library_unavailable' },
        outcome: 'outcome_unknown',
      },
    },
  ])('reconciles an unknown Archive result without replay: $branch', async (testCase) => {
    const { client, instance: first } = await openClient()
    const updating = client.updateLocation(archiveInput)
    const mutation = await waitForPost(first, 1)
    expect(mutation).toMatchObject({ operation: 'updateLocation', input: archiveInput })
    fail(first, mutation, 'library_unavailable', 'outcome_unknown')

    const replacement = await waitForWorker(1)
    const opening = await waitForPost(replacement, 0)
    succeed(replacement, opening, { schemaVersion: 1 })
    const canonical = await waitForPost(replacement, 1)
    expect(canonical.operation).toBe('locationState')
    succeed(replacement, canonical, { pinnedCount: 0, detail: testCase.canonical() })

    await expect(updating).resolves.toMatchObject(testCase.expected)
    expect(posts('updateLocation')).toHaveLength(1)
    expect(replacement.posts.map((request) => request.operation)).toEqual(['open', 'locationState'])
    expect(workerMock.maxActive).toBe(1)
  })

  it.each([
    {
      branch: 'Trash committed post-state',
      input: { ...archiveInput, action: 'trash' as const },
      canonical: () => locationDetail('trash', 2),
      expected: { ok: true, value: { summary: { location: 'trash', threadRevision: 2 } } },
    },
    {
      branch: 'Trash exact pre-state',
      input: { ...archiveInput, action: 'trash' as const },
      canonical: () => locationDetail('archived', 1),
      expected: {
        ok: false,
        safeError: { code: 'stale_thread_revision' },
        outcome: 'definitely_not_committed',
      },
    },
    {
      branch: 'Trash third state',
      input: { ...archiveInput, action: 'trash' as const },
      canonical: () => locationDetail('trash', 3),
      expected: {
        ok: false,
        safeError: { code: 'library_unavailable' },
        outcome: 'outcome_unknown',
      },
    },
    {
      branch: 'Restore committed post-state',
      input: {
        ...archiveInput,
        action: 'restore' as const,
        expectedThreadRevision: 2,
      },
      canonical: () => locationDetail('available', 3),
      expected: {
        ok: true,
        value: { summary: { location: 'available', threadRevision: 3 } },
      },
    },
    {
      branch: 'Restore exact pre-state',
      input: {
        ...archiveInput,
        action: 'restore' as const,
        expectedThreadRevision: 2,
      },
      canonical: () => locationDetail('trash', 2),
      expected: {
        ok: false,
        safeError: { code: 'stale_thread_revision' },
        outcome: 'definitely_not_committed',
      },
    },
    {
      branch: 'Restore third state',
      input: {
        ...archiveInput,
        action: 'restore' as const,
        expectedThreadRevision: 2,
      },
      canonical: () => locationDetail('archived', 4),
      expected: {
        ok: false,
        safeError: { code: 'library_unavailable' },
        outcome: 'outcome_unknown',
      },
    },
  ])('reconciles unknown Trash/Restore without replay: $branch', async (testCase) => {
    const { client, instance: first } = await openClient()
    const updating = client.updateLocation(testCase.input)
    const mutation = await waitForPost(first, 1)
    fail(first, mutation, 'library_unavailable', 'outcome_unknown')

    const replacement = await waitForWorker(1)
    const opening = await waitForPost(replacement, 0)
    succeed(replacement, opening, { schemaVersion: 1 })
    const canonical = await waitForPost(replacement, 1)
    succeed(replacement, canonical, { pinnedCount: 0, detail: testCase.canonical() })

    await expect(updating).resolves.toMatchObject(testCase.expected)
    expect(posts('updateLocation')).toHaveLength(1)
  })

  it('serializes Unarchive behind Rename on the one collection mutation barrier', async () => {
    const { client, instance } = await openClient()
    const renaming = client.rename(renameInput)
    const rename = await waitForPost(instance, 1)
    const unarchiving = client.updateLocation({
      ...archiveInput,
      action: 'unarchive',
      expectedThreadRevision: 2,
    })
    await Promise.resolve()
    expect(posts('updateLocation')).toHaveLength(0)

    succeed(instance, rename, renamedDetail(), true)
    await renaming
    const location = await waitForPost(instance, 2)
    expect(location.operation).toBe('updateLocation')
    succeed(instance, location, locationDetail('available', 3), true)
    await expect(unarchiving).resolves.toMatchObject({
      ok: true,
      value: { summary: { location: 'available', threadRevision: 3 } },
    })
  })

  it('rejects a stale Pin guard during preflight without sending a mutation', async () => {
    const { client, instance } = await openClient()
    const updating = client.updatePin({
      threadId,
      action: 'move_top',
      expectedPinPosition: 2,
    })
    const preflight = await waitForPost(instance, 1)
    succeed(instance, preflight, {
      pinnedCount: 1,
      pinPosition: 1,
      detail: pinDetail(1),
    })
    await expect(updating).resolves.toMatchObject({
      ok: false,
      safeError: { code: 'stale_pin_position' },
      outcome: 'definitely_not_committed',
    })
    expect(posts('updatePin')).toHaveLength(0)
  })

  it.each([
    {
      branch: 'detail position mismatch',
      reply: () => ({ pinnedCount: 2, pinPosition: 1, detail: pinDetail(2) }),
    },
    {
      branch: 'position beyond count',
      reply: () => ({ pinnedCount: 1, pinPosition: 2, detail: pinDetail(2) }),
    },
    {
      branch: 'unavailable target location',
      reply: () => {
        const detail = pinDetail(null)
        return {
          pinnedCount: 0,
          pinPosition: null,
          detail: { ...detail, summary: { ...detail.summary, location: 'archived' as const } },
        }
      },
    },
    {
      branch: 'different target detail',
      reply: () => ({ pinnedCount: 0, pinPosition: null, detail: pinDetail(null, uuid(99)) }),
    },
  ])('fails closed on a malformed Pin preflight: $branch', async ({ reply }) => {
    const { client, instance } = await openClient()
    const updating = client.updatePin({
      threadId,
      action: 'pin',
      expectedPinPosition: null,
    })
    const preflight = await waitForPost(instance, 1)
    succeed(instance, preflight, reply())

    await expect(updating).resolves.toMatchObject({
      ok: false,
      safeError: { code: 'library_unavailable' },
      outcome: 'definitely_not_committed',
    })
    await vi.waitFor(() => expect(instance.exited).toBe(true))
    expect(posts('updatePin')).toHaveLength(0)
    expect(workerMock.instances).toHaveLength(1)
  })

  it.each([
    {
      branch: 'committed post-state',
      input: { threadId, action: 'pin' as const, expectedPinPosition: null },
      pre: { pinnedCount: 0, pinPosition: null },
      canonical: { pinnedCount: 1, pinPosition: 1 },
      expected: { ok: true, value: { summary: { pinPosition: 1 } } },
    },
    {
      branch: 'exact pre-state',
      input: { threadId, action: 'pin' as const, expectedPinPosition: null },
      pre: { pinnedCount: 0, pinPosition: null },
      canonical: { pinnedCount: 0, pinPosition: null },
      expected: { ok: false, safeError: { code: 'stale_pin_position' } },
    },
    {
      branch: 'third state',
      input: { threadId, action: 'pin' as const, expectedPinPosition: null },
      pre: { pinnedCount: 0, pinPosition: null },
      canonical: { pinnedCount: 2, pinPosition: 2 },
      expected: { ok: false, safeError: { code: 'library_unavailable' } },
    },
    {
      branch: 'boundary no-op pre-state',
      input: { threadId, action: 'move_top' as const, expectedPinPosition: 1 },
      pre: { pinnedCount: 1, pinPosition: 1 },
      canonical: { pinnedCount: 1, pinPosition: 1 },
      expected: { ok: true, value: { summary: { pinPosition: 1 } } },
    },
  ])('reconciles an unknown Pin result from one replacement: $branch', async (testCase) => {
    const { client, instance: first } = await openClient()
    const updating = client.updatePin(testCase.input)
    const preflight = await waitForPost(first, 1)
    succeed(first, preflight, {
      ...testCase.pre,
      detail: pinDetail(testCase.pre.pinPosition),
    })
    const mutation = await waitForPost(first, 2)
    fail(first, mutation, 'library_unavailable', 'outcome_unknown')

    const replacement = await waitForWorker(1)
    const opening = await waitForPost(replacement, 0)
    succeed(replacement, opening, { schemaVersion: 1 })
    const canonical = await waitForPost(replacement, 1)
    expect(canonical.operation).toBe('pinState')
    succeed(replacement, canonical, {
      ...testCase.canonical,
      detail: pinDetail(testCase.canonical.pinPosition),
    })

    await expect(updating).resolves.toMatchObject(testCase.expected)
    expect(posts('updatePin')).toHaveLength(1)
    expect(replacement.posts.map((request) => request.operation)).toEqual(['open', 'pinState'])
    expect(workerMock.maxActive).toBe(1)
  })

  it('reconciles a transport-unknown Pin result once without replaying the mutation', async () => {
    const { client, instance: first } = await openClient()
    const updating = client.updatePin({
      threadId,
      action: 'pin',
      expectedPinPosition: null,
    })
    const preflight = await waitForPost(first, 1)
    succeed(first, preflight, {
      pinnedCount: 0,
      pinPosition: null,
      detail: pinDetail(null),
    })
    await waitForPost(first, 2)
    first.exit(1)

    const replacement = await waitForWorker(1)
    const opening = await waitForPost(replacement, 0)
    succeed(replacement, opening, { schemaVersion: 1 })
    const canonical = await waitForPost(replacement, 1)
    succeed(replacement, canonical, {
      pinnedCount: 1,
      pinPosition: 1,
      detail: pinDetail(1),
    })

    await expect(updating).resolves.toMatchObject({
      ok: true,
      value: { summary: { id: threadId, pinPosition: 1 } },
    })
    expect(posts('updatePin')).toHaveLength(1)
    expect(replacement.posts.map((request) => request.operation)).toEqual(['open', 'pinState'])
    expect(workerMock.instances).toHaveLength(2)
    expect(workerMock.maxActive).toBe(1)
  })

  it('returns a definitely-not-committed Pin failure without opening a replacement', async () => {
    const { client, instance } = await openClient()
    const updating = client.updatePin({
      threadId,
      action: 'pin',
      expectedPinPosition: null,
    })
    const preflight = await waitForPost(instance, 1)
    succeed(instance, preflight, {
      pinnedCount: 0,
      pinPosition: null,
      detail: pinDetail(null),
    })
    const mutation = await waitForPost(instance, 2)
    fail(instance, mutation, 'library_unavailable', 'definitely_not_committed')

    await expect(updating).resolves.toMatchObject({
      ok: false,
      safeError: { code: 'library_unavailable' },
      outcome: 'definitely_not_committed',
    })
    expect(posts('updatePin')).toHaveLength(1)
    expect(workerMock.instances).toHaveLength(1)
  })

  it.each(['open', 'pinState'] as const)(
    'bounds an unknown Pin result when the replacement %s fails',
    async (failurePoint) => {
      const { client, instance: first } = await openClient()
      const updating = client.updatePin({
        threadId,
        action: 'pin',
        expectedPinPosition: null,
      })
      const preflight = await waitForPost(first, 1)
      succeed(first, preflight, {
        pinnedCount: 0,
        pinPosition: null,
        detail: pinDetail(null),
      })
      const mutation = await waitForPost(first, 2)
      fail(first, mutation, 'library_unavailable', 'outcome_unknown')

      const replacement = await waitForWorker(1)
      const opening = await waitForPost(replacement, 0)
      if (failurePoint === 'open') {
        fail(replacement, opening, 'library_unavailable')
      } else {
        succeed(replacement, opening, { schemaVersion: 1 })
        const canonical = await waitForPost(replacement, 1)
        fail(replacement, canonical, 'library_unavailable')
      }

      await expect(updating).resolves.toMatchObject({
        ok: false,
        safeError: { code: 'library_unavailable' },
        outcome: 'outcome_unknown',
      })
      expect(posts('updatePin')).toHaveLength(1)
      expect(workerMock.instances).toHaveLength(2)
      expect(workerMock.maxActive).toBe(1)
    },
  )

  it.each([
    {
      branch: 'cross-field mismatch',
      reply: () => ({ pinnedCount: 1, pinPosition: 1, detail: pinDetail(null) }),
    },
    {
      branch: 'different target detail',
      reply: () => ({ pinnedCount: 1, pinPosition: 1, detail: pinDetail(1, uuid(99)) }),
    },
  ])('fails closed on a malformed replacement Pin state: $branch', async ({ reply }) => {
    const { client, instance: first } = await openClient()
    const updating = client.updatePin({
      threadId,
      action: 'pin',
      expectedPinPosition: null,
    })
    const preflight = await waitForPost(first, 1)
    succeed(first, preflight, {
      pinnedCount: 0,
      pinPosition: null,
      detail: pinDetail(null),
    })
    const mutation = await waitForPost(first, 2)
    fail(first, mutation, 'library_unavailable', 'outcome_unknown')

    const replacement = await waitForWorker(1)
    const opening = await waitForPost(replacement, 0)
    succeed(replacement, opening, { schemaVersion: 1 })
    const canonical = await waitForPost(replacement, 1)
    succeed(replacement, canonical, reply())

    await expect(updating).resolves.toMatchObject({
      ok: false,
      safeError: { code: 'library_unavailable' },
      outcome: 'outcome_unknown',
    })
    await vi.waitFor(() => expect(replacement.exited).toBe(true))
    expect(posts('updatePin')).toHaveLength(1)
    expect(workerMock.instances).toHaveLength(2)
    expect(workerMock.maxActive).toBe(1)
  })

  it('canonically confirms Draft and terminal writes after reply loss without replaying them', async () => {
    const { client, instance: first } = await openClient()
    const saving = client.saveDraft(saveDraftInput)
    const saveRequest = await waitForPost(first, 1)
    fail(first, saveRequest, 'library_unavailable', 'outcome_unknown')

    const replacement = await waitForWorker(1)
    const replacementOpen = await waitForPost(replacement, 0)
    succeed(replacement, replacementOpen, { schemaVersion: 1 })
    const saveRead = await waitForPost(replacement, 1)
    succeed(replacement, saveRead, savedDraftDetail())
    await expect(saving).resolves.toMatchObject({
      ok: true,
      value: { status: 'committed', detail: { draft: { draftRevision: 1 } } },
    })

    const settling = client.settleTurn(settleInput)
    const settleRequest = await waitForPost(replacement, 2)
    fail(replacement, settleRequest, 'library_unavailable', 'outcome_unknown')
    const secondReplacement = await waitForWorker(2)
    const secondOpen = await waitForPost(secondReplacement, 0)
    succeed(secondReplacement, secondOpen, { schemaVersion: 1 })
    const settleRead = await waitForPost(secondReplacement, 1)
    succeed(secondReplacement, settleRead, terminalDetail())
    await expect(settling).resolves.toMatchObject({
      ok: true,
      value: { turns: [{ assistantStatus: 'completed', assistantContent: 'Done' }] },
    })

    expect(posts('saveDraft')).toHaveLength(1)
    expect(posts('settleTurn')).toHaveLength(1)
    expect(workerMock.maxActive).toBe(1)
  })

  it('keeps recoverPending unknown until the caller explicitly retries the same input', async () => {
    const recoveredAt = '2026-08-12T00:00:03.000Z'
    const { client, instance } = await openClient()
    const recovering = client.recoverPending({ recoveredAt })
    const request = await waitForPost(instance, 1)
    fail(instance, request, 'library_unavailable', 'outcome_unknown')
    await expect(recovering).resolves.toMatchObject({
      ok: false,
      outcome: 'outcome_unknown',
    })
    await vi.waitFor(() => expect(instance.exited).toBe(true))
    expect(posts('recoverPending')).toHaveLength(1)
    expect(workerMock.instances).toHaveLength(1)

    const reopening = client.open()
    const replacement = await waitForWorker(1)
    const opening = await waitForPost(replacement, 0)
    succeed(replacement, opening, { schemaVersion: 1 })
    await reopening
    const retrying = client.recoverPending({ recoveredAt })
    const retry = await waitForPost(replacement, 1)
    expect(retry.input).toEqual({ recoveredAt })
    succeed(replacement, retry, { recovered: 0 })
    await expect(retrying).resolves.toMatchObject({ ok: true, value: { recovered: 0 } })
    expect(posts('recoverPending')).toHaveLength(2)
  })

  it('rereads the canonical terminal when another terminal already won', async () => {
    const { client, instance } = await openClient()
    const settling = client.settleTurn(settleInput)
    const request = await waitForPost(instance, 1)
    fail(instance, request, 'not_pending')
    const read = await waitForPost(instance, 2)
    expect(read.operation).toBe('readThread')
    succeed(instance, read, terminalDetail())
    await expect(settling).resolves.toMatchObject({
      ok: true,
      value: { turns: [{ assistantStatus: 'completed' }] },
    })
    expect(posts('settleTurn')).toHaveLength(1)
    expect(workerMock.instances).toHaveLength(1)
  })

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

    const searching = client.search({ query: 'needle' })
    const searchRequest = await waitForPost(instance, 2)
    expect(searchRequest).toMatchObject({ operation: 'search', input: { query: 'needle' } })
    succeed(instance, searchRequest, {
      results: [
        {
          threadId,
          title: 'First thread',
          location: 'available',
          source: 'user_message',
          snippet: 'needle',
          messageId: 'user-1',
        },
      ],
      truncated: false,
    })
    await expect(searching).resolves.toMatchObject({
      ok: true,
      value: { results: [{ threadId, messageId: 'user-1' }], truncated: false },
      clock: { watermark: 0, actualMutation: false },
    })

    const closing = client.close()
    const closeRequest = await waitForPost(instance, 3)
    succeed(instance, closeRequest, { closed: true })
    instance.exit(0)
    await expect(closing).resolves.toMatchObject({ ok: true, value: { closed: true } })
    expect(workerMock.instances).toHaveLength(1)
  })

  it('rejects a malformed bounded Search reply on the existing Worker transport', async () => {
    const { client, instance } = await openClient()
    const searching = client.search({ query: 'needle' })
    const request = await waitForPost(instance, 1)
    succeed(instance, request, {
      results: [
        {
          threadId,
          title: 'First thread',
          location: 'available',
          source: 'title',
          snippet: 'x'.repeat(161),
          messageId: 'must-be-null-for-title',
        },
      ],
      truncated: false,
    })

    await expect(searching).rejects.toBeInstanceOf(ThreadLibraryTransportError)
    await vi.waitFor(() => expect(instance.exited).toBe(true))
    expect(workerMock.instances).toHaveLength(1)
  })

  it('rereads one exact same-second generic materialize after reply loss and Retry', async () => {
    const genericInput: ThreadLibraryOperationInput['materialize'] = {
      ...materializeInput,
      draft: {
        ...materializeInput.draft,
        text: '',
        images: [
          {
            imageId: '00000000-0000-4000-8000-000000000011',
            position: 0,
            mediaType: 'image/png',
            width: 2,
            height: 1,
            available: true,
          },
        ],
        documents: [],
      },
    }
    const canonical = genericMaterializedDetail(genericInput, 2)
    const { client, instance: first } = await openClient()
    const materializing = client.materialize(genericInput)
    const firstMaterialize = await waitForPost(first, 1)
    expect(firstMaterialize.operation).toBe('materialize')
    first.exit(1)

    const replacement = await waitForWorker(1)
    expect(first.exited).toBe(true)
    const replacementOpen = await waitForPost(replacement, 0)
    succeed(replacement, replacementOpen, { schemaVersion: 1 })
    const canonicalRead = await waitForPost(replacement, 1)
    first.emit('message', {
      id: firstMaterialize.id,
      ok: true,
      value: canonical,
    })
    succeed(replacement, canonicalRead, canonical)

    await expect(materializing).resolves.toEqual({
      id: firstMaterialize.id,
      ok: true,
      value: canonical,
      clock: {
        generation: replacement.generation,
        watermark: 0,
        actualMutation: false,
      },
    })

    const explicitRetry = client.materialize(genericInput)
    const retryRequest = await waitForPost(replacement, 2)
    expect(retryRequest.input).toEqual(genericInput)
    fail(replacement, retryRequest, 'already_exists')
    const retryRead = await waitForPost(replacement, 3)
    succeed(replacement, retryRead, canonical)
    await expect(explicitRetry).resolves.toEqual({
      id: retryRequest.id,
      ok: true,
      value: canonical,
      clock: {
        generation: replacement.generation,
        watermark: 0,
        actualMutation: false,
      },
    })

    expect(posts('materialize')).toHaveLength(2)
    expect(posts('readThread')).toHaveLength(2)
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

    await expect(importing).resolves.toMatchObject({
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
