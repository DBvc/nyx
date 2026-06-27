import { afterEach, describe, expect, it } from 'vitest'

import { readNyxProviderStatus } from './env'

const ENV_KEYS = ['NYX_API_BASE_URL', 'NYX_API_TOKEN', 'NYX_MODEL'] as const
const ORIGINAL_ENV = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]])) as Record<
  (typeof ENV_KEYS)[number],
  string | undefined
>

function setEnv(values: Partial<Record<(typeof ENV_KEYS)[number], string>>) {
  for (const key of ENV_KEYS) {
    delete process.env[key]
  }

  for (const [key, value] of Object.entries(values)) {
    process.env[key] = value
  }
}

function restoreEnv() {
  for (const key of ENV_KEYS) {
    const value = ORIGINAL_ENV[key]

    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }
}

afterEach(() => {
  restoreEnv()
})

describe('readNyxProviderStatus', () => {
  it('reports missing required provider environment variables', () => {
    setEnv({})

    expect(readNyxProviderStatus()).toEqual({
      configured: false,
      model: null,
      baseUrlHost: null,
      missingEnv: ['NYX_API_BASE_URL', 'NYX_API_TOKEN'],
    })
  })

  it('returns redacted ready status for valid provider configuration', () => {
    setEnv({
      NYX_API_BASE_URL: 'https://token-user:secret@example.com/custom/v1?api_key=hidden',
      NYX_API_TOKEN: 'super-secret-token',
      NYX_MODEL: ' nyx-model ',
    })

    const status = readNyxProviderStatus()

    expect(status).toEqual({
      configured: true,
      model: 'nyx-model',
      baseUrlHost: 'example.com',
      missingEnv: [],
    })
    expect(JSON.stringify(status)).not.toContain('super-secret-token')
    expect(JSON.stringify(status)).not.toContain('api_key=hidden')
  })

  it('treats an invalid base URL as not configured without returning the raw value', () => {
    setEnv({
      NYX_API_BASE_URL: 'not a url with secret',
      NYX_API_TOKEN: 'super-secret-token',
    })

    const status = readNyxProviderStatus()

    expect(status).toEqual({
      configured: false,
      model: null,
      baseUrlHost: null,
      missingEnv: [],
    })
    expect(JSON.stringify(status)).not.toContain('not a url with secret')
    expect(JSON.stringify(status)).not.toContain('super-secret-token')
  })

  it('trims blank environment values before reporting status', () => {
    setEnv({
      NYX_API_BASE_URL: '   ',
      NYX_API_TOKEN: '   ',
      NYX_MODEL: '   ',
    })

    expect(readNyxProviderStatus()).toEqual({
      configured: false,
      model: null,
      baseUrlHost: null,
      missingEnv: ['NYX_API_BASE_URL', 'NYX_API_TOKEN'],
    })
  })
})
