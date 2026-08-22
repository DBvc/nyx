import { ChevronDown, Plus, SlidersHorizontal, UserRound } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { RefObject } from 'react'

import type { NyxChatRunStatus } from '../../../../shared/chat/types'
import type {
  NyxThreadLocationAction,
  NyxThreadPinAction,
  NyxThreadSummary,
} from '../../../../shared/threads/types'
import { validateNyxThreadTitle } from '../../../../shared/threads/title'
import {
  threadPinBoundaries,
  type ThreadCollectionLocation,
  type ThreadCollectionState,
  type ThreadPinActionState,
} from '../thread-collection'

type CurrentThreadStatus = 'idle' | 'running' | 'saving_failed'

interface ChatSidebarProps {
  title: string
  preview: string
  activeView: 'chat' | 'connections'
  currentThread: NyxThreadSummary | null
  currentThreadStatus: CurrentThreadStatus
  selectedThreadId: string | null
  collection: ThreadCollectionState
  pinAction: ThreadPinActionState
  libraryUnavailable: boolean
  newThreadDisabled: boolean
  onNewThread: () => void
  onSelectThread: (threadId: string) => void
  onUpdateThreadPin: (
    threadId: string,
    action: NyxThreadPinAction,
    expectedPinPosition: number | null,
  ) => void
  onRenameThread: (
    threadId: string,
    title: string,
    expectedThreadRevision: number,
  ) => Promise<{ ok: true } | { ok: false; message: string }>
  onUpdateThreadLocation: (
    threadId: string,
    action: NyxThreadLocationAction,
    expectedThreadRevision: number,
  ) => void
  onSwitchThreadCollection: (location: ThreadCollectionLocation) => void
  onLoadMoreThreads: () => void
  onRetryThreadCollection: () => Promise<boolean>
  onOpenConnectionsSettings: () => void
  settingsPopoverRef: RefObject<HTMLDivElement | null>
}

export function currentThreadSidebarStatus(
  runStatus: NyxChatRunStatus,
  hasSettlementFailure: boolean,
): CurrentThreadStatus {
  if (hasSettlementFailure) return 'saving_failed'
  return runStatus === 'submitting' || runStatus === 'streaming' ? 'running' : 'idle'
}

export function currentThreadOutsidePage(
  selectedThreadId: string | null,
  currentThread: NyxThreadSummary | null,
  threads: ReadonlyArray<NyxThreadSummary>,
) {
  return selectedThreadId &&
    currentThread?.id === selectedThreadId &&
    !threads.some((thread) => thread.id === selectedThreadId)
    ? currentThread
    : null
}

