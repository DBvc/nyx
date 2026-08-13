import { createHash, randomUUID } from 'node:crypto'
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readSync,
  closeSync,
  unlinkSync,
} from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync, type StatementSync } from 'node:sqlite'
import { isDeepStrictEqual } from 'node:util'
import { isMainThread, parentPort } from 'node:worker_threads'

import { nyxChatDocumentLimits } from '../../../shared/chat/document-file'
import { nyxChatImageLimits } from '../../../shared/chat/image-file'
import {
  importedV5RowsSchema,
  parseThreadLibraryListRow,
  parseThreadLibraryThreadDetail,
  parseThreadLibraryThreadIdentity,
  parseThreadLibraryRequest,
  threadLibrarySafeErrorMessages,
  type ImportedV5Rows,
  type ThreadLibraryMutationOutcome,
  type ThreadLibraryOperationInput,
  type ThreadLibraryOperationValue,
  type ThreadLibraryRequest,
  type ThreadLibrarySafeErrorCode,
  type ThreadLibraryListRow,
  type ThreadLibraryThreadDetail,
} from './protocol'

const schemaVersion = 1
const sqliteHeader = Buffer.from('SQLite format 3\0')
const expectedSchemaFingerprint = 'a0824fc5e3d1b3eace6540f42e997517d2cbf1b7869da9094a181e7e4056c746'

