import type { ConnectionStatusState, ConnectionStatusTone } from '../connection-status'

function dotClass(tone: ConnectionStatusTone | 'loading') {
  switch (tone) {
    case 'ready':
      return 'bg-nyx-success'
    case 'warning':
      return 'bg-nyx-warning'
    case 'error':
      return 'bg-nyx-danger'
    case 'loading':
      return 'bg-nyx-subtle'
  }
}

function label(status: ConnectionStatusState) {
  if (status.kind === 'loading') {
    return 'Connection'
  }

  if (status.kind === 'failed') {
    return 'Connection unavailable'
  }

  switch (status.summary.source) {
    case 'persisted_default':
      return status.summary.configured ? 'Saved provider' : 'Saved provider needs setup'
    case 'env_fallback':
      return 'Env fallback'
    case 'missing':
      return 'No connection'
  }
}

export function ConnectionStatusPill({ status }: { status: ConnectionStatusState }) {
  const tone =
    status.kind === 'ready' ? status.summary.tone : status.kind === 'failed' ? 'error' : 'loading'

  return (
    <div
      aria-live='polite'
      className='flex max-w-[18rem] items-center gap-1.5 rounded-full border border-nyx-line bg-nyx-panel px-2.5 py-1 text-xs text-nyx-muted'
      title={status.kind === 'ready' ? status.summary.detail : undefined}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotClass(tone)}`} />
      <span className='truncate'>{label(status)}</span>
    </div>
  )
}
