import { Worker } from 'node:worker_threads'
import { isDeepStrictEqual } from 'node:util'

import {
  parseThreadLibraryReply,
  threadLibrarySafeErrorMessages,
  type ImportedV5Rows,
  type ThreadLibraryMutationOutcome,
  type ThreadLibraryOperation,
  type ThreadLibraryOperationInput,
  type ThreadLibraryReply,
  type ThreadLibraryRequest,
  type ThreadLibrarySafeErrorCode,
  type ThreadLibraryThreadDetail,
} from './protocol'

type PendingRequest = {
  generation: number
  operation: ThreadLibraryOperation
  resolve(value: ThreadLibraryReply): void
  reject(error: ThreadLibraryTransportError): void
  timer: NodeJS.Timeout
}

export class ThreadLibraryTransportError extends Error {
  constructor(
    message: string,
    readonly outcome: ThreadLibraryMutationOutcome = 'outcome_unknown',
  ) {
    super(message)
    this.name = 'ThreadLibraryTransportError'
  }
}

function failure(
  id: string,
  code: ThreadLibrarySafeErrorCode,
  outcome: ThreadLibraryMutationOutcome,
) {
  return {
    id,
    ok: false,
    safeError: { code, message: threadLibrarySafeErrorMessages[code] },
    outcome,
  } as const
}

function matchesMaterialize(
  input: ThreadLibraryOperationInput['materialize'],
  detail: ThreadLibraryThreadDetail,
) {
  const fallbackOrdinal = detail.summary.fallbackOrdinal
  const expectedTitle =
    fallbackOrdinal && fallbackOrdinal > 1 ? `${input.title} · ${fallbackOrdinal}` : input.title

  return (
    detail.summary.id === input.threadId &&
    detail.summary.location === 'available' &&
    detail.summary.pinPosition === null &&
    detail.summary.title === expectedTitle &&
    detail.summary.titleSource === 'auto' &&
    detail.summary.fallbackLocalSecond === input.fallbackLocalSecond &&
    (input.fallbackLocalSecond === null
      ? fallbackOrdinal === null
      : fallbackOrdinal !== null && fallbackOrdinal > 0) &&
    detail.summary.threadRevision === 1 &&
    detail.summary.lastUserActivityAt === input.createdAt &&
    detail.summary.resultRevision === 0 &&
    detail.summary.seenResultRevision === 0 &&
    detail.summary.createdAt === input.createdAt &&
    detail.summary.updatedAt === input.createdAt &&
    detail.draft.threadId === input.threadId &&
    detail.draft.draftRevision === 0 &&
    detail.draft.text === '' &&
    isDeepStrictEqual(detail.draft.targetSelection, input.targetSelection) &&
    detail.draft.updatedAt === input.createdAt &&
    detail.turns.length === 0 &&
    detail.images.length === 0 &&
    detail.documents.length === 0 &&
    detail.providerStateRefs.length === 0
  )
}

function matchesImportedRows(rows: ImportedV5Rows, detail: ThreadLibraryThreadDetail) {
  return isDeepStrictEqual(
    {
      thread: detail.summary,
      draft: detail.draft,
      turns: detail.turns,
      images: detail.images.map(({ owner: _, ...row }) => row),
      documents: detail.documents.map(({ owner: _, ...row }) => row),
      providerStateRefs: detail.providerStateRefs,
    },
    rows,
  )
}

function draftMatches(
  input: ThreadLibraryOperationInput['saveDraft'],
  detail: ThreadLibraryThreadDetail,
) {
  return (
    detail.draft.draftRevision === input.expectedDraftRevision + 1 &&
    detail.draft.text === input.draft.text &&
    isDeepStrictEqual(detail.draft.targetSelection, input.draft.targetSelection) &&
    detail.draft.updatedAt === input.savedAt &&
    isDeepStrictEqual(
      detail.images
        .filter((row) => row.owner === 'draft')
        .map(({ threadId: _, owner: __, turnOrdinal: ___, ...row }) => row),
      input.draft.images,
    ) &&
    isDeepStrictEqual(
      detail.documents
        .filter((row) => row.owner === 'draft')
        .map(({ threadId: _, owner: __, turnOrdinal: ___, ...row }) => row),
      input.draft.documents,
    )
  )
}

