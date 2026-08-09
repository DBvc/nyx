import { z } from 'zod'

import {
  nyxChatImageMediaTypes,
  type NyxChatImageRef,
  type NyxChatTargetAttribution,
  type NyxChatTargetSelection,
} from '../../../shared/chat/types'

export const currentThreadAssistantStatusesV1 = [
  'pending',
  'completed',
  'cancelled',
  'failed',
] as const

export const currentThreadErrorCodesV1 = [
  'config_missing',
  'invalid_request',
  'auth_failed',
  'network_error',
  'rate_limited',
  'upstream_error',
  'cancelled',
  'unknown',
] as const

export type CurrentThreadErrorCodeV1 = (typeof currentThreadErrorCodesV1)[number]

export const safeThreadErrorMessagesV1 = {
  config_missing: 'Chat provider configuration is unavailable.',
  invalid_request: 'The chat request is invalid.',
  auth_failed: 'The provider rejected the configured credentials.',
  network_error: 'Nyx could not reach the provider.',
  rate_limited: 'The provider rate limit was reached.',
  upstream_error: 'The provider could not complete the response.',
  cancelled: 'The response was cancelled.',
  unknown: 'The response failed unexpectedly.',
} as const satisfies Record<CurrentThreadErrorCodeV1, string>

export const interruptedThreadErrorMessageV1 =
  'The previous response was interrupted before it finished.'

const safeErrorMessageSchema = z.enum([
  ...Object.values(safeThreadErrorMessagesV1),
  interruptedThreadErrorMessageV1,
])

const nonEmptyStringSchema = z.string().min(1)

export const safeThreadErrorRecordV1Schema = z
  .object({
    code: z.enum(currentThreadErrorCodesV1),
    message: safeErrorMessageSchema,
    retryable: z.boolean(),
  })
  .strict()
  .superRefine((error, context) => {
    const expectedMessage = safeThreadErrorMessagesV1[error.code]
    const isInterrupted =
      error.code === 'unknown' && error.message === interruptedThreadErrorMessageV1

    if (error.message !== expectedMessage && !isInterrupted) {
      context.addIssue({
        code: 'custom',
        message: 'A persisted chat error must use its fixed safe message.',
        path: ['message'],
      })
    }
  })

export const turnRecordV1Schema = z
  .object({
    attemptRequestId: nonEmptyStringSchema,
    userMessageId: nonEmptyStringSchema,
    assistantMessageId: nonEmptyStringSchema,
    userContent: nonEmptyStringSchema,
    assistantContent: z.string(),
    assistantStatus: z.enum(currentThreadAssistantStatusesV1),
    error: safeThreadErrorRecordV1Schema.nullable(),
    createdAt: nonEmptyStringSchema,
    updatedAt: nonEmptyStringSchema,
  })
  .strict()
  .superRefine((turn, context) => {
    if (turn.assistantStatus === 'pending') {
      if (turn.assistantContent !== '') {
        context.addIssue({
          code: 'custom',
          message: 'A pending assistant must not persist streaming content.',
          path: ['assistantContent'],
        })
      }

      if (turn.error !== null) {
        context.addIssue({
          code: 'custom',
          message: 'A pending assistant must not have an error.',
          path: ['error'],
        })
      }
    } else if (turn.assistantStatus === 'failed') {
      if (turn.error === null) {
        context.addIssue({
          code: 'custom',
          message: 'A failed assistant must have a safe error.',
          path: ['error'],
        })
      }
    } else if (turn.error !== null) {
      context.addIssue({
        code: 'custom',
        message: 'Only a failed assistant may have an error.',
        path: ['error'],
      })
    }
  })

