import { describe, expect, it, vi } from 'vitest'

import {
  createSafeThreadErrorRecordV1,
  parseCurrentThreadRecordV1,
  parseCurrentThreadRecordV2,
  parseCurrentThreadRecordV3,
  parseCurrentThreadRecordV4,
  upgradeCurrentThreadRecordForMutation,
} from './schemas'
import { CurrentThreadSnapshotService, toCurrentThreadSnapshot } from './snapshot'
import type { CurrentThreadImageFiles } from './image-files'
import type { CurrentThreadDocumentFiles } from './document-files'

const noAvailableImageIds = new Set<string>()

function completedThenFailedRecord() {
  return parseCurrentThreadRecordV1({
    version: 1,
    threadId: 'thread-1',
    turns: [
      {
        attemptRequestId: 'request-1',
        userMessageId: 'user-1',
        assistantMessageId: 'assistant-1',
        userContent: 'First question',
        assistantContent: 'First answer',
        assistantStatus: 'completed',
        error: null,
        createdAt: '2026-07-11T00:00:00.000Z',
        updatedAt: '2026-07-11T00:01:00.000Z',
      },
      {
        attemptRequestId: 'request-2',
        userMessageId: 'user-2',
        assistantMessageId: 'assistant-2',
        userContent: 'Second question',
        assistantContent: 'Unpersisted provider details are not here.',
        assistantStatus: 'failed',
        error: createSafeThreadErrorRecordV1({ code: 'network_error', retryable: true }),
        createdAt: '2026-07-11T00:02:00.000Z',
        updatedAt: '2026-07-11T00:03:00.000Z',
      },
    ],
    createdAt: '2026-07-11T00:00:00.000Z',
    updatedAt: '2026-07-11T00:03:00.000Z',
  })
}

const imageRef = {
  imageId: '00000000-0000-4000-8000-000000000001',
  mediaType: 'image/png',
  width: 640,
  height: 480,
} as const
const documentRef = {
  documentId: '00000000-0000-4000-8000-000000000010',
  name: 'notes.txt',
  mediaType: 'text/plain',
  byteLength: 5,
  extractedByteLength: 5,
  sourceSha256: 'a'.repeat(64),
  extractedTextSha256: 'b'.repeat(64),
} as const

function failedDocumentOnlyRecord() {
  return parseCurrentThreadRecordV4({
    version: 4,
    threadId: 'thread-1',
    turns: [
      {
        attemptRequestId: 'request-doc',
        userMessageId: 'user-doc',
        assistantMessageId: 'assistant-doc',
        userContent: '',
        imageRefs: [],
        documentRefs: [documentRef],
        assistantContent: '',
        assistantStatus: 'failed',
        error: {
          code: 'network_error',
          message: 'Nyx could not reach the provider.',
          retryable: true,
        },
        targetBinding: {
          selection: { kind: 'env_fallback' },
          attribution: { kind: 'env_fallback', modelId: 'env-model' },
        },
        createdAt: '2026-08-10T00:00:00.000Z',
        updatedAt: '2026-08-10T00:01:00.000Z',
      },
    ],
    createdAt: '2026-08-10T00:00:00.000Z',
    updatedAt: '2026-08-10T00:01:00.000Z',
  })
}

function failedImageOnlyRecord() {
  return parseCurrentThreadRecordV3({
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
        assistantStatus: 'failed',
        error: {
          code: 'network_error',
          message: 'Nyx could not reach the provider.',
          retryable: true,
        },
        targetBinding: {
          selection: { kind: 'env_fallback' },
          attribution: { kind: 'env_fallback', modelId: 'env-model' },
        },
        createdAt: '2026-07-11T00:00:00.000Z',
        updatedAt: '2026-07-11T00:01:00.000Z',
      },
    ],
    createdAt: '2026-07-11T00:00:00.000Z',
    updatedAt: '2026-07-11T00:01:00.000Z',
  })
}

