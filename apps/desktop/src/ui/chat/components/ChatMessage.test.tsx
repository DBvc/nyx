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

function renderUser(message: Partial<NyxChatMessage>) {
  return renderToStaticMarkup(
    <ChatMessage
      message={{
        id: 'user-1',
        role: 'user',
        content: '',
        status: 'completed',
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

  it('renders stable previews for an image-only user message without loading full bytes', () => {
    const markup = renderUser({
      images: [
        {
          imageId: '00000000-0000-4000-8000-000000000001',
          mediaType: 'image/png',
          width: 1,
          height: 1,
          available: true,
        },
      ],
    })

    expect(markup).toContain('src="nyx-image://preview/00000000-0000-4000-8000-000000000001"')
    expect(markup).not.toContain('nyx-image://full/')
    expect(markup).toContain('aria-label="Open attached image 1"')
    expect(markup).toContain('min-h-11 min-w-11')
    expect(markup).toContain('max-h-[calc(18rem-2px)]')
    expect(markup).toContain('<dialog')
  })

  it('renders an unavailable image placeholder without a protocol URL', () => {
    const markup = renderUser({
      images: [
        {
          imageId: '00000000-0000-4000-8000-000000000002',
          mediaType: 'image/jpeg',
          width: 1,
          height: 1,
          available: false,
        },
      ],
    })

    expect(markup).toContain('Image unavailable')
    expect(markup).toContain('Attached image 1 is unavailable')
    expect(markup).not.toContain('nyx-image://')
  })

  it('renders durable document cards without exposing bytes or paths', () => {
    const markup = renderUser({
      documents: [
        {
          documentId: '00000000-0000-4000-8000-000000000010',
          name: 'notes.txt',
          mediaType: 'text/plain',
          byteLength: 5,
          extractedByteLength: 5,
          available: true,
        },
        {
          documentId: '00000000-0000-4000-8000-000000000011',
          name: 'missing.pdf',
          mediaType: 'application/pdf',
          byteLength: 10,
          extractedByteLength: 4,
          available: false,
        },
      ],
    })

    expect(markup).toContain('aria-label="Attached documents"')
    expect(markup).toContain('notes.txt')
    expect(markup).toContain('Text document')
    expect(markup).toContain('missing.pdf')
    expect(markup).toContain('Document unavailable')
    expect(markup).not.toContain('/private/')
  })
})
