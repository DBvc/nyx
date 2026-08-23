import { z } from 'zod'

import {
  chatDocumentRefSchema,
  chatImageRefSchema,
  chatTargetAttributionSchema,
  chatTargetSelectionSchema,
  providerStateRefSchema,
  safeThreadErrorRecordSchema,
} from '../current-thread/schemas'
import { nyxChatDocumentLimits } from '../../../shared/chat/document-file'
import { nyxChatImageLimits } from '../../../shared/chat/image-file'
import { validateNyxThreadTitle } from '../../../shared/threads/title'

const nonEmpty = z.string().min(1)
const nonBlank = z.string().refine((value) => value.trim().length > 0)
const uuid = z.uuid()
const timestamp = z.iso.datetime()
const localSecond = z.iso.datetime({ local: true, precision: 0 })
const location = z.enum(['available', 'archived', 'trash'])
const pinPosition = z.number().int().positive().nullable()
const position = z.number().int().nonnegative()
const pinAction = z.enum(['pin', 'unpin', 'move_up', 'move_down', 'move_top', 'move_bottom'])
const locationAction = z.enum(['archive', 'unarchive', 'trash', 'restore'])
const searchLocation = z.enum(['available', 'archived'])
const searchSource = z.enum(['title', 'user_message', 'assistant_message'])

const updatePinInputSchema = z
  .object({ threadId: uuid, action: pinAction, expectedPinPosition: pinPosition })
  .strict()
  .superRefine((input, context) => {
    if ((input.action === 'pin') !== (input.expectedPinPosition === null)) {
      context.addIssue({ code: 'custom', message: 'Pin action and expected position disagree.' })
    }
  })

export function formatThreadGenericTitle(
  localSecond: string,
  ordinal: number,
  kind: 'Image' | 'Untitled draft',
) {
  const base = `${kind} · ${localSecond.replace('T', ' ')}`
  return ordinal === 1 ? base : `${base} · ${ordinal}`
}

const threadRowSchema = z
  .object({
    id: uuid,
    location,
    trashedFromLocation: z.enum(['available', 'archived']).nullable(),
    trashedPinPosition: z.number().int().positive().nullable(),
    pinPosition,
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
    if (row.fallbackOrdinal !== null && row.fallbackLocalSecond === null) {
      context.addIssue({ code: 'custom', message: 'Fallback ordinal requires a local second.' })
    }
    if (
      row.titleSource === 'manual' &&
      (row.fallbackLocalSecond !== null || row.fallbackOrdinal !== null)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Manual titles cannot retain fallback identity.',
      })
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
    ordinal: position,
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

const importedImageRowSchema = chatImageRefSchema.extend({
  threadId: uuid,
  turnOrdinal: position,
  position,
  available: z.boolean(),
})

const importedDocumentRowSchema = chatDocumentRefSchema
  .extend({
    threadId: uuid,
    turnOrdinal: position,
    position,
    available: z.boolean(),
    extractedText: z.string().nullable(),
  })
  .superRefine((row, context) => {
    if (row.available && row.extractedText === null) {
      context.addIssue({ code: 'custom', message: 'Imported document availability is invalid.' })
    }
  })

const ownedImageRowSchema = chatImageRefSchema
  .extend({
    threadId: uuid,
    owner: z.enum(['draft', 'turn']),
    turnOrdinal: position.nullable(),
    position,
    available: z.boolean(),
  })
  .superRefine((row, context) => {
    if ((row.owner === 'draft') !== (row.turnOrdinal === null)) {
      context.addIssue({ code: 'custom', message: 'Image ownership is invalid.' })
    }
  })

const ownedDocumentRowSchema = chatDocumentRefSchema
  .extend({
    threadId: uuid,
    owner: z.enum(['draft', 'turn']),
    turnOrdinal: position.nullable(),
    position,
    available: z.boolean(),
    extractedText: z.string().nullable(),
  })
  .superRefine((row, context) => {
    if (
      (row.owner === 'draft') !== (row.turnOrdinal === null) ||
      (row.available && row.extractedText === null)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Document ownership or availability is invalid.',
      })
    }
  })

const providerStateRowSchema = providerStateRefSchema.extend({
  threadId: uuid,
  turnOrdinal: position,
})

function duplicate<T>(values: ReadonlyArray<T>) {
  return new Set(values).size !== values.length
}

