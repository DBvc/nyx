import type { NyxChatMessage } from '../../../../shared/chat/types'

interface ChatMessageProps {
  message: NyxChatMessage
  onRetry: (messageId: string) => void
}

export function ChatMessage({ message, onRetry }: ChatMessageProps) {
  const isUser = message.role === 'user'
  const isWaiting = message.status === 'pending' || message.status === 'streaming'
  const displayContent = message.content || (isWaiting ? 'Thinking…' : null)
  const isEmptyCompleted = message.status === 'completed' && !message.content

  if (isUser) {
    return (
      <article className='flex justify-end'>
        <div className='max-w-[32rem] whitespace-pre-wrap break-words rounded-xl bg-nyx-solid px-4 py-3 text-[15px] leading-6 text-nyx-ink'>
          {message.content}
        </div>
      </article>
    )
  }

  return (
    <article className='max-w-[46rem] text-[15px] leading-6 text-nyx-ink'>
      {displayContent ? (
        <div className='whitespace-pre-wrap break-words'>{displayContent}</div>
      ) : null}

      {isEmptyCompleted ? (
        <p className='text-xs text-nyx-subtle' role='status'>
          No response was returned.
        </p>
      ) : null}

      {message.status === 'cancelled' ? (
        <p className='mt-3 text-xs text-nyx-muted'>Response stopped</p>
      ) : null}

      {message.status === 'failed' && message.error ? (
        <div
          className='mt-4 rounded-xl border border-nyx-danger/35 bg-nyx-danger-soft px-4 py-3 text-sm text-nyx-danger'
          role='alert'
        >
          <p className='text-xs font-semibold uppercase text-nyx-danger/80'>Request failed</p>
          <p className='mt-1 font-medium'>{message.error.message}</p>
          {message.error.details ? (
            <p className='mt-1 text-xs leading-5 text-nyx-danger/80'>{message.error.details}</p>
          ) : null}
          {message.canRetry ? (
            <button
              className='mt-3 h-8 rounded-lg border border-nyx-danger/40 px-3 text-xs font-medium text-nyx-danger hover:bg-nyx-danger/10'
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