describe('toCurrentThreadSnapshot', () => {
  it('maps terminal messages without exposing persisted metadata', () => {
    const record = completedThenFailedRecord()
    const snapshot = toCurrentThreadSnapshot(record, noAvailableImageIds, new Set())

    expect(snapshot.messages).toEqual([
      {
        id: 'user-1',
        role: 'user',
        content: 'First question',
        status: 'completed',
      },
      {
        id: 'assistant-1',
        role: 'assistant',
        content: 'First answer',
        status: 'completed',
      },
      {
        id: 'user-2',
        role: 'user',
        content: 'Second question',
        status: 'completed',
      },
      {
        id: 'assistant-2',
        role: 'assistant',
        content: 'Unpersisted provider details are not here.',
        status: 'failed',
        error: {
          code: 'network_error',
          message: 'Nyx could not reach the provider.',
          retryable: true,
        },
        canRetry: true,
      },
    ])
    expect(snapshot.runStatus).toBe('failed')
    expect(snapshot.selectedTarget).toBeNull()
    expect(snapshot).not.toHaveProperty('threadId')
    expect(snapshot).not.toHaveProperty('version')
    expect(snapshot).not.toHaveProperty('updatedAt')
  })

  it('derives the latest selection and safe assistant attribution from version 2 bindings', () => {
    const upgraded = upgradeCurrentThreadRecordForMutation(completedThenFailedRecord())
    const connectionAttribution = {
      kind: 'connection',
      providerId: 'provider-1',
      providerDisplayName: 'Provider One',
      modelId: 'model-1',
      modelDisplayName: 'Model One',
    } as const
    const record = parseCurrentThreadRecordV2({
      ...upgraded,
      turns: [
        {
          ...upgraded.turns[0]!,
          targetBinding: {
            selection: { kind: 'connection', providerId: 'provider-1', modelId: 'model-1' },
            attribution: connectionAttribution,
          },
        },
        {
          ...upgraded.turns[1]!,
          targetBinding: {
            selection: { kind: 'env_fallback' },
            attribution: { kind: 'env_fallback', modelId: 'env-model' },
          },
        },
      ],
    })

    const snapshot = toCurrentThreadSnapshot(record, noAvailableImageIds, new Set())

    expect(snapshot.selectedTarget).toEqual({ kind: 'env_fallback' })
    expect(snapshot.messages.find((message) => message.id === 'assistant-1')).toMatchObject({
      targetAttribution: connectionAttribution,
    })
    expect(snapshot.messages.find((message) => message.id === 'assistant-2')).toMatchObject({
      targetAttribution: { kind: 'env_fallback', modelId: 'env-model' },
    })
  })

  it('rebuilds retry metadata while excluding the failed assistant from provider messages', () => {
    const snapshot = toCurrentThreadSnapshot(
      completedThenFailedRecord(),
      noAvailableImageIds,
      new Set(),
    )

    expect(snapshot.retryableTurn).toEqual({
      userMessageId: 'user-2',
      assistantMessageId: 'assistant-2',
      turnUserMessage: {
        id: 'user-2',
        content: 'Second question',
      },
      submittedMessages: [
        { role: 'user', content: 'First question' },
        { role: 'assistant', content: 'First answer' },
        { role: 'user', content: 'Second question' },
      ],
    })
  })

  it('projects v3 image availability without dropping image-only compatibility history', () => {
    const availableSnapshot = toCurrentThreadSnapshot(
      failedImageOnlyRecord(),
      new Set([imageRef.imageId]),
      new Set(),
    )

    expect(availableSnapshot.messages[0]).toMatchObject({
      content: '',
      images: [{ ...imageRef, available: true }],
    })
    expect(availableSnapshot.retryableTurn).toEqual({
      userMessageId: 'user-1',
      assistantMessageId: 'assistant-1',
      turnUserMessage: { id: 'user-1', content: '', imageRefs: [imageRef] },
      submittedMessages: [{ role: 'user', content: '' }],
    })

    expect(
      toCurrentThreadSnapshot(failedImageOnlyRecord(), noAvailableImageIds, new Set()).messages[0],
    ).toMatchObject({
      images: [{ ...imageRef, available: false }],
    })
  })

  it('does not expose Retry on a historical failure after a later turn completes', () => {
    const record = completedThenFailedRecord()
    const laterCompletedRecord = parseCurrentThreadRecordV1({
      ...record,
      turns: [
        ...record.turns,
        {
          attemptRequestId: 'request-3',
          userMessageId: 'user-3',
          assistantMessageId: 'assistant-3',
          userContent: 'Third question',
          assistantContent: 'Third answer',
          assistantStatus: 'completed',
          error: null,
          createdAt: '2026-07-11T00:04:00.000Z',
          updatedAt: '2026-07-11T00:05:00.000Z',
        },
      ],
      updatedAt: '2026-07-11T00:05:00.000Z',
    })

    const snapshot = toCurrentThreadSnapshot(laterCompletedRecord, noAvailableImageIds, new Set())
    const historicalFailure = snapshot.messages.find((message) => message.id === 'assistant-2')

    expect(historicalFailure).toMatchObject({
      status: 'failed',
      canRetry: false,
    })
    expect(snapshot.retryableTurn).toBeNull()
    expect(snapshot.runStatus).toBe('completed')
  })

  it('rejects pending records that were not recovered by the store', () => {
    const record = completedThenFailedRecord()
    const pendingRecord = parseCurrentThreadRecordV1({
      ...record,
      turns: [
        record.turns[0]!,
        {
          ...record.turns[1]!,
          assistantContent: '',
          assistantStatus: 'pending',
          error: null,
        },
      ],
    })

    expect(() => toCurrentThreadSnapshot(pendingRecord, noAvailableImageIds, new Set())).toThrow()
  })
})

