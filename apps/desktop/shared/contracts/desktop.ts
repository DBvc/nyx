import type { NyxChatCancellationRequest, NyxChatRequest } from '../chat/types'
import type { NyxChatEventListener } from '../chat/events'
import type { NyxProviderStatus } from '../provider/types'

export interface NyxDesktopChatApi {
  startChat(request: NyxChatRequest): Promise<void>
  cancelChat(request: NyxChatCancellationRequest): Promise<void>
  subscribe(listener: NyxChatEventListener): () => void
}

export interface NyxDesktopProviderApi {
  getStatus(): Promise<NyxProviderStatus>
}

export interface NyxDesktopApi {
  platform: string
  versions: {
    electron: string
    chrome: string
    node: string
  }
  chat: NyxDesktopChatApi
  provider: NyxDesktopProviderApi
}
