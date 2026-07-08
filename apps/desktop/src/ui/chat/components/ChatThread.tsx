import type { RefObject, UIEventHandler } from 'react'
import type { ComponentProps } from 'react'

import type { NyxChatMessage } from '../../../../shared/chat/types'
import { ChatEmptyState } from './ChatEmptyState'
import { ChatMessage } from './ChatMessage'
import { ConnectionSetupNotice, shouldShowConnectionNotice } from './ConnectionSetupNotice'

interface ChatThreadProps {
  messages: ReadonlyArray<NyxChatMessage>
  containerRef: RefObject<HTMLDivElement | null>
  onScroll: UIEventHandler<HTMLDivElement>
  onRetry: (messageId: string) => void
  connectionStatus: ComponentProps<typeof ConnectionSetupNotice>['status']
  onOpenConnectionsSettings: () => void
  onRefreshConnectionStatus: () => void
}

export function ChatThread({
  messages,
  containerRef,
  onScroll,
  onRetry,
  connectionStatus,
  onOpenConnectionsSettings,
  onRefreshConnectionStatus,
}: ChatThreadProps) {
  const hasMessages = messages.length > 0

  return (
    <div
      className={`min-h-0 flex-1 ${hasMessages ? 'overflow-y-auto' : 'overflow-hidden'}`}
      onScroll={onScroll}
      ref={containerRef}
    >
      <div
        className={`mx-auto flex min-h-full w-full flex-col px-5 ${
          hasMessages ? 'max-w-[44rem] gap-7 py-7' : 'max-w-[37.5rem] justify-center pb-28'
        }`}
      >
        {!hasMessages ? (
          <ChatEmptyState
            connectionStatus={connectionStatus}
            onOpenConnectionsSettings={onOpenConnectionsSettings}
            onRefreshConnectionStatus={onRefreshConnectionStatus}
          />
        ) : (
          <>
            {shouldShowConnectionNotice(connectionStatus) ? (
              <ConnectionSetupNotice
                compact
                onOpenSettings={onOpenConnectionsSettings}
                onRefresh={onRefreshConnectionStatus}
                status={connectionStatus}
              />
            ) : null}
            {messages.map((message) => (
              <ChatMessage key={message.id} message={message} onRetry={onRetry} />
            ))}
          </>
        )}
      </div>
    </div>
  )
}
