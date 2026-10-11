// Screenshots of the Tidewater sea on the open sea (plan task 2), headless Chromium with WebGPU, sound muted.
// Usage: pnpm --filter @genvr/runtime build && node test/browser/ocean-sea.browser.mjs out.png "cam=0,1.7,0&look=0,0,-100"
import { createServer } from 'node:http';
import { readdirSync } from 'node:fs';
import { readFile as readFileAsync } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const pnpmDir = join(root, '../../../node_modules/.pnpm');
const dir = readdirSync(pnpmDir).find((d) => d.startsWith('playwright@'));
const { chromium } = await import(pathToFileURL(join(pnpmDir, dir, 'node_modules/playwright/index.mjs')).href);

const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript' };
const server = createServer(async (req, res) => {
  try {
    const path = normalize(join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
    if (!path.startsWith(normalize(root))) throw new Error('outside');
    const body = await readFileAsync(path);
    res.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const out = process.argv[2] ?? 'sea.png';
const query = process.argv[3] ?? '';
const [w, h] = (process.argv[4] ?? '1600x900').split('x').map(Number);
const browser = await chromium.launch({ channel: 'chromium', headless: true, args: ['--enable-unsafe-webgpu', '--mute-audio', ...(process.env.NOVSYNC ? ['--disable-gpu-vsync', '--disable-frame-rate-limit'] : [])] });
try {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  page.on('console', (m) => ['error', 'warning'].includes(m.type()) && console.error('[page]', m.text().slice(0, 600)));
  page.on('pageerror', (e) => console.error('[pageerror]', String(e).slice(0, 600)));
  await page.goto(`http://127.0.0.1:${port}/test/browser/ocean-sea.html?${query}`);
  await page.waitForFunction(() => window.__ready, null, { timeout: 120000 });
  console.log(JSON.stringify(await page.evaluate(() => window.__ready)));
  await page.screenshot({ path: out });
} finally {
  await browser.close();
  server.close();
}
