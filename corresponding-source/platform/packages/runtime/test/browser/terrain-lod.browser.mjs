/* global window -- evaluated inside the isolated browser fixture */
import console from 'node:console';
import process from 'node:process';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { URL, fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(join(root, '../../../package.json'));
let chromium;
try {
  ({ chromium } = await import(pathToFileURL(require.resolve('playwright')).href));
} catch {
  const { readdirSync } = await import('node:fs');
  const dir = join(root, '../../../node_modules/.pnpm');
  const name = readdirSync(dir).find((n) => n.startsWith('playwright@'));
  ({ chromium } = await import(pathToFileURL(join(dir, name, 'node_modules/playwright/index.mjs')).href));
}
const sourceRoot = normalize(join(root, '../../../tooling/other-programs/tidewater/src'));
const server = createServer(async (req, res) => {
  try {
    const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const path = url.startsWith('/source/')
      ? normalize(join(sourceRoot, url.slice(8)))
      : normalize(join(root, url));
    if (!path.startsWith(root) && !path.startsWith(sourceRoot)) throw Error('outside');
    const body = await readFile(path);
    res.writeHead(200, { 'content-type': extname(path) === '.html' ? 'text/html' : 'text/javascript' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({
  channel: 'chromium',
  headless: true,
  args: ['--enable-unsafe-webgpu', '--mute-audio'],
});
let failed;
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 580 } });
  const consoleErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push(String(e)));
  await page.goto(`http://127.0.0.1:${server.address().port}/test/browser/terrain-lod.html`);
  await page.waitForFunction(() => window.__result, null, { timeout: 120000 });
  const result = await page.evaluate(() => window.__result);
  result.consoleErrors = consoleErrors;
  console.log(JSON.stringify(result));
  const report = join(root, '../../../docs/reference/tidewater-world/09-terrain-lod');
  await mkdir(report, { recursive: true });
  await page.screenshot({ path: join(report, 'native-lattice.png') });
  await writeFile(join(report, 'gpu.json'), JSON.stringify(result, null, 2) + '\n');
  failed =
    !!result.error ||
    !result.finite ||
    result.maxError > 0.0001 ||
    !result.morphing ||
    !result.nodes ||
    result.overflow !== 0 ||
    !result.disposed ||
    result.errors.length > 0 ||
    consoleErrors.length > 0;
  console.log(failed ? 'FAIL' : 'PASS source CDLOD GPU morph');
} finally {
  await browser.close();
  server.close();
}
process.exit(failed ? 1 : 0);
