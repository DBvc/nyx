import { describe, expect, it } from 'vitest'

import type { NyxThreadSummary } from '../../../shared/threads/types'
import {
  appendThreadCollectionPage,
  beginThreadCollectionLoadMore,
  buildThreadCollectionCandidate,
  commitThreadCollectionCandidate,
  currentThreadOutsideCollection,
  failThreadCollection,
  initialThreadCollectionState,
  threadCollectionGroups,
  type ThreadCollectionPage,
} from './thread-collection'

function row(value: number, pinPosition: number | null = null): NyxThreadSummary {
  return {
    availability: 'available',
    id: `thread-${value}`,
    location: 'available',
    pinPosition,
    title: `Thread ${value}`,
    threadRevision: 1,
    resultRevision: 0,
    seenResultRevision: 0,
    lastUserActivityAt: '2026-08-20T00:00:00.000Z',
    createdAt: '2026-08-20T00:00:00.000Z',
    updatedAt: '2026-08-20T00:00:00.000Z',
  }
}

function page(
  start: number,
  count: number,
  nextCursor: string | null,
  pin: (value: number) => number | null = () => null,
): ThreadCollectionPage {
  return {
    rows: Array.from({ length: count }, (_, index) => row(start + index, pin(start + index))),
    nextCursor,
  }
}

describe('thread collection candidate', () => {
  it('builds a bounded 50/50/37 prefix without decoding page cursors', () => {
    const candidate = buildThreadCollectionCandidate(
      [page(1, 50, 'opaque-1'), page(51, 50, 'opaque-2'), page(101, 37, null)],
      3,
    )

    expect(candidate).toMatchObject({ loadedPageCount: 3, nextCursor: null })
    expect(candidate.pageCursors).toEqual(['opaque-1', 'opaque-2'])
    expect(candidate.rows).toHaveLength(137)
    expect(candidate.rows.map((item) => item.id)).toEqual(
      Array.from({ length: 137 }, (_, index) => `thread-${index + 1}`),
    )
  })

  it('keeps 50 Pinned and 100 Recent rows in Worker order across pages', () => {
    const candidate = buildThreadCollectionCandidate(
      [page(1, 50, 'opaque-1', (value) => value), page(51, 50, 'opaque-2'), page(101, 50, null)],
      3,
    )
    const groups = threadCollectionGroups({
      ...initialThreadCollectionState,
      ...candidate,
      status: 'ready',
    })

    expect(groups.pinned.map((item) => item.id)).toEqual(
      Array.from({ length: 50 }, (_, index) => `thread-${index + 1}`),
    )
    expect(groups.recent.map((item) => item.id)).toEqual(
      Array.from({ length: 100 }, (_, index) => `thread-${index + 51}`),
    )
  })

  it('groups safely identified unavailable rows without duplicating them', () => {
    const pinnedUnavailable: NyxThreadSummary = {
      availability: 'unavailable',
      id: 'thread-2',
      location: 'available',
      pinPosition: 2,
      title: "Couldn't open this thread",
      unavailable: { code: 'thread_unavailable', message: 'Unavailable.' },
    }
    const recentUnavailable: NyxThreadSummary = {
      ...pinnedUnavailable,
      id: 'thread-52',
      pinPosition: null,
    }
    const first = page(1, 50, 'opaque-1', (value) => value)
    const second = page(51, 50, null)
    const candidate = buildThreadCollectionCandidate(
      [
        { ...first, rows: [first.rows[0]!, pinnedUnavailable, ...first.rows.slice(2)] },
        { ...second, rows: [second.rows[0]!, recentUnavailable, ...second.rows.slice(2)] },
      ],
      2,
    )
    const groups = threadCollectionGroups({
      ...initialThreadCollectionState,
      ...candidate,
      status: 'ready',
    })

    expect(groups.pinned.find((item) => item.id === 'thread-2')).toBe(pinnedUnavailable)
    expect(groups.recent.find((item) => item.id === 'thread-52')).toBe(recentUnavailable)
    expect(new Set([...groups.pinned, ...groups.recent].map((item) => item.id)).size).toBe(100)
  })

  it('rejects duplicates, repeated cursors, mixed groups, and page-budget overflow', () => {
    expect(() =>
      buildThreadCollectionCandidate(
        [page(1, 50, 'opaque-1'), { rows: [row(1)], nextCursor: null }],
        2,
      ),
    ).toThrow('id was not safe and unique')
    expect(() =>
      buildThreadCollectionCandidate([page(1, 50, 'opaque-1'), page(51, 50, 'opaque-1')], 2),
    ).toThrow('cursor did not advance')
    expect(() =>
      buildThreadCollectionCandidate([{ rows: [row(1), row(2, 1)], nextCursor: null }], 1),
    ).toThrow('Pinned Thread appeared after Recent')
    expect(() => buildThreadCollectionCandidate([page(1, 49, 'opaque-1')], 1)).toThrow(
      'cursor did not advance',
    )
    expect(() =>
      buildThreadCollectionCandidate([page(1, 50, 'opaque-1'), page(51, 0, null)], 2),
    ).toThrow('omitted the expected next row')
    expect(() =>
      buildThreadCollectionCandidate(
        [{ rows: [{ ...row(1), location: 'archived' }], nextCursor: null }],
        1,
      ),
    ).toThrow('outside Available')
    expect(() =>
      buildThreadCollectionCandidate([page(1, 50, 'opaque-1'), page(51, 1, null)], 1),
    ).toThrow('page budget')
  })

  it('atomically appends one page and rejects an unchanged next cursor', () => {
    const initial = commitThreadCollectionCandidate(
      initialThreadCollectionState,
      buildThreadCollectionCandidate([page(1, 50, 'opaque-1')], 1),
      { selectedThreadId: 'thread-1', source: 'hydration' },
    )
    const loading = beginThreadCollectionLoadMore(initial)
    const candidate = appendThreadCollectionPage(loading, page(51, 37, null))
    const committed = commitThreadCollectionCandidate(loading, candidate, {
      selectedThreadId: 'thread-1',
      source: 'explicit-load',
    })

    expect(loading.rows).toHaveLength(50)
    expect(committed.rows).toHaveLength(87)
    expect(committed.focusRequest).toEqual({ kind: 'thread', threadId: 'thread-51' })
    expect(committed.announcements).toEqual(['37 more threads loaded', 'End of threads'])
    expect(() => appendThreadCollectionPage(initial, page(51, 50, 'opaque-1'))).toThrow(
      'cursor repeated',
    )
  })

  it('appends beyond the second page without treating the accepted prefix as one page', () => {
    const first = commitThreadCollectionCandidate(
      initialThreadCollectionState,
      buildThreadCollectionCandidate([page(1, 50, 'opaque-1')], 1),
      { selectedThreadId: null, source: 'hydration' },
    )
    const second = commitThreadCollectionCandidate(
      first,
      appendThreadCollectionPage(first, page(51, 50, 'opaque-2')),
      { selectedThreadId: null, source: 'explicit-load' },
    )
    expect(() => appendThreadCollectionPage(second, page(101, 50, 'opaque-1'))).toThrow(
      'cursor repeated',
    )
    const third = appendThreadCollectionPage(second, page(101, 37, null))

    expect(third).toMatchObject({ loadedPageCount: 3, nextCursor: null })
    expect(third.rows).toHaveLength(137)
  })
})

