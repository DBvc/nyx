import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { parseNyxChatImageHeader } from '../../../shared/chat/image-file'
import type { ResponsesContinuationStateV1 } from '../chat/provider-stream'
import { CurrentThreadDocumentFiles } from '../current-thread/document-files'
import {
  createCurrentThreadFileAdapter,
  type CurrentThreadFileAdapter,
} from '../current-thread/file-adapter'
import { CurrentThreadImageFiles } from '../current-thread/image-files'
import { CurrentThreadProviderStateFiles } from '../current-thread/provider-state-files'
import { parseCurrentThreadRecord } from '../current-thread/schemas'
import { activateThreadLibrary, ThreadLibraryActivationError } from './activation'
import type { ThreadLibraryClient } from './client'
import type { ImportedV5Rows } from './protocol'

const tempDirs: string[] = []
const timestamp = '2026-08-12T00:00:00.000Z'
const threadId = '00000000-0000-4000-8000-000000000100'
const imageId = '00000000-0000-4000-8000-000000000101'
const documentId = '00000000-0000-4000-8000-000000000102'
const stateId = '00000000-0000-4000-8000-000000000103'
const png = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAEklEQVR4AWJ65Or637b6wX8AAAAA//9pZw09AAAABklEQVQDABTLBQX5/tLNAAAAAElFTkSuQmCC',
    'base64',
  ),
)
const documentSource = new TextEncoder().encode('%PDF-1.7\nsource')
const documentText = new TextEncoder().encode('document text')

function digest(bytes: Uint8Array) {
  return createHash('sha256').update(bytes).digest('hex')
}

function decodeImageSize(bytes: Uint8Array) {
  const header = parseNyxChatImageHeader(bytes)
  return { width: header.width, height: header.height }
}

function continuation(): ResponsesContinuationStateV1 {
  return {
    version: 1,
    protocol: 'openai-responses',
    effectiveReasoningContext: null,
    outputItems: [
      {
        type: 'message',
        role: 'assistant',
        status: 'completed',
        content: [{ type: 'output_text', text: 'Answer', annotations: [] }],
      },
    ],
  }
}

function detail(rows: ImportedV5Rows) {
  return {
    summary: rows.thread,
    draft: rows.draft,
    turns: rows.turns,
    images: rows.images.map((row) => ({ ...row, owner: 'turn' as const })),
    documents: rows.documents.map((row) => ({ ...row, owner: 'turn' as const })),
    providerStateRefs: rows.providerStateRefs,
  }
}

type FakeTracker = {
  active: number
  maxActive: number
  imports: number
  opens: string[]
}

function fakeClientFactory(tracker: FakeTracker) {
  return (databasePath: string) => {
    let opened = false
    let rows: ImportedV5Rows | null = null
    const persist = () => writeFile(databasePath, JSON.stringify({ rows }), { mode: 0o600 })
    const client = {
      async open() {
        await mkdir(dirname(databasePath), { recursive: true, mode: 0o700 })
        try {
          const parsed = JSON.parse(await readFile(databasePath, 'utf8')) as {
            rows: ImportedV5Rows | null
          }
          rows = parsed.rows
        } catch (error) {
          if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
            return {
              id: 'open',
              ok: false,
              safeError: { code: 'library_unavailable', message: 'unavailable' },
              outcome: 'definitely_not_committed',
            } as const
          }
          await persist()
        }
        opened = true
        tracker.active += 1
        tracker.maxActive = Math.max(tracker.maxActive, tracker.active)
        tracker.opens.push(databasePath)
        return { id: 'open', ok: true, value: { schemaVersion: 1 } } as const
      },
      async close() {
        if (opened) {
          opened = false
          tracker.active -= 1
        }
        return { id: 'close', ok: true, value: { closed: true } } as const
      },
      async importV5(imported: ImportedV5Rows) {
        if (rows) {
          return {
            id: 'import',
            ok: false,
            safeError: { code: 'already_exists', message: 'exists' },
            outcome: 'definitely_not_committed',
          } as const
        }
        rows = imported
        tracker.imports += 1
        await persist()
        return {
          id: 'import',
          ok: true,
          value: { threadId: imported.thread.id, imported: true },
        } as const
      },
      async readThread(input: { threadId: string }) {
        return {
          id: 'read',
          ok: true,
          value: rows?.thread.id === input.threadId ? detail(rows) : null,
        } as const
      },
      async listPage(input: { location: string }) {
        return {
          id: 'list',
          ok: true,
          value: {
            rows:
              rows?.thread.location === input.location
                ? [{ availability: 'available', ...rows.thread }]
                : [],
            nextCursor: null,
            includedThroughCursor: rows ? 1 : 0,
          },
        } as const
      },
    }
    return client as unknown as ThreadLibraryClient
  }
}

