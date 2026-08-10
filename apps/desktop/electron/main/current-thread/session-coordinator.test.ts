import { createHash } from 'node:crypto'
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { NyxChatRequest } from '../../../shared/chat/types'
import {
  buildDocumentTextEnvelope,
  CurrentThreadSessionCoordinator,
  CurrentThreadSessionError,
} from './session-coordinator'
import { CurrentThreadImageFilesError, type CurrentThreadImageFiles } from './image-files'
import { CurrentThreadDocumentFiles } from './document-files'
import {
  parseCurrentThreadRecordV1,
  parseCurrentThreadRecordV3,
  parseCurrentThreadRecordV4,
} from './schemas'
import { toCurrentThreadSnapshot } from './snapshot'
import { CurrentThreadStore } from './store'

const tempDirs: string[] = []
const firstAttribution = {
  kind: 'connection',
  providerId: 'provider-1',
  providerDisplayName: 'Provider One',
  modelId: 'model-1',
  modelDisplayName: 'Model One',
} as const
const envAttributionA = { kind: 'env_fallback', modelId: 'env-model-a' } as const
const envAttributionB = { kind: 'env_fallback', modelId: 'env-model-b' } as const
const imageRef = {
  imageId: '00000000-0000-4000-8000-000000000001',
  mediaType: 'image/png',
  width: 640,
  height: 480,
} as const
const newImage = {
  imageId: imageRef.imageId,
  canonicalBytes: new Uint8Array([1]),
  previewBytes: new Uint8Array([2]),
} as const
const imageRef2 = {
  ...imageRef,
  imageId: '00000000-0000-4000-8000-000000000002',
  mediaType: 'image/jpeg',
} as const
const imageRef3 = {
  ...imageRef,
  imageId: '00000000-0000-4000-8000-000000000003',
} as const
const imageRef4 = {
  ...imageRef,
  imageId: '00000000-0000-4000-8000-000000000004',
} as const
const documentSource = new TextEncoder().encode('hello document')
const documentRef = {
  documentId: '00000000-0000-4000-8000-000000000010',
  name: 'notes.txt',
  mediaType: 'text/plain',
  byteLength: documentSource.byteLength,
  extractedByteLength: documentSource.byteLength,
} as const
const newDocument = {
  documentId: documentRef.documentId,
  sourceBytes: documentSource,
  extractedTextBytes: documentSource,
  extractedFromSha256: createHash('sha256').update(documentSource).digest('hex'),
} as const

async function createCoordinator() {
  const dir = await mkdtemp(join(tmpdir(), 'nyx-current-thread-session-'))
  tempDirs.push(dir)
  const store = new CurrentThreadStore({
    filePath: join(dir, 'current-thread.json'),
    generateId: () => 'thread-1',
    now: () => '2026-07-11T00:00:00.000Z',
  })
  const availableImageIds = new Set<string>()
  const images = {
    reconcile: async () => undefined,
    writeNewImages: async ({ refs }: { refs: ReadonlyArray<typeof imageRef> }) => {
      for (const ref of refs) {
        availableImageIds.add(ref.imageId)
      }
      return refs.map((ref) => ref.imageId)
    },
    rollbackImages: async (imageIds: ReadonlyArray<string>) => {
      for (const imageId of imageIds) {
        availableImageIds.delete(imageId)
      }
    },
    assertAvailable: async (refs: ReadonlyArray<typeof imageRef>) => {
      if (refs.some((ref) => !availableImageIds.has(ref.imageId))) {
        throw new Error('unavailable')
      }
    },
    readCanonical: async (ref: typeof imageRef) => Uint8Array.from([Number(ref.imageId.slice(-1))]),
    canonicalBytes: async () => availableImageIds.size,
    reset: async () => {
      availableImageIds.clear()
    },
  } as unknown as CurrentThreadImageFiles

  return {
    filePath: join(dir, 'current-thread.json'),
    store,
    coordinator: new CurrentThreadSessionCoordinator({
      store,
      images,
      now: () => '2026-07-11T01:00:00.000Z',
    }),
  }
}

