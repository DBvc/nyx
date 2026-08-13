import { describe, expect, it, vi } from 'vitest'

import { buildNyxChatImageUrl } from '../../../shared/chat/image-url'
import {
  parseNyxImageRequest,
  registerNyxImageProtocol,
  registerNyxImageScheme,
} from './image-protocol'

const imageId = '00000000-0000-4000-8000-000000000001'

describe('nyx-image protocol', () => {
  it('registers only standard and secure scheme privileges', () => {
    const registerSchemesAsPrivileged = vi.fn()

    registerNyxImageScheme({ registerSchemesAsPrivileged })

    expect(registerSchemesAsPrivileged).toHaveBeenCalledWith([
      {
        scheme: 'nyx-image',
        privileges: { standard: true, secure: true },
      },
    ])
  })

  it('accepts only an exact canonical GET route', () => {
    expect(parseNyxImageRequest(new Request(buildNyxChatImageUrl(imageId, 'preview')))).toEqual({
      ok: true,
      imageId,
      variant: 'preview',
    })

    for (const request of [
      new Request(`nyx-image://unknown/${imageId}`),
      new Request(`nyx-image://preview/${imageId}?token=1`),
      new Request('nyx-image://preview/../full/not-an-id'),
      new Request(`nyx-image://preview/${imageId}`, { method: 'POST' }),
    ]) {
      expect(parseNyxImageRequest(request).ok).toBe(false)
    }
  })

  it('authorizes from the selected Thread projection and streams the file response', async () => {
    let handler: ((request: Request) => Promise<Response>) | undefined
    const protocol = {
      handle: vi.fn((_scheme: string, routeHandler: (request: Request) => Promise<Response>) => {
        handler = routeHandler
      }),
    }
    const ref = { imageId, mediaType: 'image/png' as const, width: 2, height: 1 }
    const authorization = {
      resolve: vi.fn<() => { threadId: string; ref: typeof ref } | null>(() => ({
        threadId: 'thread-1',
        ref,
      })),
    }
    const images = {
      resolveImageProtocolFile: vi.fn(async () => ({
        filePath: '/private/current-thread-assets/image.preview',
        mediaType: 'image/png' as const,
      })),
    }
    const net = {
      fetch: vi.fn(async () => new Response(Uint8Array.from([1, 2, 3]))),
    }

    registerNyxImageProtocol({ protocol, net, authorization, images })

    const response = await handler!(new Request(buildNyxChatImageUrl(imageId, 'preview')))

    expect(protocol.handle).toHaveBeenCalledWith('nyx-image', expect.any(Function))
    expect(authorization.resolve).toHaveBeenCalledWith(imageId)
    expect(images.resolveImageProtocolFile).toHaveBeenCalledWith('thread-1', ref, 'preview')
    expect(net.fetch).toHaveBeenCalledWith('file:///private/current-thread-assets/image.preview', {
      bypassCustomProtocolHandlers: true,
    })
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('image/png')
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable')
    await expect(response.arrayBuffer()).resolves.toEqual(Uint8Array.from([1, 2, 3]).buffer)

    authorization.resolve.mockReturnValueOnce(null)
    const unavailable = await handler!(new Request(buildNyxChatImageUrl(imageId, 'full')))
    expect(unavailable.status).toBe(404)

    const wrongMethod = await handler!(
      new Request(buildNyxChatImageUrl(imageId, 'preview'), { method: 'DELETE' }),
    )
    expect(wrongMethod.status).toBe(405)
    expect(wrongMethod.headers.get('Allow')).toBe('GET')
  })
})
