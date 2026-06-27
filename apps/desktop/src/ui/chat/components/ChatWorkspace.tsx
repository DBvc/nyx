import { threadPreview, threadTitle } from '../chat-presenters'
import { useAutoScroll } from '../use-auto-scroll'
import { useChatSession } from '../use-chat-session'
import { useProviderStatus } from '../use-provider-status'
import { ChatComposer } from './ChatComposer'
import { ChatHeader } from './ChatHeader'
import { ChatSidebar } from './ChatSidebar'
import { ChatThread } from './ChatThread'

export function ChatWorkspace() {
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
  const providerSetup = useProviderStatus()

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
          onNewChat={() => {
            void startNewChat()
          }}
          preview={currentThreadPreview}
          runStatus={state.runStatus}
          title={currentThreadTitle}
        />

        <section className='flex min-h-0 min-w-0 flex-1 flex-col bg-nyx-canvas'>
          <ChatHeader runStatus={state.runStatus} title={currentThreadTitle} />
          <ChatThread
            containerRef={containerRef}
            messages={state.messages}
            onRefreshProviderStatus={providerSetup.refresh}
            onRetry={(messageId) => {
              void retryMessage(messageId)
            }}
            onScroll={handleScroll}
            providerStatus={providerSetup.status}
          />
          <ChatComposer
            canSend={canSend}
            input={state.input}
            isBusy={isBusy}
            onInputChange={setInput}
            onSend={sendCurrentInput}
            onStop={stopActiveResponse}
          />
        </section>
      </div>
    </main>
  )
}
