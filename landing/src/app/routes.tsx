import type { RouteObject } from 'react-router-dom'
import { RouteErrorBoundary } from './error-boundary'
import { HomePage } from './home'

export const routes: RouteObject[] = [
  {
    id: 'root',
    path: '/',
    ErrorBoundary: RouteErrorBoundary,
    children: [{ index: true, Component: HomePage }],
  },
]
