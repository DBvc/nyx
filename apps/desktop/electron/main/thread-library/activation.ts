import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { open } from 'node:fs/promises'
import { join } from 'node:path'
import { isDeepStrictEqual } from 'node:util'

import { nyxChatDocumentLimits } from '../../../shared/chat/document-file'
import { nyxChatImageLimits } from '../../../shared/chat/image-file'
import { responsesContinuationLimits } from '../chat/provider-stream'
import { CurrentThreadDocumentFiles } from '../current-thread/document-files'
import {
  createCurrentThreadFileAdapter,
  type CurrentThreadFileAdapter,
} from '../current-thread/file-adapter'
import { CurrentThreadImageFiles, type DecodeImageSize } from '../current-thread/image-files'
import { CurrentThreadProviderStateFiles } from '../current-thread/provider-state-files'
import { ThreadLibraryClient } from './client'
import { importedV5RowsSchema, type ImportedV5Rows } from './protocol'
import { ThreadLibrarySidecars } from './sidecars'
import { readV5Import } from './v5-importer'

const databaseName = 'library.sqlite'
const legacyRecordName = 'current-thread.json'
const legacyImagesName = 'current-thread-assets'
const legacyDocumentsName = 'current-thread-documents'
const legacyProviderStatesName = 'current-thread-provider-state'
const knownLegacyNames = new Set([
  legacyRecordName,
  legacyImagesName,
  legacyDocumentsName,
  legacyProviderStatesName,
])

type Options = {
  userDataPath: string
  decodeImageSize: DecodeImageSize
  fileAdapter?: CurrentThreadFileAdapter
  createClient?: (databasePath: string) => ThreadLibraryClient
}

export type ActivatedThreadLibrary = {
  client: ThreadLibraryClient
  sidecars: ThreadLibrarySidecars
  rootPath: string
  databasePath: string
  importedThreadId: string | null
}

export class ThreadLibraryActivationError extends Error {
  constructor(message = 'Could not open Thread Library.') {
    super(message)
    this.name = 'ThreadLibraryActivationError'
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}

async function exists(path: string, files: CurrentThreadFileAdapter) {
  try {
    return await files.lstat(path)
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') return null
    throw error
  }
}

async function assertDirectory(path: string, files: CurrentThreadFileAdapter) {
  const stat = await exists(path, files)
  if (!stat?.isDirectory() || stat.isSymbolicLink()) {
    throw new ThreadLibraryActivationError()
  }
}

async function assertCanonicalDatabase(rootPath: string, files: CurrentThreadFileAdapter) {
  await assertDirectory(rootPath, files)
  const database = await exists(join(rootPath, databaseName), files)
  if (!database?.isFile() || database.isSymbolicLink()) {
    throw new ThreadLibraryActivationError()
  }
}

async function hashRegularFile(path: string, hash: ReturnType<typeof createHash>) {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const first = await handle.stat()
    if (!first.isFile()) throw new ThreadLibraryActivationError()
    const buffer = Buffer.allocUnsafe(64 * 1024)
    let position = 0
    while (position < first.size) {
      const length = Math.min(buffer.byteLength, first.size - position)
      const { bytesRead } = await handle.read(buffer, 0, length, position)
      if (bytesRead === 0) throw new ThreadLibraryActivationError()
      hash.update(buffer.subarray(0, bytesRead))
      position += bytesRead
    }
    const last = await handle.stat()
    if (last.size !== first.size || last.mtimeMs !== first.mtimeMs) {
      throw new ThreadLibraryActivationError()
    }
  } finally {
    await handle.close()
  }
}

