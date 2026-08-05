import { useMemo, useState } from 'react'

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

export function ChatWorkspace() {
  const [activeView, setActiveView] = useState<WorkspaceView>('chat')
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
    <main className='h-screen overflow-hidden bg-nyx-canvas text-nyx-ink'>
      <div className='flex h-full w-full'>
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
            setActiveView('connections')
          }}
          preview={currentThreadPreview}
          title={currentThreadTitle}
        />

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
