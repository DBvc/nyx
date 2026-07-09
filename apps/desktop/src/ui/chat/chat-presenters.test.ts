import { describe, expect, it } from 'vitest'

import type { NyxChatMessage, NyxChatRunStatus } from '../../../shared/chat/types'
import {
  shouldShowStatus,
  statusLabel,
  summarizeText,
  threadPreview,
  threadTitle,
} from './chat-presenters'

const runStatusLabels: Array<[NyxChatRunStatus, string]> = [
  ['idle', ''],
  ['submitting', 'Connecting'],
  ['streaming', 'Streaming'],
  ['completed', 'Ready'],
  ['cancelled', 'Stopped'],
  ['failed', 'Retry'],
]

function message(message: Partial<NyxChatMessage> & Pick<NyxChatMessage, 'role' | 'content'>) {
  return {
    id: `${message.role}-${message.content || 'empty'}`,
    status: 'completed' as const,
    ...message,
  }
}

describe('chat presenters', () => {
  it.each(runStatusLabels)('maps %s run status to its UI label', (runStatus, label) => {
    expect(statusLabel(runStatus)).toBe(label)
  })

  it('shows transient and failed statuses only', () => {
    expect(shouldShowStatus('idle')).toBe(false)
    expect(shouldShowStatus('completed')).toBe(false)
    expect(shouldShowStatus('submitting')).toBe(true)
    expect(shouldShowStatus('streaming')).toBe(true)
    expect(shouldShowStatus('cancelled')).toBe(true)
    expect(shouldShowStatus('failed')).toBe(true)
  })

  it('normalizes and truncates text summaries', () => {
    expect(summarizeText('  hello\n\nNyx   ', 20)).toBe('hello Nyx')
    expect(summarizeText('abcdefghijklmnopqrstuvwxyz', 12)).toBe('abcdefghi...')
    expect(summarizeText('   ', 12)).toBe('')
  })

  it('uses the first non-empty user message as the thread title', () => {
    expect(
      threadTitle([
        message({ role: 'assistant', content: 'Assistant first' }),
        message({ role: 'user', content: '   ' }),
        message({ role: 'user', content: 'Build a focused chat UI' }),
      ]),
    ).toBe('Build a focused chat UI')
  })

  it('uses the latest non-empty message as the thread preview', () => {
    expect(
      threadPreview([
        message({ role: 'user', content: 'Question' }),
        message({ role: 'assistant', content: '   ' }),
        message({ role: 'assistant', content: 'Answer' }),
      ]),
    ).toBe('Answer')
  })

  it('falls back for an empty thread shell', () => {
    expect(threadTitle([])).toBe('New thread')
    expect(threadPreview([])).toBe('Ready for a new thread')
  })
})
