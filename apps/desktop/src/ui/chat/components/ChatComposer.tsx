import { ArrowUp, Square } from 'lucide-react'
import type { FormEvent, KeyboardEvent } from 'react'

interface ChatComposerProps {
  input: string
  isBusy: boolean
  canSend: boolean
  disabled: boolean
  onInputChange: (value: string) => void
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
  onInputChange,
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

          <div className='mt-2 flex h-8 items-center justify-end'>
            <button
              aria-label={isBusy ? 'Stop response' : 'Send message'}
              className={`flex h-8 w-8 items-center justify-center rounded-full ${
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
                <Square aria-hidden='true' fill='currentColor' size={10} strokeWidth={0} />
              ) : (
                <ArrowUp aria-hidden='true' className='h-4 w-4' strokeWidth={2} />
              )}
            </button>
          </div>
        </div>
      </form>
    </footer>
  )
}