export function ChatSidebar({
  title,
  preview,
  activeView,
  currentThread,
  currentThreadStatus,
  selectedThreadId,
  collection,
  pinAction,
  libraryUnavailable,
  newThreadDisabled,
  onNewThread,
  onSelectThread,
  onUpdateThreadPin,
  onRenameThread,
  onUpdateThreadLocation,
  onSwitchThreadCollection,
  onLoadMoreThreads,
  onRetryThreadCollection,
  onOpenConnectionsSettings,
  settingsPopoverRef,
}: ChatSidebarProps) {
  const [rename, setRename] = useState<{
    threadId: string
    value: string
    error: string | null
  } | null>(null)
  const canonicalThreads = collection.rows
  const pinnedThreads = useMemo(
    () => canonicalThreads.filter((thread) => thread.pinPosition !== null),
    [canonicalThreads],
  )
  const recentThreads = useMemo(
    () => canonicalThreads.filter((thread) => thread.pinPosition === null),
    [canonicalThreads],
  )

  function renderThread(
    thread: NyxThreadSummary,
    options: {
      statusOverride?: Exclude<CurrentThreadStatus, 'idle'>
    } = {},
  ) {
    const selected = activeView === 'chat' && thread.id === selectedThreadId
    const activity = thread.availability === 'available' ? thread.activity : null
    const subtitle =
      options.statusOverride === 'running'
        ? 'Running…'
        : options.statusOverride === 'saving_failed'
          ? 'Saving failed'
          : activity?.status === 'submitting' || activity?.status === 'streaming'
            ? 'Running…'
            : activity?.status === 'saving_failed'
              ? 'Saving failed'
              : thread.id === selectedThreadId
                ? preview
                : thread.availability === 'unavailable'
                  ? 'Unavailable'
                  : ''
    const savingFailed =
      options.statusOverride === 'saving_failed' || activity?.status === 'saving_failed'
    const locationBlocked =
      activity?.status === 'submitting' ||
      activity?.status === 'streaming' ||
      activity?.status === 'saving_failed'
    const pinError = pinAction.error?.threadId === thread.id ? pinAction.error.message : null
    const boundaries = threadPinBoundaries(collection, thread)
    const renameDraft = rename?.threadId === thread.id ? rename : null

    function beginRename() {
      if (thread.availability !== 'available' || thread.location === 'trash' || pinAction.pending) {
        return
      }
      setRename({ threadId: thread.id, value: thread.title, error: null })
    }

    async function submitRename() {
      if (!renameDraft || thread.availability !== 'available') return
      const validated = validateNyxThreadTitle(renameDraft.value)
      if (!validated.ok) {
        setRename({ ...renameDraft, error: validated.message })
        return
      }
      const result = await onRenameThread(thread.id, validated.title, thread.threadRevision)
      setRename((current) => {
        if (current?.threadId !== thread.id) return current
        return result.ok ? null : { ...current, error: result.message }
      })
    }

    function renderPinAction(label: string, action: NyxThreadPinAction, boundaryDisabled = false) {
      return (
        <button
          className='rounded px-1.5 py-1 text-[11px] text-nyx-muted hover:bg-nyx-canvas hover:text-nyx-ink disabled:text-nyx-subtle'
          disabled={pinAction.pending || boundaryDisabled}
          onClick={() => onUpdateThreadPin(thread.id, action, thread.pinPosition)}
          type='button'
        >
          {label}
        </button>
      )
    }

    return (
      <div className='mb-0.5' key={thread.id}>
        {renameDraft ? (
          <div className={`rounded-lg px-3 py-2 ${selected ? 'bg-nyx-canvas' : ''}`}>
            <input
              aria-describedby={renameDraft.error ? `thread-rename-error-${thread.id}` : undefined}
              aria-label={`Rename ${thread.title}`}
              autoFocus
              className='w-full rounded border border-nyx-line-strong bg-nyx-panel px-2 py-1 text-[13px] text-nyx-ink outline-none focus:border-nyx-accent'
              disabled={pinAction.pending}
              onChange={(event) =>
                setRename({ threadId: thread.id, value: event.currentTarget.value, error: null })
              }
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault()
                  setRename(null)
                } else if (event.key === 'Enter') {
                  event.preventDefault()
                  void submitRename()
                }
              }}
              value={renameDraft.value}
            />
            {renameDraft.error ? (
              <p
                className='mt-1 text-[11px] text-nyx-danger'
                id={`thread-rename-error-${thread.id}`}
              >
                {renameDraft.error}
              </p>
            ) : null}
          </div>
        ) : (
          <button
            aria-current={selected ? 'page' : undefined}
            className={`w-full rounded-lg px-3 py-2.5 text-left ${
              selected ? 'bg-nyx-canvas' : 'hover:bg-nyx-canvas'
            }`}
            onClick={() => onSelectThread(thread.id)}
            onKeyDown={(event) => {
              if (event.key === 'F2') {
                event.preventDefault()
                beginRename()
              }
            }}
            type='button'
          >
            <span className='block min-w-0 truncate text-[13px] font-medium text-nyx-ink'>
              {thread.title}
            </span>
            {subtitle ? (
              <span
                className={`mt-1 block min-w-0 truncate text-[12px] ${
                  savingFailed ? 'text-nyx-danger' : 'text-nyx-muted'
                }`}
              >
                {subtitle}
              </span>
            ) : null}
          </button>
        )}
        {thread.availability === 'available' ? (
          <div className='px-2 pb-1'>
            <div className='flex flex-wrap gap-0.5'>
              {thread.location === 'trash' ? (
                <button
                  className='rounded px-1.5 py-1 text-[11px] text-nyx-muted hover:bg-nyx-canvas hover:text-nyx-ink disabled:text-nyx-subtle'
                  disabled={pinAction.pending}
                  onClick={() =>
                    onUpdateThreadLocation(thread.id, 'restore', thread.threadRevision)
                  }
                  type='button'
                >
                  Restore
                </button>
              ) : (
                <>
                  <button
                    className='rounded px-1.5 py-1 text-[11px] text-nyx-muted hover:bg-nyx-canvas hover:text-nyx-ink disabled:text-nyx-subtle'
                    disabled={pinAction.pending}
                    onClick={beginRename}
                    type='button'
                  >
                    Rename
                  </button>
                  {thread.location === 'archived' ? (
                    <button
                      className='rounded px-1.5 py-1 text-[11px] text-nyx-muted hover:bg-nyx-canvas hover:text-nyx-ink disabled:text-nyx-subtle'
                      disabled={pinAction.pending || locationBlocked}
                      onClick={() =>
                        onUpdateThreadLocation(thread.id, 'unarchive', thread.threadRevision)
                      }
                      type='button'
                    >
                      Unarchive
                    </button>
                  ) : thread.pinPosition === null ? (
                    renderPinAction('Pin', 'pin')
                  ) : (
                    <>
                      {renderPinAction('Unpin', 'unpin')}
                      {renderPinAction('Move up', 'move_up', boundaries.atTop)}
                      {renderPinAction('Move down', 'move_down', boundaries.atBottom)}
                      {renderPinAction('Move to top', 'move_top', boundaries.atTop)}
                      {renderPinAction('Move to bottom', 'move_bottom', boundaries.atBottom)}
                    </>
                  )}
                  {thread.location === 'available' ? (
                    <button
                      className='rounded px-1.5 py-1 text-[11px] text-nyx-muted hover:bg-nyx-canvas hover:text-nyx-ink disabled:text-nyx-subtle'
                      disabled={pinAction.pending || locationBlocked}
                      onClick={() =>
                        onUpdateThreadLocation(thread.id, 'archive', thread.threadRevision)
                      }
                      type='button'
                    >
                      Archive
                    </button>
                  ) : null}
                  <button
                    className='rounded px-1.5 py-1 text-[11px] text-nyx-muted hover:bg-nyx-canvas hover:text-nyx-ink disabled:text-nyx-subtle'
                    disabled={pinAction.pending || locationBlocked}
                    onClick={() =>
                      onUpdateThreadLocation(thread.id, 'trash', thread.threadRevision)
                    }
                    type='button'
                  >
                    Trash
                  </button>
                </>
              )}
            </div>
            {pinError ? (
              <p className='px-1.5 py-1 text-[11px] text-nyx-danger'>{pinError}</p>
            ) : null}
          </div>
        ) : null}
      </div>
    )
  }

  const initialLoading = collection.status === 'loading'
  const initialError = collection.status === 'error' && collection.errorPhase === 'initial'
  const loadMoreError = collection.status === 'error' && collection.errorPhase === 'load-more'
  const tailAction = loadMoreError
    ? { label: 'Retry', action: 'retry' as const, disabled: false }
    : collection.status === 'loading-more'
      ? { label: 'Loading more…', action: 'load-more' as const, disabled: true }
      : collection.status === 'ready' && collection.nextCursor
        ? { label: 'Load more threads', action: 'load-more' as const, disabled: false }
        : null

  return (
    <aside className='flex h-full w-[16.5rem] shrink-0 flex-col border-r border-nyx-line bg-nyx-sidebar px-2 py-2'>
      <div className='sidebar-titlebar mb-1 flex h-9 items-center text-[15px] font-semibold tracking-[-0.01em] text-nyx-ink'>
        <span className='window-drag-region flex h-full flex-1 items-center'>Nyx</span>
      </div>

      <button
        className='mt-1 flex h-8 items-center gap-2 rounded-lg bg-nyx-accent px-3 text-left text-[13px] font-medium text-nyx-canvas hover:opacity-90'
        disabled={newThreadDisabled || collection.location !== 'available'}
        onClick={onNewThread}
        type='button'
      >
        <Plus aria-hidden='true' className='h-3.5 w-3.5' strokeWidth={1.75} />
        New thread
      </button>

      <div
        aria-busy={
          !libraryUnavailable &&
          (initialLoading || collection.status === 'loading-more' || undefined)
        }
        aria-label='Thread Library'
        className='nyx-scrollbar mt-4 min-h-0 flex-1 overflow-y-auto'
        role='region'
      >
        {collection.location !== 'available' && !libraryUnavailable ? (
          <button
            className='mb-3 rounded-lg px-3 py-2 text-left text-[12px] font-medium text-nyx-muted hover:bg-nyx-canvas hover:text-nyx-ink'
            disabled={pinAction.pending}
            onClick={() => onSwitchThreadCollection('available')}
            type='button'
          >
            Back to threads
          </button>
        ) : null}
        {libraryUnavailable ? (
          <div className='px-3 py-2 text-left'>
            <p className='text-[12px] font-medium text-nyx-danger'>Thread Library unavailable</p>
            <p className='mt-1 text-[12px] text-nyx-muted'>Couldn’t open Thread Library.</p>
          </div>
        ) : (
          <>
            {currentThread ? (
              <section className='pb-3' aria-labelledby='current-thread-heading'>
                <h2
                  className='px-2 pb-1 text-[12px] font-medium text-nyx-subtle'
                  id='current-thread-heading'
                >
                  Current thread
                </h2>
                {currentThreadStatus === 'idle'
                  ? renderThread(currentThread)
                  : renderThread(currentThread, { statusOverride: currentThreadStatus })}
              </section>
            ) : null}

            {collection.location === 'available' &&
            selectedThreadId === null &&
            activeView === 'chat' &&
            !initialLoading &&
            !initialError ? (
              <div className='mb-3 w-full rounded-lg bg-nyx-canvas px-3 py-2.5 text-left'>
                <span className='block min-w-0 truncate text-[13px] font-medium text-nyx-ink'>
                  {title}
                </span>
                {preview ? (
                  <span className='mt-1 block min-w-0 truncate text-[12px] text-nyx-muted'>
                    {preview}
                  </span>
                ) : null}
              </div>
            ) : null}

            {collection.location === 'available' && pinnedThreads.length > 0 ? (
              <section className='pb-3' aria-labelledby='pinned-threads-heading'>
                <h2
                  className='px-2 pb-1 text-[12px] font-medium text-nyx-subtle'
                  id='pinned-threads-heading'
                >
                  Pinned
                </h2>
                {pinnedThreads.map((thread) => renderThread(thread))}
              </section>
            ) : null}

            {collection.location === 'available' && recentThreads.length > 0 ? (
              <section className='pb-2' aria-labelledby='recent-threads-heading'>
                <h2
                  className='px-2 pb-1 text-[12px] font-medium text-nyx-subtle'
                  id='recent-threads-heading'
                >
                  Recent
                </h2>
                {recentThreads.map((thread) => renderThread(thread))}
              </section>
            ) : null}

            {collection.location === 'archived' && canonicalThreads.length > 0 ? (
              <section className='pb-2' aria-labelledby='archived-threads-heading'>
                <h2
                  className='px-2 pb-1 text-[12px] font-medium text-nyx-subtle'
                  id='archived-threads-heading'
                >
                  Archived
                </h2>
                {canonicalThreads.map((thread) => renderThread(thread))}
              </section>
            ) : null}

            {collection.location === 'trash' && canonicalThreads.length > 0 ? (
              <section className='pb-2' aria-labelledby='trash-threads-heading'>
                <h2
                  className='px-2 pb-1 text-[12px] font-medium text-nyx-subtle'
                  id='trash-threads-heading'
                >
                  Trash
                </h2>
                {canonicalThreads.map((thread) => renderThread(thread))}
              </section>
            ) : null}

            {initialLoading ? (
              <p className='px-3 py-2 text-[12px] text-nyx-muted'>Loading threads…</p>
            ) : null}

            {initialError ? (
              <div className='px-2 py-2'>
                <p className='text-[12px] text-nyx-danger' id='thread-collection-initial-error'>
                  Couldn’t load threads.
                </p>
                <button
                  aria-describedby='thread-collection-initial-error'
                  className='mt-2 rounded-lg border border-nyx-line-strong px-2.5 py-1.5 text-[12px] font-medium text-nyx-ink hover:bg-nyx-canvas'
                  id='thread-collection-initial-action'
                  onClick={() => void onRetryThreadCollection()}
                  type='button'
                >
                  Retry
                </button>
              </div>
            ) : null}

            {tailAction ? (
              <div className='px-2 py-2'>
                <p
                  className={`text-[12px] text-nyx-danger ${loadMoreError ? '' : 'hidden'}`}
                  id='thread-collection-tail-error'
                >
                  Couldn’t load more.
                </p>
                <button
                  aria-describedby={loadMoreError ? 'thread-collection-tail-error' : undefined}
                  className={`rounded-lg px-2.5 py-1.5 text-[12px] font-medium ${
                    loadMoreError
                      ? 'mt-2 border border-nyx-line-strong text-nyx-ink hover:bg-nyx-canvas'
                      : tailAction.disabled
                        ? 'text-nyx-subtle'
                        : 'text-nyx-muted hover:bg-nyx-canvas hover:text-nyx-ink'
                  }`}
                  disabled={tailAction.disabled}
                  id='thread-collection-tail-action'
                  onClick={() => {
                    if (tailAction.disabled) return
                    if (tailAction.action === 'retry') void onRetryThreadCollection()
                    else onLoadMoreThreads()
                  }}
                  type='button'
                >
                  {tailAction.label}
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>

      {collection.location === 'available' ? (
        <div className='mt-2 flex flex-col'>
          <button
            className='rounded-lg px-2 py-2 text-left text-[12px] font-medium text-nyx-muted hover:bg-nyx-canvas hover:text-nyx-ink'
            disabled={libraryUnavailable || pinAction.pending}
            onClick={() => onSwitchThreadCollection('archived')}
            type='button'
          >
            Archived
          </button>
          <button
            className='rounded-lg px-2 py-2 text-left text-[12px] font-medium text-nyx-muted hover:bg-nyx-canvas hover:text-nyx-ink'
            disabled={libraryUnavailable || pinAction.pending}
            onClick={() => onSwitchThreadCollection('trash')}
            type='button'
          >
            Trash
          </button>
        </div>
      ) : null}

      <div className='relative mt-3 border-t border-nyx-line pt-2'>
        <button
          aria-label='Open user settings'
          className='flex h-11 w-full items-center gap-2.5 rounded-lg px-2 text-left hover:bg-nyx-canvas'
          popoverTarget='sidebar-settings-popover'
          type='button'
        >
          <span className='flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-nyx-solid text-nyx-muted'>
            <UserRound aria-hidden='true' className='h-4 w-4' strokeWidth={1.75} />
          </span>
          <span className='min-w-0 flex-1'>
            <span className='block truncate text-[13px] font-medium text-nyx-ink'>Local user</span>
            <span className='block truncate text-[11px] text-nyx-subtle'>On this device</span>
          </span>
          <span className='text-nyx-subtle'>
            <ChevronDown aria-hidden='true' className='h-3.5 w-3.5' strokeWidth={1.75} />
          </span>
        </button>

        <div
          className='sidebar-settings-popover rounded-xl border border-nyx-line-strong bg-nyx-panel p-1.5 text-nyx-ink shadow-2xl'
          id='sidebar-settings-popover'
          onToggle={(event) => {
            if (event.currentTarget.matches(':popover-open')) {
              event.currentTarget.querySelector('button')?.focus()
            }
          }}
          popover='auto'
          ref={settingsPopoverRef}
        >
          <div className='px-2 py-1.5 text-[11px] font-medium text-nyx-subtle'>Settings</div>
          <button
            className={`flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-[13px] ${
              activeView === 'connections'
                ? 'bg-nyx-solid text-nyx-ink'
                : 'text-nyx-muted hover:bg-nyx-solid hover:text-nyx-ink'
            }`}
            onClick={onOpenConnectionsSettings}
            type='button'
          >
            <SlidersHorizontal aria-hidden='true' className='h-3.5 w-3.5' strokeWidth={1.75} />
            Connections
          </button>
        </div>
      </div>
    </aside>
  )
}