function startMatches(
  input: ThreadLibraryOperationInput['startTurn'],
  detail: ThreadLibraryThreadDetail,
) {
  const turn = detail.turns.find((row) => row.attemptRequestId === input.requestId)
  return (
    detail.summary.location === 'available' &&
    detail.draft.draftRevision === input.expectedDraftRevision + 1 &&
    detail.draft.text === '' &&
    detail.draft.updatedAt === input.startedAt &&
    !detail.images.some((row) => row.owner === 'draft') &&
    !detail.documents.some((row) => row.owner === 'draft') &&
    turn?.userMessageId === input.userMessageId &&
    turn.assistantMessageId === input.assistantMessageId &&
    turn.assistantStatus === 'pending' &&
    turn.createdAt === input.startedAt
  )
}

function retryMatches(
  input: ThreadLibraryOperationInput['retryTurn'],
  detail: ThreadLibraryThreadDetail,
) {
  const turn = detail.turns[input.turnOrdinal]
  return (
    detail.summary.location === 'available' &&
    detail.draft.draftRevision === input.expectedDraftRevision &&
    turn?.attemptRequestId === input.requestId &&
    turn.assistantStatus === 'pending' &&
    turn.assistantContent === '' &&
    turn.error === null &&
    turn.updatedAt === input.retriedAt &&
    isDeepStrictEqual(turn.targetSelection, detail.draft.targetSelection)
  )
}

function terminalMatches(
  input: ThreadLibraryOperationInput['settleTurn'],
  detail: ThreadLibraryThreadDetail,
) {
  const turn = detail.turns.find((row) => row.attemptRequestId === input.requestId)
  if (
    !turn ||
    turn.assistantStatus !== input.assistantStatus ||
    turn.assistantContent !== input.assistantContent ||
    !isDeepStrictEqual(turn.error, input.error) ||
    turn.updatedAt !== input.settledAt
  ) {
    return false
  }
  if (input.providerStateRef === null) {
    return turn.providerStateId === null
  }
  return (
    turn.providerStateId === input.providerStateRef.stateId &&
    detail.providerStateRefs.some(
      (row) =>
        row.turnOrdinal === turn.ordinal &&
        row.stateId === input.providerStateRef?.stateId &&
        row.protocol === input.providerStateRef.protocol &&
        row.executionIdentity === input.providerStateRef.executionIdentity &&
        row.byteLength === input.providerStateRef.byteLength &&
        row.sha256 === input.providerStateRef.sha256,
    )
  )
}

export class ThreadLibraryClient {
  private readonly databasePath: string
  private generation = 0
  private lastExit: Promise<void> = Promise.resolve()
  private pending = new Map<string, PendingRequest>()
  private replacement: { generation: number; promise: Promise<boolean> } | null = null
  private requestCounter = 0
  private worker: Worker | null = null

  constructor(databasePath: string) {
    this.databasePath = databasePath
  }

  async open() {
    await this.startWorker()
    const reply = await this.send('open', { databasePath: this.databasePath })
    if (!reply.ok) {
      await this.stopWorker()
    }
    return reply
  }

  async close() {
    if (!this.worker) {
      return { id: 'closed', ok: true, value: { closed: true } } as const
    }
    const reply = await this.send('close', {})
    await this.lastExit
    return reply
  }

  readThread(input: ThreadLibraryOperationInput['readThread']) {
    return this.send('readThread', input)
  }

  listPage(input: ThreadLibraryOperationInput['listPage']) {
    return this.send('listPage', input)
  }

  saveDraft(input: ThreadLibraryOperationInput['saveDraft']) {
    return this.mutateThread('saveDraft', input, (id, canonical) => {
      if (canonical === undefined) {
        return failure(id, 'library_unavailable', 'outcome_unknown')
      }
      if (canonical === null) {
        return failure(id, 'not_found', 'definitely_not_committed')
      }
      if (draftMatches(input, canonical)) {
        return { id, ok: true, value: { status: 'committed', detail: canonical } }
      }
      return failure(
        id,
        canonical.draft.draftRevision === input.expectedDraftRevision
          ? 'library_unavailable'
          : 'stale_revision',
        canonical.draft.draftRevision === input.expectedDraftRevision
          ? 'definitely_not_committed'
          : 'outcome_unknown',
      )
    })
  }

