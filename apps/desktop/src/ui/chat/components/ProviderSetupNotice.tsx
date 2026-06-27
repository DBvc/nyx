import type { NyxProviderMissingEnv, NyxProviderStatus } from '../../../../shared/provider/types'

type ProviderStatusState =
  | { kind: 'loading' }
  | { kind: 'ready'; value: NyxProviderStatus }
  | { kind: 'failed'; message: string }

interface ProviderSetupNoticeProps {
  status: ProviderStatusState
  onRefresh: () => void
  compact?: boolean
}

const REQUIRED_ENV_NAMES = [
  'NYX_API_BASE_URL',
  'NYX_API_TOKEN',
] as const satisfies ReadonlyArray<NyxProviderMissingEnv>

function missingEnvNames(status: NyxProviderStatus): NyxProviderMissingEnv[] {
  const missing = new Set<NyxProviderMissingEnv>(status.missingEnv)

  if (!status.configured && status.baseUrlHost === null) {
    missing.add('NYX_API_BASE_URL')
  }

  return REQUIRED_ENV_NAMES.filter((name) => missing.has(name))
}

function EnvPill({ children }: { children: string }) {
  return (
    <span className='rounded-md border border-nyx-line bg-white px-2 py-1 font-mono text-[11px] text-nyx-ink'>
      {children}
    </span>
  )
}

export function shouldShowProviderNotice(status: ProviderStatusState) {
  return status.kind !== 'ready' || !status.value.configured
}

export function ProviderSetupNotice({
  status,
  onRefresh,
  compact = false,
}: ProviderSetupNoticeProps) {
  const padding = compact ? 'px-4 py-3' : 'px-4 py-4'

  if (status.kind === 'loading') {
    return (
      <section
        aria-live='polite'
        className={`rounded-xl border border-nyx-line-soft bg-nyx-panel/70 ${padding}`}
      >
        <div className='flex items-center gap-2 text-[13px] font-medium text-nyx-ink'>
          <span className='h-2 w-2 rounded-full bg-nyx-subtle' />
          Checking provider setup
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
            <p className='text-[13px] font-semibold text-red-950'>Provider status unavailable</p>
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

  if (status.value.configured) {
    return (
      <section
        aria-live='polite'
        className={`rounded-xl border border-emerald-200 bg-emerald-50 ${padding}`}
      >
        <div className='flex items-center gap-2 text-[13px] font-medium text-emerald-950'>
          <span className='h-2 w-2 rounded-full bg-emerald-600' />
          Provider ready
        </div>
        <p className='mt-1 text-[12px] leading-5 text-emerald-900/75'>
          {status.value.baseUrlHost ? `Connected to ${status.value.baseUrlHost}` : 'Configured'}
          {status.value.model ? ` · ${status.value.model}` : ''}
        </p>
      </section>
    )
  }

  const missing = missingEnvNames(status.value)

  return (
    <section
      aria-live='polite'
      className={`rounded-xl border border-amber-200 bg-amber-50 ${padding}`}
    >
      <div className='flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
        <div>
          <p className='text-[13px] font-semibold text-amber-950'>Provider setup needed</p>
          <p className='mt-1 text-[12px] leading-5 text-amber-900/75'>
            Add the required environment names before starting a chat.
          </p>
          <div className='mt-3 flex flex-wrap gap-2'>
            {missing.map((name) => (
              <EnvPill key={name}>{name}</EnvPill>
            ))}
            <EnvPill>NYX_MODEL optional</EnvPill>
          </div>
        </div>
        <button
          className='h-8 shrink-0 rounded-md border border-amber-200 bg-white px-3 text-[12px] font-medium text-amber-950 hover:bg-amber-50'
          onClick={onRefresh}
          type='button'
        >
          Recheck
        </button>
      </div>
    </section>
  )
}
