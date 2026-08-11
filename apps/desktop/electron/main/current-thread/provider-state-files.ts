import { createHash, randomUUID } from 'node:crypto'
import { join } from 'node:path'

import {
  readResponsesVisibleText,
  responsesContinuationLimits,
  validateResponsesOutputItems,
  type ResponsesContinuationStateV1,
} from '../chat/provider-stream'
import { createCurrentThreadFileAdapter, type CurrentThreadFileAdapter } from './file-adapter'
import { parseProviderStateRef, type CurrentThreadRecord, type ProviderStateRef } from './schemas'

export type CurrentThreadProviderStateFilesErrorCode = 'invalid_state' | 'io_error' | 'unavailable'

export class CurrentThreadProviderStateFilesError extends Error {
  constructor(
    readonly code: CurrentThreadProviderStateFilesErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'CurrentThreadProviderStateFilesError'
  }
}

export interface CurrentThreadProviderStateFilesOptions {
  directoryPath: string
  generateId?: () => string
  fileAdapter?: CurrentThreadFileAdapter
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function sha256(bytes: Uint8Array) {
  return createHash('sha256').update(bytes).digest('hex')
}

function parseState(value: unknown): ResponsesContinuationStateV1 {
  if (!isRecord(value) || Object.keys(value).length !== 4) {
    throw new CurrentThreadProviderStateFilesError(
      'invalid_state',
      'Provider continuation state is invalid.',
    )
  }

  const outputItems = validateResponsesOutputItems(value.outputItems)
  if (
    value.version !== 1 ||
    value.protocol !== 'openai-responses' ||
    (value.effectiveReasoningContext !== null &&
      value.effectiveReasoningContext !== 'all_turns' &&
      value.effectiveReasoningContext !== 'current_turn') ||
    !outputItems ||
    !readResponsesVisibleText(outputItems).trim()
  ) {
    throw new CurrentThreadProviderStateFilesError(
      'invalid_state',
      'Provider continuation state is invalid.',
    )
  }

  return {
    version: 1,
    protocol: 'openai-responses',
    effectiveReasoningContext: value.effectiveReasoningContext,
    outputItems,
  }
}

function parseBytes(bytes: Uint8Array) {
  let value: unknown

  try {
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } catch {
    throw new CurrentThreadProviderStateFilesError(
      'unavailable',
      'Provider continuation state is unavailable.',
    )
  }

  try {
    return parseState(value)
  } catch {
    throw new CurrentThreadProviderStateFilesError(
      'unavailable',
      'Provider continuation state is unavailable.',
    )
  }
}

function stateRefs(record: CurrentThreadRecord | null) {
  return (
    record?.turns.flatMap((turn) => (turn.providerStateRef ? [turn.providerStateRef] : [])) ?? []
  )
}

export class CurrentThreadProviderStateFiles {
  private readonly directoryPath: string
  private readonly generateId: () => string
  private readonly fileAdapter: CurrentThreadFileAdapter

  constructor({
    directoryPath,
    generateId = randomUUID,
    fileAdapter = createCurrentThreadFileAdapter(),
  }: CurrentThreadProviderStateFilesOptions) {
    this.directoryPath = directoryPath
    this.generateId = generateId
    this.fileAdapter = fileAdapter
  }

