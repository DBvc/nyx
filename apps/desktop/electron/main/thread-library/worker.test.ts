import { createHash } from 'node:crypto'
import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { DatabaseSync } from 'node:sqlite'

import { afterEach, beforeAll, describe, expect, it } from 'vitest'

import {
  parseThreadLibraryRequest,
  type ImportedV5Rows,
  type ThreadLibraryOperation,
  type ThreadLibraryOperationInput,
  type ThreadLibraryOperationValue,
  type ThreadLibraryRequest,
} from './protocol'

let ThreadLibraryDatabase: (typeof import('./worker'))['ThreadLibraryDatabase']
const tempDirs: string[] = []
const timestamp = '2026-08-12T00:00:00.000Z'
const localSecond = '2026-08-12T08:00:00'
const targetSelection = { kind: 'env_fallback' } as const
const expectedSchemaFingerprint = '0a422f89b87e53a8917074c7312b44ea38cda5a6a8e883679e512509fa90c213'
const connectionSelection = {
  kind: 'connection',
  providerId: 'provider-1',
  modelId: 'model-1',
} as const
const connectionAttribution = {
  kind: 'connection',
  providerId: 'provider-1',
  providerDisplayName: 'Provider One',
  modelId: 'model-1',
  modelDisplayName: 'Model One',
} as const

function uuid(value: number) {
  return `00000000-0000-4000-8000-${value.toString(16).padStart(12, '0')}`
}

function at(offset: number) {
  return new Date(Date.parse(timestamp) + offset * 1_000).toISOString()
}

function materializeInput(value: number): ThreadLibraryOperationInput['materialize'] {
  return {
    threadId: uuid(value),
    draft: {
      text: `Thread ${value}`,
      targetSelection,
      images: [],
      documents: [],
    },
    fallbackLocalSecond: localSecond,
    createdAt: at(value),
  }
}

function imageInput(value: number) {
  return {
    imageId: uuid(value),
    position: 0,
    mediaType: 'image/png' as const,
    width: 2,
    height: 1,
    available: true,
  }
}

function documentInput(value: number, name: string, position = 0) {
  const extractedText = 'notes'
  const mediaType = name.endsWith('.pdf')
    ? ('application/pdf' as const)
    : name.endsWith('.csv')
      ? ('text/csv' as const)
      : name.endsWith('.md')
        ? ('text/markdown' as const)
        : ('text/plain' as const)
  return {
    documentId: uuid(value),
    position,
    name,
    mediaType,
    byteLength: 5,
    extractedByteLength: 5,
    sourceSha256: createHash('sha256').update(extractedText).digest('hex'),
    extractedTextSha256: createHash('sha256').update(extractedText).digest('hex'),
    available: true,
    extractedText,
  }
}

function draftInput(
  threadId: string,
  expectedDraftRevision = 0,
): ThreadLibraryOperationInput['saveDraft'] {
  const extractedText = 'notes'
  return {
    threadId,
    expectedDraftRevision,
    draft: {
      text: 'Hello',
      targetSelection,
      images: [
        {
          imageId: uuid(40_001),
          position: 0,
          mediaType: 'image/png',
          width: 2,
          height: 1,
          available: true,
        },
      ],
      documents: [
        {
          documentId: uuid(40_002),
          position: 0,
          name: 'notes.txt',
          mediaType: 'text/plain',
          byteLength: 5,
          extractedByteLength: 5,
          sourceSha256: createHash('sha256').update(extractedText).digest('hex'),
          extractedTextSha256: createHash('sha256').update(extractedText).digest('hex'),
          available: true,
          extractedText,
        },
      ],
    },
    savedAt: at(100),
  }
}

function importedRows(value: number, assistantContent = 'Done'): ImportedV5Rows {
  const threadId = uuid(value)
  const imageId = uuid(value + 10_000)
  const documentId = uuid(value + 20_000)
  const stateId = uuid(value + 30_000)
  const extractedText = 'notes'

  return {
    thread: {
      id: threadId,
      location: 'available',
      trashedFromLocation: null,
      trashedPinPosition: null,
      pinPosition: null,
      title: `Imported ${value}`,
      titleSource: 'auto',
      fallbackLocalSecond: null,
      fallbackOrdinal: null,
      threadRevision: 1,
      lastUserActivityAt: at(value),
      resultRevision: 0,
      seenResultRevision: 0,
      createdAt: at(value),
      updatedAt: at(value),
    },
    draft: {
      threadId,
      draftRevision: 1,
      text: '',
      targetSelection: connectionSelection,
      updatedAt: at(value),
    },
    turns: [
      {
        threadId,
        ordinal: 0,
        attemptRequestId: `request-${value}`,
        userMessageId: `user-${value}`,
        assistantMessageId: `assistant-${value}`,
        userContent: 'Hello',
        assistantContent,
        assistantStatus: 'completed',
        error: null,
        targetSelection: connectionSelection,
        targetAttribution: connectionAttribution,
        providerStateId: stateId,
        createdAt: at(value),
        updatedAt: at(value),
      },
    ],
    images: [
      {
        threadId,
        turnOrdinal: 0,
        position: 0,
        imageId,
        mediaType: 'image/png',
        width: 2,
        height: 1,
        available: true,
      },
    ],
    documents: [
      {
        threadId,
        turnOrdinal: 0,
        position: 0,
        documentId,
        name: 'notes.pdf',
        mediaType: 'application/pdf',
        byteLength: 16,
        extractedByteLength: 5,
        sourceSha256: 'a'.repeat(64),
        extractedTextSha256: createHash('sha256').update(extractedText).digest('hex'),
        available: true,
        extractedText,
      },
    ],
    providerStateRefs: [
      {
        threadId,
        turnOrdinal: 0,
        stateId,
        protocol: 'openai-responses',
        executionIdentity: 'c'.repeat(64),
        byteLength: 16,
        sha256: 'd'.repeat(64),
      },
    ],
  }
}

type Owner = InstanceType<typeof ThreadLibraryDatabase>

async function createOwner() {
  const root = await mkdtemp(join(tmpdir(), 'nyx-thread-library-'))
  tempDirs.push(root)
  const databasePath = join(root, 'library', 'library.sqlite')
  const owner = new ThreadLibraryDatabase()
  owner.open({ databasePath })
  return { root, databasePath, owner }
}

function execute<Operation extends ThreadLibraryOperation>(
  owner: Owner,
  operation: Operation,
  input: ThreadLibraryOperationInput[Operation],
) {
  return owner.execute({ id: 'test', operation, input } as ThreadLibraryRequest) as
    | ThreadLibraryOperationValue[Operation]
    | never
}

function rawDatabase(owner: Owner) {
  return (owner as unknown as { database: DatabaseSync }).database
}

function mutationOutcome(operation: () => unknown) {
  try {
    operation()
  } catch (error) {
    return (error as { outcome?: unknown }).outcome
  }
  throw new Error('Expected mutation to fail.')
}

function schemaFingerprint(database: DatabaseSync) {
  const sql = database
    .prepare(
      `SELECT type, name, tbl_name, sql FROM sqlite_schema
       WHERE name NOT LIKE 'sqlite_%' AND type IN ('table', 'index', 'trigger')
       ORDER BY type, name`,
    )
    .all()
    .map((row) =>
      [
        row.type,
        row.name,
        row.tbl_name,
        String(row.sql ?? '')
          .replace(/\s+/gu, ' ')
          .trim(),
      ].join('\u0000'),
    )
    .join('\n')
  return createHash('sha256').update(sql).digest('hex')
}