export const importedV5RowsSchema = z
  .object({
    thread: threadRowSchema,
    draft: draftRowSchema,
    turns: z.array(turnRowSchema),
    images: z.array(importedImageRowSchema),
    documents: z.array(importedDocumentRowSchema),
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
      duplicate(rows.images.map((row) => row.imageId)) ||
      duplicate(rows.documents.map((row) => row.documentId)) ||
      duplicate(rows.providerStateRefs.map((row) => row.stateId)) ||
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

function importedFallbackIdentityMatches(rows: ImportedV5Rows) {
  const second = rows.thread.fallbackLocalSecond
  const ordinal = rows.thread.fallbackOrdinal
  return (
    (second === null && ordinal === null) ||
    (second !== null &&
      ordinal === 1 &&
      (rows.thread.title === formatThreadGenericTitle(second, ordinal, 'Image') ||
        rows.thread.title === formatThreadGenericTitle(second, ordinal, 'Untitled draft')))
  )
}

const importedV5InputRowsSchema = importedV5RowsSchema.superRefine((rows, context) => {
  if (!importedFallbackIdentityMatches(rows)) {
    context.addIssue({ code: 'custom', message: 'Imported fallback identity is invalid.' })
  }
})

const draftImageInputSchema = chatImageRefSchema.extend({ position, available: z.boolean() })
const draftDocumentInputSchema = chatDocumentRefSchema
  .extend({ position, available: z.boolean(), extractedText: z.string().nullable() })
  .superRefine((row, context) => {
    if (row.available && row.extractedText === null) {
      context.addIssue({ code: 'custom', message: 'Available document text is required.' })
    }
  })

const draftPayloadSchema = z
  .object({
    text: z.string(),
    targetSelection: chatTargetSelectionSchema,
    images: z.array(draftImageInputSchema).max(nyxChatImageLimits.imagesPerTurn),
    documents: z.array(draftDocumentInputSchema).max(nyxChatDocumentLimits.documentsPerTurn),
  })
  .strict()
  .superRefine((draft, context) => {
    if (
      duplicate([
        ...draft.images.map((row) => row.imageId),
        ...draft.documents.map((row) => row.documentId),
      ]) ||
      duplicate(draft.images.map((row) => row.position)) ||
      draft.images.some((row, index) => row.position !== index) ||
      duplicate(draft.documents.map((row) => row.position)) ||
      draft.documents.some((row, index) => row.position !== index)
    ) {
      context.addIssue({ code: 'custom', message: 'Draft resources must be unique and ordered.' })
    }
  })

const resourceAvailabilitySchema = z.object({ id: uuid, available: z.boolean() }).strict()

const settleInputSchema = z
  .object({
    threadId: uuid,
    requestId: nonEmpty,
    assistantStatus: z.enum(['completed', 'cancelled', 'failed']),
    assistantContent: z.string(),
    error: safeThreadErrorRecordSchema.nullable(),
    providerStateRef: providerStateRefSchema.nullable(),
    settledAt: timestamp,
  })
  .strict()
  .superRefine((input, context) => {
    if (
      (input.assistantStatus === 'failed') !== (input.error !== null) ||
      (input.providerStateRef !== null && input.assistantStatus !== 'completed')
    ) {
      context.addIssue({ code: 'custom', message: 'Terminal input is inconsistent.' })
    }
  })

const operationInputSchemas = {
  open: z.object({ databasePath: nonEmpty.max(4096) }).strict(),
  close: z.object({}).strict(),
  materialize: z
    .object({
      threadId: uuid,
      draft: draftPayloadSchema,
      fallbackLocalSecond: localSecond,
      createdAt: timestamp,
    })
    .strict()
    .superRefine((input, context) => {
      if (
        input.draft.text.trim().length === 0 &&
        input.draft.images.length === 0 &&
        input.draft.documents.length === 0
      ) {
        context.addIssue({
          code: 'custom',
          message: 'Materialize requires text or an accepted resource.',
        })
      }
    }),
  readThread: z.object({ threadId: uuid }).strict(),
  snapshot: z.object({ threadId: uuid.nullable() }).strict(),
  listPage: z
    .object({ location, cursor: z.string().max(1024).nullable(), limit: z.literal(50) })
    .strict(),
  search: z
    .object({
      query: z
        .string()
        .transform((value) => value.trim())
        .refine((value) => {
          const length = Array.from(value).length
          return length >= 1 && length <= 256
        }),
    })
    .strict(),
  importV5: z.object({ rows: importedV5InputRowsSchema }).strict(),
  saveDraft: z
    .object({
      threadId: uuid,
      expectedDraftRevision: z.number().int().nonnegative(),
      draft: draftPayloadSchema,
      savedAt: timestamp,
    })
    .strict(),
  startTurn: z
    .object({
      threadId: uuid,
      requestId: nonEmpty,
      expectedDraftRevision: z.number().int().nonnegative(),
      userMessageId: nonEmpty,
      assistantMessageId: nonEmpty,
      startedAt: timestamp,
    })
    .strict(),
  retryTurn: z
    .object({
      threadId: uuid,
      turnOrdinal: position,
      expectedAttemptRequestId: nonEmpty,
      requestId: nonEmpty,
      expectedDraftRevision: z.number().int().nonnegative(),
      retriedAt: timestamp,
    })
    .strict(),
  bindTurnTarget: z
    .object({
      threadId: uuid,
      requestId: nonEmpty,
      targetAttribution: chatTargetAttributionSchema,
      boundAt: timestamp,
    })
    .strict(),
  settleTurn: settleInputSchema,
  recoverPending: z.object({ recoveredAt: timestamp }).strict(),
  setResourceAvailability: z
    .object({
      threadId: uuid,
      images: z.array(resourceAvailabilitySchema).max(nyxChatImageLimits.currentThreadImages),
      documents: z
        .array(resourceAvailabilitySchema)
        .max(nyxChatDocumentLimits.currentThreadDocuments),
      checkedAt: timestamp,
    })
    .strict()
    .superRefine((input, context) => {
      if (
        duplicate(input.images.map((row) => row.id)) ||
        duplicate(input.documents.map((row) => row.id))
      ) {
        context.addIssue({ code: 'custom', message: 'Resource availability ids are duplicated.' })
      }
    }),
  repairProviderStateRef: z
    .object({
      threadId: uuid,
      requestId: nonEmpty,
      providerStateRef: providerStateRefSchema,
      repairedAt: timestamp,
    })
    .strict(),
  markSeen: z
    .object({
      threadId: uuid,
      observedResultRevision: z.number().int().nonnegative(),
    })
    .strict(),
  pinState: z.object({ threadId: uuid }).strict(),
  locationState: z.object({ threadId: uuid }).strict(),
  updatePin: updatePinInputSchema,
  rename: z
    .object({
      threadId: uuid,
      title: z.string(),
      expectedThreadRevision: z.number().int().positive(),
      renamedAt: timestamp,
    })
    .strict()
    .superRefine((input, context) => {
      const result = validateNyxThreadTitle(input.title)
      if (!result.ok || result.title !== input.title) {
        context.addIssue({ code: 'custom', message: 'Thread title is invalid.' })
      }
    }),
  updateLocation: z
    .object({
      threadId: uuid,
      action: locationAction,
      expectedThreadRevision: z.number().int().positive(),
      movedAt: timestamp,
    })
    .strict(),
  discardEmptyShell: z
    .object({
      threadId: uuid,
      expectedDraftRevision: z.number().int().nonnegative(),
    })
    .strict(),
} as const

export type ThreadLibraryOperation = keyof typeof operationInputSchemas
export type ThreadLibraryOperationInput = {
  [Operation in ThreadLibraryOperation]: z.infer<(typeof operationInputSchemas)[Operation]>
}

export function deriveThreadDraftTitle(
  draft: ThreadLibraryOperationInput['saveDraft']['draft'],
): { title: string; genericKind: null } | { title: null; genericKind: 'Image' | 'Untitled draft' } {
  const normalizedText = draft.text.trim().replace(/\s+/gu, ' ')
  const text = Array.from(normalizedText)
  if (text.length > 0) {
    return {
      title: text.length <= 48 ? normalizedText : `${text.slice(0, 45).join('').trimEnd()}...`,
      genericKind: null,
    }
  }

  const document = [...draft.documents]
    .sort((left, right) => left.position - right.position)
    .find((row) => row.available)
  if (!document) {
    return {
      title: null,
      genericKind: draft.images.some((row) => row.available) ? 'Image' : 'Untitled draft',
    }
  }

  const normalizedName = document.name.trim().replace(/\s+/gu, ' ')
  const name = Array.from(normalizedName)
  if (name.length <= 48) {
    return { title: normalizedName, genericKind: null }
  }
  const dot = name.lastIndexOf('.')
  const extension = dot > 0 && dot < name.length - 1 ? name.slice(dot) : []
  return {
    title:
      extension.length > 0 && extension.length <= 44
        ? `${name
            .slice(0, 48 - 3 - extension.length)
            .join('')
            .trimEnd()}...${extension.join('')}`
        : `${name.slice(0, 45).join('').trimEnd()}...`,
    genericKind: null,
  }
}

export type ThreadLibraryRequest = {
  [Operation in ThreadLibraryOperation]: {
    id: string
    operation: Operation
    input: ThreadLibraryOperationInput[Operation]
  }
}[ThreadLibraryOperation]

export function parseThreadLibraryOperationInput<Operation extends ThreadLibraryOperation>(
  operation: Operation,
  value: unknown,
): ThreadLibraryOperationInput[Operation] {
  return operationInputSchemas[operation].parse(value) as ThreadLibraryOperationInput[Operation]
}

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
  stale_revision: 'This draft changed. Reload it and try again.',
  stale_pin_position: 'This Pin position changed. Reload it and try again.',
  stale_thread_revision: 'This thread changed. Reload it and try again.',
  not_pending: 'This turn is no longer pending.',
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

const threadIdentitySchema = z.object({ id: uuid, location }).strict()
const threadListOrderIdentitySchema = z
  .object({
    id: uuid,
    location,
    pinPosition,
  })
  .passthrough()
  .superRefine((row, context) => {
    if (row.pinPosition !== null && row.location !== 'available') {
      context.addIssue({ code: 'custom', message: 'Thread Pin grouping is inconsistent.' })
    }
  })
const threadSearchOrderMetadataSchema = z
  .object({
    id: uuid,
    location,
    lastUserActivityAt: timestamp,
    createdAt: timestamp,
  })
  .passthrough()
const threadSummarySchema = z
  .object({
    id: uuid,
    location,
    title: nonBlank,
    pinPosition,
    lastUserActivityAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
    threadRevision: z.number().int().positive(),
    resultRevision: z.number().int().nonnegative(),
    seenResultRevision: z.number().int().nonnegative(),
  })
  .strict()
const threadListRowSchema = z
  .discriminatedUnion('availability', [
    threadSummarySchema.extend({ availability: z.literal('available') }),
    threadIdentitySchema.extend({ availability: z.literal('unavailable'), pinPosition }),
  ])
  .superRefine((row, context) => {
    if (row.pinPosition !== null && row.location !== 'available') {
      context.addIssue({ code: 'custom', message: 'Thread Pin grouping is inconsistent.' })
    }
    if (row.availability === 'available' && row.seenResultRevision > row.resultRevision) {
      context.addIssue({ code: 'custom', message: 'Seen result revision is ahead of the result.' })
    }
  })

const threadDetailSchema = z
  .object({
    summary: threadRowSchema,
    draft: draftRowSchema,
    turns: z.array(turnRowSchema),
    images: z.array(ownedImageRowSchema),
    documents: z.array(ownedDocumentRowSchema),
    providerStateRefs: z.array(providerStateRowSchema),
  })
  .strict()
  .superRefine((detail, context) => {
    const ordinals = new Set(detail.turns.map((turn) => turn.ordinal))
    const providerByOrdinal = new Map(
      detail.providerStateRefs.map((ref) => [ref.turnOrdinal, ref.stateId]),
    )
    const turnImageOrdinals = new Set(
      detail.images.flatMap((image) => (image.owner === 'turn' ? [image.turnOrdinal!] : [])),
    )
    const turnDocumentOrdinals = new Set(
      detail.documents.flatMap((document) =>
        document.owner === 'turn' ? [document.turnOrdinal!] : [],
      ),
    )
    const imagePositions = detail.images.map(
      (row) => `${row.owner}:${row.turnOrdinal ?? ''}:${row.position}`,
    )
    const documentPositions = detail.documents.map(
      (row) => `${row.owner}:${row.turnOrdinal ?? ''}:${row.position}`,
    )
    if (
      detail.draft.threadId !== detail.summary.id ||
      detail.turns.some((turn) => turn.threadId !== detail.summary.id) ||
      detail.images.some((image) => image.threadId !== detail.summary.id) ||
      detail.documents.some((document) => document.threadId !== detail.summary.id) ||
      detail.providerStateRefs.some((ref) => ref.threadId !== detail.summary.id) ||
      duplicate(detail.images.map((row) => row.imageId)) ||
      duplicate(detail.documents.map((row) => row.documentId)) ||
      duplicate(imagePositions) ||
      duplicate(documentPositions) ||
      detail.images.some((image) => image.owner === 'turn' && !ordinals.has(image.turnOrdinal!)) ||
      detail.documents.some(
        (document) => document.owner === 'turn' && !ordinals.has(document.turnOrdinal!),
      ) ||
      detail.providerStateRefs.some((ref) => !ordinals.has(ref.turnOrdinal)) ||
      detail.turns.some(
        (turn) => turn.providerStateId !== (providerByOrdinal.get(turn.ordinal) ?? null),
      ) ||
      detail.turns.some(
        (turn) =>
          (turn.userContent.length === 0 &&
            !turnImageOrdinals.has(turn.ordinal) &&
            !turnDocumentOrdinals.has(turn.ordinal)) ||
          (turn.error?.code === 'content_rejected' &&
            !turnImageOrdinals.has(turn.ordinal) &&
            !turnDocumentOrdinals.has(turn.ordinal)),
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

const threadSearchCandidateSchema = z
  .object({
    thread: threadRowSchema,
    draft: draftRowSchema,
    turns: z.array(turnRowSchema),
  })
  .strict()
  .superRefine((candidate, context) => {
    const messageIds = candidate.turns.flatMap((turn) => [
      turn.userMessageId,
      turn.assistantMessageId,
    ])
    if (
      candidate.draft.threadId !== candidate.thread.id ||
      candidate.turns.some(
        (turn, index) =>
          turn.threadId !== candidate.thread.id ||
          turn.ordinal !== index ||
          (turn.assistantStatus === 'pending' && index !== candidate.turns.length - 1),
      ) ||
      duplicate(messageIds)
    ) {
      context.addIssue({ code: 'custom', message: 'Thread Search candidate is inconsistent.' })
    }
  })

const threadSearchResultSchema = z
  .object({
    threadId: uuid,
    title: nonBlank,
    location: searchLocation,
    source: searchSource,
    snippet: z.string().refine((value) => Array.from(value).length <= 160),
    messageId: nonEmpty.nullable(),
  })
  .strict()
  .superRefine((result, context) => {
    if ((result.source === 'title') !== (result.messageId === null)) {
      context.addIssue({ code: 'custom', message: 'Thread Search result identity is invalid.' })
    }
  })

const draftMutationValueSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('committed'), detail: threadDetailSchema }).strict(),
  z
    .object({
      status: z.literal('conflict'),
      canonicalDraftRevision: z.number().int().nonnegative(),
    })
    .strict(),
])

const operationValueSchemas = {
  open: z.object({ schemaVersion: z.literal(1) }).strict(),
  close: z.object({ closed: z.literal(true) }).strict(),
  materialize: threadDetailSchema,
  readThread: threadDetailSchema.nullable(),
  snapshot: z
    .object({
      detail: threadDetailSchema.nullable(),
      includedThroughCursor: z.number().int().nonnegative(),
    })
    .strict(),
  listPage: z
    .object({
      rows: z.array(threadListRowSchema).max(50),
      nextCursor: z.string().max(1024).nullable(),
      includedThroughCursor: z.number().int().nonnegative(),
    })
    .strict(),
  search: z
    .object({
      results: z.array(threadSearchResultSchema).max(50),
      truncated: z.boolean(),
    })
    .strict()
    .superRefine((value, context) => {
      if (
        duplicate(value.results.map((result) => result.threadId)) ||
        (value.truncated && value.results.length !== 50)
      ) {
        context.addIssue({ code: 'custom', message: 'Thread Search result set is invalid.' })
      }
    }),
  importV5: z.object({ threadId: uuid, imported: z.boolean() }).strict(),
  saveDraft: draftMutationValueSchema,
  startTurn: draftMutationValueSchema,
  retryTurn: draftMutationValueSchema,
  bindTurnTarget: threadDetailSchema,
  settleTurn: threadDetailSchema,
  recoverPending: z.object({ recovered: z.number().int().nonnegative() }).strict(),
  setResourceAvailability: threadDetailSchema,
  repairProviderStateRef: threadDetailSchema,
  markSeen: threadDetailSchema,
  pinState: z
    .object({
      pinnedCount: z.number().int().nonnegative(),
      pinPosition,
      detail: threadDetailSchema,
    })
    .strict()
    .superRefine((state, context) => {
      if (
        state.detail.summary.location !== 'available' ||
        state.detail.summary.pinPosition !== state.pinPosition ||
        (state.pinPosition !== null && state.pinPosition > state.pinnedCount)
      ) {
        context.addIssue({ code: 'custom', message: 'Thread Pin state is inconsistent.' })
      }
    }),
  locationState: z
    .object({
      pinnedCount: z.number().int().nonnegative(),
      detail: threadDetailSchema,
    })
    .strict()
    .superRefine((state, context) => {
      const pinPosition = state.detail.summary.pinPosition
      if (pinPosition !== null && pinPosition > state.pinnedCount) {
        context.addIssue({ code: 'custom', message: 'Thread location state is inconsistent.' })
      }
    }),
  updatePin: threadDetailSchema,
  rename: threadDetailSchema,
  updateLocation: threadDetailSchema,
  discardEmptyShell: z.object({ discarded: z.boolean() }).strict(),
} as const

export type ThreadLibraryOperationValue = {
  [Operation in ThreadLibraryOperation]: z.infer<(typeof operationValueSchemas)[Operation]>
}
export type ThreadLibraryThreadDetail = ThreadLibraryOperationValue['materialize']
export type ThreadLibraryListRow = ThreadLibraryOperationValue['listPage']['rows'][number]
export type ThreadLibrarySearchCandidate = z.infer<typeof threadSearchCandidateSchema>

const acknowledgementClockSchema = z
  .object({
    generation: uuid,
    watermark: z.number().int().nonnegative(),
    actualMutation: z.boolean(),
  })
  .strict()

export type ThreadLibraryAcknowledgementClock = z.infer<typeof acknowledgementClockSchema>

export function parseThreadLibraryThreadIdentity(value: unknown) {
  return threadIdentitySchema.parse(value)
}

export function parseThreadLibraryListRow(value: unknown): ThreadLibraryListRow {
  return threadListRowSchema.parse(value)
}

export function parseThreadLibraryListOrderMetadata(value: unknown) {
  const metadata = threadListOrderIdentitySchema.parse(value)
  const usesActivityOrder =
    metadata.location === 'archived' ||
    (metadata.location === 'available' && metadata.pinPosition === null)
  const usesTrashOrder = metadata.location === 'trash'

  return {
    id: metadata.id,
    location: metadata.location,
    pinPosition: metadata.pinPosition,
    lastUserActivityAt: usesActivityOrder ? timestamp.parse(metadata.lastUserActivityAt) : '',
    createdAt: usesActivityOrder || usesTrashOrder ? timestamp.parse(metadata.createdAt) : '',
    updatedAt: usesTrashOrder ? timestamp.parse(metadata.updatedAt) : '',
  }
}

export function parseThreadLibrarySearchOrderMetadata(value: unknown) {
  const metadata = threadSearchOrderMetadataSchema.parse(value)
  return {
    id: metadata.id,
    location: metadata.location,
    lastUserActivityAt: metadata.lastUserActivityAt,
    createdAt: metadata.createdAt,
  }
}

export function parseThreadLibrarySearchCandidate(value: unknown): ThreadLibrarySearchCandidate {
  return threadSearchCandidateSchema.parse(value)
}

export function parseThreadLibraryThreadDetail(value: unknown): ThreadLibraryThreadDetail {
  return threadDetailSchema.parse(value)
}

export type ThreadLibraryReply<Operation extends ThreadLibraryOperation = ThreadLibraryOperation> =
  | {
      id: string
      ok: true
      value: ThreadLibraryOperationValue[Operation]
      clock: ThreadLibraryAcknowledgementClock
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
    input: parseThreadLibraryOperationInput(envelope.operation, envelope.input),
  } as ThreadLibraryRequest
}

export function parseThreadLibraryReply<Operation extends ThreadLibraryOperation>(
  operation: Operation,
  value: unknown,
): ThreadLibraryReply<Operation> {
  const envelope = z
    .discriminatedUnion('ok', [
      z
        .object({
          id: nonEmpty,
          ok: z.literal(true),
          value: z.unknown(),
          clock: acknowledgementClockSchema,
        })
        .strict(),
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

  const parsedValue = operationValueSchemas[operation].parse(envelope.value)

  if (
    (operation === 'listPage' || operation === 'snapshot') &&
    (parsedValue as ThreadLibraryOperationValue['listPage']).includedThroughCursor !==
      envelope.clock.watermark
  ) {
    throw new Error('Thread Library reply clock does not match its snapshot boundary.')
  }
  return { ...envelope, value: parsedValue } as ThreadLibraryReply<Operation>
}