  startTurn(input: ThreadLibraryOperationInput['startTurn']) {
    return this.mutateThread('startTurn', input, (id, canonical) => {
      if (canonical === undefined) {
        return failure(id, 'library_unavailable', 'outcome_unknown')
      }
      if (canonical === null) {
        return failure(id, 'not_found', 'definitely_not_committed')
      }
      if (startMatches(input, canonical)) {
        return { id, ok: true, value: { status: 'committed', detail: canonical } }
      }
      return failure(
        id,
        canonical.draft.draftRevision === input.expectedDraftRevision
          ? 'library_unavailable'
          : 'stale_revision',
        canonical.draft.draftRevision === input.expectedDraftRevision
          ? 'definitely_not_committed'
          : 'outcome_unknown',
      )
    })
  }

  retryTurn(input: ThreadLibraryOperationInput['retryTurn']) {
    return this.mutateThread('retryTurn', input, (id, canonical) => {
      if (canonical === undefined) {
        return failure(id, 'library_unavailable', 'outcome_unknown')
      }
      if (canonical === null) {
        return failure(id, 'not_found', 'definitely_not_committed')
      }
      if (retryMatches(input, canonical)) {
        return { id, ok: true, value: { status: 'committed', detail: canonical } }
      }
      const previous = canonical.turns[input.turnOrdinal]
      if (
        canonical.draft.draftRevision === input.expectedDraftRevision &&
        previous?.attemptRequestId === input.expectedAttemptRequestId &&
        previous.assistantStatus === 'failed'
      ) {
        return failure(id, 'library_unavailable', 'definitely_not_committed')
      }
      return failure(id, 'not_pending', 'outcome_unknown')
    })
  }

  bindTurnTarget(input: ThreadLibraryOperationInput['bindTurnTarget']) {
    return this.mutateThread(
      'bindTurnTarget',
      input,
      (id, canonical) => {
        if (canonical === undefined) {
          return failure(id, 'library_unavailable', 'outcome_unknown')
        }
        if (canonical === null) {
          return failure(id, 'not_found', 'definitely_not_committed')
        }
        const turn = canonical.turns.find((row) => row.attemptRequestId === input.requestId)
        if (turn && isDeepStrictEqual(turn.targetAttribution, input.targetAttribution)) {
          return { id, ok: true, value: canonical }
        }
        return failure(
          id,
          turn?.assistantStatus === 'pending' && turn.targetAttribution === null
            ? 'library_unavailable'
            : 'not_pending',
          turn?.assistantStatus === 'pending' && turn.targetAttribution === null
            ? 'definitely_not_committed'
            : 'outcome_unknown',
        )
      },
      ['not_pending'],
    )
  }

  settleTurn(input: ThreadLibraryOperationInput['settleTurn']) {
    return this.mutateThread(
      'settleTurn',
      input,
      (id, canonical) => {
        if (canonical === undefined) {
          return failure(id, 'library_unavailable', 'outcome_unknown')
        }
        if (canonical === null) {
          return failure(id, 'not_found', 'definitely_not_committed')
        }
        if (terminalMatches(input, canonical)) {
          return { id, ok: true, value: canonical }
        }
        const turn = canonical.turns.find((row) => row.attemptRequestId === input.requestId)
        return failure(
          id,
          turn?.assistantStatus === 'pending' ? 'library_unavailable' : 'not_pending',
          'definitely_not_committed',
        )
      },
      ['not_pending'],
    )
  }

  setResourceAvailability(input: ThreadLibraryOperationInput['setResourceAvailability']) {
    return this.mutateThread('setResourceAvailability', input, (id, canonical) => {
      if (canonical === undefined) {
        return failure(id, 'library_unavailable', 'outcome_unknown')
      }
      if (canonical === null) {
        return failure(id, 'not_found', 'definitely_not_committed')
      }
      const images = new Map(canonical.images.map((row) => [row.imageId, row.available]))
      const documents = new Map(canonical.documents.map((row) => [row.documentId, row.available]))
      if (
        input.images.every((row) => images.get(row.id) === row.available) &&
        input.documents.every((row) => documents.get(row.id) === row.available)
      ) {
        return { id, ok: true, value: canonical }
      }
      return failure(id, 'library_unavailable', 'outcome_unknown')
    })
  }

