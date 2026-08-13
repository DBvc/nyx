import { createHash } from 'node:crypto'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { parseNyxChatImageHeader } from '../../../shared/chat/image-file'
import type { ResponsesContinuationStateV1 } from '../chat/provider-stream'
import { CurrentThreadDocumentFiles } from '../current-thread/document-files'
import { createCurrentThreadFileAdapter } from '../current-thread/file-adapter'
import { CurrentThreadImageFiles } from '../current-thread/image-files'
import { CurrentThreadProviderStateFiles } from '../current-thread/provider-state-files'
import {
  interruptedThreadErrorMessage,
  parseCurrentThreadRecord,
  type CurrentThreadRecord,
} from '../current-thread/schemas'
import { readV5Import } from './v5-importer'

const tempDirs: string[] = []
const timestamp = '2026-08-12T00:00:00.000Z'
const pendingUpdatedAt = '2026-08-12T00:30:00.000Z'
const recordUpdatedAt = '2026-08-12T00:45:00.000Z'
const threadId = '00000000-0000-4000-8000-000000000100'
const imageId = '00000000-0000-4000-8000-000000000101'
const documentId = '00000000-0000-4000-8000-000000000102'
const stateId = '00000000-0000-4000-8000-000000000103'
const documentSource = new TextEncoder().encode('%PDF-1.7\nraw-source-must-not-cross')
const extractedText = new TextEncoder().encode('hello document')
const png = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAEklEQVR4AWJ65Or637b6wX8AAAAA//9pZw09AAAABklEQVQDABTLBQX5/tLNAAAAAElFTkSuQmCC',
    'base64',
  ),
)
const imageRef = { imageId, mediaType: 'image/png', width: 2, height: 1 } as const
const targetSelection = {
  kind: 'connection',
  providerId: 'provider-1',
  modelId: 'model-1',
} as const
const targetAttribution = {
  kind: 'connection',
  providerId: 'provider-1',
  providerDisplayName: 'Provider One',
  modelId: 'model-1',
  modelDisplayName: 'Model One',
} as const

function digest(bytes: Uint8Array) {
  return createHash('sha256').update(bytes).digest('hex')
}

function continuationState(text = 'Answer'): ResponsesContinuationStateV1 {
  return {
    version: 1,
    protocol: 'openai-responses',
    effectiveReasoningContext: null,
    outputItems: [
      {
        type: 'reasoning',
        encrypted_content: 'opaque-state-must-not-cross',
        summary: [],
        content: [],
      },
      {
        type: 'message',
        role: 'assistant',
        status: 'completed',
        content: [{ type: 'output_text', text, annotations: [] }],
      },
    ],
  }
}

async function hashTree(root: string) {
  const hash = createHash('sha256')

  async function walk(directoryPath: string, relativePath: string) {
    const entries = (await readdir(directoryPath, { withFileTypes: true })).sort((left, right) =>
      left.name.localeCompare(right.name),
    )

    for (const entry of entries) {
      const entryRelativePath = join(relativePath, entry.name)
      const entryPath = join(directoryPath, entry.name)
      hash.update(`${entry.isDirectory() ? 'd' : 'f'}:${entryRelativePath}\0`)
      if (entry.isDirectory()) {
        await walk(entryPath, entryRelativePath)
      } else {
        hash.update(await readFile(entryPath))
      }
    }
  }

  await walk(root, '')
  return hash.digest('hex')
}

async function createRoot() {
  const root = await mkdtemp(join(tmpdir(), 'nyx-v5-import-'))
  tempDirs.push(root)
  const images = new CurrentThreadImageFiles({
    directoryPath: join(root, 'current-thread-assets'),
    decodeImageSize: (bytes) => {
      const parsed = parseNyxChatImageHeader(bytes)
      return { width: parsed.width, height: parsed.height }
    },
  })
  const documents = new CurrentThreadDocumentFiles({
    directoryPath: join(root, 'current-thread-documents'),
  })
  const providerStates = new CurrentThreadProviderStateFiles({
    directoryPath: join(root, 'current-thread-provider-state'),
    generateId: () => stateId,
  })

  return {
    root,
    filePath: join(root, 'current-thread.json'),
    images,
    documents,
    providerStates,
  }
}

async function writeRecord(filePath: string, record: CurrentThreadRecord) {
  await writeFile(filePath, `${JSON.stringify(record, null, 2)}\n`, 'utf8')
}

