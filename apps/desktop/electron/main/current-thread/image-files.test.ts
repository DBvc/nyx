import { mkdir, mkdtemp, readFile, rm, stat, symlink, truncate, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { deflateSync } from 'node:zlib'

import { afterEach, describe, expect, it } from 'vitest'

import { nyxChatImageLimits, parseNyxChatImageHeader } from '../../../shared/chat/image-file'
import { createCurrentThreadFileAdapter } from './file-adapter'
import { CurrentThreadImageFiles } from './image-files'
import { parseCurrentThreadRecordV3, parseCurrentThreadRecordV4 } from './schemas'

const png = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAEklEQVR4AWJ65Or637b6wX8AAAAA//9pZw09AAAABklEQVQDABTLBQX5/tLNAAAAAElFTkSuQmCC',
    'base64',
  ),
)
const jpeg = Uint8Array.from(
  Buffer.from(
    '/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDAAIBAQEBAQIBAQECAgICAgQDAgICAgUEBAMEBgUGBgYFBgYGBwkIBgcJBwYGCAsICQoKCgoKBggLDAsKDAkKCgr/2wBDAQICAgICAgUDAwUKBwYHCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgr/wAARCAABAAIDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAABwj/xAAeEQAABQUBAAAAAAAAAAAAAAAAAgRzsgEDBQY1Nv/aAAwDAQACEQMRAD8AjwFvYDhJWyRoADaPTLnrszD/2Q==',
    'base64',
  ),
)
const imageId = '00000000-0000-4000-8000-000000000001'
const pngRef = { imageId, mediaType: 'image/png', width: 2, height: 1 } as const
const jpegRef = { imageId, mediaType: 'image/jpeg', width: 2, height: 1 } as const
const tempDirs: string[] = []

function uint32(value: number) {
  return Buffer.from([
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ])
}

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff

  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
    }
  }

  return (crc ^ 0xffffffff) >>> 0
}

function pngChunk(type: string, data: Uint8Array) {
  const typeBytes = Buffer.from(type)
  return Buffer.concat([
    uint32(data.length),
    typeBytes,
    data,
    uint32(crc32(Buffer.concat([typeBytes, data]))),
  ])
}

function createDecodablePng(width: number, height: number) {
  const rowBytes = Math.ceil(width / 8)
  const raw = Buffer.alloc(height * (rowBytes + 1))
  let state = 0x4e595845

  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < rowBytes; column += 1) {
      state ^= state << 13
      state ^= state >>> 17
      state ^= state << 5
      raw[row * (rowBytes + 1) + 1 + column] = state & 0xff
    }
  }

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', Buffer.concat([uint32(width), uint32(height), Buffer.from([1, 0, 0, 0, 0])])),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

const boundaryPng = createDecodablePng(2048, 2048)
const boundaryPreviewPng = createDecodablePng(512, 512)
const historicalLargePng = createDecodablePng(2049, 2048)

function refAt(index: number, width = 2, height = 1) {
  return {
    ...pngRef,
    imageId: `00000000-0000-4000-8000-${index.toString().padStart(12, '0')}`,
    width,
    height,
  } as const
}

function recordWithImage(ref = pngRef) {
  return parseCurrentThreadRecordV3({
    version: 3,
    threadId: 'thread-1',
    turns: [
      {
        attemptRequestId: 'request-1',
        userMessageId: 'user-1',
        assistantMessageId: 'assistant-1',
        userContent: '',
        imageRefs: [ref],
        assistantContent: 'Done',
        assistantStatus: 'completed',
        error: null,
        targetBinding: {
          selection: { kind: 'env_fallback' },
          attribution: { kind: 'env_fallback', modelId: 'model' },
        },
        createdAt: '2026-08-09T00:00:00.000Z',
        updatedAt: '2026-08-09T00:00:00.000Z',
      },
    ],
    createdAt: '2026-08-09T00:00:00.000Z',
    updatedAt: '2026-08-09T00:00:00.000Z',
  })
}

