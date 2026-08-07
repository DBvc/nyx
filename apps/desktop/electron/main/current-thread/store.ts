import { randomUUID } from 'node:crypto'

import type { NyxChatTargetSelection } from '../../../shared/chat/types'
import { createCurrentThreadFileAdapter, type CurrentThreadFileAdapter } from './file-adapter'
import {
  createInterruptedThreadErrorRecordV2,
  parseCurrentThreadRecord,
  parseCurrentThreadRecordV2,
  upgradeCurrentThreadRecordForMutation,
  type CurrentThreadRecord,
  type CurrentThreadRecordV2,
  type TurnRecordV2,
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
  targetSelection: NyxChatTargetSelection
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}

function cloneRecord(record: CurrentThreadRecord): CurrentThreadRecord {
  return parseCurrentThreadRecord(record)
}

function parseStoredRecord(raw: string) {
  let value: unknown

  try {
    value = JSON.parse(raw)
  } catch {
    throw new CurrentThreadStoreError('malformed_json', 'Current thread file is not valid JSON.')
  }

  try {
    return parseCurrentThreadRecord(value)
  } catch {
    throw new CurrentThreadStoreError('schema_invalid', 'Current thread file shape is invalid.')
  }
}

function recoverInterruptedTurn(record: CurrentThreadRecord, now: string) {
  const pendingIndex = record.turns.findIndex((turn) => turn.assistantStatus === 'pending')

  if (pendingIndex < 0) {
    return null
  }

  const upgradedRecord = upgradeCurrentThreadRecordForMutation(record)
  const pendingTurn = upgradedRecord.turns[pendingIndex]!
  const recoveredTurn = {
    ...pendingTurn,
    assistantStatus: 'failed',
    error: createInterruptedThreadErrorRecordV2(),
    updatedAt: now,
  } satisfies TurnRecordV2
  const turns = upgradedRecord.turns.map((turn, index) =>
    index === pendingIndex ? recoveredTurn : turn,
  )

  return parseCurrentThreadRecordV2({
    ...upgradedRecord,
    turns,
    updatedAt: now,
  })
}

function recordsEqual(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function assertStableIdentity(
  currentRecord: CurrentThreadRecord,
  nextRecord: CurrentThreadRecordV2,
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

function isResolvedTargetBindingTransition(currentTurn: TurnRecordV2, nextTurn: TurnRecordV2) {
  if (
    currentTurn.assistantStatus !== 'pending' ||
    nextTurn.assistantStatus !== 'pending' ||
    !currentTurn.targetBinding ||
    currentTurn.targetBinding.attribution ||
    !nextTurn.targetBinding?.attribution
  ) {
    return false
  }

  return recordsEqual(nextTurn, {
    ...currentTurn,
    targetBinding: {
      ...currentTurn.targetBinding,
      attribution: nextTurn.targetBinding.attribution,
    },
    updatedAt: nextTurn.updatedAt,
  })
}

function isValidPendingSettlement(currentTurn: TurnRecordV2, nextTurn: TurnRecordV2) {
  if (
    currentTurn.assistantStatus !== 'pending' ||
    nextTurn.attemptRequestId !== currentTurn.attemptRequestId ||
    nextTurn.assistantStatus === 'pending' ||
    !currentTurn.targetBinding ||
    !recordsEqual(currentTurn.targetBinding, nextTurn.targetBinding)
  ) {
    return false
  }

  if (currentTurn.targetBinding.attribution) {
    return true
  }

  return (
    nextTurn.assistantStatus === 'failed' &&
    nextTurn.assistantContent === currentTurn.assistantContent &&
    nextTurn.error?.code === 'target_unavailable' &&
    nextTurn.error.retryable
  )
}

function assertValidTransition(
  currentRecord: CurrentThreadRecord,
  nextRecord: CurrentThreadRecordV2,
) {
  assertStableIdentity(currentRecord, nextRecord)
  const upgradedCurrent = upgradeCurrentThreadRecordForMutation(currentRecord)

  if (currentRecord.version === 2 && recordsEqual(currentRecord, nextRecord)) {
    return
  }

  const currentTurns = upgradedCurrent.turns
  const nextTurns = nextRecord.turns

  if (nextTurns.length === currentTurns.length + 1) {
    const previousTurnsUnchanged = currentTurns.every((turn, index) =>
      recordsEqual(turn, nextTurns[index]),
    )
    const appendedTurn = nextTurns.at(-1)

    if (
      previousTurnsUnchanged &&
      appendedTurn?.assistantStatus === 'pending' &&
      appendedTurn.targetBinding !== null &&
      appendedTurn.targetBinding.attribution === null
    ) {
      return
    }
  } else if (nextTurns.length === currentTurns.length) {
    const previousTurnsUnchanged = currentTurns
      .slice(0, -1)
      .every((turn, index) => recordsEqual(turn, nextTurns[index]))
    const currentTurn = currentTurns.at(-1)!
    const nextTurn = nextTurns.at(-1)!
    const settlesPending = isValidPendingSettlement(currentTurn, nextTurn)
    const bindsResolvedTarget = isResolvedTargetBindingTransition(currentTurn, nextTurn)
    const retriesFailed =
      currentTurn.assistantStatus === 'failed' &&
      Boolean(currentTurn.error?.retryable) &&
      nextTurn.assistantStatus === 'pending' &&
      nextTurn.attemptRequestId !== currentTurn.attemptRequestId &&
      nextTurn.targetBinding !== null &&
      nextTurn.targetBinding.attribution === null

    if (previousTurnsUnchanged && (settlesPending || bindsResolvedTarget || retriesFailed)) {
      return
    }
  }

  throw new CurrentThreadStoreError(
    'invalid_transition',
    'Current thread update is not a valid append, target bind, settlement, or retry.',
  )
}

export class CurrentThreadStore {
  private readonly filePath: string
  private readonly now: () => string
  private readonly generateId: () => string
  private readonly fileAdapter: CurrentThreadFileAdapter
  private operationQueue: Promise<void> = Promise.resolve()
  private loaded = false
  private currentRecord: CurrentThreadRecord | null = null

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
      const { targetSelection, ...turnInput } = input
      const record = parseCurrentThreadRecordV2({
        version: 2,
        threadId: this.generateId(),
        turns: [
          {
            ...turnInput,
            assistantContent: '',
            assistantStatus: 'pending',
            error: null,
            targetBinding: {
              selection: targetSelection,
              attribution: null,
            },
            createdAt: now,
            updatedAt: now,
          },
        ],
        createdAt: now,
        updatedAt: now,
      })

      await this.writeAtomic(record)
      this.currentRecord = record

      return parseCurrentThreadRecordV2(record)
    })
  }

  write(record: CurrentThreadRecordV2) {
    return this.enqueue(async () => {
      await this.ensureLoaded()

      const parsedRecord = parseCurrentThreadRecordV2(record)

      if (!this.currentRecord) {
        throw new CurrentThreadStoreError(
          'thread_missing',
          'A durable current thread must be created before it can be updated.',
        )
      }

      assertValidTransition(this.currentRecord, parsedRecord)

      await this.writeAtomic(parsedRecord)
      this.currentRecord = parsedRecord

      return parseCurrentThreadRecordV2(parsedRecord)
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

  private async writeAtomic(record: CurrentThreadRecord) {
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
