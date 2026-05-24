import { createHashRouter } from 'react-router-dom'

import { App } from './ui/App'

export const router = createHashRouter([
  {
    path: '/',
    element: <App />,
  },
])
