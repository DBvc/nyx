import { describe, expect, it } from 'vitest'

import type { NyxChatMessage } from '../../../shared/chat/types'
import { toThreadStreamItems } from './thread-items'

function message(overrides: Partial<NyxChatMessage> = {}): NyxChatMessage {
  return {
    id: 'message-1',
    role: 'user',
    content: 'Build the thread shell',
    status: 'completed',
    ...overrides,
  }
}

describe('thread item adapter', () => {
  it('maps chat state messages to real thread message items only', () => {
    const messages = [
      message({ id: 'user-1', role: 'user', content: 'Start' }),
      message({ id: 'assistant-1', role: 'assistant', content: 'Working', status: 'streaming' }),
    ]

    expect(toThreadStreamItems(messages)).toEqual([
      {
        kind: 'message',
        id: 'user-1',
        message: messages[0],
      },
      {
        kind: 'message',
        id: 'assistant-1',
        message: messages[1],
      },
    ])
  })
})
