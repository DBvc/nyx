import type { NyxProviderMissingEnv, NyxProviderStatus } from '../../../shared/provider/types'
import { createChatBridgeError } from './errors'

export interface ChatProviderConfig {
  baseUrl: string
  token: string
  model: string
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

  return {
    configured: hasValidBaseUrl && Boolean(token),
    model: process.env.NYX_MODEL?.trim() || null,
    baseUrlHost,
    missingEnv,
  }
}

export function readChatProviderConfig(): ChatProviderConfig {
  return {
    baseUrl: normalizeBaseUrl(readRequiredEnv('NYX_API_BASE_URL')),
    token: readRequiredEnv('NYX_API_TOKEN'),
    model: process.env.NYX_MODEL?.trim() || 'gpt-5.4',
  }
}
