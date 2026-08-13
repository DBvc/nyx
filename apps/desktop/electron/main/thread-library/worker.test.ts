import { createHash } from 'node:crypto'
import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { DatabaseSync } from 'node:sqlite'

import { afterEach, beforeAll, describe, expect, it } from 'vitest'

import type {
  ImportedV5Rows,
  ThreadLibraryOperation,
  ThreadLibraryOperationInput,
  ThreadLibraryOperationValue,
  ThreadLibraryRequest,
} from './protocol'

let ThreadLibraryDatabase: (typeof import('./worker'))['ThreadLibraryDatabase']
const tempDirs: string[] = []
const timestamp = '2026-08-12T00:00:00.000Z'
const localSecond = '2026-08-12T08:00:00'
const targetSelection = { kind: 'env_fallback' } as const
const expectedSchemaFingerprint = 'a0824fc5e3d1b3eace6540f42e997517d2cbf1b7869da9094a181e7e4056c746'
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
    title: `Thread ${value}`,
    targetSelection,
    fallbackLocalSecond: null,
    createdAt: at(value),
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
    const firstFallback = {
      ...materializeInput(2),
      title: 'Image · 2026-08-12 08:00:00',
      fallbackLocalSecond: localSecond,
    }
    const secondFallback = {
      ...materializeInput(3),
      title: firstFallback.title,
      fallbackLocalSecond: localSecond,
    }
    expect(execute(owner, 'materialize', firstFallback)).toMatchObject({
      summary: { title: firstFallback.title, fallbackOrdinal: 1 },
    })
    expect(execute(owner, 'materialize', secondFallback)).toMatchObject({
      summary: { title: `${firstFallback.title} · 2`, fallbackOrdinal: 2 },
    })
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
    owner.close()
  })

  it('keeps corrupt content thread-scoped when identity is safe and escalates bad identity', async () => {
    const { owner } = await createOwner()
    const input = materializeInput(700)
    execute(owner, 'materialize', input)
    const database = rawDatabase(owner)
    database.exec('PRAGMA ignore_check_constraints = ON')
    database.prepare("UPDATE threads SET title = '' WHERE id = ?").run(input.threadId)

    expect(
      execute(owner, 'listPage', { location: 'available', cursor: null, limit: 50 }).rows,
    ).toEqual([{ availability: 'unavailable', id: input.threadId, location: 'available' }])
    expect(() => execute(owner, 'readThread', { threadId: input.threadId })).toThrow(
      'This thread is unavailable.',
    )

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
