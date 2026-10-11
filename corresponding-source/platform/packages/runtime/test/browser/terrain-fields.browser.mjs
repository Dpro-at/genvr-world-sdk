/* global window */
import { createServer } from 'node:http';
import process from 'node:process';
import console from 'node:console';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL, URL } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..');
const pnpm = resolve(root, 'node_modules/.pnpm'),
  dirs = (await readdir(pnpm)).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
const dependency = async (name) =>
  import(
    pathToFileURL(
      resolve(
        pnpm,
        dirs.find((d) => d.startsWith(`${name}@`)),
        'node_modules',
        name,
        name === 'esbuild' ? 'lib/main.js' : 'index.mjs',
      ),
    ).href
  );
const { build } = await dependency('esbuild'),
  { chromium } = await dependency('playwright');
const bundled = await build({
  stdin: {
    contents: `export {TerrainFieldTextures} from './platform/packages/runtime/src/terrain-fields-gpu.ts';export {TerrainFieldStore,encodeTerrainFieldTile,terrainFieldFloat32Bytes} from './platform/packages/world/src/index.ts';export {TerrainLod} from './platform/packages/runtime/src/terrain-lod/index.ts';export {generateIsland} from './tooling/tidewater-world/island/index.ts';export {bakeTerrainMaps} from './platform/packages/runtime/src/tidewater-ground/ground-bake.ts';export {createDetailTexture} from './platform/packages/runtime/src/tidewater-ground/detail-texture.ts';export {createTidewaterGroundGraph} from './platform/packages/runtime/src/tidewater-ground/ground-shading.ts';`,
    resolveDir: root,
    loader: 'ts',
  },
  bundle: true,
  format: 'esm',
  write: false,
  external: ['three/webgpu', 'three/tsl'],
});
const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url, 'http://local').pathname;
    if (path === '/bundle.js') {
      res.setHeader('content-type', 'text/javascript');
      res.end(bundled.outputFiles[0].text);
      return;
    }
    const base = path.startsWith('/three/')
      ? resolve(root, 'platform/packages/runtime/node_modules/three/build')
      : resolve(root, 'platform/packages/runtime/test/browser');
    const name = path.startsWith('/three/') ? path.slice(7) : 'terrain-fields.html',
      file = resolve(base, name);
    if (!file.startsWith(base + sep)) throw Error('outside');
    res.setHeader('content-type', file.endsWith('.html') ? 'text/html' : 'text/javascript');
    res.end(await readFile(file));
  } catch {
    res.statusCode = 404;
    res.end();
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({
  channel: 'chromium',
  headless: true,
  args: ['--enable-unsafe-webgpu', '--mute-audio'],
});
try {
  const mode = process.argv[2];
  if (mode && !['wide', 'coast'].includes(mode)) throw Error('Use wide or coast');
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(`http://127.0.0.1:${server.address().port}/${mode ? '?preview=' + mode : ''}`);
  await page.waitForFunction(() => window.__result, {}, { timeout: 60000 });
  const result = await page.evaluate(() => window.__result);
  const output = resolve(root, 'docs/reference/tidewater-world/09-field-gpu');
  await mkdir(output, { recursive: true });
  await writeFile(
    resolve(output, mode ? `preview-${mode}.json` : 'gpu-probes.json'),
    JSON.stringify(result, null, 2) + '\n',
  );
  if (mode) await page.screenshot({ path: resolve(output, `preview-${mode}.png`) });
  console.log(JSON.stringify(result));
  if (
    result.error ||
    result.errors.length ||
    result.runs?.some((r) => !r.finite || r.maxError > 0.0001) ||
    result.overflow > 0
  )
    process.exitCode = 1;
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
