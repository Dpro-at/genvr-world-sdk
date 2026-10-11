// Native WebGPU integration regression and 256px library-thumbnail renderer.
// Usage: node platform/packages/runtime/test/browser/ground-integration.browser.mjs [variant query] [output.webp]
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
  await page.goto(`http://127.0.0.1:${port}/test/browser/ground-wetness.html?${process.argv[2] ?? ''}`);
  await page.waitForFunction(() => window.__result, null, { timeout: 120000 });
  const result = await page.evaluate(() => window.__result);
  console.log(JSON.stringify(result));
  if (process.argv[3]) {
    const data=await page.locator('canvas').evaluate(canvas=>canvas.toDataURL('image/webp',.92));
    await writeFile(process.argv[3],Buffer.from(data.split(',')[1],'base64'));
  }
  failed = !!result.error || !result.pass || result.errors.length > 0;
  console.log(failed ? 'FAIL' : 'PASS: source terrain GPU graph');
} finally {
  await browser.close();
  server.close();
}
process.exit(failed ? 1 : 0);