const schemaSql = `
  CREATE TABLE threads (
    id TEXT PRIMARY KEY CHECK(length(id) = 36),
    location TEXT NOT NULL CHECK(location IN ('available', 'archived', 'trash')),
    trashed_from_location TEXT CHECK(trashed_from_location IN ('available', 'archived')),
    trashed_pin_position INTEGER CHECK(trashed_pin_position IS NULL OR trashed_pin_position > 0),
    pin_position INTEGER CHECK(pin_position IS NULL OR pin_position > 0),
    title TEXT NOT NULL CHECK(length(title) > 0),
    title_source TEXT NOT NULL CHECK(title_source IN ('auto', 'manual')),
    fallback_local_second TEXT,
    fallback_ordinal INTEGER CHECK(fallback_ordinal IS NULL OR fallback_ordinal > 0),
    thread_revision INTEGER NOT NULL CHECK(thread_revision > 0),
    last_user_activity_at TEXT NOT NULL CHECK(length(last_user_activity_at) > 0),
    result_revision INTEGER NOT NULL CHECK(result_revision >= 0),
    seen_result_revision INTEGER NOT NULL CHECK(seen_result_revision >= 0 AND seen_result_revision <= result_revision),
    created_at TEXT NOT NULL CHECK(length(created_at) > 0),
    updated_at TEXT NOT NULL CHECK(length(updated_at) > 0),
    CHECK(
      (location = 'trash' AND trashed_from_location IS NOT NULL) OR
      (location <> 'trash' AND trashed_from_location IS NULL AND trashed_pin_position IS NULL)
    ),
    CHECK(trashed_pin_position IS NULL OR trashed_from_location = 'available'),
    CHECK(pin_position IS NULL OR location = 'available'),
    CHECK((fallback_local_second IS NULL) = (fallback_ordinal IS NULL)),
    CHECK(title_source <> 'manual' OR fallback_local_second IS NULL),
    CHECK(
      fallback_local_second IS NULL OR (
        title_source = 'auto' AND title IN (
          'Image · ' || replace(fallback_local_second, 'T', ' ') ||
            CASE WHEN fallback_ordinal = 1 THEN '' ELSE ' · ' || fallback_ordinal END,
          'Untitled draft · ' || replace(fallback_local_second, 'T', ' ') ||
            CASE WHEN fallback_ordinal = 1 THEN '' ELSE ' · ' || fallback_ordinal END
        )
      )
    )
  ) STRICT;

  CREATE UNIQUE INDEX threads_pin_position
    ON threads(pin_position) WHERE location = 'available' AND pin_position IS NOT NULL;
  CREATE UNIQUE INDEX threads_fallback_identity
    ON threads(fallback_local_second, fallback_ordinal)
    WHERE fallback_local_second IS NOT NULL;

  CREATE TABLE drafts (
    thread_id TEXT PRIMARY KEY REFERENCES threads(id) ON DELETE CASCADE,
    draft_revision INTEGER NOT NULL CHECK(draft_revision >= 0),
    text TEXT NOT NULL,
    target_selection_json TEXT NOT NULL CHECK(json_valid(target_selection_json)),
    updated_at TEXT NOT NULL CHECK(length(updated_at) > 0)
  ) STRICT;

  CREATE TABLE turns (
    thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
    ordinal INTEGER NOT NULL CHECK(ordinal >= 0),
    attempt_request_id TEXT NOT NULL CHECK(length(attempt_request_id) > 0),
    user_message_id TEXT NOT NULL CHECK(length(user_message_id) > 0),
    assistant_message_id TEXT NOT NULL CHECK(length(assistant_message_id) > 0),
    user_content TEXT NOT NULL,
    assistant_content TEXT NOT NULL,
    assistant_status TEXT NOT NULL CHECK(assistant_status IN ('pending', 'completed', 'cancelled', 'failed')),
    error_json TEXT CHECK(error_json IS NULL OR json_valid(error_json)),
    target_selection_json TEXT NOT NULL CHECK(json_valid(target_selection_json)),
    target_attribution_json TEXT CHECK(target_attribution_json IS NULL OR json_valid(target_attribution_json)),
    created_at TEXT NOT NULL CHECK(length(created_at) > 0),
    updated_at TEXT NOT NULL CHECK(length(updated_at) > 0),
    PRIMARY KEY(thread_id, ordinal),
    UNIQUE(thread_id, attempt_request_id),
    UNIQUE(thread_id, user_message_id),
    UNIQUE(thread_id, assistant_message_id),
    CHECK(
      (assistant_status = 'failed' AND error_json IS NOT NULL) OR
      (assistant_status <> 'failed' AND error_json IS NULL)
    ),
    CHECK(assistant_status <> 'pending' OR assistant_content = '')
  ) STRICT;

  CREATE UNIQUE INDEX turns_one_pending
    ON turns(thread_id) WHERE assistant_status = 'pending';

  CREATE TRIGGER turns_pending_must_be_last
  BEFORE INSERT ON turns
  WHEN NEW.assistant_status = 'pending' AND EXISTS (
    SELECT 1 FROM turns WHERE thread_id = NEW.thread_id AND ordinal >= NEW.ordinal
  )
  BEGIN SELECT RAISE(ABORT, 'pending turn must be final'); END;

  CREATE TRIGGER turns_cannot_follow_pending
  BEFORE INSERT ON turns
  WHEN EXISTS (
    SELECT 1 FROM turns
    WHERE thread_id = NEW.thread_id AND assistant_status = 'pending' AND ordinal < NEW.ordinal
  )
  BEGIN SELECT RAISE(ABORT, 'turn cannot follow pending'); END;

  CREATE TRIGGER turns_update_pending_must_be_last
  BEFORE UPDATE OF assistant_status, ordinal ON turns
  WHEN NEW.assistant_status = 'pending' AND EXISTS (
    SELECT 1 FROM turns
    WHERE thread_id = NEW.thread_id AND ordinal > NEW.ordinal
  )
  BEGIN SELECT RAISE(ABORT, 'pending turn must be final'); END;

  CREATE TRIGGER turns_identity_is_immutable
  BEFORE UPDATE OF thread_id, ordinal, user_message_id, assistant_message_id, user_content, created_at
  ON turns
  BEGIN SELECT RAISE(ABORT, 'turn identity is immutable'); END;

  CREATE TABLE images (
    id TEXT PRIMARY KEY CHECK(length(id) = 36),
    thread_id TEXT NOT NULL,
    owner TEXT NOT NULL CHECK(owner IN ('draft', 'turn')),
    turn_ordinal INTEGER,
    position INTEGER NOT NULL CHECK(position >= 0),
    media_type TEXT NOT NULL CHECK(media_type IN ('image/png', 'image/jpeg')),
    width INTEGER NOT NULL CHECK(width > 0),
    height INTEGER NOT NULL CHECK(height > 0),
    available INTEGER NOT NULL CHECK(available IN (0, 1)),
    FOREIGN KEY(thread_id) REFERENCES threads(id) ON DELETE CASCADE,
    FOREIGN KEY(thread_id, turn_ordinal) REFERENCES turns(thread_id, ordinal) ON DELETE CASCADE,
    CHECK((owner = 'draft' AND turn_ordinal IS NULL) OR (owner = 'turn' AND turn_ordinal IS NOT NULL))
  ) STRICT;

  CREATE UNIQUE INDEX images_draft_position
    ON images(thread_id, position) WHERE owner = 'draft';
  CREATE UNIQUE INDEX images_turn_position
    ON images(thread_id, turn_ordinal, position) WHERE owner = 'turn';

  CREATE TABLE documents (
    id TEXT PRIMARY KEY CHECK(length(id) = 36),
    thread_id TEXT NOT NULL,
    owner TEXT NOT NULL CHECK(owner IN ('draft', 'turn')),
    turn_ordinal INTEGER,
    position INTEGER NOT NULL CHECK(position >= 0),
    name TEXT NOT NULL CHECK(length(name) > 0),
    media_type TEXT NOT NULL,
    byte_length INTEGER NOT NULL CHECK(byte_length > 0),
    extracted_byte_length INTEGER NOT NULL CHECK(extracted_byte_length > 0),
    source_sha256 TEXT NOT NULL CHECK(length(source_sha256) = 64),
    extracted_text_sha256 TEXT NOT NULL CHECK(length(extracted_text_sha256) = 64),
    available INTEGER NOT NULL CHECK(available IN (0, 1)),
    extracted_text TEXT,
    FOREIGN KEY(thread_id) REFERENCES threads(id) ON DELETE CASCADE,
    FOREIGN KEY(thread_id, turn_ordinal) REFERENCES turns(thread_id, ordinal) ON DELETE CASCADE,
    CHECK((owner = 'draft' AND turn_ordinal IS NULL) OR (owner = 'turn' AND turn_ordinal IS NOT NULL)),
    CHECK((available = 1 AND extracted_text IS NOT NULL) OR (available = 0 AND extracted_text IS NULL))
  ) STRICT;

  CREATE UNIQUE INDEX documents_draft_position
    ON documents(thread_id, position) WHERE owner = 'draft';
  CREATE UNIQUE INDEX documents_turn_position
    ON documents(thread_id, turn_ordinal, position) WHERE owner = 'turn';

  CREATE TABLE provider_state_refs (
    state_id TEXT PRIMARY KEY CHECK(length(state_id) = 36),
    thread_id TEXT NOT NULL,
    turn_ordinal INTEGER NOT NULL,
    protocol TEXT NOT NULL CHECK(protocol = 'openai-responses'),
    execution_identity TEXT NOT NULL CHECK(length(execution_identity) = 64),
    byte_length INTEGER NOT NULL CHECK(byte_length > 0),
    sha256 TEXT NOT NULL CHECK(length(sha256) = 64),
    UNIQUE(thread_id, turn_ordinal),
    FOREIGN KEY(thread_id, turn_ordinal) REFERENCES turns(thread_id, ordinal) ON DELETE CASCADE
  ) STRICT;

  CREATE TRIGGER provider_state_requires_completed
  BEFORE INSERT ON provider_state_refs
  WHEN NOT EXISTS (
    SELECT 1 FROM turns
    WHERE thread_id = NEW.thread_id
      AND ordinal = NEW.turn_ordinal
      AND assistant_status = 'completed'
  )
  BEGIN SELECT RAISE(ABORT, 'provider state requires completed turn'); END;

  CREATE TRIGGER turns_update_preserves_provider_state
  BEFORE UPDATE OF attempt_request_id, assistant_content, assistant_status,
    target_selection_json, target_attribution_json ON turns
  WHEN EXISTS (
    SELECT 1 FROM provider_state_refs
    WHERE thread_id = OLD.thread_id AND turn_ordinal = OLD.ordinal
  ) AND (
    NEW.attempt_request_id <> OLD.attempt_request_id OR
    NEW.assistant_content <> OLD.assistant_content OR
    NEW.assistant_status <> 'completed' OR
    NEW.target_selection_json <> OLD.target_selection_json OR
    NEW.target_attribution_json IS NOT OLD.target_attribution_json
  )
  BEGIN SELECT RAISE(ABORT, 'provider state requires completed turn'); END;

  CREATE TRIGGER provider_state_is_immutable
  BEFORE UPDATE ON provider_state_refs
  BEGIN SELECT RAISE(ABORT, 'provider state identity is immutable'); END;
`

