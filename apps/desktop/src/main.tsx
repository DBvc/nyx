import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'

import { router } from './router'
import './styles/index.css'

if (navigator.platform.startsWith('Mac') && navigator.userAgent.includes('Electron')) {
  document.documentElement.classList.add('macos-window-shell')
}

const root = document.getElementById('root')

if (!root) {
  throw new Error('Failed to find the root element.')
}

createRoot(root).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
