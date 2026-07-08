import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { ConfigFileError } from './config-file'
import { ConnectionStoreError, createConnectionStore } from './connection-store'

const tempDirs: string[] = []

async function createTempFile(name: string) {
  const dir = await mkdtemp(join(tmpdir(), 'nyx-connection-store-'))
  tempDirs.push(dir)
  return join(dir, name)
}

function createStore(filePath: string) {
  return createConnectionStore({
    filePath,
    generateId: () => 'provider-1',
    now: () => '2026-07-08T00:00:00.000Z',
  })
}

function providerInput() {
  return {
    kind: 'openai-compatible' as const,
    displayName: 'Local Relay',
    baseUrl: 'https://relay.example.test/v1',
    models: [
      {
        id: 'gpt-5.4',
        displayName: 'GPT 5.4',
      },
    ],
  }
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })))
})

describe('ConnectionStore', () => {
  it('treats a missing settings file as empty state', async () => {
    const store = createStore(await createTempFile('connections.json'))

    await expect(store.readState()).resolves.toEqual({
      version: 1,
      providers: [],
      defaultTarget: null,
    })
  })

  it('persists provider, model, and default target settings without secrets', async () => {
    const filePath = await createTempFile('connections.json')
    const store = createStore(filePath)

    const provider = await store.saveProvider(providerInput())
    const target = await store.setDefaultTarget({
      target: {
        providerId: provider.id,
        modelId: provider.models[0]!.id,
      },
    })

    expect(target).toEqual({
      providerId: 'provider-1',
      modelId: 'gpt-5.4',
    })
    await expect(store.readState()).resolves.toEqual({
      version: 1,
      providers: [
        {
          id: 'provider-1',
          kind: 'openai-compatible',
          displayName: 'Local Relay',
          baseUrl: 'https://relay.example.test/v1',
          enabled: true,
          models: [
            {
              id: 'gpt-5.4',
              displayName: 'GPT 5.4',
              enabled: true,
              source: 'manual',
              createdAt: '2026-07-08T00:00:00.000Z',
              updatedAt: '2026-07-08T00:00:00.000Z',
            },
          ],
          defaultModelId: 'gpt-5.4',
          createdAt: '2026-07-08T00:00:00.000Z',
          updatedAt: '2026-07-08T00:00:00.000Z',
        },
      ],
      defaultTarget: {
        providerId: 'provider-1',
        modelId: 'gpt-5.4',
      },
    })

    const raw = await readFile(filePath, 'utf8')
    expect(raw).not.toContain('api_key')
    expect(raw).not.toContain('Authorization')
    expect(raw).not.toContain('secret')
  })

  it('clears the default target when the referenced provider is deleted', async () => {
    const store = createStore(await createTempFile('connections.json'))
    const provider = await store.saveProvider(providerInput())
    await store.setDefaultTarget({
      target: {
        providerId: provider.id,
        modelId: provider.models[0]!.id,
      },
    })

    await expect(store.deleteProvider(provider.id)).resolves.toEqual({ providerId: provider.id })

    await expect(store.readState()).resolves.toEqual({
      version: 1,
      providers: [],
      defaultTarget: null,
    })
  })

  it('rejects a default target that does not reference an enabled provider and model', async () => {
    const store = createStore(await createTempFile('connections.json'))
    await store.saveProvider(providerInput())

    await expect(
      store.setDefaultTarget({
        target: {
          providerId: 'provider-1',
          modelId: 'missing-model',
        },
      }),
    ).rejects.toBeInstanceOf(ConnectionStoreError)
  })

  it('fails closed on malformed JSON without overwriting the file', async () => {
    const filePath = await createTempFile('connections.json')
    await writeFile(filePath, '{not-json', 'utf8')
    const store = createStore(filePath)

    await expect(store.readState()).rejects.toMatchObject({
      code: 'malformed_json',
    } satisfies Partial<ConfigFileError>)
    await expect(store.saveProvider(providerInput())).rejects.toMatchObject({
      code: 'malformed_json',
    } satisfies Partial<ConfigFileError>)
    await expect(readFile(filePath, 'utf8')).resolves.toBe('{not-json')
  })

  it('fails closed on schema-invalid JSON without overwriting the file', async () => {
    const filePath = await createTempFile('connections.json')
    const invalidJson = JSON.stringify({ version: 1, providers: 'not-array', defaultTarget: null })
    await writeFile(filePath, invalidJson, 'utf8')
    const store = createStore(filePath)

    await expect(store.readState()).rejects.toMatchObject({
      code: 'schema_invalid',
    } satisfies Partial<ConfigFileError>)
    await expect(store.saveProvider(providerInput())).rejects.toMatchObject({
      code: 'schema_invalid',
    } satisfies Partial<ConfigFileError>)
    await expect(readFile(filePath, 'utf8')).resolves.toBe(invalidJson)
  })

  it('fails closed when a persisted default target references a missing model', async () => {
    const filePath = await createTempFile('connections.json')
    const invalidJson = JSON.stringify({
      version: 1,
      providers: [
        {
          id: 'provider-1',
          kind: 'openai-compatible',
          displayName: 'Local Relay',
          baseUrl: 'https://relay.example.test/v1',
          enabled: true,
          models: [
            {
              id: 'gpt-5.4',
              displayName: 'GPT 5.4',
              enabled: true,
              source: 'manual',
              createdAt: '2026-07-08T00:00:00.000Z',
              updatedAt: '2026-07-08T00:00:00.000Z',
            },
          ],
          defaultModelId: 'gpt-5.4',
          createdAt: '2026-07-08T00:00:00.000Z',
          updatedAt: '2026-07-08T00:00:00.000Z',
        },
      ],
      defaultTarget: {
        providerId: 'provider-1',
        modelId: 'missing-model',
      },
    })
    await writeFile(filePath, invalidJson, 'utf8')
    const store = createStore(filePath)

    await expect(store.readState()).rejects.toMatchObject({
      code: 'schema_invalid',
    } satisfies Partial<ConfigFileError>)
    await expect(readFile(filePath, 'utf8')).resolves.toBe(invalidJson)
  })
})
