import { createHash, randomUUID } from 'node:crypto'
import { join } from 'node:path'

import { z } from 'zod'

import { nyxChatDocumentLimits } from '../../../shared/chat/document-file'
import { nyxChatImageLimits } from '../../../shared/chat/image-file'
import type {
  NyxChatDocumentRef,
  NyxChatImageRef,
  NyxChatNewDocument,
  NyxChatNewImage,
} from '../../../shared/chat/types'
import {
  readResponsesVisibleText,
  responsesContinuationLimits,
  validateResponsesOutputItems,
  type ResponsesContinuationStateV1,
} from '../chat/provider-stream'
import { CurrentThreadDocumentFiles } from '../current-thread/document-files'
import {
  createCurrentThreadFileAdapter,
  type CurrentThreadFileAdapter,
} from '../current-thread/file-adapter'
import { CurrentThreadImageFiles, type DecodeImageSize } from '../current-thread/image-files'
import { parseProviderStateRef, type ProviderStateRef } from '../current-thread/schemas'
import type { ThreadLibraryThreadDetail } from './protocol'

const uuid = z.uuid()

export class ThreadLibrarySidecarError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ThreadLibrarySidecarError'
  }
}

export type NewThreadImage = {
  ref: NyxChatImageRef
  image: NyxChatNewImage
  position: number
}

export type NewThreadDocument = {
  ref: NyxChatDocumentRef
  document: NyxChatNewDocument
  position: number
}

export type PreparedResponse = {
  ref: ProviderStateRef
  bytes: Uint8Array
}

type Options = {
  rootPath: string
  decodeImageSize: DecodeImageSize
  fileAdapter?: CurrentThreadFileAdapter
}

