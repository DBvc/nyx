import { ChevronDown, Plus, SlidersHorizontal, UserRound } from 'lucide-react'
import type { RefObject } from 'react'

interface ChatSidebarProps {
  title: string
  preview: string
  activeView: 'chat' | 'connections'
  newThreadDisabled: boolean
  onNewThread: () => void
  onOpenChat: () => void
  onOpenConnectionsSettings: () => void
  settingsPopoverRef: RefObject<HTMLDivElement | null>
}

export function ChatSidebar({
  title,
  preview,
  activeView,
  newThreadDisabled,
  onNewThread,
  onOpenChat,
  onOpenConnectionsSettings,
  settingsPopoverRef,
}: ChatSidebarProps) {
  return (
    <aside className='flex h-full w-[16.5rem] shrink-0 flex-col border-r border-nyx-line bg-nyx-sidebar px-2 py-2'>
      <div className='sidebar-titlebar mb-1 flex h-9 items-center text-[15px] font-semibold tracking-[-0.01em] text-nyx-ink'>
        <span className='window-drag-region flex h-full flex-1 items-center'>Nyx</span>
      </div>

      <button
        className='mt-1 flex h-8 items-center gap-2 rounded-lg bg-nyx-accent px-3 text-left text-[13px] font-medium text-nyx-canvas hover:opacity-90'
        disabled={newThreadDisabled}
        onClick={onNewThread}
        type='button'
      >
        <Plus aria-hidden='true' className='h-3.5 w-3.5' strokeWidth={1.75} />
        New thread
      </button>

      <div className='mt-4 flex-1 overflow-hidden'>
        <div className='px-2 pb-1 text-[12px] font-medium text-nyx-subtle'>Current thread</div>
        <button
          className={`w-full rounded-lg px-3 py-2.5 text-left ${
            activeView === 'chat' ? 'bg-nyx-canvas' : 'hover:bg-nyx-canvas'
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

      <div className='relative mt-3 border-t border-nyx-line pt-2'>
        <button
          aria-label='Open user settings'
          className='flex h-11 w-full items-center gap-2.5 rounded-lg px-2 text-left hover:bg-nyx-canvas'
          popoverTarget='sidebar-settings-popover'
          type='button'
        >
          <span className='flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-nyx-solid text-nyx-muted'>
            <UserRound aria-hidden='true' className='h-4 w-4' strokeWidth={1.75} />
          </span>
          <span className='min-w-0 flex-1'>
            <span className='block truncate text-[13px] font-medium text-nyx-ink'>Local user</span>
            <span className='block truncate text-[11px] text-nyx-subtle'>On this device</span>
          </span>
          <span className='text-nyx-subtle'>
            <ChevronDown aria-hidden='true' className='h-3.5 w-3.5' strokeWidth={1.75} />
          </span>
        </button>

        <div
          className='sidebar-settings-popover rounded-xl border border-nyx-line-strong bg-nyx-panel p-1.5 text-nyx-ink shadow-2xl'
          id='sidebar-settings-popover'
          onToggle={(event) => {
            if (event.currentTarget.matches(':popover-open')) {
              event.currentTarget.querySelector('button')?.focus()
            }
          }}
          popover='auto'
          ref={settingsPopoverRef}
        >
          <div className='px-2 py-1.5 text-[11px] font-medium text-nyx-subtle'>Settings</div>
          <button
            className={`flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-[13px] ${
              activeView === 'connections'
                ? 'bg-nyx-solid text-nyx-ink'
                : 'text-nyx-muted hover:bg-nyx-solid hover:text-nyx-ink'
            }`}
            onClick={onOpenConnectionsSettings}
            type='button'
          >
            <SlidersHorizontal aria-hidden='true' className='h-3.5 w-3.5' strokeWidth={1.75} />
            Connections
          </button>
        </div>
      </div>
    </aside>
  )
}
