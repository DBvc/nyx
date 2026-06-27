import type { RefObject, UIEventHandler } from 'react'
import type { ComponentProps } from 'react'

import type { NyxChatMessage } from '../../../../shared/chat/types'
import { ChatEmptyState } from './ChatEmptyState'
import { ChatMessage } from './ChatMessage'
import { ProviderSetupNotice, shouldShowProviderNotice } from './ProviderSetupNotice'

interface ChatThreadProps {
  messages: ReadonlyArray<NyxChatMessage>
  containerRef: RefObject<HTMLDivElement | null>
  onScroll: UIEventHandler<HTMLDivElement>
  onRetry: (messageId: string) => void
  providerStatus: ComponentProps<typeof ProviderSetupNotice>['status']
  onRefreshProviderStatus: () => void
}

export function ChatThread({
  messages,
  containerRef,
  onScroll,
  onRetry,
  providerStatus,
  onRefreshProviderStatus,
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
            onRefreshProviderStatus={onRefreshProviderStatus}
            providerStatus={providerStatus}
          />
        ) : (
          <>
            {shouldShowProviderNotice(providerStatus) ? (
              <ProviderSetupNotice
                compact
                onRefresh={onRefreshProviderStatus}
                status={providerStatus}
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
