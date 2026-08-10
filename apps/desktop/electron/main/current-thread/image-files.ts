import { createHash } from 'node:crypto'
import { join } from 'node:path'

import {
  calculateNyxChatPreviewDimensions,
  nyxChatImageLimits,
  parseNyxChatImageFile,
  parseNyxChatImageHeader,
} from '../../../shared/chat/image-file'
import type { NyxChatImageVariant } from '../../../shared/chat/image-url'
import type { NyxChatImageRef, NyxChatNewImage } from '../../../shared/chat/types'
import { createCurrentThreadFileAdapter, type CurrentThreadFileAdapter } from './file-adapter'
import type { CurrentThreadRecord } from './schemas'

const approvedJpegApp2Hash = 'c3bb12de30d7357252ec3a5ec781bd2f8a6dd8c69dd7d3de97bbac262d9e1fd4'
const approvedJpegIccHash = '12afb4d9953adee0607d347daee5b78b18d6b3cab2d572b88970703f5edb37bc'
const storedHeaderBytes = 128 * 1024

export type CurrentThreadImageFilesErrorCode = 'invalid_request' | 'io_error' | 'unavailable'

export class CurrentThreadImageFilesError extends Error {
  constructor(
    readonly code: CurrentThreadImageFilesErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'CurrentThreadImageFilesError'
  }
}

export interface DecodedImageSize {
  width: number
  height: number
}

export type DecodeImageSize = (bytes: Uint8Array) => DecodedImageSize | null

export interface CurrentThreadImageFilesOptions {
  directoryPath: string
  decodeImageSize: DecodeImageSize
  fileAdapter?: CurrentThreadFileAdapter
}

export interface ResolvedCurrentThreadImageFile {
  filePath: string
  mediaType: 'image/png' | 'image/jpeg'
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    const error = new Error('Image import was cancelled.')
    error.name = 'AbortError'
    throw error
  }
}

function sha256(bytes: Uint8Array) {
  return createHash('sha256').update(bytes).digest('hex')
}

function imageRefs(record: CurrentThreadRecord | null) {
  return record?.version === 3 ? record.turns.flatMap((turn) => turn.imageRefs) : []
}

function assertDecodedSize(
  decoded: DecodedImageSize | null,
  expected: { width: number; height: number },
) {
  if (!decoded || decoded.width !== expected.width || decoded.height !== expected.height) {
    throw new CurrentThreadImageFilesError(
      'invalid_request',
      'Image decode dimensions do not match the declared image.',
    )
  }
}

export class CurrentThreadImageFiles {
  private readonly directoryPath: string
  private readonly decodeImageSize: DecodeImageSize
  private readonly fileAdapter: CurrentThreadFileAdapter

  constructor({
    directoryPath,
    decodeImageSize,
    fileAdapter = createCurrentThreadFileAdapter(),
  }: CurrentThreadImageFilesOptions) {
    this.directoryPath = directoryPath
    this.decodeImageSize = decodeImageSize
    this.fileAdapter = fileAdapter
  }

  async writeNewImages({
    record,
    refs,
    images,
    signal,
  }: {
    record: CurrentThreadRecord | null
    refs: ReadonlyArray<NyxChatImageRef>
    images: ReadonlyArray<NyxChatNewImage>
    signal?: AbortSignal
  }) {
    throwIfAborted(signal)
    this.assertPairIdentity(refs, images)
    const existingRefs = imageRefs(record)
    await this.assertCapacity(existingRefs, refs, images)

    for (let index = 0; index < refs.length; index += 1) {
      this.validatePair(refs[index]!, images[index]!)
    }

    await this.fileAdapter.ensureDirectory(this.directoryPath, 0o700)

    for (const ref of refs) {
      const paths = this.paths(ref.imageId)

      if ((await this.exists(paths.full)) || (await this.exists(paths.preview))) {
        throw new CurrentThreadImageFilesError(
          'invalid_request',
          'Image id already exists in the current thread.',
        )
      }
    }

    const committedPaths: string[] = []

    try {
      for (let index = 0; index < refs.length; index += 1) {
        throwIfAborted(signal)
        const ref = refs[index]!
        const image = images[index]!
        const paths = this.paths(ref.imageId)

        await this.writeAtomic(paths.full, image.canonicalBytes)
        committedPaths.push(paths.full)
        throwIfAborted(signal)
        await this.writeAtomic(paths.preview, image.previewBytes)
        committedPaths.push(paths.preview)
      }

      throwIfAborted(signal)
      return refs.map((ref) => ref.imageId)
    } catch (error) {
      await this.removePaths(committedPaths)
      throw error
    }
  }

