import type { FormEvent, KeyboardEvent } from 'react'

import type { NyxChatMessage, NyxChatRunStatus } from '../../shared/chat/types'
import { useAutoScroll } from './chat/use-auto-scroll'
import { useChatSession } from './chat/use-chat-session'

function statusLabel(runStatus: NyxChatRunStatus) {
  switch (runStatus) {
    case 'submitting':
      return 'Connecting'
    case 'streaming':
      return 'Streaming'
    case 'completed':
      return 'Ready'
    case 'cancelled':
      return 'Stopped'
    case 'failed':
      return 'Retry'
    case 'idle':
      return ''
  }
}

function shouldShowStatus(runStatus: NyxChatRunStatus) {
  return runStatus !== 'idle' && runStatus !== 'completed'
}

function summarizeText(content: string, maxLength: number) {
  const normalized = content.trim().replace(/\s+/g, ' ')

  if (normalized.length === 0) {
    return ''
  }

  if (normalized.length <= maxLength) {
    return normalized
  }

  return `${normalized.slice(0, maxLength - 3).trimEnd()}...`
}

function threadTitle(messages: ReadonlyArray<NyxChatMessage>) {
  const firstUserMessage = messages.find(
    (message) => message.role === 'user' && message.content.trim().length > 0,
  )

  return firstUserMessage ? summarizeText(firstUserMessage.content, 48) : 'New chat'
}

function threadPreview(messages: ReadonlyArray<NyxChatMessage>) {
  const lastMessage = [...messages].reverse().find((message) => message.content.trim().length > 0)

  if (!lastMessage) {
    return 'Ready to start'
  }

  return summarizeText(lastMessage.content, 46)
}

function HeaderStatus({ runStatus }: { runStatus: NyxChatRunStatus }) {
  if (!shouldShowStatus(runStatus)) {
    return null
  }

  return (
    <div className='flex items-center gap-1.5 rounded-full bg-nyx-panel px-2.5 py-1 text-xs text-nyx-muted'>
      <span className='h-1.5 w-1.5 rounded-full bg-nyx-muted' />
      {statusLabel(runStatus)}
    </div>
  )
}

function NewChatIcon() {
  return (
    <svg
      aria-hidden='true'
      className='h-3.5 w-3.5'
      fill='none'
      viewBox='0 0 16 16'
      xmlns='http://www.w3.org/2000/svg'
    >
      <path d='M8 3.5V12.5M3.5 8H12.5' stroke='currentColor' strokeLinecap='round' />
    </svg>
  )
}

function SendIcon() {
  return (
    <svg
      aria-hidden='true'
      className='h-4 w-4'
      fill='none'
      viewBox='0 0 16 16'
      xmlns='http://www.w3.org/2000/svg'
    >
      <path
        d='M8 12.5V3.5M8 3.5L4.75 6.75M8 3.5L11.25 6.75'
        stroke='currentColor'
        strokeLinecap='round'
        strokeLinejoin='round'
        strokeWidth='1.7'
      />
    </svg>
  )
}

function MessageBubble({
  message,
  onRetry,
}: {
  message: NyxChatMessage
  onRetry: (messageId: string) => void
}) {
  const isUser = message.role === 'user'

  if (isUser) {
    return (
      <article className='flex justify-end'>
        <div className='max-w-[32rem] rounded-xl bg-nyx-panel px-4 py-3 text-[14px] leading-6 text-nyx-ink'>
          {message.content}
        </div>
      </article>
    )
  }

  return (
    <article className='max-w-[43rem] text-[14px] leading-6 text-nyx-ink'>
      <div className='whitespace-pre-wrap'>{message.content || 'Thinking...'}</div>

      {message.status === 'cancelled' ? (
        <p className='mt-3 text-xs text-nyx-subtle'>Stopped</p>
      ) : null}

      {message.status === 'failed' && message.error ? (
        <div className='mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-950'>
          <p className='font-medium'>{message.error.message}</p>
          {message.error.details ? (
            <p className='mt-1 text-xs leading-5 text-red-900/70'>{message.error.details}</p>
          ) : null}
          {message.canRetry ? (
            <button
              className='mt-3 h-8 rounded-md border border-red-200 bg-white px-3 text-xs font-medium text-red-950 hover:bg-red-50'
              onClick={() => {
                void onRetry(message.id)
              }}
              type='button'
            >
              Retry
            </button>
          ) : null}
        </div>
      ) : null}
    </article>
  )
}

