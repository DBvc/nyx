import { describe, expect, it, vi } from 'vitest'

import type { ThreadLibraryAcknowledgement } from './client'
import type { ThreadLibraryThreadDetail } from './protocol'
import { ThreadLibraryService } from './service'

const threadId = '00000000-0000-4000-8000-000000000001'
const otherThreadId = '00000000-0000-4000-8000-000000000004'
const imageId = '00000000-0000-4000-8000-000000000002'
const generation = '00000000-0000-4000-8000-000000000003'
const createdAt = '2026-08-13T00:00:00.000Z'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((next) => {
    resolve = next
  })
  return { promise, resolve }
}

function detail(): ThreadLibraryThreadDetail {
  return {
    summary: {
      id: threadId,
      location: 'available' as const,
      trashedFromLocation: null,
      trashedPinPosition: null,
      pinPosition: null,
      title: 'Thread',
      titleSource: 'auto' as const,
      fallbackLocalSecond: '2026-08-13T08:00:00',
      fallbackOrdinal: null,
      threadRevision: 1,
      lastUserActivityAt: createdAt,
      resultRevision: 0,
      seenResultRevision: 0,
      createdAt,
      updatedAt: createdAt,
    },
    draft: {
      threadId,
      draftRevision: 0,
      text: 'Draft',
      targetSelection: { kind: 'env_fallback' as const },
      updatedAt: createdAt,
    },
    turns: [],
    images: [
      {
        threadId,
        owner: 'draft' as const,
        turnOrdinal: null,
        position: 0,
        imageId,
        mediaType: 'image/png' as const,
        width: 2,
        height: 1,
        available: true,
      },
    ],
    documents: [],
    providerStateRefs: [],
  }
}

function harness() {
  let observer: ((acknowledgement: ThreadLibraryAcknowledgement) => void) | undefined
  const clock = { generation, watermark: 0 }
  const client = {
    setAcknowledgementObserver: vi.fn((next) => {
      observer = next
    }),
    currentClock: vi.fn(() => clock),
    listPage: vi.fn(async () => ({
      id: 'list',
      ok: true as const,
      value: {
        rows: [
          {
            availability: 'available' as const,
            id: threadId,
            location: 'available' as const,
            title: 'Thread',
            pinPosition: null,
            lastUserActivityAt: createdAt,
            createdAt,
            updatedAt: createdAt,
            threadRevision: 1,
            resultRevision: 0,
            seenResultRevision: 0,
          },
        ],
        nextCursor: null,
        includedThroughCursor: 0,
      },
      clock: { ...clock, actualMutation: false },
    })),
    search: vi.fn(async () => ({
      id: 'search',
      ok: true as const,
      value: {
        results: [
          {
            threadId,
            title: 'Thread',
            location: 'available' as const,
            source: 'user_message' as const,
            snippet: 'needle',
            messageId: 'message-1',
          },
        ],
        truncated: false,
      },
      clock: { ...clock, actualMutation: false },
    })),
    snapshot: vi.fn(async () => ({
      id: 'snapshot',
      ok: true as const,
      value: { detail: detail(), includedThroughCursor: 1 },
      clock: { generation, watermark: 1, actualMutation: false },
    })),
    readThread: vi.fn(async () => ({
      id: 'read',
      ok: true as const,
      value: detail(),
      clock: { generation, watermark: 1, actualMutation: false },
    })),
    updatePin: vi.fn(async () => {
      const pinned = detail()
      pinned.summary.pinPosition = 1
      const acknowledgement = {
        operation: 'updatePin' as const,
        value: pinned,
        clock: { generation, watermark: 1, actualMutation: true },
      }
      observer?.(acknowledgement)
      return { id: 'update-pin', ok: true as const, ...acknowledgement }
    }),
    rename: vi.fn(async (input: { title: string; renamedAt: string }) => {
      const renamed = detail()
      renamed.summary.title = input.title
      renamed.summary.titleSource = 'manual'
      renamed.summary.fallbackLocalSecond = null
      renamed.summary.threadRevision = 2
      renamed.summary.updatedAt = input.renamedAt
      const acknowledgement = {
        operation: 'rename' as const,
        value: renamed,
        clock: { generation, watermark: 1, actualMutation: true },
      }
      observer?.(acknowledgement)
      return { id: 'rename', ok: true as const, ...acknowledgement }
    }),
    updateLocation: vi.fn(
      async (input: { action: 'archive' | 'unarchive' | 'trash' | 'restore'; movedAt: string }) => {
        const moved = detail()
        moved.summary.location =
          input.action === 'archive' ? 'archived' : input.action === 'trash' ? 'trash' : 'available'
        moved.summary.pinPosition = null
        moved.summary.threadRevision = 2
        moved.summary.updatedAt = input.movedAt
        const acknowledgement = {
          operation: 'updateLocation' as const,
          value: moved,
          clock: { generation, watermark: 1, actualMutation: true },
        }
        observer?.(acknowledgement)
        return { id: 'update-location', ok: true as const, ...acknowledgement }
      },
    ),
    recoverPending: vi.fn(async () => ({
      id: 'recover',
      ok: true as const,
      value: { recovered: 0 },
      clock: { ...clock, actualMutation: false },
    })),
    close: vi.fn(async () => ({
      id: 'close',
      ok: true as const,
      value: { closed: true as const },
      clock: { ...clock, actualMutation: false },
    })),
  }
  const sidecars = {
    resolveImageProtocolFile: vi.fn(async () => ({ filePath: '/x', mediaType: 'image/png' })),
  }
  const events = vi.fn()
  const activate = vi.fn(
    async () =>
      ({
        client,
        sidecars,
        rootPath: '/root',
        databasePath: '/db',
        importedThreadId: null,
      }) as never,
  )
  const service = new ThreadLibraryService({
    activate,
    broadcastThreadEvent: events,
    now: () => new Date(createdAt),
  })
  return { activate, client, events, getObserver: () => observer!, service, sidecars }
}