export const currentThreadRecordV1Schema = z
  .object({
    version: z.literal(1),
    threadId: nonEmptyStringSchema,
    turns: z.array(turnRecordV1Schema).min(1),
    createdAt: nonEmptyStringSchema,
    updatedAt: nonEmptyStringSchema,
  })
  .strict()
  .superRefine((record, context) => {
    const messageIds = record.turns.flatMap((turn) => [turn.userMessageId, turn.assistantMessageId])
    const requestIds = record.turns.map((turn) => turn.attemptRequestId)
    const pendingIndexes = record.turns.flatMap((turn, index) =>
      turn.assistantStatus === 'pending' ? [index] : [],
    )

    if (new Set(messageIds).size !== messageIds.length) {
      context.addIssue({
        code: 'custom',
        message: 'Current thread message ids must be unique.',
        path: ['turns'],
      })
    }

    if (new Set(requestIds).size !== requestIds.length) {
      context.addIssue({
        code: 'custom',
        message: 'Current thread latest attempt request ids must be unique.',
        path: ['turns'],
      })
    }

    if (
      pendingIndexes.length > 1 ||
      pendingIndexes.some((index) => index !== record.turns.length - 1)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Only the final turn may be pending.',
        path: ['turns'],
      })
    }
  })

export type SafeThreadErrorRecordV1 = z.infer<typeof safeThreadErrorRecordV1Schema>
export type TurnRecordV1 = z.infer<typeof turnRecordV1Schema>
export type CurrentThreadRecordV1 = z.infer<typeof currentThreadRecordV1Schema>

export const currentThreadErrorCodesV2 = [
  ...currentThreadErrorCodesV1,
  'target_unavailable',
] as const

export type CurrentThreadErrorCodeV2 = (typeof currentThreadErrorCodesV2)[number]

export const safeThreadErrorMessagesV2 = {
  ...safeThreadErrorMessagesV1,
  target_unavailable: 'The selected chat target is unavailable.',
} as const satisfies Record<CurrentThreadErrorCodeV2, string>

const safeErrorMessageV2Schema = z.enum([
  ...Object.values(safeThreadErrorMessagesV2),
  interruptedThreadErrorMessageV1,
])

export const safeThreadErrorRecordV2Schema = z
  .object({
    code: z.enum(currentThreadErrorCodesV2),
    message: safeErrorMessageV2Schema,
    retryable: z.boolean(),
  })
  .strict()
  .superRefine((error, context) => {
    const expectedMessage = safeThreadErrorMessagesV2[error.code]
    const isInterrupted =
      error.code === 'unknown' && error.message === interruptedThreadErrorMessageV1

    if (error.message !== expectedMessage && !isInterrupted) {
      context.addIssue({
        code: 'custom',
        message: 'A persisted chat error must use its fixed safe message.',
        path: ['message'],
      })
    }
  })

export const chatTargetSelectionSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('connection'),
      providerId: nonEmptyStringSchema,
      modelId: nonEmptyStringSchema,
    })
    .strict(),
  z.object({ kind: z.literal('env_fallback') }).strict(),
]) satisfies z.ZodType<NyxChatTargetSelection>

export const chatTargetAttributionSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('connection'),
      providerId: nonEmptyStringSchema,
      providerDisplayName: nonEmptyStringSchema,
      modelId: nonEmptyStringSchema,
      modelDisplayName: nonEmptyStringSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal('env_fallback'),
      modelId: nonEmptyStringSchema,
    })
    .strict(),
]) satisfies z.ZodType<NyxChatTargetAttribution>

export const targetBindingV2Schema = z
  .object({
    selection: chatTargetSelectionSchema,
    attribution: chatTargetAttributionSchema.nullable(),
  })
  .strict()
  .superRefine((binding, context) => {
    const attribution = binding.attribution

    if (!attribution) {
      return
    }

    if (binding.selection.kind !== attribution.kind) {
      context.addIssue({
        code: 'custom',
        message: 'Target selection and attribution kinds must match.',
        path: ['attribution'],
      })
      return
    }

    if (
      binding.selection.kind === 'connection' &&
      attribution.kind === 'connection' &&
      (binding.selection.providerId !== attribution.providerId ||
        binding.selection.modelId !== attribution.modelId)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Resolved target attribution must preserve the selected ids.',
        path: ['attribution'],
      })
    }
  })