describe('thread collection focus and failure state', () => {
  it('keeps an off-prefix selection separate until a later page reveals it', () => {
    const first = commitThreadCollectionCandidate(
      initialThreadCollectionState,
      buildThreadCollectionCandidate([page(1, 50, 'opaque-1')], 1),
      { selectedThreadId: 'thread-75', source: 'hydration' },
    )
    const selected = row(75)

    expect(first.pendingFocusThreadId).toBe('thread-75')
    expect(first.focusRequest).toEqual({ kind: 'load-more' })
    expect(currentThreadOutsideCollection(first, selected)).toBe(selected)

    const revealed = appendThreadCollectionPage(first, page(51, 50, null))
    const refreshed = commitThreadCollectionCandidate(first, revealed, {
      selectedThreadId: 'thread-75',
      source: 'refresh',
    })
    const changed = commitThreadCollectionCandidate(first, revealed, {
      selectedThreadId: null,
      source: 'explicit-load',
    })
    const committed = commitThreadCollectionCandidate(first, revealed, {
      selectedThreadId: 'thread-75',
      source: 'explicit-load',
    })
    expect(changed.pendingFocusThreadId).toBeNull()
    expect(changed.focusRequest).toEqual({ kind: 'thread', threadId: 'thread-51' })
    expect(refreshed).toMatchObject({ focusRequest: null, announcements: [] })
    expect(committed.pendingFocusThreadId).toBeNull()
    expect(committed.focusRequest).toEqual({ kind: 'thread', threadId: 'thread-75' })
    expect(currentThreadOutsideCollection(committed, selected)).toBeNull()
  })

  it('preserves accepted rows and pending focus when a later page fails', () => {
    const accepted = commitThreadCollectionCandidate(
      initialThreadCollectionState,
      buildThreadCollectionCandidate([page(1, 50, 'opaque-1')], 1),
      { selectedThreadId: 'thread-75', source: 'hydration' },
    )
    const failed = failThreadCollection(beginThreadCollectionLoadMore(accepted), 'load-more')

    expect(failed.rows).toBe(accepted.rows)
    expect(failed.pendingFocusThreadId).toBe('thread-75')
    expect(failed).toMatchObject({ status: 'error', errorPhase: 'load-more' })
    expect(failed.focusRequest).toEqual({ kind: 'retry' })
  })
})
