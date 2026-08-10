import type { NyxChatImageMediaType } from './types'

export const nyxChatImageLimits = {
  imagesPerTurn: 4,
  canonicalBytesPerImage: 8 * 1024 * 1024,
  previewBytesPerImage: 1024 * 1024,
  canonicalBytesPerTurn: 16 * 1024 * 1024,
  currentThreadCanonicalBytes: 32 * 1024 * 1024,
  currentThreadPreviewBytes: 12 * 1024 * 1024,
  currentThreadImages: 12,
  currentThreadFullPixels: 24_883_200,
  newImagePixelsPerImage: 4_194_304,
  fullPixelsPerImage: 8_294_400,
  fullMaxEdge: 8192,
  previewMaxEdge: 512,
  previewPixelsPerImage: 262_144,
} as const

export interface ParsedNyxChatImageFile {
  mediaType: NyxChatImageMediaType
  width: number
  height: number
  jpegApp2Payload?: Uint8Array
  jpegIccProfile?: Uint8Array
}

export class NyxChatImageFileError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NyxChatImageFileError'
  }
}

const pngSignature = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])
const jpegStart = Uint8Array.from([0xff, 0xd8])
const jpegApp0Payload = Uint8Array.from([
  0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
])
const jpegIccPrefix = Uint8Array.from([
  0x49, 0x43, 0x43, 0x5f, 0x50, 0x52, 0x4f, 0x46, 0x49, 0x4c, 0x45, 0x00,
])

function fail(message: string): never {
  throw new NyxChatImageFileError(message)
}

function bytesEqual(left: Uint8Array, right: Uint8Array) {
  return left.length === right.length && left.every((byte, index) => byte === right[index])
}

function readUint32(bytes: Uint8Array, offset: number) {
  if (offset + 4 > bytes.length) {
    fail('Image data is truncated.')
  }

  return (
    bytes[offset]! * 0x1000000 +
    bytes[offset + 1]! * 0x10000 +
    bytes[offset + 2]! * 0x100 +
    bytes[offset + 3]!
  )
}

function readUint16(bytes: Uint8Array, offset: number) {
  if (offset + 2 > bytes.length) {
    fail('Image data is truncated.')
  }

  return bytes[offset]! * 0x100 + bytes[offset + 1]!
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

function parsePngHeader(bytes: Uint8Array): ParsedNyxChatImageFile {
  if (bytes.length < 24 || !bytesEqual(bytes.subarray(0, 8), pngSignature)) {
    fail('Image is not a PNG or JPEG file.')
  }

  if (readUint32(bytes, 8) !== 13 || String.fromCharCode(...bytes.subarray(12, 16)) !== 'IHDR') {
    fail('PNG must begin with one IHDR chunk.')
  }

  const width = readUint32(bytes, 16)
  const height = readUint32(bytes, 20)

  if (width === 0 || height === 0) {
    fail('Image dimensions must be positive.')
  }

  return { mediaType: 'image/png', width, height }
}

function parsePngFile(bytes: Uint8Array): ParsedNyxChatImageFile {
  const header = parsePngHeader(bytes)
  let offset = 8
  let chunkIndex = 0
  let sawIdat = false
  let sawIend = false

  while (offset < bytes.length) {
    const length = readUint32(bytes, offset)
    const typeOffset = offset + 4
    const dataOffset = typeOffset + 4
    const crcOffset = dataOffset + length
    const nextOffset = crcOffset + 4

    if (nextOffset > bytes.length) {
      fail('PNG chunk is truncated.')
    }

    const type = String.fromCharCode(...bytes.subarray(typeOffset, dataOffset))
    const expectedCrc = readUint32(bytes, crcOffset)
    const actualCrc = crc32(bytes.subarray(typeOffset, crcOffset))

    if (expectedCrc !== actualCrc) {
      fail('PNG chunk checksum is invalid.')
    }

    if (chunkIndex === 0) {
      if (type !== 'IHDR' || length !== 13) {
        fail('PNG must begin with one IHDR chunk.')
      }

      const bitDepth = bytes[dataOffset + 8]
      const colorType = bytes[dataOffset + 9]
      const validBitDepth =
        (colorType === 0 && [1, 2, 4, 8, 16].includes(bitDepth!)) ||
        (colorType === 2 && [8, 16].includes(bitDepth!)) ||
        (colorType === 3 && [1, 2, 4, 8].includes(bitDepth!)) ||
        ((colorType === 4 || colorType === 6) && [8, 16].includes(bitDepth!))

      if (
        !validBitDepth ||
        bytes[dataOffset + 10] !== 0 ||
        bytes[dataOffset + 11] !== 0 ||
        (bytes[dataOffset + 12] !== 0 && bytes[dataOffset + 12] !== 1)
      ) {
        fail('PNG IHDR is invalid.')
      }
    } else if (type === 'IDAT' && !sawIend) {
      sawIdat = true
    } else if (type === 'IEND' && sawIdat && length === 0) {
      sawIend = true

      if (nextOffset !== bytes.length) {
        fail('PNG must end after IEND.')
      }
    } else {
      fail('PNG contains unsupported chunks or chunk ordering.')
    }

    offset = nextOffset
    chunkIndex += 1
  }

  if (!sawIdat || !sawIend) {
    fail('PNG must contain IDAT and IEND chunks.')
  }

  return header
}

function parseJpegHeader(bytes: Uint8Array): ParsedNyxChatImageFile {
  if (bytes.length < 4 || !bytesEqual(bytes.subarray(0, 2), jpegStart)) {
    fail('Image is not a PNG or JPEG file.')
  }

  let offset = 2

  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff || bytes[offset + 1] === 0xff || bytes[offset + 1] === 0x00) {
      fail('JPEG marker sequence is invalid.')
    }

    const marker = bytes[offset + 1]!

    if (marker === 0xd9 || marker === 0xda) {
      break
    }

    const segmentLength = readUint16(bytes, offset + 2)
    const nextOffset = offset + 2 + segmentLength

    if (segmentLength < 2 || nextOffset > bytes.length) {
      fail('JPEG segment is truncated.')
    }

    if (marker === 0xc0) {
      if (segmentLength < 8 || bytes[offset + 4] !== 8) {
        fail('JPEG SOF0 is invalid.')
      }

      const height = readUint16(bytes, offset + 5)
      const width = readUint16(bytes, offset + 7)

      if (width === 0 || height === 0) {
        fail('Image dimensions must be positive.')
      }

      return { mediaType: 'image/jpeg', width, height }
    }

    offset = nextOffset
  }

  fail('JPEG SOF0 header is missing.')
}

