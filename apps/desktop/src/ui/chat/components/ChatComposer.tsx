import {
  ArrowUp,
  Check,
  ChevronDown,
  CircleAlert,
  FileText,
  Paperclip,
  RotateCcw,
  Square,
  X,
} from 'lucide-react'
import {
  useRef,
  type ClipboardEvent,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
} from 'react'

import type { NyxChatError } from '../../../../shared/chat/types'
import type { ChatDocumentDraft, ChatImageDraft } from '../chat-types'

interface ChatComposerProps {
  input: string
  draftImages: ReadonlyArray<ChatImageDraft>
  draftDocuments: ReadonlyArray<ChatDocumentDraft>
  isBusy: boolean
  isAccepting: boolean
  canSend: boolean
  disabled: boolean
  targetDisabled: boolean
  targetOptions: ReadonlyArray<{
    value: string
    label: string
    detail: string
    disambiguation: string
    disabled?: boolean
  }>
  targetAction: {
    label: string
    run: () => void
  } | null
  targetStatus: string | null
  targetValue: string
  composerError: NyxChatError | null
  composerNotice: string | null
  onInputChange: (value: string) => void
  onAddImages: (images: ReadonlyArray<Blob>) => void
  onAddDocuments: (documents: ReadonlyArray<File>) => void
  onRemoveImage: (imageId: string) => void
  onRetryImage: (imageId: string) => void
  onRemoveDocument: (documentId: string) => void
  onRetryDocument: (documentId: string) => void
  onTargetChange: (value: string) => void
  onSend: () => void | Promise<void>
  onStop: () => void | Promise<void>
}

export function shouldSendComposerKey(key: string, shiftKey: boolean, isComposing: boolean) {
  return key === 'Enter' && !shiftKey && !isComposing
}

export function isSupportedComposerImageType(type: string) {
  return type === 'image/png' || type === 'image/jpeg'
}

export function isSupportedComposerDocumentName(name: string) {
  return /\.(?:csv|md|pdf|txt)$/iu.test(name)
}

export function routeDroppedComposerFiles(
  files: ReadonlyArray<File>,
  onAddImages: (files: ReadonlyArray<File>) => void,
  onAddDocuments: (files: ReadonlyArray<File>) => void,
) {
  const images = files.filter((file) => isSupportedComposerImageType(file.type))
  const documents = files.filter((file) => isSupportedComposerDocumentName(file.name))

  if (images.length > 0) {
    onAddImages(images)
  }

  if (documents.length > 0) {
    onAddDocuments(documents)
  }

  return images.length > 0 || documents.length > 0
}

function documentSize(byteLength: number) {
  return byteLength < 1024 * 1024
    ? `${Math.max(1, Math.round(byteLength / 1024))} KB`
    : `${(byteLength / (1024 * 1024)).toFixed(1)} MB`
}

