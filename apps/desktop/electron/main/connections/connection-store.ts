import { randomUUID } from 'node:crypto'

import type {
  NyxConnectionModelInput,
  NyxConnectionSaveProviderInput,
  NyxConnectionSetDefaultTargetInput,
} from '../../../shared/connections/types'
import { createJsonConfigFile } from './config-file'
import {
  type ConnectionModelRecord,
  type ConnectionProviderRecord,
  type ConnectionStoreState,
  parseConnectionStoreState,
} from './schemas'
import { normalizeConnectionBaseUrl } from './url'

export type ConnectionStoreErrorCode = 'invalid_input' | 'not_found'

export class ConnectionStoreError extends Error {
  readonly code: ConnectionStoreErrorCode

  constructor(code: ConnectionStoreErrorCode, message: string) {
    super(message)
    this.name = 'ConnectionStoreError'
    this.code = code
  }
}

export type SaveProviderSettingsInput = Omit<NyxConnectionSaveProviderInput, 'credential'>

export interface ConnectionStoreOptions {
  filePath: string
  generateId?: () => string
  now?: () => string
}

export interface DeleteProviderResult {
  providerId: string
}

export interface MergeDiscoveredModelsResult {
  provider: ConnectionProviderRecord
  discoveredCount: number
  preservedManualCount: number
}

const emptyConnectionStoreState = {
  version: 1,
  providers: [],
  defaultTarget: null,
} as const satisfies ConnectionStoreState

function cloneState(state: ConnectionStoreState): ConnectionStoreState {
  return {
    version: 1,
    providers: state.providers.map((provider) => ({
      ...provider,
      models: provider.models.map((model) => ({ ...model })),
    })),
    defaultTarget: state.defaultTarget ? { ...state.defaultTarget } : null,
  }
}

function trimRequired(value: string, field: string) {
  const trimmed = value.trim()

  if (!trimmed) {
    throw new ConnectionStoreError('invalid_input', `${field} is required.`)
  }

  return trimmed
}

function normalizeBaseUrl(value: string) {
  const trimmed = trimRequired(value, 'baseUrl')

  try {
    return normalizeConnectionBaseUrl(trimmed)
  } catch {
    throw new ConnectionStoreError('invalid_input', 'baseUrl must be a valid URL.')
  }
}

function normalizeModels(
  inputModels: ReadonlyArray<NyxConnectionModelInput>,
  existingModels: ReadonlyArray<ConnectionModelRecord>,
  now: string,
) {
  if (inputModels.length === 0) {
    throw new ConnectionStoreError('invalid_input', 'At least one model is required.')
  }

  const existingById = new Map(existingModels.map((model) => [model.id, model]))
  const seenIds = new Set<string>()

  return inputModels.map((inputModel) => {
    const id = trimRequired(inputModel.id, 'model.id')

    if (seenIds.has(id)) {
      throw new ConnectionStoreError('invalid_input', `Duplicate model id: ${id}.`)
    }

    seenIds.add(id)

    const existing = existingById.get(id)
    const displayName = inputModel.displayName?.trim() || existing?.displayName || id

    return {
      id,
      displayName,
      enabled: inputModel.enabled ?? existing?.enabled ?? true,
      source: existing?.source ?? 'manual',
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    } satisfies ConnectionModelRecord
  })
}

function normalizeDiscoveredModelIds(inputModelIds: ReadonlyArray<string>) {
  const seenIds = new Set<string>()
  const modelIds: string[] = []

  for (const inputModelId of inputModelIds) {
    const id = trimRequired(inputModelId, 'model.id')

    if (!seenIds.has(id)) {
      seenIds.add(id)
      modelIds.push(id)
    }
  }

  if (modelIds.length === 0) {
    throw new ConnectionStoreError('invalid_input', 'At least one discovered model is required.')
  }

  return modelIds
}

function mergeDiscoveredModels(
  provider: ConnectionProviderRecord,
  discoveredModelIds: ReadonlyArray<string>,
  now: string,
) {
  const discoveredIds = normalizeDiscoveredModelIds(discoveredModelIds)
  const existingById = new Map(provider.models.map((model) => [model.id, model]))
  const manualModels = provider.models.filter((model) => model.source === 'manual')
  const manualIds = new Set(manualModels.map((model) => model.id))
  const discoveredModels = discoveredIds
    .filter((modelId) => !manualIds.has(modelId))
    .map((modelId) => {
      const existing = existingById.get(modelId)

      return {
        id: modelId,
        displayName: existing?.displayName ?? modelId,
        enabled: existing?.enabled ?? true,
        source: 'discovered' as const,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      } satisfies ConnectionModelRecord
    })

  return {
    discoveredCount: discoveredIds.length,
    preservedManualCount: manualModels.length,
    models: [...manualModels.map((model) => ({ ...model })), ...discoveredModels],
  }
}

function findProvider(state: ConnectionStoreState, providerId: string) {
  return state.providers.find((provider) => provider.id === providerId) ?? null
}

function targetExists(state: ConnectionStoreState, providerId: string, modelId: string) {
  const provider = findProvider(state, providerId)

  if (!provider || !provider.enabled) {
    return false
  }

  return provider.models.some((model) => model.id === modelId && model.enabled)
}