export const turnRecordV2Schema = z
  .object({
    attemptRequestId: nonEmptyStringSchema,
    userMessageId: nonEmptyStringSchema,
    assistantMessageId: nonEmptyStringSchema,
    userContent: nonEmptyStringSchema,
    assistantContent: z.string(),
    assistantStatus: z.enum(currentThreadAssistantStatusesV1),
    error: safeThreadErrorRecordV2Schema.nullable(),
    targetBinding: targetBindingV2Schema.nullable(),
    createdAt: nonEmptyStringSchema,
    updatedAt: nonEmptyStringSchema,
  })
  .strict()
  .superRefine((turn, context) => {
    if (turn.assistantStatus === 'pending') {
      if (turn.assistantContent !== '') {
        context.addIssue({
          code: 'custom',
          message: 'A pending assistant must not persist streaming content.',
          path: ['assistantContent'],
        })
      }

      if (turn.error !== null) {
        context.addIssue({
          code: 'custom',
          message: 'A pending assistant must not have an error.',
          path: ['error'],
        })
      }
    } else if (turn.assistantStatus === 'failed') {
      if (turn.error === null) {
        context.addIssue({
          code: 'custom',
          message: 'A failed assistant must have a safe error.',
          path: ['error'],
        })
      }
    } else if (turn.error !== null) {
      context.addIssue({
        code: 'custom',
        message: 'Only a failed assistant may have an error.',
        path: ['error'],
      })
    }
  })

export const currentThreadRecordV2Schema = z
  .object({
    version: z.literal(2),
    threadId: nonEmptyStringSchema,
    turns: z.array(turnRecordV2Schema).min(1),
    createdAt: nonEmptyStringSchema,
    updatedAt: nonEmptyStringSchema,
  })
  .strict()
  .superRefine((record, context) => {
    const messageIds = record.turns.flatMap((turn) => [turn.userMessageId, turn.assistantMessageId])
    const requestIds = record.turns.map((turn) => turn.attemptRequestId)
    const pendingIndexes = record.turns.flatMap((turn, index) =>
      turn.assistantStatus === 'pending' ? [index] : [],
    )

    if (new Set(messageIds).size !== messageIds.length) {
      context.addIssue({
        code: 'custom',
        message: 'Current thread message ids must be unique.',
        path: ['turns'],
      })
    }

    if (new Set(requestIds).size !== requestIds.length) {
      context.addIssue({
        code: 'custom',
        message: 'Current thread latest attempt request ids must be unique.',
        path: ['turns'],
      })
    }

    if (
      pendingIndexes.length > 1 ||
      pendingIndexes.some((index) => index !== record.turns.length - 1)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Only the final turn may be pending.',
        path: ['turns'],
      })
    }
  })

export type SafeThreadErrorRecordV2 = z.infer<typeof safeThreadErrorRecordV2Schema>
export type TurnRecordV2 = z.infer<typeof turnRecordV2Schema>
export type CurrentThreadRecordV2 = z.infer<typeof currentThreadRecordV2Schema>

export const chatImageRefSchema = z
  .object({
    imageId: z.uuid(),
    mediaType: z.enum(nyxChatImageMediaTypes),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  })
  .strict() satisfies z.ZodType<NyxChatImageRef>

export const turnRecordV3Schema = turnRecordV2Schema
  .safeExtend({
    userContent: z.string(),
    imageRefs: z.array(chatImageRefSchema),
  })
  .superRefine((turn, context) => {
    if (turn.userContent.length === 0 && turn.imageRefs.length === 0) {
      context.addIssue({
        code: 'custom',
        message: 'A user turn must contain text or at least one image reference.',
        path: ['userContent'],
      })
    }
  })

export const currentThreadRecordV3Schema = z
  .object({
    version: z.literal(3),
    threadId: nonEmptyStringSchema,
    turns: z.array(turnRecordV3Schema).min(1),
    createdAt: nonEmptyStringSchema,
    updatedAt: nonEmptyStringSchema,
  })
  .strict()
  .superRefine((record, context) => {
    const messageIds = record.turns.flatMap((turn) => [turn.userMessageId, turn.assistantMessageId])
    const requestIds = record.turns.map((turn) => turn.attemptRequestId)
    const pendingIndexes = record.turns.flatMap((turn, index) =>
      turn.assistantStatus === 'pending' ? [index] : [],
    )
    const imageIds = record.turns.flatMap((turn) =>
      turn.imageRefs.map((imageRef) => imageRef.imageId),
    )

    if (new Set(messageIds).size !== messageIds.length) {
      context.addIssue({
        code: 'custom',
        message: 'Current thread message ids must be unique.',
        path: ['turns'],
      })
    }

    if (new Set(requestIds).size !== requestIds.length) {
      context.addIssue({
        code: 'custom',
        message: 'Current thread latest attempt request ids must be unique.',
        path: ['turns'],
      })
    }

    if (
      pendingIndexes.length > 1 ||
      pendingIndexes.some((index) => index !== record.turns.length - 1)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Only the final turn may be pending.',
        path: ['turns'],
      })
    }

    if (new Set(imageIds).size !== imageIds.length) {
      context.addIssue({
        code: 'custom',
        message: 'Current thread image ids must be unique.',
        path: ['turns'],
      })
    }
  })

