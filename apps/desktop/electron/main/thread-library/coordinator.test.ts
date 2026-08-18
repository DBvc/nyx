import { describe, expect, it, vi } from 'vitest'

import type { ResponsesContinuationStateV1 } from '../chat/provider-stream'
import type { ThreadLibraryClient } from './client'
import { ThreadLibraryCoordinator } from './coordinator'
import type { ThreadLibraryThreadDetail } from './protocol'
import type { ThreadLibrarySidecars } from './sidecars'

const threadId = '00000000-0000-4000-8000-000000000001'
const imageId = '00000000-0000-4000-8000-000000000002'
const documentId = '00000000-0000-4000-8000-000000000003'
const stateId = '00000000-0000-4000-8000-000000000004'
const timestamp = '2026-08-12T00:00:00.000Z'
const selection = { kind: 'env_fallback' } as const

function detail(): ThreadLibraryThreadDetail {
  return {
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
      targetSelection: selection,
      updatedAt: timestamp,
    },
    turns: [],
    images: [],
    documents: [],
    providerStateRefs: [],
  }
}

function continuation(): ResponsesContinuationStateV1 {
  return {
    version: 1,
    protocol: 'openai-responses',
    effectiveReasoningContext: null,
    outputItems: [
      {
        type: 'message',
        role: 'assistant',
        status: 'completed',
        content: [{ type: 'output_text', text: 'Answer', annotations: [] }],
      },
    ],
  }
}

function createCoordinator() {
  const client = {
    materialize: vi.fn(),
    saveDraft: vi.fn(),
    startTurn: vi.fn(),
    retryTurn: vi.fn(),
    bindTurnTarget: vi.fn(),
    settleTurn: vi.fn(),
    readThread: vi.fn(),
    setResourceAvailability: vi.fn(),
    repairProviderStateRef: vi.fn(),
  }
  const response = {
    ref: {
      protocol: 'openai-responses' as const,
      stateId,
      executionIdentity: 'a'.repeat(64),
      byteLength: 3,
      sha256: 'b'.repeat(64),
    },
    bytes: new Uint8Array([1, 2, 3]),
  }
  const sidecars = {
    publishImages: vi.fn(async (_threadId: string, rows: ReadonlyArray<unknown>) =>
      rows.length === 0
        ? []
        : [
            {
              imageId,
              position: 0,
              mediaType: 'image/png' as const,
              width: 2,
              height: 1,
              available: true,
            },
          ],
    ),
    publishDocuments: vi.fn(async (_threadId: string, rows: ReadonlyArray<unknown>) =>
      rows.length === 0
        ? []
        : [
            {
              documentId,
              position: 0,
              name: 'notes.txt',
              mediaType: 'text/plain' as const,
              byteLength: 5,
              extractedByteLength: 5,
              sourceSha256: 'c'.repeat(64),
              extractedTextSha256: 'd'.repeat(64),
              available: true,
              extractedText: 'notes',
            },
          ],
    ),
    rollbackImages: vi.fn(async () => undefined),
    rollbackDocuments: vi.fn(async () => undefined),
    prepareResponse: vi.fn(() => response),
    publishResponseBytes: vi.fn(async () => undefined),
    rollbackResponse: vi.fn(async () => undefined),
    readCanonicalImage: vi.fn(async () => new Uint8Array([1])),
    readResponseState: vi.fn(async () => continuation()),
    inspect: vi.fn(),
    cleanupOrphans: vi.fn(async () => undefined),
  }
  return {
    client,
    sidecars,
    response,
    coordinator: new ThreadLibraryCoordinator({
      client: client as unknown as ThreadLibraryClient,
      sidecars: sidecars as unknown as ThreadLibrarySidecars,
      generateId: () => stateId,
    }),
  }
}

