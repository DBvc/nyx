import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { createCurrentThreadFileAdapter } from './file-adapter'
import { CurrentThreadDocumentFiles } from './document-files'
import { parseCurrentThreadRecordV4 } from './schemas'

const tempDirs: string[] = []
const source = new TextEncoder().encode('hello document')
const documentRef = {
  documentId: '00000000-0000-4000-8000-000000000010',
  name: 'notes.txt',
  mediaType: 'text/plain',
  byteLength: source.byteLength,
  extractedByteLength: source.byteLength,
} as const

function digest(bytes: Uint8Array) {
  return createHash('sha256').update(bytes).digest('hex')
}

function newDocument(bytes = source) {
  return {
    documentId: documentRef.documentId,
    sourceBytes: bytes,
    extractedTextBytes: bytes,
    extractedFromSha256: digest(bytes),
  }
}

function recordWithDocument(
  ref: Awaited<ReturnType<CurrentThreadDocumentFiles['writeNewDocuments']>>[number],
) {
  return parseCurrentThreadRecordV4({
    version: 4,
    threadId: 'thread-1',
    turns: [
      {
        attemptRequestId: 'request-1',
        userMessageId: 'user-1',
        assistantMessageId: 'assistant-1',
        userContent: '',
        imageRefs: [],
        documentRefs: [ref],
        assistantContent: 'Done',
        assistantStatus: 'completed',
        error: null,
        targetBinding: {
          selection: { kind: 'env_fallback' },
          attribution: { kind: 'env_fallback', modelId: 'model' },
        },
        createdAt: '2026-08-10T00:00:00.000Z',
        updatedAt: '2026-08-10T00:00:00.000Z',
      },
    ],
    createdAt: '2026-08-10T00:00:00.000Z',
    updatedAt: '2026-08-10T00:00:00.000Z',
  })
}

async function createDocuments() {
  const directoryPath = await mkdtemp(join(tmpdir(), 'nyx-current-thread-documents-'))
  tempDirs.push(directoryPath)
  return { directoryPath, documents: new CurrentThreadDocumentFiles({ directoryPath }) }
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('CurrentThreadDocumentFiles', () => {
  it('writes immutable source/text sidecars and verifies availability and hashes', async () => {
    const { directoryPath, documents } = await createDocuments()
    const [storedRef] = await documents.writeNewDocuments({
      record: null,
      refs: [documentRef],
      documents: [newDocument()],
    })
    const record = recordWithDocument(storedRef!)
    const sourcePath = join(directoryPath, `${documentRef.documentId}.source`)
    const textPath = join(directoryPath, `${documentRef.documentId}.text`)

    expect((await stat(directoryPath)).mode & 0o777).toBe(0o700)
    expect((await stat(sourcePath)).mode & 0o777).toBe(0o600)
    expect((await stat(textPath)).mode & 0o777).toBe(0o600)
    await expect(documents.availableDocumentIds(record)).resolves.toEqual(
      new Set([documentRef.documentId]),
    )
    await expect(documents.assertAvailable(record.turns[0]!.documentRefs)).resolves.toBeUndefined()

    await writeFile(sourcePath, new TextEncoder().encode('jello document'))
    await expect(documents.assertAvailable(record.turns[0]!.documentRefs)).resolves.toBeUndefined()

    await writeFile(sourcePath, new TextEncoder().encode('jello document!'))
    await expect(documents.assertAvailable(record.turns[0]!.documentRefs)).rejects.toMatchObject({
      code: 'unavailable',
    })
    await writeFile(sourcePath, new TextEncoder().encode('jello document'))

    await writeFile(textPath, new TextEncoder().encode('jello document'))
    await expect(documents.assertAvailable(record.turns[0]!.documentRefs)).rejects.toMatchObject({
      code: 'unavailable',
    })

    await writeFile(join(directoryPath, 'orphan.source'), source)
    await documents.reconcile(record)
    await expect(readFile(sourcePath)).resolves.toEqual(Buffer.from('jello document'))
    await expect(stat(join(directoryPath, 'orphan.source'))).rejects.toMatchObject({
      code: 'ENOENT',
    })
  })

  it('rejects invalid source representations before writing', async () => {
    const { documents } = await createDocuments()
    const invalidUtf8 = Uint8Array.from([0xff])

    await expect(
      documents.writeNewDocuments({
        record: null,
        refs: [{ ...documentRef, byteLength: 1, extractedByteLength: 1 }],
        documents: [newDocument(invalidUtf8)],
      }),
    ).rejects.toMatchObject({ code: 'invalid_request' })

    await expect(
      documents.writeNewDocuments({
        record: null,
        refs: [
          {
            ...documentRef,
            name: 'paper.pdf',
            mediaType: 'application/pdf',
          },
        ],
        documents: [newDocument()],
      }),
    ).rejects.toMatchObject({ code: 'invalid_request' })
  })

  it('rolls back source when cancellation wins between sidecar writes', async () => {
    const directoryPath = await mkdtemp(join(tmpdir(), 'nyx-document-cancel-'))
    tempDirs.push(directoryPath)
    const controller = new AbortController()
    const base = createCurrentThreadFileAdapter()
    const documents = new CurrentThreadDocumentFiles({
      directoryPath,
      fileAdapter: {
        ...base,
        rename: async (from, to) => {
          await base.rename(from, to)
          if (to.endsWith('.source')) controller.abort()
        },
      },
    })

    await expect(
      documents.writeNewDocuments({
        record: null,
        refs: [documentRef],
        documents: [newDocument()],
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' })
    await expect(
      stat(join(directoryPath, `${documentRef.documentId}.source`)),
    ).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('does not touch storage when cancellation is already visible', async () => {
    const { directoryPath, documents } = await createDocuments()
    const controller = new AbortController()
    controller.abort()

    await expect(
      documents.writeNewDocuments({
        record: null,
        refs: [documentRef],
        documents: [newDocument()],
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' })
    await expect(stat(directoryPath)).resolves.toBeDefined()
    await expect(
      stat(join(directoryPath, `${documentRef.documentId}.source`)),
    ).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