describe('CurrentThreadSnapshotService', () => {
  it('returns an empty success without exposing store details', async () => {
    const read = vi.fn(async () => null)
    const service = new CurrentThreadSnapshotService({ resolveReader: () => ({ read }) })

    await expect(service.getSnapshot()).resolves.toEqual({ ok: true, value: null })
  })

  it('maps storage and schema failures to one fixed safe error', async () => {
    const service = new CurrentThreadSnapshotService({
      resolveReader: () => ({
        read: async () => {
          throw new Error('Authorization: Bearer secret at /private/user/current-thread.json')
        },
      }),
    })

    await expect(service.getSnapshot()).resolves.toEqual({
      ok: false,
      error: {
        code: 'load_failed',
        message: 'Nyx could not load the current thread.',
      },
    })
  })

  it('uses the main image owner for bounded pair availability', async () => {
    const record = failedImageOnlyRecord()
    const images = {
      availableImageIds: vi.fn(async () => new Set([imageRef.imageId])),
    } as unknown as CurrentThreadImageFiles
    const service = new CurrentThreadSnapshotService({
      resolveReader: () => ({ read: async () => record }),
      resolveImages: () => images,
    })

    const result = await service.getSnapshot()

    expect(result).toMatchObject({ ok: true })
    expect(result.ok && result.value?.messages[0]).toMatchObject({
      images: [{ ...imageRef, available: true }],
    })
    expect(images.availableImageIds).toHaveBeenCalledWith(record)
  })

  it('projects only safe document metadata and resolves its availability in main', async () => {
    const record = failedDocumentOnlyRecord()
    const documents = {
      availableDocumentIds: vi.fn(async () => new Set([documentRef.documentId])),
    } as unknown as CurrentThreadDocumentFiles
    const service = new CurrentThreadSnapshotService({
      resolveReader: () => ({ read: async () => record }),
      resolveDocuments: () => documents,
    })

    const result = await service.getSnapshot()

    expect(result.ok && result.value?.messages[0]).toEqual({
      id: 'user-doc',
      role: 'user',
      content: '',
      status: 'completed',
      documents: [
        {
          documentId: documentRef.documentId,
          name: documentRef.name,
          mediaType: documentRef.mediaType,
          byteLength: documentRef.byteLength,
          extractedByteLength: documentRef.extractedByteLength,
          available: true,
        },
      ],
    })
    expect(JSON.stringify(result)).not.toMatch(/sha256|aaaa|bbbb/u)
    expect(result.ok && result.value?.retryableTurn?.turnUserMessage.documentRefs).toEqual([
      {
        documentId: documentRef.documentId,
        name: documentRef.name,
        mediaType: documentRef.mediaType,
        byteLength: documentRef.byteLength,
        extractedByteLength: documentRef.extractedByteLength,
      },
    ])
  })
})
