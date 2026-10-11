/* global process, URL, console, window, document */
// Isolated browser response fixtures only; never writes the owner's saved world.
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { generateIsland, MASK_NAMES } from '../../../../../tooling/tidewater-world/island/index.ts';
import { encodeTerrainFieldTile, terrainFieldFloat32Bytes } from '../../../world/dist/index.js';
const output = 'docs/reference/tidewater-world/09-ground-mip-parity';
import { WorldDocument } from '../../../contracts/dist/index.js';
const payload = {
    world: WorldDocument.parse({
      schemaVersion: 1,
      experienceId: 'exp-debug',
      version: 0,
      style: { base: 'realistic' },
      sizeTier: 'large',
      access: { mode: 'private' },
      environment: { sky: { preset: 'tropical' }, weather: { preset: 'clear' }, sea: { level: 20 } },
      terrain: {},
      spawn: { position: [0, 21, 0] },
    }),
  },
  island = generateIsland(7);
const descriptor = {
  schemaVersion: 1,
  id: 'native-fixture',
  origin: [-1024, -1024],
  spacing: 1,
  width: 2048,
  height: 2048,
  sampling: 'cell-center',
  heightBinding: { channel: 'height', offset: 20 },
  channels: [
    { id: 'height', encoding: 'f32le', range: [-100, 400] },
    ...MASK_NAMES.map((name) => ({ id: name, encoding: name === 'rock' ? 'f32le' : 'u8' })),
  ],
};
const tiles = [];
for (let tz = 0; tz < 16; tz++)
  for (let tx = 0; tx < 16; tx++) {
    const channels = {};
    for (const name of ['height', ...MASK_NAMES]) {
      const source = name === 'height' ? island.heights : island[name],
        values =
          name === 'height' || name === 'rock' ? new Float32Array(128 * 128) : new Uint8Array(128 * 128);
      for (let row = 0; row < 128; row++)
        values.set(
          source.subarray((tz * 128 + row) * 2048 + tx * 128, (tz * 128 + row) * 2048 + tx * 128 + 128),
          row * 128,
        );
      channels[name] = values instanceof Float32Array ? terrainFieldFloat32Bytes(values) : values;
    }
    tiles.push(encodeTerrainFieldTile(descriptor, { tx, tz, channels }));
  }
const roles = {
  'beach-sand': 'sand',
  rock: 'rock',
  grass: 'gully',
  dirt: 'path',
  seagrass: 'seagrass',
  rubble: 'rubble',
  'seabed-sand': null,
};
payload.world.terrain.fieldSets = {
  [descriptor.id]: { descriptor, tiles: tiles.map((t) => `${t.tx},${t.tz}`) },
};
payload.world.terrain.activeSurface = {
  setId: descriptor.id,
  outsideHeight: -70,
  edge: 'constant',
  farEdge: 'exclusive',
  materialBindings: Object.entries(roles).map(([variant, channel]) => ({
    itemId: `genvr.core.ground.tidewater-${variant}`,
    inputs: {
      ...(channel ? { coverage: { channel, scale: channel === 'rock' ? 1 : 1 / 255 } } : {}),
      ...(variant === 'rock' ? { scarp: { channel: 'scarp', scale: 1 / 255 } } : {}),
    },
  })),
};
payload.world.instances = [];
payload.world.roads = [];
payload.world.walls = [];
payload.world.environment.sea = { ...payload.world.environment.sea, level: 20 };
payload.world.environment.sky = { ...payload.world.environment.sky, preset: 'tropical' };

