import { createHash } from 'node:crypto'
import { deflateSync } from 'node:zlib'

import { describe, expect, it } from 'vitest'

import {
  calculateNyxChatPreviewDimensions,
  parseNyxChatImageFile,
  parseNyxChatImageHeader,
} from '../../../shared/chat/image-file'

const chromiumJpegBase64 =
  '/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDAAIBAQEBAQIBAQECAgICAgQDAgICAgUEBAMEBgUGBgYFBgYGBwkIBgcJBwYGCAsICQoKCgoKBggLDAsKDAkKCgr/2wBDAQICAgICAgUDAwUKBwYHCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgr/wAARCAABAAIDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAABwj/xAAeEQAABQUBAAAAAAAAAAAAAAAAAgRzsgEDBQY1Nv/aAAwDAQACEQMRAD8AjwFvYDhJWyRoADaPTLnrszD/2Q=='

function uint32(value: number) {
  return Uint8Array.from([
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

function concat(...arrays: ReadonlyArray<Uint8Array>) {
  const result = new Uint8Array(arrays.reduce((total, array) => total + array.length, 0))
  let offset = 0

  for (const array of arrays) {
    result.set(array, offset)
    offset += array.length
  }

  return result
}

function jpegSegments(bytes: Uint8Array) {
  const segments: Array<{ marker: number; start: number; end: number }> = []
  let offset = 2

  while (offset + 4 <= bytes.length) {
    const marker = bytes[offset + 1]!
    const end = offset + 2 + bytes[offset + 2]! * 0x100 + bytes[offset + 3]!
    segments.push({ marker, start: offset, end })

    if (marker === 0xda) {
      break
    }
    offset = end
  }

  return segments
}

function changedByte(bytes: Uint8Array, index: number, value?: number) {
  const changed = new Uint8Array(bytes)
  changed[index] = value ?? changed[index]! ^ 1
  return changed
}

function chunk(type: string, data: Uint8Array) {
  const typeBytes = Uint8Array.from([...type].map((character) => character.charCodeAt(0)))
  return concat(uint32(data.length), typeBytes, data, uint32(crc32(concat(typeBytes, data))))
}

export function createTestPng(width: number, height: number, extraChunk?: string) {
  const signature = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = concat(uint32(width), uint32(height), Uint8Array.from([8, 6, 0, 0, 0]))
  const rows = new Uint8Array(height * (1 + width * 4))
  const idat = Uint8Array.from(deflateSync(rows))

  return concat(
    signature,
    chunk('IHDR', ihdr),
    ...(extraChunk ? [chunk(extraChunk, new Uint8Array())] : []),
    chunk('IDAT', idat),
    chunk('IEND', new Uint8Array()),
  )
}

describe('Nyx chat image parser', () => {
  it('parses a strict PNG and rejects metadata or checksum changes', () => {
    const png = createTestPng(2, 1)

    expect(parseNyxChatImageHeader(png)).toMatchObject({
      mediaType: 'image/png',
      width: 2,
      height: 1,
    })
    expect(parseNyxChatImageFile(png)).toMatchObject({
      mediaType: 'image/png',
      width: 2,
      height: 1,
    })
    expect(() => parseNyxChatImageFile(createTestPng(2, 1, 'tEXt'))).toThrow()

    const corrupted = new Uint8Array(png)
    corrupted[29] = corrupted[29]! ^ 1
    expect(() => parseNyxChatImageFile(corrupted)).toThrow()
  })

  it('binds the recorded Chromium JPEG marker and ICC evidence', () => {
    const jpeg = Uint8Array.from(Buffer.from(chromiumJpegBase64, 'base64'))
    const parsed = parseNyxChatImageFile(jpeg)

    expect(parsed).toMatchObject({ mediaType: 'image/jpeg', width: 2, height: 1 })
    expect(createHash('sha256').update(parsed.jpegApp2Payload!).digest('hex')).toBe(
      'c3bb12de30d7357252ec3a5ec781bd2f8a6dd8c69dd7d3de97bbac262d9e1fd4',
    )
    expect(createHash('sha256').update(parsed.jpegIccProfile!).digest('hex')).toBe(
      '12afb4d9953adee0607d347daee5b78b18d6b3cab2d572b88970703f5edb37bc',
    )

    const changedMarker = new Uint8Array(jpeg)
    changedMarker[22] = 0xe1
    expect(() => parseNyxChatImageFile(changedMarker)).toThrow()
  })

  it('rejects changed JFIF, ICC segmentation, marker ordering, and termination', () => {
    const jpeg = Uint8Array.from(Buffer.from(chromiumJpegBase64, 'base64'))
    const segments = jpegSegments(jpeg)
    const app0 = segments.find((segment) => segment.marker === 0xe0)!
    const app2 = segments.find((segment) => segment.marker === 0xe2)!
    const secondDqt = segments.filter((segment) => segment.marker === 0xdb)[1]!
    const reordered = concat(
      jpeg.subarray(0, 2),
      jpeg.subarray(app2.start, app2.end),
      jpeg.subarray(app0.start, app0.end),
      jpeg.subarray(app2.end),
    )
    const splitIcc = concat(
      jpeg.subarray(0, app2.end),
      jpeg.subarray(app2.start, app2.end),
      jpeg.subarray(app2.end),
    )

    for (const changed of [
      changedByte(jpeg, app0.start + 4),
      changedByte(jpeg, app2.start + 4 + 12, 2),
      changedByte(jpeg, app2.start + 4 + 13, 2),
      changedByte(jpeg, secondDqt.start + 1, 0xc4),
      reordered,
      splitIcc,
      jpeg.subarray(0, jpeg.length - 2),
    ]) {
      expect(() => parseNyxChatImageFile(changed)).toThrow()
    }
  })

  it('uses one deterministic non-upscaling preview formula', () => {
    expect(calculateNyxChatPreviewDimensions(3840, 2160)).toEqual({ width: 512, height: 288 })
    expect(calculateNyxChatPreviewDimensions(320, 200)).toEqual({ width: 320, height: 200 })
  })
})
