import type * as express from 'express'
import ReactDomServer from 'react-dom/server'
import { StaticRouterProvider, createStaticHandler, createStaticRouter } from 'react-router-dom'
import App from './App'
import { routes } from './app/routes'

export async function render(req: express.Request): Promise<{
  html: string
  status: number
}> {
  const fetchRequest = expressToFetch(req)

  const { query, dataRoutes } = createStaticHandler(routes)
  const routerContext = await query(fetchRequest)

  if (routerContext instanceof Response) throw routerContext

  const router = createStaticRouter(dataRoutes, routerContext)

  const html = ReactDomServer.renderToString(
    <App>
      <StaticRouterProvider router={router} context={routerContext} />
    </App>
  )

  // statusCode reflects loader-thrown Responses and unmatched-route 404s, so
  // the server returns the right HTTP status (not a blanket 200).
  return { html, status: routerContext.statusCode }
}

function expressToFetch(req: express.Request): Request {
  const origin = `${req.protocol}://${req.get('host')}`
  const url = new URL(req.originalUrl || req.url, origin)
  const controller = new AbortController()
  req.on('close', () => controller.abort())

  const headers = new Headers()
  for (const [key, values] of Object.entries(req.headers)) {
    if (!values) continue
    if (Array.isArray(values)) {
      for (const v of values) headers.append(key, v)
    } else {
      headers.set(key, values)
    }
  }

  const init: RequestInit = {
    method: req.method,
    headers,
    signal: controller.signal,
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') init.body = req.body

  return new Request(url.href, init)
}
