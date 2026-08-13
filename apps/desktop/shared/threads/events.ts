import type { NyxThreadClock, NyxThreadDetail, NyxThreadSafeError } from './types'

export type NyxThreadEvent =
  | (NyxThreadClock & { type: 'threads:epoch-changed' })
  | (NyxThreadClock & { type: 'threads:changed'; detail: NyxThreadDetail })
  | (NyxThreadClock & { type: 'threads:removed'; threadId: string })
  | (NyxThreadClock & { type: 'threads:library-unavailable'; error: NyxThreadSafeError })
  | (NyxThreadClock & {
      type: 'threads:thread-unavailable'
      threadId: string
      error: NyxThreadSafeError
    })

export type NyxThreadEventListener = (event: NyxThreadEvent) => void
