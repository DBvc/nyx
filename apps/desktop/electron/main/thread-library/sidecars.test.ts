import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { parseNyxChatImageHeader } from '../../../shared/chat/image-file'
import type { ResponsesContinuationStateV1 } from '../chat/provider-stream'
import {
  createCurrentThreadFileAdapter,
  type CurrentThreadFileAdapter,
} from '../current-thread/file-adapter'
import { parseThreadLibraryThreadDetail } from './protocol'
import { ThreadLibrarySidecars } from './sidecars'

const threadId = '00000000-0000-4000-8000-000000000001'
const imageId = '00000000-0000-4000-8000-000000000002'
const documentId = '00000000-0000-4000-8000-000000000003'
const stateId = '00000000-0000-4000-8000-000000000004'
const timestamp = '2026-08-12T00:00:00.000Z'
const png = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAEklEQVR4AWJ65Or637b6wX8AAAAA//9pZw09AAAABklEQVQDABTLBQX5/tLNAAAAAElFTkSuQmCC',
    'base64',
  ),
)
const documentBytes = new TextEncoder().encode('hello document')
const tempDirs: string[] = []

function digest(bytes: Uint8Array) {
  return createHash('sha256').update(bytes).digest('hex')
}

function continuation(): ResponsesContinuationStateV1 {
  return {
    version: 1,
    protocol: 'openai-responses',
    effectiveReasoningContext: null,
    outputItems: [
      {
        type: 'reasoning',
        encrypted_content: 'opaque',
        summary: [],
        content: [],
      },
      {
        type: 'message',
        role: 'assistant',
        status: 'completed',
        content: [{ type: 'output_text', text: 'Answer', annotations: [] }],
      },
    ],
  }
}

