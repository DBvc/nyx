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
  const isRunning = runStatus === 'submitting' || runStatus === 'streaming'

  return (
    <header className='flex h-12 shrink-0 items-center justify-between px-6'>
      <h1 className='min-w-0 truncate text-[13px] font-semibold text-nyx-ink'>{title}</h1>
      <div className='ml-4 shrink-0'>
        {isRunning ? (
          <ChatStatusPill runStatus={runStatus} />
        ) : (
          <ConnectionStatusPill status={connectionStatus} />
        )}
      </div>
    </header>
  )
}
