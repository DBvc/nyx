import { ArrowUp, Check, ChevronDown, CircleAlert, Square } from 'lucide-react'
import { useRef, type FormEvent, type KeyboardEvent } from 'react'

interface ChatComposerProps {
  input: string
  isBusy: boolean
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
  onInputChange: (value: string) => void
  onTargetChange: (value: string) => void
  onSend: () => void | Promise<void>
  onStop: () => void | Promise<void>
}

export function shouldSendComposerKey(key: string, shiftKey: boolean, isComposing: boolean) {
  return key === 'Enter' && !shiftKey && !isComposing
}

export function ChatComposer({
  input,
  isBusy,
  canSend,
  disabled,
  targetDisabled,
  targetOptions,
  targetAction,
  targetStatus,
  targetValue,
  onInputChange,
  onTargetChange,
  onSend,
  onStop,
}: ChatComposerProps) {
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
      <form className='mx-auto w-full max-w-[48rem]' onSubmit={handleSubmit}>
        <div className='rounded-2xl border border-nyx-line bg-nyx-panel px-3.5 pb-2.5 pt-3.5 shadow-sm focus-within:border-nyx-subtle'>
          <textarea
            aria-label='Tell Nyx what to do'
            className='chat-composer-input nyx-scrollbar min-h-6 max-h-36 w-full resize-none overflow-y-auto border-none bg-transparent px-0 py-0 text-[15px] leading-6 text-nyx-ink outline-none [field-sizing:content]'
            disabled={disabled}
            onChange={(event) => {
              onInputChange(event.target.value)
            }}
            onKeyDown={handleKeyDown}
            placeholder='Tell Nyx what to do...'
            rows={1}
            spellCheck={false}
            value={input}
          />

          <div className='mt-2 flex h-9 items-center justify-end gap-2'>
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
                disabled={targetTriggerDisabled}
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
      </form>
    </footer>
  )
}
