import { useCallback, useEffect, useState } from 'react'

import type { NyxProviderStatus } from '../../../shared/provider/types'

type ProviderStatusState =
  | { kind: 'loading' }
  | { kind: 'ready'; value: NyxProviderStatus }
  | { kind: 'failed'; message: string }

function toProviderStatusErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }

  return 'Nyx could not read the provider setup status.'
}

export function useProviderStatus() {
  const [status, setStatus] = useState<ProviderStatusState>({ kind: 'loading' })

  const refresh = useCallback(async () => {
    const provider = window.nyx?.provider

    if (!provider) {
      setStatus({
        kind: 'failed',
        message: 'Nyx desktop provider bridge is unavailable.',
      })
      return
    }

    setStatus({ kind: 'loading' })

    try {
      setStatus({
        kind: 'ready',
        value: await provider.getStatus(),
      })
    } catch (error) {
      setStatus({
        kind: 'failed',
        message: toProviderStatusErrorMessage(error),
      })
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return {
    status,
    refresh,
  }
}
