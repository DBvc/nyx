import type { NyxChatMessage } from '../../../../shared/chat/types'

interface ChatMessageProps {
  message: NyxChatMessage
  onRetry: (messageId: string) => void
}

export function ChatMessage({ message, onRetry }: ChatMessageProps) {
  const isUser = message.role === 'user'
  const isWaiting = message.status === 'pending' || message.status === 'streaming'

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

      {isWaiting ? (
        <p className='mt-3 flex items-center gap-2 text-xs text-nyx-subtle'>
          <span className='h-1.5 w-1.5 rounded-full bg-nyx-subtle' />
          {message.content ? 'Streaming' : 'Waiting for response'}
        </p>
      ) : null}

      {message.status === 'cancelled' ? (
        <p className='mt-3 text-xs text-nyx-subtle'>Response stopped</p>
      ) : null}

      {message.status === 'failed' && message.error ? (
        <div
          className='mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-950'
          role='alert'
        >
          <p className='text-xs font-semibold uppercase text-red-900/70'>Request failed</p>
          <p className='mt-1 font-medium'>{message.error.message}</p>
          {message.error.details ? (
            <p className='mt-1 text-xs leading-5 text-red-900/70'>{message.error.details}</p>
          ) : null}
          {message.canRetry ? (
            <button
              className='mt-3 h-8 rounded-md border border-red-200 bg-white px-3 text-xs font-medium text-red-950 hover:bg-red-50'
              onClick={() => {
                onRetry(message.id)
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
