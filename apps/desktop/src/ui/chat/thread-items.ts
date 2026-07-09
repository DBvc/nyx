import type { NyxChatMessage } from '../../../shared/chat/types'

export interface ThreadMessageItem {
  kind: 'message'
  id: string
  message: NyxChatMessage
}

export type ThreadStreamItem = ThreadMessageItem

export function toThreadStreamItems(messages: ReadonlyArray<NyxChatMessage>): ThreadStreamItem[] {
  return messages.map((message) => ({
    kind: 'message',
    id: message.id,
    message,
  }))
}
