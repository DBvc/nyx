import { describe, expect, it } from 'vitest'

import type { NyxChatError, NyxChatMessage } from '../../../shared/chat/types'
import type { NyxThreadDetail } from '../../../shared/threads/types'
import { chatReducer } from './chat-reducer'
import { initialChatState } from './chat-types'

const threadId = 'thread-a'
const requestId = 'request-1'
const userMessageId = 'user-1'
const assistantMessageId = 'assistant-1'
const target = { kind: 'connection', providerId: 'provider-1', modelId: 'model-1' } as const
const targetAttribution = {
  kind: 'connection',
  providerId: 'provider-1',
  providerDisplayName: 'Provider One',
  modelId: 'model-1',
  modelDisplayName: 'Model One',
} as const
const retryableError: NyxChatError = {
  code: 'network_error',
  message: 'Network failed.',
  retryable: true,
}

function detail(overrides: Partial<NyxThreadDetail> = {}): NyxThreadDetail {
  return {
    summary: {
      availability: 'available',
      id: 'thread-a',
      location: 'available',
      pinPosition: null,
      title: 'Canonical title',
      threadRevision: 1,
      resultRevision: 0,
      seenResultRevision: 0,
      lastUserActivityAt: '2026-01-01T00:00:00.000Z',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    draft: {
      revision: 2,
      text: 'saved draft',
      targetSelection: target,
      images: [],
      documents: [],
    },
    messages: [],
    runStatus: 'idle',
    activeRun: null,
    retryableTurn: null,
    settlementFailure: null,
    ...overrides,
  }
}

function hydrated() {
  const value = detail()
  return chatReducer(initialChatState, {
    type: 'thread-library-hydrated',
    generation: 0,
    summary: value.summary,
    detail: value,
    eventEpoch: 'epoch-1',
    listCursor: 4,
    detailCursor: 6,
  })
}

function submittedState(
  state = hydrated(),
  turnIntent: 'new_user_message' | 'retry_failed_response' = 'new_user_message',
) {
  return chatReducer(state, {
    type: 'request-submitted',
    threadId,
    requestId,
    turnIntent,
    expectedDraftRevision: state.draftRevision,
    ...(turnIntent === 'retry_failed_response'
      ? { turnOrdinal: 1, expectedAttemptRequestId: 'attempt-1' }
      : {}),
  })
}

function acceptedState(state = submittedState()) {
  return chatReducer(state, {
    type: 'request-accepted',
    threadId,
    requestId,
    userMessageId,
    assistantMessageId,
    turnIntent: state.activeTurn?.turnIntent ?? 'new_user_message',
  })
}

function streamingState(state = acceptedState()) {
  return chatReducer(state, {
    type: 'request-started',
    threadId,
    requestId,
    assistantMessageId,
    targetAttribution,
  })
}

function assistantFrom(messages: ReadonlyArray<NyxChatMessage>) {
  const message = messages.find((candidate) => candidate.id === assistantMessageId)
  expect(message).toBeDefined()
  return message!
}

describe('chatReducer C1 projection', () => {
  it('hydrates only the selected canonical detail and its independent watermarks', () => {
    const state = hydrated()

    expect(state).toMatchObject({
      selectedThreadId: 'thread-a',
      threadSummary: { title: 'Canonical title' },
      input: 'saved draft',
      draftRevision: 2,
      eventEpoch: 'epoch-1',
      listCursor: 4,
      detailCursor: 6,
      hydrationStatus: 'ready',
    })
    expect(state.messages).toEqual([])
  })

  it('hydrates canonical attachments and retry metadata without restoring active ids', () => {
    const value = detail({
      draft: {
        ...detail().draft,
        images: [
          {
            imageId: 'image-1',
            mediaType: 'image/png',
            width: 2,
            height: 3,
            available: true,
          },
        ],
        documents: [
          {
            documentId: 'document-1',
            name: 'notes.txt',
            mediaType: 'text/plain',
            byteLength: 5,
            extractedByteLength: 5,
            available: true,
          },
        ],
      },
      messages: [
        { id: userMessageId, role: 'user', content: 'Hello', status: 'completed' },
        {
          id: assistantMessageId,
          role: 'assistant',
          content: 'Partial',
          status: 'failed',
          error: retryableError,
          canRetry: true,
        },
      ],
      runStatus: 'failed',
      retryableTurn: {
        turnOrdinal: 1,
        expectedAttemptRequestId: requestId,
        expectedDraftRevision: 2,
        userMessageId,
        assistantMessageId,
      },
    })
    const state = chatReducer(initialChatState, {
      type: 'thread-library-hydrated',
      generation: 0,
      summary: value.summary,
      detail: value,
      eventEpoch: 'epoch-1',
      listCursor: 2,
      detailCursor: 3,
    })

    expect(state).toMatchObject({
      runStatus: 'failed',
      retryableTurn: value.retryableTurn,
      activeRequestId: undefined,
      activeAssistantMessageId: undefined,
      activeTurn: null,
    })
    expect(state.draftImages[0]).toMatchObject({
      id: 'image-1',
      status: 'ready',
      previewUrl: 'nyx-image://preview/image-1',
    })
    expect(state.draftDocuments[0]).toMatchObject({ id: 'document-1', status: 'ready' })
  })

  it('restores the exact active run identity from a live Main snapshot', () => {
    const value = detail({
      runStatus: 'streaming',
      activeRun: { requestId, assistantMessageId, turnIntent: 'new_user_message' },
    })
    const state = chatReducer(initialChatState, {
      type: 'thread-library-hydrated',
      generation: 0,
      summary: value.summary,
      detail: value,
      eventEpoch: 'epoch-1',
      listCursor: 0,
      detailCursor: 0,
    })

    expect(state).toMatchObject({
      activeRequestId: requestId,
      activeAssistantMessageId: assistantMessageId,
      activeTurn: { requestId, assistantMessageId, accepted: true },
    })
  })

  it('refreshes active run identity while keeping a dirty Draft overlay', () => {
    const current = chatReducer(hydrated(), { type: 'set-input', value: 'dirty overlay' })
    const changed = detail({
      runStatus: 'streaming',
      activeRun: { requestId, assistantMessageId, turnIntent: 'new_user_message' },
    })

    const state = chatReducer(current, {
      type: 'thread-detail-changed',
      detail: changed,
      cursor: 7,
      preserveOverlay: true,
    })

    expect(state).toMatchObject({
      input: 'dirty overlay',
      activeRequestId: requestId,
      activeAssistantMessageId: assistantMessageId,
      activeTurn: { requestId, accepted: true },
    })
  })

  it('keeps only an unaccepted local start and clears an accepted run when canonical becomes terminal', () => {
    const submitted = submittedState()
    const pending = chatReducer(submitted, {
      type: 'thread-detail-changed',
      detail: detail({ runStatus: 'streaming', activeRun: null }),
      cursor: 7,
      preserveOverlay: false,
    })
    expect(pending).toMatchObject({
      activeRequestId: requestId,
      activeTurn: { requestId, accepted: false },
    })

    const dirtyAccepted = chatReducer(acceptedState(), { type: 'set-input', value: 'dirty' })
    const terminal = chatReducer(dirtyAccepted, {
      type: 'thread-detail-changed',
      detail: detail({ runStatus: 'completed', activeRun: null }),
      cursor: 8,
      preserveOverlay: true,
    })
    expect(terminal).toMatchObject({ input: 'dirty', runStatus: 'completed' })
    expect(terminal.activeRequestId).toBeUndefined()
    expect(terminal.activeAssistantMessageId).toBeUndefined()
    expect(terminal.activeTurn).toBeNull()
  })

  it('stores only a safe library load error and remains blocked', () => {
    const state = chatReducer(initialChatState, {
      type: 'thread-library-hydration-failed',
      generation: 0,
      error: { code: 'library_unavailable', message: "Couldn't open Thread Library" },
    })

    expect(state).toMatchObject({
      hydrationStatus: 'error',
      hydrationError: { code: 'library_unavailable', message: "Couldn't open Thread Library" },
      messages: [],
      activeRequestId: undefined,
    })
  })

  it('never lets a late hydration generation replace the current placeholder', () => {
    const placeholder = chatReducer(hydrated(), {
      type: 'show-placeholder',
      generation: 1,
      minimumCatalogEpoch: 3,
    })
    const stale = chatReducer(placeholder, {
      type: 'thread-library-hydrated',
      generation: 0,
      summary: detail().summary,
      detail: detail(),
      eventEpoch: 'epoch-1',
      listCursor: 8,
      detailCursor: 8,
    })

    expect(stale).toBe(placeholder)
    expect(stale.selectedThreadId).toBeNull()
  })

  it('keeps the selected overlay but hides it behind Thread unavailable Retry', () => {
    const dirty = chatReducer(hydrated(), { type: 'set-input', value: 'local edit' })
    const unavailable = chatReducer(dirty, {
      type: 'thread-unavailable',
      threadId: 'thread-a',
      error: { code: 'thread_unavailable', message: "Couldn't open this thread" },
      cursor: 7,
    })

    expect(unavailable).toMatchObject({
      hydrationStatus: 'error',
      hydrationErrorThreadId: 'thread-a',
      input: 'local edit',
      threadSummary: {
        availability: 'unavailable',
        pinPosition: null,
        title: "Couldn't open this thread",
      },
    })
  })

  it('keeps a newer dirty overlay while accepting canonical messages and revision', () => {
    const dirty = chatReducer(hydrated(), { type: 'set-input', value: 'newer local edit' })
    const next = detail({
      draft: { ...detail().draft, revision: 3, text: 'older acknowledged edit' },
      messages: [{ id: 'user-1', role: 'user', content: 'hello', status: 'completed' }],
    })
    const state = chatReducer(dirty, {
      type: 'thread-detail-changed',
      detail: next,
      cursor: 7,
      preserveOverlay: true,
    })

    expect(state.input).toBe('newer local edit')
    expect(state.draftRevision).toBe(3)
    expect(state.messages).toEqual(next.messages)
    expect(state.detailCursor).toBe(7)
  })

  it('seeds once and lets newer catalog updates change availability without changing the draft', () => {
    const seeded = chatReducer(hydrated(), {
      type: 'target-context-ready',
      generation: 0,
      catalogEpoch: 2,
      selection: target,
      available: true,
    })
    const refreshed = chatReducer(seeded, {
      type: 'target-catalog-updated',
      generation: 0,
      catalogEpoch: 3,
      available: false,
    })
    const stale = chatReducer(refreshed, {
      type: 'target-catalog-updated',
      generation: 0,
      catalogEpoch: 2,
      available: true,
    })

    expect(refreshed.targetDraft).toEqual(target)
    expect(refreshed.targetAvailable).toBe(false)
    expect(stale).toBe(refreshed)
  })

  it('accepts only the registered post-New catalog epoch for a placeholder seed', () => {
    const placeholder = chatReducer(hydrated(), {
      type: 'show-placeholder',
      generation: 1,
      minimumCatalogEpoch: 6,
    })
    const stale = chatReducer(placeholder, {
      type: 'target-context-ready',
      generation: 1,
      catalogEpoch: 5,
      selection: target,
      available: true,
    })
    const seeded = chatReducer(stale, {
      type: 'target-context-ready',
      generation: 1,
      catalogEpoch: 6,
      selection: { kind: 'env_fallback' },
      available: true,
    })

    expect(stale).toBe(placeholder)
    expect(seeded.targetDraft).toEqual({ kind: 'env_fallback' })
  })

  it('treats a save ack as the only durability boundary without erasing later edits', () => {
    const firstEdit = chatReducer(hydrated(), { type: 'set-input', value: 'first edit' })
    const laterEdit = chatReducer(firstEdit, { type: 'set-input', value: 'later edit' })
    const saved = chatReducer(laterEdit, {
      type: 'save-succeeded',
      detail: detail({ draft: { ...detail().draft, revision: 3, text: 'first edit' } }),
      submittedVersion: firstEdit.draftEditVersion,
      cursor: 7,
      eventEpoch: 'epoch-1',
    })

    expect(saved.input).toBe('later edit')
    expect(saved.savedEditVersion).toBe(firstEdit.draftEditVersion)
    expect(saved.draftEditVersion).toBe(laterEdit.draftEditVersion)
    expect(saved.draftRevision).toBe(3)
  })

  it('uses Main message ids only after the matching thread/request is accepted', () => {
    const submitted = chatReducer(hydrated(), {
      type: 'request-submitted',
      threadId: 'thread-a',
      requestId: 'request-1',
      turnIntent: 'new_user_message',
      expectedDraftRevision: 2,
    })
    const foreign = chatReducer(submitted, {
      type: 'request-accepted',
      threadId: 'thread-b',
      requestId: 'request-1',
      userMessageId: 'user-main',
      assistantMessageId: 'assistant-main',
      turnIntent: 'new_user_message',
    })
    const accepted = chatReducer(foreign, {
      type: 'request-accepted',
      threadId: 'thread-a',
      requestId: 'request-1',
      userMessageId: 'user-main',
      assistantMessageId: 'assistant-main',
      turnIntent: 'new_user_message',
    })

    expect(foreign).toBe(submitted)
    expect(accepted.messages.map((message) => message.id)).toEqual(['user-main', 'assistant-main'])
    expect(accepted.input).toBe('')
  })

  it('locks a submitted request without clearing its captured Composer', () => {
    const state = submittedState()

    expect(state).toMatchObject({
      input: 'saved draft',
      runStatus: 'submitting',
      activeRequestId: requestId,
      activeAssistantMessageId: undefined,
      messages: [],
      activeTurn: {
        threadId,
        requestId,
        accepted: false,
        capturedInput: 'saved draft',
        expectedDraftRevision: 2,
      },
    })
    expect(chatReducer(state, { type: 'set-input', value: 'blocked' })).toBe(state)
  })

  it('retains the captured Composer and attachments when a request fails before acceptance', () => {
    const image = {
      id: 'image-1',
      name: 'one.png',
      status: 'ready' as const,
      source: null,
      image: { mediaType: 'image/png' as const, width: 1, height: 1 },
      canonicalBytes: new Uint8Array([1]),
      previewBytes: new Uint8Array([2]),
      previewUrl: 'blob:one',
    }
    const state = submittedState({ ...hydrated(), input: 'Hello', draftImages: [image] })
    const failed = chatReducer(state, {
      type: 'request-failed',
      threadId,
      requestId,
      error: retryableError,
    })

    expect(failed.input).toBe('Hello')
    expect(failed.draftImages).toEqual([image])
    expect(failed.messages).toEqual([])
    expect(failed.activeTurn).toBeNull()
    expect(failed.composerError).toEqual(retryableError)
  })

  it('clears captured ready attachments only after acceptance and inserts Main-owned message ids', () => {
    const image = {
      id: 'image-1',
      name: 'one.png',
      status: 'ready' as const,
      source: null,
      image: { mediaType: 'image/png' as const, width: 1, height: 1 },
      canonicalBytes: new Uint8Array([1]),
      previewBytes: new Uint8Array([2]),
      previewUrl: 'blob:one',
    }
    const document = {
      id: 'document-1',
      name: 'notes.txt',
      mediaType: 'text/plain' as const,
      status: 'ready' as const,
      source: null,
      document: {
        name: 'notes.txt',
        mediaType: 'text/plain' as const,
        byteLength: 5,
        extractedByteLength: 5,
      },
      sourceBytes: new TextEncoder().encode('hello'),
      extractedTextBytes: new TextEncoder().encode('hello'),
      extractedFromSha256: 'a'.repeat(64),
    }
    const submitted = submittedState({
      ...hydrated(),
      input: '',
      draftImages: [image],
      draftDocuments: [document],
    })
    const accepted = acceptedState(submitted)

    expect(submitted.draftImages).toEqual([image])
    expect(submitted.draftDocuments).toEqual([document])
    expect(accepted.draftImages).toEqual([])
    expect(accepted.draftDocuments).toEqual([])
    expect(accepted.messages).toEqual([
      {
        id: userMessageId,
        role: 'user',
        content: '',
        status: 'completed',
        images: [{ imageId: 'image-1', ...image.image, available: true }],
        documents: [{ documentId: 'document-1', ...document.document, available: true }],
      },
      { id: assistantMessageId, role: 'assistant', content: '', status: 'pending' },
    ])
  })

  it('keeps target selection locked before acceptance and editable during generation', () => {
    const seeded = chatReducer(hydrated(), {
      type: 'target-context-ready',
      generation: 0,
      catalogEpoch: 1,
      selection: target,
      available: true,
    })
    const submitted = submittedState(seeded)
    const blocked = chatReducer(submitted, {
      type: 'target-draft-changed',
      selection: { kind: 'env_fallback' },
      available: true,
    })
    const streaming = streamingState(acceptedState(submitted))
    const changed = chatReducer(streaming, {
      type: 'target-draft-changed',
      selection: { kind: 'env_fallback' },
      available: true,
    })

    expect(blocked).toBe(submitted)
    expect(changed.targetDraft).toEqual({ kind: 'env_fallback' })
    expect(assistantFrom(changed.messages).targetAttribution).toEqual(targetAttribution)
  })

  it('streams snapshots and finalizes completed or cancelled content', () => {
    const streaming = streamingState()
    const delta = chatReducer(streaming, {
      type: 'request-delta',
      threadId,
      requestId,
      assistantMessageId,
      snapshot: 'Partial response',
    })
    const completed = chatReducer(delta, {
      type: 'request-completed',
      threadId,
      requestId,
      assistantMessageId,
      status: 'completed',
      finalContent: 'Final response',
    })
    const cancelled = chatReducer(delta, {
      type: 'request-completed',
      threadId,
      requestId,
      assistantMessageId,
      status: 'cancelled',
      finalContent: 'Partial response',
    })

    expect(assistantFrom(delta.messages)).toMatchObject({
      content: 'Partial response',
      status: 'streaming',
      targetAttribution,
    })
    expect(completed).toMatchObject({
      runStatus: 'completed',
      activeRequestId: undefined,
      activeAssistantMessageId: undefined,
      activeTurn: null,
    })
    expect(assistantFrom(completed.messages)).toMatchObject({
      content: 'Final response',
      status: 'completed',
      canRetry: false,
    })
    expect(assistantFrom(cancelled.messages)).toMatchObject({
      content: 'Partial response',
      status: 'cancelled',
    })
  })

  it('ignores lifecycle events for another thread, request, or assistant identity', () => {
    const state = streamingState()
    const actions = [
      {
        type: 'request-delta' as const,
        threadId: 'thread-b',
        requestId,
        assistantMessageId,
        snapshot: 'wrong thread',
      },
      {
        type: 'request-delta' as const,
        threadId,
        requestId: 'request-stale',
        assistantMessageId,
        snapshot: 'wrong request',
      },
      {
        type: 'request-completed' as const,
        threadId,
        requestId,
        assistantMessageId: 'assistant-stale',
        status: 'completed' as const,
        finalContent: 'wrong assistant',
      },
    ]

    for (const action of actions) expect(chatReducer(state, action)).toBe(state)
  })

  it('stores retryability and attribution on provider failures', () => {
    const failed = chatReducer(streamingState(), {
      type: 'request-failed',
      threadId,
      requestId,
      assistantMessageId,
      error: retryableError,
      targetAttribution,
    })
    const nonRetryable = chatReducer(streamingState(), {
      type: 'request-failed',
      threadId,
      requestId,
      assistantMessageId,
      error: { code: 'auth_failed', message: 'Authentication failed.', retryable: false },
    })

    expect(failed).toMatchObject({ runStatus: 'failed', activeTurn: null })
    expect(assistantFrom(failed.messages)).toMatchObject({
      status: 'failed',
      error: retryableError,
      canRetry: true,
      targetAttribution,
    })
    expect(assistantFrom(nonRetryable.messages)).toMatchObject({
      status: 'failed',
      canRetry: false,
    })
  })

  it('reuses canonical assistant identity for an ordinary Retry without clearing the Composer', () => {
    const failedDetail = detail({
      messages: [
        { id: userMessageId, role: 'user', content: 'Hello', status: 'completed' },
        {
          id: assistantMessageId,
          role: 'assistant',
          content: 'Partial',
          status: 'failed',
          error: retryableError,
          canRetry: true,
          targetAttribution,
        },
      ],
      runStatus: 'failed',
      retryableTurn: {
        turnOrdinal: 1,
        expectedAttemptRequestId: 'attempt-1',
        expectedDraftRevision: 2,
        userMessageId,
        assistantMessageId,
      },
    })
    const hydratedFailure = chatReducer(initialChatState, {
      type: 'thread-library-hydrated',
      generation: 0,
      summary: failedDetail.summary,
      detail: failedDetail,
      eventEpoch: 'epoch-1',
      listCursor: 1,
      detailCursor: 1,
    })
    const submitted = submittedState(
      { ...hydratedFailure, input: 'Next question' },
      'retry_failed_response',
    )
    const accepted = acceptedState(submitted)

    expect(accepted.input).toBe('Next question')
    expect(accepted.retryableTurn).toBeNull()
    expect(assistantFrom(accepted.messages)).toEqual({
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      status: 'pending',
      canRetry: false,
    })
  })

  it('keeps terminal settlement failure separate from provider retry state', () => {
    const accepted = chatReducer(
      chatReducer(hydrated(), {
        type: 'request-submitted',
        threadId: 'thread-a',
        requestId: 'request-1',
        turnIntent: 'new_user_message',
        expectedDraftRevision: 2,
      }),
      {
        type: 'request-accepted',
        threadId: 'thread-a',
        requestId: 'request-1',
        userMessageId: 'user-1',
        assistantMessageId: 'assistant-1',
        turnIntent: 'new_user_message',
      },
    )
    const failed = chatReducer(accepted, {
      type: 'request-failed',
      threadId: 'thread-a',
      requestId: 'request-1',
      assistantMessageId: 'assistant-1',
      error: {
        code: 'unknown',
        message: "Couldn't save result",
        retryable: true,
      },
    })

    expect(failed.settlementFailure).toEqual({
      requestId: 'request-1',
      assistantMessageId: 'assistant-1',
    })
    expect(failed.retryableTurn).toBeNull()
    expect(failed.messages.at(-1)?.error?.code).toBe('unknown')

    const retrying = chatReducer(failed, {
      type: 'settlement-retry-submitted',
      threadId: 'thread-a',
      requestId: 'request-1',
      assistantMessageId: 'assistant-1',
      expectedDraftRevision: 2,
    })
    const completed = chatReducer(retrying, {
      type: 'request-completed',
      threadId: 'thread-a',
      requestId: 'request-1',
      assistantMessageId: 'assistant-1',
      status: 'completed',
      finalContent: '',
    })
    expect(completed.messages.at(-1)?.content).toBe(accepted.messages.at(-1)?.content)
    expect(completed.messages.at(-1)?.status).toBe('completed')
    expect(completed.settlementFailure).toBeNull()

    const providerFailed = chatReducer(retrying, {
      type: 'request-failed',
      threadId: 'thread-a',
      requestId: 'request-1',
      assistantMessageId: 'assistant-1',
      error: {
        code: 'upstream_error',
        message: 'The provider could not complete the response.',
        retryable: true,
      },
    })
    expect(providerFailed.messages.at(-1)?.error?.code).toBe('upstream_error')
    expect(providerFailed.messages.at(-1)?.canRetry).toBe(true)
    expect(providerFailed.settlementFailure).toBeNull()
  })

  it('does not let an old hydration result unlock a pending New barrier', () => {
    const pending = chatReducer(hydrated(), { type: 'new-thread-started' })
    const next = chatReducer(pending, {
      type: 'thread-library-hydrated',
      generation: pending.projectionGeneration,
      summary: detail().summary,
      detail: detail(),
      eventEpoch: 'epoch-1',
      listCursor: 3,
      detailCursor: 3,
    })

    expect(next).toBe(pending)
    expect(next.newThreadPending).toBe(true)
  })

  it('materializes only ready attachments, not preparation or failure', () => {
    const preparing = chatReducer(initialChatState, {
      type: 'draft-images-added',
      images: [{ id: 'image-1', name: 'one.png', status: 'preparing', source: new Blob() }],
    })
    const failed = chatReducer(preparing, {
      type: 'draft-image-failed',
      imageId: 'image-1',
      error: 'failed',
    })
    const ready = chatReducer(preparing, {
      type: 'draft-image-ready',
      imageId: 'image-1',
      image: { mediaType: 'image/png', width: 1, height: 1 },
      canonicalBytes: new Uint8Array([1]),
      previewBytes: new Uint8Array([2]),
      previewUrl: 'blob:one',
    })

    expect(preparing.draftEditVersion).toBe(0)
    expect(failed.draftEditVersion).toBe(0)
    expect(ready.draftEditVersion).toBe(1)
  })

  it('tracks document readiness and removal as Draft edits', () => {
    const source = new File(['hello'], 'notes.txt', { type: 'text/plain' })
    const preparing = chatReducer(hydrated(), {
      type: 'draft-documents-added',
      documents: [
        {
          id: 'document-1',
          name: 'notes.txt',
          mediaType: 'text/plain',
          status: 'preparing',
          source,
        },
      ],
    })
    const ready = chatReducer(preparing, {
      type: 'draft-document-ready',
      documentId: 'document-1',
      document: {
        name: 'notes.txt',
        mediaType: 'text/plain',
        byteLength: 5,
        extractedByteLength: 5,
      },
      sourceBytes: new TextEncoder().encode('hello'),
      extractedTextBytes: new TextEncoder().encode('hello'),
      extractedFromSha256: 'a'.repeat(64),
    })
    const removed = chatReducer(ready, {
      type: 'draft-document-removed',
      documentId: 'document-1',
    })

    expect(preparing.draftEditVersion).toBe(0)
    expect(ready.draftEditVersion).toBe(1)
    expect(removed.draftEditVersion).toBe(2)
    expect(removed.draftDocuments).toEqual([])
  })
})