async function hashFile(path: string) {
  return createHash('sha256')
    .update(await readFile(path))
    .digest('hex')
}

beforeAll(async () => {
  const prototype = DatabaseSync.prototype as unknown as {
    enableDefensive?: (active: boolean) => void
  }
  if (!prototype.enableDefensive) {
    Object.defineProperty(prototype, 'enableDefensive', { value() {} })
  }
  ;({ ThreadLibraryDatabase } = await import('./worker'))
})

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

describe('ThreadLibraryDatabase', () => {
  it('rejects target-only materialize and malformed fallback identity at the typed boundary', () => {
    const empty = materializeInput(19)
    empty.draft.text = ''
    expect(() =>
      parseThreadLibraryRequest({ id: 'test', operation: 'materialize', input: empty }),
    ).toThrow()

    const rows = importedRows(19)
    rows.thread.fallbackOrdinal = 1
    expect(() =>
      parseThreadLibraryRequest({ id: 'test', operation: 'importV5', input: { rows } }),
    ).toThrow()
  })

  it('materializes the complete initial Draft and preserves its exact canonical state on restart', async () => {
    const { databasePath, owner } = await createOwner()
    const input = materializeInput(20)
    input.draft = {
      text: '  Hello \n world  ',
      targetSelection: connectionSelection,
      images: [imageInput(50_020)],
      documents: [documentInput(60_020, 'notes.txt')],
    }

    expect(execute(owner, 'materialize', input)).toMatchObject({
      summary: {
        title: 'Hello world',
        fallbackLocalSecond: localSecond,
        fallbackOrdinal: null,
      },
      draft: {
        draftRevision: 0,
        text: input.draft.text,
        targetSelection: connectionSelection,
      },
      images: [{ imageId: uuid(50_020), owner: 'draft', position: 0 }],
      documents: [{ documentId: uuid(60_020), owner: 'draft', position: 0 }],
    })
    owner.close()

    const restarted = new ThreadLibraryDatabase()
    restarted.open({ databasePath })
    expect(execute(restarted, 'readThread', { threadId: input.threadId })).toMatchObject({
      summary: { title: 'Hello world', fallbackLocalSecond: localSecond, fallbackOrdinal: null },
      draft: { draftRevision: 0, text: input.draft.text },
      images: [{ imageId: uuid(50_020), owner: 'draft' }],
      documents: [{ documentId: uuid(60_020), owner: 'draft' }],
    })
    restarted.close()
  })

  it('derives one exact document title from ordered ready documents', async () => {
    const { owner } = await createOwner()
    const input = materializeInput(120)
    input.draft = {
      text: '',
      targetSelection,
      images: [],
      documents: [documentInput(60_120, 'notes   one.txt', 0)],
    }
    expect(execute(owner, 'materialize', input)).toMatchObject({
      summary: {
        title: 'notes one.txt',
        fallbackLocalSecond: localSecond,
        fallbackOrdinal: null,
      },
    })
    owner.close()
  })

  it.each([
    { name: `${'a'.repeat(251)}.txt`, title: `${'a'.repeat(41)}....txt` },
    { name: '报告   😀.pdf', title: '报告 😀.pdf' },
    { name: `${'文'.repeat(60)}.csv`, title: `${'文'.repeat(41)}....csv` },
  ])('bounds document title $name', async ({ name, title }) => {
    const { owner } = await createOwner()
    const input = materializeInput(121)
    const document = documentInput(60_122, name)
    input.draft = { text: '', targetSelection, images: [], documents: [document] }
    expect(execute(owner, 'materialize', input)).toMatchObject({ summary: { title } })
    owner.close()
  })

  it('keeps one generic identity stable across reopen after a timezone change', async () => {
    const previousTimezone = process.env.TZ
    let owner: Owner | null = null
    let reopened: Owner | null = null

    try {
      process.env.TZ = 'UTC'
      const created = await createOwner()
      owner = created.owner
      const input = materializeInput(123)
      input.draft = {
        text: '',
        targetSelection,
        images: [imageInput(50_123)],
        documents: [],
      }
      const expectedSummary = {
        title: 'Image · 2026-08-12 08:00:00',
        fallbackLocalSecond: localSecond,
        fallbackOrdinal: 1,
      }

      expect(execute(owner, 'materialize', input)).toMatchObject({ summary: expectedSummary })
      owner.close()
      owner = null

      process.env.TZ = 'Pacific/Honolulu'
      reopened = new ThreadLibraryDatabase()
      reopened.open({ databasePath: created.databasePath })
      expect(execute(reopened, 'readThread', { threadId: input.threadId })).toMatchObject({
        summary: expectedSummary,
        draft: { draftRevision: 0, text: '' },
        images: [{ imageId: uuid(50_123), owner: 'draft', position: 0 }],
      })
    } finally {
      owner?.close()
      reopened?.close()
      if (previousTimezone === undefined) delete process.env.TZ
      else process.env.TZ = previousTimezone
    }
  })

  it('freezes one document title after document-image-document ownership changes and reopen', async () => {
    const { databasePath, owner } = await createOwner()
    const input = materializeInput(124)
    input.draft = {
      text: '',
      targetSelection,
      images: [],
      documents: [documentInput(60_124, 'first.txt')],
    }
    expect(execute(owner, 'materialize', input)).toMatchObject({
      summary: { title: 'first.txt', fallbackLocalSecond: localSecond, fallbackOrdinal: null },
      documents: [{ documentId: uuid(60_124), owner: 'draft', position: 0 }],
    })

    const image = draftInput(input.threadId)
    image.draft = {
      text: '',
      targetSelection,
      images: [imageInput(50_124)],
      documents: [],
    }
    expect(execute(owner, 'saveDraft', image)).toMatchObject({
      status: 'committed',
      detail: {
        summary: {
          title: 'Image · 2026-08-12 08:00:00',
          fallbackLocalSecond: localSecond,
          fallbackOrdinal: 1,
        },
        images: [{ imageId: uuid(50_124), owner: 'draft', position: 0 }],
        documents: [],
      },
    })

    const document = draftInput(input.threadId, 1)
    document.draft = {
      text: '',
      targetSelection,
      images: [],
      documents: [documentInput(60_125, 'final.pdf')],
    }
    expect(execute(owner, 'saveDraft', document)).toMatchObject({
      status: 'committed',
      detail: {
        summary: {
          title: 'final.pdf',
          fallbackLocalSecond: localSecond,
          fallbackOrdinal: 1,
        },
        images: [],
        documents: [{ documentId: uuid(60_125), owner: 'draft', position: 0 }],
      },
    })

    expect(
      execute(owner, 'startTurn', {
        threadId: input.threadId,
        requestId: 'request-document-title',
        expectedDraftRevision: 2,
        userMessageId: 'user-document-title',
        assistantMessageId: 'assistant-document-title',
        startedAt: at(202),
      }),
    ).toMatchObject({
      status: 'committed',
      detail: {
        summary: {
          title: 'final.pdf',
          fallbackLocalSecond: null,
          fallbackOrdinal: null,
        },
        draft: { draftRevision: 3, text: '' },
        turns: [{ userContent: '', assistantStatus: 'pending' }],
        images: [],
        documents: [{ documentId: uuid(60_125), owner: 'turn', turnOrdinal: 0, position: 0 }],
      },
    })
    owner.close()

    const reopened = new ThreadLibraryDatabase()
    reopened.open({ databasePath })
    expect(execute(reopened, 'readThread', { threadId: input.threadId })).toMatchObject({
      summary: { title: 'final.pdf', fallbackLocalSecond: null, fallbackOrdinal: null },
      draft: { draftRevision: 3, text: '' },
      turns: [{ userContent: '', assistantStatus: 'pending' }],
      images: [],
      documents: [{ documentId: uuid(60_125), owner: 'turn', turnOrdinal: 0, position: 0 }],
    })
    reopened.close()
  })

  it('keeps one pre-send identity across title shapes and freezes only the title identity Send needs', async () => {
    const { owner } = await createOwner()
    const text = materializeInput(21)
    expect(execute(owner, 'materialize', text)).toMatchObject({
      summary: { title: 'Thread 21', fallbackLocalSecond: localSecond, fallbackOrdinal: null },
    })

    const image = draftInput(text.threadId)
    image.draft = { ...image.draft, text: '', images: [imageInput(50_021)], documents: [] }
    expect(execute(owner, 'saveDraft', image)).toMatchObject({
      detail: {
        summary: { title: 'Image · 2026-08-12 08:00:00', fallbackOrdinal: 1 },
      },
    })

    const document = draftInput(text.threadId, 1)
    document.draft = {
      ...document.draft,
      text: '',
      images: [],
      documents: [documentInput(60_021, `${'文'.repeat(60)}.pdf`)],
    }
    expect(execute(owner, 'saveDraft', document)).toMatchObject({
      detail: {
        summary: { title: `${'文'.repeat(41)}....pdf`, fallbackOrdinal: 1 },
      },
    })

    const backToText = draftInput(text.threadId, 2)
    backToText.draft = {
      ...backToText.draft,
      text: '  Back   to text  ',
      images: [],
      documents: [],
    }
    expect(execute(owner, 'saveDraft', backToText)).toMatchObject({
      detail: { summary: { title: 'Back to text', fallbackOrdinal: 1 } },
    })

    const backToImage = draftInput(text.threadId, 3)
    backToImage.draft = {
      ...backToImage.draft,
      text: '',
      images: [imageInput(50_022)],
      documents: [],
    }
    expect(execute(owner, 'saveDraft', backToImage)).toMatchObject({
      detail: {
        summary: { title: 'Image · 2026-08-12 08:00:00', fallbackOrdinal: 1 },
      },
    })
    expect(
      execute(owner, 'startTurn', {
        threadId: text.threadId,
        requestId: 'request-generic',
        expectedDraftRevision: 4,
        userMessageId: 'user-generic',
        assistantMessageId: 'assistant-generic',
        startedAt: at(200),
      }),
    ).toMatchObject({
      detail: { summary: { fallbackLocalSecond: localSecond, fallbackOrdinal: 1 } },
    })

    const nonGeneric = materializeInput(22)
    execute(owner, 'materialize', nonGeneric)
    expect(
      execute(owner, 'startTurn', {
        threadId: nonGeneric.threadId,
        requestId: 'request-text',
        expectedDraftRevision: 0,
        userMessageId: 'user-text',
        assistantMessageId: 'assistant-text',
        startedAt: at(201),
      }),
    ).toMatchObject({
      detail: { summary: { title: 'Thread 22', fallbackLocalSecond: null, fallbackOrdinal: null } },
    })
    owner.close()
  })

  it('allocates generic ordinals from surviving max and restarts only after all identities disappear', async () => {
    const { owner } = await createOwner()
    const database = rawDatabase(owner)
    const createGeneric = (value: number) => {
      const input = materializeInput(value)
      input.draft.text = ''
      input.draft.images = [imageInput(50_000 + value)]
      return execute(owner, 'materialize', input)
    }

    expect([createGeneric(31), createGeneric(32), createGeneric(33)]).toMatchObject([
      { summary: { fallbackOrdinal: 1 } },
      { summary: { fallbackOrdinal: 2 } },
      { summary: { fallbackOrdinal: 3 } },
    ])
    database.prepare('DELETE FROM threads WHERE id = ?').run(uuid(32))
    expect(createGeneric(34)).toMatchObject({ summary: { fallbackOrdinal: 4 } })
    database.prepare('DELETE FROM threads WHERE id = ?').run(uuid(31))
    expect(createGeneric(35)).toMatchObject({ summary: { fallbackOrdinal: 5 } })
    database.prepare('DELETE FROM threads WHERE fallback_local_second = ?').run(localSecond)
    expect(createGeneric(36)).toMatchObject({ summary: { fallbackOrdinal: 1 } })
    owner.close()
  })

  it('saves one complete Draft CAS without moving activity for target-only or clear-only saves', async () => {
    const { owner } = await createOwner()
    const input = materializeInput(1)
    execute(owner, 'materialize', input)

    const saved = execute(owner, 'saveDraft', draftInput(input.threadId))
    expect(saved).toMatchObject({
      status: 'committed',
      detail: {
        summary: { lastUserActivityAt: at(100) },
        draft: { draftRevision: 1, text: 'Hello' },
        images: [{ owner: 'draft', turnOrdinal: null, position: 0 }],
        documents: [{ owner: 'draft', turnOrdinal: null, extractedText: 'notes' }],
      },
    })

    const targetOnly = draftInput(input.threadId, 1)
    targetOnly.draft.targetSelection = connectionSelection
    targetOnly.savedAt = at(101)
    expect(execute(owner, 'saveDraft', targetOnly)).toMatchObject({
      status: 'committed',
      detail: {
        summary: { lastUserActivityAt: at(100) },
        draft: { draftRevision: 2, targetSelection: connectionSelection },
      },
    })

    const cleared = draftInput(input.threadId, 2)
    cleared.draft = { ...cleared.draft, text: '', images: [], documents: [] }
    cleared.savedAt = at(102)
    expect(execute(owner, 'saveDraft', cleared)).toMatchObject({
      status: 'committed',
      detail: {
        summary: { lastUserActivityAt: at(102) },
        draft: { draftRevision: 3, text: '' },
        images: [],
        documents: [],
      },
    })
    expect(execute(owner, 'saveDraft', { ...cleared, expectedDraftRevision: 2 })).toEqual({
      status: 'conflict',
      canonicalDraftRevision: 3,
    })
    owner.close()
  })

  it('moves Draft resources once, binds and settles one terminal, repairs refs, and recovers pending idempotently', async () => {
    const { owner } = await createOwner()
    const first = materializeInput(2)
    execute(owner, 'materialize', first)
    const firstDraft = draftInput(first.threadId)
    firstDraft.draft.targetSelection = connectionSelection
    execute(owner, 'saveDraft', firstDraft)

    const startedAt = at(110)
    const started = execute(owner, 'startTurn', {
      threadId: first.threadId,
      requestId: 'request-start',
      expectedDraftRevision: 1,
      userMessageId: 'user-start',
      assistantMessageId: 'assistant-start',
      startedAt,
    })
    expect(started).toMatchObject({
      status: 'committed',
      detail: {
        draft: { draftRevision: 2, text: '' },
        turns: [{ ordinal: 0, assistantStatus: 'pending', userContent: 'Hello' }],
        images: [{ owner: 'turn', turnOrdinal: 0 }],
        documents: [{ owner: 'turn', turnOrdinal: 0 }],
      },
    })
    expect(
      execute(owner, 'startTurn', {
        threadId: first.threadId,
        requestId: 'request-race',
        expectedDraftRevision: 1,
        userMessageId: 'user-race',
        assistantMessageId: 'assistant-race',
        startedAt,
      }),
    ).toEqual({ status: 'conflict', canonicalDraftRevision: 2 })

    execute(owner, 'bindTurnTarget', {
      threadId: first.threadId,
      requestId: 'request-start',
      targetAttribution: connectionAttribution,
      boundAt: at(111),
    })
    const providerStateRef = {
      protocol: 'openai-responses' as const,
      stateId: uuid(40_003),
      executionIdentity: 'c'.repeat(64),
      byteLength: 16,
      sha256: 'd'.repeat(64),
    }
    const settled = execute(owner, 'settleTurn', {
      threadId: first.threadId,
      requestId: 'request-start',
      assistantStatus: 'completed',
      assistantContent: 'Done',
      error: null,
      providerStateRef,
      settledAt: at(112),
    })
    expect(settled).toMatchObject({
      summary: {
        resultRevision: 1,
        seenResultRevision: 0,
        lastUserActivityAt: startedAt,
      },
      turns: [{ assistantStatus: 'completed', providerStateId: providerStateRef.stateId }],
    })
    expect(() =>
      execute(owner, 'settleTurn', {
        threadId: first.threadId,
        requestId: 'request-start',
        assistantStatus: 'cancelled',
        assistantContent: '',
        error: null,
        providerStateRef: null,
        settledAt: at(113),
      }),
    ).toThrow('This turn is no longer pending.')
    expect(() =>
      execute(owner, 'settleTurn', {
        threadId: first.threadId,
        requestId: 'request-start',
        assistantStatus: 'failed',
        assistantContent: '',
        error: { code: 'unknown', message: 'The response failed unexpectedly.', retryable: true },
        providerStateRef: null,
        settledAt: at(113),
      }),
    ).toThrow('This turn is no longer pending.')

    expect(
      execute(owner, 'repairProviderStateRef', {
        threadId: first.threadId,
        requestId: 'request-start',
        providerStateRef,
        repairedAt: at(114),
      }),
    ).toMatchObject({
      turns: [{ assistantContent: 'Done', providerStateId: null }],
      providerStateRefs: [],
    })
    expect(
      execute(owner, 'setResourceAvailability', {
        threadId: first.threadId,
        images: [{ id: uuid(40_001), available: false }],
        documents: [{ id: uuid(40_002), available: false }],
        checkedAt: at(115),
      }),
    ).toMatchObject({
      images: [{ available: false }],
      documents: [{ available: false, extractedText: 'notes' }],
    })

    const second = materializeInput(3)
    execute(owner, 'materialize', second)
    const secondDraft = draftInput(second.threadId)
    secondDraft.draft.images = []
    secondDraft.draft.documents = []
    execute(owner, 'saveDraft', secondDraft)
    execute(owner, 'startTurn', {
      threadId: second.threadId,
      requestId: 'request-pending',
      expectedDraftRevision: 1,
      userMessageId: 'user-pending',
      assistantMessageId: 'assistant-pending',
      startedAt: at(116),
    })
    expect(execute(owner, 'recoverPending', { recoveredAt: at(117) })).toEqual({ recovered: 1 })
    expect(execute(owner, 'recoverPending', { recoveredAt: at(117) })).toEqual({ recovered: 0 })
    expect(execute(owner, 'readThread', { threadId: second.threadId })).toMatchObject({
      summary: { resultRevision: 1, lastUserActivityAt: at(116) },
      turns: [{ assistantStatus: 'failed', error: { retryable: true } }],
    })

    rawDatabase(owner)
      .prepare("UPDATE threads SET location = 'archived' WHERE id = ?")
      .run(second.threadId)
    expect(
      execute(owner, 'retryTurn', {
        threadId: second.threadId,
        turnOrdinal: 0,
        expectedAttemptRequestId: 'request-pending',
        requestId: 'request-retry',
        expectedDraftRevision: 2,
        retriedAt: at(118),
      }),
    ).toMatchObject({
      status: 'committed',
      detail: {
        summary: { location: 'available', threadRevision: 2 },
        turns: [{ attemptRequestId: 'request-retry', assistantStatus: 'pending' }],
      },
    })

    execute(owner, 'settleTurn', {
      threadId: second.threadId,
      requestId: 'request-retry',
      assistantStatus: 'failed',
      assistantContent: '',
      error: { code: 'unknown', message: 'The response failed unexpectedly.', retryable: true },
      providerStateRef: null,
      settledAt: at(119),
    })
    rawDatabase(owner)
      .prepare(
        "UPDATE threads SET location = 'trash', trashed_from_location = 'available' WHERE id = ?",
      )
      .run(second.threadId)
    expect(() =>
      execute(owner, 'retryTurn', {
        threadId: second.threadId,
        turnOrdinal: 0,
        expectedAttemptRequestId: 'request-retry',
        requestId: 'request-trash-retry',
        expectedDraftRevision: 2,
        retriedAt: at(120),
      }),
    ).toThrow('The Thread Library request is invalid.')
    owner.close()
  })

  it('serializes autosave and Send races and restores Archived only after the winning ack', async () => {
    const { databasePath, owner } = await createOwner()
    const input = materializeInput(4)
    execute(owner, 'materialize', input)
    execute(owner, 'saveDraft', draftInput(input.threadId))
    const staleSend = {
      threadId: input.threadId,
      requestId: 'request-stale',
      expectedDraftRevision: 0,
      userMessageId: 'user-stale',
      assistantMessageId: 'assistant-stale',
      startedAt: at(121),
    }
    expect(execute(owner, 'startTurn', staleSend)).toEqual({
      status: 'conflict',
      canonicalDraftRevision: 1,
    })
    expect(execute(owner, 'readThread', { threadId: input.threadId })).toMatchObject({
      turns: [],
      draft: { draftRevision: 1, text: 'Hello' },
    })

    rawDatabase(owner)
      .prepare("UPDATE threads SET location = 'archived' WHERE id = ?")
      .run(input.threadId)
    const archivedSave = draftInput(input.threadId, 1)
    archivedSave.draft.targetSelection = connectionSelection
    archivedSave.savedAt = at(121)
    expect(execute(owner, 'saveDraft', archivedSave)).toMatchObject({
      status: 'committed',
      detail: {
        summary: { location: 'archived', threadRevision: 1 },
        draft: { draftRevision: 2, targetSelection: connectionSelection },
      },
    })
    const winningSend = { ...staleSend, requestId: 'request-winning', expectedDraftRevision: 2 }
    expect(execute(owner, 'startTurn', winningSend)).toMatchObject({
      status: 'committed',
      detail: {
        summary: { location: 'available', threadRevision: 2 },
        turns: [{ attemptRequestId: 'request-winning', assistantStatus: 'pending' }],
      },
    })
    expect(execute(owner, 'startTurn', { ...winningSend, requestId: 'request-second' })).toEqual({
      status: 'conflict',
      canonicalDraftRevision: 3,
    })
    owner.close()
    const restarted = new ThreadLibraryDatabase()
    restarted.open({ databasePath })
    expect(execute(restarted, 'recoverPending', { recoveredAt: at(122) })).toEqual({
      recovered: 1,
    })
    expect(execute(restarted, 'recoverPending', { recoveredAt: at(122) })).toEqual({
      recovered: 0,
    })
    expect(execute(restarted, 'readThread', { threadId: input.threadId })).toMatchObject({
      summary: { resultRevision: 1, lastUserActivityAt: at(121) },
      turns: [{ assistantStatus: 'failed', error: { retryable: true } }],
    })
    restarted.close()
  })

  it('creates and reopens one private strict DELETE-journal database with native constraints', async () => {
    const { databasePath, owner } = await createOwner()
    const database = rawDatabase(owner)

    expect((await stat(join(databasePath, '..'))).mode & 0o777).toBe(0o700)
    expect((await stat(databasePath)).mode & 0o777).toBe(0o600)
    expect(database.prepare('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 1 })
    expect(database.prepare('PRAGMA journal_mode').get()).toEqual({ journal_mode: 'delete' })
    expect(database.prepare('PRAGMA trusted_schema').get()).toEqual({ trusted_schema: 0 })
    expect(database.prepare('PRAGMA secure_delete').get()).toEqual({ secure_delete: 1 })
    expect(database.prepare('PRAGMA quick_check').get()).toEqual({ quick_check: 'ok' })
    expect(schemaFingerprint(database)).toBe(expectedSchemaFingerprint)
    expect(
      database
        .prepare(
          "SELECT count(*) AS count FROM sqlite_schema WHERE type='table' AND sql LIKE '%STRICT%'",
        )
        .get(),
    ).toEqual({ count: 6 })

    const first = materializeInput(1)
    expect(execute(owner, 'materialize', first)).toMatchObject({ summary: { id: first.threadId } })
    const firstFallback = materializeInput(2)
    firstFallback.draft.text = ''
    firstFallback.draft.images = [
      {
        imageId: uuid(50_002),
        position: 0,
        mediaType: 'image/png',
        width: 2,
        height: 1,
        available: true,
      },
    ]
    const secondFallback = materializeInput(3)
    secondFallback.draft.text = ''
    secondFallback.draft.images = [
      {
        imageId: uuid(50_003),
        position: 0,
        mediaType: 'image/png',
        width: 2,
        height: 1,
        available: true,
      },
    ]
    expect(execute(owner, 'materialize', firstFallback)).toMatchObject({
      summary: { title: 'Image · 2026-08-12 08:00:00', fallbackOrdinal: 1 },
    })
    expect(execute(owner, 'materialize', secondFallback)).toMatchObject({
      summary: { title: 'Image · 2026-08-12 08:00:00 · 2', fallbackOrdinal: 2 },
    })
    expect(
      database.prepare('UPDATE threads SET fallback_ordinal = 3 WHERE id = ?').run(first.threadId)
        .changes,
    ).toBe(1)
    expect(() =>
      database
        .prepare(
          'UPDATE threads SET fallback_local_second = NULL, fallback_ordinal = 3 WHERE id = ?',
        )
        .run(first.threadId),
    ).toThrow()
    expect(() =>
      database
        .prepare("UPDATE threads SET title_source = 'manual' WHERE id = ?")
        .run(first.threadId),
    ).toThrow()
    expect(
      database
        .prepare(
          "UPDATE threads SET title = 'Manual', title_source = 'manual', fallback_local_second = NULL, fallback_ordinal = NULL WHERE id = ?",
        )
        .run(first.threadId).changes,
    ).toBe(1)
    database.exec(
      "CREATE TRIGGER fail_draft BEFORE INSERT ON drafts BEGIN SELECT RAISE(ABORT, 'fail'); END",
    )
    expect(() => execute(owner, 'materialize', materializeInput(4))).toThrow(
      'The Thread Library is unavailable.',
    )
    expect(execute(owner, 'readThread', { threadId: uuid(4) })).toBeNull()
    database.exec('DROP TRIGGER fail_draft')

    owner.close()
    const reopened = new ThreadLibraryDatabase()
    expect(reopened.open({ databasePath })).toEqual({ schemaVersion: 1 })
    expect(execute(reopened, 'readThread', { threadId: first.threadId })).toMatchObject({
      summary: { id: first.threadId },
      draft: { threadId: first.threadId },
      turns: [],
      images: [],
      documents: [],
      providerStateRefs: [],
    })
    const reopenedDatabase = rawDatabase(reopened)
    const imported = importedRows(900)
    execute(reopened, 'importV5', { rows: imported })
    for (const statement of [
      'UPDATE turns SET ordinal = 1 WHERE thread_id = ? AND ordinal = 0',
      "UPDATE turns SET user_message_id = 'other' WHERE thread_id = ? AND ordinal = 0",
      "UPDATE turns SET attempt_request_id = 'other' WHERE thread_id = ? AND ordinal = 0",
      "UPDATE turns SET assistant_content = 'other' WHERE thread_id = ? AND ordinal = 0",
      'UPDATE turns SET target_selection_json = \'{"kind":"env_fallback"}\' WHERE thread_id = ? AND ordinal = 0',
    ]) {
      expect(() => reopenedDatabase.prepare(statement).run(imported.thread.id)).toThrow()
    }
    expect(() =>
      reopenedDatabase
        .prepare('UPDATE provider_state_refs SET sha256 = ? WHERE state_id = ?')
        .run('e'.repeat(64), imported.providerStateRefs[0]!.stateId),
    ).toThrow()

    const twoTurns = importedRows(901)
    twoTurns.providerStateRefs = []
    twoTurns.turns[0]!.providerStateId = null
    twoTurns.turns.push({
      ...twoTurns.turns[0]!,
      ordinal: 1,
      attemptRequestId: 'request-901-2',
      userMessageId: 'user-901-2',
      assistantMessageId: 'assistant-901-2',
    })
    execute(reopened, 'importV5', { rows: twoTurns })
    expect(() =>
      reopenedDatabase
        .prepare(
          "UPDATE turns SET assistant_status = 'pending', assistant_content = '' WHERE thread_id = ? AND ordinal = 0",
        )
        .run(twoTurns.thread.id),
    ).toThrow()
    reopened.close()
  })

  it('classifies transaction failures without replaying or guessing', async () => {
    const { owner } = await createOwner()
    const database = rawDatabase(owner)
    const originalExec = database.exec.bind(database)

    Object.defineProperty(database, 'exec', {
      configurable: true,
      value(statement: string) {
        if (statement === 'BEGIN IMMEDIATE') {
          throw new Error('begin failed')
        }
        return originalExec(statement)
      },
    })
    expect(mutationOutcome(() => execute(owner, 'materialize', materializeInput(10)))).toBe(
      'definitely_not_committed',
    )

    Object.defineProperty(database, 'exec', {
      configurable: true,
      value(statement: string) {
        if (statement === 'COMMIT') {
          throw new Error('commit failed')
        }
        return originalExec(statement)
      },
    })
    expect(mutationOutcome(() => execute(owner, 'materialize', materializeInput(11)))).toBe(
      'definitely_not_committed',
    )

    Object.defineProperty(database, 'exec', {
      configurable: true,
      value(statement: string) {
        if (statement === 'COMMIT' || statement === 'ROLLBACK') {
          throw new Error('transaction state unknown')
        }
        return originalExec(statement)
      },
    })
    expect(mutationOutcome(() => execute(owner, 'materialize', materializeInput(12)))).toBe(
      'outcome_unknown',
    )

    delete (database as unknown as { exec?: unknown }).exec
    if (database.isTransaction) {
      database.exec('ROLLBACK')
    }
    expect(execute(owner, 'readThread', { threadId: uuid(10) })).toBeNull()
    expect(execute(owner, 'readThread', { threadId: uuid(11) })).toBeNull()
    expect(execute(owner, 'readThread', { threadId: uuid(12) })).toBeNull()
    owner.close()
  })

  it('rolls back materialize when its canonical detail cannot be read before commit', async () => {
    const { owner } = await createOwner()
    const database = rawDatabase(owner)
    const input = materializeInput(13)
    database.exec(`
      CREATE TRIGGER delete_new_draft AFTER INSERT ON drafts
      BEGIN DELETE FROM drafts WHERE thread_id = NEW.thread_id; END
    `)

    expect(() => execute(owner, 'materialize', input)).toThrow('This thread is unavailable.')
    expect(execute(owner, 'readThread', { threadId: input.threadId })).toBeNull()
    owner.close()
  })

  it('returns 137 rows in stable 50-row pages and rejects invalid or stale cursors', async () => {
    const { owner } = await createOwner()
    for (let value = 1; value <= 137; value += 1) {
      execute(owner, 'materialize', materializeInput(value))
    }

    const first = execute(owner, 'listPage', {
      location: 'available',
      cursor: null,
      limit: 50,
    })
    const second = execute(owner, 'listPage', {
      location: 'available',
      cursor: first.nextCursor,
      limit: 50,
    })
    const third = execute(owner, 'listPage', {
      location: 'available',
      cursor: second.nextCursor,
      limit: 50,
    })

    expect([first.rows.length, second.rows.length, third.rows.length]).toEqual([50, 50, 37])
    expect(first.rows[0]).toMatchObject({ availability: 'available', id: uuid(137) })
    expect(third.nextCursor).toBeNull()
    expect(new Set([...first.rows, ...second.rows, ...third.rows].map((row) => row.id)).size).toBe(
      137,
    )
    expect(() =>
      execute(owner, 'listPage', { location: 'available', cursor: 'not-a-cursor', limit: 50 }),
    ).toThrow('The Thread Library request is invalid.')

    execute(owner, 'materialize', materializeInput(138))
    expect(() =>
      execute(owner, 'listPage', {
        location: 'available',
        cursor: first.nextCursor,
        limit: 50,
      }),
    ).toThrow('The thread list changed. Reload it and try again.')
    owner.close()
  })

  it('validates cursor anchors and the lookahead row Pin grouping', async () => {
    const { owner } = await createOwner()
    for (let value = 1; value <= 51; value += 1) {
      execute(owner, 'materialize', materializeInput(value))
    }
    const first = execute(owner, 'listPage', {
      location: 'available',
      cursor: null,
      limit: 50,
    })
    expect(first.nextCursor).not.toBeNull()

    const database = rawDatabase(owner)
    database.exec('PRAGMA ignore_check_constraints = ON')
    const anchorId = first.rows.at(-1)!.id
    database.prepare('UPDATE threads SET pin_position = 0 WHERE id = ?').run(anchorId)
    expect(() =>
      execute(owner, 'listPage', {
        location: 'available',
        cursor: first.nextCursor,
        limit: 50,
      }),
    ).toThrow('The Thread Library is unavailable.')

    database.prepare('UPDATE threads SET pin_position = NULL WHERE id = ?').run(anchorId)
    database.prepare("UPDATE threads SET location = 'archived'").run()
    database.prepare('UPDATE threads SET pin_position = 1 WHERE id = ?').run(uuid(1))
    expect(() =>
      execute(owner, 'listPage', { location: 'archived', cursor: null, limit: 50 }),
    ).toThrow('The Thread Library is unavailable.')
    owner.close()
  })

  it.each([
    {
      location: 'available' as const,
      move: '',
      column: 'last_user_activity_at',
    },
    {
      location: 'archived' as const,
      move: "UPDATE threads SET location = 'archived'",
      column: 'last_user_activity_at',
    },
    {
      location: 'trash' as const,
      move: "UPDATE threads SET location = 'trash', trashed_from_location = 'available'",
      column: 'updated_at',
    },
  ])('fails closed when a $location row has a corrupt order timestamp', async (testCase) => {
    const { owner } = await createOwner()
    const input = materializeInput(52)
    execute(owner, 'materialize', input)

    const database = rawDatabase(owner)
    database.exec('PRAGMA ignore_check_constraints = ON')
    if (testCase.move) database.exec(testCase.move)
    database
      .prepare(`UPDATE threads SET ${testCase.column} = 'not-a-timestamp' WHERE id = ?`)
      .run(input.threadId)

    expect(() =>
      execute(owner, 'listPage', { location: testCase.location, cursor: null, limit: 50 }),
    ).toThrow('The Thread Library is unavailable.')
    owner.close()
  })

  it.each([
    {
      location: 'available' as const,
      move: '',
      column: 'updated_at',
      pinPosition: null,
    },
    {
      location: 'available' as const,
      move: 'UPDATE threads SET pin_position = 1',
      column: 'last_user_activity_at',
      pinPosition: 1,
    },
    {
      location: 'archived' as const,
      move: "UPDATE threads SET location = 'archived'",
      column: 'updated_at',
      pinPosition: null,
    },
    {
      location: 'trash' as const,
      move: "UPDATE threads SET location = 'trash', trashed_from_location = 'available'",
      column: 'last_user_activity_at',
      pinPosition: null,
    },
  ])(
    'keeps a $location row thread-scoped when only a non-order timestamp is corrupt',
    async (testCase) => {
      const { owner } = await createOwner()
      const input = materializeInput(53)
      execute(owner, 'materialize', input)

      const database = rawDatabase(owner)
      database.exec('PRAGMA ignore_check_constraints = ON')
      if (testCase.move) database.exec(testCase.move)
      database
        .prepare(`UPDATE threads SET ${testCase.column} = 'not-a-timestamp' WHERE id = ?`)
        .run(input.threadId)

      expect(
        execute(owner, 'listPage', {
          location: testCase.location,
          cursor: null,
          limit: 50,
        }).rows,
      ).toEqual([
        {
          availability: 'unavailable',
          id: input.threadId,
          location: testCase.location,
          pinPosition: testCase.pinPosition,
        },
      ])
      expect(() => execute(owner, 'readThread', { threadId: input.threadId })).toThrow(
        'This thread is unavailable.',
      )
      owner.close()
    },
  )

  it('fails closed when a page-tail cursor anchor has corrupt order timestamps', async () => {
    const { owner } = await createOwner()
    for (let value = 1; value <= 51; value += 1) {
      execute(owner, 'materialize', materializeInput(value))
    }
    const first = execute(owner, 'listPage', {
      location: 'available',
      cursor: null,
      limit: 50,
    })
    expect(first.nextCursor).not.toBeNull()

    const database = rawDatabase(owner)
    database.exec('PRAGMA ignore_check_constraints = ON')
    database
      .prepare(
        "UPDATE threads SET last_user_activity_at = last_user_activity_at || ' ' WHERE id = ?",
      )
      .run(first.rows.at(-1)!.id)

    expect(() =>
      execute(owner, 'listPage', {
        location: 'available',
        cursor: first.nextCursor,
        limit: 50,
      }),
    ).toThrow('The Thread Library is unavailable.')
    owner.close()
  })

  it('fails closed when the lookahead row has corrupt order timestamps', async () => {
    const { owner } = await createOwner()
    for (let value = 1; value <= 51; value += 1) {
      execute(owner, 'materialize', materializeInput(value))
    }

    const database = rawDatabase(owner)
    const lookahead = database
      .prepare(
        `SELECT id FROM threads WHERE location = 'available'
         ORDER BY CASE WHEN pin_position IS NULL THEN 1 ELSE 0 END,
                  pin_position ASC, last_user_activity_at DESC, created_at DESC, id ASC
         LIMIT 1 OFFSET 50`,
      )
      .get() as { id: string }
    database.exec('PRAGMA ignore_check_constraints = ON')
    database
      .prepare(
        "UPDATE threads SET last_user_activity_at = last_user_activity_at || ' ' WHERE id = ?",
      )
      .run(lookahead.id)
    expect(
      database
        .prepare(
          `SELECT id FROM threads WHERE location = 'available'
           ORDER BY CASE WHEN pin_position IS NULL THEN 1 ELSE 0 END,
                    pin_position ASC, last_user_activity_at DESC, created_at DESC, id ASC
           LIMIT 1 OFFSET 50`,
        )
        .get(),
    ).toMatchObject({ id: lookahead.id })

    expect(() =>
      execute(owner, 'listPage', { location: 'available', cursor: null, limit: 50 }),
    ).toThrow('The Thread Library is unavailable.')
    owner.close()
  })

  it('imports semantic resources exactly once and rolls back conflicts or disk-full writes', async () => {
    const { root, owner } = await createOwner()
    const rows = importedRows(500)
    const legacyPath = join(root, 'current-thread.json')
    await writeFile(legacyPath, JSON.stringify({ untouched: true }))
    const legacyHash = await hashFile(legacyPath)

    expect(execute(owner, 'importV5', { rows })).toEqual({
      threadId: rows.thread.id,
      imported: true,
    })
    expect(execute(owner, 'importV5', { rows })).toEqual({
      threadId: rows.thread.id,
      imported: false,
    })
    expect(execute(owner, 'readThread', { threadId: rows.thread.id })).toMatchObject({
      summary: rows.thread,
      images: rows.images,
      documents: rows.documents,
      providerStateRefs: rows.providerStateRefs,
    })
    expect(() =>
      execute(owner, 'importV5', {
        rows: { ...rows, turns: [{ ...rows.turns[0]!, assistantContent: 'Different' }] },
      }),
    ).toThrow('This thread already exists.')

    const database = rawDatabase(owner)
    const pageCount = Number(database.prepare('PRAGMA page_count').get()!.page_count)
    database.exec(`PRAGMA max_page_count = ${pageCount}`)
    const fullRows = importedRows(501, 'x'.repeat(1024 * 1024))
    expect(() => execute(owner, 'importV5', { rows: fullRows })).toThrow(
      'The Thread Library is unavailable.',
    )
    expect(execute(owner, 'readThread', { threadId: fullRows.thread.id })).toBeNull()
    expect(await hashFile(legacyPath)).toBe(legacyHash)
    owner.close()
  })

  it('imports one collision-safe generic legacy title exactly once', async () => {
    const { owner } = await createOwner()
    const rows = importedRows(600)
    rows.thread.title = 'Image · 2026-08-12 08:00:00'
    rows.thread.fallbackLocalSecond = localSecond
    rows.thread.fallbackOrdinal = 1

    expect(execute(owner, 'importV5', { rows })).toEqual({
      threadId: rows.thread.id,
      imported: true,
    })
    expect(execute(owner, 'importV5', { rows })).toEqual({
      threadId: rows.thread.id,
      imported: false,
    })
    expect(execute(owner, 'readThread', { threadId: rows.thread.id })).toMatchObject({
      summary: {
        title: rows.thread.title,
        fallbackLocalSecond: localSecond,
        fallbackOrdinal: 1,
      },
    })
    const future = materializeInput(601)
    future.draft.text = ''
    future.draft.images = [imageInput(50_601)]
    expect(execute(owner, 'materialize', future)).toMatchObject({
      summary: { title: 'Image · 2026-08-12 08:00:00 · 2', fallbackOrdinal: 2 },
    })
    owner.close()
  })

  it('keeps corrupt content thread-scoped when identity is safe and escalates bad identity', async () => {
    const { owner } = await createOwner()
    const input = materializeInput(700)
    execute(owner, 'materialize', input)
    const database = rawDatabase(owner)
    database.exec('PRAGMA ignore_check_constraints = ON')
    database.prepare('UPDATE threads SET pin_position = 1 WHERE id = ?').run(input.threadId)
    expect(
      execute(owner, 'listPage', { location: 'available', cursor: null, limit: 50 }).rows,
    ).toMatchObject([{ availability: 'available', id: input.threadId, pinPosition: 1 }])

    database.prepare("UPDATE threads SET title = '' WHERE id = ?").run(input.threadId)

    expect(
      execute(owner, 'listPage', { location: 'available', cursor: null, limit: 50 }).rows,
    ).toEqual([
      {
        availability: 'unavailable',
        id: input.threadId,
        location: 'available',
        pinPosition: 1,
      },
    ])
    expect(() => execute(owner, 'readThread', { threadId: input.threadId })).toThrow(
      'This thread is unavailable.',
    )

    database.prepare('UPDATE threads SET pin_position = 0 WHERE id = ?').run(input.threadId)
    expect(() =>
      execute(owner, 'listPage', { location: 'available', cursor: null, limit: 50 }),
    ).toThrow('The Thread Library is unavailable.')
    expect(() => execute(owner, 'readThread', { threadId: input.threadId })).toThrow(
      'The Thread Library is unavailable.',
    )

    database
      .prepare("UPDATE threads SET location = 'archived', pin_position = 1 WHERE id = ?")
      .run(input.threadId)
    expect(() =>
      execute(owner, 'listPage', { location: 'archived', cursor: null, limit: 50 }),
    ).toThrow('The Thread Library is unavailable.')

    database.prepare("UPDATE threads SET location = 'broken' WHERE id = ?").run(input.threadId)
    expect(() => execute(owner, 'readThread', { threadId: input.threadId })).toThrow(
      'The Thread Library is unavailable.',
    )
    owner.close()
  })

  it('fails closed without replacing an existing invalid, insecure, or mismatched database', async () => {
    const root = await mkdtemp(join(tmpdir(), 'nyx-thread-library-invalid-'))
    tempDirs.push(root)
    const parent = join(root, 'library')
    const databasePath = join(parent, 'library.sqlite')
    await mkdir(parent, { mode: 0o700 })
    await writeFile(databasePath, 'not sqlite')
    await chmod(databasePath, 0o600)
    const original = await readFile(databasePath)

    expect(() => new ThreadLibraryDatabase().open({ databasePath })).toThrow(
      'The Thread Library is unavailable.',
    )
    expect(await readFile(databasePath)).toEqual(original)

    await chmod(databasePath, 0o644)
    expect(() => new ThreadLibraryDatabase().open({ databasePath })).toThrow(
      'The Thread Library is unavailable.',
    )
    expect(await readFile(databasePath)).toEqual(original)

    const sqliteHeaderOnly = Buffer.alloc(100)
    sqliteHeaderOnly.write('SQLite format 3\0')
    await writeFile(databasePath, sqliteHeaderOnly)
    await chmod(databasePath, 0o600)
    expect((await stat(databasePath)).mode & 0o777).toBe(0o600)
    const openFailure = await readFile(databasePath)
    expect(() => new ThreadLibraryDatabase().open({ databasePath })).toThrow(
      'The Thread Library is unavailable.',
    )
    expect(await readFile(databasePath)).toEqual(openFailure)

    await rm(databasePath)
    const valid = new ThreadLibraryDatabase()
    valid.open({ databasePath })
    valid.close()
    const raw = new DatabaseSync(databasePath)
    raw.exec('DROP INDEX threads_pin_position')
    raw.close()
    const mismatchedHash = await hashFile(databasePath)
    expect(() => new ThreadLibraryDatabase().open({ databasePath })).toThrow(
      'The Thread Library is unavailable.',
    )
    expect(await hashFile(databasePath)).toBe(mismatchedHash)

    await chmod(databasePath, 0o600)
    const sameNames = new DatabaseSync(databasePath)
    sameNames.exec(
      'CREATE UNIQUE INDEX threads_pin_position ON threads(pin_position) WHERE pin_position IS NOT NULL',
    )
    sameNames.close()
    const wrongDefinitionHash = await hashFile(databasePath)
    expect(() => new ThreadLibraryDatabase().open({ databasePath })).toThrow(
      'The Thread Library is unavailable.',
    )
    expect(await hashFile(databasePath)).toBe(wrongDefinitionHash)
  })

  it('preserves clean required-pragma and quick-check failures byte-for-byte', async () => {
    for (const corrupt of [
      (database: DatabaseSync) => database.exec('PRAGMA user_version = 2'),
      (database: DatabaseSync) => {
        database.exec('PRAGMA ignore_check_constraints = ON')
        database
          .prepare('INSERT INTO threads VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .run(
            uuid(830),
            'available',
            null,
            null,
            null,
            '',
            'auto',
            null,
            null,
            1,
            timestamp,
            0,
            0,
            timestamp,
            timestamp,
          )
        database
          .prepare('INSERT INTO drafts VALUES (?, 0, ?, ?, ?)')
          .run(uuid(830), '', '{"kind":"env_fallback"}', timestamp)
      },
    ]) {
      const { databasePath, owner } = await createOwner()
      owner.close()
      const raw = new DatabaseSync(databasePath)
      corrupt(raw)
      raw.close()
      const before = await hashFile(databasePath)

      expect(() => new ThreadLibraryDatabase().open({ databasePath })).toThrow(
        'The Thread Library is unavailable.',
      )
      expect(await hashFile(databasePath)).toBe(before)
    }
  })

  it('recovers a real spilled hot DELETE journal to the pre-transaction state', async () => {
    const { databasePath, owner } = await createOwner()
    owner.close()
    const journalPath = `${databasePath}-journal`
    const crashed = spawnSync(process.execPath, [
      '-e',
      `const { DatabaseSync } = require('node:sqlite');
       const database = new DatabaseSync(${JSON.stringify(databasePath)});
       database.exec('PRAGMA cache_size=1; BEGIN IMMEDIATE');
       database.prepare('INSERT INTO threads VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
         ${JSON.stringify(uuid(800))}, 'available', null, null, null, 'Uncommitted', 'auto',
         null, null, 1, ${JSON.stringify(timestamp)}, 0, 0, ${JSON.stringify(timestamp)},
         ${JSON.stringify(timestamp)}
       );
       database.prepare('INSERT INTO drafts VALUES (?, 0, ?, ?, ?)').run(
         ${JSON.stringify(uuid(800))}, 'x'.repeat(2_000_000), '{"kind":"env_fallback"}',
         ${JSON.stringify(timestamp)}
       );
       process.kill(process.pid, 'SIGKILL');`,
    ])
    expect(crashed.signal).toBe('SIGKILL')
    expect((await stat(journalPath)).size).toBeGreaterThan(0)
    const databaseBefore = await hashFile(databasePath)
    const recovered = new ThreadLibraryDatabase()
    expect(recovered.open({ databasePath })).toEqual({ schemaVersion: 1 })
    expect(execute(recovered, 'readThread', { threadId: uuid(800) })).toBeNull()
    expect(await hashFile(databasePath)).not.toBe(databaseBefore)
    expect(await stat(journalPath).catch(() => null)).toBeNull()
    recovered.close()
  })

  it('fails closed after SQLite encounters a corrupt hot journal', async () => {
    const { databasePath, owner } = await createOwner()
    const database = rawDatabase(owner)
    const input = materializeInput(810)
    execute(owner, 'materialize', input)
    database
      .prepare('UPDATE drafts SET text = ? WHERE thread_id = ?')
      .run('a'.repeat(2_000_000), input.threadId)
    owner.close()

    const journalPath = `${databasePath}-journal`
    const crashed = spawnSync(process.execPath, [
      '-e',
      `const { DatabaseSync } = require('node:sqlite');
       const database = new DatabaseSync(${JSON.stringify(databasePath)});
       database.exec('PRAGMA cache_size=1; BEGIN IMMEDIATE');
       database.prepare('UPDATE drafts SET text = ? WHERE thread_id = ?').run(
         'b'.repeat(2_000_000), ${JSON.stringify(input.threadId)}
       );
       process.kill(process.pid, 'SIGKILL');`,
    ])
    expect(crashed.signal).toBe('SIGKILL')
    const journal = await readFile(journalPath)
    expect(journal.byteLength).toBeGreaterThan(520)
    journal[520] = (journal[520] ?? 0) ^ 0xff
    await writeFile(journalPath, journal)

    const failed = new ThreadLibraryDatabase()
    expect(() => failed.open({ databasePath })).toThrow('The Thread Library is unavailable.')
    expect(() => execute(failed, 'readThread', { threadId: input.threadId })).toThrow(
      'The Thread Library is unavailable.',
    )
    const retained = await readFile(databasePath)
    expect(retained.subarray(0, 16).toString()).toBe('SQLite format 3\0')
    expect(retained.byteLength).toBeGreaterThan(0)
  })

  it('rejects foreign-key corruption without changing a clean database', async () => {
    const { databasePath, owner } = await createOwner()
    owner.close()
    const raw = new DatabaseSync(databasePath, { enableForeignKeyConstraints: false })
    raw
      .prepare('INSERT INTO images VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(uuid(820), uuid(821), 'draft', null, 0, 'image/png', 1, 1, 0)
    raw.close()
    const before = await hashFile(databasePath)

    expect(() => new ThreadLibraryDatabase().open({ databasePath })).toThrow(
      'The Thread Library is unavailable.',
    )
    expect(await hashFile(databasePath)).toBe(before)
  })
})
