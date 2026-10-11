#!/usr/bin/env node
import { createServer } from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import { resolve, extname, dirname, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url)), dist = resolve(root, 'dist');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.glb': 'model/gltf-binary' };
export function createStudioServer() {
  return createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      const path = decodeURIComponent(url.pathname);
      const file = path === '/' ? resolve(dist, 'studio.html') : path.startsWith('/dist/') ? resolve(root, '.' + path) : resolve(dist, 'studio-assets', '.' + path);
      const actual = await realpath(file), inside = relative(dist, actual);
      if (inside.startsWith('..') || isAbsolute(inside)) { res.writeHead(403); res.end(); return; }
      const data = await readFile(actual);
      res.setHeader('Content-Type', types[extname(actual)] ?? 'application/octet-stream');
      res.setHeader('Content-Length', data.length); res.writeHead(200); res.end(req.method === 'HEAD' ? undefined : data);
    } catch { res.writeHead(404); res.end('Not found'); }
  });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createStudioServer();
  server.listen(Number(process.env.PORT ?? 3029), '127.0.0.1', () => console.log(`Genvr Studio: http://127.0.0.1:${server.address().port}`));
}
