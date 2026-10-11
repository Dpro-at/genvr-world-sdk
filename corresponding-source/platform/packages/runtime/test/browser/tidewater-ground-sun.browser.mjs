// Runs tidewater-ground-sun.html in headless Chromium with WebGPU (sound muted): the TSL atmosphere LUTs against the CPU
// reference (world plan task 3), a sky shot and the kernel timings.
// Usage: pnpm --filter @genvr/runtime build && node test/browser/tidewater-sky.browser.mjs [query] [shot.jpg]
//   query e.g. "time=16.2&cam=0,1.7,0&look=-100,20,10" (the shot is saved when a path is given)
// Needs Playwright's Chromium (the repo's dev dependency) and a WebGPU-capable GPU.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(join(root, '../../../package.json'));
let chromium;
try {
  ({ chromium } = await import(pathToFileURL(require.resolve('playwright')).href));
} catch {
  const pnpmDir = join(root, '../../../node_modules/.pnpm');
  const { readdirSync } = await import('node:fs');
  const dir = readdirSync(pnpmDir).find((d) => d.startsWith('playwright@'));
  ({ chromium } = await import(pathToFileURL(join(pnpmDir, dir, 'node_modules/playwright/index.mjs')).href));
}

const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript' };
const server = createServer(async (req, res) => {
  try {
    const requested = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const sourceRoot = normalize(join(root, '../../../tooling/other-programs/tidewater/src'));
    const path = requested.startsWith('/source/') ? normalize(join(sourceRoot,requested.slice(8))) : normalize(join(root, requested));
    if (!path.startsWith(normalize(root)) && !path.startsWith(sourceRoot)) throw new Error('outside');
    const body = await readFile(path);
    res.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const browser = await chromium.launch({ channel: 'chromium', headless: true, args: ['--enable-unsafe-webgpu', '--mute-audio'] });
let failed = true;
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('console', (m) => m.type() === 'error' && console.error('[page]', m.text()));
  await page.goto(`http://127.0.0.1:${port}/test/browser/tidewater-ground-sun.html?${process.argv[2] ?? ''}`);
  await page.waitForFunction(() => window.__result, null, { timeout: 120000 });
  const result = await page.evaluate(() => window.__result);
  console.log(JSON.stringify(result));
  if (process.argv[3]) await page.screenshot({ path: process.argv[3], type: 'jpeg', quality: 90 });
  failed = !!result.error || Math.abs(result.ratios.sun-.62)>.005 || Math.abs(result.ratios.high-.97)>.005 || ['other','point','ambient','restored'].some(k=>Math.abs(result.ratios[k]-1)>.005) || result.errors.length>0;
  console.log(failed?'FAIL':'PASS: sun only source meadow factor');
} finally {
  await browser.close();
  server.close();
}
process.exit(failed ? 1 : 0);