function normalizeSchemaSql(value: string) {
  return value.replace(/\s+/gu, ' ').trim()
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
      [row.type, row.name, row.tbl_name, normalizeSchemaSql(String(row.sql ?? ''))].join('\u0000'),
    )
    .join('\n')
  return createHash('sha256').update(sql).digest('hex')
}

class DatabaseOperationError extends Error {
  constructor(
    readonly code: ThreadLibrarySafeErrorCode,
    readonly outcome: ThreadLibraryMutationOutcome = 'definitely_not_committed',
  ) {
    super(threadLibrarySafeErrorMessages[code])
    this.name = 'DatabaseOperationError'
  }
}

function json(value: unknown) {
  return JSON.stringify(value)
}

function parseJson(value: unknown) {
  if (typeof value !== 'string') {
    throw new DatabaseOperationError('thread_unavailable')
  }
  try {
    return JSON.parse(value) as unknown
  } catch {
    throw new DatabaseOperationError('thread_unavailable')
  }
}

function fileMode(path: string) {
  return lstatSync(path).mode & 0o777
}

function assertRegularPrivateFile(path: string) {
  const stat = lstatSync(path)
  if (!stat.isFile() || stat.isSymbolicLink() || fileMode(path) !== 0o600) {
    throw new DatabaseOperationError('library_unavailable')
  }

  const handle = openSync(path, 'r')
  const header = Buffer.alloc(sqliteHeader.length)
  try {
    if (
      readSync(handle, header, 0, header.length, 0) !== header.length ||
      !header.equals(sqliteHeader)
    ) {
      throw new DatabaseOperationError('library_unavailable')
    }
  } finally {
    closeSync(handle)
  }
}

function createPrivateParent(path: string) {
  const parent = dirname(path)
  if (!existsSync(parent)) {
    mkdirSync(parent, { recursive: true, mode: 0o700 })
  }
  const stat = lstatSync(parent)
  if (!stat.isDirectory() || stat.isSymbolicLink() || fileMode(parent) !== 0o700) {
    throw new DatabaseOperationError('library_unavailable')
  }
}