async function createSidecars(fileAdapter?: CurrentThreadFileAdapter) {
  const rootPath = await mkdtemp(join(tmpdir(), 'nyx-thread-sidecars-'))
  tempDirs.push(rootPath)
  return {
    rootPath,
    sidecars: new ThreadLibrarySidecars({
      rootPath,
      decodeImageSize: (bytes) => {
        const header = parseNyxChatImageHeader(bytes)
        return { width: header.width, height: header.height }
      },
      ...(fileAdapter ? { fileAdapter } : {}),
    }),
  }
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

describe('ThreadLibrarySidecars', () => {
  it('removes only crash-left staging below validated Thread directories', async () => {
    const { rootPath, sidecars } = await createSidecars()
    const threadPath = join(rootPath, 'threads', threadId)
    const stagingPath = join(threadPath, '.staging')
    const documentPath = join(threadPath, 'documents', `${documentId}.source`)
    await mkdir(stagingPath, { recursive: true })
    await mkdir(join(threadPath, 'documents'), { recursive: true })
    await writeFile(join(stagingPath, 'orphan.tmp'), 'orphan', 'utf8')
    await writeFile(documentPath, documentBytes)

    await sidecars.removeCrashLeftStaging()

    await expect(stat(stagingPath)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(readFile(documentPath)).resolves.toEqual(Buffer.from(documentBytes))
  })

  it('refuses a symlinked staging boundary without touching its target', async () => {
    const { rootPath, sidecars } = await createSidecars()
    const threadPath = join(rootPath, 'threads', threadId)
    const outsidePath = join(rootPath, 'outside-staging')
    await mkdir(threadPath, { recursive: true })
    await mkdir(outsidePath)
    await writeFile(join(outsidePath, 'keep.txt'), 'keep', 'utf8')
    await symlink(outsidePath, join(threadPath, '.staging'), 'dir')

    await expect(sidecars.removeCrashLeftStaging()).rejects.toThrow(
      'Thread staging directory is unsafe.',
    )
    await expect(readFile(join(outsidePath, 'keep.txt'), 'utf8')).resolves.toBe('keep')
  })

  it('publishes verified private image, document, and Responses files in one Thread layout', async () => {
    const { rootPath, sidecars } = await createSidecars()
    const imageInput = [
      {
        ref: { imageId, mediaType: 'image/png', width: 2, height: 1 },
        image: { imageId, canonicalBytes: png, previewBytes: png },
        position: 0,
      },
    ] as const
    const [image] = await sidecars.publishImages(threadId, imageInput)
    const documentInput = [
      {
        ref: {
          documentId,
          name: 'notes.txt',
          mediaType: 'text/plain',
          byteLength: documentBytes.byteLength,
          extractedByteLength: documentBytes.byteLength,
        },
        document: {
          documentId,
          sourceBytes: documentBytes,
          extractedTextBytes: documentBytes,
          extractedFromSha256: digest(documentBytes),
        },
        position: 0,
      },
    ] as const
    const [document] = await sidecars.publishDocuments(threadId, documentInput)
    await expect(sidecars.publishImages(threadId, imageInput)).resolves.toEqual([image])
    await expect(sidecars.publishDocuments(threadId, documentInput)).resolves.toEqual([document])
    const response = sidecars.prepareResponse({
      stateId,
      executionIdentity: 'a'.repeat(64),
      state: continuation(),
      assistantContent: 'Answer',
    })
    await sidecars.publishResponseBytes(threadId, response.ref, response.bytes, 'Answer')

    await expect(sidecars.readCanonicalImage(threadId, imageInput[0].ref)).resolves.toEqual(png)
    await expect(
      sidecars.resolveImageProtocolFile(threadId, imageInput[0].ref, 'full'),
    ).resolves.toEqual({
      filePath: join(rootPath, 'threads', threadId, 'images', `${imageId}.full`),
      mediaType: 'image/png',
    })
    await expect(
      sidecars.resolveImageProtocolFile(threadId, imageInput[0].ref, 'preview'),
    ).resolves.toEqual({
      filePath: join(rootPath, 'threads', threadId, 'images', `${imageId}.preview`),
      mediaType: 'image/png',
    })
    await expect(sidecars.readResponseState(threadId, response.ref)).resolves.toEqual(
      continuation(),
    )

    const threadPath = join(rootPath, 'threads', threadId)
    for (const directory of ['images', 'documents', 'responses']) {
      expect((await stat(join(threadPath, directory))).mode & 0o777).toBe(0o700)
    }
    for (const path of [
      join(threadPath, 'images', `${imageId}.full`),
      join(threadPath, 'images', `${imageId}.preview`),
      join(threadPath, 'documents', `${documentId}.source`),
      join(threadPath, 'responses', `${stateId}.json`),
    ]) {
      expect((await stat(path)).mode & 0o777).toBe(0o600)
    }
    await expect(stat(join(threadPath, 'documents', `${documentId}.text`))).rejects.toMatchObject({
      code: 'ENOENT',
    })

    const detail = parseThreadLibraryThreadDetail({
      summary: {
        id: threadId,
        location: 'available',
        trashedFromLocation: null,
        trashedPinPosition: null,
        pinPosition: null,
        title: 'Thread',
        titleSource: 'auto',
        fallbackLocalSecond: null,
        fallbackOrdinal: null,
        threadRevision: 1,
        lastUserActivityAt: timestamp,
        resultRevision: 1,
        seenResultRevision: 0,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      draft: {
        threadId,
        draftRevision: 1,
        text: '',
        targetSelection: { kind: 'connection', providerId: 'provider-1', modelId: 'model-1' },
        updatedAt: timestamp,
      },
      turns: [
        {
          threadId,
          ordinal: 0,
          attemptRequestId: 'request-1',
          userMessageId: 'user-1',
          assistantMessageId: 'assistant-1',
          userContent: '',
          assistantContent: 'Answer',
          assistantStatus: 'completed',
          error: null,
          targetSelection: { kind: 'connection', providerId: 'provider-1', modelId: 'model-1' },
          targetAttribution: {
            kind: 'connection',
            providerId: 'provider-1',
            providerDisplayName: 'Provider One',
            modelId: 'model-1',
            modelDisplayName: 'Model One',
          },
          providerStateId: stateId,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ],
      images: [{ ...image!, threadId, owner: 'turn', turnOrdinal: 0 }],
      documents: [{ ...document!, threadId, owner: 'turn', turnOrdinal: 0 }],
      providerStateRefs: [{ ...response.ref, threadId, turnOrdinal: 0 }],
    })
    await expect(sidecars.inspect(detail)).resolves.toEqual({
      images: [{ id: imageId, available: true }],
      documents: [{ id: documentId, available: true }],
      corruptProviderStateRefs: [],
    })
  })

  it('isolates corrupt resources and removes only unreferenced canonical files after a read', async () => {
    const { rootPath, sidecars } = await createSidecars()
    const [document] = await sidecars.publishDocuments(threadId, [
      {
        ref: {
          documentId,
          name: 'notes.txt',
          mediaType: 'text/plain',
          byteLength: documentBytes.byteLength,
          extractedByteLength: documentBytes.byteLength,
        },
        document: {
          documentId,
          sourceBytes: documentBytes,
          extractedTextBytes: documentBytes,
          extractedFromSha256: digest(documentBytes),
        },
        position: 0,
      },
    ])
    const detail = parseThreadLibraryThreadDetail({
      summary: {
        id: threadId,
        location: 'available',
        trashedFromLocation: null,
        trashedPinPosition: null,
        pinPosition: null,
        title: 'Thread',
        titleSource: 'auto',
        fallbackLocalSecond: null,
        fallbackOrdinal: null,
        threadRevision: 1,
        lastUserActivityAt: timestamp,
        resultRevision: 0,
        seenResultRevision: 0,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      draft: {
        threadId,
        draftRevision: 0,
        text: '',
        targetSelection: { kind: 'env_fallback' },
        updatedAt: timestamp,
      },
      turns: [
        {
          threadId,
          ordinal: 0,
          attemptRequestId: 'request-1',
          userMessageId: 'user-1',
          assistantMessageId: 'assistant-1',
          userContent: '',
          assistantContent: 'Done',
          assistantStatus: 'completed',
          error: null,
          targetSelection: { kind: 'env_fallback' },
          targetAttribution: { kind: 'env_fallback', modelId: 'model' },
          providerStateId: null,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ],
      images: [],
      documents: [{ ...document!, threadId, owner: 'turn', turnOrdinal: 0 }],
      providerStateRefs: [],
    })
    const directory = join(rootPath, 'threads', threadId, 'documents')
    await writeFile(join(directory, `${documentId}.source`), 'changed', 'utf8')
    await writeFile(join(directory, 'orphan.source'), 'orphan', 'utf8')
    await expect(sidecars.inspect(detail)).resolves.toMatchObject({
      documents: [{ id: documentId, available: false }],
    })
    await sidecars.cleanupOrphans(detail)
    await expect(stat(join(directory, 'orphan.source'))).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(readFile(join(directory, `${documentId}.source`))).resolves.toEqual(
      Buffer.from('changed'),
    )
  })

  it('fails closed when a Main-only read does not match the exact Thread ref', async () => {
    const { sidecars } = await createSidecars()
    const imageRef = { imageId, mediaType: 'image/png', width: 2, height: 1 } as const
    await sidecars.publishImages(threadId, [
      {
        ref: imageRef,
        image: { imageId, canonicalBytes: png, previewBytes: png },
        position: 0,
      },
    ])

    await expect(sidecars.readCanonicalImage(threadId, { ...imageRef, width: 3 })).rejects.toThrow()
    await expect(
      sidecars.resolveImageProtocolFile(threadId, { ...imageRef, height: 2 }, 'preview'),
    ).rejects.toThrow()
    await expect(sidecars.readCanonicalImage('../other', imageRef)).rejects.toThrow()
  })

  it('resolves a preview for streaming without reading canonical image bytes into Main', async () => {
    const base = createCurrentThreadFileAdapter()
    let canonicalReads = 0
    const { sidecars } = await createSidecars({
      ...base,
      readBytes: async (path, maximumBytes) => {
        if (path.endsWith('.full')) canonicalReads += 1
        return base.readBytes(path, maximumBytes)
      },
    })
    const ref = { imageId, mediaType: 'image/png', width: 2, height: 1 } as const
    await sidecars.publishImages(threadId, [
      {
        ref,
        image: { imageId, canonicalBytes: png, previewBytes: png },
        position: 0,
      },
    ])
    canonicalReads = 0

    await expect(
      sidecars.resolveImageProtocolFile(threadId, ref, 'preview'),
    ).resolves.toMatchObject({ mediaType: 'image/png' })
    expect(canonicalReads).toBe(0)
  })

  it('does not leave canonical files when staging publication fails', async () => {
    const base = createCurrentThreadFileAdapter()
    const { rootPath, sidecars } = await createSidecars({
      ...base,
      rename: async () => {
        throw new Error('injected rename failure')
      },
    })
    await expect(
      sidecars.publishImages(threadId, [
        {
          ref: { imageId, mediaType: 'image/png', width: 2, height: 1 },
          image: { imageId, canonicalBytes: png, previewBytes: png },
          position: 0,
        },
      ]),
    ).rejects.toThrow('Could not publish Thread images.')
    await expect(
      stat(join(rootPath, 'threads', threadId, 'images', `${imageId}.full`)),
    ).rejects.toMatchObject({
      code: 'ENOENT',
    })
  })
})
