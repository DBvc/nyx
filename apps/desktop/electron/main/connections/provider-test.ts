import type {
  NyxConnectionModelProtocolConfig,
  NyxConnectionsSafeError,
} from '../../../shared/connections/types'
import { streamOpenAiResponses } from '../chat/client'
import { ChatBridgeError } from '../chat/errors'
import type { ResolvedChatTarget } from './provider-resolver'
import { normalizeConnectionBaseUrl } from './url'

export interface ProviderConnectionRequest {
  baseUrl: string
  apiKey: string
}

export interface ProviderConnectionTestRequest extends ProviderConnectionRequest {
  modelId: string
  protocolConfig: NyxConnectionModelProtocolConfig
}

export interface ProviderConnectionTestSuccess {
  latencyMs: number | null
}

export interface ProviderModelsRefreshSuccess {
  modelIds: ReadonlyArray<string>
}

export interface ProviderConnectionClient {
  testConnection(input: ProviderConnectionTestRequest): Promise<ProviderConnectionTestSuccess>
  refreshModels(input: ProviderConnectionRequest): Promise<ProviderModelsRefreshSuccess>
}

export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>

export interface ProviderConnectionClientOptions {
  fetch?: FetchLike
  nowMs?: () => number
  timeoutMs?: number
}

export class ConnectionsProviderError extends Error {
  readonly safeError: NyxConnectionsSafeError

  constructor(safeError: NyxConnectionsSafeError) {
    super(safeError.message)
    this.name = 'ConnectionsProviderError'
    this.safeError = safeError
  }
}

const DEFAULT_TIMEOUT_MS = 15_000

function buildProviderEndpointUrl(baseUrl: string, endpoint: string) {
  const url = new URL(normalizeConnectionBaseUrl(baseUrl))

  if (url.pathname === '/' || url.pathname === '') {
    url.pathname = `/v1/${endpoint}`
    return url.toString()
  }

  url.pathname = `${url.pathname.endsWith('/') ? url.pathname : `${url.pathname}/`}${endpoint}`
  return url.toString()
}

export function buildProviderChatCompletionsUrl(baseUrl: string) {
  return buildProviderEndpointUrl(baseUrl, 'chat/completions')
}

export function buildProviderModelsUrl(baseUrl: string) {
  return buildProviderEndpointUrl(baseUrl, 'models')
}

function throwSafe(error: NyxConnectionsSafeError): never {
  throw new ConnectionsProviderError(error)
}

function mapHttpError(response: Response, purpose: 'test' | 'models'): never {
  const safeDetails = `HTTP ${response.status}`

  if (response.status === 401 || response.status === 403) {
    return throwSafe({
      code: 'auth_failed',
      message: 'Nyx could not authenticate with this provider.',
      retryable: false,
      safeDetails,
    })
  }

  if (response.status === 429) {
    return throwSafe({
      code: 'rate_limited',
      message: 'The provider is rate limiting this request.',
      retryable: true,
      safeDetails,
    })
  }

  if (purpose === 'models' && (response.status === 404 || response.status === 405)) {
    return throwSafe({
      code: 'unsupported',
      message: 'This provider does not expose a compatible models endpoint.',
      retryable: false,
      safeDetails,
    })
  }

  return throwSafe({
    code: 'upstream_error',
    message: 'The provider returned an unexpected response.',
    retryable: response.status >= 500,
    safeDetails,
  })
}

function mapFetchError(error: unknown): never {
  if (error instanceof ChatBridgeError) {
    return throwSafe({
      code:
        error.chatError.code === 'auth_failed' ||
        error.chatError.code === 'rate_limited' ||
        error.chatError.code === 'network_error'
          ? error.chatError.code
          : error.chatError.code === 'invalid_request'
            ? 'unsupported'
            : 'upstream_error',
      message: error.chatError.message,
      retryable: error.chatError.retryable,
    })
  }

  if (error instanceof Error && error.name === 'AbortError') {
    return throwSafe({
      code: 'network_error',
      message: 'Timed out while contacting the provider.',
      retryable: true,
    })
  }

  return throwSafe({
    code: 'network_error',
    message: 'Nyx could not reach the provider.',
    retryable: true,
  })
}

function createTimedSignal(timeoutMs: number) {
  const controller = new AbortController()
  const timeout = setTimeout(() => {
    controller.abort()
  }, timeoutMs)

  return {
    signal: controller.signal,
    clear: () => {
      clearTimeout(timeout)
    },
  }
}

function authHeaders(apiKey: string) {
  return {
    Accept: 'application/json',
    Authorization: `Bearer ${apiKey}`,
  }
}

