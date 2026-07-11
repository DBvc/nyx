import { z } from 'zod'

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

export function parseCurrentThreadRecordV1(value: unknown): CurrentThreadRecordV1 {
  return currentThreadRecordV1Schema.parse(value)
}
