import { z } from 'zod'

import {
  chatDocumentRefSchema,
  chatImageRefSchema,
  chatTargetAttributionSchema,
  chatTargetSelectionSchema,
  providerStateRefSchema,
  safeThreadErrorRecordSchema,
} from '../current-thread/schemas'

const nonEmpty = z.string().min(1)
const nonBlank = z.string().refine((value) => value.trim().length > 0)
const uuid = z.uuid()
const timestamp = z.iso.datetime()
const localSecond = z.iso.datetime({ local: true, precision: 0 })
const location = z.enum(['available', 'archived', 'trash'])

function genericTitle(local: string, ordinal: number, kind: 'Image' | 'Untitled draft') {
  const base = `${kind} · ${local.replace('T', ' ')}`
  return ordinal === 1 ? base : `${base} · ${ordinal}`
}

const threadRowSchema = z
  .object({
    id: uuid,
    location,
    trashedFromLocation: z.enum(['available', 'archived']).nullable(),
    trashedPinPosition: z.number().int().positive().nullable(),
    pinPosition: z.number().int().positive().nullable(),
    title: nonBlank,
    titleSource: z.enum(['auto', 'manual']),
    fallbackLocalSecond: localSecond.nullable(),
    fallbackOrdinal: z.number().int().positive().nullable(),
    threadRevision: z.number().int().positive(),
    lastUserActivityAt: timestamp,
    resultRevision: z.number().int().nonnegative(),
    seenResultRevision: z.number().int().nonnegative(),
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  .strict()
  .superRefine((row, context) => {
    if ((row.fallbackLocalSecond === null) !== (row.fallbackOrdinal === null)) {
      context.addIssue({ code: 'custom', message: 'Fallback identity must be complete.' })
    }
    if (
      row.fallbackLocalSecond !== null &&
      row.fallbackOrdinal !== null &&
      row.title !== genericTitle(row.fallbackLocalSecond, row.fallbackOrdinal, 'Image') &&
      row.title !== genericTitle(row.fallbackLocalSecond, row.fallbackOrdinal, 'Untitled draft')
    ) {
      context.addIssue({ code: 'custom', message: 'Fallback title does not match its identity.' })
    }
    if (
      (row.location === 'trash') !== (row.trashedFromLocation !== null) ||
      (row.location !== 'trash' && row.trashedPinPosition !== null) ||
      (row.trashedPinPosition !== null && row.trashedFromLocation !== 'available') ||
      (row.pinPosition !== null && row.location !== 'available')
    ) {
      context.addIssue({ code: 'custom', message: 'Thread location metadata is inconsistent.' })
    }
    if (row.seenResultRevision > row.resultRevision) {
      context.addIssue({ code: 'custom', message: 'Seen result revision is ahead of the result.' })
    }
  })

const draftRowSchema = z
  .object({
    threadId: uuid,
    draftRevision: z.number().int().nonnegative(),
    text: z.string(),
    targetSelection: chatTargetSelectionSchema,
    updatedAt: timestamp,
  })
  .strict()

const turnRowSchema = z
  .object({
    threadId: uuid,
    ordinal: z.number().int().nonnegative(),
    attemptRequestId: nonEmpty,
    userMessageId: nonEmpty,
    assistantMessageId: nonEmpty,
    userContent: z.string(),
    assistantContent: z.string(),
    assistantStatus: z.enum(['pending', 'completed', 'cancelled', 'failed']),
    error: safeThreadErrorRecordSchema.nullable(),
    targetSelection: chatTargetSelectionSchema,
    targetAttribution: chatTargetAttributionSchema.nullable(),
    providerStateId: uuid.nullable(),
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  .strict()
  .superRefine((turn, context) => {
    if (
      (turn.assistantStatus === 'pending' &&
        (turn.assistantContent !== '' || turn.error !== null || turn.providerStateId !== null)) ||
      (turn.assistantStatus === 'failed' &&
        (turn.error === null || turn.providerStateId !== null)) ||
      (turn.assistantStatus !== 'pending' &&
        turn.assistantStatus !== 'failed' &&
        turn.error !== null) ||
      (turn.providerStateId !== null && turn.assistantStatus !== 'completed')
    ) {
      context.addIssue({ code: 'custom', message: 'Assistant terminal state is inconsistent.' })
    }
    if (
      turn.providerStateId !== null &&
      (turn.targetSelection.kind !== 'connection' || turn.targetAttribution?.kind !== 'connection')
    ) {
      context.addIssue({ code: 'custom', message: 'Provider state requires a resolved target.' })
    }
    if (
      turn.targetAttribution !== null &&
      (turn.targetSelection.kind !== turn.targetAttribution.kind ||
        (turn.targetSelection.kind === 'connection' &&
          turn.targetAttribution.kind === 'connection' &&
          (turn.targetSelection.providerId !== turn.targetAttribution.providerId ||
            turn.targetSelection.modelId !== turn.targetAttribution.modelId)))
    ) {
      context.addIssue({ code: 'custom', message: 'Target attribution does not match selection.' })
    }
  })

const imageRowSchema = chatImageRefSchema.extend({
  threadId: uuid,
  turnOrdinal: z.number().int().nonnegative(),
  position: z.number().int().nonnegative(),
  available: z.boolean(),
})

const documentRowSchema = chatDocumentRefSchema.extend({
  threadId: uuid,
  turnOrdinal: z.number().int().nonnegative(),
  position: z.number().int().nonnegative(),
  available: z.boolean(),
  extractedText: z.string().nullable(),
})

const providerStateRowSchema = providerStateRefSchema.extend({
  threadId: uuid,
  turnOrdinal: z.number().int().nonnegative(),
})

export const importedV5RowsSchema = z
  .object({
    thread: threadRowSchema,
    draft: draftRowSchema,
    turns: z.array(turnRowSchema),
    images: z.array(imageRowSchema),
    documents: z.array(documentRowSchema),
    providerStateRefs: z.array(providerStateRowSchema),
  })
  .strict()
  .superRefine((rows, context) => {
    const threadIds = [
      rows.draft.threadId,
      ...rows.turns.map((row) => row.threadId),
      ...rows.images.map((row) => row.threadId),
      ...rows.documents.map((row) => row.threadId),
      ...rows.providerStateRefs.map((row) => row.threadId),
    ]
    const ordinals = new Set(rows.turns.map((row) => row.ordinal))
    const imageOrdinals = new Set(rows.images.map((row) => row.turnOrdinal))
    const documentOrdinals = new Set(rows.documents.map((row) => row.turnOrdinal))
    const providerByOrdinal = new Map(
      rows.providerStateRefs.map((row) => [row.turnOrdinal, row.stateId]),
    )
    if (
      threadIds.some((id) => id !== rows.thread.id) ||
      rows.turns.some(
        (row, index) =>
          row.ordinal !== index ||
          (row.assistantStatus === 'pending' && index !== rows.turns.length - 1) ||
          row.providerStateId !== (providerByOrdinal.get(row.ordinal) ?? null) ||
          (row.userContent.length === 0 &&
            !imageOrdinals.has(row.ordinal) &&
            !documentOrdinals.has(row.ordinal)) ||
          (row.error?.code === 'content_rejected' &&
            !imageOrdinals.has(row.ordinal) &&
            !documentOrdinals.has(row.ordinal)),
      ) ||
      rows.images.some((row) => !ordinals.has(row.turnOrdinal)) ||
      rows.documents.some((row) => !ordinals.has(row.turnOrdinal)) ||
      rows.providerStateRefs.some((row) => !ordinals.has(row.turnOrdinal))
    ) {
      context.addIssue({ code: 'custom', message: 'Imported Thread content is inconsistent.' })
    }
  })

export type ImportedV5Rows = z.infer<typeof importedV5RowsSchema>

const operationInputSchemas = {
  open: z.object({ databasePath: nonEmpty.max(4096) }).strict(),
  close: z.object({}).strict(),
  materialize: z
    .object({
      threadId: uuid,
      title: nonBlank,
      targetSelection: chatTargetSelectionSchema,
      fallbackLocalSecond: localSecond.nullable(),
      createdAt: timestamp,
    })
    .strict()
    .superRefine((input, context) => {
      if (
        input.fallbackLocalSecond !== null &&
        input.title !== genericTitle(input.fallbackLocalSecond, 1, 'Image') &&
        input.title !== genericTitle(input.fallbackLocalSecond, 1, 'Untitled draft')
      ) {
        context.addIssue({ code: 'custom', message: 'Fallback title does not match its identity.' })
      }
    }),
  readThread: z.object({ threadId: uuid }).strict(),
  listPage: z
    .object({
      location,
      cursor: z.string().max(1024).nullable(),
      limit: z.literal(50),
    })
    .strict(),
  importV5: z.object({ rows: importedV5RowsSchema }).strict(),
} as const

export type ThreadLibraryOperation = keyof typeof operationInputSchemas
export type ThreadLibraryOperationInput = {
  [Operation in ThreadLibraryOperation]: z.infer<(typeof operationInputSchemas)[Operation]>
}

export type ThreadLibraryRequest = {
  [Operation in ThreadLibraryOperation]: {
    id: string
    operation: Operation
    input: ThreadLibraryOperationInput[Operation]
  }
}[ThreadLibraryOperation]

export type ThreadLibraryMutationOutcome =
  | 'definitely_not_committed'
  | 'committed'
  | 'outcome_unknown'

export const threadLibrarySafeErrorMessages = {
  invalid_request: 'The Thread Library request is invalid.',
  library_unavailable: 'The Thread Library is unavailable.',
  thread_unavailable: 'This thread is unavailable.',
  already_exists: 'This thread already exists.',
  not_found: 'This thread was not found.',
  stale_cursor: 'The thread list changed. Reload it and try again.',
} as const

export type ThreadLibrarySafeErrorCode = keyof typeof threadLibrarySafeErrorMessages

const safeErrorSchema = z
  .object({
    code: z.enum(
      Object.keys(threadLibrarySafeErrorMessages) as [
        ThreadLibrarySafeErrorCode,
        ...ThreadLibrarySafeErrorCode[],
      ],
    ),
    message: nonEmpty,
  })
  .strict()
  .superRefine((error, context) => {
    if (error.message !== threadLibrarySafeErrorMessages[error.code]) {
      context.addIssue({ code: 'custom', message: 'Thread Library errors use fixed safe copy.' })
    }
  })

const threadIdentitySchema = z
  .object({
    id: uuid,
    location,
  })
  .strict()

const threadSummarySchema = z
  .object({
    id: uuid,
    location,
    title: nonBlank,
    pinPosition: z.number().int().positive().nullable(),
    lastUserActivityAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
    threadRevision: z.number().int().positive(),
  })
  .strict()

const threadListRowSchema = z.discriminatedUnion('availability', [
  threadSummarySchema.extend({ availability: z.literal('available') }),
  threadIdentitySchema.extend({ availability: z.literal('unavailable') }),
])

const threadDetailSchema = z
  .object({
    summary: threadRowSchema,
    draft: draftRowSchema,
    turns: z.array(turnRowSchema),
    images: z.array(imageRowSchema),
    documents: z.array(documentRowSchema),
    providerStateRefs: z.array(providerStateRowSchema),
  })
  .strict()
  .superRefine((detail, context) => {
    const ordinals = new Set(detail.turns.map((turn) => turn.ordinal))
    const providerByOrdinal = new Map(
      detail.providerStateRefs.map((ref) => [ref.turnOrdinal, ref.stateId]),
    )
    const imageOrdinals = new Set(detail.images.map((image) => image.turnOrdinal))
    const documentOrdinals = new Set(detail.documents.map((document) => document.turnOrdinal))
    if (
      detail.draft.threadId !== detail.summary.id ||
      detail.turns.some((turn) => turn.threadId !== detail.summary.id) ||
      detail.images.some((image) => image.threadId !== detail.summary.id) ||
      detail.documents.some((document) => document.threadId !== detail.summary.id) ||
      detail.providerStateRefs.some((ref) => ref.threadId !== detail.summary.id) ||
      detail.images.some((image) => !ordinals.has(image.turnOrdinal)) ||
      detail.documents.some((document) => !ordinals.has(document.turnOrdinal)) ||
      detail.providerStateRefs.some((ref) => !ordinals.has(ref.turnOrdinal)) ||
      detail.turns.some(
        (turn) => turn.providerStateId !== (providerByOrdinal.get(turn.ordinal) ?? null),
      ) ||
      detail.turns.some(
        (turn) =>
          (turn.userContent.length === 0 &&
            !imageOrdinals.has(turn.ordinal) &&
            !documentOrdinals.has(turn.ordinal)) ||
          (turn.error?.code === 'content_rejected' &&
            !imageOrdinals.has(turn.ordinal) &&
            !documentOrdinals.has(turn.ordinal)),
      ) ||
      detail.turns.some(
        (turn, index) =>
          turn.ordinal !== index ||
          (turn.assistantStatus === 'pending' && index !== detail.turns.length - 1),
      )
    ) {
      context.addIssue({ code: 'custom', message: 'Thread content identity is inconsistent.' })
    }
  })

const operationValueSchemas = {
  open: z.object({ schemaVersion: z.literal(1) }).strict(),
  close: z.object({ closed: z.literal(true) }).strict(),
  materialize: threadDetailSchema,
  readThread: threadDetailSchema.nullable(),
  listPage: z
    .object({
      rows: z.array(threadListRowSchema).max(50),
      nextCursor: z.string().max(1024).nullable(),
      includedThroughCursor: z.number().int().nonnegative(),
    })
    .strict(),
  importV5: z.object({ threadId: uuid, imported: z.boolean() }).strict(),
} as const

export type ThreadLibraryOperationValue = {
  [Operation in ThreadLibraryOperation]: z.infer<(typeof operationValueSchemas)[Operation]>
}
export type ThreadLibraryThreadDetail = ThreadLibraryOperationValue['materialize']
export type ThreadLibraryListRow = ThreadLibraryOperationValue['listPage']['rows'][number]

export function parseThreadLibraryThreadIdentity(value: unknown) {
  return threadIdentitySchema.parse(value)
}

export function parseThreadLibraryListRow(value: unknown): ThreadLibraryListRow {
  return threadListRowSchema.parse(value)
}

export function parseThreadLibraryThreadDetail(value: unknown): ThreadLibraryThreadDetail {
  return threadDetailSchema.parse(value)
}

export type ThreadLibraryReply<Operation extends ThreadLibraryOperation = ThreadLibraryOperation> =
  | {
      id: string
      ok: true
      value: ThreadLibraryOperationValue[Operation]
    }
  | {
      id: string
      ok: false
      safeError: z.infer<typeof safeErrorSchema>
      outcome: ThreadLibraryMutationOutcome
    }

const requestEnvelopeSchema = z
  .object({
    id: nonEmpty,
    operation: z.enum(
      Object.keys(operationInputSchemas) as [ThreadLibraryOperation, ...ThreadLibraryOperation[]],
    ),
    input: z.unknown(),
  })
  .strict()

export function parseThreadLibraryRequest(value: unknown): ThreadLibraryRequest {
  const envelope = requestEnvelopeSchema.parse(value)
  return {
    ...envelope,
    input: operationInputSchemas[envelope.operation].parse(envelope.input),
  } as ThreadLibraryRequest
}

export function parseThreadLibraryReply<Operation extends ThreadLibraryOperation>(
  operation: Operation,
  value: unknown,
): ThreadLibraryReply<Operation> {
  const envelope = z
    .discriminatedUnion('ok', [
      z.object({ id: nonEmpty, ok: z.literal(true), value: z.unknown() }).strict(),
      z
        .object({
          id: nonEmpty,
          ok: z.literal(false),
          safeError: safeErrorSchema,
          outcome: z.enum(['definitely_not_committed', 'committed', 'outcome_unknown']),
        })
        .strict(),
    ])
    .parse(value)

  if (!envelope.ok) {
    return envelope
  }

  return {
    ...envelope,
    value: operationValueSchemas[operation].parse(envelope.value),
  } as ThreadLibraryReply<Operation>
}