async function fingerprintTree(rootPath: string, files: CurrentThreadFileAdapter) {
  const root = await exists(rootPath, files)
  if (!root) return 'absent'
  if (!root.isDirectory() || root.isSymbolicLink()) throw new ThreadLibraryActivationError()
  const hash = createHash('sha256')

  async function walk(path: string, relativePath: string) {
    const names = (await files.listDirectory(path)).sort((left, right) => left.localeCompare(right))
    for (const name of names) {
      const entryPath = join(path, name)
      const childRelativePath = join(relativePath, name)
      const stat = await exists(entryPath, files)
      if (!stat || stat.isSymbolicLink()) throw new ThreadLibraryActivationError()
      if (stat.isDirectory()) {
        hash.update(`d:${childRelativePath}\0`)
        await walk(entryPath, childRelativePath)
      } else if (stat.isFile()) {
        hash.update(`f:${childRelativePath}:${stat.size}\0`)
        await hashRegularFile(entryPath, hash)
      } else {
        throw new ThreadLibraryActivationError()
      }
    }
  }

  await walk(rootPath, '')
  return hash.digest('hex')
}

async function assertNoOrphanLegacyData(legacyRootPath: string, files: CurrentThreadFileAdapter) {
  const root = await exists(legacyRootPath, files)
  if (!root) return
  if (!root.isDirectory() || root.isSymbolicLink()) throw new ThreadLibraryActivationError()
  const names = await files.listDirectory(legacyRootPath)
  if (names.some((name) => !knownLegacyNames.has(name) || name === legacyRecordName)) {
    throw new ThreadLibraryActivationError()
  }
  for (const name of [legacyImagesName, legacyDocumentsName, legacyProviderStatesName]) {
    const path = join(legacyRootPath, name)
    const stat = await exists(path, files)
    if (!stat) continue
    if (
      !stat.isDirectory() ||
      stat.isSymbolicLink() ||
      (await files.listDirectory(path)).length > 0
    ) {
      throw new ThreadLibraryActivationError()
    }
  }
}

function expectedDetail(rows: ImportedV5Rows) {
  return {
    summary: rows.thread,
    draft: rows.draft,
    turns: rows.turns,
    images: rows.images.map((row) => ({
      ...row,
      owner: 'turn' as const,
      turnOrdinal: row.turnOrdinal,
    })),
    documents: rows.documents.map((row) => ({
      ...row,
      owner: 'turn' as const,
      turnOrdinal: row.turnOrdinal,
    })),
    providerStateRefs: rows.providerStateRefs,
  }
}

async function requireOpen(client: ThreadLibraryClient) {
  const reply = await client.open()
  if (!reply.ok) throw new ThreadLibraryActivationError()
}

async function requireClose(client: ThreadLibraryClient) {
  const reply = await client.close()
  if (!reply.ok) throw new ThreadLibraryActivationError()
}

async function closeAfterFailure(client: ThreadLibraryClient) {
  try {
    await client.close()
  } catch {
    // The failed staging root is retained for diagnosis and rebuilt on Retry.
  }
}