  repairProviderStateRef(input: ThreadLibraryOperationInput['repairProviderStateRef']) {
    return this.mutateThread('repairProviderStateRef', input, (id, canonical) => {
      if (canonical === undefined) {
        return failure(id, 'library_unavailable', 'outcome_unknown')
      }
      if (canonical === null) {
        return failure(id, 'not_found', 'definitely_not_committed')
      }
      const turn = canonical.turns.find((row) => row.attemptRequestId === input.requestId)
      const ref = canonical.providerStateRefs.find(
        (row) => row.stateId === input.providerStateRef.stateId,
      )
      if (turn && turn.providerStateId === null && ref === undefined) {
        return { id, ok: true, value: canonical }
      }
      if (
        turn?.providerStateId === input.providerStateRef.stateId &&
        ref &&
        ref.executionIdentity === input.providerStateRef.executionIdentity &&
        ref.byteLength === input.providerStateRef.byteLength &&
        ref.sha256 === input.providerStateRef.sha256
      ) {
        return failure(id, 'library_unavailable', 'definitely_not_committed')
      }
      return failure(id, 'not_found', 'definitely_not_committed')
    })
  }

  async recoverPending(input: ThreadLibraryOperationInput['recoverPending']) {
    const generation = this.generation
    let requestId = ''
    try {
      const reply = await this.send('recoverPending', input, (id) => {
        requestId = id
      })
      if (!reply.ok && reply.outcome === 'outcome_unknown') {
        this.invalidateGeneration(generation, 'Thread recovery outcome is unknown.')
      }
      return reply
    } catch (error) {
      if (!(error instanceof ThreadLibraryTransportError)) {
        throw error
      }
      return failure(
        requestId || 'recoverPending',
        'library_unavailable',
        error.outcome,
      ) as ThreadLibraryReply<'recoverPending'>
    }
  }

  async importV5(rows: ImportedV5Rows) {
    const failedGeneration = this.generation
    let requestId = ''
    try {
      const reply = await this.send('importV5', { rows }, (id) => {
        requestId = id
      })
      if (reply.ok) {
        return reply
      }
      if (reply.outcome === 'outcome_unknown') {
        this.invalidateGeneration(failedGeneration, 'Thread Library import outcome is unknown.')
        return this.reconcileImport(requestId || reply.id, rows, failedGeneration)
      }
      if (reply.safeError.code === 'already_exists') {
        return this.reconcileImport(requestId || reply.id, rows, null)
      }
      return reply
    } catch (error) {
      if (!(error instanceof ThreadLibraryTransportError)) {
        throw error
      }
      if (error.outcome === 'definitely_not_committed') {
        return failure(
          requestId || 'importV5',
          'library_unavailable',
          'definitely_not_committed',
        ) as ThreadLibraryReply<'importV5'>
      }
    }
    return this.reconcileImport(requestId || 'importV5', rows, failedGeneration)
  }

  async materialize(input: ThreadLibraryOperationInput['materialize']) {
    const failedGeneration = this.generation
    let requestId = ''
    try {
      const reply = await this.send('materialize', input, (id) => {
        requestId = id
      })
      if (reply.ok) {
        return reply
      }
      if (reply.outcome === 'outcome_unknown') {
        this.invalidateGeneration(failedGeneration, 'Thread materialize outcome is unknown.')
        return this.reconcileMaterialize(requestId || reply.id, input, failedGeneration)
      }
      if (reply.safeError.code === 'already_exists') {
        return this.reconcileMaterialize(requestId || reply.id, input, null)
      }
      return reply
    } catch (error) {
      if (!(error instanceof ThreadLibraryTransportError)) {
        throw error
      }
      if (error.outcome === 'definitely_not_committed') {
        return failure(
          requestId || 'materialize',
          'library_unavailable',
          'definitely_not_committed',
        )
      }
      return this.reconcileMaterialize(requestId || 'materialize', input, failedGeneration)
    }
  }

