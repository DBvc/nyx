import type { NyxThreadSummary } from '../../../shared/threads/types'

export const threadCollectionPageSize = 50

export interface ThreadCollectionPage {
  rows: ReadonlyArray<NyxThreadSummary>
  nextCursor: string | null
}

export interface ThreadCollectionCandidate {
  rows: ReadonlyArray<NyxThreadSummary>
  nextCursor: string | null
  pageCursors: ReadonlyArray<string>
  loadedPageCount: number
}

export type ThreadCollectionStatus = 'loading' | 'ready' | 'loading-more' | 'error'
export type ThreadCollectionErrorPhase = 'initial' | 'load-more'
export type ThreadCollectionRetryMode = 'hydrate' | 'load-more' | 'refresh'
export type ThreadCollectionFocusRequest =
  | { kind: 'thread'; threadId: string }
  | { kind: 'load-more' }
  | { kind: 'retry' }

export interface ThreadCollectionState extends ThreadCollectionCandidate {
  status: ThreadCollectionStatus
  errorPhase: ThreadCollectionErrorPhase | null
  retryMode: ThreadCollectionRetryMode | null
  pendingFocusThreadId: string | null
  focusRequest: ThreadCollectionFocusRequest | null
  announcements: ReadonlyArray<string>
  endAnnounced: boolean
}

export class ThreadCollectionCandidateError extends Error {
  constructor(
    message: string,
    readonly unsafe = false,
  ) {
    super(message)
    this.name = 'ThreadCollectionCandidateError'
  }
}

export const initialThreadCollectionState: ThreadCollectionState = {
  rows: [],
  nextCursor: null,
  pageCursors: [],
  loadedPageCount: 0,
  status: 'loading',
  errorPhase: null,
  retryMode: null,
  pendingFocusThreadId: null,
  focusRequest: null,
  announcements: [],
  endAnnounced: false,
}

function validatePageRows(
  rows: ReadonlyArray<NyxThreadSummary>,
  seenIds: Set<string>,
  sawRecent: { current: boolean },
) {
  if (rows.length > threadCollectionPageSize) {
    throw new ThreadCollectionCandidateError('A Thread page exceeded the fixed page size.')
  }

  for (const row of rows) {
    if (row.location !== 'available') {
      throw new ThreadCollectionCandidateError('A Thread appeared outside Available.', true)
    }
    if (typeof row.id !== 'string' || row.id.length === 0 || seenIds.has(row.id)) {
      throw new ThreadCollectionCandidateError('A Thread id was not safe and unique.', true)
    }
    seenIds.add(row.id)

    if (row.pinPosition === null) {
      sawRecent.current = true
    } else if (!Number.isSafeInteger(row.pinPosition) || row.pinPosition < 1) {
      throw new ThreadCollectionCandidateError('A Thread Pin was not safe.', true)
    } else if (sawRecent.current) {
      throw new ThreadCollectionCandidateError('A Pinned Thread appeared after Recent.', true)
    }
  }
}

export function buildThreadCollectionCandidate(
  pages: ReadonlyArray<ThreadCollectionPage>,
  pageBudget: number,
): ThreadCollectionCandidate {
  if (!Number.isInteger(pageBudget) || pageBudget < 1 || pages.length < 1) {
    throw new ThreadCollectionCandidateError('A positive page budget is required.')
  }
  if (pages.length > pageBudget) {
    throw new ThreadCollectionCandidateError('The Thread candidate exceeded its page budget.')
  }

  const rows: NyxThreadSummary[] = []
  const seenIds = new Set<string>()
  const seenCursors = new Set<string>()
  const sawRecent = { current: false }

  for (const [index, page] of pages.entries()) {
    if (index > 0 && page.rows.length === 0) {
      throw new ThreadCollectionCandidateError('A Thread page omitted the expected next row.')
    }
    validatePageRows(page.rows, seenIds, sawRecent)
    rows.push(...page.rows)

    if (page.nextCursor !== null) {
      if (page.rows.length !== threadCollectionPageSize || seenCursors.has(page.nextCursor)) {
        throw new ThreadCollectionCandidateError('The Thread page cursor did not advance safely.')
      }
      seenCursors.add(page.nextCursor)
    }
    if (index < pages.length - 1 && page.nextCursor === null) {
      throw new ThreadCollectionCandidateError('A Thread page followed the end of the collection.')
    }
  }

  if (rows.length > pageBudget * threadCollectionPageSize) {
    throw new ThreadCollectionCandidateError('The Thread candidate exceeded its row budget.')
  }

  return {
    rows,
    nextCursor: pages.at(-1)!.nextCursor,
    pageCursors: [...seenCursors],
    loadedPageCount: pages.length,
  }
}

