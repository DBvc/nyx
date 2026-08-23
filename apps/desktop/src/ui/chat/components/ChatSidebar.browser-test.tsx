import { createRef } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'

import type { NyxThreadPinAction, NyxThreadSummary } from '../../../../shared/threads/types'
import '../../../styles/index.css'
import { initialThreadCollectionState, initialThreadPinActionState } from '../thread-collection'
import { ChatSidebar } from './ChatSidebar'

interface ThreadActionsBrowserTestState {
  pinActions: Array<{ action: NyxThreadPinAction; threadId: string }>
  selections: string[]
}

declare global {
  interface Window {
    __nyxThreadActionsBrowserTest: ThreadActionsBrowserTestState
  }
}

function thread(index: number): NyxThreadSummary {
  return {
    availability: 'available',
    id: `recent-${index}`,
    location: 'available',
    pinPosition: null,
    title: `Recent ${index}`,
    threadRevision: 1,
    resultRevision: 0,
    seenResultRevision: 0,
    lastUserActivityAt: '2026-08-23T00:00:00.000Z',
    createdAt: '2026-08-23T00:00:00.000Z',
    updatedAt: '2026-08-23T00:00:00.000Z',
  }
}

const rows = Array.from({ length: 14 }, (_, index) => thread(index + 1))
const state: ThreadActionsBrowserTestState = { pinActions: [], selections: [] }
window.__nyxThreadActionsBrowserTest = state

flushSync(() => {
  createRoot(document.getElementById('root')!).render(
    <ChatSidebar
      activeView='chat'
      collection={{
        ...initialThreadCollectionState,
        loadedPageCount: 1,
        rows,
        status: 'ready',
      }}
      currentThread={null}
      currentThreadStatus='idle'
      libraryUnavailable={false}
      newThreadDisabled={false}
      onLoadMoreThreads={() => undefined}
      onNewThread={() => undefined}
      onOpenConnectionsSettings={() => undefined}
      onRenameThread={async () => ({ ok: true })}
      onRetryThreadCollection={async () => true}
      onSelectThread={(threadId) => state.selections.push(threadId)}
      onSwitchThreadCollection={() => undefined}
      onUpdateThreadLocation={() => undefined}
      onUpdateThreadPin={(threadId, action) => state.pinActions.push({ action, threadId })}
      pinAction={initialThreadPinActionState}
      preview=''
      selectedThreadId={rows[0]!.id}
      settingsPopoverRef={createRef<HTMLDivElement>()}
      title='New thread'
    />,
  )
})

document.documentElement.dataset.threadActionsBrowserTestReady = 'true'
