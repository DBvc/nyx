import type { NyxChatRunStatus } from '../../../../shared/chat/types'
import { shouldShowStatus, statusLabel } from '../chat-presenters'

interface ChatSidebarProps {
  title: string
  preview: string
  runStatus: NyxChatRunStatus
  onNewChat: () => void
}

function NewChatIcon() {
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

export function ChatSidebar({ title, preview, runStatus, onNewChat }: ChatSidebarProps) {
  return (
    <aside className='flex w-full shrink-0 flex-col border-b border-nyx-line-soft bg-nyx-sidebar px-2 py-2 lg:w-[18rem] lg:border-b-0 lg:border-r'>
      <button
        className='flex h-8 items-center gap-2 rounded-md px-2 text-left text-[13px] text-nyx-ink hover:bg-nyx-hover'
        onClick={onNewChat}
        type='button'
      >
        <NewChatIcon />
        New chat
      </button>

      <div className='mt-3 flex-1 overflow-hidden'>
        <div className='px-2 pb-1 text-[11px] font-medium text-nyx-subtle'>Threads</div>
        <button
          className='grid w-full grid-cols-[1fr_auto] gap-x-2 rounded-md bg-nyx-panel-strong px-3 py-2 text-left'
          type='button'
        >
          <span className='min-w-0 truncate text-[13px] font-medium text-nyx-ink'>{title}</span>
          {shouldShowStatus(runStatus) ? (
            <span className='text-[11px] text-nyx-subtle'>{statusLabel(runStatus)}</span>
          ) : null}
          <span className='col-span-2 mt-1 min-w-0 truncate text-[12px] text-nyx-muted'>
            {preview}
          </span>
        </button>
      </div>
    </aside>
  )
}
