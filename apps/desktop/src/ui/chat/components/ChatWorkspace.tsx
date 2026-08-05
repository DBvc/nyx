import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { ConnectionsSettingsPage } from '../../settings/ConnectionsSettingsPage'
import { threadPreview, threadTitle } from '../chat-presenters'
import { toThreadStreamItems } from '../thread-items'
import { useAutoScroll } from '../use-auto-scroll'
import { useChatSession } from '../use-chat-session'
import { useConnectionStatus } from '../use-connection-status'
import { ChatComposer } from './ChatComposer'
import { ChatHeader } from './ChatHeader'
import { ChatSidebar } from './ChatSidebar'
import { ChatThread } from './ChatThread'

type WorkspaceView = 'chat' | 'connections'

const SIDEBAR_COLLAPSED_STORAGE_KEY = 'nyx.sidebar.collapsed.v1'

interface SidebarShortcutInput {
  key: string
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  repeat: boolean
}

export function readSidebarCollapsed(storage?: Pick<Storage, 'getItem'>) {
  try {
    return storage?.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

export function isSidebarShortcut(event: SidebarShortcutInput, platform: string) {
  if (event.key.toLowerCase() !== 'b' || event.altKey || event.shiftKey || event.repeat) {
    return false
  }

  return platform === 'darwin' ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey
}

function initialSidebarCollapsed() {
  if (typeof window === 'undefined') {
    return false
  }

  try {
    return readSidebarCollapsed(window.localStorage)
  } catch {
    return false
  }
}

function SidebarToggleIcon() {
  return (
    <svg
      aria-hidden='true'
      className='h-4 w-4'
      fill='none'
      viewBox='0 0 16 16'
      xmlns='http://www.w3.org/2000/svg'
    >
      <rect height='12' rx='2.5' stroke='currentColor' width='12' x='2' y='2' />
      <path d='M6 2.5V13.5' stroke='currentColor' />
    </svg>
  )
}

export function ChatWorkspace() {
  const [activeView, setActiveView] = useState<WorkspaceView>('chat')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(initialSidebarCollapsed)
  const settingsPopoverRef = useRef<HTMLDivElement>(null)
  const sidebarContentRef = useRef<HTMLDivElement>(null)
  const sidebarToggleRef = useRef<HTMLButtonElement>(null)
  const {
    state,
    isBusy,
    isResetting,
    canSend,
    setInput,
    sendCurrentInput,
    retryMessage,
    stopActiveResponse,
    startNewChat,
  } = useChatSession()
  const connectionSetup = useConnectionStatus()

  const threadItems = useMemo(() => toThreadStreamItems(state.messages), [state.messages])
  const latestMessageItem = threadItems.at(-1)
  const currentThreadTitle = threadTitle(state.messages)
  const currentThreadPreview = threadPreview(state.messages)
  const { containerRef, followLatest, handleScroll, isFollowing } = useAutoScroll(
    threadItems.length,
    latestMessageItem?.message.content ?? state.runStatus,
    state.projectionGeneration,
    activeView === 'chat',
  )

  const updateSidebarCollapsed = useCallback((collapsed: boolean) => {
    if (collapsed) {
      settingsPopoverRef.current?.hidePopover()

      const activeElement = document.activeElement

      if (activeElement && sidebarContentRef.current?.contains(activeElement)) {
        sidebarToggleRef.current?.focus()
      }
    }

    setSidebarCollapsed(collapsed)

    try {
      window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(collapsed))
    } catch {
      // A blocked UI preference should not block the workspace.
    }
  }, [])

  const toggleSidebar = useCallback(() => {
    updateSidebarCollapsed(!sidebarCollapsed)
  }, [sidebarCollapsed, updateSidebarCollapsed])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!isSidebarShortcut(event, window.nyx?.platform ?? 'unknown')) {
        return
      }

      event.preventDefault()
      toggleSidebar()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [toggleSidebar])

  function handleSend() {
    if (!canSend) {
      return
    }

    followLatest()
    return sendCurrentInput()
  }

  function handleRetry(messageId: string) {
    if (
      state.hydrationStatus !== 'ready' ||
      isBusy ||
      isResetting ||
      state.retryableTurn?.assistantMessageId !== messageId
    ) {
      return
    }

    followLatest()
    void retryMessage(messageId)
  }

  return (
    <main
      className={`relative h-screen overflow-hidden bg-nyx-canvas text-nyx-ink ${
        sidebarCollapsed ? 'sidebar-is-collapsed' : ''
      }`}
    >
      <button
        aria-label={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
        className='sidebar-toggle z-20 flex h-7 w-7 items-center justify-center rounded-lg text-nyx-muted hover:bg-nyx-solid hover:text-nyx-ink'
        onClick={toggleSidebar}
        ref={sidebarToggleRef}
        title={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
        type='button'
      >
        <SidebarToggleIcon />
      </button>

      <div className='flex h-full w-full'>
        <div
          aria-hidden={sidebarCollapsed || undefined}
          className={`sidebar-shell shrink-0 overflow-hidden ${
            sidebarCollapsed ? 'w-0' : 'w-[16.5rem]'
          }`}
          inert={sidebarCollapsed || undefined}
          ref={sidebarContentRef}
        >
          <ChatSidebar
            activeView={activeView}
            newThreadDisabled={state.hydrationStatus === 'loading' || isResetting}
            onNewThread={() => {
              void startNewChat()
              setActiveView('chat')
            }}
            onOpenChat={() => {
              setActiveView('chat')
            }}
            onOpenConnectionsSettings={() => {
              settingsPopoverRef.current?.hidePopover()
              setActiveView('connections')
            }}
            preview={currentThreadPreview}
            settingsPopoverRef={settingsPopoverRef}
            title={currentThreadTitle}
          />
        </div>

        <section className='flex min-h-0 min-w-0 flex-1 flex-col bg-nyx-canvas'>
          {activeView === 'chat' ? (
            <>
              <ChatHeader
                connectionStatus={connectionSetup.status}
                runStatus={state.runStatus}
                title={currentThreadTitle}
              />
              <ChatThread
                connectionStatus={connectionSetup.status}
                hydrationError={state.hydrationError}
                hydrationStatus={state.hydrationStatus}
                isFollowing={isFollowing}
                resetError={state.resetError}
                containerRef={containerRef}
                items={threadItems}
                onJumpToLatest={followLatest}
                onOpenConnectionsSettings={() => {
                  setActiveView('connections')
                }}
                onRefreshConnectionStatus={connectionSetup.refresh}
                onRetry={handleRetry}
                onScroll={handleScroll}
              />
              <ChatComposer
                canSend={canSend}
                disabled={state.hydrationStatus !== 'ready' || isResetting}
                input={state.input}
                isBusy={isBusy}
                onInputChange={setInput}
                onSend={handleSend}
                onStop={stopActiveResponse}
              />
            </>
          ) : (
            <ConnectionsSettingsPage
              onBackToChat={() => {
                setActiveView('chat')
              }}
              onConnectionsChanged={connectionSetup.refresh}
            />
          )}
        </section>
      </div>
    </main>
  )
}
