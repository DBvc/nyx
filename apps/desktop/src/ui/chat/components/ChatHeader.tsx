import type { NyxChatRunStatus } from '../../../../shared/chat/types'
import type { ConnectionStatusState } from '../connection-status'
import { ChatStatusPill } from './ChatStatusPill'
import { ConnectionStatusPill } from './ConnectionStatusPill'

interface ChatHeaderProps {
  title: string
  runStatus: NyxChatRunStatus
  connectionStatus: ConnectionStatusState
}

export function ChatHeader({ title, runStatus, connectionStatus }: ChatHeaderProps) {
  return (
    <header className='flex h-12 shrink-0 items-center justify-between border-b border-nyx-line-soft px-4'>
      <h1 className='min-w-0 truncate text-[13px] font-semibold text-nyx-ink'>{title}</h1>
      <div className='ml-4 flex shrink-0 items-center gap-2'>
        <ConnectionStatusPill status={connectionStatus} />
        <ChatStatusPill runStatus={runStatus} />
      </div>
    </header>
  )
}
