export const nyxChatRoles = ['system', 'user', 'assistant'] as const

export type NyxChatRole = (typeof nyxChatRoles)[number]

export const nyxChatMessageStatuses = [
  'pending',
  'streaming',
  'completed',
  'cancelled',
  'failed',
] as const

export type NyxChatMessageStatus = (typeof nyxChatMessageStatuses)[number]

export const nyxChatRunStatuses = [
  'idle',
  'submitting',
  'streaming',
  'completed',
  'cancelled',
  'failed',
] as const

export type NyxChatRunStatus = (typeof nyxChatRunStatuses)[number]

export const nyxChatTurnIntents = ['new_user_message', 'retry_failed_response'] as const

export type NyxChatTurnIntent = (typeof nyxChatTurnIntents)[number]

const nyxChatTurnIntentSet = new Set<string>(nyxChatTurnIntents)

export function isNyxChatTurnIntent(value: unknown): value is NyxChatTurnIntent {
  return typeof value === 'string' && nyxChatTurnIntentSet.has(value)
}

export const nyxChatErrorCodes = [
  'config_missing',
  'invalid_request',
  'content_rejected',
  'target_unavailable',
  'auth_failed',
  'network_error',
  'rate_limited',
  'upstream_error',
  'cancelled',
  'unknown',
] as const

export type NyxChatErrorCode = (typeof nyxChatErrorCodes)[number]

export const nyxChatContentRejectedMessage = 'The selected target rejected this image request.'
export const nyxChatAttachmentContentRejectedMessage =
  'The selected target rejected this attachment request.'

export interface NyxChatError {
  code: NyxChatErrorCode
  message: string
  retryable: boolean
  details?: string
}

export interface NyxChatInputMessage {
  role: NyxChatRole
  content: string
}

export const nyxChatImageMediaTypes = ['image/png', 'image/jpeg'] as const

export type NyxChatImageMediaType = (typeof nyxChatImageMediaTypes)[number]

export interface NyxChatImageRef {
  imageId: string
  mediaType: NyxChatImageMediaType
  width: number
  height: number
}

export interface NyxChatNewImage {
  imageId: string
  canonicalBytes: Uint8Array
  previewBytes: Uint8Array
}

export interface NyxChatMessageImage extends NyxChatImageRef {
  available: boolean
}

export const nyxChatDocumentMediaTypes = [
  'application/pdf',
  'text/plain',
  'text/markdown',
  'text/csv',
] as const

export type NyxChatDocumentMediaType = (typeof nyxChatDocumentMediaTypes)[number]

export interface NyxChatDocumentRef {
  documentId: string
  name: string
  mediaType: NyxChatDocumentMediaType
  byteLength: number
  extractedByteLength: number
}

export interface NyxChatNewDocument {
  documentId: string
  sourceBytes: Uint8Array
  extractedTextBytes: Uint8Array
  extractedFromSha256: string
}

export interface NyxChatMessageDocument extends NyxChatDocumentRef {
  available: boolean
}

export interface NyxChatTurnUserMessage {
  id: string
  content: string
  imageRefs?: ReadonlyArray<NyxChatImageRef>
  documentRefs?: ReadonlyArray<NyxChatDocumentRef>
}

export type NyxChatTargetSelection =
  | {
      kind: 'connection'
      providerId: string
      modelId: string
    }
  | {
      kind: 'env_fallback'
    }

export type NyxChatTargetAttribution =
  | {
      kind: 'connection'
      providerId: string
      providerDisplayName: string
      modelId: string
      modelDisplayName: string
    }
  | {
      kind: 'env_fallback'
      modelId: string
    }

export interface NyxChatMessage {
  id: string
  role: NyxChatRole
  content: string
  status: NyxChatMessageStatus
  images?: ReadonlyArray<NyxChatMessageImage>
  documents?: ReadonlyArray<NyxChatMessageDocument>
  error?: NyxChatError
  canRetry?: boolean
  targetAttribution?: NyxChatTargetAttribution
}

export interface NyxChatRequest {
  requestId: string
  userMessageId: string
  assistantMessageId: string
  turnIntent: NyxChatTurnIntent
  turnUserMessage: NyxChatTurnUserMessage
  messages: ReadonlyArray<NyxChatInputMessage>
  targetSelection: NyxChatTargetSelection
  newImages?: ReadonlyArray<NyxChatNewImage>
  newDocuments?: ReadonlyArray<NyxChatNewDocument>
  systemPrompt?: string
}

export interface NyxChatCancellationRequest {
  requestId: string
}
