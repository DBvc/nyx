/// <reference types="vite/client" />

import type { NyxDesktopApi } from '../shared/contracts/desktop'

declare global {
  interface Window {
    nyx?: NyxDesktopApi
  }
}

export {}
