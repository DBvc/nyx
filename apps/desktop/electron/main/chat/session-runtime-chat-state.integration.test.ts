import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { WebContents } from 'electron'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { NyxChatEvent } from '../../../shared/chat/events'
import type { NyxChatRequest } from '../../../shared/chat/types'
import {
  createRuntimeChatStateClient,
  type RuntimeChatReducerState,
  type RuntimeChatStateClient,
} from '../runtime/chat-state-client'

const streamChatCompletion = vi.hoisted(() => vi.fn())

vi.mock('./client', () => ({
  streamChatCompletion,
}))

vi.mock('./env', () => ({
  readChatProviderConfig: () => ({
    baseUrl: 'https://example.com/v1/',
    token: 'token',
    model: 'model',
  }),
}))

import { ChatSessionManager } from './session'

const repoRoot = fileURLToPath(new URL('../../../../..', import.meta.url))
const artifactPath = join(repoRoot, 'apps', 'desktop', '.runtime-artifacts', 'nyx-runtime')
const integrationIt = process.env.NYX_RUNTIME_CHAT_STATE_INTEGRATION === '1' ? it : it.skip

function configuredRuntimeArtifactPath() {
  const configuredRuntimePath = process.env.NYX_RUNTIME_PATH

  if (!configuredRuntimePath) {
    throw new Error('NYX_RUNTIME_PATH must point at the generated runtime artifact.')
  }

  return resolve(configuredRuntimePath)
}

function checkedRuntimeArtifactPath() {
  const runtimePath = configuredRuntimeArtifactPath()

  expect(process.env.NYX_RUNTIME_CHAT_STATE).toBeUndefined()
  expect(runtimePath).toBe(artifactPath)
  expect(existsSync(runtimePath)).toBe(true)

  return runtimePath
}

function chatRequest({
  requestId,
  userMessageId = 'user-1',
  assistantMessageId = 'assistant-1',
  turnIntent = 'new_user_message',
  content = 'Hello Nyx',
}: {
  requestId: string
  userMessageId?: string
  assistantMessageId?: string
  turnIntent?: NyxChatRequest['turnIntent']
  content?: string
}): NyxChatRequest {
  return {
    requestId,
    userMessageId,
    assistantMessageId,
    turnIntent,
    turnUserMessage: {
      id: userMessageId,
      content,
    },
    messages: [
      {
        role: 'user',
        content,
      },
    ],
  }
}

function mockSender() {
  const listeners = new Map<string, Set<() => void>>()
  const sender = {
    isDestroyed: vi.fn(() => false),
    send: vi.fn(),
    once: vi.fn(),
    off: vi.fn(),
    emitDestroyed: vi.fn(),
  }

  sender.once.mockImplementation((event: string, listener: () => void) => {
    const eventListeners = listeners.get(event) ?? new Set<() => void>()

    eventListeners.add(listener)
    listeners.set(event, eventListeners)

    return sender
  })
  sender.off.mockImplementation((event: string, listener: () => void) => {
    listeners.get(event)?.delete(listener)

    return sender
  })
  sender.emitDestroyed.mockImplementation(() => {
    sender.isDestroyed.mockReturnValue(true)

    const destroyedListeners = listeners.get('destroyed')

    if (destroyedListeners) {
      for (const listener of destroyedListeners) {
        listener()
      }
    }

    listeners.delete('destroyed')
  })

  return sender as unknown as WebContents & typeof sender
}

function sentChatEvents(sender: ReturnType<typeof mockSender>) {
  return sender.send.mock.calls.map(([_channel, event]) => event as NyxChatEvent)
}

async function waitForAssertion(assertion: () => void, timeoutMs = 5_000, intervalMs = 25) {
  let lastError: unknown
  const deadline = Date.now() + timeoutMs

  while (Date.now() <= deadline) {
    try {
      assertion()
      return
    } catch (error) {
      lastError = error
      await new Promise((resolve) => setTimeout(resolve, intervalMs))
    }
  }

  throw lastError
}

function createObservableRuntimeChatStateClient(clearStates: RuntimeChatReducerState[]) {
  const client = createRuntimeChatStateClient()
  const observableClient: RuntimeChatStateClient = {
    submitUserMessage: (turn) => client.submitUserMessage(turn),
    retryFailed: (turn) => client.retryFailed(turn),
    startAssistant: (turn) => client.startAssistant(turn),
    appendDelta: (turn) => client.appendDelta(turn),
    complete: (turn) => client.complete(turn),
    cancel: (turn) => client.cancel(turn),
    fail: (turn) => client.fail(turn),
    clear: async () => {
      const state = await client.clear()

      clearStates.push(state)

      return state
    },
    close: () => client.close(),
  }

  return observableClient
}

