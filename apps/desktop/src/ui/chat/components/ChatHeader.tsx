import type { NyxChatRunStatus } from '../../../../shared/chat/types'
import { ChatStatusPill } from './ChatStatusPill'

interface ChatHeaderProps {
  title: string
  runStatus: NyxChatRunStatus
}

export function ChatHeader({ title, runStatus }: ChatHeaderProps) {
  return (
    <header className='flex h-12 shrink-0 items-center justify-between border-b border-nyx-line-soft px-4'>
      <h1 className='min-w-0 truncate text-[13px] font-semibold text-nyx-ink'>{title}</h1>
      <ChatStatusPill runStatus={runStatus} />
    </header>
  )
}
