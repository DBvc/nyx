import { randomUUID } from 'node:crypto'

import { createCurrentThreadFileAdapter, type CurrentThreadFileAdapter } from './file-adapter'
import {
  createInterruptedThreadErrorRecordV1,
  parseCurrentThreadRecordV1,
  type CurrentThreadRecordV1,
  type TurnRecordV1,
} from './schemas'

export type CurrentThreadStoreErrorCode =
  | 'io_error'
  | 'malformed_json'
  | 'schema_invalid'
  | 'thread_exists'
  | 'thread_missing'
  | 'identity_mismatch'
  | 'invalid_transition'

export class CurrentThreadStoreError extends Error {
  readonly code: CurrentThreadStoreErrorCode

  constructor(code: CurrentThreadStoreErrorCode, message: string) {
    super(message)
    this.name = 'CurrentThreadStoreError'
    this.code = code
  }
}

export interface CurrentThreadStoreOptions {
  filePath: string
  now?: () => string
  generateId?: () => string
  fileAdapter?: CurrentThreadFileAdapter
}

export interface CreateCurrentThreadInput {
  attemptRequestId: string
  userMessageId: string
  assistantMessageId: string
  userContent: string
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}

function cloneRecord(record: CurrentThreadRecordV1): CurrentThreadRecordV1 {
  return parseCurrentThreadRecordV1(record)
}

function parseStoredRecord(raw: string) {
  let value: unknown

  try {
    value = JSON.parse(raw)
  } catch {
    throw new CurrentThreadStoreError('malformed_json', 'Current thread file is not valid JSON.')
  }

  try {
    return parseCurrentThreadRecordV1(value)
  } catch {
    throw new CurrentThreadStoreError('schema_invalid', 'Current thread file shape is invalid.')
  }
}

function recoverInterruptedTurn(record: CurrentThreadRecordV1, now: string) {
  const pendingIndex = record.turns.findIndex((turn) => turn.assistantStatus === 'pending')

  if (pendingIndex < 0) {
    return null
  }

  const pendingTurn = record.turns[pendingIndex]!
  const recoveredTurn = {
    ...pendingTurn,
    assistantStatus: 'failed',
    error: createInterruptedThreadErrorRecordV1(),
    updatedAt: now,
  } satisfies TurnRecordV1
  const turns = record.turns.map((turn, index) => (index === pendingIndex ? recoveredTurn : turn))

  return parseCurrentThreadRecordV1({
    ...record,
    turns,
    updatedAt: now,
  })
}

