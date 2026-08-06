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
  it.each(['pending', 'streaming'] as const)(
    'shows Thinking while an empty assistant message is %s',
    (status) => {
      const markup = renderAssistant({ status })

      expect(markup).toContain('Thinking…')
      expect(markup).not.toContain('Waiting for response')
      expect(markup).not.toContain('>Streaming<')
    },
  )

  it('shows streaming content without a second status line', () => {
    const markup = renderAssistant({ content: 'Hello', status: 'streaming' })

    expect(markup).toContain('Hello')
    expect(markup).not.toContain('Thinking…')
    expect(markup).not.toContain('Waiting for response')
    expect(markup).not.toContain('>Streaming<')
  })

  it('does not present an empty completed message as active thinking', () => {
    const markup = renderAssistant({ status: 'completed' })

    expect(markup).toContain('No response was returned.')
    expect(markup).toContain('role="status"')
    expect(markup).not.toContain('whitespace-pre-wrap">No response was returned.')
    expect(markup).not.toContain('Thinking…')
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
    expect(markup).not.toContain('Thinking…')
  })

  it('shows the confirmed connection target on a failed assistant response', () => {
    const markup = renderAssistant({
      status: 'failed',
      error: {
        code: 'network_error',
        message: 'The connection was interrupted.',
        retryable: true,
      },
      targetAttribution: {
        kind: 'connection',
        providerId: 'provider-1',
        providerDisplayName: 'Provider One',
        modelId: 'model-1',
        modelDisplayName: 'Model One',
      },
    })

    expect(markup).toContain('Provider One · Model One')
    expect(markup).not.toContain('provider-1')
    expect(markup).not.toContain('model-1')
  })

  it('shows the confirmed environment fallback model', () => {
    const markup = renderAssistant({
      content: 'Hello',
      status: 'completed',
      targetAttribution: {
        kind: 'env_fallback',
        modelId: 'env-model',
      },
    })

    expect(markup).toContain('.env · env-model')
  })

  it('does not guess a target for a pre-bind failure', () => {
    const markup = renderAssistant({
      status: 'failed',
      error: {
        code: 'target_unavailable',
        message: 'The selected target is unavailable.',
        retryable: true,
      },
    })

    expect(markup).not.toContain('.env ·')
    expect(markup).not.toContain('Provider One · Model One')
  })
})
