import { describe, expect, it } from 'vitest'

import { isNyxChatDocumentName, nyxChatDocumentLimits } from './document-file'

describe('document file contract', () => {
  it('accepts only bounded basename and media-type pairs', () => {
    expect(isNyxChatDocumentName('notes.txt', 'text/plain')).toBe(true)
    expect(isNyxChatDocumentName('设计.MD', 'text/markdown')).toBe(true)
    expect(isNyxChatDocumentName('../notes.txt', 'text/plain')).toBe(false)
    expect(isNyxChatDocumentName('notes.txt', 'text/csv')).toBe(false)
    expect(nyxChatDocumentLimits.currentThreadAttachmentBytes).toBe(32 * 1024 * 1024)
  })
})
