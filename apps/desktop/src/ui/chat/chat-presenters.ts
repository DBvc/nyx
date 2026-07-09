import type { NyxChatMessage, NyxChatRunStatus } from '../../../shared/chat/types'

export function statusLabel(runStatus: NyxChatRunStatus) {
  switch (runStatus) {
    case 'submitting':
      return 'Connecting'
    case 'streaming':
      return 'Streaming'
    case 'completed':
      return 'Ready'
    case 'cancelled':
      return 'Stopped'
    case 'failed':
      return 'Retry'
    case 'idle':
      return ''
  }
}

export function shouldShowStatus(runStatus: NyxChatRunStatus) {
  return runStatus !== 'idle' && runStatus !== 'completed'
}

export function summarizeText(content: string, maxLength: number) {
  const normalized = content.trim().replace(/\s+/g, ' ')

  if (normalized.length === 0) {
    return ''
  }

  if (normalized.length <= maxLength) {
    return normalized
  }

  return `${normalized.slice(0, maxLength - 3).trimEnd()}...`
}

export function threadTitle(messages: ReadonlyArray<NyxChatMessage>) {
  const firstUserMessage = messages.find(
    (message) => message.role === 'user' && message.content.trim().length > 0,
  )

  return firstUserMessage ? summarizeText(firstUserMessage.content, 48) : 'New thread'
}

export function threadPreview(messages: ReadonlyArray<NyxChatMessage>) {
  const lastMessage = [...messages].reverse().find((message) => message.content.trim().length > 0)

  if (!lastMessage) {
    return 'Ready for a new thread'
  }

  return summarizeText(lastMessage.content, 46)
}