function tracker(): FakeTracker {
  return { active: 0, maxActive: 0, imports: 0, opens: [] }
}

async function createUserData() {
  const path = await mkdtemp(join(tmpdir(), 'nyx-thread-activation-'))
  tempDirs.push(path)
  return path
}

async function hashTree(root: string) {
  const hash = createHash('sha256')
  async function walk(path: string, relativePath: string) {
    const entries = (await readdir(path, { withFileTypes: true })).sort((left, right) =>
      left.name.localeCompare(right.name),
    )
    for (const entry of entries) {
      const relative = join(relativePath, entry.name)
      const absolute = join(path, entry.name)
      hash.update(`${entry.isDirectory() ? 'd' : 'f'}:${relative}\0`)
      if (entry.isDirectory()) await walk(absolute, relative)
      else hash.update(await readFile(absolute))
    }
  }
  await walk(root, '')
  return hash.digest('hex')
}

async function createLegacyFixture(userDataPath: string) {
  const root = join(userDataPath, 'threads')
  const images = new CurrentThreadImageFiles({
    directoryPath: join(root, 'current-thread-assets'),
    decodeImageSize,
  })
  const documents = new CurrentThreadDocumentFiles({
    directoryPath: join(root, 'current-thread-documents'),
  })
  const providerStates = new CurrentThreadProviderStateFiles({
    directoryPath: join(root, 'current-thread-provider-state'),
    generateId: () => stateId,
  })
  const imageRef = { imageId, mediaType: 'image/png', width: 2, height: 1 } as const
  await images.writeNewImages({
    record: null,
    refs: [imageRef],
    images: [{ imageId, canonicalBytes: png, previewBytes: png }],
  })
  const [documentRef] = await documents.writeNewDocuments({
    record: null,
    refs: [
      {
        documentId,
        name: 'notes.pdf',
        mediaType: 'application/pdf',
        byteLength: documentSource.byteLength,
        extractedByteLength: documentText.byteLength,
      },
    ],
    documents: [
      {
        documentId,
        sourceBytes: documentSource,
        extractedTextBytes: documentText,
        extractedFromSha256: digest(documentSource),
      },
    ],
  })
  const providerStateRef = await providerStates.prepare(continuation(), 'a'.repeat(64))
  await providerStates.commit(providerStateRef)
  const record = parseCurrentThreadRecord({
    version: 5,
    threadId,
    turns: [
      {
        attemptRequestId: 'request-1',
        userMessageId: 'user-1',
        assistantMessageId: 'assistant-1',
        userContent: 'Question',
        imageRefs: [imageRef],
        documentRefs: [documentRef],
        assistantContent: 'Answer',
        assistantStatus: 'completed',
        error: null,
        targetBinding: {
          selection: {
            kind: 'connection',
            providerId: 'provider-1',
            modelId: 'model-1',
          },
          attribution: {
            kind: 'connection',
            providerId: 'provider-1',
            providerDisplayName: 'Provider One',
            modelId: 'model-1',
            modelDisplayName: 'Model One',
          },
        },
        providerStateRef,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  await writeFile(join(root, 'current-thread.json'), `${JSON.stringify(record)}\n`, 'utf8')
  return root
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

describe('activateThreadLibrary', () => {
  it('opens an existing canonical target without reading or importing legacy data', async () => {
    const userDataPath = await createUserData()
    const target = join(userDataPath, 'thread-library')
    const legacy = join(userDataPath, 'threads')
    await mkdir(target, { recursive: true })
    await writeFile(join(target, 'library.sqlite'), '{"rows":null}', 'utf8')
    const threadPath = join(target, 'threads', threadId)
    const stagingPath = join(threadPath, '.staging')
    const canonicalPath = join(threadPath, 'documents', `${documentId}.source`)
    await mkdir(stagingPath, { recursive: true })
    await mkdir(join(threadPath, 'documents'), { recursive: true })
    await writeFile(join(stagingPath, 'orphan.tmp'), 'orphan', 'utf8')
    await writeFile(canonicalPath, documentSource)
    await mkdir(legacy, { recursive: true })
    await writeFile(join(legacy, 'current-thread.json'), '{malformed', 'utf8')
    const base = createCurrentThreadFileAdapter()
    let touchedLegacy = false
    const fileAdapter: CurrentThreadFileAdapter = {
      ...base,
      lstat: (path) => {
        if (path === legacy || path.startsWith(`${legacy}/`)) touchedLegacy = true
        return base.lstat(path)
      },
      listDirectory: (path) => {
        if (path === legacy || path.startsWith(`${legacy}/`)) touchedLegacy = true
        return base.listDirectory(path)
      },
      readText: (path) => {
        if (path === legacy || path.startsWith(`${legacy}/`)) touchedLegacy = true
        return base.readText(path)
      },
    }
    const observed = tracker()

    const activated = await activateThreadLibrary({
      userDataPath,
      decodeImageSize,
      fileAdapter,
      createClient: fakeClientFactory(observed),
    })

    expect(activated.importedThreadId).toBeNull()
    expect(touchedLegacy).toBe(false)
    expect(observed.imports).toBe(0)
    expect(observed.opens).toEqual([join(target, 'library.sqlite')])
    await expect(stat(stagingPath)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(readFile(canonicalPath)).resolves.toEqual(Buffer.from(documentSource))
    await activated.client.close()
  })

  it('fails before opening an existing library when a staging boundary is unsafe', async () => {
    const userDataPath = await createUserData()
    const target = join(userDataPath, 'thread-library')
    const threadPath = join(target, 'threads', threadId)
    const outsidePath = join(userDataPath, 'outside-staging')
    await mkdir(threadPath, { recursive: true })
    await mkdir(outsidePath)
    await writeFile(join(target, 'library.sqlite'), '{"rows":null}', 'utf8')
    await writeFile(join(outsidePath, 'keep.txt'), 'keep', 'utf8')
    await symlink(outsidePath, join(threadPath, '.staging'), 'dir')
    const observed = tracker()

    await expect(
      activateThreadLibrary({
        userDataPath,
        decodeImageSize,
        createClient: fakeClientFactory(observed),
      }),
    ).rejects.toBeInstanceOf(ThreadLibraryActivationError)

    expect(observed.opens).toEqual([])
    await expect(readFile(join(outsidePath, 'keep.txt'), 'utf8')).resolves.toBe('keep')
  })

  it('activates empty libraries for absent and retained-empty legacy roots', async () => {
    for (const retained of [false, true]) {
      const userDataPath = await createUserData()
      const legacy = join(userDataPath, 'threads')
      if (retained) {
        for (const name of [
          'current-thread-assets',
          'current-thread-documents',
          'current-thread-provider-state',
        ]) {
          await mkdir(join(legacy, name), { recursive: true })
        }
      }
      const before = retained ? await hashTree(legacy) : null
      const observed = tracker()

      const activated = await activateThreadLibrary({
        userDataPath,
        decodeImageSize,
        createClient: fakeClientFactory(observed),
      })

      expect(activated.importedThreadId).toBeNull()
      expect(observed.imports).toBe(0)
      expect(observed.maxActive).toBe(1)
      expect(observed.opens).toHaveLength(3)
      if (retained) expect(await hashTree(legacy)).toBe(before)
      await activated.client.close()
    }
  })

  it('fails closed on an orphan legacy sidecar and a target missing its database', async () => {
    const orphanUserData = await createUserData()
    const legacy = join(orphanUserData, 'threads')
    await mkdir(join(legacy, 'current-thread-assets'), { recursive: true })
    await writeFile(join(legacy, 'current-thread-assets', `${imageId}.full`), png)
    const before = await hashTree(legacy)
    const orphanTracker = tracker()

    await expect(
      activateThreadLibrary({
        userDataPath: orphanUserData,
        decodeImageSize,
        createClient: fakeClientFactory(orphanTracker),
      }),
    ).rejects.toBeInstanceOf(ThreadLibraryActivationError)
    expect(orphanTracker.opens).toEqual([])
    expect(await hashTree(legacy)).toBe(before)
    await expect(stat(join(orphanUserData, 'thread-library'))).rejects.toMatchObject({
      code: 'ENOENT',
    })

    const invalidUserData = await createUserData()
    await mkdir(join(invalidUserData, 'thread-library'))
    await writeFile(join(invalidUserData, 'threads-sentinel'), 'untouched')
    const invalidTracker = tracker()
    await expect(
      activateThreadLibrary({
        userDataPath: invalidUserData,
        decodeImageSize,
        createClient: fakeClientFactory(invalidTracker),
      }),
    ).rejects.toBeInstanceOf(ThreadLibraryActivationError)
    expect(invalidTracker.opens).toEqual([])
  })

  it('copies validated v5 resources, verifies a replacement generation, and preserves old bytes', async () => {
    const userDataPath = await createUserData()
    const legacy = await createLegacyFixture(userDataPath)
    const before = await hashTree(legacy)
    const observed = tracker()

    const activated = await activateThreadLibrary({
      userDataPath,
      decodeImageSize,
      createClient: fakeClientFactory(observed),
    })

    expect(activated.importedThreadId).toBe(threadId)
    expect(observed.imports).toBe(1)
    expect(observed.maxActive).toBe(1)
    expect(observed.opens).toHaveLength(3)
    expect(await hashTree(legacy)).toBe(before)
    const root = join(userDataPath, 'thread-library', 'threads', threadId)
    await expect(readFile(join(root, 'images', `${imageId}.full`))).resolves.toEqual(
      Buffer.from(png),
    )
    await expect(readFile(join(root, 'documents', `${documentId}.source`))).resolves.toEqual(
      Buffer.from(documentSource),
    )
    await expect(readFile(join(root, 'responses', `${stateId}.json`))).resolves.toBeTruthy()
    await expect(stat(join(userDataPath, 'thread-library.importing'))).rejects.toMatchObject({
      code: 'ENOENT',
    })
    await activated.client.close()
  })

  it('keeps corrupt resources local and clears only a corrupt Responses ref', async () => {
    const userDataPath = await createUserData()
    const legacy = await createLegacyFixture(userDataPath)
    await writeFile(join(legacy, 'current-thread-assets', `${imageId}.full`), 'broken')
    await writeFile(join(legacy, 'current-thread-documents', `${documentId}.text`), 'broken')
    await writeFile(join(legacy, 'current-thread-provider-state', `${stateId}.json`), '{}')
    const before = await hashTree(legacy)
    const observed = tracker()

    const activated = await activateThreadLibrary({
      userDataPath,
      decodeImageSize,
      createClient: fakeClientFactory(observed),
    })
    const stored = JSON.parse(
      await readFile(join(userDataPath, 'thread-library', 'library.sqlite'), 'utf8'),
    ) as { rows: ImportedV5Rows }

    expect(stored.rows.images).toMatchObject([{ imageId, available: false }])
    expect(stored.rows.documents).toMatchObject([
      { documentId, available: false, extractedText: null },
    ])
    expect(stored.rows.turns[0]).toMatchObject({
      assistantContent: 'Answer',
      providerStateId: null,
    })
    expect(stored.rows.providerStateRefs).toEqual([])
    expect(await hashTree(legacy)).toBe(before)
    await activated.client.close()
  })

  it('retains failed staging, never exposes a partial target, and rebuilds on Retry', async () => {
    const userDataPath = await createUserData()
    const legacy = await createLegacyFixture(userDataPath)
    const before = await hashTree(legacy)
    const base = createCurrentThreadFileAdapter()
    const staging = join(userDataPath, 'thread-library.importing')
    const target = join(userDataPath, 'thread-library')
    const failingAdapter: CurrentThreadFileAdapter = {
      ...base,
      rename: async (source, destination) => {
        if (source === staging && destination === target) throw new Error('disk full')
        await base.rename(source, destination)
      },
    }
    const failedTracker = tracker()

    await expect(
      activateThreadLibrary({
        userDataPath,
        decodeImageSize,
        fileAdapter: failingAdapter,
        createClient: fakeClientFactory(failedTracker),
      }),
    ).rejects.toBeInstanceOf(ThreadLibraryActivationError)
    expect(failedTracker.maxActive).toBe(1)
    await expect(stat(staging)).resolves.toBeTruthy()
    await expect(stat(target)).rejects.toMatchObject({ code: 'ENOENT' })
    expect(await hashTree(legacy)).toBe(before)

    const retryTracker = tracker()
    const activated = await activateThreadLibrary({
      userDataPath,
      decodeImageSize,
      createClient: fakeClientFactory(retryTracker),
    })
    expect(activated.importedThreadId).toBe(threadId)
    expect(retryTracker.maxActive).toBe(1)
    expect(await hashTree(legacy)).toBe(before)
    await activated.client.close()
  })
})
