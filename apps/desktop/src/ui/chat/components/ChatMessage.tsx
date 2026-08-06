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
  const attribution = message.targetAttribution

  if (isUser) {
    return (
      <article className='flex justify-end'>
        <div className='max-w-[min(78%,32rem)] whitespace-pre-wrap break-words rounded-[14px_14px_4px_14px] bg-nyx-solid px-3.5 py-2.5 text-[14.5px] leading-[1.55] text-nyx-ink'>
          {message.content}
        </div>
      </article>
    )
  }

  return (
    <article className='max-w-[48rem] text-[15px] leading-6 text-nyx-ink'>
      {attribution ? (
        <p className='mb-1 text-[11px] font-medium leading-4 text-nyx-subtle'>
          {attribution.kind === 'connection'
            ? `${attribution.providerDisplayName} · ${attribution.modelDisplayName}`
            : `.env · ${attribution.modelId}`}
        </p>
      ) : null}

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
          className='mt-3 rounded-xl border border-nyx-danger/35 bg-nyx-danger-soft/60 px-3 py-2.5 text-[13px] text-nyx-danger'
          role='alert'
        >
          <p className='text-xs font-semibold uppercase text-nyx-danger/80'>Request failed</p>
          <p className='mt-1 font-medium'>{message.error.message}</p>
          {message.error.details ? (
            <p className='mt-1 text-xs leading-5 text-nyx-danger/80'>{message.error.details}</p>
          ) : null}
          {message.canRetry ? (
            <button
              className='mt-3 h-7 rounded-lg border border-nyx-danger/40 px-2.5 text-xs font-medium text-nyx-danger hover:bg-nyx-danger/10'
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