  async rollbackImages(imageIds: ReadonlyArray<string>) {
    await this.removePaths(
      imageIds.flatMap((imageId) => {
        const paths = this.paths(imageId)
        return [paths.full, paths.preview]
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
      imageRefs(record).flatMap((ref) => [`${ref.imageId}.full`, `${ref.imageId}.preview`]),
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

  async availableImageIds(record: CurrentThreadRecord) {
    const available = new Set<string>()

    for (const ref of imageRefs(record)) {
      if (await this.isPairAvailable(ref)) {
        available.add(ref.imageId)
      }
    }

    return available
  }

  async assertAvailable(refs: ReadonlyArray<NyxChatImageRef>) {
    for (const ref of refs) {
      if (!(await this.isPairAvailable(ref))) {
        throw new CurrentThreadImageFilesError(
          'unavailable',
          'A current-thread image is unavailable.',
        )
      }

      await this.readCanonical(ref)
    }
  }

  async resolveProtocolFile(
    record: CurrentThreadRecord,
    imageId: string,
    variant: NyxChatImageVariant,
  ): Promise<ResolvedCurrentThreadImageFile> {
    const ref = imageRefs(record).find((candidate) => candidate.imageId === imageId)

    if (!ref) {
      throw new CurrentThreadImageFilesError('unavailable', 'Image is not authorized.')
    }

    const filePath = this.paths(imageId)[variant]
    const expected =
      variant === 'preview'
        ? {
            mediaType: 'image/png' as const,
            ...calculateNyxChatPreviewDimensions(ref.width, ref.height),
          }
        : ref

    if (!(await this.isStoredFileAvailable(filePath, expected, this.maximumBytes(variant)))) {
      throw new CurrentThreadImageFilesError('unavailable', 'Image is unavailable.')
    }

    return { filePath, mediaType: expected.mediaType }
  }

  async readCanonical(ref: NyxChatImageRef) {
    const filePath = this.paths(ref.imageId).full

    try {
      if (
        !(await this.isStoredFileAvailable(
          filePath,
          ref,
          nyxChatImageLimits.canonicalBytesPerImage,
        ))
      ) {
        throw new CurrentThreadImageFilesError('unavailable', 'Image is unavailable.')
      }

      const bytes = await this.fileAdapter.readBytes(
        filePath,
        nyxChatImageLimits.canonicalBytesPerImage,
      )
      this.validateCanonical(ref, bytes)
      return bytes
    } catch (error) {
      if (error instanceof CurrentThreadImageFilesError) {
        throw error
      }

      throw new CurrentThreadImageFilesError('unavailable', 'Image is unavailable.')
    }
  }

  private assertPairIdentity(
    refs: ReadonlyArray<NyxChatImageRef>,
    images: ReadonlyArray<NyxChatNewImage>,
  ) {
    if (
      refs.length === 0 ||
      refs.length > nyxChatImageLimits.imagesPerTurn ||
      refs.length !== images.length ||
      refs.some((ref, index) => ref.imageId !== images[index]?.imageId) ||
      new Set(refs.map((ref) => ref.imageId)).size !== refs.length
    ) {
      throw new CurrentThreadImageFilesError(
        'invalid_request',
        'Image refs and payloads must be non-empty, unique, ordered pairs.',
      )
    }
  }

  private async assertCapacity(
    existingRefs: ReadonlyArray<NyxChatImageRef>,
    newRefs: ReadonlyArray<NyxChatImageRef>,
    images: ReadonlyArray<NyxChatNewImage>,
  ) {
    if (
      newRefs.some((newRef) => existingRefs.some((ref) => ref.imageId === newRef.imageId)) ||
      existingRefs.length + newRefs.length > nyxChatImageLimits.currentThreadImages ||
      [...existingRefs, ...newRefs].reduce((total, ref) => total + ref.width * ref.height, 0) >
        nyxChatImageLimits.currentThreadFullPixels ||
      images.reduce((total, image) => total + image.canonicalBytes.byteLength, 0) >
        nyxChatImageLimits.canonicalBytesPerTurn
    ) {
      throw new CurrentThreadImageFilesError('invalid_request', 'Image capacity was exceeded.')
    }

    let canonicalBytes = images.reduce((total, image) => total + image.canonicalBytes.byteLength, 0)
    let previewBytes = images.reduce((total, image) => total + image.previewBytes.byteLength, 0)

    for (const ref of existingRefs) {
      const paths = this.paths(ref.imageId)
      canonicalBytes += await this.regularFileSize(paths.full)
      previewBytes += await this.regularFileSize(paths.preview)
    }

    if (
      canonicalBytes > nyxChatImageLimits.currentThreadCanonicalBytes ||
      previewBytes > nyxChatImageLimits.currentThreadPreviewBytes
    ) {
      throw new CurrentThreadImageFilesError('invalid_request', 'Image byte capacity was exceeded.')
    }
  }

  private validatePair(ref: NyxChatImageRef, image: NyxChatNewImage) {
    if (ref.width * ref.height > nyxChatImageLimits.newImagePixelsPerImage) {
      throw new CurrentThreadImageFilesError(
        'invalid_request',
        'Image pixel capacity was exceeded.',
      )
    }

    this.validateCanonical(ref, image.canonicalBytes)

    if (
      image.previewBytes.byteLength === 0 ||
      image.previewBytes.byteLength > nyxChatImageLimits.previewBytesPerImage
    ) {
      throw new CurrentThreadImageFilesError('invalid_request', 'Image preview size is invalid.')
    }

    const preview = this.parseFile(image.previewBytes)
    const expectedPreview = calculateNyxChatPreviewDimensions(ref.width, ref.height)

    if (
      preview.mediaType !== 'image/png' ||
      preview.width !== expectedPreview.width ||
      preview.height !== expectedPreview.height ||
      preview.width * preview.height > nyxChatImageLimits.previewPixelsPerImage
    ) {
      throw new CurrentThreadImageFilesError(
        'invalid_request',
        'Image preview does not match the canonical image.',
      )
    }

    assertDecodedSize(this.decodeImageSize(image.previewBytes), expectedPreview)
  }

  private validateCanonical(ref: NyxChatImageRef, bytes: Uint8Array) {
    if (bytes.byteLength === 0 || bytes.byteLength > nyxChatImageLimits.canonicalBytesPerImage) {
      throw new CurrentThreadImageFilesError('invalid_request', 'Canonical image size is invalid.')
    }

    const parsed = this.parseFile(bytes)

    if (
      parsed.mediaType !== ref.mediaType ||
      parsed.width !== ref.width ||
      parsed.height !== ref.height ||
      ref.width > nyxChatImageLimits.fullMaxEdge ||
      ref.height > nyxChatImageLimits.fullMaxEdge ||
      ref.width * ref.height > nyxChatImageLimits.fullPixelsPerImage
    ) {
      throw new CurrentThreadImageFilesError(
        'invalid_request',
        'Canonical image does not match its reference.',
      )
    }

    if (
      parsed.mediaType === 'image/jpeg' &&
      (!parsed.jpegApp2Payload ||
        !parsed.jpegIccProfile ||
        sha256(parsed.jpegApp2Payload) !== approvedJpegApp2Hash ||
        sha256(parsed.jpegIccProfile) !== approvedJpegIccHash)
    ) {
      throw new CurrentThreadImageFilesError(
        'invalid_request',
        'JPEG ICC profile is not the approved canonical form.',
      )
    }

    assertDecodedSize(this.decodeImageSize(bytes), ref)
  }

  private parseFile(bytes: Uint8Array) {
    try {
      return parseNyxChatImageFile(bytes)
    } catch {
      throw new CurrentThreadImageFilesError('invalid_request', 'Image file is invalid.')
    }
  }

  private async isPairAvailable(ref: NyxChatImageRef) {
    const paths = this.paths(ref.imageId)
    const preview = calculateNyxChatPreviewDimensions(ref.width, ref.height)

    return (
      (await this.isStoredFileAvailable(
        paths.full,
        ref,
        nyxChatImageLimits.canonicalBytesPerImage,
      )) &&
      (await this.isStoredFileAvailable(
        paths.preview,
        { mediaType: 'image/png', ...preview },
        nyxChatImageLimits.previewBytesPerImage,
      ))
    )
  }

  private async isStoredFileAvailable(
    filePath: string,
    expected: { mediaType: 'image/png' | 'image/jpeg'; width: number; height: number },
    maximumBytes: number,
  ) {
    try {
      const fileStat = await this.fileAdapter.lstat(filePath)

      if (
        !fileStat.isFile() ||
        fileStat.isSymbolicLink() ||
        fileStat.size <= 0 ||
        fileStat.size > maximumBytes
      ) {
        return false
      }

      const header = parseNyxChatImageHeader(
        await this.fileAdapter.readPrefix(
          filePath,
          maximumBytes,
          Math.min(storedHeaderBytes, maximumBytes),
        ),
      )

      return (
        header.mediaType === expected.mediaType &&
        header.width === expected.width &&
        header.height === expected.height
      )
    } catch {
      return false
    }
  }

  private paths(imageId: string) {
    return {
      full: join(this.directoryPath, `${imageId}.full`),
      preview: join(this.directoryPath, `${imageId}.preview`),
    }
  }

  private maximumBytes(variant: NyxChatImageVariant) {
    return variant === 'full'
      ? nyxChatImageLimits.canonicalBytesPerImage
      : nyxChatImageLimits.previewBytesPerImage
  }

  private async exists(filePath: string) {
    try {
      await this.fileAdapter.lstat(filePath)
      return true
    } catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        return false
      }
      throw new CurrentThreadImageFilesError('io_error', 'Could not inspect image storage.')
    }
  }

  private async regularFileSize(filePath: string) {
    try {
      const fileStat = await this.fileAdapter.lstat(filePath)
      return fileStat.isFile() && !fileStat.isSymbolicLink() ? Number(fileStat.size) : 0
    } catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        return 0
      }
      throw new CurrentThreadImageFilesError('io_error', 'Could not inspect image storage.')
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

      throw new CurrentThreadImageFilesError('io_error', 'Could not write image storage.')
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
