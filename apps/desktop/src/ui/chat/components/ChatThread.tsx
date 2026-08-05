import { ArrowDown } from 'lucide-react'
import type { RefObject, UIEventHandler } from 'react'
import type { ComponentProps } from 'react'

import type { ThreadStreamItem } from '../thread-items'
import type { ChatHydrationStatus } from '../chat-types'
import type {
  NyxCurrentThreadResetError,
  NyxCurrentThreadSnapshotError,
} from '../../../../shared/chat/snapshot'
import { ChatEmptyState } from './ChatEmptyState'
import { ChatMessage } from './ChatMessage'
import { ConnectionSetupNotice, shouldShowConnectionNotice } from './ConnectionSetupNotice'

interface ChatThreadProps {
  items: ReadonlyArray<ThreadStreamItem>
  containerRef: RefObject<HTMLDivElement | null>
  onScroll: UIEventHandler<HTMLDivElement>
  onRetry: (messageId: string) => void
  onJumpToLatest: () => void
  isFollowing: boolean
  connectionStatus: ComponentProps<typeof ConnectionSetupNotice>['status']
  onOpenConnectionsSettings: () => void
  onRefreshConnectionStatus: () => void
  hydrationStatus: ChatHydrationStatus
  hydrationError: NyxCurrentThreadSnapshotError | null
  resetError: NyxCurrentThreadResetError | null
}

export function ChatThread({
  items,
  containerRef,
  onScroll,
  onRetry,
  onJumpToLatest,
  isFollowing,
  connectionStatus,
  onOpenConnectionsSettings,
  onRefreshConnectionStatus,
  hydrationStatus,
  hydrationError,
  resetError,
}: ChatThreadProps) {
  const hasItems = hydrationStatus === 'ready' && items.length > 0

  return (
    <div className='relative min-h-0 flex-1'>
      <div
        className={`h-full min-h-0 ${hasItems ? 'nyx-scrollbar overflow-y-auto' : 'overflow-hidden'}`}
        onScroll={onScroll}
        ref={containerRef}
      >
        <div
          className={`mx-auto flex min-h-full w-full flex-col px-6 ${
            hasItems ? 'max-w-[48rem] gap-5 py-6' : 'max-w-[40rem] justify-center pb-28'
          }`}
        >
          {hydrationStatus === 'loading' ? (
            <section className='space-y-2' aria-live='polite'>
              <p className='text-[12px] font-medium text-nyx-subtle'>Current thread</p>
              <h2 className='text-[22px] font-semibold text-nyx-ink'>Loading conversation</h2>
            </section>
          ) : hydrationStatus === 'error' ? (
            <section className='space-y-2' role='alert'>
              <p className='text-[12px] font-medium text-nyx-danger'>Current thread unavailable</p>
              <h2 className='text-[22px] font-semibold text-nyx-ink'>
                {resetError ? 'Fresh thread could not start' : 'Conversation could not load'}
              </h2>
              <p className='text-[15px] leading-6 text-nyx-muted'>
                {resetError?.message ?? hydrationError?.message}
              </p>
            </section>
          ) : !hasItems ? (
            <ChatEmptyState
              connectionStatus={connectionStatus}
              onOpenConnectionsSettings={onOpenConnectionsSettings}
              onRefreshConnectionStatus={onRefreshConnectionStatus}
            />
          ) : (
            <>
              {shouldShowConnectionNotice(connectionStatus) ? (
                <ConnectionSetupNotice
                  compact
                  onOpenSettings={onOpenConnectionsSettings}
                  onRefresh={onRefreshConnectionStatus}
                  status={connectionStatus}
                />
              ) : null}
              {items.map((item) => (
                <ChatMessage key={item.id} message={item.message} onRetry={onRetry} />
              ))}
            </>
          )}
        </div>
      </div>

      {!isFollowing && hasItems ? (
        <button
          aria-label='Jump to latest'
          className='absolute bottom-4 left-1/2 z-10 flex h-8 w-8 -translate-x-1/2 items-center justify-center rounded-full border border-nyx-line-strong bg-nyx-panel text-nyx-muted shadow-lg hover:bg-nyx-solid hover:text-nyx-ink'
          onClick={onJumpToLatest}
          title='Jump to latest'
          type='button'
        >
          <ArrowDown aria-hidden='true' className='h-4 w-4' strokeWidth={1.75} />
        </button>
      ) : null}
    </div>
  )
}
