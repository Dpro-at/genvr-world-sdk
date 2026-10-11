// Task 6: GTAO and atmospheric haze GPU equations, dynamics and lifecycle.
/* global URL, console, process, window */
// Usage: node platform/packages/runtime/test/browser/post-air.browser.mjs [query] [shot.jpg]
//   query optional (the shot is saved when a path is given)
// Needs Playwright's Chromium (the repo's dev dependency) and a WebGPU-capable GPU.
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
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
    const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const allowedRoot = urlPath.startsWith('/packages/') ? normalize(join(root, '..')) : normalize(root);
    const path = normalize(join(allowedRoot, urlPath.replace(/^\/packages\//, '/')));
    if (!path.startsWith(allowedRoot)) throw new Error('outside');
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
const browser = await chromium.launch({
  channel: 'chromium',
  headless: true,
  args: ['--enable-unsafe-webgpu', '--mute-audio'],
});
let failed;
try {
  const page = await browser.newPage({ viewport: { width: 768, height: 512 } });
  const gpuErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') {
      const message = m.text();
      if (message.includes('GPUValidationError') || message.includes('Error while parsing WGSL'))
        gpuErrors.push(message.slice(0, 600));
      console.error('[page]', message.slice(0, 600));
    }
  });
  await page.goto(`http://127.0.0.1:${port}/test/browser/tidewater-post.html?${process.argv[2] ?? ''}`);
  await page.waitForFunction(() => window.__result, null, { timeout: 120000 });
  const result = await page.evaluate(() => window.__result);
  result.gpuErrors = gpuErrors;
  console.log(JSON.stringify(result));
  if (process.argv[3]) {
    await page.screenshot({ path: process.argv[3], type: 'jpeg', quality: 90 });
    await writeFile(process.argv[3].replace(/\.jpe?g$/i, '.json'), JSON.stringify(result, null, 2) + '\n');
  }
  failed = !!result.error || gpuErrors.length > 0 || !result.pass;
  console.log(failed ? 'FAIL: post integration' : 'PASS: post integration');} finally {
  await browser.close();
  server.close();
}
process.exit(failed ? 1 : 0);
