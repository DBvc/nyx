import { randomUUID } from 'node:crypto'

import type { NyxChatImageRef, NyxChatTargetSelection } from '../../../shared/chat/types'
import { createCurrentThreadFileAdapter, type CurrentThreadFileAdapter } from './file-adapter'
import {
  createInterruptedThreadErrorRecordV2,
  parseCurrentThreadRecord,
  parseMutableCurrentThreadRecord,
  upgradeCurrentThreadRecordForImageMutation,
  upgradeCurrentThreadRecordForMutation,
  type CurrentThreadRecord,
  type CurrentThreadRecordV2,
  type CurrentThreadRecordV3,
  type MutableCurrentThreadRecord,
  type MutableTurnRecord,
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

interface CreateCurrentThreadInputBase {
  attemptRequestId: string
  userMessageId: string
  assistantMessageId: string
  userContent: string
  targetSelection: NyxChatTargetSelection
}

type NonEmptyImageRefs = readonly [NyxChatImageRef, ...NyxChatImageRef[]]

export type CreateCurrentThreadInput = CreateCurrentThreadInputBase &
  ({ imageRefs?: undefined } | { imageRefs: NonEmptyImageRefs })

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
  } satisfies MutableTurnRecord
  const turns = upgradedRecord.turns.map((turn, index) =>
    index === pendingIndex ? recoveredTurn : turn,
  )

  return parseMutableCurrentThreadRecord({
    ...upgradedRecord,
    turns,
    updatedAt: now,
  })
}

function recordsEqual(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function recordImageRefs(record: CurrentThreadRecord, index: number) {
  return record.version === 3 ? (record.turns[index]?.imageRefs ?? []) : []
}

function assertStableIdentity(
  currentRecord: CurrentThreadRecord,
  nextRecord: MutableCurrentThreadRecord,
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
        !recordsEqual(recordImageRefs(currentRecord, index), recordImageRefs(nextRecord, index)) ||
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

function isResolvedTargetBindingTransition(
  currentTurn: MutableTurnRecord,
  nextTurn: MutableTurnRecord,
) {
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

function isValidPendingSettlement(currentTurn: MutableTurnRecord, nextTurn: MutableTurnRecord) {
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
  nextRecord: MutableCurrentThreadRecord,
) {
  assertStableIdentity(currentRecord, nextRecord)

  if (currentRecord.version === 3 && nextRecord.version !== 3) {
    throw new CurrentThreadStoreError(
      'invalid_transition',
      'Current thread version 3 records cannot be downgraded.',
    )
  }

  if (
    currentRecord.version !== 3 &&
    nextRecord.version === 3 &&
    nextRecord.turns.length !== currentRecord.turns.length + 1
  ) {
    throw new CurrentThreadStoreError(
      'invalid_transition',
      'Current thread version 3 begins only with an appended image turn.',
    )
  }

  const upgradedCurrent =
    nextRecord.version === 3
      ? upgradeCurrentThreadRecordForImageMutation(currentRecord)
      : upgradeCurrentThreadRecordForMutation(currentRecord)

  if (currentRecord.version === nextRecord.version && recordsEqual(currentRecord, nextRecord)) {
    return
  }

  const currentTurns = upgradedCurrent.turns
  const nextTurns = nextRecord.turns

  if (nextTurns.length === currentTurns.length + 1) {
    const previousTurnsUnchanged = currentTurns.every((turn, index) =>
      recordsEqual(turn, nextTurns[index]),
    )
    const appendedTurn = nextTurns.at(-1)
    const appendedImageRefs = recordImageRefs(nextRecord, nextTurns.length - 1)

    if (
      previousTurnsUnchanged &&
      appendedTurn?.assistantStatus === 'pending' &&
      appendedTurn.targetBinding !== null &&
      appendedTurn.targetBinding.attribution === null &&
      (currentRecord.version === 3 || nextRecord.version !== 3 || appendedImageRefs.length > 0)
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

  create(
    input: CreateCurrentThreadInputBase & { imageRefs?: undefined },
  ): Promise<CurrentThreadRecordV2>
  create(
    input: CreateCurrentThreadInputBase & { imageRefs: NonEmptyImageRefs },
  ): Promise<CurrentThreadRecordV3>
  create(input: CreateCurrentThreadInput): Promise<MutableCurrentThreadRecord>
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
      const { targetSelection, imageRefs, ...turnInput } = input

      if (imageRefs && imageRefs.length === 0) {
        throw new CurrentThreadStoreError(
          'invalid_transition',
          'Current thread version 3 requires at least one image reference at creation.',
        )
      }

      const record = parseMutableCurrentThreadRecord({
        version: imageRefs ? 3 : 2,
        threadId: this.generateId(),
        turns: [
          {
            ...turnInput,
            ...(imageRefs ? { imageRefs } : {}),
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

      return parseMutableCurrentThreadRecord(record)
    })
  }

  write(record: CurrentThreadRecordV2): Promise<CurrentThreadRecordV2>
  write(record: CurrentThreadRecordV3): Promise<CurrentThreadRecordV3>
  write(record: MutableCurrentThreadRecord): Promise<MutableCurrentThreadRecord>
  write(record: MutableCurrentThreadRecord) {
    return this.enqueue(async () => {
      await this.ensureLoaded()

      const parsedRecord = parseMutableCurrentThreadRecord(record)

      if (!this.currentRecord) {
        throw new CurrentThreadStoreError(
          'thread_missing',
          'A durable current thread must be created before it can be updated.',
        )
      }

      assertValidTransition(this.currentRecord, parsedRecord)

      await this.writeAtomic(parsedRecord)
      this.currentRecord = parsedRecord

      return parseMutableCurrentThreadRecord(parsedRecord)
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