async function createCompleteFixture(continuationText = 'Answer') {
  const fixture = await createRoot()
  await fixture.images.writeNewImages({
    record: null,
    refs: [imageRef],
    images: [{ imageId, canonicalBytes: png, previewBytes: png }],
  })
  const [documentRef] = await fixture.documents.writeNewDocuments({
    record: null,
    refs: [
      {
        documentId,
        name: 'notes.pdf',
        mediaType: 'application/pdf',
        byteLength: documentSource.byteLength,
        extractedByteLength: extractedText.byteLength,
      },
    ],
    documents: [
      {
        documentId,
        sourceBytes: documentSource,
        extractedTextBytes: extractedText,
        extractedFromSha256: digest(documentSource),
      },
    ],
  })
  const providerStateRef = await fixture.providerStates.prepare(
    continuationState(continuationText),
    'a'.repeat(64),
  )
  await fixture.providerStates.commit(providerStateRef)

  const userContent = `  ${'😀'.repeat(46)}\n tail  `
  const record = parseCurrentThreadRecord({
    version: 5,
    threadId,
    turns: [
      {
        attemptRequestId: 'request-1',
        userMessageId: 'user-1',
        assistantMessageId: 'assistant-1',
        userContent,
        imageRefs: [imageRef],
        documentRefs: [documentRef],
        assistantContent: 'Answer',
        assistantStatus: 'completed',
        error: null,
        targetBinding: { selection: targetSelection, attribution: targetAttribution },
        providerStateRef,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  await writeRecord(fixture.filePath, record)

  return { ...fixture, providerStateRef, record }
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('readV5Import', () => {
  it('returns only validated semantic rows and leaves the old root byte-identical', async () => {
    const fixture = await createCompleteFixture()
    const before = await hashTree(fixture.root)
    const rows = await readV5Import(fixture)
    const repeatedRows = await readV5Import(fixture)

    expect(rows).toMatchObject({
      thread: {
        id: threadId,
        title: `${'😀'.repeat(45)}...`,
        location: 'available',
      },
      draft: { text: '', targetSelection },
      turns: [
        {
          assistantContent: 'Answer',
          assistantStatus: 'completed',
          providerStateId: stateId,
        },
      ],
      images: [{ imageId, available: true, turnOrdinal: 0, position: 0 }],
      documents: [{ documentId, available: true, extractedText: 'hello document', turnOrdinal: 0 }],
      providerStateRefs: [{ stateId, executionIdentity: 'a'.repeat(64), turnOrdinal: 0 }],
    })
    const serialized = JSON.stringify(rows)
    expect(serialized).not.toContain('opaque-state-must-not-cross')
    expect(serialized).not.toContain('raw-source-must-not-cross')
    expect(serialized).not.toContain(fixture.root)
    expect(serialized).not.toContain(Buffer.from(png).toString('base64'))
    expect(repeatedRows).toEqual(rows)
    expect(await hashTree(fixture.root)).toBe(before)
  })

  it('projects abandoned pending as Interrupted without rewriting the old record', async () => {
    const fixture = await createRoot()
    const record = parseCurrentThreadRecord({
      version: 5,
      threadId,
      turns: [
        {
          attemptRequestId: 'request-1',
          userMessageId: 'user-1',
          assistantMessageId: 'assistant-1',
          userContent: 'Question',
          imageRefs: [],
          documentRefs: [],
          assistantContent: '',
          assistantStatus: 'pending',
          error: null,
          targetBinding: { selection: { kind: 'env_fallback' }, attribution: null },
          providerStateRef: null,
          createdAt: timestamp,
          updatedAt: pendingUpdatedAt,
        },
      ],
      createdAt: timestamp,
      updatedAt: recordUpdatedAt,
    })
    await writeRecord(fixture.filePath, record)
    const before = await hashTree(fixture.root)

    const rows = await readV5Import(fixture)
    const repeatedRows = await readV5Import(fixture)

    expect(rows?.draft.targetSelection).toEqual({ kind: 'env_fallback' })
    expect(rows?.thread.lastUserActivityAt).toBe(timestamp)
    expect(rows?.turns[0]).toMatchObject({
      assistantStatus: 'failed',
      error: {
        code: 'unknown',
        message: interruptedThreadErrorMessage,
        retryable: true,
      },
      providerStateId: null,
      updatedAt: pendingUpdatedAt,
    })
    expect(repeatedRows).toEqual(rows)
    expect(await hashTree(fixture.root)).toBe(before)
  })

  it('derives deterministic collision-safe titles for image-only and whitespace-only history', async () => {
    for (const [userContent, imageRefs, kind] of [
      ['', [imageRef], 'Image'],
      ['   ', [], 'Untitled draft'],
    ] as const) {
      const fixture = await createRoot()
      const record = parseCurrentThreadRecord({
        version: 5,
        threadId,
        turns: [
          {
            attemptRequestId: 'request-1',
            userMessageId: 'user-1',
            assistantMessageId: 'assistant-1',
            userContent,
            imageRefs,
            documentRefs: [],
            assistantContent: 'Answer',
            assistantStatus: 'completed',
            error: null,
            targetBinding: { selection: { kind: 'env_fallback' }, attribution: null },
            providerStateRef: null,
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        ],
        createdAt: timestamp,
        updatedAt: recordUpdatedAt,
      })
      await writeRecord(fixture.filePath, record)
      const before = await hashTree(fixture.root)

      const first = await readV5Import(fixture)
      const second = await readV5Import(fixture)

      expect(first?.thread.fallbackOrdinal).toBe(1)
      expect(first?.thread.title).toBe(
        `${kind} · ${first!.thread.fallbackLocalSecond!.replace('T', ' ')}`,
      )
      expect(second).toEqual(first)
      expect(await hashTree(fixture.root)).toBe(before)
    }
  })

  it('degrades corrupt resources and a corrupt Responses ref deterministically', async () => {
    const fixture = await createCompleteFixture()
    await writeFile(join(fixture.root, 'current-thread-assets', `${imageId}.full`), 'broken')
    await writeFile(
      join(fixture.root, 'current-thread-documents', `${documentId}.text`),
      'jello document',
    )
    await writeFile(
      join(fixture.root, 'current-thread-provider-state', `${stateId}.json`),
      '{"broken":true}',
    )
    const before = await hashTree(fixture.root)

    const first = await readV5Import(fixture)
    const second = await readV5Import(fixture)

    expect(second).toEqual(first)
    expect(first?.images).toMatchObject([{ imageId, available: false }])
    expect(first?.documents).toMatchObject([{ documentId, available: false, extractedText: null }])
    expect(first?.providerStateRefs).toEqual([])
    expect(first?.turns[0]).toMatchObject({
      assistantContent: 'Answer',
      assistantStatus: 'completed',
      providerStateId: null,
    })
    expect(await hashTree(fixture.root)).toBe(before)
  })

  it('drops a valid Responses ref whose visible text differs from the durable turn', async () => {
    const fixture = await createCompleteFixture('Different answer')
    const before = await hashTree(fixture.root)

    const rows = await readV5Import(fixture)

    expect(rows?.providerStateRefs).toEqual([])
    expect(rows?.turns[0]).toMatchObject({ assistantContent: 'Answer', providerStateId: null })
    expect(await hashTree(fixture.root)).toBe(before)
  })

  it('returns null for absence and fails closed on read, JSON, or schema errors', async () => {
    const fixture = await createRoot()
    await expect(readV5Import(fixture)).resolves.toBeNull()

    await writeFile(fixture.filePath, '{', 'utf8')
    let before = await hashTree(fixture.root)
    await expect(readV5Import(fixture)).rejects.toEqual(
      expect.objectContaining({ code: 'malformed_json' }),
    )
    expect(await hashTree(fixture.root)).toBe(before)

    await writeFile(fixture.filePath, '{"version":5}', 'utf8')
    before = await hashTree(fixture.root)
    await expect(readV5Import(fixture)).rejects.toEqual(
      expect.objectContaining({ code: 'schema_invalid' }),
    )
    expect(await hashTree(fixture.root)).toBe(before)

    const fileAdapter = {
      ...createCurrentThreadFileAdapter(),
      readText: async () => {
        const error = new Error('denied') as NodeJS.ErrnoException
        error.code = 'EACCES'
        throw error
      },
    }
    await expect(readV5Import({ ...fixture, fileAdapter })).rejects.toEqual(
      expect.objectContaining({ code: 'io_error' }),
    )
    expect(await hashTree(fixture.root)).toBe(before)
  })
})
