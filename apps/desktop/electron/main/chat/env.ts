import { createNyxChatBridgeError } from './errors'

export interface NyxChatRuntimeConfig {
  baseUrl: string
  token: string
  model: string
}

function readRequiredEnv(name: 'NYX_API_BASE_URL' | 'NYX_API_TOKEN') {
  const value = process.env[name]?.trim()

  if (!value) {
    throw createNyxChatBridgeError({
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
    throw createNyxChatBridgeError({
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

export function readNyxChatRuntimeConfig(): NyxChatRuntimeConfig {
  return {
    baseUrl: normalizeBaseUrl(readRequiredEnv('NYX_API_BASE_URL')),
    token: readRequiredEnv('NYX_API_TOKEN'),
    model: process.env.NYX_MODEL?.trim() || 'gpt-5.4',
  }
}
