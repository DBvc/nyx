import { FileText, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { buildNyxChatImageUrl } from '../../../../shared/chat/image-url'
import type { NyxChatMessage } from '../../../../shared/chat/types'

interface ChatMessageProps {
  message: NyxChatMessage
  onRetry: (messageId: string) => void
}

export function ChatMessage({ message, onRetry }: ChatMessageProps) {
  const [openImageIndex, setOpenImageIndex] = useState<number | null>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const imageTriggerRef = useRef<HTMLButtonElement | null>(null)
  const isUser = message.role === 'user'
  const isWaiting = message.status === 'pending' || message.status === 'streaming'
  const displayContent = message.content || (isWaiting ? 'Thinking…' : null)
  const isEmptyCompleted = message.status === 'completed' && !message.content
  const attribution = message.targetAttribution

  useEffect(() => {
    if (openImageIndex !== null && !dialogRef.current?.open) {
      dialogRef.current?.showModal()
    }
  }, [openImageIndex])

  if (isUser) {
    const openImage = openImageIndex === null ? null : message.images?.[openImageIndex]

    return (
      <article className='flex justify-end'>
        <div className='flex max-w-[min(78%,32rem)] flex-col items-end gap-2'>
          {message.content ? (
            <div className='whitespace-pre-wrap break-words rounded-[14px_14px_4px_14px] bg-nyx-solid px-3.5 py-2.5 text-[14.5px] leading-[1.55] text-nyx-ink'>
              {message.content}
            </div>
          ) : null}

          {message.images?.length ? (
            <div
              className={`grid w-[min(70vw,24rem)] gap-1.5 ${
                message.images.length === 1 ? 'grid-cols-1' : 'grid-cols-2'
              }`}
              aria-label='Attached images'
            >
              {message.images.map((image, index) =>
                image.available ? (
                  <button
                    aria-label={`Open attached image ${index + 1}`}
                    className='aspect-square min-w-0 overflow-hidden rounded-xl border border-nyx-line bg-nyx-solid'
                    key={image.imageId}
                    onClick={(event) => {
                      imageTriggerRef.current = event.currentTarget
                      setOpenImageIndex(index)
                    }}
                    type='button'
                  >
                    <img
                      alt={`Attached image ${index + 1}`}
                      className='h-full w-full object-cover'
                      src={buildNyxChatImageUrl(image.imageId, 'preview')}
                    />
                  </button>
                ) : (
                  <div
                    aria-label={`Attached image ${index + 1} is unavailable`}
                    className='flex aspect-square items-center justify-center rounded-xl border border-dashed border-nyx-line-strong bg-nyx-solid px-3 text-center text-xs text-nyx-subtle'
                    key={image.imageId}
                    role='img'
                  >
                    Image unavailable
                  </div>
                ),
              )}
            </div>
          ) : null}

          {message.documents?.length ? (
            <div className='w-[min(70vw,24rem)] space-y-1.5' aria-label='Attached documents'>
              {message.documents.map((document) => (
                <div
                  className='flex min-w-0 items-center gap-2 rounded-xl border border-nyx-line bg-nyx-solid px-3 py-2 text-left'
                  key={document.documentId}
                >
                  <FileText aria-hidden='true' className='h-4 w-4 shrink-0 text-nyx-muted' />
                  <div className='min-w-0 flex-1'>
                    <p className='truncate text-[12px] font-medium text-nyx-ink'>{document.name}</p>
                    <p className='text-[11px] text-nyx-subtle'>
                      {document.available
                        ? document.mediaType === 'application/pdf'
                          ? 'PDF'
                          : 'Text document'
                        : 'Document unavailable'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          <dialog
            aria-label='Image preview'
            className='relative m-auto max-h-[90vh] max-w-[90vw] rounded-2xl border border-nyx-line-strong bg-nyx-panel p-2 text-nyx-ink shadow-xl backdrop:bg-black/60'
            onClose={() => {
              setOpenImageIndex(null)
              imageTriggerRef.current?.focus()
            }}
            ref={dialogRef}
          >
            {openImage?.available ? (
              <img
                alt={`Full attached image ${openImageIndex! + 1}`}
                className='max-h-[calc(90vh-1rem)] max-w-[calc(90vw-1rem)] rounded-xl object-contain'
                src={buildNyxChatImageUrl(openImage.imageId, 'full')}
              />
            ) : null}
            <button
              aria-label='Close image preview'
              className='absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-nyx-panel/90 text-nyx-muted shadow-sm hover:text-nyx-ink'
              onClick={() => dialogRef.current?.close()}
              type='button'
            >
              <X aria-hidden='true' className='h-4 w-4' />
            </button>
          </dialog>
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
