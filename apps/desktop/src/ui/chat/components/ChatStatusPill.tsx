import type { NyxChatRunStatus } from '../../../../shared/chat/types'
import { shouldShowStatus, statusLabel } from '../chat-presenters'

export function ChatStatusPill({ runStatus }: { runStatus: NyxChatRunStatus }) {
  if (!shouldShowStatus(runStatus)) {
    return null
  }

  return (
    <div className='flex items-center gap-1.5 rounded-full bg-nyx-panel px-2.5 py-1 text-xs text-nyx-muted'>
      <span className='h-1.5 w-1.5 rounded-full bg-nyx-muted' />
      {statusLabel(runStatus)}
    </div>
  )
}