function removeNewDatabase(path: string) {
  for (const suffix of ['', '-journal']) {
    try {
      unlinkSync(`${path}${suffix}`)
    } catch {
      // A failed first open must not replace any pre-existing data.
    }
  }
}

function requiredPragma(database: DatabaseSync, name: string) {
  return database.prepare(`PRAGMA ${name}`).get() as Record<string, unknown>
}

function validateSchema(database: DatabaseSync) {
  const actualFingerprint = schemaFingerprint(database)
  if (actualFingerprint !== expectedSchemaFingerprint) {
    throw new DatabaseOperationError('library_unavailable')
  }
  if (database.prepare('PRAGMA foreign_key_check').all().length > 0) {
    throw new DatabaseOperationError('library_unavailable')
  }
}

function threadSummary(row: Record<string, unknown>) {
  return {
    id: row.id,
    location: row.location,
    title: row.title,
    pinPosition: row.pin_position,
    lastUserActivityAt: row.last_user_activity_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    threadRevision: row.thread_revision,
  }
}

function threadListRow(row: Record<string, unknown>): ThreadLibraryListRow {
  let identity: ReturnType<typeof parseThreadLibraryThreadIdentity>
  try {
    identity = parseThreadLibraryThreadIdentity({ id: row.id, location: row.location })
  } catch {
    throw new DatabaseOperationError('library_unavailable')
  }

  try {
    return parseThreadLibraryListRow({ availability: 'available', ...threadSummary(row) })
  } catch {
    return { availability: 'unavailable', ...identity }
  }
}

