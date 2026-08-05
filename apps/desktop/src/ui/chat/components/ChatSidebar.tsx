interface ChatSidebarProps {
  title: string
  preview: string
  activeView: 'chat' | 'connections'
  newThreadDisabled: boolean
  onNewThread: () => void
  onOpenChat: () => void
  onOpenConnectionsSettings: () => void
}

function NewThreadIcon() {
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

function SettingsIcon() {
  return (
    <svg
      aria-hidden='true'
      className='h-3.5 w-3.5'
      fill='none'
      viewBox='0 0 16 16'
      xmlns='http://www.w3.org/2000/svg'
    >
      <path d='M6.75 3.25H13M3 8H13M3 12.75H9.25' stroke='currentColor' strokeLinecap='round' />
      <circle cx='4.75' cy='3.25' r='1.25' stroke='currentColor' />
      <circle cx='11.25' cy='12.75' r='1.25' stroke='currentColor' />
    </svg>
  )
}

export function ChatSidebar({
  title,
  preview,
  activeView,
  newThreadDisabled,
  onNewThread,
  onOpenChat,
  onOpenConnectionsSettings,
}: ChatSidebarProps) {
  return (
    <aside className='flex w-[16.5rem] shrink-0 flex-col border-r border-nyx-line bg-nyx-sidebar px-2 py-2'>
      <div className='flex h-10 items-center px-2 text-[13px] font-semibold tracking-[-0.01em] text-nyx-ink'>
        Nyx
      </div>

      <button
        className='mt-1 flex h-8 items-center gap-2 rounded-lg px-2 text-left text-[13px] text-nyx-ink hover:bg-nyx-solid'
        disabled={newThreadDisabled}
        onClick={onNewThread}
        type='button'
      >
        <NewThreadIcon />
        New thread
      </button>

      <div className='mt-4 flex-1 overflow-hidden'>
        <div className='px-2 pb-1 text-[12px] font-medium text-nyx-subtle'>Current thread</div>
        <button
          className={`w-full rounded-lg px-3 py-2.5 text-left ${
            activeView === 'chat' ? 'bg-nyx-accent-soft' : 'hover:bg-nyx-solid'
          }`}
          onClick={onOpenChat}
          type='button'
        >
          <span className='block min-w-0 truncate text-[13px] font-medium text-nyx-ink'>
            {title}
          </span>
          <span className='mt-1 block min-w-0 truncate text-[12px] text-nyx-muted'>{preview}</span>
        </button>
      </div>

      <div className='mt-3 border-t border-nyx-line pt-2'>
        <div className='px-2 pb-1 text-[12px] font-medium text-nyx-subtle'>Settings</div>
        <button
          className={`flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-[13px] ${
            activeView === 'connections'
              ? 'bg-nyx-accent-soft text-nyx-ink'
              : 'text-nyx-muted hover:bg-nyx-solid hover:text-nyx-ink'
          }`}
          onClick={onOpenConnectionsSettings}
          type='button'
        >
          <SettingsIcon />
          Connections
        </button>
      </div>
    </aside>
  )
}