export function appendThreadCollectionPage(
  state: ThreadCollectionState,
  page: ThreadCollectionPage,
): ThreadCollectionCandidate {
  if (!state.nextCursor) {
    throw new ThreadCollectionCandidateError('The Thread collection has no next page.')
  }
  if (page.nextCursor !== null && state.pageCursors.includes(page.nextCursor)) {
    throw new ThreadCollectionCandidateError('The Thread page cursor repeated.')
  }
  if (
    state.loadedPageCount < 1 ||
    state.rows.length > state.loadedPageCount * threadCollectionPageSize
  ) {
    throw new ThreadCollectionCandidateError('The accepted Thread prefix exceeded its budget.')
  }

  const seenIds = new Set(state.rows.map((row) => row.id))
  const sawRecent = { current: state.rows.some((row) => row.pinPosition === null) }
  if (page.rows.length === 0) {
    throw new ThreadCollectionCandidateError('A Thread page omitted the expected next row.')
  }
  validatePageRows(page.rows, seenIds, sawRecent)
  if (page.nextCursor !== null && page.rows.length !== threadCollectionPageSize) {
    throw new ThreadCollectionCandidateError('The Thread page cursor did not advance safely.')
  }

  return {
    rows: [...state.rows, ...page.rows],
    nextCursor: page.nextCursor,
    pageCursors:
      page.nextCursor === null ? state.pageCursors : [...state.pageCursors, page.nextCursor],
    loadedPageCount: state.loadedPageCount + 1,
  }
}

export function beginThreadCollectionHydration(
  state: ThreadCollectionState,
): ThreadCollectionState {
  return {
    ...state,
    status: 'loading',
    errorPhase: null,
    retryMode: null,
    focusRequest: null,
    announcements: [],
  }
}

export function beginThreadCollectionLoadMore(state: ThreadCollectionState): ThreadCollectionState {
  if (state.status !== 'ready' || !state.nextCursor) return state
  return {
    ...state,
    status: 'loading-more',
    errorPhase: null,
    retryMode: null,
    focusRequest: null,
    announcements: [],
  }
}

export function beginThreadCollectionRetry(state: ThreadCollectionState): ThreadCollectionState {
  if (state.status !== 'error' || !state.errorPhase) return state
  return {
    ...state,
    status: state.errorPhase === 'initial' ? 'loading' : 'loading-more',
    errorPhase: null,
    focusRequest: null,
    announcements: [],
  }
}

export function commitThreadCollectionCandidate(
  state: ThreadCollectionState,
  candidate: ThreadCollectionCandidate,
  options: {
    selectedThreadId: string | null
    source: 'hydration' | 'refresh' | 'explicit-load'
  },
): ThreadCollectionState {
  const candidateIds = new Set(candidate.rows.map((row) => row.id))
  const oldIds = new Set(state.rows.map((row) => row.id))
  const firstNewThreadId = candidate.rows.find((row) => !oldIds.has(row.id))?.id ?? null
  const selectedMissing =
    options.selectedThreadId !== null && !candidateIds.has(options.selectedThreadId)
  const pendingFocusThreadId = selectedMissing ? options.selectedThreadId : null
  const pendingAppeared =
    state.pendingFocusThreadId !== null &&
    state.pendingFocusThreadId === options.selectedThreadId &&
    candidateIds.has(state.pendingFocusThreadId)

  let focusRequest: ThreadCollectionFocusRequest | null = null
  if (options.source !== 'refresh') {
    if (pendingAppeared) {
      focusRequest = { kind: 'thread', threadId: state.pendingFocusThreadId! }
    } else if (pendingFocusThreadId && candidate.nextCursor) {
      focusRequest = { kind: 'load-more' }
    } else if (options.source === 'explicit-load' && firstNewThreadId) {
      focusRequest = { kind: 'thread', threadId: firstNewThreadId }
    }
  }

  const announcements: string[] = []
  if (options.source === 'explicit-load') {
    const added = candidate.rows.filter((row) => !oldIds.has(row.id)).length
    if (added > 0) announcements.push(`${added} more threads loaded`)
    if (candidate.nextCursor === null && !state.endAnnounced) announcements.push('End of threads')
  }

  return {
    ...candidate,
    status: 'ready',
    errorPhase: null,
    retryMode: null,
    pendingFocusThreadId,
    focusRequest,
    announcements,
    endAnnounced:
      candidate.nextCursor === null
        ? state.endAnnounced || options.source === 'explicit-load'
        : false,
  }
}

export function failThreadCollection(
  state: ThreadCollectionState,
  phase: ThreadCollectionErrorPhase,
  retryMode: ThreadCollectionRetryMode = phase === 'initial' ? 'hydrate' : 'load-more',
): ThreadCollectionState {
  return {
    ...state,
    status: 'error',
    errorPhase: phase,
    retryMode,
    focusRequest: { kind: 'retry' },
    announcements: [],
  }
}

export function threadCollectionGroups(state: ThreadCollectionState) {
  return {
    pinned: state.rows.filter((row) => row.pinPosition !== null),
    recent: state.rows.filter((row) => row.pinPosition === null),
  }
}

export function currentThreadOutsideCollection(
  state: ThreadCollectionState,
  selected: NyxThreadSummary | null,
) {
  return selected && !state.rows.some((row) => row.id === selected.id) ? selected : null
}
