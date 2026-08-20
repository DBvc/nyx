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
import { interruptedThreadErrorMessage } from '../current-thread/schemas'
import {
  deriveThreadDraftTitle,
  formatThreadGenericTitle,
  importedV5RowsSchema,
  parseThreadLibraryListRow,
  parseThreadLibraryThreadDetail,
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
const expectedSchemaFingerprint = '0a422f89b87e53a8917074c7312b44ea38cda5a6a8e883679e512509fa90c213'

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
    CHECK(fallback_ordinal IS NULL OR fallback_local_second IS NOT NULL),
    CHECK(
      title_source <> 'manual' OR
      (fallback_local_second IS NULL AND fallback_ordinal IS NULL)
    )
  ) STRICT;

  CREATE UNIQUE INDEX threads_pin_position
    ON threads(pin_position) WHERE location = 'available' AND pin_position IS NOT NULL;
  CREATE UNIQUE INDEX threads_fallback_identity
    ON threads(fallback_local_second, fallback_ordinal)
    WHERE fallback_ordinal IS NOT NULL;

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
    CHECK(available = 0 OR extracted_text IS NOT NULL)
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
    resultRevision: row.result_revision,
    seenResultRevision: row.seen_result_revision,
  }
}

function unavailableThreadListRow(row: Record<string, unknown>): ThreadLibraryListRow {
  try {
    return parseThreadLibraryListRow({
      availability: 'unavailable',
      id: row.id,
      location: row.location,
      pinPosition: row.pin_position,
    })
  } catch {
    throw new DatabaseOperationError('library_unavailable')
  }
}