async function createImages(
  fileAdapter = createCurrentThreadFileAdapter(),
  decodeImageSize = (bytes: Uint8Array) => {
    const parsed = parseNyxChatImageHeader(bytes)
    return { width: parsed.width, height: parsed.height }
  },
) {
  const directoryPath = await mkdtemp(join(tmpdir(), 'nyx-current-thread-images-'))
  tempDirs.push(directoryPath)

  return {
    directoryPath,
    images: new CurrentThreadImageFiles({
      directoryPath,
      decodeImageSize,
      fileAdapter,
    }),
  }
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  )
})

describe('CurrentThreadImageFiles', () => {
  it('writes immutable pairs, projects availability, serves bounded paths, and resets', async () => {
    const { directoryPath, images } = await createImages()

    await expect(
      images.writeNewImages({
        record: null,
        refs: [pngRef],
        images: [{ imageId, canonicalBytes: png, previewBytes: png }],
      }),
    ).resolves.toEqual([imageId])

    const fullPath = join(directoryPath, `${imageId}.full`)
    const previewPath = join(directoryPath, `${imageId}.preview`)
    expect((await stat(directoryPath)).mode & 0o777).toBe(0o700)
    expect((await stat(fullPath)).mode & 0o777).toBe(0o600)
    expect((await stat(previewPath)).mode & 0o777).toBe(0o600)
    await expect(images.availableImageIds(recordWithImage())).resolves.toEqual(new Set([imageId]))
    await expect(
      images.resolveProtocolFile(recordWithImage(), imageId, 'preview'),
    ).resolves.toEqual({
      filePath: previewPath,
      mediaType: 'image/png',
    })
    await expect(images.readCanonical(pngRef)).resolves.toEqual(png)

    await writeFile(join(directoryPath, 'orphan.full'), png)
    await images.reconcile(recordWithImage())
    await expect(readFile(fullPath)).resolves.toEqual(Buffer.from(png))
    await expect(stat(join(directoryPath, 'orphan.full'))).rejects.toMatchObject({ code: 'ENOENT' })

    await images.reset()
    await expect(stat(directoryPath)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('keeps version-4 image authorization intact', async () => {
    const { images } = await createImages()
    await images.writeNewImages({
      record: null,
      refs: [pngRef],
      images: [{ imageId, canonicalBytes: png, previewBytes: png }],
    })
    const v3 = recordWithImage()
    const v4 = parseCurrentThreadRecordV4({
      ...v3,
      version: 4,
      turns: v3.turns.map((turn) => ({ ...turn, documentRefs: [] })),
    })

    await expect(images.readCanonical(v4.turns[0]!.imageRefs[0]!)).resolves.toEqual(png)
    await expect(images.availableImageIds(v4)).resolves.toEqual(new Set([imageId]))
  })

  it('accepts only the sealed Chromium JPEG ICC and rejects a changed profile', async () => {
    const { images } = await createImages()

    await expect(
      images.writeNewImages({
        record: null,
        refs: [jpegRef],
        images: [{ imageId, canonicalBytes: jpeg, previewBytes: png }],
      }),
    ).resolves.toEqual([imageId])

    await images.reset()
    const changedJpeg = new Uint8Array(jpeg)
    changedJpeg[100] = changedJpeg[100]! ^ 1

    await expect(
      images.writeNewImages({
        record: null,
        refs: [jpegRef],
        images: [{ imageId, canonicalBytes: changedJpeg, previewBytes: png }],
      }),
    ).rejects.toMatchObject({ code: 'invalid_request' })
  })

  it('limits new images to 4 MiPixels without changing historical reads', async () => {
    const { directoryPath, images } = await createImages()
    const boundaryRef = refAt(2, 2048, 2048)

    await expect(
      images.writeNewImages({
        record: null,
        refs: [boundaryRef],
        images: [
          {
            imageId: boundaryRef.imageId,
            canonicalBytes: boundaryPng,
            previewBytes: boundaryPreviewPng,
          },
        ],
      }),
    ).resolves.toEqual([boundaryRef.imageId])

    await images.reset()
    const historicalRef = refAt(3, 2049, 2048)

    await expect(
      images.writeNewImages({
        record: null,
        refs: [historicalRef],
        images: [
          {
            imageId: historicalRef.imageId,
            canonicalBytes: png,
            previewBytes: png,
          },
        ],
      }),
    ).rejects.toMatchObject({ code: 'invalid_request' })

    await mkdir(directoryPath, { recursive: true })
    await writeFile(join(directoryPath, `${historicalRef.imageId}.full`), historicalLargePng)
    await expect(images.readCanonical(historicalRef)).resolves.toEqual(
      Uint8Array.from(historicalLargePng),
    )
  })

  it('removes a committed full file when the preview rename fails', async () => {
    const baseAdapter = createCurrentThreadFileAdapter()
    let renameCount = 0
    const adapter = {
      ...baseAdapter,
      rename: async (...arguments_: Parameters<typeof baseAdapter.rename>) => {
        renameCount += 1
        if (renameCount === 2) {
          throw new Error('preview rename failed')
        }
        await baseAdapter.rename(...arguments_)
      },
    }
    const { directoryPath, images } = await createImages(adapter)

    await expect(
      images.writeNewImages({
        record: null,
        refs: [pngRef],
        images: [{ imageId, canonicalBytes: png, previewBytes: png }],
      }),
    ).rejects.toMatchObject({ code: 'io_error' })
    await expect(stat(join(directoryPath, `${imageId}.full`))).rejects.toMatchObject({
      code: 'ENOENT',
    })
    await expect(stat(join(directoryPath, `${imageId}.preview`))).rejects.toMatchObject({
      code: 'ENOENT',
    })
  })

  it('fails closed on symlinks and durable capacity before reading image bytes', async () => {
    const { directoryPath, images } = await createImages()
    const outsidePath = join(directoryPath, 'outside.png')
    await writeFile(outsidePath, png)
    await symlink(outsidePath, join(directoryPath, `${imageId}.full`))
    await writeFile(join(directoryPath, `${imageId}.preview`), png)

    await expect(images.availableImageIds(recordWithImage())).resolves.toEqual(new Set())
    await expect(images.readCanonical(pngRef)).rejects.toMatchObject({ code: 'unavailable' })
    await expect(
      images.writeNewImages({
        record: recordWithImage(),
        refs: [pngRef],
        images: [{ imageId, canonicalBytes: png, previewBytes: png }],
      }),
    ).rejects.toMatchObject({ code: 'invalid_request' })

    const fullRecord = parseCurrentThreadRecordV3({
      ...recordWithImage(),
      turns: Array.from({ length: 12 }, (_, index) => ({
        ...recordWithImage().turns[0]!,
        attemptRequestId: `request-${index}`,
        userMessageId: `user-${index}`,
        assistantMessageId: `assistant-${index}`,
        imageRefs: [
          {
            ...pngRef,
            imageId: `00000000-0000-4000-8000-${index.toString().padStart(12, '0')}`,
          },
        ],
      })),
    })

    await expect(
      images.writeNewImages({
        record: fullRecord,
        refs: [{ ...pngRef, imageId: '00000000-0000-4000-8000-000000000099' }],
        images: [
          {
            imageId: '00000000-0000-4000-8000-000000000099',
            canonicalBytes: png,
            previewBytes: png,
          },
        ],
      }),
    ).rejects.toMatchObject({ code: 'invalid_request' })
  })

  it('rejects unsafe or corrupt canonical files before Retry acceptance', async () => {
    const { directoryPath, images } = await createImages()
    await images.writeNewImages({
      record: null,
      refs: [pngRef],
      images: [{ imageId, canonicalBytes: png, previewBytes: png }],
    })
    const fullPath = join(directoryPath, `${imageId}.full`)

    await writeFile(fullPath, png.subarray(0, 24))
    await expect(images.assertAvailable([pngRef])).rejects.toBeDefined()

    const corruptCrc = new Uint8Array(png)
    corruptCrc[40] = corruptCrc[40]! ^ 1
    await writeFile(fullPath, corruptCrc)
    await expect(images.assertAvailable([pngRef])).rejects.toBeDefined()

    await writeFile(fullPath, jpeg)
    await expect(images.assertAvailable([pngRef])).rejects.toBeDefined()

    await writeFile(fullPath, new Uint8Array())
    await expect(images.assertAvailable([pngRef])).rejects.toBeDefined()

    await writeFile(fullPath, png)
    await truncate(fullPath, nyxChatImageLimits.canonicalBytesPerImage + 1)
    await expect(images.assertAvailable([pngRef])).rejects.toBeDefined()

    await rm(fullPath)
    await mkdir(fullPath)
    await expect(images.assertAvailable([pngRef])).rejects.toBeDefined()
  })

  it('rejects native decode dimensions that disagree with strict file metadata', async () => {
    const { images } = await createImages(createCurrentThreadFileAdapter(), () => ({
      width: 1,
      height: 1,
    }))

    await expect(
      images.writeNewImages({
        record: null,
        refs: [pngRef],
        images: [{ imageId, canonicalBytes: png, previewBytes: png }],
      }),
    ).rejects.toMatchObject({ code: 'invalid_request' })
  })

  it('enforces per-turn and current-thread count, byte, and pixel limits', async () => {
    const { directoryPath, images } = await createImages()
    const fiveRefs = Array.from({ length: 5 }, (_, index) => refAt(index + 10))

    await expect(
      images.writeNewImages({
        record: null,
        refs: fiveRefs,
        images: fiveRefs.map((ref) => ({
          imageId: ref.imageId,
          canonicalBytes: png,
          previewBytes: png,
        })),
      }),
    ).rejects.toMatchObject({ code: 'invalid_request' })

    const sixMiB = new Uint8Array(6 * 1024 * 1024)
    const threeRefs = Array.from({ length: 3 }, (_, index) => refAt(index + 20))
    await expect(
      images.writeNewImages({
        record: null,
        refs: threeRefs,
        images: threeRefs.map((ref) => ({
          imageId: ref.imageId,
          canonicalBytes: sixMiB,
          previewBytes: png,
        })),
      }),
    ).rejects.toMatchObject({ code: 'invalid_request' })

    const pixelRefs = Array.from({ length: 3 }, (_, index) => refAt(index + 30, 3840, 2160))
    const pixelRecord = parseCurrentThreadRecordV3({
      ...recordWithImage(),
      turns: [{ ...recordWithImage().turns[0]!, imageRefs: pixelRefs }],
    })
    await expect(
      images.writeNewImages({
        record: pixelRecord,
        refs: [refAt(40)],
        images: [{ imageId: refAt(40).imageId, canonicalBytes: png, previewBytes: png }],
      }),
    ).rejects.toMatchObject({ code: 'invalid_request' })

    const byteRefs = Array.from({ length: 4 }, (_, index) => refAt(index + 50))
    const byteRecord = parseCurrentThreadRecordV3({
      ...recordWithImage(),
      turns: [{ ...recordWithImage().turns[0]!, imageRefs: byteRefs }],
    })
    await mkdir(directoryPath, { recursive: true })
    for (const ref of byteRefs) {
      const fullPath = join(directoryPath, `${ref.imageId}.full`)
      await writeFile(fullPath, png)
      await truncate(fullPath, 7 * 1024 * 1024)
      await writeFile(join(directoryPath, `${ref.imageId}.preview`), png)
    }
    const nextRef = refAt(60)
    await expect(
      images.writeNewImages({
        record: byteRecord,
        refs: [nextRef],
        images: [{ imageId: nextRef.imageId, canonicalBytes: sixMiB, previewBytes: png }],
      }),
    ).rejects.toMatchObject({ code: 'invalid_request' })
  })
})