describe('ThreadLibraryService', () => {
  it('projects validated Pin metadata for available, unavailable, and detail summaries', async () => {
    const { client, service } = harness()
    await service.initialize()
    client.listPage.mockResolvedValueOnce({
      id: 'list-pin-metadata',
      ok: true,
      value: {
        rows: [
          {
            availability: 'available',
            id: threadId,
            location: 'available',
            title: 'Pinned Thread',
            pinPosition: 1,
            lastUserActivityAt: createdAt,
            createdAt,
            updatedAt: createdAt,
            threadRevision: 1,
            resultRevision: 0,
            seenResultRevision: 0,
          },
          {
            availability: 'unavailable',
            id: otherThreadId,
            location: 'available',
            pinPosition: 2,
          },
        ],
        nextCursor: null,
        includedThroughCursor: 0,
      },
      clock: { generation, watermark: 0, actualMutation: false },
    } as never)
    const pinnedDetail = detail()
    pinnedDetail.summary.pinPosition = 1
    client.snapshot.mockResolvedValueOnce({
      id: 'snapshot-pin-metadata',
      ok: true,
      value: { detail: pinnedDetail, includedThroughCursor: 0 },
      clock: { generation, watermark: 0, actualMutation: false },
    } as never)

    await expect(
      service.listPage({ location: 'available', cursor: null, limit: 50 }),
    ).resolves.toMatchObject({
      ok: true,
      value: {
        rows: [
          { availability: 'available', id: threadId, pinPosition: 1 },
          { availability: 'unavailable', id: otherThreadId, pinPosition: 2 },
        ],
      },
    })
    await expect(service.get({ threadId })).resolves.toMatchObject({
      ok: true,
      value: { detail: { summary: { id: threadId, pinPosition: 1 } } },
    })
  })

  it('validates bounded Search input and projects the acknowledged Worker reply', async () => {
    const { client, getObserver, service } = harness()
    await service.initialize()

    await expect(service.search({ query: '' })).resolves.toMatchObject({
      ok: false,
      error: { code: 'invalid_request' },
    })
    await expect(service.search({ query: '   ' })).resolves.toMatchObject({
      ok: false,
      error: { code: 'invalid_request' },
    })
    await expect(service.search({ query: 'x'.repeat(257) })).resolves.toMatchObject({
      ok: false,
      error: { code: 'invalid_request' },
    })
    await expect(service.search({ query: 'needle', extra: true })).resolves.toMatchObject({
      ok: false,
      error: { code: 'invalid_request' },
    })
    expect(client.search).not.toHaveBeenCalled()

    const changed = detail()
    changed.summary.pinPosition = 1
    getObserver()({
      operation: 'updatePin',
      value: changed,
      clock: { generation, watermark: 1, actualMutation: true },
    })
    client.search.mockResolvedValueOnce({
      id: 'search-projection',
      ok: true,
      value: {
        results: [
          {
            threadId: otherThreadId,
            title: 'Archived result',
            location: 'archived',
            source: 'assistant_message',
            snippet: 'original snippet',
            messageId: 'assistant-message',
          },
        ],
        truncated: true,
      },
      clock: { generation, watermark: 1, actualMutation: false },
    } as never)

    await expect(service.search({ query: ' n ' })).resolves.toEqual({
      ok: true,
      value: {
        results: [
          {
            threadId: otherThreadId,
            title: 'Archived result',
            location: 'archived',
            source: 'assistant_message',
            snippet: 'original snippet',
            messageId: 'assistant-message',
          },
        ],
        truncated: true,
        eventEpoch: generation,
        includedThroughCursor: 1,
      },
    })
    expect(client.search).toHaveBeenLastCalledWith({ query: 'n' })

    const maximumQuery = '🙂'.repeat(256)
    await expect(service.search({ query: ` ${maximumQuery} ` })).resolves.toMatchObject({
      ok: true,
    })
    expect(client.search).toHaveBeenLastCalledWith({ query: maximumQuery })
  })

  it('rejects overlapping Search without adding a second Client request', async () => {
    const { client, service } = harness()
    await service.initialize()
    const pending = deferred<Awaited<ReturnType<typeof client.search>>>()
    client.search.mockReturnValueOnce(pending.promise)

    const first = service.search({ query: 'first' })
    await expect(service.search({ query: 'second' })).resolves.toEqual({
      ok: false,
      error: { code: 'conflict', message: 'A Thread search is already running.' },
    })
    expect(client.search).toHaveBeenCalledTimes(1)

    pending.resolve({
      id: 'search-first',
      ok: true,
      value: { results: [], truncated: false },
      clock: { generation, watermark: 0, actualMutation: false },
    })
    await expect(first).resolves.toMatchObject({ ok: true })
    await expect(service.search({ query: 'after success' })).resolves.toMatchObject({ ok: true })
    expect(client.search).toHaveBeenCalledTimes(2)
  })

  it('releases the Search guard after safe and thrown Worker failures', async () => {
    const { client, service } = harness()
    await service.initialize()
    client.search.mockResolvedValueOnce({
      id: 'search-safe-failure',
      ok: false,
      safeError: { code: 'invalid_request', message: 'invalid' },
    } as never)
    client.search.mockRejectedValueOnce(new Error('transport failed'))

    await expect(service.search({ query: 'safe failure' })).resolves.toMatchObject({
      ok: false,
      error: { code: 'invalid_request' },
    })
    await expect(service.search({ query: 'thrown failure' })).resolves.toMatchObject({
      ok: false,
      error: { code: 'library_unavailable' },
    })
    await expect(service.search({ query: 'after failures' })).resolves.toMatchObject({ ok: true })
    expect(client.search).toHaveBeenCalledTimes(3)
  })

  it('validates and publishes one semantic Pin update through the public boundary', async () => {
    const { client, events, service } = harness()
    await service.initialize()

    await expect(
      service.updatePin({ threadId, action: 'pin', expectedPinPosition: null }),
    ).resolves.toMatchObject({
      ok: true,
      value: {
        detail: { summary: { id: threadId, pinPosition: 1 } },
        eventEpoch: generation,
        includedThroughCursor: 1,
      },
    })
    expect(client.updatePin).toHaveBeenCalledWith({
      threadId,
      action: 'pin',
      expectedPinPosition: null,
    })
    expect(events).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'threads:changed',
        detail: expect.objectContaining({
          summary: expect.objectContaining({ id: threadId, pinPosition: 1 }),
        }),
        includedThroughCursor: 1,
      }),
    )
  })

  it('rejects malformed Pin guards and maps stale guards to public conflict', async () => {
    const { client, service } = harness()
    await service.initialize()

    await expect(
      service.updatePin({ threadId, action: 'pin', expectedPinPosition: 1 }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'invalid_request' } })
    expect(client.updatePin).not.toHaveBeenCalled()

    client.updatePin.mockResolvedValueOnce({
      id: 'stale-pin',
      ok: false,
      safeError: {
        code: 'stale_pin_position',
        message: 'This Pin position changed. Reload it and try again.',
      },
      outcome: 'definitely_not_committed',
    } as never)
    await expect(
      service.updatePin({ threadId, action: 'move_top', expectedPinPosition: 1 }),
    ).resolves.toEqual({
      ok: false,
      error: { code: 'conflict', message: 'This thread changed. Reload it and try again.' },
    })
  })

  it('validates, trims, and publishes one manual Rename', async () => {
    const { client, events, service } = harness()
    await service.initialize()

    await expect(
      service.rename({ threadId, title: '  Renamed thread  ', expectedThreadRevision: 1 }),
    ).resolves.toMatchObject({
      ok: true,
      value: {
        detail: {
          summary: {
            title: 'Renamed thread',
            threadRevision: 2,
            lastUserActivityAt: createdAt,
          },
        },
        eventEpoch: generation,
        includedThroughCursor: 1,
      },
    })
    expect(client.rename).toHaveBeenCalledWith({
      threadId,
      title: 'Renamed thread',
      expectedThreadRevision: 1,
      renamedAt: createdAt,
    })
    expect(events).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'threads:changed',
        detail: expect.objectContaining({
          summary: expect.objectContaining({ title: 'Renamed thread' }),
        }),
      }),
    )

    client.rename.mockClear()
    await expect(
      service.rename({ threadId, title: ' '.repeat(4), expectedThreadRevision: 1 }),
    ).resolves.toEqual({ ok: false, error: { code: 'invalid_request', message: 'Enter a title.' } })
    await expect(
      service.rename({ threadId, title: '界'.repeat(49), expectedThreadRevision: 1 }),
    ).resolves.toEqual({
      ok: false,
      error: { code: 'invalid_request', message: 'Use 48 characters or fewer.' },
    })
    expect(client.rename).not.toHaveBeenCalled()
  })

  it('validates and publishes semantic Archive and Trash location changes', async () => {
    const { client, events, service } = harness()
    await service.initialize()

    await expect(
      service.updateLocation({ threadId, action: 'archive', expectedThreadRevision: 1 }),
    ).resolves.toMatchObject({
      ok: true,
      value: {
        detail: {
          summary: {
            location: 'archived',
            pinPosition: null,
            threadRevision: 2,
            lastUserActivityAt: createdAt,
          },
        },
        eventEpoch: generation,
        includedThroughCursor: 1,
      },
    })
    expect(client.updateLocation).toHaveBeenCalledWith({
      threadId,
      action: 'archive',
      expectedThreadRevision: 1,
      movedAt: createdAt,
    })
    expect(events).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'threads:changed',
        detail: expect.objectContaining({
          summary: expect.objectContaining({ location: 'archived', pinPosition: null }),
        }),
      }),
    )

    client.updateLocation.mockClear()
    await expect(
      service.updateLocation({ threadId, action: 'trash', expectedThreadRevision: 1 }),
    ).resolves.toMatchObject({
      ok: true,
      value: { detail: { summary: { location: 'trash', pinPosition: null } } },
    })
    expect(client.updateLocation).toHaveBeenCalledWith({
      threadId,
      action: 'trash',
      expectedThreadRevision: 1,
      movedAt: createdAt,
    })

    client.updateLocation.mockClear()
    await expect(
      service.updateLocation({ threadId, action: 'delete', expectedThreadRevision: 1 }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'invalid_request' } })
    expect(client.updateLocation).not.toHaveBeenCalled()
  })

  it.each(['submitting', 'streaming', 'saving_failed'] as const)(
    'rejects Archive and Trash while Thread activity is %s',
    async (activity) => {
      const { client, service } = harness()
      await service.initialize()
      const sender = { send: vi.fn() }

      if (activity === 'saving_failed') {
        vi.spyOn(service.resolveCoordinator(), 'settlementFailureRequestId').mockReturnValue(
          'request',
        )
      } else {
        service.publishChatEvent(sender as never, {
          type: 'chat:accepted',
          threadId,
          requestId: 'request',
          userMessageId: 'user',
          assistantMessageId: 'assistant',
          turnIntent: 'new_user_message',
          attachmentBearing: false,
        })
        if (activity === 'streaming') {
          service.publishChatEvent(sender as never, {
            type: 'chat:delta',
            threadId,
            requestId: 'request',
            assistantMessageId: 'assistant',
            delta: 'Live',
            snapshot: 'Live',
          })
        }
      }

      for (const action of ['archive', 'trash'] as const) {
        await expect(
          service.updateLocation({ threadId, action, expectedThreadRevision: 1 }),
        ).resolves.toMatchObject({ ok: false, error: { code: 'invalid_request' } })
      }
      expect(client.updateLocation).not.toHaveBeenCalled()
    },
  )

  it.each(['archived', 'trash'] as const)(
    'rejects a %s Draft before invoking the save coordinator',
    async (location) => {
      const { client, service } = harness()
      await service.initialize()
      const readOnly = detail()
      readOnly.summary.location = location
      client.readThread.mockResolvedValueOnce({
        id: 'read-only-read',
        ok: true,
        value: readOnly,
        clock: { generation, watermark: 0, actualMutation: false },
      } as never)
      const saveDraft = vi.spyOn(service.resolveCoordinator(), 'saveDraft')

      await expect(
        service.saveDraft({
          threadId,
          expectedDraftRevision: 0,
          text: 'edited',
          targetSelection: { kind: 'env_fallback' },
          images: [],
          documents: [],
        }),
      ).resolves.toMatchObject({ ok: false, error: { code: 'invalid_request' } })
      expect(saveDraft).not.toHaveBeenCalled()
    },
  )

  it('keeps independent live activity for two Threads', async () => {
    const { client, service } = harness()
    await service.initialize()
    client.listPage.mockResolvedValueOnce({
      id: 'list-two',
      ok: true,
      value: {
        rows: [
          {
            availability: 'available',
            id: threadId,
            location: 'available',
            title: 'Thread A',
            pinPosition: null,
            lastUserActivityAt: createdAt,
            createdAt,
            updatedAt: createdAt,
            threadRevision: 1,
            resultRevision: 0,
            seenResultRevision: 0,
          },
          {
            availability: 'available',
            id: otherThreadId,
            location: 'available',
            title: 'Thread B',
            pinPosition: null,
            lastUserActivityAt: createdAt,
            createdAt,
            updatedAt: createdAt,
            threadRevision: 1,
            resultRevision: 0,
            seenResultRevision: 0,
          },
        ],
        nextCursor: null,
        includedThroughCursor: 0,
      },
      clock: { generation, watermark: 0, actualMutation: false },
    } as never)
    const sender = { send: vi.fn() }
    service.publishChatEvent(sender as never, {
      type: 'chat:accepted',
      threadId,
      requestId: 'request-a',
      userMessageId: 'user-a',
      assistantMessageId: 'assistant-a',
      turnIntent: 'new_user_message',
      attachmentBearing: true,
    })
    service.publishChatEvent(sender as never, {
      type: 'chat:accepted',
      threadId: otherThreadId,
      requestId: 'request-b',
      userMessageId: 'user-b',
      assistantMessageId: 'assistant-b',
      turnIntent: 'new_user_message',
      attachmentBearing: false,
    })
    service.publishChatEvent(sender as never, {
      type: 'chat:capacity',
      activeRuns: 2,
      attachmentRunActive: true,
    })

    await expect(
      service.listPage({ location: 'available', cursor: null, limit: 50 }),
    ).resolves.toMatchObject({
      ok: true,
      value: {
        capacity: { activeRuns: 2, attachmentRunActive: true },
        rows: [
          {
            id: threadId,
            activity: { status: 'submitting', requestId: 'request-a', attachmentBearing: true },
          },
          {
            id: otherThreadId,
            activity: { status: 'submitting', requestId: 'request-b', attachmentBearing: false },
          },
        ],
      },
    })
    expect(sender.send).toHaveBeenLastCalledWith('nyx:chat:event', {
      type: 'chat:capacity',
      activeRuns: 2,
      attachmentRunActive: true,
      eventEpoch: generation,
      cursor: 3,
    })
  })

  it('preserves Retry on a canonical failed turn', async () => {
    const { client, service } = harness()
    const failed = detail()
    failed.turns.push({
      threadId,
      ordinal: 1,
      userMessageId: 'user',
      assistantMessageId: 'assistant',
      userContent: 'Retry me',
      assistantContent: '',
      assistantStatus: 'failed',
      error: {
        code: 'upstream_error',
        message: 'The provider could not complete the response.',
        retryable: true,
      },
      targetSelection: { kind: 'env_fallback' },
      targetAttribution: null,
      providerStateId: null,
      attemptRequestId: 'request',
      createdAt,
      updatedAt: createdAt,
    })
    client.snapshot.mockResolvedValueOnce({
      id: 'snapshot-failed-turn',
      ok: true,
      value: { detail: failed, includedThroughCursor: 0 },
      clock: { generation, watermark: 0, actualMutation: false },
    } as never)

    await service.initialize()
    const result = await service.get({ threadId })

    expect(result).toMatchObject({
      ok: true,
      value: {
        detail: {
          messages: [{ id: 'user' }, { id: 'assistant', canRetry: true }],
          retryableTurn: { assistantMessageId: 'assistant' },
        },
      },
    })
  })

  it('projects a retained settlement failure as Retryable after reload', async () => {
    const { client, service } = harness()
    const pending = detail()
    pending.turns.push({
      threadId,
      ordinal: 1,
      userMessageId: 'user',
      assistantMessageId: 'assistant',
      userContent: 'Save this',
      assistantContent: '',
      assistantStatus: 'pending',
      error: null,
      targetSelection: { kind: 'env_fallback' },
      targetAttribution: null,
      providerStateId: null,
      attemptRequestId: 'request',
      createdAt,
      updatedAt: createdAt,
    })
    client.snapshot.mockResolvedValueOnce({
      id: 'snapshot-settlement-failure',
      ok: true,
      value: { detail: pending, includedThroughCursor: 0 },
      clock: { generation, watermark: 0, actualMutation: false },
    } as never)

    await service.initialize()
    vi.spyOn(service.resolveCoordinator(), 'settlementFailureRequestId').mockReturnValue('request')
    const result = await service.get({ threadId })

    expect(result).toMatchObject({
      ok: true,
      value: {
        detail: {
          summary: { activity: { status: 'saving_failed', requestId: 'request' } },
          messages: [
            { id: 'user' },
            {
              id: 'assistant',
              status: 'failed',
              error: { code: 'unknown', message: "Couldn't save result", retryable: true },
              canRetry: true,
            },
          ],
          runStatus: 'failed',
          activeRun: null,
          settlementFailure: { requestId: 'request', assistantMessageId: 'assistant' },
        },
      },
    })
  })

  it('does not project a retained settlement marker after the turn is terminal', async () => {
    const { client, service } = harness()
    const failed = detail()
    failed.turns.push({
      threadId,
      ordinal: 1,
      userMessageId: 'user',
      assistantMessageId: 'assistant',
      userContent: 'Retry me',
      assistantContent: '',
      assistantStatus: 'failed',
      error: {
        code: 'upstream_error',
        message: 'The provider could not complete the response.',
        retryable: true,
      },
      targetSelection: { kind: 'env_fallback' },
      targetAttribution: null,
      providerStateId: null,
      attemptRequestId: 'request',
      createdAt,
      updatedAt: createdAt,
    })
    client.snapshot.mockResolvedValueOnce({
      id: 'snapshot-terminal-turn',
      ok: true,
      value: { detail: failed, includedThroughCursor: 0 },
      clock: { generation, watermark: 0, actualMutation: false },
    } as never)

    await service.initialize()
    vi.spyOn(service.resolveCoordinator(), 'settlementFailureRequestId').mockReturnValue('request')
    const result = await service.get({ threadId })

    expect(result).toMatchObject({
      ok: true,
      value: {
        detail: {
          messages: [
            { id: 'user' },
            {
              id: 'assistant',
              status: 'failed',
              error: { code: 'upstream_error' },
              canRetry: true,
            },
          ],
          settlementFailure: null,
          retryableTurn: { assistantMessageId: 'assistant' },
        },
      },
    })
  })

  it('binds a new snapshot to chat events already reflected in its live detail', async () => {
    const { getObserver, service, events } = harness()
    await expect(service.initialize()).resolves.toBe(true)

    getObserver()({
      operation: 'materialize',
      value: detail(),
      clock: { generation, watermark: 1, actualMutation: true },
    })
    const sender = { send: vi.fn() }
    service.publishChatEvent(sender as never, {
      type: 'chat:delta',
      threadId,
      requestId: 'request',
      assistantMessageId: 'assistant',
      delta: 'x',
      snapshot: 'x',
    })

    const result = await service.get({ threadId })
    expect(result).toMatchObject({
      ok: true,
      value: { eventEpoch: generation, includedThroughCursor: 2 },
    })
    expect(sender.send).toHaveBeenCalledWith(
      'nyx:chat:event',
      expect.objectContaining({ eventEpoch: generation, cursor: 2 }),
    )
    expect(events).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'threads:changed', includedThroughCursor: 1 }),
    )
  })

  it('publishes only the shared chat:done contract and event clock', async () => {
    const { service } = harness()
    await expect(service.initialize()).resolves.toBe(true)
    const sender = { send: vi.fn() }

    service.publishChatEvent(sender as never, {
      type: 'chat:done',
      threadId,
      requestId: 'request',
      assistantMessageId: 'assistant',
      status: 'completed',
      finalContent: 'Answer',
    })

    expect(sender.send).toHaveBeenCalledWith('nyx:chat:event', {
      type: 'chat:done',
      threadId,
      requestId: 'request',
      assistantMessageId: 'assistant',
      status: 'completed',
      finalContent: 'Answer',
      eventEpoch: generation,
      cursor: 1,
    })
  })

  it('authorizes only images from the selected canonical detail and revokes on epoch change', async () => {
    const { client, getObserver, service, sidecars } = harness()
    await service.initialize()
    await service.get({ threadId })

    expect(service.resolveAuthorizedImage(imageId)).toMatchObject({ threadId })
    await service.resolveImageProtocolFile(
      threadId,
      service.resolveAuthorizedImage(imageId)!.ref,
      'preview',
    )
    expect(sidecars.resolveImageProtocolFile).toHaveBeenCalled()

    client.snapshot.mockResolvedValueOnce({
      id: 'snapshot-empty',
      ok: true,
      value: { detail: null, includedThroughCursor: 0 },
      clock: { generation, watermark: 1, actualMutation: false },
    } as never)
    await service.get({ threadId: null })
    expect(service.resolveAuthorizedImage(imageId)).toBeNull()

    await service.get({ threadId })
    expect(service.resolveAuthorizedImage(imageId)).toMatchObject({ threadId })

    getObserver()({
      operation: 'snapshot',
      value: { detail: null, includedThroughCursor: 0 },
      clock: {
        generation: '00000000-0000-4000-8000-000000000004',
        watermark: 0,
        actualMutation: false,
      },
    })
    expect(service.resolveAuthorizedImage(imageId)).toBeNull()
  })

  it('keeps the current image authorization when clearing selection fails', async () => {
    const { client, service } = harness()
    await service.initialize()
    await service.get({ threadId })
    client.snapshot.mockResolvedValueOnce({
      id: 'snapshot-failed',
      ok: false,
      safeError: { code: 'library_unavailable', message: 'failed' },
      outcome: 'definitely_not_committed',
    } as never)

    await expect(service.get({ threadId: null })).resolves.toMatchObject({ ok: false })
    expect(service.resolveAuthorizedImage(imageId)).toMatchObject({ threadId })
  })

  it('revokes Renderer image authorization without closing storage or live state', async () => {
    const { client, service } = harness()
    await service.initialize()
    await service.get({ threadId })

    service.rendererTeardown()

    expect(service.resolveAuthorizedImage(imageId)).toBeNull()
    expect(client.close).not.toHaveBeenCalled()
    await expect(
      service.listPage({ location: 'available', cursor: null, limit: 50 }),
    ).resolves.toMatchObject({
      ok: true,
    })
    await service.get({ threadId })
    expect(service.resolveAuthorizedImage(imageId)).toMatchObject({ threadId })
  })

  it('does not let late get, materialize, or save replies restore torn-down authorization', async () => {
    const { client, service } = harness()
    await service.initialize()

    const snapshot = deferred<Awaited<ReturnType<typeof client.snapshot>>>()
    client.snapshot.mockImplementationOnce(() => snapshot.promise)
    const get = service.get({ threadId })
    service.rendererTeardown()
    snapshot.resolve({
      id: 'late-snapshot',
      ok: true,
      value: { detail: detail(), includedThroughCursor: 0 },
      clock: { generation, watermark: 0, actualMutation: false },
    })
    await get
    expect(service.resolveAuthorizedImage(imageId)).toBeNull()

    const coordinator = service.resolveCoordinator()
    const materialized = deferred<Awaited<ReturnType<typeof coordinator.materialize>>>()
    vi.spyOn(coordinator, 'materialize').mockImplementationOnce(() => materialized.promise)
    const materialize = service.materialize({
      text: '',
      targetSelection: { kind: 'env_fallback' },
      images: [],
      documents: [],
    })
    service.rendererTeardown()
    materialized.resolve({
      id: 'late-materialize',
      ok: true,
      value: detail(),
      clock: { generation, watermark: 0, actualMutation: false },
    })
    await materialize
    expect(service.resolveAuthorizedImage(imageId)).toBeNull()

    const saved = deferred<Awaited<ReturnType<typeof coordinator.saveDraft>>>()
    vi.spyOn(coordinator, 'saveDraft').mockImplementationOnce(() => saved.promise)
    const save = service.saveDraft({
      threadId,
      expectedDraftRevision: 0,
      text: '',
      targetSelection: { kind: 'env_fallback' },
      images: [],
      documents: [],
    })
    service.rendererTeardown()
    saved.resolve({
      id: 'late-save',
      ok: true,
      value: { status: 'committed', detail: detail() },
      clock: { generation, watermark: 0, actualMutation: false },
    })
    await save
    expect(service.resolveAuthorizedImage(imageId)).toBeNull()
  })

  it('projects canonical Draft resources back into the strict save input', async () => {
    const { client, service } = harness()
    await service.initialize()
    const canonical = detail()
    canonical.documents.push({
      threadId,
      owner: 'draft',
      turnOrdinal: null,
      position: 0,
      documentId: '00000000-0000-4000-8000-000000000010',
      name: 'notes.txt',
      mediaType: 'text/plain',
      byteLength: 5,
      extractedByteLength: 5,
      sourceSha256: 'a'.repeat(64),
      extractedTextSha256: 'b'.repeat(64),
      available: true,
      extractedText: 'notes',
    })
    client.snapshot.mockResolvedValueOnce({
      id: 'canonical-draft',
      ok: true,
      value: { detail: canonical, includedThroughCursor: 0 },
      clock: { generation, watermark: 0, actualMutation: false },
    } as never)
    client.readThread.mockResolvedValueOnce({
      id: 'canonical-read',
      ok: true,
      value: canonical,
      clock: { generation, watermark: 0, actualMutation: false },
    } as never)
    await service.get({ threadId })
    const coordinator = service.resolveCoordinator()
    const saveDraft = vi.spyOn(coordinator, 'saveDraft').mockResolvedValueOnce({
      id: 'saved',
      ok: true,
      value: { status: 'committed', detail: canonical },
      clock: { generation, watermark: 0, actualMutation: false },
    })

    await service.saveDraft({
      threadId,
      expectedDraftRevision: 0,
      text: 'updated',
      targetSelection: { kind: 'env_fallback' },
      images: canonical.images.map(({ imageId, mediaType, width, height, position }) => ({
        imageId,
        mediaType,
        width,
        height,
        position,
      })),
      documents: canonical.documents.map(
        ({ documentId, name, mediaType, byteLength, extractedByteLength, position }) => ({
          documentId,
          name,
          mediaType,
          byteLength,
          extractedByteLength,
          position,
        }),
      ),
    })

    expect(saveDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          draft: {
            text: 'updated',
            targetSelection: { kind: 'env_fallback' },
            images: [
              {
                imageId,
                position: 0,
                mediaType: 'image/png',
                width: 2,
                height: 1,
                available: true,
              },
            ],
            documents: [
              {
                documentId: '00000000-0000-4000-8000-000000000010',
                position: 0,
                name: 'notes.txt',
                mediaType: 'text/plain',
                byteLength: 5,
                extractedByteLength: 5,
                sourceSha256: 'a'.repeat(64),
                extractedTextSha256: 'b'.repeat(64),
                available: true,
                extractedText: 'notes',
              },
            ],
          },
        }),
      }),
    )
  })

  it('merges only the matching live run into a pending canonical snapshot', async () => {
    const { client, service } = harness()
    const pending = detail()
    pending.turns.push({
      threadId,
      ordinal: 1,
      userMessageId: '00000000-0000-4000-8000-000000000004',
      assistantMessageId: '00000000-0000-4000-8000-000000000005',
      userContent: 'Hello',
      assistantContent: '',
      assistantStatus: 'pending',
      error: null,
      providerStateId: null,
      targetSelection: { kind: 'env_fallback' },
      targetAttribution: null,
      attemptRequestId: 'request',
      createdAt,
      updatedAt: createdAt,
    })
    client.snapshot.mockResolvedValue({
      id: 'snapshot',
      ok: true,
      value: { detail: pending, includedThroughCursor: 0 },
      clock: { generation, watermark: 0, actualMutation: false },
    })
    await service.initialize()
    const sender = { send: vi.fn() }
    service.publishChatEvent(sender as never, {
      type: 'chat:accepted',
      threadId,
      requestId: 'request',
      userMessageId: pending.turns[0]!.userMessageId,
      assistantMessageId: pending.turns[0]!.assistantMessageId,
      turnIntent: 'new_user_message',
      attachmentBearing: true,
    })
    service.publishChatEvent(sender as never, {
      type: 'chat:delta',
      threadId,
      requestId: 'request',
      assistantMessageId: pending.turns[0]!.assistantMessageId,
      delta: 'Live',
      snapshot: 'Live answer',
    })

    const result = await service.get({ threadId })
    expect(result).toMatchObject({
      ok: true,
      value: {
        detail: {
          runStatus: 'streaming',
          activeRun: {
            requestId: 'request',
            assistantMessageId: pending.turns[0]!.assistantMessageId,
            turnIntent: 'new_user_message',
            attachmentBearing: true,
          },
          messages: [{ content: 'Hello' }, { content: 'Live answer', status: 'streaming' }],
        },
      },
    })
    await expect(
      service.listPage({ location: 'available', cursor: null, limit: 50 }),
    ).resolves.toMatchObject({
      ok: true,
      value: {
        rows: [
          {
            id: threadId,
            activity: {
              status: 'streaming',
              requestId: 'request',
              attachmentBearing: true,
            },
          },
        ],
      },
    })
  })

  it('does not let a closed Renderer invalidate acknowledged state', async () => {
    const { events, getObserver, service } = harness()
    events.mockImplementation(() => {
      throw new Error('window closed')
    })
    await service.initialize()

    expect(() =>
      getObserver()({
        operation: 'materialize',
        value: detail(),
        clock: { generation, watermark: 1, actualMutation: true },
      }),
    ).not.toThrow()
    expect(() =>
      service.publishChatEvent(
        {
          send: () => {
            throw new Error('window closed')
          },
        } as never,
        {
          type: 'chat:accepted',
          threadId,
          requestId: 'request',
          userMessageId: 'user',
          assistantMessageId: 'assistant',
          turnIntent: 'new_user_message',
          attachmentBearing: false,
        },
      ),
    ).not.toThrow()
  })

  it('rejects malformed public inputs before calling the Worker', async () => {
    const { client, service } = harness()
    await service.initialize()
    await expect(service.listPage({ location: 'available', limit: 49 })).resolves.toEqual({
      ok: false,
      error: { code: 'invalid_request', message: 'The Thread request is invalid.' },
    })
    expect(client.listPage).not.toHaveBeenCalled()
  })

  it('probes the active Worker when retrying a Library failure', async () => {
    const { client, service } = harness()
    await service.initialize()

    await expect(service.retryOpen({ scope: 'library' })).resolves.toEqual({
      ok: true,
      value: null,
    })
    expect(client.listPage).toHaveBeenCalledWith({
      location: 'available',
      cursor: null,
      limit: 50,
    })
  })

  it('reopens a failed Worker without recovering a live in-process Run again', async () => {
    const { client, service } = harness()
    await service.initialize()
    client.listPage.mockRejectedValueOnce(new Error('Worker exited'))

    await expect(service.retryOpen({ scope: 'library' })).resolves.toEqual({
      ok: true,
      value: null,
    })

    expect(client.close).toHaveBeenCalledOnce()
    expect(client.recoverPending).toHaveBeenCalledOnce()
  })

  it('reopens a dead Worker before retrying the exact unavailable Thread', async () => {
    const { activate, client, service } = harness()
    await service.initialize()
    const reconcile = vi
      .spyOn(service.resolveCoordinator(), 'reconcileThread')
      .mockResolvedValue(detail())
    client.listPage.mockRejectedValueOnce(new Error('Worker exited'))

    await expect(service.retryOpen({ scope: 'thread', threadId })).resolves.toEqual({
      ok: true,
      value: null,
    })

    expect(activate).toHaveBeenCalledTimes(2)
    expect(client.close).toHaveBeenCalledOnce()
    expect(reconcile).toHaveBeenCalledWith(threadId, expect.any(String))
    expect(client.recoverPending).toHaveBeenCalledOnce()
  })

  it('keeps volatile coordinator state across a failed replacement activation', async () => {
    const { activate, client, service } = harness()
    await service.initialize()
    const coordinator = service.resolveCoordinator()
    client.listPage.mockRejectedValueOnce(new Error('Worker exited'))
    activate.mockRejectedValueOnce(new Error('disk unavailable'))

    await expect(service.retryOpen({ scope: 'library' })).resolves.toEqual({
      ok: false,
      error: { code: 'library_unavailable', message: "Couldn't open Thread Library" },
    })
    expect(() => service.resolveCoordinator()).toThrow("Couldn't open Thread Library")

    await expect(service.retryOpen({ scope: 'library' })).resolves.toEqual({
      ok: true,
      value: null,
    })
    expect(service.resolveCoordinator()).toBe(coordinator)
    expect(client.recoverPending).toHaveBeenCalledOnce()
  })

  it('recovers pending turns before opening and retries an unknown result with the same time', async () => {
    const { client, service } = harness()
    client.recoverPending
      .mockImplementationOnce(
        async () =>
          ({
            id: 'recover-1',
            ok: false,
            safeError: { code: 'library_unavailable', message: 'unknown' },
            outcome: 'outcome_unknown',
          }) as never,
      )
      .mockResolvedValueOnce({
        id: 'recover-2',
        ok: true,
        value: { recovered: 0 },
        clock: { generation, watermark: 0, actualMutation: false },
      })

    await expect(service.initialize()).resolves.toBe(false)
    await expect(service.retryOpen({ scope: 'library' })).resolves.toEqual({
      ok: true,
      value: null,
    })

    expect(client.recoverPending).toHaveBeenNthCalledWith(1, { recoveredAt: createdAt })
    expect(client.recoverPending).toHaveBeenNthCalledWith(2, { recoveredAt: createdAt })
    expect(client.close).toHaveBeenCalledOnce()
  })
})
