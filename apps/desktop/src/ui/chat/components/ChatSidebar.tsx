import type { NyxChatRunStatus } from '../../../../shared/chat/types'
import { shouldShowStatus, statusLabel } from '../chat-presenters'

interface ChatSidebarProps {
  title: string
  preview: string
  runStatus: NyxChatRunStatus
  activeView: 'chat' | 'connections'
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
  runStatus,
  activeView,
  onNewThread,
  onOpenChat,
  onOpenConnectionsSettings,
}: ChatSidebarProps) {
  return (
    <aside className='flex w-full shrink-0 flex-col border-b border-nyx-line-soft bg-nyx-sidebar px-2 py-2 lg:w-[18rem] lg:border-b-0 lg:border-r'>
      <button
        className='flex h-8 items-center gap-2 rounded-md px-2 text-left text-[13px] text-nyx-ink hover:bg-nyx-hover'
        onClick={onNewThread}
        type='button'
      >
        <NewThreadIcon />
        New thread
      </button>

      <div className='mt-3 flex-1 overflow-hidden'>
        <div className='px-2 pb-1 text-[11px] font-medium text-nyx-subtle'>Threads</div>
        <button
          className={`grid w-full grid-cols-[1fr_auto] gap-x-2 rounded-md px-3 py-2 text-left ${
            activeView === 'chat' ? 'bg-nyx-panel-strong' : 'hover:bg-nyx-hover'
          }`}
          onClick={onOpenChat}
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

      <div className='mt-3 border-t border-nyx-line-soft pt-2'>
        <div className='px-2 pb-1 text-[11px] font-medium text-nyx-subtle'>Settings</div>
        <button
          className={`flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] ${
            activeView === 'connections'
              ? 'bg-nyx-panel-strong text-nyx-ink'
              : 'text-nyx-muted hover:bg-nyx-hover hover:text-nyx-ink'
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
