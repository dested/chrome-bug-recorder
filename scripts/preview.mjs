import { createReadStream, existsSync, copyFileSync, readdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, resolve } from 'node:path';

/**
 * Serves the built panel with the chrome APIs stubbed, so its layout can be looked
 * at without loading the extension. This is the only way to see the side panel at
 * a width other than whatever Chrome happens to give it — the complaint that
 * produced the 0.6 restyle was "small and clunky" at ~1200px, and there was no way
 * to check that before shipping.
 *
 *   npm run build && npm run preview
 *   http://localhost:8777/gallery.html?w=380,560,900&mode=rec
 *
 * `mode` is rec | notes | empty | nofolder. `w` is a comma-separated list of CSS
 * widths, each rendered in its own iframe so the panel's media queries see it.
 * Zero dependencies, like everything else here.
 */

const DIST = resolve(import.meta.dirname, '..', 'dist');
const PAGES = resolve(import.meta.dirname, 'preview');
const PORT = Number(process.env.PORT) || 8777;

const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
};

if (!existsSync(join(DIST, 'sidepanel.js'))) {
  console.error('dist/sidepanel.js is missing — run `npm run build` first.');
  process.exit(1);
}

// dist/ is wiped by every build, so the harness pages are copied in on each run.
for (const page of readdirSync(PAGES)) copyFileSync(join(PAGES, page), join(DIST, page));

createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = join(DIST, path === '/' ? 'gallery.html' : path);
  if (!file.startsWith(DIST) || !existsSync(file)) {
    res.writeHead(404).end('not found');
    return;
  }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
}).listen(PORT, () => {
  console.log(`panel preview → http://localhost:${PORT}/gallery.html?w=380,560,900&mode=rec`);
});