function recordsEqual(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function assertStableIdentity(
  currentRecord: CurrentThreadRecordV1,
  nextRecord: CurrentThreadRecordV1,
) {
  const identityChanged =
    currentRecord.threadId !== nextRecord.threadId ||
    currentRecord.createdAt !== nextRecord.createdAt ||
    nextRecord.turns.length < currentRecord.turns.length ||
    currentRecord.turns.some((currentTurn, index) => {
      const nextTurn = nextRecord.turns[index]

      return (
        !nextTurn ||
        currentTurn.userMessageId !== nextTurn.userMessageId ||
        currentTurn.assistantMessageId !== nextTurn.assistantMessageId ||
        currentTurn.userContent !== nextTurn.userContent ||
        currentTurn.createdAt !== nextTurn.createdAt
      )
    })

  if (identityChanged) {
    throw new CurrentThreadStoreError(
      'identity_mismatch',
      'Current thread and message identity must remain stable.',
    )
  }
}

function assertValidTransition(
  currentRecord: CurrentThreadRecordV1,
  nextRecord: CurrentThreadRecordV1,
) {
  assertStableIdentity(currentRecord, nextRecord)

  if (recordsEqual(currentRecord, nextRecord)) {
    return
  }

  const currentTurns = currentRecord.turns
  const nextTurns = nextRecord.turns

  if (nextTurns.length === currentTurns.length + 1) {
    const previousTurnsUnchanged = currentTurns.every((turn, index) =>
      recordsEqual(turn, nextTurns[index]),
    )
    const appendedTurn = nextTurns.at(-1)

    if (previousTurnsUnchanged && appendedTurn?.assistantStatus === 'pending') {
      return
    }
  } else if (nextTurns.length === currentTurns.length) {
    const previousTurnsUnchanged = currentTurns
      .slice(0, -1)
      .every((turn, index) => recordsEqual(turn, nextTurns[index]))
    const currentTurn = currentTurns.at(-1)!
    const nextTurn = nextTurns.at(-1)!
    const settlesPending =
      currentTurn.assistantStatus === 'pending' &&
      nextTurn.attemptRequestId === currentTurn.attemptRequestId &&
      nextTurn.assistantStatus !== 'pending'
    const retriesFailed =
      currentTurn.assistantStatus === 'failed' &&
      nextTurn.assistantStatus === 'pending' &&
      nextTurn.attemptRequestId !== currentTurn.attemptRequestId

    if (previousTurnsUnchanged && (settlesPending || retriesFailed)) {
      return
    }
  }

  throw new CurrentThreadStoreError(
    'invalid_transition',
    'Current thread update is not a valid append, settlement, or retry.',
  )
}

export class CurrentThreadStore {
  private readonly filePath: string
  private readonly now: () => string
  private readonly generateId: () => string
  private readonly fileAdapter: CurrentThreadFileAdapter
  private operationQueue: Promise<void> = Promise.resolve()
  private loaded = false
  private currentRecord: CurrentThreadRecordV1 | null = null

  constructor({
    filePath,
    now = () => new Date().toISOString(),
    generateId = randomUUID,
    fileAdapter = createCurrentThreadFileAdapter(),
  }: CurrentThreadStoreOptions) {
    this.filePath = filePath
    this.now = now
    this.generateId = generateId
    this.fileAdapter = fileAdapter
  }

  read() {
    return this.enqueue(async () => {
      await this.ensureLoaded()
      return this.currentRecord ? cloneRecord(this.currentRecord) : null
    })
  }

  create(input: CreateCurrentThreadInput) {
    return this.enqueue(async () => {
      await this.ensureLoaded()

      if (this.currentRecord) {
        throw new CurrentThreadStoreError(
          'thread_exists',
          'A durable current thread already exists.',
        )
      }

      const now = this.now()
      const record = parseCurrentThreadRecordV1({
        version: 1,
        threadId: this.generateId(),
        turns: [
          {
            ...input,
            assistantContent: '',
            assistantStatus: 'pending',
            error: null,
            createdAt: now,
            updatedAt: now,
          },
        ],
        createdAt: now,
        updatedAt: now,
      })

      await this.writeAtomic(record)
      this.currentRecord = record

      return cloneRecord(record)
    })
  }

  write(record: CurrentThreadRecordV1) {
    return this.enqueue(async () => {
      await this.ensureLoaded()

      const parsedRecord = parseCurrentThreadRecordV1(record)

      if (!this.currentRecord) {
        throw new CurrentThreadStoreError(
          'thread_missing',
          'A durable current thread must be created before it can be updated.',
        )
      }

      assertValidTransition(this.currentRecord, parsedRecord)

      await this.writeAtomic(parsedRecord)
      this.currentRecord = parsedRecord

      return cloneRecord(parsedRecord)
    })
  }

  reset() {
    return this.enqueue(async () => {
      try {
        await this.fileAdapter.remove(this.filePath)
      } catch (error) {
        if (!isNodeError(error) || error.code !== 'ENOENT') {
          throw new CurrentThreadStoreError('io_error', 'Could not reset current thread file.')
        }
      }

      this.currentRecord = null
      this.loaded = true
    })
  }

  private enqueue<TValue>(operation: () => Promise<TValue>) {
    const result = this.operationQueue.then(operation, operation)
    this.operationQueue = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }

  private async ensureLoaded() {
    if (this.loaded) {
      return
    }

    let raw: string

    try {
      raw = await this.fileAdapter.readText(this.filePath)
    } catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        this.currentRecord = null
        this.loaded = true
        return
      }

      throw new CurrentThreadStoreError('io_error', 'Could not read current thread file.')
    }

    const storedRecord = parseStoredRecord(raw)
    const recoveredRecord = recoverInterruptedTurn(storedRecord, this.now())

    if (recoveredRecord) {
      await this.writeAtomic(recoveredRecord)
    }

    this.currentRecord = recoveredRecord ?? storedRecord
    this.loaded = true
  }

  private async writeAtomic(record: CurrentThreadRecordV1) {
    const tempPath = this.fileAdapter.createTempPath(this.filePath)
    const contents = `${JSON.stringify(record, null, 2)}\n`

    try {
      await this.fileAdapter.ensureParentDirectory(this.filePath)
      await this.fileAdapter.writeText(tempPath, contents, 0o600)
      await this.fileAdapter.rename(tempPath, this.filePath)
    } catch {
      try {
        await this.fileAdapter.remove(tempPath)
      } catch {
        // Preserve the original failure and leave the durable file untouched.
      }

      throw new CurrentThreadStoreError('io_error', 'Could not write current thread file.')
    }
  }
}

export function createCurrentThreadStore(options: CurrentThreadStoreOptions) {
  return new CurrentThreadStore(options)
}
