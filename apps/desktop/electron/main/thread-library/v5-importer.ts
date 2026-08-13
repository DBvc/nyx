import type { NyxChatTargetSelection } from '../../../shared/chat/types'
import { readResponsesVisibleText } from '../chat/provider-stream'
import {
  createCurrentThreadFileAdapter,
  type CurrentThreadFileAdapter,
} from '../current-thread/file-adapter'
import type { CurrentThreadDocumentFiles } from '../current-thread/document-files'
import type { CurrentThreadImageFiles } from '../current-thread/image-files'
import type { CurrentThreadProviderStateFiles } from '../current-thread/provider-state-files'
import {
  createInterruptedThreadErrorRecord,
  parseCurrentThreadRecord,
  type CurrentThreadRecord,
} from '../current-thread/schemas'
import { importedV5RowsSchema, type ImportedV5Rows } from './protocol'

export type V5ImportErrorCode = 'io_error' | 'malformed_json' | 'schema_invalid'

export class V5ImportError extends Error {
  constructor(
    readonly code: V5ImportErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'V5ImportError'
  }
}

export interface ReadV5ImportOptions {
  filePath: string
  images: CurrentThreadImageFiles
  documents: CurrentThreadDocumentFiles
  providerStates: CurrentThreadProviderStateFiles
  fileAdapter?: CurrentThreadFileAdapter
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}

async function readRecord(filePath: string, fileAdapter: CurrentThreadFileAdapter) {
  let raw: string

  try {
    raw = await fileAdapter.readText(filePath)
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return null
    }
    throw new V5ImportError('io_error', 'Could not read the previous current thread.')
  }

  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    throw new V5ImportError('malformed_json', 'The previous current thread is not valid JSON.')
  }

  try {
    return parseCurrentThreadRecord(value)
  } catch {
    throw new V5ImportError('schema_invalid', 'The previous current thread is invalid.')
  }
}

function recoverPending(record: CurrentThreadRecord) {
  const pendingIndex = record.turns.findIndex((turn) => turn.assistantStatus === 'pending')

  if (pendingIndex < 0) {
    return record
  }

  return parseCurrentThreadRecord({
    ...record,
    turns: record.turns.map((turn, index) =>
      index === pendingIndex
        ? {
            ...turn,
            assistantStatus: 'failed',
            error: createInterruptedThreadErrorRecord(),
            providerStateRef: null,
          }
        : turn,
    ),
  })
}

function normalizeTitle(text: string) {
  const normalized = text.trim().replace(/\s+/gu, ' ')
  const codePoints = Array.from(normalized)

  if (codePoints.length <= 48) {
    return normalized
  }

  return `${codePoints.slice(0, 45).join('').trimEnd()}...`
}

function formatLocalSecond(timestamp: string) {
  const value = new Date(timestamp)
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`
}

function importedTitle(record: CurrentThreadRecord) {
  const firstVisibleTurn = record.turns.find(
    (turn) =>
      turn.userContent.trim().length > 0 ||
      turn.documentRefs.length > 0 ||
      turn.imageRefs.length > 0,
  )
  const title = normalizeTitle(firstVisibleTurn?.userContent ?? '')
  if (title || firstVisibleTurn?.documentRefs[0]) {
    return {
      title: title || firstVisibleTurn!.documentRefs[0]!.name,
      fallbackLocalSecond: null,
      fallbackOrdinal: null,
    }
  }

  const fallbackLocalSecond = formatLocalSecond(record.createdAt)
  const kind = firstVisibleTurn?.imageRefs.length ? 'Image' : 'Untitled draft'
  return {
    title: `${kind} · ${fallbackLocalSecond.replace('T', ' ')}`,
    fallbackLocalSecond,
    fallbackOrdinal: 1,
  }
}

function latestTargetSelection(record: CurrentThreadRecord): NyxChatTargetSelection {
  return record.turns.at(-1)!.targetBinding.selection
}

export async function readV5Import({
  filePath,
  images,
  documents,
  providerStates,
  fileAdapter = createCurrentThreadFileAdapter(),
}: ReadV5ImportOptions): Promise<ImportedV5Rows | null> {
  const stored = await readRecord(filePath, fileAdapter)
  if (!stored) {
    return null
  }

  const record = recoverPending(stored)
  const title = importedTitle(record)
  const imageRows: ImportedV5Rows['images'] = []
  const documentRows: ImportedV5Rows['documents'] = []
  const providerStateRows: ImportedV5Rows['providerStateRefs'] = []
  const turns: ImportedV5Rows['turns'] = []

  for (const [turnOrdinal, turn] of record.turns.entries()) {
    for (const [position, ref] of turn.imageRefs.entries()) {
      let available = true
      try {
        await images.assertAvailable([ref])
      } catch {
        available = false
      }

      imageRows.push({
        threadId: record.threadId,
        turnOrdinal,
        position,
        available,
        ...ref,
      })
    }

    for (const [position, ref] of turn.documentRefs.entries()) {
      let extractedText: string | null = null
      try {
        extractedText = await documents.readExtractedText(ref)
      } catch {
        // A broken legacy resource stays visible as unavailable metadata.
      }

      documentRows.push({
        threadId: record.threadId,
        turnOrdinal,
        position,
        available: extractedText !== null,
        extractedText,
        ...ref,
      })
    }

    let providerStateId: string | null = null
    if (turn.providerStateRef) {
      try {
        const state = await providerStates.read(turn.providerStateRef)
        if (readResponsesVisibleText(state.outputItems) !== turn.assistantContent) {
          throw new Error('Provider continuation does not match visible text.')
        }
        providerStateId = turn.providerStateRef.stateId
        providerStateRows.push({
          threadId: record.threadId,
          turnOrdinal,
          ...turn.providerStateRef,
        })
      } catch {
        // Visible assistant text survives; the unsafe continuation reference does not.
      }
    }

    turns.push({
      threadId: record.threadId,
      ordinal: turnOrdinal,
      attemptRequestId: turn.attemptRequestId,
      userMessageId: turn.userMessageId,
      assistantMessageId: turn.assistantMessageId,
      userContent: turn.userContent,
      assistantContent: turn.assistantContent,
      assistantStatus: turn.assistantStatus,
      error: turn.error,
      targetSelection: turn.targetBinding.selection,
      targetAttribution: turn.targetBinding.attribution,
      providerStateId,
      createdAt: turn.createdAt,
      updatedAt: turn.updatedAt,
    })
  }

  return importedV5RowsSchema.parse({
    thread: {
      id: record.threadId,
      location: 'available',
      trashedFromLocation: null,
      trashedPinPosition: null,
      pinPosition: null,
      title: title.title,
      titleSource: 'auto',
      fallbackLocalSecond: title.fallbackLocalSecond,
      fallbackOrdinal: title.fallbackOrdinal,
      threadRevision: 1,
      lastUserActivityAt: record.turns.at(-1)!.createdAt,
      resultRevision: 0,
      seenResultRevision: 0,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    },
    draft: {
      threadId: record.threadId,
      draftRevision: 1,
      text: '',
      targetSelection: latestTargetSelection(record),
      updatedAt: record.updatedAt,
    },
    turns,
    images: imageRows,
    documents: documentRows,
    providerStateRefs: providerStateRows,
  })
}