export function ChatComposer({
  input,
  draftImages,
  draftDocuments,
  isBusy,
  isAccepting,
  canSend,
  disabled,
  targetDisabled,
  targetOptions,
  targetAction,
  targetStatus,
  targetValue,
  composerError,
  composerNotice,
  onInputChange,
  onAddImages,
  onAddDocuments,
  onRemoveImage,
  onRetryImage,
  onRemoveDocument,
  onRetryDocument,
  onTargetChange,
  onSend,
  onStop,
}: ChatComposerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!canSend) {
      return
    }

    void onSend()
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (!shouldSendComposerKey(event.key, event.shiftKey, event.nativeEvent.isComposing)) {
      return
    }

    event.preventDefault()

    if (!canSend) {
      return
    }

    void onSend()
  }

  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const images = [...event.clipboardData.items]
      .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter((file): file is File => file !== null)

    if (images.length === 0) {
      return
    }

    event.preventDefault()
    onAddImages(images)
  }

  function handleDrop(event: DragEvent<HTMLFormElement>) {
    const files = [...event.dataTransfer.files]

    if (!routeDroppedComposerFiles(files, onAddImages, onAddDocuments)) {
      return
    }

    event.preventDefault()
  }

  const targetPopoverRef = useRef<HTMLDivElement>(null)
  const targetTriggerRef = useRef<HTMLButtonElement>(null)
  const selectedTarget = targetOptions.find((option) => option.value === targetValue)
  const selectedTargetNeedsDisambiguation =
    selectedTarget !== undefined &&
    targetOptions.some(
      (option) => option.value !== selectedTarget.value && option.label === selectedTarget.label,
    )
  const targetSummary = selectedTarget
    ? [
        selectedTarget.label,
        selectedTarget.disambiguation,
        selectedTarget.disabled ? 'Unavailable' : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : (targetStatus ?? 'Choose target')
  const targetTriggerDisabled =
    (targetDisabled || targetOptions.length === 0) && targetAction === null

  function closeTargetPopover() {
    targetPopoverRef.current?.hidePopover()
    targetTriggerRef.current?.focus()
  }

  return (
    <footer className='shrink-0 bg-nyx-canvas px-6 pb-5 pt-4'>
      <form
        className='mx-auto w-full max-w-[48rem]'
        onDragOver={(event) => {
          if (
            [...event.dataTransfer.items].some(
              (item) =>
                isSupportedComposerImageType(item.type) ||
                (item.kind === 'file' &&
                  isSupportedComposerDocumentName(item.getAsFile()?.name ?? '')),
            )
          ) {
            event.preventDefault()
          }
        }}
        onDrop={handleDrop}
        onSubmit={handleSubmit}
      >
        <div className='rounded-2xl border border-nyx-line bg-nyx-panel px-3.5 pb-2.5 pt-3.5 shadow-sm focus-within:border-nyx-subtle'>
          {draftDocuments.length > 0 ? (
            <ol className='mb-3 space-y-2' aria-label='Attached documents'>
              {draftDocuments.map((document, index) => (
                <li
                  className='flex min-w-0 items-center gap-2 rounded-xl border border-nyx-line bg-nyx-solid px-3 py-2'
                  key={document.id}
                >
                  <FileText aria-hidden='true' className='h-4 w-4 shrink-0 text-nyx-muted' />
                  <div className='min-w-0 flex-1'>
                    <p className='truncate text-[12px] font-medium text-nyx-ink'>{document.name}</p>
                    <p className='text-[11px] text-nyx-subtle'>
                      {`${document.mediaType === 'application/pdf' ? 'PDF' : 'Text'} · ${documentSize(document.status === 'ready' ? document.document.byteLength : document.source.size)} · ${
                        document.status === 'preparing'
                          ? 'Preparing…'
                          : document.status === 'failed'
                            ? document.error
                            : 'Ready'
                      }`}
                    </p>
                  </div>
                  {document.status === 'failed' ? (
                    <button
                      aria-label={`Retry document ${index + 1}`}
                      className='flex h-7 items-center gap-1 rounded-lg px-2 text-[11px] font-medium text-nyx-danger hover:bg-nyx-danger/10'
                      disabled={disabled || isAccepting}
                      onClick={() => onRetryDocument(document.id)}
                      type='button'
                    >
                      <RotateCcw aria-hidden='true' className='h-3 w-3' />
                      Retry
                    </button>
                  ) : null}
                  <button
                    aria-label={`Remove document ${index + 1}`}
                    className='flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-nyx-muted hover:bg-nyx-panel hover:text-nyx-ink disabled:opacity-50'
                    disabled={disabled || isAccepting}
                    onClick={() => onRemoveDocument(document.id)}
                    type='button'
                  >
                    <X aria-hidden='true' className='h-3.5 w-3.5' />
                  </button>
                </li>
              ))}
            </ol>
          ) : null}

          {draftImages.length > 0 ? (
            <ol className='mb-3 flex flex-wrap gap-2' aria-label='Attached images'>
              {draftImages.map((image, index) => (
                <li
                  className='group relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-nyx-line bg-nyx-solid'
                  key={image.id}
                >
                  {image.status === 'ready' ? (
                    <img
                      alt={`Attachment ${index + 1}`}
                      className='h-full w-full object-cover'
                      src={image.previewUrl}
                    />
                  ) : image.status === 'preparing' ? (
                    <div
                      aria-label={`Preparing attachment ${index + 1}`}
                      className='flex h-full items-center justify-center text-[11px] text-nyx-subtle'
                      role='status'
                    >
                      Preparing…
                    </div>
                  ) : (
                    <div className='flex h-full flex-col items-center justify-center gap-1 px-2 text-center text-[11px] leading-4 text-nyx-danger'>
                      <span>Couldn’t prepare</span>
                      <button
                        aria-label={`Retry attachment ${index + 1}`}
                        className='flex h-7 items-center gap-1 rounded-lg px-2 font-medium hover:bg-nyx-danger/10'
                        disabled={disabled || isAccepting}
                        onClick={() => {
                          onRetryImage(image.id)
                        }}
                        type='button'
                      >
                        <RotateCcw aria-hidden='true' className='h-3 w-3' />
                        Retry
                      </button>
                    </div>
                  )}

                  <button
                    aria-label={`Remove attachment ${index + 1}`}
                    className='absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-nyx-panel/90 text-nyx-muted shadow-sm hover:text-nyx-ink disabled:opacity-50'
                    disabled={disabled || isAccepting}
                    onClick={() => {
                      onRemoveImage(image.id)
                    }}
                    type='button'
                  >
                    <X aria-hidden='true' className='h-3.5 w-3.5' strokeWidth={2} />
                  </button>
                </li>
              ))}
            </ol>
          ) : null}

          <textarea
            aria-label='Tell Nyx what to do'
            className='chat-composer-input nyx-scrollbar min-h-6 max-h-36 w-full resize-none overflow-y-auto border-none bg-transparent px-0 py-0 text-[15px] leading-6 text-nyx-ink outline-none [field-sizing:content]'
            disabled={disabled || isAccepting}
            onChange={(event) => {
              onInputChange(event.target.value)
            }}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder='Tell Nyx what to do...'
            rows={1}
            spellCheck={false}
            value={input}
          />

          <div className='mt-2 flex h-9 items-center justify-between gap-2'>
            <div className='flex min-w-0 items-center gap-1'>
              <input
                accept='image/png,image/jpeg,.txt,.md,.csv,.pdf'
                className='sr-only'
                disabled={disabled || isAccepting}
                multiple
                onChange={(event) => {
                  const files = [...(event.target.files ?? [])]
                  event.target.value = ''
                  const images = files.filter((file) => isSupportedComposerImageType(file.type))
                  const documents = files.filter((file) =>
                    isSupportedComposerDocumentName(file.name),
                  )

                  if (images.length > 0) {
                    onAddImages(images)
                  }

                  if (documents.length > 0) {
                    onAddDocuments(documents)
                  }
                }}
                ref={fileInputRef}
                tabIndex={-1}
                type='file'
              />
              <button
                aria-label='Attach files'
                className='flex h-7 w-7 items-center justify-center rounded-lg text-nyx-muted hover:bg-nyx-solid hover:text-nyx-ink disabled:opacity-50'
                disabled={disabled || isAccepting}
                onClick={() => fileInputRef.current?.click()}
                title='Attach files'
                type='button'
              >
                <Paperclip aria-hidden='true' className='h-4 w-4' strokeWidth={1.75} />
              </button>
            </div>

            <div className='flex min-w-0 items-center gap-2'>
              <div className='min-w-0'>
                <button
                  aria-describedby={targetStatus ? 'chat-target-status' : undefined}
                  aria-haspopup='dialog'
                  aria-label={`Chat target: ${targetSummary}`}
                  className={`chat-target-trigger flex h-7 w-fit max-w-[14rem] items-center gap-1.5 rounded-lg px-2 text-left text-[12px] font-medium outline-none hover:bg-nyx-solid disabled:opacity-60 ${
                    selectedTarget?.disabled
                      ? 'text-nyx-warning'
                      : 'text-nyx-muted hover:text-nyx-ink'
                  }`}
                  disabled={isAccepting || targetTriggerDisabled}
                  popoverTarget='chat-target-popover'
                  ref={targetTriggerRef}
                  title={targetSummary}
                  type='button'
                >
                  <span className='min-w-0 truncate'>
                    {selectedTarget?.label ?? targetStatus ?? 'Choose target'}
                  </span>
                  {selectedTargetNeedsDisambiguation ? (
                    <>
                      <span aria-hidden='true' className='shrink-0 text-nyx-subtle'>
                        ·
                      </span>
                      <span className='min-w-0 truncate text-nyx-subtle'>
                        {selectedTarget.disambiguation}
                      </span>
                    </>
                  ) : null}
                  {selectedTarget?.disabled ? (
                    <CircleAlert
                      aria-hidden='true'
                      className='h-3.5 w-3.5 shrink-0'
                      strokeWidth={2}
                    />
                  ) : null}
                  <ChevronDown
                    aria-hidden='true'
                    className='h-3.5 w-3.5 shrink-0 text-nyx-subtle'
                    strokeWidth={1.75}
                  />
                </button>

                <div
                  aria-label='Chat target'
                  className='chat-target-popover rounded-xl border border-nyx-line-strong bg-nyx-panel p-1.5 text-nyx-ink shadow-lg'
                  id='chat-target-popover'
                  onToggle={(event) => {
                    if (!event.currentTarget.matches(':popover-open')) {
                      return
                    }

                    const selected = event.currentTarget.querySelector<HTMLButtonElement>(
                      'button[aria-pressed="true"]:not(:disabled)',
                    )
                    const firstAvailable =
                      event.currentTarget.querySelector<HTMLButtonElement>('button:not(:disabled)')
                    const focusTarget = selected ?? firstAvailable

                    focusTarget?.focus()
                  }}
                  popover='auto'
                  ref={targetPopoverRef}
                  role='dialog'
                >
                  <div className='px-2 py-1.5 text-[11px] font-medium text-nyx-subtle'>Model</div>

                  <div className='nyx-scrollbar max-h-64 overflow-y-auto'>
                    {targetOptions.map((option) => {
                      const selected = option.value === targetValue

                      return (
                        <button
                          aria-pressed={selected}
                          className={`flex min-h-10 w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left ${
                            selected
                              ? 'bg-nyx-solid text-nyx-ink'
                              : 'text-nyx-muted hover:bg-nyx-solid hover:text-nyx-ink'
                          }`}
                          disabled={option.disabled}
                          key={option.value}
                          onClick={() => {
                            onTargetChange(option.value)
                            closeTargetPopover()
                          }}
                          type='button'
                        >
                          <span className='min-w-0 flex-1'>
                            <span className='block break-words text-[13px] font-medium'>
                              {option.label}
                            </span>
                            <span className='block truncate text-[11px] text-nyx-subtle'>
                              {option.detail}
                            </span>
                          </span>
                          {selected ? (
                            <Check
                              aria-hidden='true'
                              className='h-3.5 w-3.5 shrink-0'
                              strokeWidth={2}
                            />
                          ) : null}
                        </button>
                      )
                    })}
                  </div>

                  {targetStatus || targetAction ? (
                    <div className='mt-1 border-t border-nyx-line px-2 py-2'>
                      {targetStatus ? (
                        <p className='m-0 text-[11px] leading-4 text-nyx-subtle'>{targetStatus}</p>
                      ) : null}
                      {targetAction ? (
                        <button
                          className='mt-1 text-[12px] font-medium text-nyx-muted hover:text-nyx-ink'
                          onClick={() => {
                            closeTargetPopover()
                            targetAction.run()
                          }}
                          type='button'
                        >
                          {targetAction.label}
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                {targetStatus ? (
                  <span aria-live='polite' className='sr-only' id='chat-target-status'>
                    {targetStatus}
                  </span>
                ) : null}
              </div>

              <button
                aria-label={isBusy ? 'Stop response' : 'Send message'}
                className={`flex h-9 w-9 items-center justify-center rounded-full ${
                  isBusy
                    ? 'bg-nyx-ink text-nyx-canvas hover:opacity-90'
                    : canSend
                      ? 'bg-nyx-accent text-nyx-canvas hover:opacity-90'
                      : 'bg-nyx-solid text-nyx-subtle'
                }`}
                disabled={!isBusy && !canSend}
                onClick={
                  isBusy
                    ? () => {
                        void onStop()
                      }
                    : undefined
                }
                title={isBusy ? 'Stop response' : undefined}
                type={isBusy ? 'button' : 'submit'}
              >
                {isBusy ? (
                  <Square aria-hidden='true' fill='currentColor' size={14} strokeWidth={0} />
                ) : (
                  <ArrowUp aria-hidden='true' className='h-[18px] w-[18px]' strokeWidth={2.25} />
                )}
              </button>
            </div>
          </div>
        </div>

        {composerError || composerNotice ? (
          <p
            className={`mt-2 px-1 text-[12px] leading-5 ${
              composerError ? 'text-nyx-danger' : 'text-nyx-subtle'
            }`}
            role={composerError ? 'alert' : 'status'}
          >
            {composerError?.message ?? composerNotice}
          </p>
        ) : null}
      </form>
    </footer>
  )
}
