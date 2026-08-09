import { pathToFileURL } from 'node:url'

import {
  nyxChatImageScheme,
  nyxChatImageVariants,
  type NyxChatImageVariant,
} from '../../../shared/chat/image-url'
import type { CurrentThreadImageFiles } from './image-files'
import type { CurrentThreadRecord } from './schemas'

const imageIdPattern =
  /^\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export interface ImageSchemeRegistrar {
  registerSchemesAsPrivileged(
    schemes: Array<{
      scheme: string
      privileges: { standard: true; secure: true }
    }>,
  ): void
}

export interface ImageProtocolRegistrar {
  handle(scheme: string, handler: (request: Request) => Promise<Response>): void
}

export interface ImageProtocolNet {
  fetch(input: string, options: { bypassCustomProtocolHandlers: true }): Promise<Response>
}

export interface CurrentThreadImageRecordReader {
  read(): Promise<CurrentThreadRecord | null>
}

export function registerNyxImageScheme(registrar: ImageSchemeRegistrar) {
  registrar.registerSchemesAsPrivileged([
    {
      scheme: nyxChatImageScheme,
      privileges: { standard: true, secure: true },
    },
  ])
}

export function parseNyxImageRequest(request: Request) {
  if (request.method !== 'GET') {
    return { ok: false as const, status: 405 }
  }

  let url: URL

  try {
    url = new URL(request.url)
  } catch {
    return { ok: false as const, status: 404 }
  }

  if (
    url.protocol !== `${nyxChatImageScheme}:` ||
    !nyxChatImageVariants.includes(url.hostname as NyxChatImageVariant) ||
    !imageIdPattern.test(url.pathname) ||
    url.search.length > 0 ||
    url.username.length > 0 ||
    url.password.length > 0
  ) {
    return { ok: false as const, status: 404 }
  }

  return {
    ok: true as const,
    imageId: url.pathname.slice(1),
    variant: url.hostname as NyxChatImageVariant,
  }
}

export function registerNyxImageProtocol({
  protocol,
  net,
  recordReader,
  images,
}: {
  protocol: ImageProtocolRegistrar
  net: ImageProtocolNet
  recordReader: CurrentThreadImageRecordReader
  images: CurrentThreadImageFiles
}) {
  protocol.handle(nyxChatImageScheme, async (request) => {
    const route = parseNyxImageRequest(request)

    if (!route.ok) {
      return new Response(null, {
        status: route.status,
        ...(route.status === 405 ? { headers: { Allow: 'GET' } } : {}),
      })
    }

    try {
      const record = await recordReader.read()

      if (!record) {
        return new Response(null, { status: 404 })
      }

      const image = await images.resolveProtocolFile(record, route.imageId, route.variant)
      const fileResponse = await net.fetch(pathToFileURL(image.filePath).toString(), {
        bypassCustomProtocolHandlers: true,
      })

      if (!fileResponse.ok || !fileResponse.body) {
        return new Response(null, { status: 404 })
      }

      return new Response(fileResponse.body, {
        status: 200,
        headers: {
          'Cache-Control': 'public, max-age=31536000, immutable',
          'Content-Type': image.mediaType,
          'X-Content-Type-Options': 'nosniff',
        },
      })
    } catch {
      return new Response(null, { status: 404 })
    }
  })
}
