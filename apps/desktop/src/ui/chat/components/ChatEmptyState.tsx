import type { ComponentProps } from 'react'

import { ProviderSetupNotice } from './ProviderSetupNotice'

interface ChatEmptyStateProps {
  providerStatus: ComponentProps<typeof ProviderSetupNotice>['status']
  onRefreshProviderStatus: () => void
}

export function ChatEmptyState({ providerStatus, onRefreshProviderStatus }: ChatEmptyStateProps) {
  const isProviderReady = providerStatus.kind === 'ready' && providerStatus.value.configured

  return (
    <section className='space-y-5'>
      <div>
        <p className='text-[12px] font-medium text-nyx-subtle'>
          {isProviderReady ? 'Ready' : 'Setup'}
        </p>
        <h2 className='mt-2 text-[22px] font-semibold text-nyx-ink'>
          {isProviderReady ? 'What can I help with?' : 'Finish provider setup'}
        </h2>
      </div>
      <ProviderSetupNotice status={providerStatus} onRefresh={onRefreshProviderStatus} />
    </section>
  )
}
