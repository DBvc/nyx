import type { ConnectionStatusState, ConnectionStatusTone } from '../connection-status'

interface ConnectionSetupNoticeProps {
  status: ConnectionStatusState
  onRefresh: () => void
  onOpenSettings: () => void
  compact?: boolean
}

function toneClass(tone: ConnectionStatusTone) {
  switch (tone) {
    case 'ready':
      return {
        section: 'border-nyx-success/35 bg-nyx-success-soft',
        title: 'text-nyx-success',
        body: 'text-nyx-success/80',
        dot: 'bg-nyx-success',
        button: 'border-nyx-success/40 text-nyx-success hover:bg-nyx-success/10',
      }
    case 'error':
      return {
        section: 'border-nyx-danger/35 bg-nyx-danger-soft',
        title: 'text-nyx-danger',
        body: 'text-nyx-danger/80',
        dot: 'bg-nyx-danger',
        button: 'border-nyx-danger/40 text-nyx-danger hover:bg-nyx-danger/10',
      }
    case 'warning':
      return {
        section: 'border-nyx-warning/35 bg-nyx-warning-soft',
        title: 'text-nyx-warning',
        body: 'text-nyx-warning/80',
        dot: 'bg-nyx-warning',
        button: 'border-nyx-warning/40 text-nyx-warning hover:bg-nyx-warning/10',
      }
  }
}

export function shouldShowConnectionNotice(status: ConnectionStatusState) {
  return status.kind !== 'ready' || !status.summary.configured
}

export function ConnectionSetupNotice({
  status,
  onRefresh,
  onOpenSettings,
  compact = false,
}: ConnectionSetupNoticeProps) {
  const padding = compact ? 'px-4 py-3' : 'px-4 py-4'

  if (status.kind === 'loading') {
    return (
      <section
        aria-live='polite'
        className={`rounded-xl border border-nyx-line bg-nyx-panel ${padding}`}
      >
        <div className='flex items-center gap-2 text-[13px] font-medium text-nyx-ink'>
          <span className='h-2 w-2 rounded-full bg-nyx-subtle' />
          Checking connection
        </div>
      </section>
    )
  }

  if (status.kind === 'failed') {
    return (
      <section
        aria-live='polite'
        className={`rounded-xl border border-nyx-danger/35 bg-nyx-danger-soft ${padding}`}
      >
        <div className='flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
          <div>
            <p className='text-[13px] font-semibold text-nyx-danger'>
              Connection status unavailable
            </p>
            <p className='mt-1 text-[12px] leading-5 text-nyx-danger/80'>{status.message}</p>
          </div>
          <button
            className='h-8 shrink-0 rounded-lg border border-nyx-danger/40 px-3 text-[12px] font-medium text-nyx-danger hover:bg-nyx-danger/10'
            onClick={onRefresh}
            type='button'
          >
            Retry
          </button>
        </div>
      </section>
    )
  }

  const tone = toneClass(status.summary.tone)

  return (
    <section aria-live='polite' className={`rounded-xl border ${tone.section} ${padding}`}>
      <div className='flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
        <div>
          <div className={`flex items-center gap-2 text-[13px] font-semibold ${tone.title}`}>
            <span className={`h-2 w-2 rounded-full ${tone.dot}`} />
            {status.summary.title}
          </div>
          <p className={`mt-1 text-[12px] leading-5 ${tone.body}`}>{status.summary.detail}</p>
        </div>
        {status.summary.configured ? null : (
          <button
            className={`h-8 shrink-0 rounded-md border px-3 text-[12px] font-medium ${tone.button}`}
            onClick={onOpenSettings}
            type='button'
          >
            Open Connections
          </button>
        )}
      </div>
    </section>
  )
}
