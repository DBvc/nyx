import { createJsonConfigFile } from './config-file'
import { type SecretRecord, type SecretStoreState, parseSecretStoreState } from './schemas'

export type SecretStoreErrorCode = 'encryption_unavailable' | 'decrypt_failed' | 'invalid_input'

export class SecretStoreError extends Error {
  readonly code: SecretStoreErrorCode

  constructor(code: SecretStoreErrorCode, message: string) {
    super(message)
    this.name = 'SecretStoreError'
    this.code = code
  }
}

export interface SecretCryptoAdapter {
  isEncryptionAvailable(): boolean
  encrypt(value: string): string
  decrypt(encryptedValue: string): string
}

export interface ElectronSafeStorageLike {
  isEncryptionAvailable(): boolean
  encryptString(value: string): Buffer
  decryptString(encryptedValue: Buffer): string
}

export interface SecretStoreOptions {
  filePath: string
  crypto: SecretCryptoAdapter
  now?: () => string
}

const emptySecretStoreState = {
  version: 1,
  secrets: [],
} as const satisfies SecretStoreState

function cloneState(state: SecretStoreState): SecretStoreState {
  return {
    version: 1,
    secrets: state.secrets.map((secret) => ({ ...secret })),
  }
}

function trimRequired(value: string, field: string) {
  const trimmed = value.trim()

  if (!trimmed) {
    throw new SecretStoreError('invalid_input', `${field} is required.`)
  }

  return trimmed
}

function findSecret(state: SecretStoreState, providerId: string) {
  return state.secrets.find((secret) => secret.providerId === providerId) ?? null
}

export function createSafeStorageSecretCrypto(
  safeStorage: ElectronSafeStorageLike,
): SecretCryptoAdapter {
  return {
    isEncryptionAvailable: () => safeStorage.isEncryptionAvailable(),
    encrypt: (value) => safeStorage.encryptString(value).toString('base64'),
    decrypt: (encryptedValue) => safeStorage.decryptString(Buffer.from(encryptedValue, 'base64')),
  }
}

export class SecretStore {
  private readonly configFile: ReturnType<typeof createJsonConfigFile<SecretStoreState>>
  private readonly crypto: SecretCryptoAdapter
  private readonly now: () => string

  constructor({ filePath, crypto, now = () => new Date().toISOString() }: SecretStoreOptions) {
    this.configFile = createJsonConfigFile({
      filePath,
      parse: parseSecretStoreState,
    })
    this.crypto = crypto
    this.now = now
  }

  private async readState() {
    return cloneState((await this.configFile.read()) ?? emptySecretStoreState)
  }

  async hasSecret(providerId: string) {
    return Boolean(findSecret(await this.readState(), trimRequired(providerId, 'providerId')))
  }

  async readSecret(providerId: string) {
    if (!this.crypto.isEncryptionAvailable()) {
      throw new SecretStoreError('encryption_unavailable', 'Secret encryption is unavailable.')
    }

    const state = await this.readState()
    const secret = findSecret(state, trimRequired(providerId, 'providerId'))

    if (!secret) {
      return null
    }

    try {
      return this.crypto.decrypt(secret.encryptedValue)
    } catch {
      throw new SecretStoreError('decrypt_failed', 'Stored secret could not be decrypted.')
    }
  }

  async writeSecret(providerId: string, value: string) {
    if (!this.crypto.isEncryptionAvailable()) {
      throw new SecretStoreError('encryption_unavailable', 'Secret encryption is unavailable.')
    }

    const trimmedProviderId = trimRequired(providerId, 'providerId')
    const trimmedValue = trimRequired(value, 'secret')
    const state = await this.readState()
    const now = this.now()
    const existingIndex = state.secrets.findIndex(
      (secret) => secret.providerId === trimmedProviderId,
    )
    let encryptedValue: string

    try {
      encryptedValue = this.crypto.encrypt(trimmedValue)
    } catch {
      throw new SecretStoreError('encryption_unavailable', 'Secret encryption failed.')
    }

    const secret = {
      providerId: trimmedProviderId,
      encryptedValue,
      createdAt: existingIndex >= 0 ? (state.secrets[existingIndex]?.createdAt ?? now) : now,
      updatedAt: now,
    } satisfies SecretRecord

    if (existingIndex >= 0) {
      state.secrets[existingIndex] = secret
    } else {
      state.secrets.push(secret)
    }

    await this.configFile.write(state)
  }

  async deleteSecret(providerId: string) {
    const trimmedProviderId = trimRequired(providerId, 'providerId')
    const state = await this.readState()
    state.secrets = state.secrets.filter((secret) => secret.providerId !== trimmedProviderId)
    await this.configFile.write(state)

    return { providerId: trimmedProviderId }
  }
}

export function createSecretStore(options: SecretStoreOptions) {
  return new SecretStore(options)
}
