import { z } from 'zod'

import { isNyxChatDocumentName, nyxChatDocumentLimits } from '../../../shared/chat/document-file'
import {
  nyxChatAttachmentContentRejectedMessage,
  nyxChatDocumentMediaTypes,
  nyxChatImageMediaTypes,
  type NyxChatImageRef,
  type NyxChatTargetAttribution,
  type NyxChatTargetSelection,
} from '../../../shared/chat/types'
import { responsesContinuationLimits } from '../chat/provider-stream'

export const currentThreadAssistantStatuses = [
  'pending',
  'completed',
  'cancelled',
  'failed',
] as const

export const currentThreadErrorCodes = [
  'config_missing',
  'invalid_request',
  'auth_failed',
  'network_error',
  'rate_limited',
  'upstream_error',
  'cancelled',
  'unknown',
  'target_unavailable',
  'content_rejected',
] as const

export type CurrentThreadErrorCode = (typeof currentThreadErrorCodes)[number]

export const safeThreadErrorMessages = {
  config_missing: 'Chat provider configuration is unavailable.',
  invalid_request: 'The chat request is invalid.',
  auth_failed: 'The provider rejected the configured credentials.',
  network_error: 'Nyx could not reach the provider.',
  rate_limited: 'The provider rate limit was reached.',
  upstream_error: 'The provider could not complete the response.',
  cancelled: 'The response was cancelled.',
  unknown: 'The response failed unexpectedly.',
  target_unavailable: 'The selected chat target is unavailable.',
  content_rejected: nyxChatAttachmentContentRejectedMessage,
} as const satisfies Record<CurrentThreadErrorCode, string>

export const interruptedThreadErrorMessage =
  'The previous response was interrupted before it finished.'

const nonEmptyStringSchema = z.string().min(1)
const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/u)
const safeErrorMessageSchema = z.enum([
  ...Object.values(safeThreadErrorMessages),
  interruptedThreadErrorMessage,
])

export const safeThreadErrorRecordSchema = z
  .object({
    code: z.enum(currentThreadErrorCodes),
    message: safeErrorMessageSchema,
    retryable: z.boolean(),
  })
  .strict()
  .superRefine((error, context) => {
    const interrupted = error.code === 'unknown' && error.message === interruptedThreadErrorMessage

    if (error.message !== safeThreadErrorMessages[error.code] && !interrupted) {
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

export const targetBindingSchema = z
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

export const chatImageRefSchema = z
  .object({
    imageId: z.uuid(),
    mediaType: z.enum(nyxChatImageMediaTypes),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  })
  .strict() satisfies z.ZodType<NyxChatImageRef>

export const chatDocumentRefSchema = z
  .object({
    documentId: z.uuid(),
    name: nonEmptyStringSchema,
    mediaType: z.enum(nyxChatDocumentMediaTypes),
    byteLength: z.number().int().positive().max(nyxChatDocumentLimits.sourceBytesPerDocument),
    extractedByteLength: z
      .number()
      .int()
      .positive()
      .max(nyxChatDocumentLimits.extractedBytesPerDocument),
    sourceSha256: sha256Schema,
    extractedTextSha256: sha256Schema,
  })
  .strict()
  .superRefine((ref, context) => {
    if (!isNyxChatDocumentName(ref.name, ref.mediaType)) {
      context.addIssue({
        code: 'custom',
        message: 'Document name and media type must be an allowlisted basename pair.',
        path: ['name'],
      })
    }
  })

export const providerStateRefSchema = z
  .object({
    protocol: z.literal('openai-responses'),
    stateId: z.uuid(),
    executionIdentity: sha256Schema,
    byteLength: z.number().int().positive().max(responsesContinuationLimits.maxSerializedBytes),
    sha256: sha256Schema,
  })
  .strict()

export const turnRecordSchema = z
  .object({
    attemptRequestId: nonEmptyStringSchema,
    userMessageId: nonEmptyStringSchema,
    assistantMessageId: nonEmptyStringSchema,
    userContent: z.string(),
    imageRefs: z.array(chatImageRefSchema),
    documentRefs: z.array(chatDocumentRefSchema).max(nyxChatDocumentLimits.documentsPerTurn),
    assistantContent: z.string(),
    assistantStatus: z.enum(currentThreadAssistantStatuses),
    error: safeThreadErrorRecordSchema.nullable(),
    targetBinding: targetBindingSchema,
    providerStateRef: providerStateRefSchema.nullable(),
    createdAt: nonEmptyStringSchema,
    updatedAt: nonEmptyStringSchema,
  })
  .strict()
  .superRefine((turn, context) => {
    if (
      turn.userContent.length === 0 &&
      turn.imageRefs.length === 0 &&
      turn.documentRefs.length === 0
    ) {
      context.addIssue({
        code: 'custom',
        message: 'A user turn must contain text or at least one attachment reference.',
        path: ['userContent'],
      })
    }

    if (turn.assistantStatus === 'pending') {
      if (turn.assistantContent !== '' || turn.error !== null || turn.providerStateRef !== null) {
        context.addIssue({
          code: 'custom',
          message: 'A pending assistant must have empty content and no terminal state.',
          path: ['assistantStatus'],
        })
      }
    } else if (turn.assistantStatus === 'failed') {
      if (turn.error === null || turn.providerStateRef !== null) {
        context.addIssue({
          code: 'custom',
          message: 'A failed assistant must have one safe error and no provider state.',
          path: ['assistantStatus'],
        })
      }
    } else if (
      turn.error !== null ||
      (turn.assistantStatus !== 'completed' && turn.providerStateRef)
    ) {
      context.addIssue({
        code: 'custom',
        message:
          'Only a failed assistant may have an error and only completion may retain provider state.',
        path: ['assistantStatus'],
      })
    }

    if (
      turn.providerStateRef &&
      (turn.targetBinding.selection.kind !== 'connection' ||
        turn.targetBinding.attribution?.kind !== 'connection')
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Provider continuation requires one resolved persisted target.',
        path: ['providerStateRef'],
      })
    }

    if (
      turn.error?.code === 'content_rejected' &&
      turn.imageRefs.length === 0 &&
      turn.documentRefs.length === 0
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Content rejection requires an attachment-bearing turn.',
        path: ['error'],
      })
    }
  })