import { createServer } from 'node:http';
import { mkdirSync } from 'node:fs';
const deps = readdirSync('node_modules/.pnpm');
const { build } = await import(
  pathToFileURL(
    resolve(
      'node_modules/.pnpm',
      deps.find((n) => n.startsWith('esbuild@')),
      'node_modules/esbuild/lib/main.js',
    ),
  )
);
const { chromium } = await import(
  pathToFileURL(
    resolve(
      'node_modules/.pnpm',
      deps.find((n) => n.startsWith('playwright@')),
      'node_modules/playwright/index.mjs',
    ),
  )
);
const bundled = await build({
  stdin: {
    contents: `export {createRuntime} from './platform/packages/runtime/src/runtime.ts';export {TidewaterPost} from './platform/packages/runtime/src/post/index.ts';export {PostPass} from './platform/packages/runtime/src/post/pass.ts';`,
    resolveDir: process.cwd(),
    loader: 'ts',
  },
  bundle: true,
  format: 'esm',
  write: false,
  external: ['three/webgpu', 'three/tsl', 'three', 'three/addons/*'],
});
const server = createServer((req, res) => {
  try {
    const path = new URL(req.url, 'http://x').pathname;
    res.setHeader(
      'content-type',
      path.endsWith('.json') ? 'application/json' : path.endsWith('.js') ? 'text/javascript' : 'text/html',
    );
    if (path === '/bundle.js') res.end(bundled.outputFiles[0].text);
    else if (path === '/fixture.json') res.end(JSON.stringify({ world: payload.world, tiles }));
    else if (path.startsWith('/three/'))
      res.end(readFileSync(resolve('platform/packages/runtime/node_modules/three/build', path.slice(7))));
    else if (path.startsWith('/addons/'))
      res.end(
        readFileSync(resolve('platform/packages/runtime/node_modules/three/examples/jsm', path.slice(8))),
      );
    else res.end(readFileSync('platform/packages/runtime/test/browser/ground-mip-parity.html'));
  } catch {
    res.statusCode = 404;
    res.end();
  }
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({
  channel: 'chromium',
  headless: true,
  args: ['--enable-unsafe-webgpu', '--mute-audio'],
});
try {
  if (process.argv[2] !== 'source-only') {
    const page = await browser.newPage({ viewport: { width: 690, height: 480 } });
    page.on('console', (m) => console.log(m.text().slice(0, 500)));
    page.on('pageerror', (e) => console.error(e));
    await page.goto(`http://127.0.0.1:${server.address().port}/?cam=650,15,80&look=560,3,-30&camSpace=sea`);
    await page.waitForFunction(() => window.__result, null, { timeout: 180000 });
    const result = await page.evaluate(() => window.__result);
    console.log(JSON.stringify(result));
    writeFileSync(resolve(output, 'stages.json'), JSON.stringify(result, null, 2));
    for (const name of result.stages ?? []) {
      await page.evaluate((n) => window.showStage(n), name);
      await page.screenshot({ path: resolve(output, name + '.png') });
    }
    const final = await page.evaluate(() => window.__result);
    writeFileSync(resolve(output, 'stages.json'), JSON.stringify(final, null, 2));
    console.log(JSON.stringify(final));
    await page.close();
  }
  const sourceRoot = resolve('tooling/other-programs/tidewater');
  const sourceServer = createServer((req, res) => {
    try {
      const path = new URL(req.url, 'http://x').pathname;
      let file = resolve(sourceRoot, '.' + (path === '/' ? '/index.html' : path));
      if (!existsSync(file)) file = resolve(sourceRoot, 'public', '.' + path);
      if (!file.startsWith(sourceRoot)) throw Error('outside');
      const ext = file.split('.').pop();
      res.setHeader(
        'content-type',
        {
          js: 'text/javascript',
          html: 'text/html',
          css: 'text/css',
          json: 'application/json',
          png: 'image/png',
          jpg: 'image/jpeg',
          webp: 'image/webp',
          wasm: 'application/wasm',
        }[ext] ?? 'application/octet-stream',
      );
      res.end(readFileSync(file));
    } catch {
      res.statusCode = 404;
      res.end();
    }
  });
  await new Promise((done) => sourceServer.listen(0, '127.0.0.1', done));
  try {
    const reference = await browser.newPage({ viewport: { width: 690, height: 480 } });
    reference.on('console', (m) => console.log('[source]', m.text().slice(0, 1000)));
    reference.on('response', (r) => {
      if (r.status() >= 400) console.log('[sourceHTTP]', r.status(), new URL(r.url()).pathname);
    });
    reference.on('pageerror', (e) => console.error('source', e.message));
    await reference.goto(`http://127.0.0.1:${sourceServer.address().port}/?fly&noAudio`);
    await reference
      .waitForFunction(
        () => window.__app?.fly && document.querySelector('#loader')?.style.display === 'none',
        null,
        { timeout: 45000 },
      )
      .catch(async (error) => {
        await reference.screenshot({ path: resolve(output, 'original-loading.png') });
        console.log(
          '[sourceLoading]',
          await reference.evaluate(() => ({
            text: document.body.innerText.slice(-1500),
            app: !!window.__app,
          })),
        );
        throw error;
      });
    await reference.evaluate(() => {
      const app = window.__app;
      app.fly.setPose({ x: 650, y: 15, z: 80 }, Math.atan2(90, 110), Math.atan2(-12, Math.hypot(90, 110)));
      for (const element of document.querySelectorAll('.tw-start')) element.style.display = 'none';
    });
    await reference.evaluate(async () => {
      window.sourceGPU = (await import('/src/engine/gpu/GPU.js')).GPU;
      window.sourceStartFrame = window.sourceGPU.frame;
    });
    await reference.waitForFunction(() => window.sourceGPU.frame >= window.sourceStartFrame + 120, null, {
      timeout: 45000,
    });
    await reference.screenshot({ path: resolve(output, 'original-renderer.png') });
    await reference.evaluate(() => {
      const app = window.__app;
      app.scene.traverse((o) => {
        if (o.isMesh && o !== app.terrain.mesh && o !== app.ocean) o.visible = false;
      });
      window.sourceStartFrame = app.engine.renderer?.frame ?? 0;
    });
    await reference.waitForTimeout(4000);
    await reference.screenshot({ path: resolve(output, 'original-terrain-only.png') });
    const data = await reference.evaluate(() => ({
      camera: window.__app.camera.position.toArray(),
      normalMips: window.__app.terrainGPU?.normalTexture?.mipLevelCount,
      frames: window.sourceGPU.frame - window.sourceStartFrame,
    }));
    writeFileSync(resolve(output, 'original-renderer.json'), JSON.stringify(data, null, 2));
    await reference.close();
  } finally {
    sourceServer.close();
  }
} finally {
  await browser.close();
  server.close();
}