async function publishLegacyResources({
  rows,
  legacyRootPath,
  sidecars,
  files,
}: {
  rows: ImportedV5Rows
  legacyRootPath: string
  sidecars: ThreadLibrarySidecars
  files: CurrentThreadFileAdapter
}) {
  const threadId = rows.thread.id
  const imagesByTurn = new Map<number, typeof rows.images>()
  for (const row of rows.images.filter((candidate) => candidate.available)) {
    imagesByTurn.set(row.turnOrdinal, [...(imagesByTurn.get(row.turnOrdinal) ?? []), row])
  }
  for (const [turnOrdinal, turnImages] of imagesByTurn) {
    await sidecars.publishImages(
      threadId,
      await Promise.all(
        turnImages.map(async (row) => ({
          ref: {
            imageId: row.imageId,
            mediaType: row.mediaType,
            width: row.width,
            height: row.height,
          },
          position: row.position,
          image: {
            imageId: row.imageId,
            canonicalBytes: await files.readBytes(
              join(legacyRootPath, legacyImagesName, `${row.imageId}.full`),
              nyxChatImageLimits.canonicalBytesPerImage,
            ),
            previewBytes: await files.readBytes(
              join(legacyRootPath, legacyImagesName, `${row.imageId}.preview`),
              nyxChatImageLimits.previewBytesPerImage,
            ),
          },
        })),
      ),
    )
    if (!rows.turns[turnOrdinal]) throw new ThreadLibraryActivationError()
  }

  const documentsByTurn = new Map<number, typeof rows.documents>()
  for (const row of rows.documents.filter((candidate) => candidate.available)) {
    documentsByTurn.set(row.turnOrdinal, [...(documentsByTurn.get(row.turnOrdinal) ?? []), row])
  }
  for (const turnDocuments of documentsByTurn.values()) {
    await sidecars.publishDocuments(
      threadId,
      await Promise.all(
        turnDocuments.map(async (row) => ({
          ref: {
            documentId: row.documentId,
            name: row.name,
            mediaType: row.mediaType,
            byteLength: row.byteLength,
            extractedByteLength: row.extractedByteLength,
          },
          position: row.position,
          document: {
            documentId: row.documentId,
            sourceBytes: await files.readBytes(
              join(legacyRootPath, legacyDocumentsName, `${row.documentId}.source`),
              nyxChatDocumentLimits.sourceBytesPerDocument,
            ),
            extractedTextBytes: await files.readBytes(
              join(legacyRootPath, legacyDocumentsName, `${row.documentId}.text`),
              nyxChatDocumentLimits.extractedBytesPerDocument,
            ),
            extractedFromSha256: row.sourceSha256,
          },
        })),
      ),
    )
  }

  for (const ref of rows.providerStateRefs) {
    const turn = rows.turns[ref.turnOrdinal]
    if (!turn || turn.providerStateId !== ref.stateId) throw new ThreadLibraryActivationError()
    const providerStateRef = {
      protocol: ref.protocol,
      stateId: ref.stateId,
      executionIdentity: ref.executionIdentity,
      byteLength: ref.byteLength,
      sha256: ref.sha256,
    }
    const bytes = await files.readBytes(
      join(legacyRootPath, legacyProviderStatesName, `${ref.stateId}.json`),
      responsesContinuationLimits.maxSerializedBytes,
    )
    await sidecars.publishResponseBytes(threadId, providerStateRef, bytes, turn.assistantContent)
  }
}

async function verifyStaging(
  client: ThreadLibraryClient,
  rows: ImportedV5Rows | null,
  sidecars: ThreadLibrarySidecars,
) {
  const listed = []
  for (const location of ['available', 'archived', 'trash'] as const) {
    const page = await client.listPage({ location, cursor: null, limit: 50 })
    if (!page.ok || page.value.nextCursor !== null) throw new ThreadLibraryActivationError()
    listed.push(...page.value.rows)
  }
  if (!rows) {
    if (listed.length > 0) throw new ThreadLibraryActivationError()
    return
  }
  if (listed.length !== 1 || listed[0]?.id !== rows.thread.id) {
    throw new ThreadLibraryActivationError()
  }
  const reply = await client.readThread({ threadId: rows.thread.id })
  if (!reply.ok || !reply.value || !isDeepStrictEqual(reply.value, expectedDetail(rows))) {
    throw new ThreadLibraryActivationError()
  }
  const inspection = await sidecars.inspect(reply.value)
  const expectedImages = rows.images.map((row) => ({ id: row.imageId, available: row.available }))
  const expectedDocuments = rows.documents.map((row) => ({
    id: row.documentId,
    available: row.available,
  }))
  if (
    !isDeepStrictEqual(inspection.images, expectedImages) ||
    !isDeepStrictEqual(inspection.documents, expectedDocuments) ||
    inspection.corruptProviderStateRefs.length > 0
  ) {
    throw new ThreadLibraryActivationError()
  }
}

async function assertNoLiveJournal(databasePath: string, files: CurrentThreadFileAdapter) {
  for (const suffix of ['-journal', '-wal', '-shm']) {
    if (await exists(`${databasePath}${suffix}`, files)) throw new ThreadLibraryActivationError()
  }
}