export const currentThreadRecordSchema = z
  .object({
    version: z.literal(5),
    threadId: nonEmptyStringSchema,
    turns: z.array(turnRecordSchema).min(1),
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
    const imageIds = record.turns.flatMap((turn) => turn.imageRefs.map((ref) => ref.imageId))
    const documentIds = record.turns.flatMap((turn) =>
      turn.documentRefs.map((ref) => ref.documentId),
    )
    const stateIds = record.turns.flatMap((turn) =>
      turn.providerStateRef ? [turn.providerStateRef.stateId] : [],
    )

    for (const [values, message] of [
      [messageIds, 'Current thread message ids must be unique.'],
      [requestIds, 'Current thread latest attempt request ids must be unique.'],
      [imageIds, 'Current thread image ids must be unique.'],
      [documentIds, 'Current thread document ids must be unique.'],
      [stateIds, 'Current thread provider state ids must be unique.'],
    ] as const) {
      if (new Set(values).size !== values.length) {
        context.addIssue({ code: 'custom', message, path: ['turns'] })
      }
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

    if (
      documentIds.length > nyxChatDocumentLimits.currentThreadDocuments ||
      record.turns.reduce(
        (total, turn) =>
          total + turn.documentRefs.reduce((sum, ref) => sum + ref.extractedByteLength, 0),
        0,
      ) > nyxChatDocumentLimits.currentThreadExtractedBytes
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Current thread document capacity must remain bounded.',
        path: ['turns'],
      })
    }
  })

export type SafeThreadErrorRecord = z.infer<typeof safeThreadErrorRecordSchema>
export type CurrentThreadDocumentRef = z.infer<typeof chatDocumentRefSchema>
export type ProviderStateRef = z.infer<typeof providerStateRefSchema>
export type TurnRecord = z.infer<typeof turnRecordSchema>
export type CurrentThreadRecord = z.infer<typeof currentThreadRecordSchema>

export function createSafeThreadErrorRecord(input: {
  code: CurrentThreadErrorCode
  retryable: boolean
}): SafeThreadErrorRecord {
  return {
    code: input.code,
    message: safeThreadErrorMessages[input.code],
    retryable: input.retryable,
  }
}

export function createInterruptedThreadErrorRecord(): SafeThreadErrorRecord {
  return {
    code: 'unknown',
    message: interruptedThreadErrorMessage,
    retryable: true,
  }
}

export function parseCurrentThreadRecord(value: unknown): CurrentThreadRecord {
  return currentThreadRecordSchema.parse(value)
}

export function parseProviderStateRef(value: unknown): ProviderStateRef {
  return providerStateRefSchema.parse(value)
}
