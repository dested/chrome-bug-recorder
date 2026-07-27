import { Link, isRouteErrorResponse, useRouteError } from 'react-router-dom'

// Root route ErrorBoundary. React Router renders this in place of the page
// when a loader/render throws OR when no route matches (a 404). The matching
// HTTP status is set server-side from `routerContext.statusCode`.
export function RouteErrorBoundary() {
  const error = useRouteError()
  const isNotFound = isRouteErrorResponse(error) && error.status === 404

  const title = isNotFound ? '404' : 'something went wrong'
  const message = isNotFound
    ? "this page doesn't exist"
    : isRouteErrorResponse(error)
      ? `${error.status} ${error.statusText}`
      : error instanceof Error
        ? error.message
        : 'an unexpected error occurred'

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6">
      <p className="font-mono text-7xl font-bold tracking-tight text-ink">{title}</p>
      <p className="text-sm text-muted">{message}</p>
      <Link
        to="/"
        className="mt-2 rounded-lg border border-line px-4 py-2 text-sm text-ink transition-colors hover:border-line-strong">
        back home
      </Link>
    </main>
  )
}
