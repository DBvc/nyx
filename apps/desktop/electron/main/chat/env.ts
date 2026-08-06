import type { NyxProviderMissingEnv, NyxProviderStatus } from '../../../shared/provider/types'
import { createChatBridgeError } from './errors'

export interface ChatProviderConfig {
  baseUrl: string
  token: string
  model: string
}

const DEFAULT_CHAT_MODEL = 'gpt-5.4'

function readOptionalModel() {
  return process.env.NYX_MODEL?.trim() || null
}

function resolveEffectiveModel(model = readOptionalModel()) {
  return model ?? DEFAULT_CHAT_MODEL
}

function readRequiredEnv(name: 'NYX_API_BASE_URL' | 'NYX_API_TOKEN') {
  const value = process.env[name]?.trim()

  if (!value) {
    throw createChatBridgeError({
      code: 'config_missing',
      message: `Missing required environment variable: ${name}.`,
      retryable: false,
    })
  }

  return value
}

function normalizeBaseUrl(rawBaseUrl: string) {
  let url: URL

  try {
    url = new URL(rawBaseUrl)
  } catch {
    throw createChatBridgeError({
      code: 'config_missing',
      message: 'NYX_API_BASE_URL must be a valid URL.',
      retryable: false,
    })
  }

  if (!url.pathname.endsWith('/')) {
    url.pathname = `${url.pathname}/`
  }

  return url.toString()
}

export function readProviderStatus(): NyxProviderStatus {
  const rawBaseUrl = process.env.NYX_API_BASE_URL?.trim()
  const token = process.env.NYX_API_TOKEN?.trim()
  const model = readOptionalModel()
  const missingEnv: NyxProviderMissingEnv[] = []
  let baseUrlHost: string | null = null
  let hasValidBaseUrl = false

  if (!rawBaseUrl) {
    missingEnv.push('NYX_API_BASE_URL')
  } else {
    try {
      baseUrlHost = new URL(rawBaseUrl).hostname
      hasValidBaseUrl = true
    } catch {
      hasValidBaseUrl = false
    }
  }

  if (!token) {
    missingEnv.push('NYX_API_TOKEN')
  }

  const configured = hasValidBaseUrl && Boolean(token)

  return {
    configured,
    model: configured ? resolveEffectiveModel(model) : model,
    baseUrlHost,
    missingEnv,
  }
}

export function readChatProviderConfig(): ChatProviderConfig {
  return {
    baseUrl: normalizeBaseUrl(readRequiredEnv('NYX_API_BASE_URL')),
    token: readRequiredEnv('NYX_API_TOKEN'),
    model: resolveEffectiveModel(),
  }
}
