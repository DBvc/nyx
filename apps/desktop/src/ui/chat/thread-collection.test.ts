import { describe, expect, it } from 'vitest'

import type { NyxThreadSummary } from '../../../shared/threads/types'
import {
  appendThreadCollectionPage,
  beginThreadPinAction,
  beginThreadCollectionLoadMore,
  buildThreadCollectionCandidate,
  commitThreadCollectionCandidate,
  currentThreadOutsideCollection,
  failThreadCollection,
  failThreadPinAction,
  initialThreadCollectionState,
  initialThreadPinActionState,
  releaseThreadPinAction,
  threadCollectionGroups,
  threadPinBoundaries,
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

  it('accepts only unpinned Archived rows in the Archived collection', () => {
    const archivedRows = [row(1), row(2)].map((item) => ({
      ...item,
      location: 'archived' as const,
    }))
    const candidate = buildThreadCollectionCandidate(
      [{ rows: archivedRows, nextCursor: null }],
      1,
      'archived',
    )

    expect(candidate).toMatchObject({ location: 'archived', rows: archivedRows })
    expect(() =>
      buildThreadCollectionCandidate(
        [{ rows: [{ ...archivedRows[0]!, pinPosition: 1 }], nextCursor: null }],
        1,
        'archived',
      ),
    ).toThrow('retained a Pin')
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
    ).toThrow('outside its collection')
    expect(() =>
      buildThreadCollectionCandidate([page(1, 50, 'opaque-1'), page(51, 1, null)], 1),
    ).toThrow('page budget')
  })

  it('atomically appends one page and rejects an unchanged next cursor', () => {
    const initial = commitThreadCollectionCandidate(
      buildThreadCollectionCandidate([page(1, 50, 'opaque-1')], 1),
    )
    const loading = beginThreadCollectionLoadMore(initial)
    const candidate = appendThreadCollectionPage(loading, page(51, 37, null))
    const committed = commitThreadCollectionCandidate(candidate)

    expect(loading.rows).toHaveLength(50)
    expect(committed.rows).toHaveLength(87)
    expect(committed).toMatchObject({ status: 'ready', nextCursor: null })
    expect(() => appendThreadCollectionPage(initial, page(51, 50, 'opaque-1'))).toThrow(
      'cursor repeated',
    )
  })

  it('appends beyond the second page without treating the accepted prefix as one page', () => {
    const first = commitThreadCollectionCandidate(
      buildThreadCollectionCandidate([page(1, 50, 'opaque-1')], 1),
    )
    const second = commitThreadCollectionCandidate(
      appendThreadCollectionPage(first, page(51, 50, 'opaque-2')),
    )
    expect(() => appendThreadCollectionPage(second, page(101, 50, 'opaque-1'))).toThrow(
      'cursor repeated',
    )
    const third = appendThreadCollectionPage(second, page(101, 37, null))

    expect(third).toMatchObject({ loadedPageCount: 3, nextCursor: null })
    expect(third.rows).toHaveLength(137)
  })
})

describe('thread collection selection and failure state', () => {
  it('keeps an off-prefix selection separate until a later page reveals it', () => {
    const first = commitThreadCollectionCandidate(
      buildThreadCollectionCandidate([page(1, 50, 'opaque-1')], 1),
    )
    const selected = row(75)

    expect(currentThreadOutsideCollection(first, selected)).toBe(selected)

    const revealed = appendThreadCollectionPage(first, page(51, 50, null))
    const committed = commitThreadCollectionCandidate(revealed)
    expect(currentThreadOutsideCollection(committed, selected)).toBeNull()
  })

  it('preserves accepted rows when a later page fails', () => {
    const accepted = commitThreadCollectionCandidate(
      buildThreadCollectionCandidate([page(1, 50, 'opaque-1')], 1),
    )
    const failed = failThreadCollection(beginThreadCollectionLoadMore(accepted), 'load-more')

    expect(failed.rows).toBe(accepted.rows)
    expect(failed).toMatchObject({ status: 'error', errorPhase: 'load-more' })
  })
})

describe('thread Pin action projection', () => {
  it('tracks one transient gate and one safe row error without changing collection rows', () => {
    const pending = beginThreadPinAction(initialThreadPinActionState)
    const failed = failThreadPinAction(
      pending,
      { threadId: 'thread-1', message: 'Thread changed. Try again.' },
      true,
    )
    const released = releaseThreadPinAction(failed)

    expect(pending).toEqual({ pending: true, error: null })
    expect(failed).toEqual({
      pending: true,
      error: { threadId: 'thread-1', message: 'Thread changed. Try again.' },
    })
    expect(released).toEqual({
      pending: false,
      error: { threadId: 'thread-1', message: 'Thread changed. Try again.' },
    })
  })

  it('disables only boundaries known from the loaded canonical prefix', () => {
    const first = row(1, 1)
    const second = row(2, 2)
    const recent = row(3)
    const complete = {
      ...initialThreadCollectionState,
      rows: [first, second, recent],
      loadedPageCount: 1,
      status: 'ready' as const,
    }

    expect(threadPinBoundaries(complete, first)).toEqual({ atTop: true, atBottom: false })
    expect(threadPinBoundaries(complete, second)).toEqual({ atTop: false, atBottom: true })
    expect(threadPinBoundaries(complete, recent)).toEqual({ atTop: false, atBottom: false })

    expect(
      threadPinBoundaries(
        { ...complete, rows: [first, second], nextCursor: 'opaque-next' },
        second,
      ),
    ).toEqual({ atTop: false, atBottom: false })
  })
})
