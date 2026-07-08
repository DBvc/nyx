import { useState } from 'react'

import { ConnectionsSettingsPage } from '../../settings/ConnectionsSettingsPage'
import { threadPreview, threadTitle } from '../chat-presenters'
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
    canSend,
    setInput,
    sendCurrentInput,
    retryMessage,
    stopActiveResponse,
    startNewChat,
  } = useChatSession()
  const connectionSetup = useConnectionStatus()

  const latestMessage = state.messages.at(-1)
  const currentThreadTitle = threadTitle(state.messages)
  const currentThreadPreview = threadPreview(state.messages)
  const { containerRef, handleScroll } = useAutoScroll(
    state.messages.length,
    latestMessage?.content ?? state.runStatus,
  )

  return (
    <main className='h-screen overflow-hidden bg-nyx-canvas text-nyx-ink'>
      <div className='flex h-full w-full flex-col lg:flex-row'>
        <ChatSidebar
          activeView={activeView}
          onNewChat={() => {
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
          runStatus={state.runStatus}
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
                containerRef={containerRef}
                messages={state.messages}
                onOpenConnectionsSettings={() => {
                  setActiveView('connections')
                }}
                onRefreshConnectionStatus={connectionSetup.refresh}
                onRetry={(messageId) => {
                  void retryMessage(messageId)
                }}
                onScroll={handleScroll}
              />
              <ChatComposer
                canSend={canSend}
                input={state.input}
                isBusy={isBusy}
                onInputChange={setInput}
                onSend={sendCurrentInput}
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
