import type { NyxThreadLocation, NyxThreadSummary } from '../../../shared/threads/types'

export type ThreadCollectionLocation = Extract<NyxThreadLocation, 'available' | 'archived'>

export const threadCollectionPageSize = 50

export interface ThreadCollectionPage {
  rows: ReadonlyArray<NyxThreadSummary>
  nextCursor: string | null
}

export interface ThreadCollectionCandidate {
  location: ThreadCollectionLocation
  rows: ReadonlyArray<NyxThreadSummary>
  nextCursor: string | null
  pageCursors: ReadonlyArray<string>
  loadedPageCount: number
}

export type ThreadCollectionStatus = 'loading' | 'ready' | 'loading-more' | 'error'
export type ThreadCollectionErrorPhase = 'initial' | 'load-more'
export type ThreadCollectionRetryMode = 'hydrate' | 'load-more' | 'refresh'

export interface ThreadCollectionState extends ThreadCollectionCandidate {
  status: ThreadCollectionStatus
  errorPhase: ThreadCollectionErrorPhase | null
  retryMode: ThreadCollectionRetryMode | null
}

export interface ThreadPinActionError {
  threadId: string
  message: string
}

export interface ThreadPinActionState {
  pending: boolean
  error: ThreadPinActionError | null
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
  location: 'available',
  rows: [],
  nextCursor: null,
  pageCursors: [],
  loadedPageCount: 0,
  status: 'loading',
  errorPhase: null,
  retryMode: null,
}

export const initialThreadPinActionState: ThreadPinActionState = {
  pending: false,
  error: null,
}

function validatePageRows(
  rows: ReadonlyArray<NyxThreadSummary>,
  seenIds: Set<string>,
  sawRecent: { current: boolean },
  location: ThreadCollectionLocation,
) {
  if (rows.length > threadCollectionPageSize) {
    throw new ThreadCollectionCandidateError('A Thread page exceeded the fixed page size.')
  }

  for (const row of rows) {
    if (row.location !== location) {
      throw new ThreadCollectionCandidateError('A Thread appeared outside its collection.', true)
    }
    if (typeof row.id !== 'string' || row.id.length === 0 || seenIds.has(row.id)) {
      throw new ThreadCollectionCandidateError('A Thread id was not safe and unique.', true)
    }
    seenIds.add(row.id)

    if (location === 'archived' && row.pinPosition !== null) {
      throw new ThreadCollectionCandidateError('An Archived Thread retained a Pin.', true)
    }
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
  location: ThreadCollectionLocation = 'available',
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
    validatePageRows(page.rows, seenIds, sawRecent, location)
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
    location,
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
  validatePageRows(page.rows, seenIds, sawRecent, state.location)
  if (page.nextCursor !== null && page.rows.length !== threadCollectionPageSize) {
    throw new ThreadCollectionCandidateError('The Thread page cursor did not advance safely.')
  }

  return {
    location: state.location,
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
  }
}

export function beginThreadCollectionLoadMore(state: ThreadCollectionState): ThreadCollectionState {
  if (state.status !== 'ready' || !state.nextCursor) return state
  return {
    ...state,
    status: 'loading-more',
    errorPhase: null,
    retryMode: null,
  }
}

export function beginThreadCollectionRetry(state: ThreadCollectionState): ThreadCollectionState {
  if (state.status !== 'error' || !state.errorPhase) return state
  return {
    ...state,
    status: state.errorPhase === 'initial' ? 'loading' : 'loading-more',
    errorPhase: null,
  }
}

export function commitThreadCollectionCandidate(
  candidate: ThreadCollectionCandidate,
): ThreadCollectionState {
  return {
    ...candidate,
    status: 'ready',
    errorPhase: null,
    retryMode: null,
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
  }
}

export function threadCollectionGroups(state: ThreadCollectionState) {
  return {
    pinned: state.rows.filter((row) => row.pinPosition !== null),
    recent: state.rows.filter((row) => row.pinPosition === null),
  }
}

export function beginThreadPinAction(state: ThreadPinActionState): ThreadPinActionState {
  return { ...state, pending: true }
}

export function failThreadPinAction(
  state: ThreadPinActionState,
  error: ThreadPinActionError,
  pending: boolean,
): ThreadPinActionState {
  return { ...state, pending, error }
}

export function releaseThreadPinAction(state: ThreadPinActionState): ThreadPinActionState {
  return { ...state, pending: false }
}

export function threadPinBoundaries(state: ThreadCollectionState, thread: NyxThreadSummary) {
  if (thread.pinPosition === null) {
    return { atTop: false, atBottom: false }
  }

  const pinned = state.rows.filter((row) => row.pinPosition !== null)
  const targetIndex = pinned.findIndex((row) => row.id === thread.id)
  const bottomIsKnown =
    state.nextCursor === null || state.rows.some((row) => row.pinPosition === null)

  return {
    atTop: thread.pinPosition === 1,
    atBottom: bottomIsKnown && targetIndex >= 0 && targetIndex === pinned.length - 1,
  }
}

export function currentThreadOutsideCollection(
  state: ThreadCollectionState,
  selected: NyxThreadSummary | null,
) {
  return selected && !state.rows.some((row) => row.id === selected.id) ? selected : null
}