function resolveDefaultModelId(
  input: SaveProviderSettingsInput,
  existing: ConnectionProviderRecord | null,
  models: ReadonlyArray<ConnectionModelRecord>,
) {
  if (input.defaultModelId === null) {
    return null
  }

  if (input.defaultModelId !== undefined) {
    const defaultModelId = trimRequired(input.defaultModelId, 'defaultModelId')

    if (!models.some((model) => model.id === defaultModelId)) {
      throw new ConnectionStoreError('invalid_input', 'defaultModelId must match a saved model.')
    }

    return defaultModelId
  }

  if (existing?.defaultModelId && models.some((model) => model.id === existing.defaultModelId)) {
    return existing.defaultModelId
  }

  return models.find((model) => model.enabled)?.id ?? models[0]?.id ?? null
}

export class ConnectionStore {
  private readonly configFile: ReturnType<typeof createJsonConfigFile<ConnectionStoreState>>
  private readonly generateId: () => string
  private readonly now: () => string

  constructor({
    filePath,
    generateId = randomUUID,
    now = () => new Date().toISOString(),
  }: ConnectionStoreOptions) {
    this.configFile = createJsonConfigFile({
      filePath,
      parse: parseConnectionStoreState,
    })
    this.generateId = generateId
    this.now = now
  }

  async readState() {
    return cloneState((await this.configFile.read()) ?? emptyConnectionStoreState)
  }

  async listProviders() {
    return (await this.readState()).providers
  }

  async getProvider(providerId: string) {
    return findProvider(await this.readState(), providerId)
  }

  async saveProvider(input: SaveProviderSettingsInput) {
    const state = await this.readState()
    const now = this.now()
    const providerId = input.providerId?.trim() || this.generateId()
    const existingIndex = state.providers.findIndex((provider) => provider.id === providerId)
    const existing = existingIndex >= 0 ? (state.providers[existingIndex] ?? null) : null
    const models = normalizeModels(input.models, existing?.models ?? [], now)
    const provider = {
      id: providerId,
      kind: input.kind,
      displayName: trimRequired(input.displayName, 'displayName'),
      baseUrl: normalizeBaseUrl(input.baseUrl),
      enabled: input.enabled ?? existing?.enabled ?? true,
      models,
      defaultModelId: resolveDefaultModelId(input, existing, models),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    } satisfies ConnectionProviderRecord

    if (existingIndex >= 0) {
      state.providers[existingIndex] = provider
    } else {
      state.providers.push(provider)
    }

    if (
      state.defaultTarget?.providerId === providerId &&
      !targetExists(state, providerId, state.defaultTarget.modelId)
    ) {
      state.defaultTarget = null
    }

    await this.configFile.write(state)

    return { ...provider, models: provider.models.map((model) => ({ ...model })) }
  }

  async deleteProvider(providerId: string): Promise<DeleteProviderResult> {
    const state = await this.readState()
    const existingProvider = findProvider(state, providerId)

    if (!existingProvider) {
      throw new ConnectionStoreError('not_found', 'Provider was not found.')
    }

    state.providers = state.providers.filter((provider) => provider.id !== providerId)

    if (state.defaultTarget?.providerId === providerId) {
      state.defaultTarget = null
    }

    await this.configFile.write(state)

    return { providerId }
  }

  async mergeDiscoveredModels(
    providerId: string,
    discoveredModelIds: ReadonlyArray<string>,
  ): Promise<MergeDiscoveredModelsResult> {
    const state = await this.readState()
    const trimmedProviderId = trimRequired(providerId, 'providerId')
    const existingIndex = state.providers.findIndex((provider) => provider.id === trimmedProviderId)
    const existing = existingIndex >= 0 ? (state.providers[existingIndex] ?? null) : null

    if (!existing) {
      throw new ConnectionStoreError('not_found', 'Provider was not found.')
    }

    const now = this.now()
    const { discoveredCount, models, preservedManualCount } = mergeDiscoveredModels(
      existing,
      discoveredModelIds,
      now,
    )
    const defaultModelId =
      existing.defaultModelId && models.some((model) => model.id === existing.defaultModelId)
        ? existing.defaultModelId
        : (models.find((model) => model.enabled)?.id ?? models[0]?.id ?? null)
    const provider = {
      ...existing,
      models,
      defaultModelId,
      updatedAt: now,
    } satisfies ConnectionProviderRecord

    state.providers[existingIndex] = provider

    if (
      state.defaultTarget?.providerId === provider.id &&
      !targetExists(state, provider.id, state.defaultTarget.modelId)
    ) {
      state.defaultTarget = null
    }

    await this.configFile.write(state)

    return {
      provider: cloneState({
        version: 1,
        providers: [provider],
        defaultTarget: null,
      }).providers[0]!,
      discoveredCount,
      preservedManualCount,
    }
  }

  async setDefaultTarget({ target }: NyxConnectionSetDefaultTargetInput) {
    const state = await this.readState()

    if (!target) {
      state.defaultTarget = null
      await this.configFile.write(state)
      return null
    }

    const providerId = trimRequired(target.providerId, 'target.providerId')
    const modelId = trimRequired(target.modelId, 'target.modelId')

    if (!targetExists(state, providerId, modelId)) {
      throw new ConnectionStoreError(
        'invalid_input',
        'Default target must reference an enabled provider and model.',
      )
    }

    state.defaultTarget = { providerId, modelId }
    await this.configFile.write(state)

    return { ...state.defaultTarget }
  }
}

export function createConnectionStore(options: ConnectionStoreOptions) {
  return new ConnectionStore(options)
}