describe('ThreadLibraryCoordinator', () => {
  it('classifies the exact Provider history before Draft mutation', async () => {
    const { client, coordinator, sidecars } = createCoordinator()
    const canonical = detail()
    canonical.images.push({
      threadId,
      owner: 'draft',
      turnOrdinal: null,
      position: 0,
      imageId,
      mediaType: 'image/png',
      width: 2,
      height: 1,
      available: true,
    })
    client.readThread.mockResolvedValue({ id: 'read', ok: true, value: canonical })
    sidecars.inspect.mockResolvedValue({
      images: [],
      documents: [],
      corruptProviderStateRefs: [],
    })

    await expect(
      coordinator.classifyTurn({
        threadId,
        requestId: 'request-new',
        turnIntent: 'new_user_message',
        expectedDraftRevision: 0,
      }),
    ).resolves.toBe(true)
    await expect(
      coordinator.classifyTurn({
        threadId,
        requestId: 'request-retry',
        turnIntent: 'retry_failed_response',
        turnOrdinal: 0,
        expectedAttemptRequestId: 'request-old',
        expectedDraftRevision: 0,
      }),
    ).resolves.toBe(false)
    expect(client.startTurn).not.toHaveBeenCalled()
    expect(client.retryTurn).not.toHaveBeenCalled()
  })

  it('checks preflight Stop immediately before Draft-to-pending mutation', async () => {
    const { client, coordinator, sidecars } = createCoordinator()
    client.readThread.mockResolvedValue({ id: 'read', ok: true, value: detail() })
    sidecars.inspect.mockResolvedValue({
      images: [],
      documents: [],
      corruptProviderStateRefs: [],
    })
    const controller = new AbortController()
    controller.abort()

    await expect(
      coordinator.prepareTurn(
        {
          threadId,
          requestId: 'request-new',
          turnIntent: 'new_user_message',
          expectedDraftRevision: 0,
        },
        controller.signal,
      ),
    ).rejects.toMatchObject({ code: 'cancelled' })
    expect(client.startTurn).not.toHaveBeenCalled()
  })

  it('keeps an exact settlement failure when storage is replaced', async () => {
    const { client, coordinator, response, sidecars } = createCoordinator()
    client.settleTurn.mockRejectedValueOnce(new Error('Worker exited'))
    await expect(
      coordinator.settleTurn({
        threadId,
        requestId: 'request-1',
        assistantStatus: 'completed',
        assistantContent: 'Answer',
        error: null,
        settledAt: timestamp,
        continuation: { executionIdentity: 'a'.repeat(64), state: continuation() },
      }),
    ).rejects.toThrow()

    const replacementClient = { ...client, settleTurn: vi.fn(async () => ({ ok: true })) }
    const replacementSidecars = { ...sidecars }
    coordinator.replaceStorage(replacementClient as never, replacementSidecars as never)

    await expect(coordinator.retrySettlement(threadId, 'request-1')).resolves.toMatchObject({
      ok: true,
    })
    expect(replacementClient.settleTurn).toHaveBeenCalledOnce()
    expect(replacementSidecars.publishResponseBytes).toHaveBeenLastCalledWith(
      threadId,
      response.ref,
      response.bytes,
      'Answer',
    )
  })

  it('publishes one complete initial Draft before materialize and keeps unknown sidecars', async () => {
    const { client, sidecars, coordinator } = createCoordinator()
    client.readThread.mockResolvedValue({ id: 'read', ok: true, value: null })
    client.materialize.mockResolvedValueOnce({
      id: 'materialize-failed',
      ok: false,
      safeError: { code: 'library_unavailable', message: 'The Thread Library is unavailable.' },
      outcome: 'definitely_not_committed',
    })
    const input = {
      threadId,
      draft: { text: 'Hello', targetSelection: selection, images: [], documents: [] },
      fallbackLocalSecond: '2026-08-12T08:00:00',
      createdAt: timestamp,
    }
    const newImages = [
      {
        ref: { imageId, mediaType: 'image/png' as const, width: 2, height: 1 },
        image: {
          imageId,
          canonicalBytes: new Uint8Array([1]),
          previewBytes: new Uint8Array([2]),
        },
        position: 0,
      },
    ]
    const newDocuments = [
      {
        ref: {
          documentId,
          name: 'notes.txt',
          mediaType: 'text/plain' as const,
          byteLength: 5,
          extractedByteLength: 5,
        },
        document: {
          documentId,
          sourceBytes: new Uint8Array([1]),
          extractedTextBytes: new Uint8Array([2]),
          extractedFromSha256: 'a'.repeat(64),
        },
        position: 0,
      },
    ]

    await coordinator.materialize({ input, newImages, newDocuments })
    expect(client.materialize).toHaveBeenCalledWith({
      ...input,
      draft: expect.objectContaining({
        text: 'Hello',
        images: [expect.objectContaining({ imageId })],
        documents: [expect.objectContaining({ documentId, extractedText: 'notes' })],
      }),
    })
    expect(sidecars.publishImages.mock.invocationCallOrder[0]).toBeLessThan(
      client.materialize.mock.invocationCallOrder[0]!,
    )
    expect(sidecars.rollbackImages).toHaveBeenCalledWith(threadId, [imageId])
    expect(sidecars.rollbackDocuments).toHaveBeenCalledWith(threadId, [documentId])

    sidecars.rollbackImages.mockClear()
    sidecars.rollbackDocuments.mockClear()
    client.materialize.mockResolvedValueOnce({
      id: 'materialize-unknown',
      ok: false,
      safeError: { code: 'library_unavailable', message: 'The Thread Library is unavailable.' },
      outcome: 'outcome_unknown',
    })
    await coordinator.materialize({ input, newImages, newDocuments })
    expect(sidecars.rollbackImages).not.toHaveBeenCalled()
    expect(sidecars.rollbackDocuments).not.toHaveBeenCalled()
  })

  it('prepares pending identity before history materialization and replays only prior Runtime turns', async () => {
    const { client, sidecars, coordinator } = createCoordinator()
    const before = detail()
    before.draft = { ...before.draft, text: 'Next', draftRevision: 4 }
    before.turns = [
      {
        threadId,
        ordinal: 0,
        attemptRequestId: 'request-old',
        userMessageId: 'user-old',
        assistantMessageId: 'assistant-old',
        userContent: 'Old',
        assistantContent: 'Answer',
        assistantStatus: 'completed',
        error: null,
        targetSelection: selection,
        targetAttribution: { kind: 'env_fallback', modelId: 'model' },
        providerStateId: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ]
    const pending = detail()
    pending.draft = { ...pending.draft, draftRevision: 5 }
    pending.turns = [
      ...before.turns,
      {
        ...before.turns[0]!,
        ordinal: 1,
        attemptRequestId: 'request-new',
        userMessageId: stateId,
        assistantMessageId: stateId,
        userContent: 'Next',
        assistantContent: '',
        assistantStatus: 'pending',
        targetAttribution: null,
      },
    ]
    client.readThread.mockResolvedValueOnce({ id: 'read', ok: true, value: before })
    sidecars.inspect.mockResolvedValueOnce({
      images: [],
      documents: [],
      corruptProviderStateRefs: [],
    })
    client.startTurn.mockResolvedValueOnce({
      id: 'start',
      ok: true,
      value: { status: 'committed', detail: pending },
    })

    const prepared = await coordinator.prepareTurn({
      threadId,
      requestId: 'request-new',
      turnIntent: 'new_user_message',
      expectedDraftRevision: 4,
    })
    expect(prepared.runtimeReplayDetail).toBe(before)
    expect(client.startTurn).toHaveBeenCalledOnce()

    const runtime = {
      submitUserMessage: vi.fn(async () => undefined),
      startAssistant: vi.fn(async () => undefined),
      appendDelta: vi.fn(async () => undefined),
      complete: vi.fn(async () => undefined),
      cancel: vi.fn(async () => undefined),
      fail: vi.fn(async () => undefined),
    }
    await coordinator.replayRuntimeHistory(runtime as never, prepared.runtimeReplayDetail)
    expect(runtime.submitUserMessage).toHaveBeenCalledTimes(1)
    expect(runtime.submitUserMessage).toHaveBeenCalledWith(
      expect.objectContaining({ turnRequestId: 'request-old' }),
    )
  })

  it('materializes exact text, image, document, and Responses history from canonical rows', async () => {
    const { sidecars, coordinator, response } = createCoordinator()
    const canonical = detail()
    canonical.turns = [
      {
        threadId,
        ordinal: 0,
        attemptRequestId: 'request-1',
        userMessageId: 'user-1',
        assistantMessageId: 'assistant-1',
        userContent: 'Inspect',
        assistantContent: 'Answer',
        assistantStatus: 'completed',
        error: null,
        targetSelection: selection,
        targetAttribution: { kind: 'env_fallback', modelId: 'model' },
        providerStateId: stateId,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ]
    canonical.images = [
      {
        threadId,
        owner: 'turn',
        turnOrdinal: 0,
        position: 0,
        imageId,
        mediaType: 'image/png',
        width: 2,
        height: 1,
        available: true,
      },
    ]
    canonical.documents = [
      {
        threadId,
        owner: 'turn',
        turnOrdinal: 0,
        position: 0,
        documentId,
        name: 'notes.txt',
        mediaType: 'text/plain',
        byteLength: 5,
        extractedByteLength: 5,
        sourceSha256: 'c'.repeat(64),
        extractedTextSha256: 'd'.repeat(64),
        available: true,
        extractedText: 'canonical notes',
      },
    ]
    canonical.providerStateRefs = [{ ...response.ref, threadId, turnOrdinal: 0 }]

    await expect(
      coordinator.materializeProviderMessages(canonical, {
        protocolConfig: { protocol: 'openai-chat-completions' },
        executionIdentity: 'a'.repeat(64),
      }),
    ).resolves.toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Inspect' },
          { type: 'image_url', image_url: { url: 'data:image/png;base64,AQ==' } },
          {
            type: 'text',
            text: expect.stringContaining('canonical notes'),
          },
        ],
      },
      { role: 'assistant', content: 'Answer' },
    ])
    await expect(
      coordinator.materializeProviderMessages(canonical, {
        protocolConfig: { protocol: 'openai-responses', reasoningContext: 'auto' },
        executionIdentity: 'a'.repeat(64),
      }),
    ).resolves.toEqual([
      expect.objectContaining({ role: 'user' }),
      ...continuation().outputItems.map((item) => ({ kind: 'responses-output-item', item })),
    ])
    expect(sidecars.readCanonicalImage).toHaveBeenCalledWith(threadId, canonical.images[0])
    expect(sidecars.readResponseState).toHaveBeenCalledWith(
      threadId,
      canonical.providerStateRefs[0],
    )
  })

  it('publishes new Draft files before the CAS and removes only definitely unreferenced files', async () => {
    const { client, sidecars, coordinator } = createCoordinator()
    client.readThread.mockResolvedValue({ id: 'read', ok: true, value: null })
    client.saveDraft.mockResolvedValueOnce({
      id: 'save-1',
      ok: true,
      value: { status: 'conflict', canonicalDraftRevision: 1 },
    })
    const input = {
      threadId,
      expectedDraftRevision: 0,
      draft: { text: 'Hello', targetSelection: selection, images: [], documents: [] },
      savedAt: timestamp,
    }
    await expect(
      coordinator.saveDraft({
        input,
        newImages: [
          {
            ref: { imageId, mediaType: 'image/png', width: 2, height: 1 },
            image: {
              imageId,
              canonicalBytes: new Uint8Array([1]),
              previewBytes: new Uint8Array([2]),
            },
            position: 0,
          },
        ],
        newDocuments: [
          {
            ref: {
              documentId,
              name: 'notes.txt',
              mediaType: 'text/plain',
              byteLength: 5,
              extractedByteLength: 5,
            },
            document: {
              documentId,
              sourceBytes: new Uint8Array([1]),
              extractedTextBytes: new Uint8Array([2]),
              extractedFromSha256: 'a'.repeat(64),
            },
            position: 0,
          },
        ],
      }),
    ).resolves.toMatchObject({ value: { status: 'conflict' } })
    expect(client.saveDraft).toHaveBeenCalledWith({
      ...input,
      draft: expect.objectContaining({
        images: [expect.objectContaining({ imageId })],
        documents: [expect.objectContaining({ documentId })],
      }),
    })
    expect(sidecars.rollbackImages).toHaveBeenCalledWith(threadId, [imageId])
    expect(sidecars.rollbackDocuments).toHaveBeenCalledWith(threadId, [documentId])

    sidecars.rollbackImages.mockClear()
    sidecars.rollbackDocuments.mockClear()
    client.saveDraft.mockResolvedValueOnce({
      id: 'save-2',
      ok: false,
      safeError: { code: 'library_unavailable', message: 'The Thread Library is unavailable.' },
      outcome: 'outcome_unknown',
    })
    await coordinator.saveDraft({ input })
    expect(sidecars.rollbackImages).not.toHaveBeenCalled()
    expect(sidecars.rollbackDocuments).not.toHaveBeenCalled()
  })

  it('keeps canonically referenced retry files and reconciles only true unknown orphans', async () => {
    const { client, sidecars, coordinator } = createCoordinator()
    const input = {
      threadId,
      expectedDraftRevision: 0,
      draft: { text: 'Hello', targetSelection: selection, images: [], documents: [] },
      savedAt: timestamp,
    }
    const newImages = [
      {
        ref: { imageId, mediaType: 'image/png' as const, width: 2, height: 1 },
        image: {
          imageId,
          canonicalBytes: new Uint8Array([1]),
          previewBytes: new Uint8Array([2]),
        },
        position: 0,
      },
    ]
    const canonical = detail()
    canonical.images = [
      {
        threadId,
        owner: 'draft',
        turnOrdinal: null,
        position: 0,
        imageId,
        mediaType: 'image/png',
        width: 2,
        height: 1,
        available: true,
      },
    ]
    client.saveDraft.mockResolvedValueOnce({
      id: 'save-retry',
      ok: true,
      value: { status: 'conflict', canonicalDraftRevision: 1 },
    })
    client.readThread.mockResolvedValueOnce({ id: 'read-canonical', ok: true, value: canonical })
    await coordinator.saveDraft({ input, newImages })
    expect(sidecars.rollbackImages).toHaveBeenCalledWith(threadId, [])

    sidecars.rollbackImages.mockClear()
    client.saveDraft.mockResolvedValueOnce({
      id: 'save-conflict-without-read',
      ok: true,
      value: { status: 'conflict', canonicalDraftRevision: 2 },
    })
    client.readThread.mockRejectedValueOnce(new Error('read lost'))
    await coordinator.saveDraft({ input, newImages })
    expect(sidecars.rollbackImages).not.toHaveBeenCalled()

    client.saveDraft.mockResolvedValueOnce({
      id: 'save-unknown',
      ok: false,
      safeError: { code: 'library_unavailable', message: 'The Thread Library is unavailable.' },
      outcome: 'outcome_unknown',
    })
    await coordinator.saveDraft({ input, newImages })
    expect(sidecars.rollbackImages).not.toHaveBeenCalled()

    client.readThread.mockResolvedValueOnce({ id: 'read-reconciled', ok: true, value: detail() })
    sidecars.inspect.mockResolvedValueOnce({
      images: [],
      documents: [],
      corruptProviderStateRefs: [],
    })
    await coordinator.reconcileThread(threadId, timestamp)
    expect(sidecars.rollbackImages).toHaveBeenCalledWith(threadId, [imageId])
    expect(sidecars.cleanupOrphans).toHaveBeenCalled()
  })

  it('keeps dirty Draft input through publication and database failures', async () => {
    const { client, sidecars, coordinator } = createCoordinator()
    const input = {
      threadId,
      expectedDraftRevision: 0,
      draft: { text: 'Unsaved', targetSelection: selection, images: [], documents: [] },
      savedAt: timestamp,
    }
    const newImages = [
      {
        ref: { imageId, mediaType: 'image/png' as const, width: 2, height: 1 },
        image: {
          imageId,
          canonicalBytes: new Uint8Array([1]),
          previewBytes: new Uint8Array([2]),
        },
        position: 0,
      },
    ]
    sidecars.publishDocuments.mockRejectedValueOnce(new Error('verify failed'))
    client.readThread.mockResolvedValueOnce({ id: 'read-after-verify', ok: true, value: null })
    await expect(
      coordinator.saveDraft({
        input,
        newImages,
        newDocuments: [
          {
            ref: {
              documentId,
              name: 'notes.txt',
              mediaType: 'text/plain',
              byteLength: 5,
              extractedByteLength: 5,
            },
            document: {
              documentId,
              sourceBytes: new Uint8Array([1]),
              extractedTextBytes: new Uint8Array([2]),
              extractedFromSha256: 'a'.repeat(64),
            },
            position: 0,
          },
        ],
      }),
    ).rejects.toThrow('verify failed')
    expect(input.draft.text).toBe('Unsaved')
    expect(client.saveDraft).not.toHaveBeenCalled()

    sidecars.publishDocuments.mockResolvedValueOnce([])
    client.saveDraft.mockResolvedValueOnce({
      id: 'database-failed',
      ok: false,
      safeError: { code: 'library_unavailable', message: 'The Thread Library is unavailable.' },
      outcome: 'definitely_not_committed',
    })
    client.readThread.mockResolvedValueOnce({ id: 'read-after-database', ok: true, value: null })
    await expect(coordinator.saveDraft({ input, newImages })).resolves.toMatchObject({
      ok: false,
      outcome: 'definitely_not_committed',
    })
    expect(input.draft.text).toBe('Unsaved')
    expect(sidecars.rollbackImages).toHaveBeenLastCalledWith(threadId, [imageId])
  })

  it('retains one exact failed terminal input and retries it without another Provider result', async () => {
    const { client, sidecars, response, coordinator } = createCoordinator()
    client.settleTurn
      .mockResolvedValueOnce({
        id: 'settle-1',
        ok: false,
        safeError: { code: 'library_unavailable', message: 'The Thread Library is unavailable.' },
        outcome: 'definitely_not_committed',
      })
      .mockResolvedValueOnce({ id: 'settle-2', ok: true, value: detail() })

    const first = await coordinator.settleTurn({
      threadId,
      requestId: 'request-1',
      assistantStatus: 'completed',
      assistantContent: 'Answer',
      error: null,
      settledAt: timestamp,
      continuation: { executionIdentity: 'a'.repeat(64), state: continuation() },
    })
    expect(first).toMatchObject({ ok: false, outcome: 'definitely_not_committed' })
    expect(coordinator.settlementFailureThreadIds()).toEqual([threadId])
    expect(sidecars.rollbackResponse).toHaveBeenCalledWith(threadId, stateId)

    await expect(coordinator.retrySettlement(threadId)).resolves.toMatchObject({ ok: true })
    expect(coordinator.settlementFailureThreadIds()).toEqual([])
    expect(sidecars.prepareResponse).toHaveBeenCalledTimes(1)
    expect(sidecars.publishResponseBytes).toHaveBeenCalledTimes(2)
    expect(sidecars.publishResponseBytes).toHaveBeenNthCalledWith(
      2,
      threadId,
      response.ref,
      response.bytes,
      'Answer',
    )
    expect(client.settleTurn.mock.calls[0]![0]).toEqual(client.settleTurn.mock.calls[1]![0])
  })

  it('retains the stable Responses identity when preparation fails before the database call', async () => {
    const { client, sidecars, coordinator } = createCoordinator()
    const prepareError = new Error('prepare failed')
    sidecars.prepareResponse.mockImplementationOnce(() => {
      throw prepareError
    })
    sidecars.prepareResponse.mockImplementationOnce(() => ({
      ref: {
        protocol: 'openai-responses',
        stateId,
        executionIdentity: 'a'.repeat(64),
        byteLength: 3,
        sha256: 'b'.repeat(64),
      },
      bytes: new Uint8Array([1, 2, 3]),
    }))
    client.settleTurn.mockResolvedValueOnce({ id: 'settled', ok: true, value: detail() })
    const input = {
      threadId,
      requestId: 'request-prepare',
      assistantStatus: 'completed' as const,
      assistantContent: 'Answer',
      error: null,
      settledAt: timestamp,
      continuation: { executionIdentity: 'a'.repeat(64), state: continuation() },
    }

    await expect(coordinator.settleTurn(input)).rejects.toBe(prepareError)
    expect(coordinator.settlementFailureThreadIds()).toEqual([threadId])
    expect(client.settleTurn).not.toHaveBeenCalled()
    await expect(coordinator.retrySettlement(threadId)).resolves.toMatchObject({ ok: true })
    expect(sidecars.prepareResponse).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ stateId }),
    )
    expect(sidecars.prepareResponse).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ stateId }),
    )
    expect(client.settleTurn).toHaveBeenCalledTimes(1)
  })

  it('retains a canonical pending settlement and removes a mismatched terminal orphan', async () => {
    const { client, sidecars, coordinator } = createCoordinator()
    client.settleTurn
      .mockResolvedValueOnce({
        id: 'pending-after-reply-loss',
        ok: false,
        safeError: { code: 'library_unavailable', message: 'The Thread Library is unavailable.' },
        outcome: 'definitely_not_committed',
      })
      .mockResolvedValueOnce({ id: 'retry-committed', ok: true, value: detail() })
      .mockResolvedValueOnce({
        id: 'other-terminal-won',
        ok: false,
        safeError: { code: 'not_pending', message: 'This turn is no longer pending.' },
        outcome: 'definitely_not_committed',
      })
    const input = {
      threadId,
      requestId: 'request-terminal-race',
      assistantStatus: 'completed' as const,
      assistantContent: 'Answer',
      error: null,
      settledAt: timestamp,
      continuation: { executionIdentity: 'a'.repeat(64), state: continuation() },
    }

    await coordinator.settleTurn(input)
    expect(coordinator.settlementFailureThreadIds()).toEqual([threadId])
    await coordinator.retrySettlement(threadId)
    expect(coordinator.settlementFailureThreadIds()).toEqual([])

    await coordinator.settleTurn({ ...input, requestId: 'request-loser' })
    expect(sidecars.rollbackResponse).toHaveBeenLastCalledWith(threadId, stateId)
    expect(coordinator.settlementFailureThreadIds()).toEqual([])
  })

  it('updates only changed availability, repairs the exact corrupt ref, then cleans orphans', async () => {
    const { client, sidecars, response, coordinator } = createCoordinator()
    const initial = detail()
    initial.images = [
      {
        threadId,
        owner: 'draft',
        turnOrdinal: null,
        position: 0,
        imageId,
        mediaType: 'image/png',
        width: 2,
        height: 1,
        available: true,
      },
    ]
    initial.turns = [
      {
        threadId,
        ordinal: 0,
        attemptRequestId: 'request-1',
        userMessageId: 'user-1',
        assistantMessageId: 'assistant-1',
        userContent: 'Hello',
        assistantContent: 'Answer',
        assistantStatus: 'completed',
        error: null,
        targetSelection: selection,
        targetAttribution: { kind: 'env_fallback', modelId: 'model' },
        providerStateId: stateId,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ]
    initial.providerStateRefs = [{ ...response.ref, threadId, turnOrdinal: 0 }]
    const available = { ...initial, images: [{ ...initial.images[0]!, available: false }] }
    const repaired = {
      ...available,
      turns: [{ ...available.turns[0]!, providerStateId: null }],
      providerStateRefs: [],
    }
    client.readThread.mockResolvedValue({ id: 'read', ok: true, value: initial })
    sidecars.inspect.mockResolvedValue({
      images: [{ id: imageId, available: false }],
      documents: [],
      corruptProviderStateRefs: [{ requestId: 'request-1', ref: initial.providerStateRefs[0] }],
    })
    client.setResourceAvailability.mockResolvedValue({
      id: 'availability',
      ok: true,
      value: available,
    })
    client.repairProviderStateRef.mockResolvedValue({ id: 'repair', ok: true, value: repaired })

    await expect(coordinator.reconcileThread(threadId, timestamp)).resolves.toEqual(repaired)
    expect(client.setResourceAvailability).toHaveBeenCalledWith({
      threadId,
      images: [{ id: imageId, available: false }],
      documents: [],
      checkedAt: timestamp,
    })
    expect(client.repairProviderStateRef).toHaveBeenCalledWith(
      expect.objectContaining({ threadId, requestId: 'request-1', repairedAt: timestamp }),
    )
    expect(sidecars.rollbackResponse).toHaveBeenCalledWith(threadId, stateId)
    expect(sidecars.cleanupOrphans).toHaveBeenCalledWith(repaired)
  })

  it('isolates repair and cleanup failures from a second healthy Thread', async () => {
    const { client, sidecars, response, coordinator } = createCoordinator()
    const corrupt = detail()
    corrupt.turns = [
      {
        threadId,
        ordinal: 0,
        attemptRequestId: 'request-corrupt',
        userMessageId: 'user-corrupt',
        assistantMessageId: 'assistant-corrupt',
        userContent: 'Hello',
        assistantContent: 'Answer',
        assistantStatus: 'completed',
        error: null,
        targetSelection: selection,
        targetAttribution: { kind: 'env_fallback', modelId: 'model' },
        providerStateId: stateId,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ]
    corrupt.providerStateRefs = [{ ...response.ref, threadId, turnOrdinal: 0 }]
    client.readThread.mockResolvedValueOnce({ id: 'read-corrupt', ok: true, value: corrupt })
    sidecars.inspect.mockResolvedValueOnce({
      images: [],
      documents: [],
      corruptProviderStateRefs: [
        { requestId: 'request-corrupt', ref: corrupt.providerStateRefs[0] },
      ],
    })
    client.repairProviderStateRef.mockResolvedValueOnce({
      id: 'repair-conflict',
      ok: false,
      safeError: { code: 'thread_unavailable', message: 'This thread is unavailable.' },
      outcome: 'definitely_not_committed',
    })
    await expect(coordinator.reconcileThread(threadId, timestamp)).rejects.toThrow(
      'This thread is unavailable.',
    )

    const healthyThreadId = '00000000-0000-4000-8000-000000000099'
    const healthy = detail()
    healthy.summary.id = healthyThreadId
    healthy.draft.threadId = healthyThreadId
    client.readThread.mockResolvedValueOnce({ id: 'read-healthy', ok: true, value: healthy })
    sidecars.inspect.mockResolvedValueOnce({
      images: [],
      documents: [],
      corruptProviderStateRefs: [],
    })
    sidecars.cleanupOrphans.mockRejectedValueOnce(new Error('cleanup failed'))
    await expect(coordinator.reconcileThread(healthyThreadId, timestamp)).rejects.toThrow(
      'cleanup failed',
    )
    client.readThread.mockResolvedValueOnce({ id: 'read-healthy-retry', ok: true, value: healthy })
    sidecars.inspect.mockResolvedValueOnce({
      images: [],
      documents: [],
      corruptProviderStateRefs: [],
    })
    sidecars.cleanupOrphans.mockResolvedValueOnce(undefined)
    await expect(coordinator.reconcileThread(healthyThreadId, timestamp)).resolves.toEqual(healthy)
  })
})
