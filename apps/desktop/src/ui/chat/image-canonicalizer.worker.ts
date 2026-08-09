/// <reference lib="webworker" />

import {
  calculateNyxChatPreviewDimensions,
  parseNyxChatImageFile,
} from '../../../shared/chat/image-file'
import type { NyxChatImageMediaType } from '../../../shared/chat/types'

export interface ImageCanonicalizerRequest {
  draftId: string
  source: ArrayBuffer
  mediaType: NyxChatImageMediaType
}

export type ImageCanonicalizerResult =
  | {
      draftId: string
      ok: true
      mediaType: NyxChatImageMediaType
      width: number
      height: number
      canonical: ArrayBuffer
      preview: ArrayBuffer
    }
  | {
      draftId: string
      ok: false
      error: string
    }

const workerScope = self as DedicatedWorkerGlobalScope

async function canonicalize({ draftId, source, mediaType }: ImageCanonicalizerRequest) {
  let bitmap: ImageBitmap | undefined
  let fullCanvas: OffscreenCanvas | undefined
  let previewCanvas: OffscreenCanvas | undefined

  try {
    bitmap = await createImageBitmap(new Blob([source], { type: mediaType }), {
      imageOrientation: 'from-image',
    })
    fullCanvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    const fullContext = fullCanvas.getContext('2d')

    if (!fullContext) {
      throw new Error('Canvas is unavailable.')
    }

    fullContext.drawImage(bitmap, 0, 0)
    const fullBlob = await fullCanvas.convertToBlob({
      type: mediaType,
      ...(mediaType === 'image/jpeg' ? { quality: 0.95 } : {}),
    })

    if (fullBlob.type !== mediaType) {
      throw new Error('Image encoding failed.')
    }

    const previewSize = calculateNyxChatPreviewDimensions(bitmap.width, bitmap.height)
    previewCanvas = new OffscreenCanvas(previewSize.width, previewSize.height)
    const previewContext = previewCanvas.getContext('2d')

    if (!previewContext) {
      throw new Error('Canvas is unavailable.')
    }

    previewContext.drawImage(bitmap, 0, 0, previewSize.width, previewSize.height)
    const previewBlob = await previewCanvas.convertToBlob({ type: 'image/png' })
    const canonical = await fullBlob.arrayBuffer()
    const preview = await previewBlob.arrayBuffer()
    const parsedCanonical = parseNyxChatImageFile(new Uint8Array(canonical))
    const parsedPreview = parseNyxChatImageFile(new Uint8Array(preview))

    if (
      parsedCanonical.mediaType !== mediaType ||
      parsedCanonical.width !== bitmap.width ||
      parsedCanonical.height !== bitmap.height ||
      parsedPreview.mediaType !== 'image/png' ||
      parsedPreview.width !== previewSize.width ||
      parsedPreview.height !== previewSize.height
    ) {
      throw new Error('Image encoding failed.')
    }

    const result: ImageCanonicalizerResult = {
      draftId,
      ok: true,
      mediaType,
      width: bitmap.width,
      height: bitmap.height,
      canonical,
      preview,
    }

    workerScope.postMessage(result, [canonical, preview])
  } catch {
    const result: ImageCanonicalizerResult = {
      draftId,
      ok: false,
      error: 'Nyx could not prepare this image.',
    }
    workerScope.postMessage(result)
  } finally {
    bitmap?.close()

    if (fullCanvas) {
      fullCanvas.width = 0
      fullCanvas.height = 0
    }

    if (previewCanvas) {
      previewCanvas.width = 0
      previewCanvas.height = 0
    }
  }
}

let work = Promise.resolve()

workerScope.onmessage = (event: MessageEvent<ImageCanonicalizerRequest>) => {
  work = work.then(() => canonicalize(event.data))
}