function threadValue(row: Record<string, unknown>) {
  return {
    id: row.id,
    location: row.location,
    trashedFromLocation: row.trashed_from_location,
    trashedPinPosition: row.trashed_pin_position,
    pinPosition: row.pin_position,
    title: row.title,
    titleSource: row.title_source,
    fallbackLocalSecond: row.fallback_local_second,
    fallbackOrdinal: row.fallback_ordinal,
    threadRevision: row.thread_revision,
    lastUserActivityAt: row.last_user_activity_at,
    resultRevision: row.result_revision,
    seenResultRevision: row.seen_result_revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function turnValue(row: Record<string, unknown>) {
  return {
    ordinal: row.ordinal,
    attemptRequestId: row.attempt_request_id,
    userMessageId: row.user_message_id,
    assistantMessageId: row.assistant_message_id,
    userContent: row.user_content,
    assistantContent: row.assistant_content,
    assistantStatus: row.assistant_status,
    error: row.error_json === null ? null : parseJson(row.error_json),
    targetSelection: parseJson(row.target_selection_json),
    targetAttribution:
      row.target_attribution_json === null ? null : parseJson(row.target_attribution_json),
    providerStateId: row.provider_state_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function queryThread(database: DatabaseSync, threadId: string): ThreadLibraryThreadDetail | null {
  const rows = readImportedRows(database, threadId)
  if (!rows) {
    return null
  }

  try {
    return parseThreadLibraryThreadDetail({
      summary: rows.thread,
      draft: rows.draft,
      turns: rows.turns,
      images: rows.images,
      documents: rows.documents,
      providerStateRefs: rows.providerStateRefs,
    })
  } catch (error) {
    if (error instanceof DatabaseOperationError) {
      throw error
    }
    throw new DatabaseOperationError('thread_unavailable')
  }
}

function runTransaction<T>(database: DatabaseSync, operation: () => T) {
  try {
    database.exec('BEGIN IMMEDIATE')
    const value = operation()
    try {
      database.exec('COMMIT')
    } catch {
      try {
        database.exec('ROLLBACK')
      } catch {
        // Commit acknowledgement is unknowable after this point.
        throw new DatabaseOperationError('library_unavailable', 'outcome_unknown')
      }
      throw new DatabaseOperationError('library_unavailable')
    }
    return value
  } catch (error) {
    if (database.isTransaction) {
      try {
        database.exec('ROLLBACK')
      } catch {
        throw new DatabaseOperationError('library_unavailable', 'outcome_unknown')
      }
    }
    if (error instanceof DatabaseOperationError) {
      throw error
    }
    throw new DatabaseOperationError('library_unavailable')
  }
}

type CursorValue = {
  epoch: string
  includedThroughCursor: number
  location: 'available' | 'archived' | 'trash'
  id: string
  pinPosition: number | null
  lastUserActivityAt: string
  createdAt: string
  updatedAt: string
}

function encodeCursor(value: CursorValue) {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

function decodeCursor(value: string): CursorValue {
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as CursorValue
    if (
      !parsed ||
      typeof parsed.epoch !== 'string' ||
      !Number.isSafeInteger(parsed.includedThroughCursor) ||
      parsed.includedThroughCursor < 0 ||
      !['available', 'archived', 'trash'].includes(parsed.location) ||
      typeof parsed.id !== 'string' ||
      (parsed.pinPosition !== null && !Number.isInteger(parsed.pinPosition)) ||
      typeof parsed.lastUserActivityAt !== 'string' ||
      typeof parsed.createdAt !== 'string' ||
      typeof parsed.updatedAt !== 'string'
    ) {
      throw new Error('invalid')
    }
    return parsed
  } catch {
    throw new DatabaseOperationError('invalid_request')
  }
}

function cursorFromRow(
  row: Record<string, unknown>,
  epoch: string,
  includedThroughCursor: number,
): CursorValue {
  return {
    epoch,
    includedThroughCursor,
    location: row.location as CursorValue['location'],
    id: String(row.id),
    pinPosition: row.pin_position as number | null,
    lastUserActivityAt: String(row.last_user_activity_at),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

function sameCursorRow(row: Record<string, unknown>, cursor: CursorValue) {
  return isDeepStrictEqual(cursorFromRow(row, cursor.epoch, cursor.includedThroughCursor), cursor)
}

function pageStatement(
  database: DatabaseSync,
  location: CursorValue['location'],
  hasCursor: boolean,
) {
  if (location === 'available') {
    return database.prepare(
      `SELECT * FROM threads WHERE location = 'available'
       ${
         hasCursor
           ? `AND (
             (CASE WHEN pin_position IS NULL THEN 1 ELSE 0 END) > ? OR
             ((CASE WHEN pin_position IS NULL THEN 1 ELSE 0 END) = 0 AND ? = 0 AND
               (pin_position > ? OR (pin_position = ? AND id > ?))) OR
             ((CASE WHEN pin_position IS NULL THEN 1 ELSE 0 END) = 1 AND ? = 1 AND
               (last_user_activity_at < ? OR
                (last_user_activity_at = ? AND created_at < ?) OR
                (last_user_activity_at = ? AND created_at = ? AND id > ?)))
           )`
           : ''
       }
       ORDER BY CASE WHEN pin_position IS NULL THEN 1 ELSE 0 END,
                pin_position ASC, last_user_activity_at DESC, created_at DESC, id ASC
       LIMIT 51`,
    )
  }

  const orderColumn = location === 'trash' ? 'updated_at' : 'last_user_activity_at'
  return database.prepare(
    `SELECT * FROM threads WHERE location = ?
     ${
       hasCursor
         ? `AND (${orderColumn} < ? OR
                  (${orderColumn} = ? AND created_at < ?) OR
                  (${orderColumn} = ? AND created_at = ? AND id > ?))`
         : ''
     }
     ORDER BY ${orderColumn} DESC, created_at DESC, id ASC LIMIT 51`,
  )
}

function listPage(
  database: DatabaseSync,
  input: ThreadLibraryOperationInput['listPage'],
  mutationCursor: number,
  cursorEpoch: string,
): ThreadLibraryOperationValue['listPage'] {
  const cursor = input.cursor ? decodeCursor(input.cursor) : null
  if (cursor && cursor.location !== input.location) {
    throw new DatabaseOperationError('invalid_request')
  }
  if (cursor && (cursor.epoch !== cursorEpoch || cursor.includedThroughCursor !== mutationCursor)) {
    throw new DatabaseOperationError('stale_cursor')
  }
  if (cursor) {
    const anchor = database.prepare('SELECT * FROM threads WHERE id = ?').get(cursor.id)
    if (!anchor || !sameCursorRow(anchor, cursor)) {
      throw new DatabaseOperationError('stale_cursor')
    }
  }

  let rows: Array<Record<string, unknown>>
  if (input.location === 'available') {
    const statement = pageStatement(database, input.location, Boolean(cursor))
    if (!cursor) {
      rows = statement.all()
    } else {
      const group = cursor.pinPosition === null ? 1 : 0
      rows = statement.all(
        group,
        group,
        cursor.pinPosition ?? 0,
        cursor.pinPosition ?? 0,
        cursor.id,
        group,
        cursor.lastUserActivityAt,
        cursor.lastUserActivityAt,
        cursor.createdAt,
        cursor.lastUserActivityAt,
        cursor.createdAt,
        cursor.id,
      )
    }
  } else {
    const statement = pageStatement(database, input.location, Boolean(cursor))
    rows = cursor
      ? statement.all(
          input.location,
          input.location === 'trash' ? cursor.updatedAt : cursor.lastUserActivityAt,
          input.location === 'trash' ? cursor.updatedAt : cursor.lastUserActivityAt,
          cursor.createdAt,
          input.location === 'trash' ? cursor.updatedAt : cursor.lastUserActivityAt,
          cursor.createdAt,
          cursor.id,
        )
      : statement.all(input.location)
  }

  const hasMore = rows.length > input.limit
  const page = rows.slice(0, input.limit)
  return {
    rows: page.map(threadListRow),
    nextCursor: hasMore
      ? encodeCursor(cursorFromRow(page.at(-1)!, cursorEpoch, mutationCursor))
      : null,
    includedThroughCursor: mutationCursor,
  }
}

function assertImportCoherent(rows: ImportedV5Rows) {
  if (
    rows.documents.length > nyxChatDocumentLimits.currentThreadDocuments ||
    rows.documents.reduce((total, row) => total + row.extractedByteLength, 0) >
      nyxChatDocumentLimits.currentThreadExtractedBytes ||
    rows.documents.reduce((total, row) => total + row.byteLength, 0) >
      nyxChatDocumentLimits.currentThreadAttachmentBytes
  ) {
    throw new DatabaseOperationError('invalid_request')
  }
  const imageCounts = new Map<number, number>()
  for (const row of rows.images) {
    imageCounts.set(row.turnOrdinal, (imageCounts.get(row.turnOrdinal) ?? 0) + 1)
  }
  const documentCounts = new Map<number, number>()
  for (const row of rows.documents) {
    documentCounts.set(row.turnOrdinal, (documentCounts.get(row.turnOrdinal) ?? 0) + 1)
  }
  if (
    rows.thread.location !== 'available' ||
    rows.thread.trashedFromLocation !== null ||
    rows.thread.trashedPinPosition !== null ||
    rows.thread.pinPosition !== null ||
    rows.thread.titleSource !== 'auto' ||
    (rows.thread.fallbackLocalSecond !== null && rows.thread.fallbackOrdinal !== 1) ||
    rows.thread.threadRevision !== 1 ||
    rows.thread.resultRevision !== 0 ||
    rows.thread.seenResultRevision !== 0 ||
    rows.turns.length === 0 ||
    rows.turns.some((row) => row.assistantStatus === 'pending') ||
    rows.draft.draftRevision !== 1 ||
    rows.draft.text !== '' ||
    !isDeepStrictEqual(rows.draft.targetSelection, rows.turns.at(-1)!.targetSelection)
  ) {
    throw new DatabaseOperationError('invalid_request')
  }
  for (const row of rows.documents) {
    if (row.available) {
      const bytes = Buffer.from(row.extractedText ?? '', 'utf8')
      if (
        bytes.length !== row.extractedByteLength ||
        createHash('sha256').update(bytes).digest('hex') !== row.extractedTextSha256
      ) {
        throw new DatabaseOperationError('invalid_request')
      }
    } else if (row.extractedText !== null) {
      throw new DatabaseOperationError('invalid_request')
    }
  }
  if (
    rows.images.length > nyxChatImageLimits.currentThreadImages ||
    rows.images.reduce((total, row) => total + row.width * row.height, 0) >
      nyxChatImageLimits.currentThreadFullPixels ||
    [...imageCounts.values()].some((count) => count > nyxChatImageLimits.imagesPerTurn) ||
    [...documentCounts.values()].some((count) => count > nyxChatDocumentLimits.documentsPerTurn)
  ) {
    throw new DatabaseOperationError('invalid_request')
  }
}

function insertThread(statement: StatementSync, row: ImportedV5Rows['thread']) {
  statement.run(
    row.id,
    row.location,
    row.trashedFromLocation,
    row.trashedPinPosition,
    row.pinPosition,
    row.title,
    row.titleSource,
    row.fallbackLocalSecond,
    row.fallbackOrdinal,
    row.threadRevision,
    row.lastUserActivityAt,
    row.resultRevision,
    row.seenResultRevision,
    row.createdAt,
    row.updatedAt,
  )
}

function allocateFallbackOrdinal(database: DatabaseSync, localSecond: string) {
  const used = database
    .prepare(
      `SELECT fallback_ordinal FROM threads
       WHERE fallback_local_second = ? ORDER BY fallback_ordinal`,
    )
    .all(localSecond)
    .map((row) => Number(row.fallback_ordinal))
  let ordinal = 1
  for (const value of used) {
    if (value !== ordinal) {
      break
    }
    ordinal += 1
  }
  return ordinal
}

function readImportedRows(database: DatabaseSync, threadId: string): ImportedV5Rows | null {
  const thread = database.prepare('SELECT * FROM threads WHERE id = ?').get(threadId)
  if (!thread) {
    return null
  }
  try {
    parseThreadLibraryThreadIdentity({ id: thread.id, location: thread.location })
  } catch {
    throw new DatabaseOperationError('library_unavailable')
  }
  const draft = database.prepare('SELECT * FROM drafts WHERE thread_id = ?').get(threadId)
  if (!draft) {
    throw new DatabaseOperationError('thread_unavailable')
  }
  const providerRows = database
    .prepare('SELECT * FROM provider_state_refs WHERE thread_id = ? ORDER BY turn_ordinal')
    .all(threadId)
  const providerByOrdinal = new Map(
    providerRows.map((row) => [Number(row.turn_ordinal), String(row.state_id)]),
  )
  const turns = database
    .prepare('SELECT * FROM turns WHERE thread_id = ? ORDER BY ordinal')
    .all(threadId)
    .map((row) => ({
      threadId,
      ...turnValue({
        ...row,
        provider_state_id: providerByOrdinal.get(Number(row.ordinal)) ?? null,
      }),
    }))
  const images = database
    .prepare('SELECT * FROM images WHERE thread_id = ? ORDER BY turn_ordinal, position')
    .all(threadId)
    .map((row) => ({
      imageId: row.id,
      threadId,
      turnOrdinal: row.turn_ordinal,
      position: row.position,
      mediaType: row.media_type,
      width: row.width,
      height: row.height,
      available: row.available === 1,
    }))
  const documents = database
    .prepare('SELECT * FROM documents WHERE thread_id = ? ORDER BY turn_ordinal, position')
    .all(threadId)
    .map((row) => ({
      documentId: row.id,
      threadId,
      turnOrdinal: row.turn_ordinal,
      position: row.position,
      name: row.name,
      mediaType: row.media_type,
      byteLength: row.byte_length,
      extractedByteLength: row.extracted_byte_length,
      sourceSha256: row.source_sha256,
      extractedTextSha256: row.extracted_text_sha256,
      available: row.available === 1,
      extractedText: row.extracted_text,
    }))
  const providerStateRefs = providerRows.map((row) => ({
    stateId: row.state_id,
    threadId,
    turnOrdinal: row.turn_ordinal,
    protocol: row.protocol,
    executionIdentity: row.execution_identity,
    byteLength: row.byte_length,
    sha256: row.sha256,
  }))

  try {
    return importedV5RowsSchema.parse({
      thread: threadValue(thread),
      draft: {
        threadId,
        draftRevision: draft.draft_revision,
        text: draft.text,
        targetSelection: parseJson(draft.target_selection_json),
        updatedAt: draft.updated_at,
      },
      turns,
      images,
      documents,
      providerStateRefs,
    })
  } catch (error) {
    if (error instanceof DatabaseOperationError) {
      throw error
    }
    throw new DatabaseOperationError('thread_unavailable')
  }
}

function importRows(database: DatabaseSync, input: unknown) {
  const rows = importedV5RowsSchema.parse(input)
  assertImportCoherent(rows)
  const existing = readImportedRows(database, rows.thread.id)
  if (existing) {
    if (!isDeepStrictEqual(existing, rows)) {
      throw new DatabaseOperationError('already_exists')
    }
    return { threadId: rows.thread.id, imported: false }
  }

  return runTransaction(database, () => {
    insertThread(
      database.prepare(`INSERT INTO threads VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
      rows.thread,
    )
    database
      .prepare('INSERT INTO drafts VALUES (?, ?, ?, ?, ?)')
      .run(
        rows.draft.threadId,
        rows.draft.draftRevision,
        rows.draft.text,
        json(rows.draft.targetSelection),
        rows.draft.updatedAt,
      )

    const turn = database.prepare(
      `INSERT INTO turns VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    for (const row of rows.turns) {
      turn.run(
        row.threadId,
        row.ordinal,
        row.attemptRequestId,
        row.userMessageId,
        row.assistantMessageId,
        row.userContent,
        row.assistantContent,
        row.assistantStatus,
        row.error === null ? null : json(row.error),
        json(row.targetSelection),
        row.targetAttribution === null ? null : json(row.targetAttribution),
        row.createdAt,
        row.updatedAt,
      )
    }

    const image = database.prepare('INSERT INTO images VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    for (const row of rows.images) {
      image.run(
        row.imageId,
        row.threadId,
        'turn',
        row.turnOrdinal,
        row.position,
        row.mediaType,
        row.width,
        row.height,
        Number(row.available),
      )
    }

    const document = database.prepare(
      'INSERT INTO documents VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    for (const row of rows.documents) {
      document.run(
        row.documentId,
        row.threadId,
        'turn',
        row.turnOrdinal,
        row.position,
        row.name,
        row.mediaType,
        row.byteLength,
        row.extractedByteLength,
        row.sourceSha256,
        row.extractedTextSha256,
        Number(row.available),
        row.extractedText,
      )
    }

    const provider = database.prepare(
      'INSERT INTO provider_state_refs VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
    for (const row of rows.providerStateRefs) {
      provider.run(
        row.stateId,
        row.threadId,
        row.turnOrdinal,
        row.protocol,
        row.executionIdentity,
        row.byteLength,
        row.sha256,
      )
    }
    return { threadId: rows.thread.id, imported: true }
  })
}

export class ThreadLibraryDatabase {
  private database: DatabaseSync | null = null
  private cursorEpoch = randomUUID()
  private mutationCursor = 0

  open({ databasePath }: ThreadLibraryOperationInput['open']): ThreadLibraryOperationValue['open'] {
    if (this.database) {
      throw new DatabaseOperationError('library_unavailable')
    }
    const existed = existsSync(databasePath)
    createPrivateParent(databasePath)
    if (existed) {
      assertRegularPrivateFile(databasePath)
    }

    let createdFile = false
    if (!existed) {
      try {
        closeSync(openSync(databasePath, 'wx', 0o600))
        createdFile = true
      } catch {
        throw new DatabaseOperationError('library_unavailable')
      }
    }

    let database: DatabaseSync | null = null
    try {
      database = new DatabaseSync(databasePath, {
        allowExtension: false,
        enableDoubleQuotedStringLiterals: false,
        enableForeignKeyConstraints: true,
      })
      database.enableDefensive(true)
      database.exec('PRAGMA trusted_schema = OFF; PRAGMA secure_delete = ON;')
      if (!existed) {
        database.exec(
          `PRAGMA journal_mode = DELETE; ${schemaSql}; PRAGMA user_version = ${schemaVersion};`,
        )
        chmodSync(databasePath, 0o600)
      }
      if (
        requiredPragma(database, 'journal_mode').journal_mode !== 'delete' ||
        requiredPragma(database, 'foreign_keys').foreign_keys !== 1 ||
        requiredPragma(database, 'trusted_schema').trusted_schema !== 0 ||
        requiredPragma(database, 'secure_delete').secure_delete !== 1 ||
        requiredPragma(database, 'user_version').user_version !== schemaVersion
      ) {
        throw new DatabaseOperationError('library_unavailable')
      }
      validateSchema(database)
      if (requiredPragma(database, 'quick_check').quick_check !== 'ok') {
        throw new DatabaseOperationError('library_unavailable')
      }
      this.database = database
      this.cursorEpoch = randomUUID()
      this.mutationCursor = 0
      return { schemaVersion }
    } catch (error) {
      if (database?.isOpen) {
        database.close()
      }
      if (createdFile) {
        removeNewDatabase(databasePath)
      }
      throw error instanceof DatabaseOperationError
        ? error
        : new DatabaseOperationError('library_unavailable')
    }
  }

  close(): ThreadLibraryOperationValue['close'] {
    this.database?.close()
    this.database = null
    return { closed: true }
  }

  execute(
    request: ThreadLibraryRequest,
  ): ThreadLibraryOperationValue[keyof ThreadLibraryOperationValue] {
    if (request.operation === 'open') {
      return this.open(request.input)
    }
    if (request.operation === 'close') {
      return this.close()
    }
    const database = this.database
    if (!database) {
      throw new DatabaseOperationError('library_unavailable')
    }

    switch (request.operation) {
      case 'materialize': {
        if (
          database
            .prepare('SELECT 1 AS present FROM threads WHERE id = ?')
            .get(request.input.threadId)
        ) {
          throw new DatabaseOperationError('already_exists')
        }
        const detail = runTransaction(database, () => {
          const fallbackOrdinal = request.input.fallbackLocalSecond
            ? allocateFallbackOrdinal(database, request.input.fallbackLocalSecond)
            : null
          insertThread(
            database.prepare(
              'INSERT INTO threads VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            ),
            {
              id: request.input.threadId,
              location: 'available',
              trashedFromLocation: null,
              trashedPinPosition: null,
              pinPosition: null,
              title:
                fallbackOrdinal && fallbackOrdinal > 1
                  ? `${request.input.title} · ${fallbackOrdinal}`
                  : request.input.title,
              titleSource: 'auto',
              fallbackLocalSecond: request.input.fallbackLocalSecond,
              fallbackOrdinal,
              threadRevision: 1,
              lastUserActivityAt: request.input.createdAt,
              resultRevision: 0,
              seenResultRevision: 0,
              createdAt: request.input.createdAt,
              updatedAt: request.input.createdAt,
            },
          )
          database
            .prepare('INSERT INTO drafts VALUES (?, 0, ?, ?, ?)')
            .run(
              request.input.threadId,
              '',
              json(request.input.targetSelection),
              request.input.createdAt,
            )
          return queryThread(database, request.input.threadId)!
        })
        this.mutationCursor += 1
        return detail
      }
      case 'readThread':
        return queryThread(database, request.input.threadId)
      case 'listPage':
        return listPage(database, request.input, this.mutationCursor, this.cursorEpoch)
      case 'importV5': {
        const result = importRows(database, request.input.rows)
        if (result.imported) {
          this.mutationCursor += 1
        }
        return result
      }
    }
  }
}

function postFailure(id: string, error: unknown) {
  const failure =
    error instanceof DatabaseOperationError
      ? error
      : error instanceof Error && error.name === 'ZodError'
        ? new DatabaseOperationError('invalid_request')
        : new DatabaseOperationError('library_unavailable', 'outcome_unknown')
  parentPort?.postMessage({
    id,
    ok: false,
    safeError: { code: failure.code, message: threadLibrarySafeErrorMessages[failure.code] },
    outcome: failure.outcome,
  })
}

const workerPort = parentPort

if (!isMainThread && workerPort) {
  const owner = new ThreadLibraryDatabase()
  workerPort.on('message', (value: unknown) => {
    const id =
      typeof value === 'object' && value !== null && 'id' in value && typeof value.id === 'string'
        ? value.id
        : 'invalid'
    try {
      const request = parseThreadLibraryRequest(value)
      const result = owner.execute(request)
      workerPort.postMessage({ id: request.id, ok: true, value: result })
      if (request.operation === 'close') {
        workerPort.close()
      }
    } catch (error) {
      postFailure(id, error)
    }
  })
}