function connectionTestTarget({
  apiKey,
  baseUrl,
  modelId,
  protocolConfig,
}: ProviderConnectionTestRequest): ResolvedChatTarget {
  return {
    providerId: null,
    baseUrl,
    token: apiKey,
    modelId,
    protocolConfig: { ...protocolConfig },
    executionIdentity: null,
    targetAttribution: { kind: 'env_fallback', modelId },
  }
}

function parseModelIds(payload: unknown) {
  if (
    !payload ||
    typeof payload !== 'object' ||
    !('data' in payload) ||
    !Array.isArray(payload.data)
  ) {
    return []
  }

  const seen = new Set<string>()
  const modelIds: string[] = []

  for (const item of payload.data) {
    if (!item || typeof item !== 'object' || !('id' in item) || typeof item.id !== 'string') {
      continue
    }

    const modelId = item.id.trim()

    if (modelId && !seen.has(modelId)) {
      seen.add(modelId)
      modelIds.push(modelId)
    }
  }

  return modelIds
}

export function createProviderConnectionClient({
  fetch = globalThis.fetch,
  nowMs = () => performance.now(),
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: ProviderConnectionClientOptions = {}): ProviderConnectionClient {
  return {
    async testConnection(input) {
      const { apiKey, baseUrl, modelId, protocolConfig } = input
      const timed = createTimedSignal(timeoutMs)
      const startedAt = nowMs()

      try {
        if (protocolConfig.protocol === 'openai-responses') {
          const target = connectionTestTarget({
            ...input,
            baseUrl: normalizeConnectionBaseUrl(baseUrl),
          })
          const firstUser = {
            role: 'user',
            content: [{ type: 'input_text', text: 'Return exactly TEST_ONE.' }],
          }
          const first = await streamOpenAiResponses({
            target,
            instructions: 'Follow the synthetic connection test exactly.',
            input: [firstUser],
            signal: timed.signal,
            fetcher: fetch,
            onDelta: () => {},
          })

          if (first.finalContent.trim() !== 'TEST_ONE') {
            return throwSafe({
              code: 'upstream_error',
              message: 'The provider failed the first Responses semantic check.',
              retryable: true,
            })
          }

          timed.clear()
          const replayTimed = createTimedSignal(timeoutMs)

          try {
            const second = await streamOpenAiResponses({
              target,
              instructions: 'Follow the synthetic connection test exactly.',
              input: [
                firstUser,
                ...first.providerState.outputItems,
                {
                  role: 'user',
                  content: [
                    {
                      type: 'input_text',
                      text: 'Return your previous answer, one space, then TEST_TWO.',
                    },
                  ],
                },
              ],
              signal: replayTimed.signal,
              fetcher: fetch,
              onDelta: () => {},
            })

            if (second.finalContent.trim() !== 'TEST_ONE TEST_TWO') {
              return throwSafe({
                code: 'upstream_error',
                message: 'The provider failed the Responses continuation check.',
                retryable: true,
              })
            }
          } finally {
            replayTimed.clear()
          }

          return { latencyMs: Math.max(0, Math.round(nowMs() - startedAt)) }
        }

        const response = await fetch(buildProviderChatCompletionsUrl(baseUrl), {
          method: 'POST',
          headers: {
            ...authHeaders(apiKey),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: modelId,
            stream: false,
            max_tokens: 1,
            messages: [
              {
                role: 'user',
                content: 'Reply with OK.',
              },
            ],
          }),
          signal: timed.signal,
        })

        if (!response.ok) {
          mapHttpError(response, 'test')
        }

        return {
          latencyMs: Math.max(0, Math.round(nowMs() - startedAt)),
        }
      } catch (error) {
        if (error instanceof ConnectionsProviderError) {
          throw error
        }

        mapFetchError(error)
      } finally {
        timed.clear()
      }
    },

    async refreshModels({ apiKey, baseUrl }) {
      const timed = createTimedSignal(timeoutMs)

      try {
        const response = await fetch(buildProviderModelsUrl(baseUrl), {
          method: 'GET',
          headers: authHeaders(apiKey),
          signal: timed.signal,
        })

        if (!response.ok) {
          mapHttpError(response, 'models')
        }

        let payload: unknown

        try {
          payload = await response.json()
        } catch {
          return throwSafe({
            code: 'upstream_error',
            message: 'The provider returned an unusable models response.',
            retryable: true,
          })
        }

        const modelIds = parseModelIds(payload)

        if (modelIds.length === 0) {
          return throwSafe({
            code: 'upstream_error',
            message: 'The provider did not return any compatible models.',
            retryable: true,
          })
        }

        return { modelIds }
      } catch (error) {
        if (error instanceof ConnectionsProviderError) {
          throw error
        }

        mapFetchError(error)
      } finally {
        timed.clear()
      }
    },
  }
}