  async prepare(
    state: ResponsesContinuationStateV1,
    executionIdentity: string,
  ): Promise<ProviderStateRef> {
    let parsed: ResponsesContinuationStateV1

    try {
      parsed = parseState(state)
    } catch (error) {
      if (error instanceof CurrentThreadProviderStateFilesError) {
        throw error
      }
      throw new CurrentThreadProviderStateFilesError(
        'invalid_state',
        'Provider continuation state is invalid.',
      )
    }

    if (!/^[0-9a-f]{64}$/u.test(executionIdentity)) {
      throw new CurrentThreadProviderStateFilesError(
        'invalid_state',
        'Provider execution identity is invalid.',
      )
    }

    const bytes = new TextEncoder().encode(JSON.stringify(parsed))
    if (bytes.byteLength > responsesContinuationLimits.maxSerializedBytes) {
      throw new CurrentThreadProviderStateFilesError(
        'invalid_state',
        'Provider continuation state is too large.',
      )
    }

    const ref = parseProviderStateRef({
      protocol: 'openai-responses',
      stateId: this.generateId(),
      executionIdentity,
      byteLength: bytes.byteLength,
      sha256: sha256(bytes),
    })
    const paths = this.paths(ref.stateId)

    try {
      await this.fileAdapter.ensureDirectory(this.directoryPath, 0o700)
      if ((await this.exists(paths.pending)) || (await this.exists(paths.committed))) {
        throw new Error('Provider state id already exists.')
      }
      await this.fileAdapter.writeBytes(paths.pending, bytes, 0o600)
      await this.readPath(paths.pending, ref)
      return ref
    } catch {
      await this.removePaths([paths.pending])
      throw new CurrentThreadProviderStateFilesError(
        'io_error',
        'Could not prepare provider continuation state.',
      )
    }
  }

  async commit(refInput: ProviderStateRef) {
    const ref = parseProviderStateRef(refInput)
    const paths = this.paths(ref.stateId)

    try {
      if (await this.exists(paths.committed)) {
        await this.readPath(paths.committed, ref)
        return ref
      }
      await this.readPath(paths.pending, ref)
      await this.fileAdapter.rename(paths.pending, paths.committed)
      await this.readPath(paths.committed, ref)
      return ref
    } catch {
      await this.removePaths([paths.pending, paths.committed])
      throw new CurrentThreadProviderStateFilesError(
        'io_error',
        'Could not commit provider continuation state.',
      )
    }
  }

  async rollback(refInput: ProviderStateRef) {
    const ref = parseProviderStateRef(refInput)
    const paths = this.paths(ref.stateId)
    await this.removePaths([paths.pending, paths.committed])
  }

  async read(refInput: ProviderStateRef) {
    const ref = parseProviderStateRef(refInput)
    return this.readPath(this.paths(ref.stateId).committed, ref)
  }

  async reconcile(record: CurrentThreadRecord | null) {
    if (!record) {
      try {
        await this.fileAdapter.removeDirectory(this.directoryPath)
      } catch {
        // The record is authoritative; unreachable state is safe to leave for later cleanup.
      }
      return
    }

    const retainedNames = new Set(stateRefs(record).map((ref) => `${ref.stateId}.json`))
    let names: string[]

    try {
      names = await this.fileAdapter.listDirectory(this.directoryPath)
    } catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        return
      }
      return
    }

    await this.removePaths(
      names
        .filter((name) => !retainedNames.has(name))
        .map((name) => join(this.directoryPath, name)),
    )
  }

  async reset() {
    await this.fileAdapter.removeDirectory(this.directoryPath)
  }

  private async readPath(filePath: string, ref: ProviderStateRef) {
    try {
      const bytes = await this.fileAdapter.readBytes(
        filePath,
        responsesContinuationLimits.maxSerializedBytes,
      )

      if (bytes.byteLength !== ref.byteLength || sha256(bytes) !== ref.sha256) {
        throw new Error('Provider state integrity mismatch.')
      }

      return parseBytes(bytes)
    } catch (error) {
      if (error instanceof CurrentThreadProviderStateFilesError) {
        throw error
      }
      throw new CurrentThreadProviderStateFilesError(
        'unavailable',
        'Provider continuation state is unavailable.',
      )
    }
  }

  private paths(stateId: string) {
    return {
      pending: join(this.directoryPath, `${stateId}.pending`),
      committed: join(this.directoryPath, `${stateId}.json`),
    }
  }

  private async exists(filePath: string) {
    try {
      await this.fileAdapter.lstat(filePath)
      return true
    } catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        return false
      }
      throw error
    }
  }

  private async removePaths(paths: ReadonlyArray<string>) {
    await Promise.all(
      paths.map(async (filePath) => {
        try {
          await this.fileAdapter.remove(filePath)
        } catch {
          // The record remains authoritative; reconcile retries unreachable cleanup.
        }
      }),
    )
  }
}