export async function activateThreadLibrary({
  userDataPath,
  decodeImageSize,
  fileAdapter = createCurrentThreadFileAdapter(),
  createClient = (databasePath) => new ThreadLibraryClient(databasePath),
}: Options): Promise<ActivatedThreadLibrary> {
  const targetRootPath = join(userDataPath, 'thread-library')
  const targetDatabasePath = join(targetRootPath, databaseName)
  const stagingRootPath = join(userDataPath, 'thread-library.importing')
  const stagingDatabasePath = join(stagingRootPath, databaseName)
  const legacyRootPath = join(userDataPath, 'threads')

  try {
    if (await exists(targetRootPath, fileAdapter)) {
      await assertCanonicalDatabase(targetRootPath, fileAdapter)
      const client = createClient(targetDatabasePath)
      await requireOpen(client)
      return {
        client: client as ThreadLibraryClient,
        sidecars: new ThreadLibrarySidecars({
          rootPath: targetRootPath,
          decodeImageSize,
          fileAdapter,
        }),
        rootPath: targetRootPath,
        databasePath: targetDatabasePath,
        importedThreadId: null,
      }
    }

    const legacyFingerprint = await fingerprintTree(legacyRootPath, fileAdapter)
    const legacyImages = new CurrentThreadImageFiles({
      directoryPath: join(legacyRootPath, legacyImagesName),
      decodeImageSize,
      fileAdapter,
    })
    const legacyDocuments = new CurrentThreadDocumentFiles({
      directoryPath: join(legacyRootPath, legacyDocumentsName),
      fileAdapter,
    })
    const legacyProviderStates = new CurrentThreadProviderStateFiles({
      directoryPath: join(legacyRootPath, legacyProviderStatesName),
      fileAdapter,
    })
    const imported = await readV5Import({
      filePath: join(legacyRootPath, legacyRecordName),
      images: legacyImages,
      documents: legacyDocuments,
      providerStates: legacyProviderStates,
      fileAdapter,
    })
    if (!imported) await assertNoOrphanLegacyData(legacyRootPath, fileAdapter)
    const rows = imported ? importedV5RowsSchema.parse(imported) : null

    const interruptedStaging = await exists(stagingRootPath, fileAdapter)
    if (
      interruptedStaging &&
      (!interruptedStaging.isDirectory() || interruptedStaging.isSymbolicLink())
    ) {
      throw new ThreadLibraryActivationError()
    }
    await fileAdapter.removeDirectory(stagingRootPath)
    const stagingSidecars = new ThreadLibrarySidecars({
      rootPath: stagingRootPath,
      decodeImageSize,
      fileAdapter,
    })
    const importer = createClient(stagingDatabasePath)
    try {
      await requireOpen(importer)
      if (rows) {
        await publishLegacyResources({
          rows,
          legacyRootPath,
          sidecars: stagingSidecars,
          files: fileAdapter,
        })
        const reply = await importer.importV5(rows)
        if (!reply.ok || !reply.value.imported || reply.value.threadId !== rows.thread.id) {
          throw new ThreadLibraryActivationError()
        }
      }
      await requireClose(importer)
    } catch (error) {
      await closeAfterFailure(importer)
      throw error
    }

    const verifier = createClient(stagingDatabasePath)
    try {
      await requireOpen(verifier)
      await verifyStaging(verifier, rows, stagingSidecars)
      await requireClose(verifier)
    } catch (error) {
      await closeAfterFailure(verifier)
      throw error
    }

    await assertNoLiveJournal(stagingDatabasePath, fileAdapter)
    if ((await fingerprintTree(legacyRootPath, fileAdapter)) !== legacyFingerprint) {
      throw new ThreadLibraryActivationError()
    }
    if (await exists(targetRootPath, fileAdapter)) throw new ThreadLibraryActivationError()
    await fileAdapter.rename(stagingRootPath, targetRootPath)

    const client = createClient(targetDatabasePath)
    await requireOpen(client)
    return {
      client: client as ThreadLibraryClient,
      sidecars: new ThreadLibrarySidecars({
        rootPath: targetRootPath,
        decodeImageSize,
        fileAdapter,
      }),
      rootPath: targetRootPath,
      databasePath: targetDatabasePath,
      importedThreadId: rows?.thread.id ?? null,
    }
  } catch (error) {
    if (error instanceof ThreadLibraryActivationError) throw error
    throw new ThreadLibraryActivationError()
  }
}
