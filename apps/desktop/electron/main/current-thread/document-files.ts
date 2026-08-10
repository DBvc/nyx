import { createHash } from 'node:crypto'
import { join } from 'node:path'

import { isNyxChatDocumentName, nyxChatDocumentLimits } from '../../../shared/chat/document-file'
import type { NyxChatDocumentRef, NyxChatNewDocument } from '../../../shared/chat/types'
import { createCurrentThreadFileAdapter, type CurrentThreadFileAdapter } from './file-adapter'
import type { CurrentThreadDocumentRefV4, CurrentThreadRecord } from './schemas'

export type CurrentThreadDocumentFilesErrorCode = 'invalid_request' | 'io_error' | 'unavailable'

export class CurrentThreadDocumentFilesError extends Error {
  constructor(
    readonly code: CurrentThreadDocumentFilesErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'CurrentThreadDocumentFilesError'
  }
}

export interface CurrentThreadDocumentFilesOptions {
  directoryPath: string
  fileAdapter?: CurrentThreadFileAdapter
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    const error = new Error('Document import was cancelled.')
    error.name = 'AbortError'
    throw error
  }
}

function sha256(bytes: Uint8Array) {
  return createHash('sha256').update(bytes).digest('hex')
}

function documentRefs(record: CurrentThreadRecord | null) {
  return record?.version === 4 ? record.turns.flatMap((turn) => turn.documentRefs) : []
}

function decodeText(bytes: Uint8Array) {
  let text: string

  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw new CurrentThreadDocumentFilesError('invalid_request', 'Document text is not UTF-8.')
  }

  if (text.length === 0 || text.includes('\0')) {
    throw new CurrentThreadDocumentFilesError(
      'invalid_request',
      'Document text is empty or invalid.',
    )
  }

  return text
}

function bytesEqual(left: Uint8Array, right: Uint8Array) {
  return left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index])
}

export class CurrentThreadDocumentFiles {
  private readonly directoryPath: string
  private readonly fileAdapter: CurrentThreadFileAdapter

  constructor({
    directoryPath,
    fileAdapter = createCurrentThreadFileAdapter(),
  }: CurrentThreadDocumentFilesOptions) {
    this.directoryPath = directoryPath
    this.fileAdapter = fileAdapter
  }

  async writeNewDocuments({
    record,
    refs,
    documents,
    signal,
  }: {
    record: CurrentThreadRecord | null
    refs: ReadonlyArray<NyxChatDocumentRef>
    documents: ReadonlyArray<NyxChatNewDocument>
    signal?: AbortSignal
  }) {
    throwIfAborted(signal)
    this.assertPairIdentity(refs, documents)

    const existingRefs = documentRefs(record)
    if (
      existingRefs.length + refs.length > nyxChatDocumentLimits.currentThreadDocuments ||
      existingRefs.reduce((total, ref) => total + ref.extractedByteLength, 0) +
        refs.reduce((total, ref) => total + ref.extractedByteLength, 0) >
        nyxChatDocumentLimits.currentThreadExtractedBytes ||
      refs.some((ref) => existingRefs.some((existing) => existing.documentId === ref.documentId))
    ) {
      throw new CurrentThreadDocumentFilesError(
        'invalid_request',
        'Document capacity was exceeded.',
      )
    }

    const storedRefs = refs.map((ref, index) => this.validatePair(ref, documents[index]!))
    await this.fileAdapter.ensureDirectory(this.directoryPath, 0o700)

    for (const ref of refs) {
      const paths = this.paths(ref.documentId)
      if ((await this.exists(paths.source)) || (await this.exists(paths.text))) {
        throw new CurrentThreadDocumentFilesError(
          'invalid_request',
          'Document id already exists in the current thread.',
        )
      }
    }

    const committedPaths: string[] = []

    try {
      for (let index = 0; index < refs.length; index += 1) {
        throwIfAborted(signal)
        const paths = this.paths(refs[index]!.documentId)
        const document = documents[index]!
        await this.writeAtomic(paths.source, document.sourceBytes)
        committedPaths.push(paths.source)
        throwIfAborted(signal)
        await this.writeAtomic(paths.text, document.extractedTextBytes)
        committedPaths.push(paths.text)
      }

      throwIfAborted(signal)
      return storedRefs
    } catch (error) {
      await this.removePaths(committedPaths)
      throw error
    }
  }

  async rollbackDocuments(documentIds: ReadonlyArray<string>) {
    await this.removePaths(
      documentIds.flatMap((documentId) => {
        const paths = this.paths(documentId)
        return [paths.source, paths.text]
      }),
    )
  }

