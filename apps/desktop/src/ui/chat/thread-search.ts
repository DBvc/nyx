import type { NyxThreadSearchResult } from '../../../shared/threads/types'

export const threadSearchLimit = 256
export const threadSearchDebounceMs = 120
export const threadSearchLimitMessage = 'Search is limited to 256 characters'

export type ThreadSearchPhase = 'idle' | 'invalid' | 'debouncing' | 'searching' | 'ready' | 'error'

export interface ThreadSearchState {
  active: boolean
  input: string
  composing: boolean
  epoch: number
  phase: ThreadSearchPhase
  results: ReadonlyArray<NyxThreadSearchResult>
  truncated: boolean
  status: string | null
  announcement: string | null
}

export type ThreadSearchInput =
  | { kind: 'empty' }
  | { kind: 'invalid' }
  | { kind: 'valid'; query: string }

export const initialThreadSearchState: ThreadSearchState = {
  active: false,
  input: '',
  composing: false,
  epoch: 0,
  phase: 'idle',
  results: [],
  truncated: false,
  status: null,
  announcement: null,
}

export function classifyThreadSearchInput(input: string): ThreadSearchInput {
  const query = input.trim()
  if (!query) return { kind: 'empty' }

  let codePoints = 0
  for (const _codePoint of query) {
    codePoints += 1
    if (codePoints > threadSearchLimit) return { kind: 'invalid' }
  }
  return { kind: 'valid', query }
}

export function activateThreadSearch(state: ThreadSearchState): ThreadSearchState {
  return state.active ? state : { ...state, active: true }
}

export function updateThreadSearchInput(
  state: ThreadSearchState,
  input: string,
  composing = state.composing,
): ThreadSearchState {
  const epoch = state.epoch + 1
  const classified = classifyThreadSearchInput(input)
  if (classified.kind === 'empty' || composing) {
    return {
      ...state,
      active: true,
      input,
      composing,
      epoch,
      phase: 'idle',
      results: [],
      truncated: false,
      status: null,
      announcement: null,
    }
  }
  if (classified.kind === 'invalid') {
    return {
      ...state,
      active: true,
      input,
      composing,
      epoch,
      phase: 'invalid',
      results: [],
      truncated: false,
      status: threadSearchLimitMessage,
      announcement: threadSearchLimitMessage,
    }
  }
  return {
    ...state,
    active: true,
    input,
    composing,
    epoch,
    phase: 'debouncing',
    results: [],
    truncated: false,
    status: 'Searching',
    announcement: null,
  }
}

export function beginThreadSearchRequest(
  state: ThreadSearchState,
  epoch: number,
): ThreadSearchState {
  if (!state.active || state.epoch !== epoch) return state
  return { ...state, phase: 'searching', status: 'Searching', announcement: 'Searching' }
}

export function completeThreadSearch(
  state: ThreadSearchState,
  epoch: number,
  results: ReadonlyArray<NyxThreadSearchResult>,
  truncated: boolean,
): ThreadSearchState {
  if (!state.active || state.epoch !== epoch) return state
  const announcement = truncated
    ? 'Showing first 50 results'
    : results.length === 0
      ? 'No results'
      : results.length === 1
        ? '1 result'
        : `${results.length} results`
  return {
    ...state,
    phase: 'ready',
    results: results.slice(0, 50),
    truncated,
    status: announcement,
    announcement,
  }
}

export function failThreadSearch(state: ThreadSearchState, epoch: number): ThreadSearchState {
  if (!state.active || state.epoch !== epoch) return state
  return {
    ...state,
    phase: 'error',
    results: [],
    truncated: false,
    status: "Couldn't search",
    announcement: "Couldn't search",
  }
}

export function invalidateThreadSearch(state: ThreadSearchState): {
  state: ThreadSearchState
  query: string | null
} {
  const classified = classifyThreadSearchInput(state.input)
  const epoch = state.epoch + 1
  if (!state.active || classified.kind !== 'valid') {
    return {
      state: {
        ...state,
        epoch,
        results: [],
        truncated: false,
        status: classified.kind === 'invalid' ? threadSearchLimitMessage : null,
        announcement: null,
        phase: classified.kind === 'invalid' ? 'invalid' : 'idle',
      },
      query: null,
    }
  }
  return {
    state: {
      ...state,
      epoch,
      phase: 'searching',
      results: [],
      truncated: false,
      status: 'Searching',
      announcement: null,
    },
    query: classified.query,
  }
}

export function exitThreadSearch(state: ThreadSearchState): ThreadSearchState {
  return { ...initialThreadSearchState, epoch: state.epoch + 1 }
}
