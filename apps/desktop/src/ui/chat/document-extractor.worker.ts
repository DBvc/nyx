/// <reference lib="webworker" />

import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url'

import { nyxChatDocumentLimits } from '../../../shared/chat/document-file'
import type { NyxChatDocumentMediaType } from '../../../shared/chat/types'

export interface DocumentExtractorRequest {
  draftId: string
  source: Blob
  mediaType: NyxChatDocumentMediaType
}

export type DocumentExtractorResult =
  | {
      draftId: string
      ok: true
      extractedText: ArrayBuffer
      sourceSha256: string
    }
  | {
      draftId: string
      ok: false
      error: string
    }

const workerScope = self as DedicatedWorkerGlobalScope
const encoder = new TextEncoder()

GlobalWorkerOptions.workerSrc = pdfWorkerUrl

function toHex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function validateText(text: string) {
  if (text.trim().length === 0 || text.includes('\0')) {
    throw new Error('no_text')
  }

  const bytes = encoder.encode(text)

  if (bytes.byteLength > nyxChatDocumentLimits.extractedBytesPerDocument) {
    throw new Error('output_limit')
  }

  return bytes
}

async function extractPdf(source: ArrayBuffer) {
  const port = new Worker(pdfWorkerUrl, { type: 'module', name: 'nyx-pdfjs' })
  GlobalWorkerOptions.workerPort = port
  const loadingTask = getDocument({ data: new Uint8Array(source) })

  try {
    const pdf = await loadingTask.promise

    if (pdf.numPages > 50) {
      throw new Error('page_limit')
    }

    const pages: string[] = []
    let extractedBytes = 0

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber)
      const content = await page.getTextContent()
      let pageText = ''

      for (const item of content.items) {
        if (!('str' in item)) {
          continue
        }

        const separator = item.hasEOL ? '\n' : ' '
        extractedBytes += encoder.encode(item.str).byteLength + 1

        if (extractedBytes > nyxChatDocumentLimits.extractedBytesPerDocument) {
          throw new Error('output_limit')
        }

        pageText += item.str + separator
      }

      pages.push(pageText.trim())
      page.cleanup()
    }

    return pages.join('\n\n')
  } finally {
    await loadingTask.destroy()
    GlobalWorkerOptions.workerPort = null
    port.terminate()
  }
}

function safeError(error: unknown, mediaType: NyxChatDocumentMediaType) {
  if (error instanceof Error) {
    if (error.message === 'no_text') {
      return 'This document has no extractable text.'
    }

    if (error.message === 'output_limit') {
      return 'This document contains too much text.'
    }

    if (error.message === 'page_limit') {
      return 'This PDF has more than 50 pages.'
    }

    if (error.name === 'PasswordException') {
      return 'Encrypted PDFs are not supported.'
    }
  }

  return mediaType === 'application/pdf'
    ? 'Nyx could not read this PDF.'
    : 'This text file must be valid UTF-8 and contain text.'
}

async function extract({ draftId, source, mediaType }: DocumentExtractorRequest) {
  try {
    if (source.size === 0 || source.size > nyxChatDocumentLimits.sourceBytesPerDocument) {
      throw new Error('source_limit')
    }

    const sourceBuffer = await source.arrayBuffer()
    const digest = await crypto.subtle.digest('SHA-256', sourceBuffer)
    const text =
      mediaType === 'application/pdf'
        ? await extractPdf(sourceBuffer)
        : new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(sourceBuffer)
    const extractedText = validateText(text).buffer as ArrayBuffer
    const result: DocumentExtractorResult = {
      draftId,
      ok: true,
      extractedText,
      sourceSha256: toHex(digest),
    }

    workerScope.postMessage(result, [extractedText])
  } catch (error) {
    const result: DocumentExtractorResult = {
      draftId,
      ok: false,
      error: safeError(error, mediaType),
    }
    workerScope.postMessage(result)
  }
}

workerScope.onmessage = (event: MessageEvent<DocumentExtractorRequest>) => {
  void extract(event.data)
}