export function App() {
  const desktopApi = window.nyx

  if (!desktopApi) {
    return (
      <main className='flex min-h-screen items-center justify-center bg-nyx-canvas px-6 py-12 text-nyx-ink'>
        <section className='w-full max-w-xl rounded-2xl border border-red-200 bg-white px-6 py-6 shadow-sm'>
          <p className='text-xs font-medium text-red-700'>Startup error</p>
          <h1 className='mt-2 text-xl font-semibold'>Nyx desktop bridge is unavailable</h1>
          <p className='mt-3 text-sm leading-6 text-nyx-muted'>
            The renderer started, but the preload bridge did not expose
            <code className='mx-1 rounded bg-nyx-panel px-1.5 py-0.5 text-xs text-nyx-ink'>
              window.nyx
            </code>
            as expected.
          </p>
        </section>
      </main>
    )
  }

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

  const latestMessage = state.messages.at(-1)
  const hasMessages = state.messages.length > 0
  const currentThreadTitle = threadTitle(state.messages)
  const currentThreadPreview = threadPreview(state.messages)
  const { containerRef, handleScroll } = useAutoScroll(
    state.messages.length,
    latestMessage?.content ?? state.runStatus,
  )

  function handleComposerSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void sendCurrentInput()
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey) {
      return
    }

    event.preventDefault()
    void sendCurrentInput()
  }

  return (
    <main className='h-screen overflow-hidden bg-nyx-canvas text-nyx-ink'>
      <div className='flex h-full w-full flex-col lg:flex-row'>
        <aside className='flex w-full shrink-0 flex-col border-b border-nyx-line-soft bg-nyx-sidebar px-2 py-2 lg:w-[18rem] lg:border-b-0 lg:border-r'>
          <button
            className='flex h-8 items-center gap-2 rounded-md px-2 text-left text-[13px] text-nyx-ink hover:bg-nyx-hover'
            onClick={() => {
              void startNewChat()
            }}
            type='button'
          >
            <NewChatIcon />
            New chat
          </button>

          <div className='mt-3 flex-1 overflow-hidden'>
            <div className='px-2 pb-1 text-[11px] font-medium text-nyx-subtle'>Threads</div>
            <button
              className='grid w-full grid-cols-[1fr_auto] gap-x-2 rounded-md bg-nyx-panel-strong px-3 py-2 text-left'
              type='button'
            >
              <span className='min-w-0 truncate text-[13px] font-medium text-nyx-ink'>
                {currentThreadTitle}
              </span>
              {shouldShowStatus(state.runStatus) ? (
                <span className='text-[11px] text-nyx-subtle'>{statusLabel(state.runStatus)}</span>
              ) : null}
              <span className='col-span-2 mt-1 min-w-0 truncate text-[12px] text-nyx-muted'>
                {currentThreadPreview}
              </span>
            </button>
          </div>
        </aside>

        <section className='flex min-h-0 min-w-0 flex-1 flex-col bg-nyx-canvas'>
          <header className='flex h-12 shrink-0 items-center justify-between border-b border-nyx-line-soft px-4'>
            <h1 className='min-w-0 truncate text-[13px] font-semibold text-nyx-ink'>
              {currentThreadTitle}
            </h1>
            <HeaderStatus runStatus={state.runStatus} />
          </header>

          <div
            className={`min-h-0 flex-1 ${hasMessages ? 'overflow-y-auto' : 'overflow-hidden'}`}
            onScroll={handleScroll}
            ref={containerRef}
          >
            <div
              className={`mx-auto flex min-h-full w-full flex-col px-5 ${
                hasMessages ? 'max-w-[44rem] gap-7 py-7' : 'max-w-[37.5rem] justify-center pb-28'
              }`}
            >
              {!hasMessages ? (
                <section>
                  <h2 className='text-[22px] font-semibold tracking-[-0.01em] text-nyx-ink'>
                    What can I help with?
                  </h2>
                </section>
              ) : (
                state.messages.map((message) => (
                  <MessageBubble
                    key={message.id}
                    message={message}
                    onRetry={(messageId) => {
                      void retryMessage(messageId)
                    }}
                  />
                ))
              )}
            </div>
          </div>

          <footer className='shrink-0 bg-nyx-canvas px-4 pb-6 pt-2'>
            <form className='mx-auto w-full max-w-[44rem]' onSubmit={handleComposerSubmit}>
              <div className='rounded-[1.35rem] border border-nyx-line bg-nyx-composer px-4 py-3 shadow-[0_8px_28px_rgba(0,0,0,0.08)] focus-within:border-[#c7c7c2]'>
                <textarea
                  aria-label='Message Nyx'
                  className='min-h-[3.3rem] w-full resize-none border-none bg-transparent px-0 py-0 text-[14px] leading-6 text-nyx-ink outline-none'
                  onChange={(event) => {
                    setInput(event.target.value)
                  }}
                  onKeyDown={handleComposerKeyDown}
                  placeholder='Ask for follow-up changes'
                  spellCheck={false}
                  value={state.input}
                />

                <div className='mt-2 flex h-8 items-center justify-end gap-2'>
                  {isBusy ? (
                    <button
                      className='h-8 rounded-full border border-nyx-line bg-white px-3 text-[13px] text-nyx-ink hover:bg-nyx-hover'
                      onClick={() => {
                        void stopActiveResponse()
                      }}
                      type='button'
                    >
                      Stop
                    </button>
                  ) : null}

                  <button
                    aria-label='Send message'
                    className={`flex h-8 w-8 items-center justify-center rounded-full ${
                      canSend
                        ? 'bg-nyx-accent text-white hover:opacity-90'
                        : 'bg-nyx-panel text-nyx-subtle'
                    }`}
                    disabled={!canSend}
                    type='submit'
                  >
                    <SendIcon />
                  </button>
                </div>
              </div>
            </form>
          </footer>
        </section>
      </div>
    </main>
  )
}
