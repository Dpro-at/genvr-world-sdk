#!/usr/bin/env node
import { createLocalVoice } from './local-voice.mjs';
import { createLiveStudioBridge } from './live-studio-bridge.mjs';
import { homedir } from 'node:os';
import { createServer } from 'node:http';
import { readFile, realpath, mkdir, writeFile, rename } from 'node:fs/promises';
import { resolve, extname, dirname, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url)), dist = resolve(root, 'dist');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.glb': 'model/gltf-binary' };
/**
 * The owner's private motion library (our motion files made from their own downloads): served only from a folder outside
 * the package, never copied into dist, so it cannot ship. GENVR_PRIVATE_MOTIONS, or the source tree's .local-runtime.
 */
const PRIVATE_MOTIONS = '/private-motions/';
export function createStudioServer({ bridge, privateMotions } = {}) {
  return createServer(async (req, res) => {
    if (bridge && await bridge.handle(req, res)) return;
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      const path = decodeURIComponent(url.pathname);
      const own = Boolean(privateMotions && path.startsWith(PRIVATE_MOTIONS)), base = own ? privateMotions : dist;
      const file = own ? resolve(privateMotions, '.' + path.slice(PRIVATE_MOTIONS.length - 1)) : path === '/' ? resolve(dist, 'studio.html') : path.startsWith('/dist/') ? resolve(root, '.' + path) : resolve(dist, 'studio-assets', '.' + path);
      const actual = await realpath(file), inside = relative(await realpath(base), actual);
      if (inside.startsWith('..') || isAbsolute(inside)) { res.writeHead(403); res.end(); return; }
      let data = await readFile(actual);
      if (path === '/' && bridge) {
        if (!/^((127\.0\.0\.1|localhost)(:\d+)?|\[::1\](:\d+)?)$/.test(req.headers.host ?? '')) { res.writeHead(403); res.end(); return; }
        data = Buffer.from(data.toString().replace('</head>', `<meta name="genvr-studio-token" content="${bridge.token}"></head>`));
        res.setHeader('Referrer-Policy', 'no-referrer');
      }
      res.setHeader('Content-Type', types[extname(actual)] ?? 'application/octet-stream');
      res.setHeader('Content-Length', data.length); res.writeHead(200); res.end(req.method === 'HEAD' ? undefined : data);
    } catch { res.writeHead(404); res.end('Not found'); }
  });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let bridge;
  const voice = createLocalVoice({ generated: (audio, sessionId, projectId) => { const candidates=bridge.list().filter(row=>row.projectId===projectId); return bridge.call(audio.control ? 'avatar_speech_control' : 'avatar_speech', audio, sessionId ?? (candidates.length===1?candidates[0].id:undefined)); } });
  bridge = createLiveStudioBridge({ voice });
  const tree = resolve(root, '../../../../.local-runtime/motion-library');
  const privateMotions = process.env.GENVR_PRIVATE_MOTIONS ? resolve(process.env.GENVR_PRIVATE_MOTIONS) : await realpath(tree).catch(() => undefined);
  const server = createStudioServer({ bridge, privateMotions });
  const connectionPath = resolve(process.env.GENVR_STUDIO_CONNECTION ?? resolve(homedir(), '.genvr', 'studio-connection.json'));
  await mkdir(dirname(connectionPath), { recursive: true, mode: 0o700 });
  server.on('close', () => { voice.close(); bridge.close(); });
  server.listen(Number(process.env.PORT ?? 3029), '127.0.0.1', async () => { const url = `http://127.0.0.1:${server.address().port}`; const temporary = connectionPath + `.${process.pid}.tmp`; await writeFile(temporary, JSON.stringify({ version: 1, url, token: bridge.token }), { mode: 0o600, flag: 'wx' }); await rename(temporary, connectionPath); console.log(`Genvr Studio: ${url}\nLive MCP connection file: ${connectionPath}`); });
}
