import { describe, expect, it } from 'vitest'

import type { NyxThreadSearchResult } from '../../../shared/threads/types'
import {
  activateThreadSearch,
  beginThreadSearchRequest,
  classifyThreadSearchInput,
  completeThreadSearch,
  exitThreadSearch,
  failThreadSearch,
  initialThreadSearchState,
  invalidateThreadSearch,
  threadSearchLimitMessage,
  updateThreadSearchInput,
} from './thread-search'

const result: NyxThreadSearchResult = {
  threadId: 'thread-1',
  title: 'A result',
  location: 'available',
  source: 'title',
  snippet: 'A result',
  messageId: null,
}

describe('Thread Search state', () => {
  it('handles activation, empty input, IME, debounce, request and exact completion copy', () => {
    const active = activateThreadSearch(initialThreadSearchState)
    const composing = updateThreadSearchInput(active, 'draft', true)
    expect(composing).toMatchObject({ active: true, composing: true, phase: 'idle' })

    const debouncing = updateThreadSearchInput(composing, '  draft  ', false)
    expect(debouncing).toMatchObject({ phase: 'debouncing', status: 'Searching' })
    const searching = beginThreadSearchRequest(debouncing, debouncing.epoch)
    expect(searching.announcement).toBe('Searching')
    expect(completeThreadSearch(searching, searching.epoch, [result], false)).toMatchObject({
      phase: 'ready',
      announcement: '1 result',
    })
    expect(completeThreadSearch(searching, searching.epoch, [], false).announcement).toBe(
      'No results',
    )
    expect(completeThreadSearch(searching, searching.epoch, [result], true).announcement).toBe(
      'Showing first 50 results',
    )
    expect(updateThreadSearchInput(searching, '   ')).toMatchObject({
      phase: 'idle',
      results: [],
      announcement: null,
    })
  })

  it('bounds Unicode code points locally and treats astral characters as one', () => {
    expect(classifyThreadSearchInput('😀'.repeat(256))).toEqual({
      kind: 'valid',
      query: '😀'.repeat(256),
    })
    expect(classifyThreadSearchInput('😀'.repeat(257))).toEqual({ kind: 'invalid' })
    const invalid = updateThreadSearchInput(initialThreadSearchState, 'a'.repeat(257))
    expect(invalid).toMatchObject({
      phase: 'invalid',
      status: threadSearchLimitMessage,
      announcement: threadSearchLimitMessage,
    })
  })

  it('drops stale success and failure, coalesces invalidation, and clears Retry on exit', () => {
    const current = updateThreadSearchInput(initialThreadSearchState, 'needle')
    expect(completeThreadSearch(current, current.epoch - 1, [result], false)).toBe(current)
    expect(failThreadSearch(current, current.epoch - 1)).toBe(current)

    const invalidated = invalidateThreadSearch(current)
    expect(invalidated.query).toBe('needle')
    expect(invalidated.state).toMatchObject({ phase: 'searching', results: [] })

    const failed = failThreadSearch(invalidated.state, invalidated.state.epoch)
    expect(failed.phase).toBe('error')
    expect(exitThreadSearch(failed)).toMatchObject({
      active: false,
      input: '',
      phase: 'idle',
      status: null,
    })
  })
})