function parseJpegFile(bytes: Uint8Array): ParsedNyxChatImageFile {
  const header = parseJpegHeader(bytes)
  const markers: number[] = []
  let app0Payload: Uint8Array | undefined
  let app2Payload: Uint8Array | undefined
  let offset = 2

  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff || bytes[offset + 1] === 0xff || bytes[offset + 1] === 0x00) {
      fail('JPEG marker sequence is invalid.')
    }

    const marker = bytes[offset + 1]!

    if (marker === 0xd9) {
      markers.push(marker)

      if (offset + 2 !== bytes.length) {
        fail('JPEG must end after EOI.')
      }
      break
    }

    const segmentLength = readUint16(bytes, offset + 2)
    const dataOffset = offset + 4
    const nextOffset = offset + 2 + segmentLength

    if (segmentLength < 2 || nextOffset > bytes.length) {
      fail('JPEG segment is truncated.')
    }

    markers.push(marker)
    const payload = bytes.subarray(dataOffset, nextOffset)

    if (marker === 0xe0) {
      app0Payload = payload
    } else if (marker === 0xe2) {
      app2Payload = payload
    }

    if (marker === 0xda) {
      offset = nextOffset

      while (offset + 1 < bytes.length) {
        if (bytes[offset] !== 0xff) {
          offset += 1
          continue
        }

        const scanMarker = bytes[offset + 1]!

        if (scanMarker === 0x00) {
          offset += 2
          continue
        }

        if (scanMarker !== 0xd9) {
          fail('JPEG scan contains an unsupported marker.')
        }

        break
      }

      continue
    }

    offset = nextOffset
  }

  const expectedMarkers = [0xe0, 0xe2, 0xdb, 0xdb, 0xc0, 0xc4, 0xc4, 0xc4, 0xc4, 0xda, 0xd9]

  if (!bytesEqual(Uint8Array.from(markers), Uint8Array.from(expectedMarkers))) {
    fail('JPEG marker sequence is not the approved canonical form.')
  }

  if (!app0Payload || !bytesEqual(app0Payload, jpegApp0Payload)) {
    fail('JPEG JFIF header is not the approved canonical form.')
  }

  if (
    !app2Payload ||
    app2Payload.length <= jpegIccPrefix.length + 2 ||
    !bytesEqual(app2Payload.subarray(0, jpegIccPrefix.length), jpegIccPrefix) ||
    app2Payload[jpegIccPrefix.length] !== 1 ||
    app2Payload[jpegIccPrefix.length + 1] !== 1
  ) {
    fail('JPEG ICC profile is not the approved canonical form.')
  }

  return {
    ...header,
    jpegApp2Payload: app2Payload,
    jpegIccProfile: app2Payload.subarray(jpegIccPrefix.length + 2),
  }
}

export function parseNyxChatImageHeader(bytes: Uint8Array): ParsedNyxChatImageFile {
  if (bytesEqual(bytes.subarray(0, pngSignature.length), pngSignature)) {
    return parsePngHeader(bytes)
  }

  return parseJpegHeader(bytes)
}

export function parseNyxChatImageFile(bytes: Uint8Array): ParsedNyxChatImageFile {
  if (bytesEqual(bytes.subarray(0, pngSignature.length), pngSignature)) {
    return parsePngFile(bytes)
  }

  return parseJpegFile(bytes)
}

export function calculateNyxChatPreviewDimensions(width: number, height: number) {
  const scale = Math.min(1, nyxChatImageLimits.previewMaxEdge / Math.max(width, height))

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}