export type TurnRecordV3 = z.infer<typeof turnRecordV3Schema>
export type CurrentThreadRecordV3 = z.infer<typeof currentThreadRecordV3Schema>
export type MutableTurnRecord = TurnRecordV2 | TurnRecordV3
export type MutableCurrentThreadRecord = CurrentThreadRecordV2 | CurrentThreadRecordV3
export type CurrentThreadRecord = CurrentThreadRecordV1 | MutableCurrentThreadRecord

export const currentThreadRecordSchema = z.discriminatedUnion('version', [
  currentThreadRecordV1Schema,
  currentThreadRecordV2Schema,
  currentThreadRecordV3Schema,
])

const mutableCurrentThreadRecordSchema = z.discriminatedUnion('version', [
  currentThreadRecordV2Schema,
  currentThreadRecordV3Schema,
])

export function createSafeThreadErrorRecordV1(input: {
  code: CurrentThreadErrorCodeV1
  retryable: boolean
}): SafeThreadErrorRecordV1 {
  return {
    code: input.code,
    message: safeThreadErrorMessagesV1[input.code],
    retryable: input.retryable,
  }
}

export function createInterruptedThreadErrorRecordV1(): SafeThreadErrorRecordV1 {
  return {
    code: 'unknown',
    message: interruptedThreadErrorMessageV1,
    retryable: true,
  }
}

export function createSafeThreadErrorRecordV2(input: {
  code: CurrentThreadErrorCodeV2
  retryable: boolean
}): SafeThreadErrorRecordV2 {
  return {
    code: input.code,
    message: safeThreadErrorMessagesV2[input.code],
    retryable: input.retryable,
  }
}

export function createInterruptedThreadErrorRecordV2(): SafeThreadErrorRecordV2 {
  return {
    code: 'unknown',
    message: interruptedThreadErrorMessageV1,
    retryable: true,
  }
}

export function parseCurrentThreadRecordV1(value: unknown): CurrentThreadRecordV1 {
  return currentThreadRecordV1Schema.parse(value)
}

export function parseCurrentThreadRecordV2(value: unknown): CurrentThreadRecordV2 {
  return currentThreadRecordV2Schema.parse(value)
}

export function parseCurrentThreadRecordV3(value: unknown): CurrentThreadRecordV3 {
  return currentThreadRecordV3Schema.parse(value)
}

export function parseMutableCurrentThreadRecord(value: unknown): MutableCurrentThreadRecord {
  return mutableCurrentThreadRecordSchema.parse(value)
}

export function parseCurrentThreadRecord(value: unknown): CurrentThreadRecord {
  return currentThreadRecordSchema.parse(value)
}

export function upgradeCurrentThreadRecordForMutation(
  record: CurrentThreadRecord,
): MutableCurrentThreadRecord {
  if (record.version === 3) {
    return parseCurrentThreadRecordV3(record)
  }

  if (record.version === 2) {
    return parseCurrentThreadRecordV2(record)
  }

  return parseCurrentThreadRecordV2({
    ...record,
    version: 2,
    turns: record.turns.map((turn) => ({
      ...turn,
      targetBinding: null,
    })),
  })
}

export function upgradeCurrentThreadRecordForImageMutation(
  record: CurrentThreadRecord,
): CurrentThreadRecordV3 {
  if (record.version === 3) {
    return parseCurrentThreadRecordV3(record)
  }

  const upgradedRecord = upgradeCurrentThreadRecordForMutation(record)

  return parseCurrentThreadRecordV3({
    ...upgradedRecord,
    version: 3,
    turns: upgradedRecord.turns.map((turn) => ({
      ...turn,
      imageRefs: [],
    })),
  })
}
