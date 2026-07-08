import type { ComponentProps } from 'react'

import { ConnectionSetupNotice } from './ConnectionSetupNotice'

interface ChatEmptyStateProps {
  connectionStatus: ComponentProps<typeof ConnectionSetupNotice>['status']
  onOpenConnectionsSettings: () => void
  onRefreshConnectionStatus: () => void
}

export function ChatEmptyState({
  connectionStatus,
  onOpenConnectionsSettings,
  onRefreshConnectionStatus,
}: ChatEmptyStateProps) {
  const isConnectionReady = connectionStatus.kind === 'ready' && connectionStatus.summary.configured

  return (
    <section className='space-y-5'>
      <div>
        <p className='text-[12px] font-medium text-nyx-subtle'>
          {isConnectionReady ? 'Ready' : 'Setup'}
        </p>
        <h2 className='mt-2 text-[22px] font-semibold text-nyx-ink'>
          {isConnectionReady ? 'What can I help with?' : 'Finish connection setup'}
        </h2>
      </div>
      <ConnectionSetupNotice
        onOpenSettings={onOpenConnectionsSettings}
        onRefresh={onRefreshConnectionStatus}
        status={connectionStatus}
      />
    </section>
  )
}