function abortError() {
  const error = new Error('Aborted')
  error.name = 'AbortError'
  return error
}

describe('ChatSessionManager runtime chat state artifact integration', () => {
  beforeEach(() => {
    streamChatCompletion.mockReset()
  })

  integrationIt(
    'completes a streamed turn through the runtime-backed chat state path',
    async () => {
      checkedRuntimeArtifactPath()
      streamChatCompletion.mockImplementation(
        async ({ onDelta }: { onDelta: (delta: string, snapshot: string) => Promise<void> }) => {
          await onDelta('Hel', 'Hel')
          await onDelta('lo', 'Hello')
          return { finalContent: 'Hello' }
        },
      )
      const sender = mockSender()
      const manager = new ChatSessionManager()

      try {
        manager.start(sender, chatRequest({ requestId: 'request-complete-1' }))

        await waitForAssertion(() => {
          expect(sentChatEvents(sender).at(-1)).toEqual({
            type: 'chat:done',
            requestId: 'request-complete-1',
            assistantMessageId: 'assistant-1',
            status: 'completed',
            finalContent: 'Hello',
          })
        })

        expect(sentChatEvents(sender)).toEqual([
          {
            type: 'chat:start',
            requestId: 'request-complete-1',
            assistantMessageId: 'assistant-1',
            status: 'streaming',
          },
          {
            type: 'chat:delta',
            requestId: 'request-complete-1',
            assistantMessageId: 'assistant-1',
            delta: 'Hel',
            snapshot: 'Hel',
          },
          {
            type: 'chat:delta',
            requestId: 'request-complete-1',
            assistantMessageId: 'assistant-1',
            delta: 'lo',
            snapshot: 'Hello',
          },
          {
            type: 'chat:done',
            requestId: 'request-complete-1',
            assistantMessageId: 'assistant-1',
            status: 'completed',
            finalContent: 'Hello',
          },
        ])
      } finally {
        await manager.reset(sender)
      }
    },
  )

  integrationIt('cancels an active runtime-backed turn with partial content', async () => {
    checkedRuntimeArtifactPath()
    let activeSignal: AbortSignal | undefined
    streamChatCompletion.mockImplementation(
      async ({
        signal,
        onDelta,
      }: {
        signal: AbortSignal
        onDelta: (delta: string, snapshot: string) => Promise<void>
      }) => {
        activeSignal = signal
        await onDelta('Part', 'Part')

        return await new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(abortError()), { once: true })
        })
      },
    )
    const sender = mockSender()
    const manager = new ChatSessionManager()

    try {
      manager.start(sender, chatRequest({ requestId: 'request-cancel-1' }))

      await waitForAssertion(() => {
        expect(sentChatEvents(sender).at(-1)).toMatchObject({
          type: 'chat:delta',
          requestId: 'request-cancel-1',
          snapshot: 'Part',
        })
      })

      manager.cancel({ requestId: 'request-cancel-1' })

      await waitForAssertion(() => {
        expect(sentChatEvents(sender).at(-1)).toEqual({
          type: 'chat:done',
          requestId: 'request-cancel-1',
          assistantMessageId: 'assistant-1',
          status: 'cancelled',
          finalContent: 'Part',
        })
      })

      expect(activeSignal?.aborted).toBe(true)
    } finally {
      await manager.reset(sender)
    }
  })

  integrationIt(
    'fails and retries a runtime-backed turn without resubmitting the user message',
    async () => {
      checkedRuntimeArtifactPath()
      streamChatCompletion
        .mockRejectedValueOnce(new Error('Provider exploded'))
        .mockImplementationOnce(
          async ({ onDelta }: { onDelta: (delta: string, snapshot: string) => Promise<void> }) => {
            await onDelta('Retried', 'Retried')
            return { finalContent: 'Retried answer' }
          },
        )
      const sender = mockSender()
      const manager = new ChatSessionManager()

      try {
        manager.start(sender, chatRequest({ requestId: 'request-fail-1' }))

        await waitForAssertion(() => {
          expect(sentChatEvents(sender).at(-1)).toEqual({
            type: 'chat:error',
            requestId: 'request-fail-1',
            assistantMessageId: 'assistant-1',
            status: 'failed',
            error: {
              code: 'unknown',
              message: 'Provider exploded',
              retryable: true,
            },
          })
        })

        manager.start(
          sender,
          chatRequest({
            requestId: 'request-retry-1',
            turnIntent: 'retry_failed_response',
          }),
        )

        await waitForAssertion(() => {
          expect(sentChatEvents(sender).at(-1)).toEqual({
            type: 'chat:done',
            requestId: 'request-retry-1',
            assistantMessageId: 'assistant-1',
            status: 'completed',
            finalContent: 'Retried answer',
          })
        })
      } finally {
        await manager.reset(sender)
      }
    },
  )

  integrationIt('starts a fresh runtime-backed user message after a provider failure', async () => {
    checkedRuntimeArtifactPath()
    streamChatCompletion
      .mockRejectedValueOnce(new Error('Provider exploded'))
      .mockImplementationOnce(
        async ({ onDelta }: { onDelta: (delta: string, snapshot: string) => Promise<void> }) => {
          await onDelta('Fresh', 'Fresh')
          return { finalContent: 'Fresh answer' }
        },
      )
    const sender = mockSender()
    const manager = new ChatSessionManager()

    try {
      manager.start(sender, chatRequest({ requestId: 'request-fail-new-1' }))

      await waitForAssertion(() => {
        expect(sentChatEvents(sender).at(-1)).toEqual({
          type: 'chat:error',
          requestId: 'request-fail-new-1',
          assistantMessageId: 'assistant-1',
          status: 'failed',
          error: {
            code: 'unknown',
            message: 'Provider exploded',
            retryable: true,
          },
        })
      })

      manager.start(
        sender,
        chatRequest({
          requestId: 'request-after-fail-new-1',
          userMessageId: 'user-2',
          assistantMessageId: 'assistant-2',
          content: 'Fresh prompt',
        }),
      )

      await waitForAssertion(() => {
        expect(sentChatEvents(sender).at(-1)).toEqual({
          type: 'chat:done',
          requestId: 'request-after-fail-new-1',
          assistantMessageId: 'assistant-2',
          status: 'completed',
          finalContent: 'Fresh answer',
        })
      })

      expect(streamChatCompletion).toHaveBeenCalledTimes(2)
      expect(streamChatCompletion.mock.calls[1]?.[0]).toMatchObject({
        request: {
          requestId: 'request-after-fail-new-1',
          userMessageId: 'user-2',
          assistantMessageId: 'assistant-2',
          turnIntent: 'new_user_message',
          turnUserMessage: {
            id: 'user-2',
            content: 'Fresh prompt',
          },
        },
      })
    } finally {
      await manager.reset(sender)
    }
  })

  integrationIt('resets and clears a runtime-backed turn before the next request', async () => {
    checkedRuntimeArtifactPath()
    let activeSignal: AbortSignal | undefined
    streamChatCompletion
      .mockImplementationOnce(({ signal }: { signal: AbortSignal }) => {
        activeSignal = signal

        return new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(abortError()), { once: true })
        })
      })
      .mockImplementationOnce(
        async ({ onDelta }: { onDelta: (delta: string, snapshot: string) => Promise<void> }) => {
          await onDelta('Fresh', 'Fresh')
          return { finalContent: 'Fresh answer' }
        },
      )
    const sender = mockSender()
    const clearStates: RuntimeChatReducerState[] = []
    const manager = new ChatSessionManager({
      createRuntimeChatStateClient: () => createObservableRuntimeChatStateClient(clearStates),
    })

    manager.start(sender, chatRequest({ requestId: 'request-reset-1' }))

    await waitForAssertion(() => {
      expect(streamChatCompletion).toHaveBeenCalledTimes(1)
    })

    await manager.reset(sender)

    expect(activeSignal?.aborted).toBe(true)
    expect(clearStates).toEqual([
      {
        transcript: [],
        current_turn: {
          type: 'no_turn',
        },
      },
    ])

    manager.start(
      sender,
      chatRequest({
        requestId: 'request-after-reset-1',
        userMessageId: 'user-2',
        assistantMessageId: 'assistant-2',
        content: 'Fresh prompt',
      }),
    )

    try {
      await waitForAssertion(() => {
        expect(sentChatEvents(sender).at(-1)).toEqual({
          type: 'chat:done',
          requestId: 'request-after-reset-1',
          assistantMessageId: 'assistant-2',
          status: 'completed',
          finalContent: 'Fresh answer',
        })
      })
    } finally {
      await manager.reset(sender)
    }
  })
})
