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
    void onSend()
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey) {
      return
    }

    event.preventDefault()
    void onSend()
  }

  return (
    <footer className='shrink-0 bg-nyx-canvas px-6 pb-6 pt-3'>
      <form className='mx-auto w-full max-w-[46rem]' onSubmit={handleSubmit}>
        <div className='rounded-2xl border border-nyx-line-strong bg-nyx-panel px-4 py-3 shadow-[0_8px_24px_rgba(0,0,0,0.14)] focus-within:border-nyx-accent'>
          <textarea
            aria-label='Tell Nyx what to do'
            className='min-h-[3.3rem] w-full resize-none border-none bg-transparent px-0 py-0 text-[15px] leading-6 text-nyx-ink outline-none'
            disabled={disabled}
            onChange={(event) => {
              onInputChange(event.target.value)
            }}
            onKeyDown={handleKeyDown}
            placeholder='Tell Nyx what to do...'
            spellCheck={false}
            value={input}
          />

          <div className='mt-2 flex h-8 items-center justify-end gap-2'>
            {isBusy ? (
              <button
                className='h-8 rounded-full border border-nyx-line-strong bg-nyx-panel px-3 text-[13px] text-nyx-ink hover:bg-nyx-solid'
                onClick={() => {
                  void onStop()
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
                  ? 'bg-nyx-accent text-nyx-canvas hover:opacity-90'
                  : 'bg-nyx-solid text-nyx-subtle'
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
  )
}