  private async mutateThread<Operation extends ThreadLibraryOperation>(
    operation: Operation,
    input: ThreadLibraryOperationInput[Operation] & { threadId: string },
    reconcile: (
      requestId: string,
      canonical: ThreadLibraryThreadDetail | null | undefined,
    ) => ThreadLibraryReply<Operation>,
    reconcileErrors: ReadonlyArray<ThreadLibrarySafeErrorCode> = [],
  ): Promise<ThreadLibraryReply<Operation>> {
    const failedGeneration = this.generation
    let replaceGeneration: number | null = null
    let requestId = ''
    try {
      const reply = await this.send(operation, input, (id) => {
        requestId = id
      })
      if (reply.ok) {
        return reply
      }
      if (reply.outcome === 'outcome_unknown') {
        replaceGeneration = failedGeneration
        this.invalidateGeneration(
          failedGeneration,
          `Thread Library ${operation} outcome is unknown.`,
        )
      } else if (!reconcileErrors.includes(reply.safeError.code)) {
        return reply
      }
    } catch (error) {
      if (!(error instanceof ThreadLibraryTransportError)) {
        throw error
      }
      if (error.outcome === 'definitely_not_committed') {
        return failure(
          requestId || operation,
          'library_unavailable',
          'definitely_not_committed',
        ) as ThreadLibraryReply<Operation>
      }
      replaceGeneration = failedGeneration
    }
    const canonical = await this.readCanonical(input.threadId, replaceGeneration)
    return reconcile(requestId || operation, canonical)
  }

  private async reconcileMaterialize(
    requestId: string,
    input: ThreadLibraryOperationInput['materialize'],
    failedGeneration: number | null,
  ): Promise<ThreadLibraryReply<'materialize'>> {
    const canonical = await this.readCanonical(input.threadId, failedGeneration)
    if (canonical === undefined) {
      return failure(requestId, 'library_unavailable', 'outcome_unknown')
    }
    if (canonical === null) {
      return failure(requestId, 'not_found', 'definitely_not_committed')
    }
    if (!matchesMaterialize(input, canonical)) {
      return failure(requestId, 'already_exists', 'definitely_not_committed')
    }
    return { id: requestId, ok: true, value: canonical }
  }

  private async reconcileImport(
    requestId: string,
    rows: ImportedV5Rows,
    failedGeneration: number | null,
  ): Promise<ThreadLibraryReply<'importV5'>> {
    const canonical = await this.readCanonical(rows.thread.id, failedGeneration)
    if (canonical === undefined) {
      return failure(
        requestId,
        'library_unavailable',
        'outcome_unknown',
      ) as ThreadLibraryReply<'importV5'>
    }
    if (canonical === null) {
      return failure(
        requestId,
        'not_found',
        'definitely_not_committed',
      ) as ThreadLibraryReply<'importV5'>
    }
    if (!matchesImportedRows(rows, canonical)) {
      return failure(
        requestId,
        'already_exists',
        'definitely_not_committed',
      ) as ThreadLibraryReply<'importV5'>
    }
    return { id: requestId, ok: true, value: { threadId: rows.thread.id, imported: true } }
  }

  private async readCanonical(threadId: string, replaceGeneration: number | null) {
    if (replaceGeneration !== null) {
      if (!(await this.ensureReplacement(replaceGeneration))) {
        return undefined
      }
      try {
        const reply = await this.send('readThread', { threadId })
        return reply.ok ? reply.value : undefined
      } catch {
        return undefined
      }
    }

    const readGeneration = this.generation
    try {
      const reply = await this.send('readThread', { threadId })
      return reply.ok ? reply.value : undefined
    } catch {
      if (!(await this.ensureReplacement(readGeneration))) {
        return undefined
      }
      try {
        const reply = await this.send('readThread', { threadId })
        return reply.ok ? reply.value : undefined
      } catch {
        return undefined
      }
    }
  }