function threadListRow(row: Record<string, unknown>): ThreadLibraryListRow {
  const unavailable = unavailableThreadListRow(row)
  try {
    return parseThreadLibraryListRow({ availability: 'available', ...threadSummary(row) })
  } catch {
    return unavailable
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

  const draftImages = database
    .prepare("SELECT * FROM images WHERE thread_id = ? AND owner = 'draft' ORDER BY position")
    .all(threadId)
    .map((row) => ({
      imageId: row.id,
      threadId,
      owner: 'draft' as const,
      turnOrdinal: null,
      position: row.position,
      mediaType: row.media_type,
      width: row.width,
      height: row.height,
      available: row.available === 1,
    }))
  const draftDocuments = database
    .prepare("SELECT * FROM documents WHERE thread_id = ? AND owner = 'draft' ORDER BY position")
    .all(threadId)
    .map((row) => ({
      documentId: row.id,
      threadId,
      owner: 'draft' as const,
      turnOrdinal: null,
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

  try {
    return parseThreadLibraryThreadDetail({
      summary: rows.thread,
      draft: rows.draft,
      turns: rows.turns,
      images: [...rows.images.map((row) => ({ ...row, owner: 'turn' as const })), ...draftImages],
      documents: [
        ...rows.documents.map((row) => ({ ...row, owner: 'turn' as const })),
        ...draftDocuments,
      ],
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
    if (!anchor) {
      throw new DatabaseOperationError('stale_cursor')
    }
    unavailableThreadListRow(anchor)
    if (!sameCursorRow(anchor, cursor)) {
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

  const parsedRows = rows.map(threadListRow)
  const hasMore = parsedRows.length > input.limit
  const page = parsedRows.slice(0, input.limit)
  return {
    rows: page,
    nextCursor: hasMore
      ? encodeCursor(cursorFromRow(rows[input.limit - 1]!, cursorEpoch, mutationCursor))
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
    (rows.thread.fallbackLocalSecond === null
      ? rows.thread.fallbackOrdinal !== null
      : rows.thread.fallbackOrdinal !== 1 ||
        (rows.thread.title !==
          formatThreadGenericTitle(rows.thread.fallbackLocalSecond, 1, 'Image') &&
          rows.thread.title !==
            formatThreadGenericTitle(rows.thread.fallbackLocalSecond, 1, 'Untitled draft'))) ||
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
  const maximum = database
    .prepare(
      `SELECT max(fallback_ordinal) AS ordinal FROM threads
       WHERE fallback_local_second = ? AND fallback_ordinal IS NOT NULL`,
    )
    .get(localSecond)?.ordinal
  return maximum === null || maximum === undefined ? 1 : Number(maximum) + 1
}

function readImportedRows(database: DatabaseSync, threadId: string): ImportedV5Rows | null {
  const thread = database.prepare('SELECT * FROM threads WHERE id = ?').get(threadId)
  if (!thread) {
    return null
  }
  unavailableThreadListRow(thread)
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
    .prepare(
      "SELECT * FROM images WHERE thread_id = ? AND owner = 'turn' ORDER BY turn_ordinal, position",
    )
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
    .prepare(
      "SELECT * FROM documents WHERE thread_id = ? AND owner = 'turn' ORDER BY turn_ordinal, position",
    )
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

function draftConflict(canonicalDraftRevision: number) {
  return { status: 'conflict' as const, canonicalDraftRevision }
}

function draftRows(database: DatabaseSync, threadId: string) {
  return {
    images: database
      .prepare("SELECT * FROM images WHERE thread_id = ? AND owner = 'draft' ORDER BY position")
      .all(threadId),
    documents: database
      .prepare("SELECT * FROM documents WHERE thread_id = ? AND owner = 'draft' ORDER BY position")
      .all(threadId),
  }
}

function automaticDraftTitle(
  database: DatabaseSync,
  localSecond: string,
  fallbackOrdinal: number | null,
  draft: ThreadLibraryOperationInput['saveDraft']['draft'],
) {
  const derived = deriveThreadDraftTitle(draft)
  if (derived.title !== null) {
    return { title: derived.title, fallbackOrdinal }
  }
  const ordinal = fallbackOrdinal ?? allocateFallbackOrdinal(database, localSecond)
  return {
    title: formatThreadGenericTitle(localSecond, ordinal, derived.genericKind),
    fallbackOrdinal: ordinal,
  }
}

function assertDocumentText(
  row: ThreadLibraryOperationInput['saveDraft']['draft']['documents'][number],
) {
  if (row.extractedText === null) {
    return
  }
  const bytes = Buffer.from(row.extractedText, 'utf8')
  if (
    bytes.length !== row.extractedByteLength ||
    createHash('sha256').update(bytes).digest('hex') !== row.extractedTextSha256
  ) {
    throw new DatabaseOperationError('invalid_request')
  }
}

function assertDraftCapacity(
  database: DatabaseSync,
  threadId: string,
  draft: ThreadLibraryOperationInput['saveDraft']['draft'],
) {
  const turnImages = database
    .prepare("SELECT width, height FROM images WHERE thread_id = ? AND owner = 'turn'")
    .all(threadId)
  const turnDocuments = database
    .prepare(
      "SELECT byte_length, extracted_byte_length FROM documents WHERE thread_id = ? AND owner = 'turn'",
    )
    .all(threadId)
  if (
    draft.images.length > nyxChatImageLimits.imagesPerTurn ||
    turnImages.length + draft.images.length > nyxChatImageLimits.currentThreadImages ||
    turnImages.reduce((total, row) => total + Number(row.width) * Number(row.height), 0) +
      draft.images.reduce((total, row) => total + row.width * row.height, 0) >
      nyxChatImageLimits.currentThreadFullPixels ||
    draft.documents.length > nyxChatDocumentLimits.documentsPerTurn ||
    turnDocuments.length + draft.documents.length > nyxChatDocumentLimits.currentThreadDocuments ||
    turnDocuments.reduce((total, row) => total + Number(row.byte_length), 0) +
      draft.documents.reduce((total, row) => total + row.byteLength, 0) >
      nyxChatDocumentLimits.currentThreadAttachmentBytes ||
    turnDocuments.reduce((total, row) => total + Number(row.extracted_byte_length), 0) +
      draft.documents.reduce((total, row) => total + row.extractedByteLength, 0) >
      nyxChatDocumentLimits.currentThreadExtractedBytes
  ) {
    throw new DatabaseOperationError('invalid_request')
  }
  draft.documents.forEach(assertDocumentText)
}

function assertStableDraftResources(
  database: DatabaseSync,
  threadId: string,
  draft: ThreadLibraryOperationInput['saveDraft']['draft'],
) {
  for (const row of draft.images) {
    const image = database.prepare('SELECT * FROM images WHERE id = ?').get(row.imageId)
    const document = database
      .prepare('SELECT 1 AS present FROM documents WHERE id = ?')
      .get(row.imageId)
    const provider = database
      .prepare('SELECT 1 AS present FROM provider_state_refs WHERE state_id = ?')
      .get(row.imageId)
    if (
      document ||
      provider ||
      (image &&
        (image.thread_id !== threadId ||
          image.owner !== 'draft' ||
          image.turn_ordinal !== null ||
          image.media_type !== row.mediaType ||
          image.width !== row.width ||
          image.height !== row.height ||
          image.available !== Number(row.available)))
    ) {
      throw new DatabaseOperationError('invalid_request')
    }
  }
  for (const row of draft.documents) {
    const document = database.prepare('SELECT * FROM documents WHERE id = ?').get(row.documentId)
    const image = database
      .prepare('SELECT 1 AS present FROM images WHERE id = ?')
      .get(row.documentId)
    const provider = database
      .prepare('SELECT 1 AS present FROM provider_state_refs WHERE state_id = ?')
      .get(row.documentId)
    if (
      image ||
      provider ||
      (document &&
        (document.thread_id !== threadId ||
          document.owner !== 'draft' ||
          document.turn_ordinal !== null ||
          document.name !== row.name ||
          document.media_type !== row.mediaType ||
          document.byte_length !== row.byteLength ||
          document.extracted_byte_length !== row.extractedByteLength ||
          document.source_sha256 !== row.sourceSha256 ||
          document.extracted_text_sha256 !== row.extractedTextSha256 ||
          document.available !== Number(row.available) ||
          document.extracted_text !== row.extractedText))
    ) {
      throw new DatabaseOperationError('invalid_request')
    }
  }
}

function replaceDraftResources(
  database: DatabaseSync,
  threadId: string,
  draft: ThreadLibraryOperationInput['saveDraft']['draft'],
) {
  database.prepare("DELETE FROM images WHERE thread_id = ? AND owner = 'draft'").run(threadId)
  database.prepare("DELETE FROM documents WHERE thread_id = ? AND owner = 'draft'").run(threadId)
  const image = database.prepare('INSERT INTO images VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
  for (const row of draft.images) {
    image.run(
      row.imageId,
      threadId,
      'draft',
      null,
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
  for (const row of draft.documents) {
    document.run(
      row.documentId,
      threadId,
      'draft',
      null,
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
}

function saveDraft(
  database: DatabaseSync,
  input: ThreadLibraryOperationInput['saveDraft'],
): { mutated: boolean; value: ThreadLibraryOperationValue['saveDraft'] } {
  return runTransaction(database, () => {
    const thread = database.prepare('SELECT * FROM threads WHERE id = ?').get(input.threadId)
    const current = database.prepare('SELECT * FROM drafts WHERE thread_id = ?').get(input.threadId)
    if (!thread || !current) {
      throw new DatabaseOperationError('not_found')
    }
    if (!['available', 'archived'].includes(String(thread.location))) {
      throw new DatabaseOperationError('invalid_request')
    }
    if (current.draft_revision !== input.expectedDraftRevision) {
      return { mutated: false, value: draftConflict(Number(current.draft_revision)) }
    }

    assertDraftCapacity(database, input.threadId, input.draft)
    assertStableDraftResources(database, input.threadId, input.draft)
    const previous = draftRows(database, input.threadId)
    const attachmentChanged =
      !isDeepStrictEqual(
        previous.images.map((row) => [row.id, row.position]),
        input.draft.images.map((row) => [row.imageId, row.position]),
      ) ||
      !isDeepStrictEqual(
        previous.documents.map((row) => [row.id, row.position]),
        input.draft.documents.map((row) => [row.documentId, row.position]),
      )
    const nonEmptyTextChanged = current.text !== input.draft.text && input.draft.text.length > 0
    const hasTurns = Boolean(
      database
        .prepare('SELECT 1 AS present FROM turns WHERE thread_id = ? LIMIT 1')
        .get(input.threadId),
    )
    const titleState =
      thread.title_source === 'auto' && !hasTurns
        ? automaticDraftTitle(
            database,
            String(thread.fallback_local_second),
            thread.fallback_ordinal === null ? null : Number(thread.fallback_ordinal),
            input.draft,
          )
        : {
            title: String(thread.title),
            fallbackOrdinal:
              thread.fallback_ordinal === null ? null : Number(thread.fallback_ordinal),
          }

    replaceDraftResources(database, input.threadId, input.draft)
    database
      .prepare(
        `UPDATE drafts SET draft_revision = draft_revision + 1, text = ?,
         target_selection_json = ?, updated_at = ? WHERE thread_id = ?`,
      )
      .run(input.draft.text, json(input.draft.targetSelection), input.savedAt, input.threadId)
    database
      .prepare(
        `UPDATE threads SET title = ?, fallback_ordinal = ?,
         last_user_activity_at = CASE WHEN ? THEN ? ELSE last_user_activity_at END,
         updated_at = ? WHERE id = ?`,
      )
      .run(
        titleState.title,
        titleState.fallbackOrdinal,
        Number(nonEmptyTextChanged || attachmentChanged),
        input.savedAt,
        input.savedAt,
        input.threadId,
      )
    return {
      mutated: true,
      value: { status: 'committed' as const, detail: queryThread(database, input.threadId)! },
    }
  })
}

function startTurn(
  database: DatabaseSync,
  input: ThreadLibraryOperationInput['startTurn'],
): { mutated: boolean; value: ThreadLibraryOperationValue['startTurn'] } {
  return runTransaction(database, () => {
    const thread = database.prepare('SELECT * FROM threads WHERE id = ?').get(input.threadId)
    const draft = database.prepare('SELECT * FROM drafts WHERE thread_id = ?').get(input.threadId)
    if (!thread || !draft) {
      throw new DatabaseOperationError('not_found')
    }
    if (!['available', 'archived'].includes(String(thread.location))) {
      throw new DatabaseOperationError('invalid_request')
    }
    if (draft.draft_revision !== input.expectedDraftRevision) {
      return { mutated: false, value: draftConflict(Number(draft.draft_revision)) }
    }
    if (
      database
        .prepare(
          "SELECT 1 AS present FROM turns WHERE thread_id = ? AND assistant_status = 'pending'",
        )
        .get(input.threadId)
    ) {
      throw new DatabaseOperationError('invalid_request')
    }
    const resources = draftRows(database, input.threadId)
    if (
      String(draft.text).length === 0 &&
      resources.images.length === 0 &&
      resources.documents.length === 0
    ) {
      throw new DatabaseOperationError('invalid_request')
    }
    const ordinal = Number(
      database
        .prepare('SELECT count(*) AS count FROM turns WHERE thread_id = ?')
        .get(input.threadId)!.count,
    )
    const retainsFallbackIdentity =
      thread.title_source === 'auto' &&
      typeof thread.fallback_local_second === 'string' &&
      typeof thread.fallback_ordinal === 'number' &&
      (thread.title ===
        formatThreadGenericTitle(thread.fallback_local_second, thread.fallback_ordinal, 'Image') ||
        thread.title ===
          formatThreadGenericTitle(
            thread.fallback_local_second,
            thread.fallback_ordinal,
            'Untitled draft',
          ))
    database
      .prepare('INSERT INTO turns VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(
        input.threadId,
        ordinal,
        input.requestId,
        input.userMessageId,
        input.assistantMessageId,
        String(draft.text),
        '',
        'pending',
        null,
        String(draft.target_selection_json),
        null,
        input.startedAt,
        input.startedAt,
      )
    database
      .prepare(
        "UPDATE images SET owner = 'turn', turn_ordinal = ? WHERE thread_id = ? AND owner = 'draft'",
      )
      .run(ordinal, input.threadId)
    database
      .prepare(
        "UPDATE documents SET owner = 'turn', turn_ordinal = ? WHERE thread_id = ? AND owner = 'draft'",
      )
      .run(ordinal, input.threadId)
    database
      .prepare(
        `UPDATE drafts SET draft_revision = draft_revision + 1, text = '', updated_at = ?
         WHERE thread_id = ?`,
      )
      .run(input.startedAt, input.threadId)
    database
      .prepare(
        `UPDATE threads SET location = 'available',
         thread_revision = thread_revision + CASE WHEN location = 'archived' THEN 1 ELSE 0 END,
         fallback_local_second = CASE WHEN ? THEN fallback_local_second ELSE NULL END,
         fallback_ordinal = CASE WHEN ? THEN fallback_ordinal ELSE NULL END,
         last_user_activity_at = ?, updated_at = ? WHERE id = ?`,
      )
      .run(
        Number(retainsFallbackIdentity),
        Number(retainsFallbackIdentity),
        input.startedAt,
        input.startedAt,
        input.threadId,
      )
    return {
      mutated: true,
      value: { status: 'committed' as const, detail: queryThread(database, input.threadId)! },
    }
  })
}

function retryTurn(
  database: DatabaseSync,
  input: ThreadLibraryOperationInput['retryTurn'],
): { mutated: boolean; value: ThreadLibraryOperationValue['retryTurn'] } {
  return runTransaction(database, () => {
    const thread = database.prepare('SELECT * FROM threads WHERE id = ?').get(input.threadId)
    const draft = database.prepare('SELECT * FROM drafts WHERE thread_id = ?').get(input.threadId)
    const turn = database
      .prepare('SELECT * FROM turns WHERE thread_id = ? AND ordinal = ?')
      .get(input.threadId, input.turnOrdinal)
    const finalOrdinal = database
      .prepare('SELECT max(ordinal) AS ordinal FROM turns WHERE thread_id = ?')
      .get(input.threadId)?.ordinal
    if (!thread || !draft || !turn) {
      throw new DatabaseOperationError('not_found')
    }
    if (!['available', 'archived'].includes(String(thread.location))) {
      throw new DatabaseOperationError('invalid_request')
    }
    if (draft.draft_revision !== input.expectedDraftRevision) {
      return { mutated: false, value: draftConflict(Number(draft.draft_revision)) }
    }
    const error = turn.error_json === null ? null : parseJson(turn.error_json)
    if (
      turn.ordinal !== finalOrdinal ||
      turn.attempt_request_id !== input.expectedAttemptRequestId ||
      turn.assistant_status !== 'failed' ||
      typeof error !== 'object' ||
      error === null ||
      !('retryable' in error) ||
      error.retryable !== true
    ) {
      throw new DatabaseOperationError('invalid_request')
    }
    database
      .prepare(
        `UPDATE turns SET attempt_request_id = ?, assistant_content = '', assistant_status = 'pending',
         error_json = NULL, target_selection_json = ?, target_attribution_json = NULL, updated_at = ?
         WHERE thread_id = ? AND ordinal = ?`,
      )
      .run(
        input.requestId,
        String(draft.target_selection_json),
        input.retriedAt,
        input.threadId,
        input.turnOrdinal,
      )
    database
      .prepare(
        `UPDATE threads SET location = 'available',
         thread_revision = thread_revision + CASE WHEN location = 'archived' THEN 1 ELSE 0 END,
         last_user_activity_at = ?, updated_at = ? WHERE id = ?`,
      )
      .run(input.retriedAt, input.retriedAt, input.threadId)
    return {
      mutated: true,
      value: { status: 'committed' as const, detail: queryThread(database, input.threadId)! },
    }
  })
}

function bindTurnTarget(
  database: DatabaseSync,
  input: ThreadLibraryOperationInput['bindTurnTarget'],
) {
  return runTransaction(database, () => {
    const turn = database
      .prepare(
        `SELECT * FROM turns WHERE thread_id = ? AND attempt_request_id = ?
         AND assistant_status = 'pending' AND target_attribution_json IS NULL`,
      )
      .get(input.threadId, input.requestId)
    if (!turn) {
      throw new DatabaseOperationError('not_pending')
    }
    database
      .prepare(
        `UPDATE turns SET target_attribution_json = ?, updated_at = ?
         WHERE thread_id = ? AND attempt_request_id = ? AND assistant_status = 'pending'
         AND target_attribution_json IS NULL`,
      )
      .run(json(input.targetAttribution), input.boundAt, input.threadId, input.requestId)
    return queryThread(database, input.threadId)!
  })
}

function settleTurn(database: DatabaseSync, input: ThreadLibraryOperationInput['settleTurn']) {
  return runTransaction(database, () => {
    const turn = database
      .prepare(
        "SELECT * FROM turns WHERE thread_id = ? AND attempt_request_id = ? AND assistant_status = 'pending'",
      )
      .get(input.threadId, input.requestId)
    if (!turn) {
      throw new DatabaseOperationError('not_pending')
    }
    if (
      input.error?.code === 'content_rejected' &&
      !database
        .prepare(
          `SELECT 1 AS present FROM images WHERE thread_id = ? AND owner = 'turn' AND turn_ordinal = ?
           UNION ALL SELECT 1 FROM documents WHERE thread_id = ? AND owner = 'turn' AND turn_ordinal = ? LIMIT 1`,
        )
        .get(input.threadId, Number(turn.ordinal), input.threadId, Number(turn.ordinal))
    ) {
      throw new DatabaseOperationError('invalid_request')
    }
    const updated = database
      .prepare(
        `UPDATE turns SET assistant_content = ?, assistant_status = ?, error_json = ?, updated_at = ?
         WHERE thread_id = ? AND attempt_request_id = ? AND assistant_status = 'pending'`,
      )
      .run(
        input.assistantContent,
        input.assistantStatus,
        input.error === null ? null : json(input.error),
        input.settledAt,
        input.threadId,
        input.requestId,
      )
    if (updated.changes !== 1) {
      throw new DatabaseOperationError('not_pending')
    }
    if (input.providerStateRef) {
      database
        .prepare('INSERT INTO provider_state_refs VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(
          input.providerStateRef.stateId,
          input.threadId,
          Number(turn.ordinal),
          input.providerStateRef.protocol,
          input.providerStateRef.executionIdentity,
          input.providerStateRef.byteLength,
          input.providerStateRef.sha256,
        )
    }
    database
      .prepare(
        `UPDATE threads SET result_revision = result_revision + 1, updated_at = ? WHERE id = ?`,
      )
      .run(input.settledAt, input.threadId)
    return queryThread(database, input.threadId)!
  })
}

function recoverPending(
  database: DatabaseSync,
  input: ThreadLibraryOperationInput['recoverPending'],
) {
  return runTransaction(database, () => {
    const rows = database
      .prepare("SELECT thread_id, ordinal FROM turns WHERE assistant_status = 'pending'")
      .all()
    const error = json({
      code: 'unknown',
      message: interruptedThreadErrorMessage,
      retryable: true,
    })
    for (const row of rows) {
      database
        .prepare(
          `UPDATE turns SET assistant_status = 'failed', error_json = ?, updated_at = ?
           WHERE thread_id = ? AND ordinal = ? AND assistant_status = 'pending'`,
        )
        .run(error, input.recoveredAt, String(row.thread_id), Number(row.ordinal))
      database
        .prepare(
          `UPDATE threads SET result_revision = result_revision + 1, updated_at = ? WHERE id = ?`,
        )
        .run(input.recoveredAt, String(row.thread_id))
    }
    return { recovered: rows.length }
  })
}

function setResourceAvailability(
  database: DatabaseSync,
  input: ThreadLibraryOperationInput['setResourceAvailability'],
) {
  return runTransaction(database, () => {
    for (const row of input.images) {
      const result = database
        .prepare('UPDATE images SET available = ? WHERE id = ? AND thread_id = ?')
        .run(Number(row.available), row.id, input.threadId)
      if (result.changes !== 1) {
        throw new DatabaseOperationError('not_found')
      }
    }
    for (const row of input.documents) {
      const result = database
        .prepare('UPDATE documents SET available = ? WHERE id = ? AND thread_id = ?')
        .run(Number(row.available), row.id, input.threadId)
      if (result.changes !== 1) {
        throw new DatabaseOperationError('not_found')
      }
    }
    database
      .prepare('UPDATE threads SET updated_at = ? WHERE id = ?')
      .run(input.checkedAt, input.threadId)
    const detail = queryThread(database, input.threadId)
    if (!detail) {
      throw new DatabaseOperationError('not_found')
    }
    return detail
  })
}

function repairProviderStateRef(
  database: DatabaseSync,
  input: ThreadLibraryOperationInput['repairProviderStateRef'],
) {
  return runTransaction(database, () => {
    const row = database
      .prepare(
        `SELECT provider_state_refs.* FROM provider_state_refs
         JOIN turns ON turns.thread_id = provider_state_refs.thread_id
          AND turns.ordinal = provider_state_refs.turn_ordinal
         WHERE provider_state_refs.thread_id = ? AND turns.attempt_request_id = ?`,
      )
      .get(input.threadId, input.requestId)
    const ref = input.providerStateRef
    if (
      !row ||
      row.state_id !== ref.stateId ||
      row.protocol !== ref.protocol ||
      row.execution_identity !== ref.executionIdentity ||
      row.byte_length !== ref.byteLength ||
      row.sha256 !== ref.sha256
    ) {
      throw new DatabaseOperationError('not_found')
    }
    database.prepare('DELETE FROM provider_state_refs WHERE state_id = ?').run(ref.stateId)
    database
      .prepare('UPDATE turns SET updated_at = ? WHERE thread_id = ? AND ordinal = ?')
      .run(input.repairedAt, input.threadId, Number(row.turn_ordinal))
    return queryThread(database, input.threadId)!
  })
}

function markSeen(database: DatabaseSync, input: ThreadLibraryOperationInput['markSeen']) {
  return runTransaction(database, () => {
    const thread = database.prepare('SELECT * FROM threads WHERE id = ?').get(input.threadId)
    if (!thread) {
      throw new DatabaseOperationError('not_found')
    }
    const resultRevision = Number(thread.result_revision)
    const seenResultRevision = Number(thread.seen_result_revision)
    if (input.observedResultRevision > resultRevision) {
      throw new DatabaseOperationError('invalid_request')
    }
    if (input.observedResultRevision <= seenResultRevision) {
      return { mutated: false, value: queryThread(database, input.threadId)! }
    }
    database
      .prepare('UPDATE threads SET seen_result_revision = ? WHERE id = ?')
      .run(input.observedResultRevision, input.threadId)
    return { mutated: true, value: queryThread(database, input.threadId)! }
  })
}

function discardEmptyShell(
  database: DatabaseSync,
  input: ThreadLibraryOperationInput['discardEmptyShell'],
) {
  return runTransaction(database, () => {
    const shell = database
      .prepare(
        `SELECT threads.title_source, drafts.draft_revision, drafts.text,
          (SELECT count(*) FROM turns WHERE thread_id = threads.id) AS turn_count,
          (SELECT count(*) FROM images WHERE thread_id = threads.id) AS image_count,
          (SELECT count(*) FROM documents WHERE thread_id = threads.id) AS document_count
         FROM threads JOIN drafts ON drafts.thread_id = threads.id WHERE threads.id = ?`,
      )
      .get(input.threadId)
    if (!shell) {
      return { mutated: false, value: { discarded: true } }
    }
    const exactShell =
      shell.title_source === 'auto' &&
      shell.draft_revision === input.expectedDraftRevision &&
      shell.text === '' &&
      shell.turn_count === 0 &&
      shell.image_count === 0 &&
      shell.document_count === 0
    if (!exactShell) {
      return { mutated: false, value: { discarded: false } }
    }
    const deleted = database.prepare('DELETE FROM threads WHERE id = ?').run(input.threadId)
    return { mutated: deleted.changes === 1, value: { discarded: deleted.changes === 1 } }
  })
}

export class ThreadLibraryDatabase {
  private database: DatabaseSync | null = null
  private cursorEpoch = randomUUID()
  private lastActualMutation = false
  private mutationCursor = 0

  acknowledgementClock() {
    return {
      generation: this.cursorEpoch,
      watermark: this.mutationCursor,
      actualMutation: this.lastActualMutation,
    }
  }

  private acknowledgeMutation() {
    this.mutationCursor += 1
    this.lastActualMutation = true
  }

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
      this.lastActualMutation = false
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
    this.lastActualMutation = false
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
          assertDraftCapacity(database, request.input.threadId, request.input.draft)
          assertStableDraftResources(database, request.input.threadId, request.input.draft)
          const titleState = automaticDraftTitle(
            database,
            request.input.fallbackLocalSecond,
            null,
            request.input.draft,
          )
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
              title: titleState.title,
              titleSource: 'auto',
              fallbackLocalSecond: request.input.fallbackLocalSecond,
              fallbackOrdinal: titleState.fallbackOrdinal,
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
              request.input.draft.text,
              json(request.input.draft.targetSelection),
              request.input.createdAt,
            )
          replaceDraftResources(database, request.input.threadId, request.input.draft)
          return queryThread(database, request.input.threadId)!
        })
        this.acknowledgeMutation()
        return detail
      }
      case 'readThread':
        return queryThread(database, request.input.threadId)
      case 'snapshot':
        return {
          detail:
            request.input.threadId === null ? null : queryThread(database, request.input.threadId),
          includedThroughCursor: this.mutationCursor,
        }
      case 'listPage':
        return listPage(database, request.input, this.mutationCursor, this.cursorEpoch)
      case 'importV5': {
        const result = importRows(database, request.input.rows)
        if (result.imported) {
          this.acknowledgeMutation()
        }
        return result
      }
      case 'saveDraft': {
        const result = saveDraft(database, request.input)
        if (result.mutated) {
          this.acknowledgeMutation()
        }
        return result.value
      }
      case 'startTurn': {
        const result = startTurn(database, request.input)
        if (result.mutated) {
          this.acknowledgeMutation()
        }
        return result.value
      }
      case 'retryTurn': {
        const result = retryTurn(database, request.input)
        if (result.mutated) {
          this.acknowledgeMutation()
        }
        return result.value
      }
      case 'bindTurnTarget': {
        const detail = bindTurnTarget(database, request.input)
        this.acknowledgeMutation()
        return detail
      }
      case 'settleTurn': {
        const detail = settleTurn(database, request.input)
        this.acknowledgeMutation()
        return detail
      }
      case 'recoverPending': {
        const result = recoverPending(database, request.input)
        if (result.recovered > 0) {
          this.acknowledgeMutation()
        }
        return result
      }
      case 'setResourceAvailability': {
        const detail = setResourceAvailability(database, request.input)
        this.acknowledgeMutation()
        return detail
      }
      case 'repairProviderStateRef': {
        const detail = repairProviderStateRef(database, request.input)
        this.acknowledgeMutation()
        return detail
      }
      case 'markSeen': {
        const result = markSeen(database, request.input)
        if (result.mutated) {
          this.acknowledgeMutation()
        }
        return result.value
      }
      case 'discardEmptyShell': {
        const result = discardEmptyShell(database, request.input)
        if (result.mutated) {
          this.acknowledgeMutation()
        }
        return result.value
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
      workerPort.postMessage({
        id: request.id,
        ok: true,
        value: result,
        clock: owner.acknowledgementClock(),
      })
      if (request.operation === 'close') {
        workerPort.close()
      }
    } catch (error) {
      postFailure(id, error)
    }
  })
}