  async reconcile(record: CurrentThreadRecord | null) {
    if (!record) {
      try {
        await this.fileAdapter.removeDirectory(this.directoryPath)
      } catch {
        // An unreachable orphan does not block the current thread.
      }
      return
    }

    const retainedNames = new Set(
      documentRefs(record).flatMap((ref) => [`${ref.documentId}.source`, `${ref.documentId}.text`]),
    )
    let names: string[]

    try {
      names = await this.fileAdapter.listDirectory(this.directoryPath)
    } catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        return
      }
      return
    }

    await this.removePaths(
      names
        .filter((name) => !retainedNames.has(name))
        .map((name) => join(this.directoryPath, name)),
    )
  }

  async reset() {
    await this.fileAdapter.removeDirectory(this.directoryPath)
  }

  rawBytes(record: CurrentThreadRecord | null) {
    return documentRefs(record).reduce((total, ref) => total + ref.byteLength, 0)
  }

  async availableDocumentIds(record: CurrentThreadRecord) {
    const available = new Set<string>()

    for (const ref of documentRefs(record)) {
      if (
        (await this.isStoredFileAvailable(this.paths(ref.documentId).source, ref.byteLength)) &&
        (await this.isStoredFileAvailable(this.paths(ref.documentId).text, ref.extractedByteLength))
      ) {
        available.add(ref.documentId)
      }
    }

    return available
  }

  async assertAvailable(refs: ReadonlyArray<CurrentThreadDocumentRefV4>) {
    for (const ref of refs) {
      const paths = this.paths(ref.documentId)

      try {
        if (!(await this.isStoredFileAvailable(paths.source, ref.byteLength))) {
          throw new Error('Document source sidecar mismatch.')
        }

        const text = await this.fileAdapter.readBytes(
          paths.text,
          nyxChatDocumentLimits.extractedBytesPerDocument,
        )

        if (
          text.byteLength !== ref.extractedByteLength ||
          sha256(text) !== ref.extractedTextSha256
        ) {
          throw new Error('Document sidecar mismatch.')
        }

        decodeText(text)
      } catch {
        throw new CurrentThreadDocumentFilesError(
          'unavailable',
          'A current-thread document is unavailable.',
        )
      }
    }
  }

  private assertPairIdentity(
    refs: ReadonlyArray<NyxChatDocumentRef>,
    documents: ReadonlyArray<NyxChatNewDocument>,
  ) {
    if (
      refs.length === 0 ||
      refs.length > nyxChatDocumentLimits.documentsPerTurn ||
      refs.length !== documents.length ||
      refs.some((ref, index) => ref.documentId !== documents[index]?.documentId) ||
      new Set(refs.map((ref) => ref.documentId)).size !== refs.length
    ) {
      throw new CurrentThreadDocumentFilesError(
        'invalid_request',
        'Document refs and payloads must be non-empty, unique, ordered pairs.',
      )
    }
  }

  private validatePair(
    ref: NyxChatDocumentRef,
    document: NyxChatNewDocument,
  ): CurrentThreadDocumentRefV4 {
    if (
      !isNyxChatDocumentName(ref.name, ref.mediaType) ||
      ref.byteLength !== document.sourceBytes.byteLength ||
      ref.extractedByteLength !== document.extractedTextBytes.byteLength ||
      ref.byteLength <= 0 ||
      ref.byteLength > nyxChatDocumentLimits.sourceBytesPerDocument ||
      ref.extractedByteLength <= 0 ||
      ref.extractedByteLength > nyxChatDocumentLimits.extractedBytesPerDocument
    ) {
      throw new CurrentThreadDocumentFilesError('invalid_request', 'Document metadata is invalid.')
    }

    const sourceSha256 = sha256(document.sourceBytes)
    if (document.extractedFromSha256 !== sourceSha256) {
      throw new CurrentThreadDocumentFilesError(
        'invalid_request',
        'Document source digest does not match the extracted text.',
      )
    }

    this.validateSource(ref, document.sourceBytes)
    decodeText(document.extractedTextBytes)

    if (
      ref.mediaType !== 'application/pdf' &&
      !bytesEqual(document.sourceBytes, document.extractedTextBytes)
    ) {
      throw new CurrentThreadDocumentFilesError(
        'invalid_request',
        'Text document extraction must match its source.',
      )
    }

    return {
      ...ref,
      sourceSha256,
      extractedTextSha256: sha256(document.extractedTextBytes),
    }
  }

  private validateSource(ref: Pick<NyxChatDocumentRef, 'mediaType'>, bytes: Uint8Array) {
    if (ref.mediaType === 'application/pdf') {
      if (new TextDecoder('ascii').decode(bytes.subarray(0, 5)) !== '%PDF-') {
        throw new CurrentThreadDocumentFilesError('invalid_request', 'PDF signature is invalid.')
      }
      return
    }

    decodeText(bytes)
  }

  private paths(documentId: string) {
    return {
      source: join(this.directoryPath, `${documentId}.source`),
      text: join(this.directoryPath, `${documentId}.text`),
    }
  }

  private async exists(filePath: string) {
    try {
      await this.fileAdapter.lstat(filePath)
      return true
    } catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        return false
      }
      throw new CurrentThreadDocumentFilesError('io_error', 'Could not inspect document storage.')
    }
  }

  private async isStoredFileAvailable(filePath: string, exactBytes: number) {
    try {
      const fileStat = await this.fileAdapter.lstat(filePath)
      return fileStat.isFile() && !fileStat.isSymbolicLink() && fileStat.size === exactBytes
    } catch {
      return false
    }
  }

  private async writeAtomic(filePath: string, bytes: Uint8Array) {
    const tempPath = this.fileAdapter.createTempPath(filePath)

    try {
      await this.fileAdapter.writeBytes(tempPath, bytes, 0o600)
      await this.fileAdapter.rename(tempPath, filePath)
    } catch {
      try {
        await this.fileAdapter.remove(tempPath)
      } catch {
        // Preserve the write failure; an unreachable temp is reconciled later.
      }
      throw new CurrentThreadDocumentFilesError('io_error', 'Could not write document storage.')
    }
  }

  private async removePaths(paths: ReadonlyArray<string>) {
    await Promise.all(
      paths.map(async (filePath) => {
        try {
          await this.fileAdapter.remove(filePath)
        } catch {
          // Cleanup is best effort; unreachable files are reconciled later.
        }
      }),
    )
  }
}
