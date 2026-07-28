import express from 'express'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { formatError, log, requestLogger, startupBanner } from './server/logger'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isProd = process.env.NODE_ENV === 'production'
const PORT = Number(process.env.PORT ?? 3000)

const resolve = (p: string) => path.resolve(__dirname, p)

// Requests with a file extension that reach the SSR catch-all are misses
// (favicon.ico, source maps, stray .png). Render the SPA only for extension-less
// paths so these 404 fast instead of returning a full HTML doc with status 200.
const LOOKS_LIKE_FILE = /\.[a-zA-Z0-9]+$/

async function createServer() {
  const app = express()
  app.disable('x-powered-by')

  // One tidy log line per request (status + timing), asset noise filtered out.
  app.use(requestLogger(isProd))

  // Liveness/readiness probe. No database behind this site — a 200 means up.
  app.get('/healthz', (_req, res) => {
    res.json({ status: 'ok', uptime: process.uptime() })
  })

  let vite: Awaited<ReturnType<typeof import('vite').createServer>> | undefined

  if (!isProd) {
    vite = await (
      await import('vite')
    ).createServer({
      root: __dirname,
      // Explicit HMR port — without it vite logs "Port undefined is already in
      // use" in middleware mode.
      server: { middlewareMode: true, hmr: { port: 24678 } },
      appType: 'custom',
    })
    app.use(vite.middlewares)
  } else {
    app.use(
      (await import('compression')).default(),
      express.static(resolve('./dist/client'), { index: false })
    )
  }

  const indexProd = isProd ? fs.readFileSync(resolve('./dist/client/index.html'), 'utf-8') : ''

  app.use(async (req, res) => {
    // GET and HEAD on extension-less paths are SSR navigations; express strips
    // the body from a HEAD response, and unfurlers/uptime checks use it.
    const navigational = req.method === 'GET' || req.method === 'HEAD'
    if (!navigational || LOOKS_LIKE_FILE.test(req.path)) {
      res.status(404).type('txt').end('Not found')
      return
    }
    try {
      let template: string
      let render: typeof import('./src/entry-server').render

      if (!isProd && vite) {
        template = fs.readFileSync(resolve('./index.html'), 'utf-8')
        template = await vite.transformIndexHtml(req.originalUrl, template)
        render = (await vite.ssrLoadModule('/src/entry-server.tsx')).render
      } else {
        template = indexProd
        // @ts-ignore — produced by `vite build --ssr`; may not exist before first build
        render = (await import('./dist/server/entry-server.js')).render
      }

      const { html: appHtml, status } = await render(req)

      const html = template.replace('<!--app-html-->', appHtml)

      res.status(status).set({ 'Content-Type': 'text/html' }).end(html)
    } catch (e: unknown) {
      if (e instanceof Response) {
        const location = e.headers.get('location')
        if (location) {
          res.redirect(e.status, location)
        } else {
          const body = await e.text()
          res.status(e.status).end(body)
        }
        return
      }
      if (!isProd && vite) vite.ssrFixStacktrace(e as Error)
      log.error(`SSR render failed for ${req.method} ${req.originalUrl}`)
      console.error(formatError(e))
      res
        .status(500)
        .type('txt')
        .end(isProd ? 'Internal Server Error' : formatError(e))
    }
  })

  app.listen(PORT, () => {
    startupBanner({ port: PORT, isProd, routes: ['/', '/healthz'] })
  })
}

createServer().catch((e) => {
  log.error('failed to start server')
  console.error(formatError(e))
  process.exit(1)
})