  private async startWorker() {
    await this.lastExit
    if (this.worker) {
      throw new ThreadLibraryTransportError('The Thread Library Worker is already running.')
    }

    const generation = ++this.generation
    let worker: Worker
    try {
      worker = new Worker(new URL('./thread-library-worker.js', import.meta.url), {
        name: 'thread-library',
      })
    } catch {
      throw new ThreadLibraryTransportError(
        'Thread Library Worker could not start.',
        'definitely_not_committed',
      )
    }
    this.worker = worker
    this.lastExit = new Promise((resolveExit) => {
      worker.once('exit', (code) => {
        if (this.worker === worker) {
          this.worker = null
        }
        this.rejectGeneration(
          generation,
          new ThreadLibraryTransportError(`Thread Library Worker exited (${code}).`),
        )
        resolveExit()
      })
    })
    worker.on('message', (message) => this.handleMessage(worker, generation, message))
    worker.once('error', (error) => {
      this.invalidateGeneration(generation, `Thread Library Worker failed: ${error.message}`)
    })
  }

  private async ensureReplacement(failedGeneration: number) {
    if (this.replacement?.generation === failedGeneration) {
      return this.replacement.promise
    }
    if (this.generation > failedGeneration) {
      return this.worker !== null
    }
    if (this.generation !== failedGeneration) {
      return false
    }

    const promise = (async () => {
      try {
        await this.stopWorker()
        await this.startWorker()
        const opened = await this.send('open', { databasePath: this.databasePath })
        if (!opened.ok) {
          await this.stopWorker()
          return false
        }
        return true
      } catch {
        await this.stopWorker()
        return false
      }
    })()
    this.replacement = { generation: failedGeneration, promise }
    try {
      return await promise
    } finally {
      if (this.replacement?.promise === promise) {
        this.replacement = null
      }
    }
  }

  private async stopWorker() {
    const worker = this.worker
    if (worker) {
      void worker.terminate()
    }
    await this.lastExit
  }

  private send<Operation extends ThreadLibraryOperation>(
    operation: Operation,
    input: ThreadLibraryOperationInput[Operation],
    onId?: (id: string) => void,
    timeoutMs = 5_000,
  ): Promise<ThreadLibraryReply<Operation>> {
    const worker = this.worker
    if (!worker) {
      return Promise.reject(
        new ThreadLibraryTransportError(
          'Thread Library Worker is not open.',
          'definitely_not_committed',
        ),
      )
    }
    const generation = this.generation
    const id = `g${generation}-r${++this.requestCounter}`
    onId?.(id)
    const request = { id, operation, input } as ThreadLibraryRequest

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.invalidateGeneration(generation, `Thread Library ${operation} timed out.`)
      }, timeoutMs)
      this.pending.set(id, {
        generation,
        operation,
        resolve: resolve as (value: ThreadLibraryReply) => void,
        reject,
        timer,
      })
      try {
        worker.postMessage(request)
      } catch {
        clearTimeout(timer)
        this.pending.delete(id)
        reject(
          new ThreadLibraryTransportError(
            `Thread Library ${operation} could not be sent.`,
            'definitely_not_committed',
          ),
        )
        this.invalidateGeneration(generation, `Thread Library ${operation} could not be sent.`)
      }
    })
  }

  private handleMessage(worker: Worker, generation: number, message: unknown) {
    if (worker !== this.worker || generation !== this.generation) {
      return
    }
    if (
      typeof message !== 'object' ||
      message === null ||
      !('id' in message) ||
      typeof message.id !== 'string'
    ) {
      this.invalidateGeneration(generation, 'Thread Library Worker sent a malformed reply.')
      return
    }
    const pending = this.pending.get(message.id)
    if (!pending || pending.generation !== generation) {
      this.invalidateGeneration(generation, 'Thread Library Worker sent an unknown reply.')
      return
    }

    let reply: ThreadLibraryReply
    try {
      reply = parseThreadLibraryReply(pending.operation, message)
    } catch {
      this.invalidateGeneration(generation, 'Thread Library Worker sent an invalid reply.')
      return
    }
    clearTimeout(pending.timer)
    this.pending.delete(message.id)
    pending.resolve(reply)
  }

  private invalidateGeneration(generation: number, message: string) {
    if (generation !== this.generation) {
      return
    }
    this.rejectGeneration(generation, new ThreadLibraryTransportError(message))
    if (this.worker) {
      void this.worker.terminate()
    }
  }

  private rejectGeneration(generation: number, error: ThreadLibraryTransportError) {
    for (const [id, pending] of this.pending) {
      if (pending.generation !== generation) {
        continue
      }
      clearTimeout(pending.timer)
      this.pending.delete(id)
      pending.reject(error)
    }
  }
}
