import { createRef, type ComponentProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import type { NyxThreadSummary } from '../../../../shared/threads/types'
import { initialThreadCollectionState, initialThreadPinActionState } from '../thread-collection'
import { ChatSidebar } from './ChatSidebar'

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
    pinAction: initialThreadPinActionState,
    libraryUnavailable: false,
    newThreadDisabled: false,
    onNewThread: vi.fn(),
    onSelectThread: vi.fn(),
    onUpdateThreadPin: vi.fn(),
    onRenameThread: vi.fn(async () => ({ ok: true as const })),
    onUpdateThreadLocation: vi.fn(),
    onSwitchThreadCollection: vi.fn(),
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
    expect(html).not.toContain('tabindex="-1"')
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

  it('renders Rename plus the six ordinary Pin actions and disables known boundaries', () => {
    const pinnedTwo = thread('pinned-2', 'Pinned two', 2)
    const html = renderSidebar({
      collection: {
        ...initialThreadCollectionState,
        rows: [pinned, pinnedTwo, recent],
        nextCursor: null,
        loadedPageCount: 1,
        status: 'ready',
      },
    })

    expect(html).toContain('>Rename</button>')
    expect(html).toContain('>Pin</button>')
    expect(html).toContain('>Unpin</button>')
    expect(html).toContain('>Move up</button>')
    expect(html).toContain('>Move down</button>')
    expect(html).toContain('>Move to top</button>')
    expect(html).toContain('>Move to bottom</button>')
    expect(html).toMatch(/disabled=""[^>]*>Move up<\/button>/u)
    expect(html).toMatch(/disabled=""[^>]*>Move to top<\/button>/u)
    expect(html).toMatch(/disabled=""[^>]*>Move down<\/button>/u)
    expect(html).toMatch(/disabled=""[^>]*>Move to bottom<\/button>/u)
  })

  it('disables every Pin action behind the collection-wide gate and shows a safe row error', () => {
    const html = renderSidebar({
      pinAction: {
        pending: true,
        error: { threadId: recent.id, message: 'Thread changed. Try again.' },
      },
    })

    expect(html).toContain('Thread changed. Try again.')
    expect(html).toMatch(/disabled=""[^>]*>Pin<\/button>/u)
    expect(html).toMatch(/disabled=""[^>]*>Unpin<\/button>/u)
    expect(html).toMatch(/disabled=""[^>]*>Rename<\/button>/u)
    expect(html).toMatch(/disabled=""[^>]*>Archive<\/button>/u)
  })

  it('renders the simple Archived mode with Rename, Unarchive and Trash', () => {
    const archived = { ...recent, location: 'archived' as const }
    const html = renderSidebar({
      selectedThreadId: archived.id,
      currentThread: null,
      collection: {
        ...initialThreadCollectionState,
        location: 'archived',
        rows: [archived],
        loadedPageCount: 1,
        status: 'ready',
      },
    })

    expect(html).toContain('Back to threads')
    expect(html).toContain('>Rename</button>')
    expect(html).toContain('>Unarchive</button>')
    expect(html).toContain('>Trash</button>')
    expect(html).not.toContain('>Pin</button>')
    expect(html).not.toContain('>Archive</button>')
    expect(html.indexOf('disabled=""')).toBeLessThan(html.indexOf('New thread'))
  })

  it('renders Trash as read-only Restore-only rows without Rename or Pin', () => {
    const trashed = { ...recent, location: 'trash' as const }
    const html = renderSidebar({
      selectedThreadId: trashed.id,
      collection: {
        ...initialThreadCollectionState,
        location: 'trash',
        rows: [trashed],
        loadedPageCount: 1,
        status: 'ready',
      },
    })

    expect(html).toContain('Back to threads')
    expect(html).toContain('>Restore</button>')
    expect(html).not.toContain('>Rename</button>')
    expect(html).not.toContain('>Pin</button>')
    expect(html).not.toContain('>Archive</button>')
    expect(html).not.toContain('>Trash</button>')
  })

  it('keeps controls on an available Current thread fallback and hides them for unavailable rows', () => {
    const current = thread('current-1', 'Current outside prefix', null)
    const unavailable: NyxThreadSummary = {
      availability: 'unavailable',
      id: 'unavailable-1',
      location: 'available',
      pinPosition: null,
      title: "Couldn't open this thread",
      unavailable: { code: 'thread_unavailable', message: "Couldn't open this thread" },
    }
    const html = renderSidebar({
      currentThread: current,
      collection: {
        ...initialThreadCollectionState,
        rows: [unavailable],
        loadedPageCount: 1,
        status: 'ready',
      },
    })

    expect(html).toContain('Current outside prefix')
    expect(html.match(/>Pin<\/button>/gu)).toHaveLength(1)
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
    ['loading more', { status: 'loading-more' as const }, ['Loading more…', 'disabled=""']],
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

  it('removes Load more when the final page is loaded', () => {
    const html = renderSidebar({
      collection: {
        ...initialThreadCollectionState,
        rows: [pinned, recent],
        nextCursor: null,
        loadedPageCount: 2,
        status: 'ready',
      },
    })

    expect(html).not.toContain('Load more threads')
    expect(html).not.toContain('Loading more…')
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