function sha256(bytes: Uint8Array) {
  return createHash('sha256').update(bytes).digest('hex')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function responseBytes(state: ResponsesContinuationStateV1, assistantContent: string) {
  const outputItems = validateResponsesOutputItems(state.outputItems)
  if (
    state.version !== 1 ||
    state.protocol !== 'openai-responses' ||
    (state.effectiveReasoningContext !== null &&
      state.effectiveReasoningContext !== 'all_turns' &&
      state.effectiveReasoningContext !== 'current_turn') ||
    !outputItems ||
    readResponsesVisibleText(outputItems) !== assistantContent
  ) {
    throw new ThreadLibrarySidecarError('Provider continuation state is invalid.')
  }
  const bytes = new TextEncoder().encode(
    JSON.stringify({
      version: 1,
      protocol: 'openai-responses',
      effectiveReasoningContext: state.effectiveReasoningContext,
      outputItems,
    }),
  )
  if (bytes.byteLength === 0 || bytes.byteLength > responsesContinuationLimits.maxSerializedBytes) {
    throw new ThreadLibrarySidecarError('Provider continuation state is too large.')
  }
  return bytes
}

function parseResponse(bytes: Uint8Array) {
  let value: unknown
  try {
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } catch {
    throw new ThreadLibrarySidecarError('Provider continuation state is unavailable.')
  }
  if (!isRecord(value) || Object.keys(value).length !== 4) {
    throw new ThreadLibrarySidecarError('Provider continuation state is unavailable.')
  }
  const outputItems = validateResponsesOutputItems(value.outputItems)
  if (
    value.version !== 1 ||
    value.protocol !== 'openai-responses' ||
    (value.effectiveReasoningContext !== null &&
      value.effectiveReasoningContext !== 'all_turns' &&
      value.effectiveReasoningContext !== 'current_turn') ||
    !outputItems
  ) {
    throw new ThreadLibrarySidecarError('Provider continuation state is unavailable.')
  }
  return {
    version: 1,
    protocol: 'openai-responses',
    effectiveReasoningContext: value.effectiveReasoningContext,
    outputItems,
  } as ResponsesContinuationStateV1
}

export class ThreadLibrarySidecars {
  private readonly rootPath: string
  private readonly decodeImageSize: DecodeImageSize
  private readonly files: CurrentThreadFileAdapter

  constructor({
    rootPath,
    decodeImageSize,
    fileAdapter = createCurrentThreadFileAdapter(),
  }: Options) {
    this.rootPath = rootPath
    this.decodeImageSize = decodeImageSize
    this.files = fileAdapter
  }

  async publishImages(threadIdInput: string, rows: ReadonlyArray<NewThreadImage>) {
    if (rows.length === 0) return []
    const threadId = uuid.parse(threadIdInput)
    const paths = this.paths(threadId)
    const stage = join(paths.staging, randomUUID())
    const stagedImages = new CurrentThreadImageFiles({
      directoryPath: stage,
      decodeImageSize: this.decodeImageSize,
      fileAdapter: this.files,
    })
    const pending = []
    for (const row of rows) {
      const full = join(paths.images, `${row.ref.imageId}.full`)
      const preview = join(paths.images, `${row.ref.imageId}.preview`)
      const existing = await Promise.all([this.exists(full), this.exists(preview)])
      if (existing.every(Boolean)) {
        const [fullBytes, previewBytes] = await Promise.all([
          this.files.readBytes(full, nyxChatImageLimits.canonicalBytesPerImage),
          this.files.readBytes(preview, nyxChatImageLimits.previewBytesPerImage),
        ])
        if (
          !Buffer.from(fullBytes).equals(Buffer.from(row.image.canonicalBytes)) ||
          !Buffer.from(previewBytes).equals(Buffer.from(row.image.previewBytes))
        ) {
          throw new ThreadLibrarySidecarError('Image id already owns different bytes.')
        }
      } else if (existing.some(Boolean)) {
        throw new ThreadLibrarySidecarError('Image sidecar pair is incomplete.')
      } else {
        pending.push(row)
      }
    }
    const refs = rows.map((row) => row.ref)
    const moved: string[] = []
    try {
      await this.assertNoImageCapacityOverflow(paths.images, pending)
      await stagedImages.writeNewImages({
        record: null,
        refs,
        images: rows.map((row) => row.image),
      })
      await stagedImages.assertAvailable(refs)
      await this.files.ensureDirectory(paths.images, 0o700)
      for (const row of pending) {
        const full = join(paths.images, `${row.ref.imageId}.full`)
        const preview = join(paths.images, `${row.ref.imageId}.preview`)
        await this.assertAbsent(full)
        await this.assertAbsent(preview)
        await this.files.rename(join(stage, `${row.ref.imageId}.full`), full)
        moved.push(full)
        await this.files.rename(join(stage, `${row.ref.imageId}.preview`), preview)
        moved.push(preview)
      }
      return rows.map((row) => ({ ...row.ref, position: row.position, available: true }))
    } catch {
      await this.remove(moved)
      throw new ThreadLibrarySidecarError('Could not publish Thread images.')
    } finally {
      await this.removeDirectory(stage)
    }
  }

  async publishDocuments(threadIdInput: string, rows: ReadonlyArray<NewThreadDocument>) {
    if (rows.length === 0) return []
    const threadId = uuid.parse(threadIdInput)
    const paths = this.paths(threadId)
    const stage = join(paths.staging, randomUUID())
    const stagedDocuments = new CurrentThreadDocumentFiles({
      directoryPath: stage,
      fileAdapter: this.files,
    })
    const pending = []
    for (const row of rows) {
      const source = join(paths.documents, `${row.ref.documentId}.source`)
      if (await this.exists(source)) {
        const bytes = await this.files.readBytes(
          source,
          nyxChatDocumentLimits.sourceBytesPerDocument,
        )
        if (!Buffer.from(bytes).equals(Buffer.from(row.document.sourceBytes))) {
          throw new ThreadLibrarySidecarError('Document id already owns different bytes.')
        }
      } else {
        pending.push(row)
      }
    }
    const refs = rows.map((row) => row.ref)
    const moved: string[] = []
    try {
      const stored = await stagedDocuments.writeNewDocuments({
        record: null,
        refs,
        documents: rows.map((row) => row.document),
      })
      await this.files.ensureDirectory(paths.documents, 0o700)
      for (const row of pending) {
        const source = join(paths.documents, `${row.ref.documentId}.source`)
        await this.assertAbsent(source)
        await this.files.rename(join(stage, `${row.ref.documentId}.source`), source)
        moved.push(source)
      }
      return stored.map((ref, index) => ({
        ...ref,
        position: rows[index]!.position,
        available: true,
        extractedText: new TextDecoder('utf-8', { fatal: true }).decode(
          rows[index]!.document.extractedTextBytes,
        ),
      }))
    } catch {
      await this.remove(moved)
      throw new ThreadLibrarySidecarError('Could not publish Thread documents.')
    } finally {
      await this.removeDirectory(stage)
    }
  }

  prepareResponse({
    stateId: stateIdInput,
    executionIdentity,
    state,
    assistantContent,
  }: {
    stateId: string
    executionIdentity: string
    state: ResponsesContinuationStateV1
    assistantContent: string
  }) {
    const stateId = uuid.parse(stateIdInput)
    const bytes = responseBytes(state, assistantContent)
    const ref = parseProviderStateRef({
      protocol: 'openai-responses',
      stateId,
      executionIdentity,
      byteLength: bytes.byteLength,
      sha256: sha256(bytes),
    })
    return { ref, bytes } satisfies PreparedResponse
  }

  async publishResponseBytes(
    threadIdInput: string,
    refInput: ProviderStateRef,
    bytes: Uint8Array,
    assistantContent: string,
  ) {
    const threadId = uuid.parse(threadIdInput)
    const ref = parseProviderStateRef(refInput)
    if (
      bytes.byteLength !== ref.byteLength ||
      sha256(bytes) !== ref.sha256 ||
      readResponsesVisibleText(parseResponse(bytes).outputItems) !== assistantContent
    ) {
      throw new ThreadLibrarySidecarError('Provider continuation state does not match its ref.')
    }
    const paths = this.paths(threadId)
    const stage = join(paths.staging, `${randomUUID()}.json`)
    const committed = join(paths.responses, `${ref.stateId}.json`)
    try {
      await this.files.ensureDirectory(paths.staging, 0o700)
      await this.files.ensureDirectory(paths.responses, 0o700)
      if (await this.exists(committed)) {
        await this.readResponse(threadId, ref)
        return
      }
      await this.files.writeBytes(stage, bytes, 0o600)
      await this.readResponsePath(stage, ref)
      await this.files.rename(stage, committed)
      await this.readResponse(threadId, ref)
    } catch {
      await this.remove([stage])
      throw new ThreadLibrarySidecarError('Could not publish provider continuation state.')
    }
  }

  async inspect(detail: ThreadLibraryThreadDetail) {
    const threadId = uuid.parse(detail.summary.id)
    const paths = this.paths(threadId)
    const imageFiles = new CurrentThreadImageFiles({
      directoryPath: paths.images,
      decodeImageSize: this.decodeImageSize,
      fileAdapter: this.files,
    })
    const images = []
    for (const row of detail.images) {
      let available = true
      try {
        await imageFiles.assertAvailable([row])
      } catch {
        available = false
      }
      images.push({ id: row.imageId, available })
    }
    const documents = []
    for (const row of detail.documents) {
      documents.push({
        id: row.documentId,
        available: await this.documentAvailable(paths.documents, row),
      })
    }
    const corruptProviderStateRefs = []
    for (const ref of detail.providerStateRefs) {
      const turn = detail.turns[ref.turnOrdinal]
      try {
        const state = await this.readResponse(threadId, ref)
        if (!turn || readResponsesVisibleText(state.outputItems) !== turn.assistantContent) {
          throw new Error('Visible text mismatch.')
        }
      } catch {
        corruptProviderStateRefs.push({ requestId: turn?.attemptRequestId ?? '', ref })
      }
    }
    return { images, documents, corruptProviderStateRefs }
  }

  async cleanupOrphans(detail: ThreadLibraryThreadDetail) {
    const paths = this.paths(uuid.parse(detail.summary.id))
    await Promise.all([
      this.cleanupDirectory(
        paths.images,
        new Set(detail.images.flatMap((row) => [`${row.imageId}.full`, `${row.imageId}.preview`])),
      ),
      this.cleanupDirectory(
        paths.documents,
        new Set(detail.documents.map((row) => `${row.documentId}.source`)),
      ),
      this.cleanupDirectory(
        paths.responses,
        new Set(detail.providerStateRefs.map((row) => `${row.stateId}.json`)),
      ),
    ])
  }

  rollbackImages(threadId: string, imageIds: ReadonlyArray<string>) {
    const paths = this.paths(uuid.parse(threadId))
    return this.remove(
      imageIds.flatMap((id) => {
        const imageId = uuid.parse(id)
        return [join(paths.images, `${imageId}.full`), join(paths.images, `${imageId}.preview`)]
      }),
    )
  }

  rollbackDocuments(threadId: string, documentIds: ReadonlyArray<string>) {
    const paths = this.paths(uuid.parse(threadId))
    return this.remove(documentIds.map((id) => join(paths.documents, `${uuid.parse(id)}.source`)))
  }

  rollbackResponse(threadId: string, stateId: string) {
    const paths = this.paths(uuid.parse(threadId))
    return this.remove([join(paths.responses, `${uuid.parse(stateId)}.json`)])
  }

  private paths(threadId: string) {
    const thread = join(this.rootPath, 'threads', threadId)
    return {
      images: join(thread, 'images'),
      documents: join(thread, 'documents'),
      responses: join(thread, 'responses'),
      staging: join(thread, '.staging'),
    }
  }

  private async readResponse(threadId: string, ref: ProviderStateRef) {
    return this.readResponsePath(join(this.paths(threadId).responses, `${ref.stateId}.json`), ref)
  }

  private async readResponsePath(filePath: string, ref: ProviderStateRef) {
    const bytes = await this.files.readBytes(
      filePath,
      responsesContinuationLimits.maxSerializedBytes,
    )
    if (bytes.byteLength !== ref.byteLength || sha256(bytes) !== ref.sha256) {
      throw new ThreadLibrarySidecarError('Provider continuation state is unavailable.')
    }
    return parseResponse(bytes)
  }

  private async documentAvailable(
    directory: string,
    row: ThreadLibraryThreadDetail['documents'][number],
  ) {
    try {
      const bytes = await this.files.readBytes(
        join(directory, `${row.documentId}.source`),
        nyxChatDocumentLimits.sourceBytesPerDocument,
      )
      if (bytes.byteLength !== row.byteLength || sha256(bytes) !== row.sourceSha256) return false
      const prefix = new TextDecoder('ascii').decode(bytes.subarray(0, 5))
      if (row.mediaType === 'application/pdf') return prefix === '%PDF-'
      const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)
      return text.length > 0 && !text.includes('\0')
    } catch {
      return false
    }
  }

  private async assertNoImageCapacityOverflow(
    directory: string,
    rows: ReadonlyArray<NewThreadImage>,
  ) {
    let canonical = rows.reduce((total, row) => total + row.image.canonicalBytes.byteLength, 0)
    let previews = rows.reduce((total, row) => total + row.image.previewBytes.byteLength, 0)
    try {
      const names = await this.files.listDirectory(directory)
      for (const name of names) {
        const stat = await this.files.lstat(join(directory, name))
        if (stat.isFile() && !stat.isSymbolicLink()) {
          if (name.endsWith('.full')) canonical += Number(stat.size)
          if (name.endsWith('.preview')) previews += Number(stat.size)
        }
      }
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
    }
    if (
      canonical > nyxChatImageLimits.currentThreadCanonicalBytes ||
      previews > nyxChatImageLimits.currentThreadPreviewBytes
    ) {
      throw new ThreadLibrarySidecarError('Image byte capacity was exceeded.')
    }
  }

  private async cleanupDirectory(directory: string, retained: Set<string>) {
    try {
      const names = await this.files.listDirectory(directory)
      await this.remove(
        names.filter((name) => !retained.has(name)).map((name) => join(directory, name)),
      )
    } catch {
      // Cleanup is best effort; canonical metadata remains authoritative.
    }
  }

  private async assertAbsent(path: string) {
    if (await this.exists(path)) throw new ThreadLibrarySidecarError('Sidecar id already exists.')
  }

  private async exists(path: string) {
    try {
      await this.files.lstat(path)
      return true
    } catch (error) {
      return !(error instanceof Error && 'code' in error && error.code === 'ENOENT')
    }
  }

  private async remove(paths: ReadonlyArray<string>) {
    await Promise.all(
      paths.map(async (path) => {
        try {
          await this.files.remove(path)
        } catch {
          // Canonical metadata or a later reconcile decides whether cleanup is safe.
        }
      }),
    )
  }

  private async removeDirectory(path: string) {
    try {
      await this.files.removeDirectory(path)
    } catch {
      // Staging cleanup is best effort.
    }
  }
}
