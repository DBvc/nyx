import type { NyxChatDocumentMediaType } from './types'

export const nyxChatDocumentLimits = {
  documentsPerTurn: 1,
  currentThreadDocuments: 8,
  sourceBytesPerDocument: 8 * 1024 * 1024,
  extractedBytesPerDocument: 128 * 1024,
  currentThreadExtractedBytes: 256 * 1024,
  currentThreadAttachmentBytes: 32 * 1024 * 1024,
} as const

const mediaTypeByExtension = {
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.csv': 'text/csv',
} as const satisfies Record<string, NyxChatDocumentMediaType>

export function isNyxChatDocumentName(name: string, mediaType: NyxChatDocumentMediaType) {
  if (
    name.length === 0 ||
    name !== name.trim() ||
    name === '.' ||
    name === '..' ||
    name.includes('/') ||
    name.includes('\\') ||
    [...name].some((character) => {
      const codePoint = character.codePointAt(0)!
      return codePoint <= 0x1f || codePoint === 0x7f
    }) ||
    new TextEncoder().encode(name).byteLength > 255
  ) {
    return false
  }

  const extensionIndex = name.lastIndexOf('.')
  const extension = extensionIndex > 0 ? name.slice(extensionIndex).toLowerCase() : ''
  return mediaTypeByExtension[extension as keyof typeof mediaTypeByExtension] === mediaType
}
