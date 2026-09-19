import http from 'node:http';
import https from 'node:https';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const assets = new Map([
  ['/', ['index.html', 'text/html']],
  ['/index.html', ['index.html', 'text/html']],
  ['/src/app.js', ['src/app.js', 'text/javascript']],
  ['/src/scene.js', ['src/scene.js', 'text/javascript']],
  ['/src/state.js', ['src/state.js', 'text/javascript']],
  ['/src/navigation.js', ['src/navigation.js', 'text/javascript']],
  ['/src/config.js', ['src/config.js', 'text/javascript']],
  ['/src/style.css', ['src/style.css', 'text/css']]
]);
export function createServer({ backendUrl = 'http://localhost:4000', root = new URL('./dist/', import.meta.url) } = {}) {
  const backend = new URL(backendUrl);
  if (!['http:', 'https:'].includes(backend.protocol)) throw new Error('BACKEND_URL must be HTTP(S).');
  return http.createServer(async (request, response) => {
    if (request.method !== 'GET') { response.writeHead(405); response.end('Only GET is supported.'); return; }
    if (request.url.startsWith('/api/')) {
      const transport = backend.protocol === 'https:' ? https : http;
      const upstream = transport.request(new URL(request.url, backend), { method: 'GET' }, incoming => {
        response.writeHead(incoming.statusCode, incoming.headers);
        incoming.on('error', () => response.destroy());
        incoming.pipe(response);
      });
      upstream.on('error', () => {
        if (!response.headersSent) {
          response.writeHead(502, { 'Content-Type': 'application/json' });
          response.end(JSON.stringify({ error: 'Replay backend is unavailable.' }));
        } else response.destroy();
      });
      response.on('close', () => upstream.destroy());
      upstream.end();
      return;
    }
    const asset = assets.get(new URL(request.url, 'http://localhost').pathname);
    if (!asset) { response.writeHead(404); response.end('Not found.'); return; }
    try {
      const body = await readFile(new URL(asset[0], root));
      response.writeHead(200, { 'Content-Type': `${asset[1]}; charset=utf-8`, 'Cache-Control': 'no-cache' });
      response.end(body);
    } catch {
      response.writeHead(503); response.end('Frontend build missing. Run npm run build.');
    }
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  createServer({ backendUrl: process.env.BACKEND_URL,
    root: new URL(process.argv.includes('--dev') ? './' : './dist/', import.meta.url)
  }).listen(Number(process.env.PORT || 3000), '0.0.0.0', () => console.log('Frontend ready on port ' + (process.env.PORT || 3000)));
}