function newRequest(overrides: Partial<NyxChatRequest> = {}): NyxChatRequest {
  return {
    requestId: 'request-1',
    userMessageId: 'user-1',
    assistantMessageId: 'assistant-1',
    turnIntent: 'new_user_message',
    turnUserMessage: { id: 'user-1', content: 'Hello' },
    messages: [{ role: 'user', content: 'Hello' }],
    ...overrides,
    targetSelection: overrides.targetSelection ?? {
      kind: 'connection',
      providerId: 'provider-1',
      modelId: 'model-1',
    },
  }
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('CurrentThreadSessionCoordinator', () => {
  it('validates the full renderer sequence before creating a pending thread', async () => {
    const { coordinator, store } = await createCoordinator()

    await expect(
      coordinator.prepare(newRequest({ messages: [{ role: 'user', content: 'Tampered' }] })),
    ).rejects.toMatchObject({
      code: 'invalid_request',
    } satisfies Partial<CurrentThreadSessionError>)
    await expect(store.read()).resolves.toBeNull()

    const prepared = await coordinator.prepare(newRequest())

    expect(prepared.providerMessages).toEqual([{ role: 'user', content: 'Hello' }])
    expect(prepared.replayRecord).toBeNull()
    expect(prepared.pendingRecord).toMatchObject({
      version: 2,
      threadId: 'thread-1',
      turns: [
        {
          attemptRequestId: 'request-1',
          assistantStatus: 'pending',
          targetBinding: {
            selection: {
              kind: 'connection',
              providerId: 'provider-1',
              modelId: 'model-1',
            },
            attribution: null,
          },
        },
      ],
    })
  })

  it('rolls back image files when the durable record commit fails', async () => {
    const rollbackImages = vi.fn(async () => undefined)
    const store = {
      read: vi.fn(async () => null),
      create: vi.fn(async () => {
        throw new Error('record rename failed')
      }),
    } as unknown as CurrentThreadStore
    const images = {
      reconcile: vi.fn(async () => undefined),
      writeNewImages: vi.fn(async () => [imageRef.imageId]),
      rollbackImages,
    } as unknown as CurrentThreadImageFiles
    const coordinator = new CurrentThreadSessionCoordinator({ store, images })

    await expect(
      coordinator.prepare(
        newRequest({
          turnUserMessage: { id: 'user-1', content: '', imageRefs: [imageRef] },
          messages: [{ role: 'user', content: '' }],
          newImages: [newImage],
        }),
      ),
    ).rejects.toMatchObject({ code: 'store_error' })
    expect(rollbackImages).toHaveBeenCalledWith([imageRef.imageId])
  })

  it('commits document sidecars before v4, reuses refs on Retry, and detects corruption', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'nyx-current-thread-document-session-'))
    tempDirs.push(dir)
    const store = new CurrentThreadStore({
      filePath: join(dir, 'current-thread.json'),
      generateId: () => 'thread-doc',
      now: () => '2026-08-10T00:00:00.000Z',
    })
    const documentDirectory = join(dir, 'documents')
    const documents = new CurrentThreadDocumentFiles({ directoryPath: documentDirectory })
    const coordinator = new CurrentThreadSessionCoordinator({ store, documents })
    const request = newRequest({
      turnUserMessage: { id: 'user-1', content: '', documentRefs: [documentRef] },
      messages: [{ role: 'user', content: '' }],
      newDocuments: [newDocument],
    })

    const prepared = await coordinator.prepare(request)
    expect(prepared.pendingRecord).toMatchObject({
      version: 4,
      turns: [{ imageRefs: [], documentRefs: [expect.objectContaining(documentRef)] }],
    })
    await expect(
      stat(join(documentDirectory, `${documentRef.documentId}.source`)),
    ).resolves.toBeDefined()
    await coordinator.bindResolvedTarget('request-1', 'assistant-1', firstAttribution)
    await coordinator.fail('request-1', 'assistant-1', '', {
      code: 'network_error',
      message: 'private detail',
      retryable: true,
    })

    const { newDocuments: _newDocuments, ...retryBase } = request
    const retry = {
      ...retryBase,
      requestId: 'request-2',
      turnIntent: 'retry_failed_response' as const,
    }
    const retried = await coordinator.prepare(retry)
    expect(retried).toMatchObject({
      pendingRecord: { version: 4, turns: [{ attemptRequestId: 'request-2' }] },
    })
    await expect(coordinator.materializeProviderMessages(retried.pendingRecord)).resolves.toEqual([
      {
        role: 'user',
        content: buildDocumentTextEnvelope('notes.txt', 'hello document'),
      },
    ])
    await coordinator.bindResolvedTarget('request-2', 'assistant-1', firstAttribution)
    await coordinator.fail('request-2', 'assistant-1', '', {
      code: 'network_error',
      message: 'private detail',
      retryable: true,
    })

    await writeFile(
      join(documentDirectory, `${documentRef.documentId}.text`),
      new TextEncoder().encode('jello document'),
    )
    await expect(coordinator.prepare({ ...retry, requestId: 'request-3' })).rejects.toMatchObject({
      code: 'invalid_request',
    })
  })

  it('rolls back document sidecars when a mixed image write fails', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'nyx-current-thread-mixed-rollback-'))
    tempDirs.push(dir)
    const store = new CurrentThreadStore({ filePath: join(dir, 'current-thread.json') })
    const documentDirectory = join(dir, 'documents')
    const documents = new CurrentThreadDocumentFiles({ directoryPath: documentDirectory })
    const images = {
      reconcile: vi.fn(async () => undefined),
      writeNewImages: vi.fn(async () => {
        throw new CurrentThreadImageFilesError('io_error', 'failed')
      }),
    } as unknown as CurrentThreadImageFiles
    const coordinator = new CurrentThreadSessionCoordinator({ store, images, documents })

    await expect(
      coordinator.prepare(
        newRequest({
          turnUserMessage: {
            id: 'user-1',
            content: '',
            imageRefs: [imageRef],
            documentRefs: [documentRef],
          },
          messages: [{ role: 'user', content: '' }],
          newImages: [newImage],
          newDocuments: [newDocument],
        }),
      ),
    ).rejects.toMatchObject({ code: 'store_error' })
    await expect(
      stat(join(documentDirectory, `${documentRef.documentId}.source`)),
    ).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(store.read()).resolves.toBeNull()
  })

  it('rejects the shared raw attachment budget before either store writes', async () => {
    const pdfSource = new Uint8Array(8 * 1024 * 1024)
    pdfSource.set(new TextEncoder().encode('%PDF-'))
    const pdfText = new TextEncoder().encode('x')
    const historicalRecord = parseCurrentThreadRecordV3({
      version: 3,
      threadId: 'thread-1',
      turns: [imageRef, imageRef2, imageRef3, imageRef4].map((ref, index) => ({
        attemptRequestId: `historical-request-${index}`,
        userMessageId: `historical-user-${index}`,
        assistantMessageId: `historical-assistant-${index}`,
        userContent: '',
        imageRefs: [ref],
        assistantContent: '',
        assistantStatus: 'completed',
        error: null,
        targetBinding: {
          selection: { kind: 'env_fallback' },
          attribution: { kind: 'env_fallback', modelId: 'model' },
        },
        createdAt: '2026-08-10T00:00:00.000Z',
        updatedAt: '2026-08-10T00:00:00.000Z',
      })),
      createdAt: '2026-08-10T00:00:00.000Z',
      updatedAt: '2026-08-10T00:00:00.000Z',
    })
    const images = {
      reconcile: vi.fn(async () => undefined),
      canonicalBytes: vi.fn(async () => 25 * 1024 * 1024),
      writeNewImages: vi.fn(),
    } as unknown as CurrentThreadImageFiles
    const documents = {
      reconcile: vi.fn(async () => undefined),
      writeNewDocuments: vi.fn(),
    } as unknown as CurrentThreadDocumentFiles
    const store = {
      read: vi.fn(async () => historicalRecord),
    } as unknown as CurrentThreadStore
    const coordinator = new CurrentThreadSessionCoordinator({ store, images, documents })

    await expect(
      coordinator.prepare(
        newRequest({
          turnUserMessage: {
            id: 'user-1',
            content: '',
            documentRefs: [
              {
                ...documentRef,
                name: 'paper.pdf',
                mediaType: 'application/pdf',
                byteLength: pdfSource.byteLength,
                extractedByteLength: pdfText.byteLength,
              },
            ],
          },
          messages: [
            ...historicalRecord.turns.map(() => ({ role: 'user' as const, content: '' })),
            { role: 'user', content: '' },
          ],
          newDocuments: [
            {
              ...newDocument,
              sourceBytes: pdfSource,
              extractedTextBytes: pdfText,
              extractedFromSha256: createHash('sha256').update(pdfSource).digest('hex'),
            },
          ],
        }),
      ),
    ).rejects.toMatchObject({ code: 'invalid_request' })
    expect(images.writeNewImages).not.toHaveBeenCalled()
    expect(documents.writeNewDocuments).not.toHaveBeenCalled()
  })

  it('rolls back documents when cancellation wins before mixed image persistence', async () => {
    const controller = new AbortController()
    const rollbackDocuments = vi.fn(async () => undefined)
    const store = {
      read: vi.fn(async () => null),
      create: vi.fn(),
    } as unknown as CurrentThreadStore
    const documents = {
      reconcile: vi.fn(async () => undefined),
      writeNewDocuments: vi.fn(async () => {
        controller.abort()
        return [
          {
            ...documentRef,
            sourceSha256: newDocument.extractedFromSha256,
            extractedTextSha256: newDocument.extractedFromSha256,
          },
        ]
      }),
      rollbackDocuments,
    } as unknown as CurrentThreadDocumentFiles
    const images = {
      reconcile: vi.fn(async () => undefined),
      writeNewImages: vi.fn(),
    } as unknown as CurrentThreadImageFiles
    const coordinator = new CurrentThreadSessionCoordinator({ store, documents, images })

    await expect(
      coordinator.prepare(
        newRequest({
          turnUserMessage: {
            id: 'user-1',
            content: '',
            imageRefs: [imageRef],
            documentRefs: [documentRef],
          },
          messages: [{ role: 'user', content: '' }],
          newImages: [newImage],
          newDocuments: [newDocument],
        }),
        controller.signal,
      ),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(rollbackDocuments).toHaveBeenCalledWith([documentRef.documentId])
    expect(images.writeNewImages).not.toHaveBeenCalled()
    expect(store.create).not.toHaveBeenCalled()
  })

  it('rolls back every sidecar when cancellation wins at the final pre-commit barrier', async () => {
    const controller = new AbortController()
    const rollbackDocuments = vi.fn(async () => undefined)
    const rollbackImages = vi.fn(async () => undefined)
    const store = {
      read: vi.fn(async () => null),
      create: vi.fn(),
    } as unknown as CurrentThreadStore
    const documents = {
      reconcile: vi.fn(async () => undefined),
      writeNewDocuments: vi.fn(async () => [
        {
          ...documentRef,
          sourceSha256: newDocument.extractedFromSha256,
          extractedTextSha256: newDocument.extractedFromSha256,
        },
      ]),
      rollbackDocuments,
    } as unknown as CurrentThreadDocumentFiles
    const images = {
      reconcile: vi.fn(async () => undefined),
      writeNewImages: vi.fn(async () => {
        controller.abort()
        return [imageRef.imageId]
      }),
      rollbackImages,
    } as unknown as CurrentThreadImageFiles
    const coordinator = new CurrentThreadSessionCoordinator({ store, documents, images })

    await expect(
      coordinator.prepare(
        newRequest({
          turnUserMessage: {
            id: 'user-1',
            content: '',
            imageRefs: [imageRef],
            documentRefs: [documentRef],
          },
          messages: [{ role: 'user', content: '' }],
          newImages: [newImage],
          newDocuments: [newDocument],
        }),
        controller.signal,
      ),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(rollbackImages).toHaveBeenCalledWith([imageRef.imageId])
    expect(rollbackDocuments).toHaveBeenCalledWith([documentRef.documentId])
    expect(store.create).not.toHaveBeenCalled()
  })

  it('does not reconcile files after an unknown or malformed durable record', async () => {
    const images = { reconcile: vi.fn() } as unknown as CurrentThreadImageFiles
    const documents = { reconcile: vi.fn() } as unknown as CurrentThreadDocumentFiles
    const store = {
      read: vi.fn(async () => {
        throw new Error('future version')
      }),
    } as unknown as CurrentThreadStore
    const coordinator = new CurrentThreadSessionCoordinator({ store, images, documents })

    await expect(coordinator.prepare(newRequest())).rejects.toMatchObject({ code: 'store_error' })
    expect(images.reconcile).not.toHaveBeenCalled()
    expect(documents.reconcile).not.toHaveBeenCalled()
  })

  it('resets the record before deleting images and ignores unreachable orphan cleanup failure', async () => {
    const order: string[] = []
    const store = {
      reset: vi.fn(async () => {
        order.push('record')
      }),
    } as unknown as CurrentThreadStore
    const images = {
      reset: vi.fn(async () => {
        order.push('images')
        throw new Error('directory cleanup failed')
      }),
    } as unknown as CurrentThreadImageFiles
    const coordinator = new CurrentThreadSessionCoordinator({ store, images })

    await expect(coordinator.reset()).resolves.toBeUndefined()
    expect(order).toEqual(['record', 'images'])
  })

  it('binds attribution exactly once without settling the pending turn', async () => {
    const { coordinator, store } = await createCoordinator()
    await coordinator.prepare(newRequest())

    await coordinator.bindResolvedTarget('request-1', 'assistant-1', firstAttribution)

    await expect(store.read()).resolves.toMatchObject({
      turns: [
        {
          assistantStatus: 'pending',
          targetBinding: {
            selection: newRequest().targetSelection,
            attribution: firstAttribution,
          },
        },
      ],
    })
    await expect(
      coordinator.bindResolvedTarget('request-1', 'assistant-1', firstAttribution),
    ).rejects.toMatchObject({ code: 'invalid_request' })
  })

  it('derives later provider context from durable terminal turns', async () => {
    const { coordinator } = await createCoordinator()
    await coordinator.prepare(newRequest())
    await coordinator.bindResolvedTarget('request-1', 'assistant-1', firstAttribution)
    await coordinator.complete('request-1', 'assistant-1', 'First answer')

    const prepared = await coordinator.prepare(
      newRequest({
        requestId: 'request-2',
        userMessageId: 'user-2',
        assistantMessageId: 'assistant-2',
        turnUserMessage: { id: 'user-2', content: 'Continue' },
        messages: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'First answer' },
          { role: 'user', content: 'Continue' },
        ],
      }),
    )

    expect(prepared.providerMessages).toEqual([
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'First answer' },
      { role: 'user', content: 'Continue' },
    ])
    expect(prepared.replayRecord?.turns).toHaveLength(1)
    expect(prepared.pendingRecord.version).toBe(2)
    expect(prepared.pendingRecord.turns).toHaveLength(2)
  })

  it('materializes ordered text+image and image-only history from the durable record', async () => {
    const readCanonical = vi.fn(async (ref: typeof imageRef) =>
      Uint8Array.from([Number(ref.imageId.slice(-1))]),
    )
    const coordinator = new CurrentThreadSessionCoordinator({
      store: {} as CurrentThreadStore,
      images: { readCanonical } as unknown as CurrentThreadImageFiles,
    })
    const record = parseCurrentThreadRecordV3({
      version: 3,
      threadId: 'thread-1',
      turns: [
        {
          attemptRequestId: 'request-1',
          userMessageId: 'user-1',
          assistantMessageId: 'assistant-1',
          userContent: 'Inspect these',
          imageRefs: [imageRef, imageRef2],
          assistantContent: 'First answer',
          assistantStatus: 'completed',
          error: null,
          targetBinding: {
            selection: { kind: 'env_fallback' },
            attribution: { kind: 'env_fallback', modelId: 'model-1' },
          },
          createdAt: '2026-08-09T00:00:00.000Z',
          updatedAt: '2026-08-09T00:00:00.000Z',
        },
        {
          attemptRequestId: 'request-2',
          userMessageId: 'user-2',
          assistantMessageId: 'assistant-2',
          userContent: '',
          imageRefs: [imageRef3],
          assistantContent: '',
          assistantStatus: 'pending',
          error: null,
          targetBinding: {
            selection: { kind: 'env_fallback' },
            attribution: null,
          },
          createdAt: '2026-08-09T00:01:00.000Z',
          updatedAt: '2026-08-09T00:01:00.000Z',
        },
      ],
      createdAt: '2026-08-09T00:00:00.000Z',
      updatedAt: '2026-08-09T00:01:00.000Z',
    })

    await expect(coordinator.materializeProviderMessages(record)).resolves.toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Inspect these' },
          { type: 'image_url', image_url: { url: 'data:image/png;base64,AQ==' } },
          { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,Ag==' } },
        ],
      },
      { role: 'assistant', content: 'First answer' },
      {
        role: 'user',
        content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,Aw==' } }],
      },
    ])
    expect(readCanonical.mock.calls.map(([ref]) => ref.imageId)).toEqual([
      imageRef.imageId,
      imageRef2.imageId,
      imageRef3.imageId,
    ])
  })

  it('materializes user text, images, then verified document text in stored order', async () => {
    const readCanonical = vi.fn(async () => Uint8Array.from([1]))
    const readExtractedText = vi.fn(async () => 'hello document')
    const coordinator = new CurrentThreadSessionCoordinator({
      store: {} as CurrentThreadStore,
      images: { readCanonical } as unknown as CurrentThreadImageFiles,
      documents: { readExtractedText } as unknown as CurrentThreadDocumentFiles,
    })
    const record = parseCurrentThreadRecordV4({
      version: 4,
      threadId: 'thread-1',
      turns: [
        {
          attemptRequestId: 'request-1',
          userMessageId: 'user-1',
          assistantMessageId: 'assistant-1',
          userContent: 'Inspect these',
          imageRefs: [imageRef],
          documentRefs: [
            {
              ...documentRef,
              sourceSha256: newDocument.extractedFromSha256,
              extractedTextSha256: newDocument.extractedFromSha256,
            },
          ],
          assistantContent: '',
          assistantStatus: 'pending',
          error: null,
          targetBinding: {
            selection: { kind: 'env_fallback' },
            attribution: null,
          },
          createdAt: '2026-08-10T00:00:00.000Z',
          updatedAt: '2026-08-10T00:00:00.000Z',
        },
      ],
      createdAt: '2026-08-10T00:00:00.000Z',
      updatedAt: '2026-08-10T00:00:00.000Z',
    })

    await expect(coordinator.materializeProviderMessages(record)).resolves.toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Inspect these' },
          { type: 'image_url', image_url: { url: 'data:image/png;base64,AQ==' } },
          {
            type: 'text',
            text: buildDocumentTextEnvelope('notes.txt', 'hello document'),
          },
        ],
      },
    ])
    expect(readCanonical).toHaveBeenCalledWith(expect.objectContaining(imageRef))
    expect(readExtractedText).toHaveBeenCalledWith(expect.objectContaining(documentRef))
    expect(buildDocumentTextEnvelope('quote".txt', 'body')).toContain('"quote\\\".txt"')
  })

  it('keeps text plus document content in one plain Provider string', async () => {
    const readExtractedText = vi.fn(async () => 'hello document')
    const coordinator = new CurrentThreadSessionCoordinator({
      store: {} as CurrentThreadStore,
      documents: { readExtractedText } as unknown as CurrentThreadDocumentFiles,
    })
    const record = parseCurrentThreadRecordV4({
      version: 4,
      threadId: 'thread-1',
      turns: [
        {
          attemptRequestId: 'request-1',
          userMessageId: 'user-1',
          assistantMessageId: 'assistant-1',
          userContent: 'Inspect this',
          imageRefs: [],
          documentRefs: [
            {
              ...documentRef,
              sourceSha256: newDocument.extractedFromSha256,
              extractedTextSha256: newDocument.extractedFromSha256,
            },
          ],
          assistantContent: '',
          assistantStatus: 'pending',
          error: null,
          targetBinding: {
            selection: { kind: 'env_fallback' },
            attribution: null,
          },
          createdAt: '2026-08-10T00:00:00.000Z',
          updatedAt: '2026-08-10T00:00:00.000Z',
        },
      ],
      createdAt: '2026-08-10T00:00:00.000Z',
      updatedAt: '2026-08-10T00:00:00.000Z',
    })

    await expect(coordinator.materializeProviderMessages(record)).resolves.toEqual([
      {
        role: 'user',
        content: `Inspect this\n\n${buildDocumentTextEnvelope('notes.txt', 'hello document')}`,
      },
    ])
  })

  it('fails the whole Provider build with one safe error when a canonical file is unavailable', async () => {
    const coordinator = new CurrentThreadSessionCoordinator({
      store: {} as CurrentThreadStore,
      images: {
        readCanonical: vi.fn(async () => {
          throw new CurrentThreadImageFilesError('unavailable', '/private/secret-image.full')
        }),
      } as unknown as CurrentThreadImageFiles,
    })

    await expect(
      coordinator.materializeProviderMessages(
        parseCurrentThreadRecordV3({
          version: 3,
          threadId: 'thread-1',
          turns: [
            {
              attemptRequestId: 'request-1',
              userMessageId: 'user-1',
              assistantMessageId: 'assistant-1',
              userContent: '',
              imageRefs: [imageRef],
              assistantContent: '',
              assistantStatus: 'pending',
              error: null,
              targetBinding: {
                selection: { kind: 'env_fallback' },
                attribution: null,
              },
              createdAt: '2026-08-09T00:00:00.000Z',
              updatedAt: '2026-08-09T00:00:00.000Z',
            },
          ],
          createdAt: '2026-08-09T00:00:00.000Z',
          updatedAt: '2026-08-09T00:00:00.000Z',
        }),
      ),
    ).rejects.toMatchObject({
      code: 'invalid_request',
      message: 'A current-thread image is unavailable.',
    })
  })

  it('upgrades version 1 only while appending a real selected turn', async () => {
    const { coordinator, filePath } = await createCoordinator()
    const version1 = parseCurrentThreadRecordV1({
      version: 1,
      threadId: 'thread-1',
      turns: [
        {
          attemptRequestId: 'request-1',
          userMessageId: 'user-1',
          assistantMessageId: 'assistant-1',
          userContent: 'Hello',
          assistantContent: 'Done',
          assistantStatus: 'completed',
          error: null,
          createdAt: '2026-07-10T00:00:00.000Z',
          updatedAt: '2026-07-10T00:01:00.000Z',
        },
      ],
      createdAt: '2026-07-10T00:00:00.000Z',
      updatedAt: '2026-07-10T00:01:00.000Z',
    })
    await writeFile(filePath, `${JSON.stringify(version1)}\n`, 'utf8')

    const prepared = await coordinator.prepare(
      newRequest({
        requestId: 'request-2',
        userMessageId: 'user-2',
        assistantMessageId: 'assistant-2',
        turnUserMessage: { id: 'user-2', content: 'Continue' },
        messages: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Done' },
          { role: 'user', content: 'Continue' },
        ],
      }),
    )

    expect(prepared.replayRecord?.version).toBe(1)
    expect(prepared.pendingRecord).toMatchObject({
      version: 2,
      turns: [
        { targetBinding: null },
        {
          attemptRequestId: 'request-2',
          targetBinding: {
            selection: newRequest().targetSelection,
            attribution: null,
          },
        },
      ],
    })
  })

  it('upgrades on the first image turn and keeps empty image-only history in later requests', async () => {
    const { coordinator } = await createCoordinator()
    await coordinator.prepare(newRequest())
    await coordinator.bindResolvedTarget('request-1', 'assistant-1', firstAttribution)
    await coordinator.complete('request-1', 'assistant-1', 'First answer')

    const imageTurn = await coordinator.prepare(
      newRequest({
        requestId: 'request-2',
        userMessageId: 'user-2',
        assistantMessageId: 'assistant-2',
        turnUserMessage: { id: 'user-2', content: '', imageRefs: [imageRef] },
        newImages: [newImage],
        messages: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'First answer' },
          { role: 'user', content: '' },
        ],
      }),
    )

    expect(imageTurn.pendingRecord).toMatchObject({
      version: 3,
      turns: [{ imageRefs: [] }, { userContent: '', imageRefs: [imageRef] }],
    })

    await coordinator.bindResolvedTarget('request-2', 'assistant-2', firstAttribution)
    await coordinator.complete('request-2', 'assistant-2', 'Image answer')

    const textTurn = await coordinator.prepare(
      newRequest({
        requestId: 'request-3',
        userMessageId: 'user-3',
        assistantMessageId: 'assistant-3',
        turnUserMessage: { id: 'user-3', content: 'Continue' },
        messages: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'First answer' },
          { role: 'user', content: '' },
          { role: 'assistant', content: 'Image answer' },
          { role: 'user', content: 'Continue' },
        ],
      }),
    )

    expect(textTurn.pendingRecord).toMatchObject({
      version: 3,
      turns: [{ imageRefs: [] }, { imageRefs: [imageRef] }, { imageRefs: [] }],
    })
  })

  it('preserves image refs across Retry and rejects a mismatched retry', async () => {
    const { coordinator } = await createCoordinator()
    const request = newRequest({
      turnUserMessage: { id: 'user-1', content: '', imageRefs: [imageRef] },
      messages: [{ role: 'user', content: '' }],
      newImages: [newImage],
    })

    await coordinator.prepare(request)
    await coordinator.bindResolvedTarget('request-1', 'assistant-1', firstAttribution)
    await coordinator.fail('request-1', 'assistant-1', '', {
      code: 'network_error',
      message: 'Retry me.',
      retryable: true,
    })

    const { newImages: _newImages, ...retryRequest } = request

    await expect(
      coordinator.prepare({
        ...retryRequest,
        requestId: 'request-2',
        turnIntent: 'retry_failed_response',
        turnUserMessage: {
          ...request.turnUserMessage,
          imageRefs: [{ ...imageRef, width: 320 }],
        },
      }),
    ).rejects.toMatchObject({ code: 'invalid_request' })

    const retried = await coordinator.prepare({
      ...retryRequest,
      requestId: 'request-2',
      turnIntent: 'retry_failed_response',
    })

    expect(retried.providerMessages).toEqual([{ role: 'user', content: '' }])
    expect(retried.pendingRecord).toMatchObject({
      version: 3,
      turns: [{ attemptRequestId: 'request-2', imageRefs: [imageRef] }],
    })
  })

  it('persists v3 content rejection and reuses the same image on target-switch Retry', async () => {
    const { coordinator, store } = await createCoordinator()
    const request = newRequest({
      turnUserMessage: { id: 'user-1', content: '', imageRefs: [imageRef] },
      messages: [{ role: 'user', content: '' }],
      newImages: [newImage],
    })

    await coordinator.prepare(request)
    await coordinator.bindResolvedTarget('request-1', 'assistant-1', firstAttribution)
    await coordinator.fail('request-1', 'assistant-1', '', {
      code: 'content_rejected',
      message: 'Raw provider body',
      retryable: true,
      details: 'data:image/png;base64,secret',
    })

    await expect(store.read()).resolves.toMatchObject({
      version: 3,
      turns: [
        {
          imageRefs: [imageRef],
          error: {
            code: 'content_rejected',
            message: 'The selected target rejected this image request.',
            retryable: true,
          },
        },
      ],
    })

    const { newImages: _newImages, ...retryRequest } = request
    const retried = await coordinator.prepare({
      ...retryRequest,
      requestId: 'request-2',
      turnIntent: 'retry_failed_response',
      targetSelection: { kind: 'env_fallback' },
    })

    expect(retried.pendingRecord).toMatchObject({
      version: 3,
      turns: [{ attemptRequestId: 'request-2', imageRefs: [imageRef] }],
    })
    await expect(coordinator.materializeProviderMessages(retried.pendingRecord)).resolves.toEqual([
      {
        role: 'user',
        content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,AQ==' } }],
      },
    ])
  })

  it('rejects content rejection settlement for a text-only v2 turn', async () => {
    const { coordinator, store } = await createCoordinator()
    await coordinator.prepare(newRequest())
    await coordinator.bindResolvedTarget('request-1', 'assistant-1', firstAttribution)

    await expect(
      coordinator.fail('request-1', 'assistant-1', '', {
        code: 'content_rejected',
        message: 'Unexpected',
        retryable: true,
      }),
    ).rejects.toMatchObject({ code: 'invalid_request' })
    await expect(store.read()).resolves.toMatchObject({
      version: 2,
      turns: [{ assistantStatus: 'pending', error: null }],
    })
  })

  it('replaces an env attempt binding on Retry without adding attempt history', async () => {
    const { coordinator, store } = await createCoordinator()
    await coordinator.prepare(newRequest({ targetSelection: { kind: 'env_fallback' } }))
    await coordinator.bindResolvedTarget('request-1', 'assistant-1', envAttributionA)
    await coordinator.fail('request-1', 'assistant-1', 'Partial', {
      code: 'network_error',
      message: 'Raw network detail must not persist.',
      retryable: true,
    })

    const prepared = await coordinator.prepare({
      ...newRequest(),
      requestId: 'request-2',
      turnIntent: 'retry_failed_response',
      targetSelection: { kind: 'env_fallback' },
    })

    expect(prepared.replayRecord?.turns[0]).toMatchObject({
      attemptRequestId: 'request-1',
      assistantStatus: 'failed',
      assistantContent: 'Partial',
      error: {
        code: 'network_error',
        message: 'Nyx could not reach the provider.',
      },
      targetBinding: {
        attribution: envAttributionA,
      },
    })
    expect(prepared.pendingRecord.turns[0]).toMatchObject({
      attemptRequestId: 'request-2',
      userMessageId: 'user-1',
      assistantMessageId: 'assistant-1',
      assistantStatus: 'pending',
      assistantContent: '',
      error: null,
      targetBinding: {
        selection: { kind: 'env_fallback' },
        attribution: null,
      },
    })

    await coordinator.bindResolvedTarget('request-2', 'assistant-1', envAttributionB)
    await coordinator.fail('request-2', 'assistant-1', '', {
      code: 'network_error',
      message: 'Retry failed.',
      retryable: true,
    })

    const record = await store.read()

    expect(record?.turns).toHaveLength(1)
    expect(record?.turns[0]).toMatchObject({
      attemptRequestId: 'request-2',
      userMessageId: 'user-1',
      assistantMessageId: 'assistant-1',
      targetBinding: {
        selection: { kind: 'env_fallback' },
        attribution: envAttributionB,
      },
    })
    expect(record && toCurrentThreadSnapshot(record, new Set(), new Set())).toMatchObject({
      selectedTarget: { kind: 'env_fallback' },
      messages: [{ id: 'user-1' }, { id: 'assistant-1', targetAttribution: envAttributionB }],
    })
  })

  it('rejects terminal writes that do not match the durable pending attempt', async () => {
    const { coordinator } = await createCoordinator()
    await coordinator.prepare(newRequest())

    await expect(
      coordinator.complete('stale-request', 'assistant-1', 'Wrong'),
    ).rejects.toMatchObject({
      code: 'invalid_request',
    } satisfies Partial<CurrentThreadSessionError>)
  })
})
