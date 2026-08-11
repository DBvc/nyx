import { z } from 'zod'

import {
  nyxConnectionModelSources,
  nyxConnectionProviderKinds,
  nyxConnectionReasoningContexts,
} from '../../../shared/connections/types'

const nonEmptyStringSchema = z.string().trim().min(1)

export const connectionTargetSchema = z
  .object({
    providerId: nonEmptyStringSchema,
    modelId: nonEmptyStringSchema,
  })
  .strict()

export const modelProtocolConfigSchema = z.discriminatedUnion('protocol', [
  z.object({ protocol: z.literal('openai-chat-completions') }).strict(),
  z
    .object({
      protocol: z.literal('openai-responses'),
      reasoningContext: z.enum(nyxConnectionReasoningContexts),
    })
    .strict(),
])

export const connectionModelRecordSchema = z
  .object({
    id: nonEmptyStringSchema,
    displayName: nonEmptyStringSchema,
    enabled: z.boolean(),
    source: z.enum(nyxConnectionModelSources),
    protocolConfig: modelProtocolConfigSchema,
    createdAt: nonEmptyStringSchema,
    updatedAt: nonEmptyStringSchema,
  })
  .strict()

function hasDuplicate(values: ReadonlyArray<string>) {
  return new Set(values).size !== values.length
}

export const connectionProviderRecordSchema = z
  .object({
    id: nonEmptyStringSchema,
    kind: z.enum(nyxConnectionProviderKinds),
    displayName: nonEmptyStringSchema,
    baseUrl: z.string().url(),
    enabled: z.boolean(),
    defaultProtocolConfigForNewModels: modelProtocolConfigSchema,
    models: z.array(connectionModelRecordSchema).min(1),
    defaultModelId: nonEmptyStringSchema.nullable(),
    createdAt: nonEmptyStringSchema,
    updatedAt: nonEmptyStringSchema,
  })
  .strict()
  .superRefine((provider, context) => {
    const modelIds = provider.models.map((model) => model.id)

    if (hasDuplicate(modelIds)) {
      context.addIssue({
        code: 'custom',
        message: 'Provider model ids must be unique.',
        path: ['models'],
      })
    }

    if (provider.defaultModelId && !modelIds.includes(provider.defaultModelId)) {
      context.addIssue({
        code: 'custom',
        message: 'Provider defaultModelId must reference a provider model.',
        path: ['defaultModelId'],
      })
    }
  })

export const connectionStoreStateSchema = z
  .object({
    version: z.literal(2),
    providers: z.array(connectionProviderRecordSchema),
    defaultTarget: connectionTargetSchema.nullable(),
  })
  .strict()
  .superRefine((state, context) => {
    const providerIds = state.providers.map((provider) => provider.id)

    if (hasDuplicate(providerIds)) {
      context.addIssue({
        code: 'custom',
        message: 'Provider ids must be unique.',
        path: ['providers'],
      })
    }

    if (!state.defaultTarget) {
      return
    }

    const provider = state.providers.find(
      (candidate) => candidate.id === state.defaultTarget?.providerId,
    )
    const model = provider?.models.find(
      (candidate) => candidate.id === state.defaultTarget?.modelId,
    )

    if (!provider || !provider.enabled || !model || !model.enabled) {
      context.addIssue({
        code: 'custom',
        message: 'Default target must reference an enabled provider and model.',
        path: ['defaultTarget'],
      })
    }
  })

export type ConnectionTargetRecord = z.infer<typeof connectionTargetSchema>
export type ConnectionModelRecord = z.infer<typeof connectionModelRecordSchema>
export type ConnectionProviderRecord = z.infer<typeof connectionProviderRecordSchema>
export type ConnectionStoreState = z.infer<typeof connectionStoreStateSchema>

export function parseConnectionStoreState(value: unknown): ConnectionStoreState {
  return connectionStoreStateSchema.parse(value)
}

export const secretRecordSchema = z
  .object({
    providerId: nonEmptyStringSchema,
    encryptedValue: nonEmptyStringSchema,
    credentialRevision: z.uuid(),
    createdAt: nonEmptyStringSchema,
    updatedAt: nonEmptyStringSchema,
  })
  .strict()

export const secretStoreStateSchema = z
  .object({
    version: z.literal(2),
    secrets: z.array(secretRecordSchema),
  })
  .strict()

export type SecretRecord = z.infer<typeof secretRecordSchema>
export type SecretStoreState = z.infer<typeof secretStoreStateSchema>

export function parseSecretStoreState(value: unknown): SecretStoreState {
  return secretStoreStateSchema.parse(value)
}
