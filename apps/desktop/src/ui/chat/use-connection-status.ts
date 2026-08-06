import { useCallback, useEffect, useRef, useState } from 'react'

import { connectionStatusErrorMessage, summarizeConnectionsOverview } from './connection-status'
import type { ConnectionStatusState } from './connection-status'

export function useConnectionStatus() {
  const requestEpoch = useRef(0)
  const [status, setStatus] = useState<ConnectionStatusState>({
    kind: 'loading',
    requestEpoch: 0,
    overview: null,
  })

  const refresh = useCallback(async () => {
    const currentRequestEpoch = requestEpoch.current + 1
    requestEpoch.current = currentRequestEpoch
    const desktopApi = window.nyx

    setStatus((previous) => ({
      kind: 'loading',
      requestEpoch: currentRequestEpoch,
      overview: previous.overview,
    }))

    if (!desktopApi?.connections) {
      if (requestEpoch.current === currentRequestEpoch) {
        setStatus((previous) => ({
          kind: 'failed',
          requestEpoch: currentRequestEpoch,
          overview: previous.overview,
          message: 'Nyx desktop connections bridge is unavailable.',
        }))
      }
      return
    }

    try {
      const overviewResult = await desktopApi.connections.getOverview()

      if (requestEpoch.current !== currentRequestEpoch) {
        return
      }

      if (!overviewResult.ok) {
        setStatus((previous) => ({
          kind: 'failed',
          requestEpoch: currentRequestEpoch,
          overview: previous.overview,
          message: overviewResult.error.message,
        }))
        return
      }

      const envStatus =
        overviewResult.value.defaultTargetSource === 'env_fallback' && desktopApi.provider
          ? await desktopApi.provider.getStatus().catch(() => null)
          : null

      if (requestEpoch.current !== currentRequestEpoch) {
        return
      }

      setStatus({
        kind: 'ready',
        requestEpoch: currentRequestEpoch,
        overview: overviewResult.value,
        summary: summarizeConnectionsOverview(overviewResult.value, envStatus),
      })
    } catch (error) {
      if (requestEpoch.current === currentRequestEpoch) {
        setStatus((previous) => ({
          kind: 'failed',
          requestEpoch: currentRequestEpoch,
          overview: previous.overview,
          message: connectionStatusErrorMessage(error),
        }))
      }
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const getLatestRequestEpoch = useCallback(() => requestEpoch.current, [])

  return {
    status,
    refresh,
    getLatestRequestEpoch,
  }
}
