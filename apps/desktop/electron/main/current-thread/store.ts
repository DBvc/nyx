import { randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'

import type { NyxChatImageRef, NyxChatTargetSelection } from '../../../shared/chat/types'
import type { ResponsesContinuationStateV1 } from '../chat/provider-stream'
import { createCurrentThreadFileAdapter, type CurrentThreadFileAdapter } from './file-adapter'
import {
  createInterruptedThreadErrorRecord,
  parseCurrentThreadRecord,
  type CurrentThreadDocumentRef,
  type CurrentThreadRecord,
  type ProviderStateRef,
  type TurnRecord,
} from './schemas'
import { CurrentThreadProviderStateFiles } from './provider-state-files'

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
  providerStates?: CurrentThreadProviderStateFiles
}

export interface CreateCurrentThreadInput {
  attemptRequestId: string
  userMessageId: string
  assistantMessageId: string
  userContent: string
  targetSelection: NyxChatTargetSelection
  imageRefs?: ReadonlyArray<NyxChatImageRef>
  documentRefs?: ReadonlyArray<CurrentThreadDocumentRef>
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

  return parseCurrentThreadRecord({
    ...record,
    turns: record.turns.map((turn, index) =>
      index === pendingIndex
        ? {
            ...turn,
            assistantStatus: 'failed',
            error: createInterruptedThreadErrorRecord(),
            providerStateRef: null,
            updatedAt: now,
          }
        : turn,
    ),
    updatedAt: now,
  })
}

function recordsEqual(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function assertStableIdentity(currentRecord: CurrentThreadRecord, nextRecord: CurrentThreadRecord) {
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
        !recordsEqual(currentTurn.imageRefs, nextTurn.imageRefs) ||
        !recordsEqual(currentTurn.documentRefs, nextTurn.documentRefs) ||
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

function isResolvedTargetBindingTransition(currentTurn: TurnRecord, nextTurn: TurnRecord) {
  if (
    currentTurn.assistantStatus !== 'pending' ||
    nextTurn.assistantStatus !== 'pending' ||
    currentTurn.targetBinding.attribution ||
    !nextTurn.targetBinding.attribution
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

function isValidPendingSettlement(currentTurn: TurnRecord, nextTurn: TurnRecord) {
  if (
    currentTurn.assistantStatus !== 'pending' ||
    nextTurn.attemptRequestId !== currentTurn.attemptRequestId ||
    nextTurn.assistantStatus === 'pending' ||
    !recordsEqual(currentTurn.targetBinding, nextTurn.targetBinding)
  ) {
    return false
  }

  if (currentTurn.targetBinding.attribution) {
    return true
  }

  return (
    nextTurn.assistantContent === currentTurn.assistantContent &&
    nextTurn.providerStateRef === null &&
    ((nextTurn.assistantStatus === 'cancelled' && nextTurn.error === null) ||
      (nextTurn.assistantStatus === 'failed' &&
        nextTurn.error?.code === 'target_unavailable' &&
        nextTurn.error.retryable))
  )
}

function assertValidTransition(
  currentRecord: CurrentThreadRecord,
  nextRecord: CurrentThreadRecord,
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

    if (
      previousTurnsUnchanged &&
      appendedTurn?.assistantStatus === 'pending' &&
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
    const retriesFailed =
      currentTurn.assistantStatus === 'failed' &&
      Boolean(currentTurn.error?.retryable) &&
      nextTurn.assistantStatus === 'pending' &&
      nextTurn.attemptRequestId !== currentTurn.attemptRequestId &&
      nextTurn.targetBinding.attribution === null &&
      nextTurn.providerStateRef === null

    if (
      previousTurnsUnchanged &&
      (isValidPendingSettlement(currentTurn, nextTurn) ||
        isResolvedTargetBindingTransition(currentTurn, nextTurn) ||
        retriesFailed)
    ) {
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
  private readonly providerStates: CurrentThreadProviderStateFiles
  private operationQueue: Promise<void> = Promise.resolve()
  private loaded = false
  private currentRecord: CurrentThreadRecord | null = null

  constructor({
    filePath,
    now = () => new Date().toISOString(),
    generateId = randomUUID,
    fileAdapter = createCurrentThreadFileAdapter(),
    providerStates,
  }: CurrentThreadStoreOptions) {
    this.filePath = filePath
    this.now = now
    this.generateId = generateId
    this.fileAdapter = fileAdapter
    this.providerStates =
      providerStates ??
      new CurrentThreadProviderStateFiles({
        directoryPath: join(dirname(filePath), 'current-thread-provider-state'),
        fileAdapter,
      })
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
      const { targetSelection, imageRefs = [], documentRefs = [], ...turnInput } = input
      const record = parseCurrentThreadRecord({
        version: 5,
        threadId: this.generateId(),
        turns: [
          {
            ...turnInput,
            imageRefs,
            documentRefs,
            assistantContent: '',
            assistantStatus: 'pending',
            error: null,
            targetBinding: {
              selection: targetSelection,
              attribution: null,
            },
            providerStateRef: null,
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

  write(record: CurrentThreadRecord) {
    return this.enqueue(async () => {
      await this.ensureLoaded()
      const parsedRecord = parseCurrentThreadRecord(record)

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

  prepareProviderState(state: ResponsesContinuationStateV1, executionIdentity: string) {
    return this.providerStates.prepare(state, executionIdentity)
  }

  commitProviderState(ref: ProviderStateRef) {
    return this.providerStates.commit(ref)
  }

  rollbackProviderState(ref: ProviderStateRef) {
    return this.providerStates.rollback(ref)
  }

  readProviderState(ref: ProviderStateRef) {
    return this.providerStates.read(ref)
  }

  repairProviderStateRefs(executionIdentity: string) {
    return this.enqueue(async () => {
      await this.ensureLoaded()

      if (!this.currentRecord) {
        return { record: null, clearedCount: 0 }
      }

      const clearedCount = this.currentRecord.turns.filter(
        (turn) => turn.providerStateRef?.executionIdentity === executionIdentity,
      ).length

      if (clearedCount === 0) {
        return { record: cloneRecord(this.currentRecord), clearedCount }
      }

      const now = this.now()
      const repaired = parseCurrentThreadRecord({
        ...this.currentRecord,
        turns: this.currentRecord.turns.map((turn) =>
          turn.providerStateRef?.executionIdentity === executionIdentity
            ? { ...turn, providerStateRef: null, updatedAt: now }
            : turn,
        ),
        updatedAt: now,
      })

      await this.writeAtomic(repaired)
      this.currentRecord = repaired
      await this.providerStates.reconcile(repaired)

      return { record: cloneRecord(repaired), clearedCount }
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

      try {
        await this.providerStates.reset()
      } catch {
        // The record is already reset; leftover provider state is unreachable.
      }
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
        await this.providerStates.reconcile(null)
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
    await this.providerStates.reconcile(this.currentRecord)
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
