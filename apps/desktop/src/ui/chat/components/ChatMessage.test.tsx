import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import type { NyxChatMessage } from '../../../../shared/chat/types'
import { ChatMessage } from './ChatMessage'

function renderAssistant(message: Partial<NyxChatMessage>) {
  return renderToStaticMarkup(
    <ChatMessage
      message={{
        id: 'assistant-1',
        role: 'assistant',
        content: '',
        status: 'pending',
        ...message,
      }}
      onRetry={vi.fn()}
    />,
  )
}

describe('ChatMessage', () => {
  it('shows Thinking only while an empty assistant message is active', () => {
    expect(renderAssistant({ status: 'streaming' })).toContain('Thinking...')
  })

  it('does not present an empty completed message as active thinking', () => {
    const markup = renderAssistant({ status: 'completed' })

    expect(markup).toContain('No response was returned.')
    expect(markup).toContain('role="status"')
    expect(markup).not.toContain('whitespace-pre-wrap">No response was returned.')
    expect(markup).not.toContain('Thinking...')
  })

  it('does not present an empty failed message as active thinking', () => {
    const markup = renderAssistant({
      status: 'failed',
      error: {
        code: 'upstream_error',
        message: 'The provider returned an empty response.',
        retryable: true,
      },
    })

    expect(markup).toContain('The provider returned an empty response.')
    expect(markup).not.toContain('Thinking...')
  })
})
