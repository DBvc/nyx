import { useCallback, useEffect, useState } from 'react'

import { connectionStatusErrorMessage, summarizeConnectionsOverview } from './connection-status'
import type { ConnectionStatusState } from './connection-status'

export function useConnectionStatus() {
  const [status, setStatus] = useState<ConnectionStatusState>({ kind: 'loading' })

  const refresh = useCallback(async () => {
    const desktopApi = window.nyx

    if (!desktopApi?.connections) {
      setStatus({
        kind: 'failed',
        message: 'Nyx desktop connections bridge is unavailable.',
      })
      return
    }

    setStatus({ kind: 'loading' })

    try {
      const overviewResult = await desktopApi.connections.getOverview()

      if (!overviewResult.ok) {
        setStatus({
          kind: 'failed',
          message: overviewResult.error.message,
        })
        return
      }

      const envStatus =
        overviewResult.value.defaultTargetSource === 'env_fallback' && desktopApi.provider
          ? await desktopApi.provider.getStatus()
          : null

      setStatus({
        kind: 'ready',
        overview: overviewResult.value,
        summary: summarizeConnectionsOverview(overviewResult.value, envStatus),
      })
    } catch (error) {
      setStatus({
        kind: 'failed',
        message: connectionStatusErrorMessage(error),
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
