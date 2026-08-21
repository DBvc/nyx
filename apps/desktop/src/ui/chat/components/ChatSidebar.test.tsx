import { createRef, type ComponentProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import type { NyxThreadSummary } from '../../../../shared/threads/types'
import { initialThreadCollectionState } from '../thread-collection'
import {
  ChatSidebar,
  initialThreadCollectionFocusId,
  nextThreadNavigationId,
  threadCollectionTabStopId,
} from './ChatSidebar'

function thread(id: string, title: string, pinPosition: number | null): NyxThreadSummary {
  return {
    availability: 'available',
    id,
    location: 'available',
    pinPosition,
    title,
    threadRevision: 1,
    resultRevision: 0,
    seenResultRevision: 0,
    lastUserActivityAt: '2026-08-20T00:00:00.000Z',
    createdAt: '2026-08-20T00:00:00.000Z',
    updatedAt: '2026-08-20T00:00:00.000Z',
  }
}

const pinned = thread('pinned-1', 'Pinned one', 1)
const recent = thread('recent-1', 'Recent one', null)

function renderSidebar(overrides: Partial<ComponentProps<typeof ChatSidebar>> = {}) {
  const props: ComponentProps<typeof ChatSidebar> = {
    title: 'New thread',
    preview: '',
    activeView: 'chat',
    currentThread: null,
    currentThreadStatus: 'idle',
    selectedThreadId: pinned.id,
    collection: {
      ...initialThreadCollectionState,
      rows: [pinned, recent],
      nextCursor: 'opaque-next',
      loadedPageCount: 1,
      status: 'ready',
    },
    collectionFocusEnabled: true,
    libraryUnavailable: false,
    newThreadDisabled: false,
    onNewThread: vi.fn(),
    onSelectThread: vi.fn(),
    onLoadMoreThreads: vi.fn(),
    onRetryThreadCollection: vi.fn(async () => true),
    onOpenConnectionsSettings: vi.fn(),
    settingsPopoverRef: createRef<HTMLDivElement>(),
    ...overrides,
  }

  return renderToStaticMarkup(<ChatSidebar {...props} />)
}

describe('ChatSidebar Thread Library', () => {
  it('renders Current, Pinned, and Recent without merging the current fallback', () => {
    const current = thread('current-1', 'Current outside prefix', null)
    const html = renderSidebar({ currentThread: current })

    expect(html.indexOf('Current thread')).toBeLessThan(html.indexOf('Pinned'))
    expect(html.indexOf('Pinned')).toBeLessThan(html.indexOf('Recent'))
    expect(html).toContain('Current outside prefix')
    expect(html.match(/tabindex="0"/g)).toHaveLength(1)
    expect(html.match(/tabindex="-1"/g)).toHaveLength(1)
    expect(html).toContain('Load more threads')
  })

  it('uses collection rows as the only canonical source and preserves their group order', () => {
    const pinnedTwo = thread('pinned-2', 'Pinned two', 2)
    const recentTwo = thread('recent-2', 'Recent two', null)
    const html = renderSidebar({
      collection: {
        ...initialThreadCollectionState,
        rows: [pinned, pinnedTwo, recent, recentTwo],
        status: 'ready',
      },
    })

    expect(html.indexOf('Pinned one')).toBeLessThan(html.indexOf('Pinned two'))
    expect(html.indexOf('Pinned two')).toBeLessThan(html.indexOf('Recent one'))
    expect(html.indexOf('Recent one')).toBeLessThan(html.indexOf('Recent two'))
  })

  it('hides stale collection content behind the whole-library unavailable boundary', () => {
    const html = renderSidebar({ libraryUnavailable: true })

    expect(html).toContain('Thread Library unavailable')
    expect(html).toContain('Couldn’t open Thread Library.')
    expect(html).not.toContain('Pinned one')
    expect(html).not.toContain('Recent one')
    expect(html).not.toContain('Load more threads')
    expect(html).not.toContain('aria-busy="true"')
  })

  it('moves one roving tab stop through the loaded canonical order', () => {
    const ids = ['pinned-1', 'recent-1', 'recent-2']

    expect(nextThreadNavigationId(ids, 'pinned-1', 'ArrowUp')).toBe('pinned-1')
    expect(nextThreadNavigationId(ids, 'pinned-1', 'ArrowDown')).toBe('recent-1')
    expect(nextThreadNavigationId(ids, 'recent-1', 'Home')).toBe('pinned-1')
    expect(nextThreadNavigationId(ids, 'recent-1', 'End')).toBe('recent-2')
    expect(nextThreadNavigationId(ids, 'recent-2', 'ArrowDown')).toBe('recent-2')
    expect(nextThreadNavigationId([], null, 'Home')).toBeNull()
  })

  it('keeps the focused row as the tab stop when selected state refreshes', () => {
    const ids = ['selected', 'newly-focused']

    expect(threadCollectionTabStopId(ids, 'newly-focused', 'selected')).toBe('newly-focused')
    expect(threadCollectionTabStopId(ids, 'removed', 'selected')).toBe('selected')
    expect(threadCollectionTabStopId(ids, 'removed', 'also-removed')).toBe('selected')
  })

  it('focuses the first canonical row after an initial retry, independent of selection', () => {
    expect(initialThreadCollectionFocusId(['first', 'selected'])).toBe('first')
    expect(initialThreadCollectionFocusId([])).toBeNull()
  })

  it.each([
    ['initial loading', { status: 'loading' as const }, ['Loading threads…', 'aria-busy="true"']],
    [
      'initial error',
      { status: 'error' as const, errorPhase: 'initial' as const },
      [
        'Couldn’t load threads.',
        'aria-describedby="thread-collection-initial-error"',
        'id="thread-collection-initial-action"',
      ],
    ],
    [
      'load-more error',
      { status: 'error' as const, errorPhase: 'load-more' as const },
      [
        'Couldn’t load more.',
        'aria-describedby="thread-collection-tail-error"',
        'id="thread-collection-tail-action"',
      ],
    ],
    [
      'loading more',
      { status: 'loading-more' as const },
      ['Loading more…', 'aria-disabled="true"'],
    ],
    [
      'collection end',
      {
        status: 'ready' as const,
        nextCursor: null,
        endAnnounced: true,
        announcements: ['13 more threads loaded', 'End of threads'],
      },
      ['13 more threads loaded. End of threads', 'End of threads'],
    ],
  ])('renders %s state', (_name, collectionOverrides, expectedText) => {
    const html = renderSidebar({
      collection: {
        ...initialThreadCollectionState,
        rows: [pinned, recent],
        nextCursor: 'opaque-next',
        loadedPageCount: 1,
        ...collectionOverrides,
      },
    })

    for (const text of expectedText) expect(html).toContain(text)
  })

  it('keeps one stable tail control identity across ready, busy, and retry states', () => {
    for (const collection of [
      { status: 'ready' as const, nextCursor: 'opaque-next' },
      { status: 'loading-more' as const, nextCursor: 'opaque-next' },
      {
        status: 'error' as const,
        errorPhase: 'load-more' as const,
        nextCursor: 'opaque-next',
      },
    ]) {
      const html = renderSidebar({
        collection: {
          ...initialThreadCollectionState,
          rows: [pinned, recent],
          loadedPageCount: 1,
          ...collection,
        },
      })

      expect(html.match(/id="thread-collection-tail-action"/g)).toHaveLength(1)
    }
  })

  it('does not render the untouched placeholder with an initial collection error', () => {
    const html = renderSidebar({
      title: 'Untouched draft',
      collection: {
        ...initialThreadCollectionState,
        status: 'error',
        errorPhase: 'initial',
      },
    })

    expect(html).toContain('Couldn’t load threads.')
    expect(html).not.toContain('Untouched draft')
  })
})
