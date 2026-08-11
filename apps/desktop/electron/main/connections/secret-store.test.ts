import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { ConfigFileError } from './config-file'
import {
  createSafeStorageSecretCrypto,
  createSecretStore,
  SecretStoreError,
  type SecretCryptoAdapter,
} from './secret-store'

const tempDirs: string[] = []

async function createTempFile(name: string) {
  const dir = await mkdtemp(join(tmpdir(), 'nyx-secret-store-'))
  tempDirs.push(dir)
  return join(dir, name)
}

function reverse(value: string) {
  return [...value].reverse().join('')
}

function createFakeCrypto(available = true): SecretCryptoAdapter {
  return {
    isEncryptionAvailable: () => available,
    encrypt: (value) => Buffer.from(`sealed:${reverse(value)}`, 'utf8').toString('base64'),
    decrypt: (encryptedValue) => {
      const decoded = Buffer.from(encryptedValue, 'base64').toString('utf8')

      if (!decoded.startsWith('sealed:')) {
        throw new Error('Invalid fake encrypted payload.')
      }

      return reverse(decoded.slice('sealed:'.length))
    },
  }
}

function createStore(filePath: string, crypto = createFakeCrypto()) {
  let revision = 0

  return createSecretStore({
    filePath,
    crypto,
    generateRevision: () => `00000000-0000-4000-8000-${String(++revision).padStart(12, '0')}`,
    now: () => '2026-07-08T00:00:00.000Z',
  })
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })))
})

describe('createSafeStorageSecretCrypto', () => {
  it('wraps Electron safeStorage encryption as base64 payloads', () => {
    const crypto = createSafeStorageSecretCrypto({
      isEncryptionAvailable: () => true,
      encryptString: (value) => Buffer.from(`safe:${value}`, 'utf8'),
      decryptString: (encryptedValue) => encryptedValue.toString('utf8').replace(/^safe:/, ''),
    })

    const encrypted = crypto.encrypt('sk-live')

    expect(encrypted).toBe(Buffer.from('safe:sk-live', 'utf8').toString('base64'))
    expect(crypto.decrypt(encrypted)).toBe('sk-live')
  })
})

describe('SecretStore', () => {
  it('treats a missing secrets file as empty state', async () => {
    const store = createStore(await createTempFile('secrets.json'))

    await expect(store.hasSecret('provider-1')).resolves.toBe(false)
    await expect(store.readCredential('provider-1')).resolves.toBeNull()
  })

  it('persists only encrypted secret payloads and can decrypt them in main', async () => {
    const filePath = await createTempFile('secrets.json')
    const store = createStore(filePath)

    await store.writeSecret('provider-1', 'sk-super-secret')

    await expect(store.hasSecret('provider-1')).resolves.toBe(true)
    await expect(store.readCredential('provider-1')).resolves.toEqual({
      value: 'sk-super-secret',
      credentialRevision: '00000000-0000-4000-8000-000000000001',
    })

    const raw = await readFile(filePath, 'utf8')
    expect(raw).toContain('encryptedValue')
    expect(raw).toContain('credentialRevision')
    expect(raw).not.toContain('sk-super-secret')
    expect(raw).not.toContain('apiKey')
    expect(raw).not.toContain('Authorization')
  })

  it('rotates the credential revision on every secret write', async () => {
    const store = createStore(await createTempFile('secrets.json'))

    await store.writeSecret('provider-1', 'same-secret')
    const first = await store.readCredential('provider-1')
    await store.writeSecret('provider-1', 'same-secret')
    const second = await store.readCredential('provider-1')

    expect(first?.credentialRevision).toBe('00000000-0000-4000-8000-000000000001')
    expect(second?.credentialRevision).toBe('00000000-0000-4000-8000-000000000002')
  })

  it('rejects the old v1 schema instead of migrating it', async () => {
    const filePath = await createTempFile('secrets.json')
    const oldJson = JSON.stringify({ version: 1, secrets: [] })
    await writeFile(filePath, oldJson, 'utf8')
    const store = createStore(filePath)

    await expect(store.hasSecret('provider-1')).rejects.toMatchObject({
      code: 'schema_invalid',
    } satisfies Partial<ConfigFileError>)
    await expect(readFile(filePath, 'utf8')).resolves.toBe(oldJson)
  })

  it('does not fall back to plaintext when encryption is unavailable', async () => {
    const filePath = await createTempFile('secrets.json')
    const store = createStore(filePath, createFakeCrypto(false))

    await expect(store.writeSecret('provider-1', 'sk-super-secret')).rejects.toBeInstanceOf(
      SecretStoreError,
    )
    await expect(readFile(filePath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('reports decrypt failures without returning raw encrypted payloads', async () => {
    const filePath = await createTempFile('secrets.json')
    await writeFile(
      filePath,
      JSON.stringify({
        version: 2,
        secrets: [
          {
            providerId: 'provider-1',
            encryptedValue: Buffer.from('not-sealed', 'utf8').toString('base64'),
            credentialRevision: '00000000-0000-4000-8000-000000000001',
            createdAt: '2026-07-08T00:00:00.000Z',
            updatedAt: '2026-07-08T00:00:00.000Z',
          },
        ],
      }),
      'utf8',
    )
    const store = createStore(filePath)

    await expect(store.readCredential('provider-1')).rejects.toMatchObject({
      code: 'decrypt_failed',
    } satisfies Partial<SecretStoreError>)
  })

  it('fails closed on malformed JSON without overwriting the file', async () => {
    const filePath = await createTempFile('secrets.json')
    await writeFile(filePath, '{not-json', 'utf8')
    const store = createStore(filePath)

    await expect(store.hasSecret('provider-1')).rejects.toMatchObject({
      code: 'malformed_json',
    } satisfies Partial<ConfigFileError>)
    await expect(store.writeSecret('provider-1', 'sk-super-secret')).rejects.toMatchObject({
      code: 'malformed_json',
    } satisfies Partial<ConfigFileError>)
    await expect(readFile(filePath, 'utf8')).resolves.toBe('{not-json')
  })

  it('fails closed on schema-invalid JSON without overwriting the file', async () => {
    const filePath = await createTempFile('secrets.json')
    const invalidJson = JSON.stringify({ version: 2, secrets: [{ providerId: 'provider-1' }] })
    await writeFile(filePath, invalidJson, 'utf8')
    const store = createStore(filePath)

    await expect(store.hasSecret('provider-1')).rejects.toMatchObject({
      code: 'schema_invalid',
    } satisfies Partial<ConfigFileError>)
    await expect(store.writeSecret('provider-1', 'sk-super-secret')).rejects.toMatchObject({
      code: 'schema_invalid',
    } satisfies Partial<ConfigFileError>)
    await expect(readFile(filePath, 'utf8')).resolves.toBe(invalidJson)
  })
})
