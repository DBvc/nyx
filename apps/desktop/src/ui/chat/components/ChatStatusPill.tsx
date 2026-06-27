import type { NyxChatRunStatus } from '../../../../shared/chat/types'
import { shouldShowStatus, statusLabel } from '../chat-presenters'

function dotClass(runStatus: NyxChatRunStatus) {
  switch (runStatus) {
    case 'submitting':
      return 'bg-amber-500'
    case 'streaming':
      return 'bg-emerald-600'
    case 'failed':
      return 'bg-red-600'
    case 'cancelled':
      return 'bg-nyx-subtle'
    case 'idle':
    case 'completed':
      return 'bg-nyx-muted'
  }
}

export function ChatStatusPill({ runStatus }: { runStatus: NyxChatRunStatus }) {
  if (!shouldShowStatus(runStatus)) {
    return null
  }

  return (
    <div
      aria-live='polite'
      className='flex items-center gap-1.5 rounded-full bg-nyx-panel px-2.5 py-1 text-xs text-nyx-muted'
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dotClass(runStatus)}`} />
      {statusLabel(runStatus)}
    </div>
  )
}
