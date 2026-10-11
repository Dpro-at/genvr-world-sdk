#!/usr/bin/env node
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = dirname(fileURLToPath(import.meta.url));
const server = createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = resolve(root, '.' + (pathname === '/' ? '/demo/index.html' : pathname.startsWith('/materials/') ? '/assets' + pathname : pathname));
  if (!file.startsWith(root + '/') && !file.startsWith(root + '\\')) { res.writeHead(403); res.end(); return; }
  try {
    const data = await readFile(file);
    res.setHeader('content-type', ({ '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.map': 'application/json' })[extname(file)] ?? 'application/octet-stream');
    res.end(data);
  } catch { res.writeHead(404); res.end('Not found'); }
});
server.listen(Number(process.env.PORT ?? 3028), '127.0.0.1', () => console.log('World SDK demo: http://127.0.0.1:' + server.address().port));
