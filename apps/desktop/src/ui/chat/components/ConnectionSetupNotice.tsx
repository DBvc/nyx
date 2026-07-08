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
        section: 'border-emerald-200 bg-emerald-50',
        title: 'text-emerald-950',
        body: 'text-emerald-900/75',
        dot: 'bg-emerald-600',
        button: 'border-emerald-200 bg-white text-emerald-950 hover:bg-emerald-50',
      }
    case 'error':
      return {
        section: 'border-red-200 bg-red-50',
        title: 'text-red-950',
        body: 'text-red-900/70',
        dot: 'bg-red-600',
        button: 'border-red-200 bg-white text-red-950 hover:bg-red-50',
      }
    case 'warning':
      return {
        section: 'border-amber-200 bg-amber-50',
        title: 'text-amber-950',
        body: 'text-amber-900/75',
        dot: 'bg-amber-500',
        button: 'border-amber-200 bg-white text-amber-950 hover:bg-amber-50',
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
        className={`rounded-xl border border-nyx-line-soft bg-nyx-panel/70 ${padding}`}
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
        className={`rounded-xl border border-red-200 bg-red-50 ${padding}`}
      >
        <div className='flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
          <div>
            <p className='text-[13px] font-semibold text-red-950'>Connection status unavailable</p>
            <p className='mt-1 text-[12px] leading-5 text-red-900/70'>{status.message}</p>
          </div>
          <button
            className='h-8 shrink-0 rounded-md border border-red-200 bg-white px-3 text-[12px] font-medium text-red-950 hover:bg-red-50'
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
