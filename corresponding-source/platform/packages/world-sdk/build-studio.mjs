import { build } from 'esbuild';
import { cp, mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { dirname, resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { LIBRARY } from '@genvr/core-library';
import { THEME_BOOT_SCRIPT } from '../../apps/web/lib/theme-script.ts';
const web = resolve('../../apps/web');
const requireWeb = createRequire(resolve(web, 'package.json'));
const postcss = requireWeb('postcss'), tailwind = requireWeb('@tailwindcss/postcss');
const workers = ['script-worker', 'video-studio/subtitle-worker', 'video-studio/dubbing-worker'];
const workerUrls = { name: 'shared-studio-workers', setup(builder) {
  builder.onLoad({ filter: /(?:script-engine|subtitles|dubbing)\.ts$/ }, async ({ path }) => {
    const source = await readFile(path, 'utf8');
    return { contents: source.replace(/new URL\('\.\/(script|subtitle|dubbing)-worker\.ts', import\.meta\.url\)/g,
      (_, name) => `new URL('./workers/${name}-worker.js', import.meta.url)`), loader: 'ts' };
  });
} };
const config = { bundle: true, format: 'esm', platform: 'browser', target: 'es2022', jsx: 'automatic', splitting: true,
  sourcemap: true, define: { 'process.env.NODE_ENV': '"production"', 'process.env.NEXT_PUBLIC_API_URL': '"http://localhost:4000"' },
  loader: { '.wasm': 'file', '.woff2': 'file' }, logLevel: 'info' };
const result = await build({ ...config, entryPoints: { studio: 'studio/app.tsx', 'studio-browser': 'studio/browser.tsx' }, outdir: 'dist',
  plugins: [workerUrls], metafile: true });
// Emscripten includes a guarded Node branch; these builtins are never reached in browser workers.
const workerBuild = await build({ ...config, metafile: true, external: ['fs', 'path'], entryPoints: Object.fromEntries(workers.map(name => [name.split('/').at(-1), resolve(web, 'lib', name + '.ts')])), outdir: 'dist/workers' });
await cp('studio/api.d.ts', 'dist/studio.d.ts');
await writeFile('dist/studio.html', (await readFile('studio/index.html', 'utf8')).replace('</head>', `<script>${THEME_BOOT_SCRIPT}</script></head>`));
const css = await readFile(resolve(web, 'app/globals.css'), 'utf8');
const styled = await postcss([tailwind({ base: web, optimize: true })]).process(css + '\n@source "../../../packages/world-sdk/studio";\n', { from: resolve(web, 'app/globals.css') });
const componentCss = await readFile('dist/studio.css', 'utf8');
await writeFile('dist/studio.css', styled.css + '\n' + componentCss);
// The same tracked application assets, with their existing credits, served from the local package.
for (const directory of ['brand', 'create', 'materials', 'models', 'human', 'bodies', 'audio', 'market', 'mediapipe']) {
  await cp(resolve(web, 'public', directory), resolve('dist/studio-assets', directory), { recursive: true });
}
for (const family of ['draco', 'basis']) {
  const entry = family === 'draco' ? 'draco_decoder.js' : 'basis_transcoder.js';
  const source = dirname(requireWeb.resolve(`three/examples/jsm/libs/${family}/${entry}`));
  await cp(source, resolve('dist/studio-assets/decoders', family), { recursive: true });
}
const vision = resolve(dirname(requireWeb.resolve('@mediapipe/tasks-vision')), 'wasm');
await mkdir('dist/studio-assets/mediapipe/wasm', { recursive: true });
for (const file of ['vision_wasm_internal.js', 'vision_wasm_internal.wasm', 'vision_wasm_nosimd_internal.js', 'vision_wasm_nosimd_internal.wasm']) {
  await cp(resolve(vision, file), resolve('dist/studio-assets/mediapipe/wasm', file));
}
await writeFile('dist/studio-sources.json', JSON.stringify(Object.keys(result.metafile.inputs).sort(), null, 2));
await mkdir('dist/studio-assets/licenses', { recursive: true });
await cp(resolve('../../../LICENSE'), 'dist/studio-assets/licenses/Genvr.txt');
await cp(resolve(web, 'lib/video-studio/font-assets'), 'dist/studio-assets/licenses/film-fonts', { recursive: true });
await cp(resolve('../../../tooling/human-bake/CREDITS.md'), 'dist/studio-assets/licenses/human-CREDITS.md');
await cp(resolve('../runtime/src/ocean/LICENSE-tidewater.md'), 'dist/studio-assets/licenses/LICENSE-tidewater.md');
await cp('assets/CREDITS.md', 'dist/studio-assets/licenses/CREDITS.md');
const sources = new Map();
function provenance(value) {
  if (!value || typeof value !== 'object') return;
  if (typeof value.name === 'string' && typeof value.page === 'string' && typeof value.license === 'string') sources.set(value.page, value);
  for (const child of Object.values(value)) provenance(child);
}
provenance(LIBRARY);
await writeFile('dist/studio-assets/licenses/library-sources.json', JSON.stringify([...sources.values()], null, 2));
// Keep the actual bundled dependency notices, including worker-only dependencies.
const packages = new Set();
for (const input of [...Object.keys(result.metafile.inputs), ...Object.keys(workerBuild.metafile.inputs)]) {
  if (!input.includes('node_modules')) continue;
  let folder = dirname(resolve(input));
  while (folder !== dirname(folder)) {
    try {
      const pkg = JSON.parse(await readFile(resolve(folder, 'package.json'), 'utf8'));
      if (pkg.name && pkg.version) { packages.add(folder); break; }
    } catch { /* Nested module directories need their package root notice. */ }
    folder = dirname(folder);
  }
}
const notices = [];
const fallbackNotices = JSON.parse(await readFile('licenses/provenance.json', 'utf8'));
for (const folder of packages) {
  const pkg = JSON.parse(await readFile(resolve(folder, 'package.json'), 'utf8'));
  const directory = resolve('dist/studio-assets/licenses/dependencies', `${pkg.name.replaceAll('/', '_')}-${pkg.version}`);
  await mkdir(directory, { recursive: true });
  const files = (await readdir(folder)).filter(name => /^(licen[sc]e|notice|copying|copyright)([.-]|$)/i.test(name));
  for (const file of files) await cp(resolve(folder, file), resolve(directory, file), { recursive: true });
  const fallback = fallbackNotices[pkg.name];
  if (!files.length && fallback) {
    for (const file of fallback.files) { await cp(resolve('licenses', file), resolve(directory, file)); files.push(file); }
    await writeFile(resolve(directory, 'provenance.json'), JSON.stringify(fallback, null, 2));
  }
  if (!files.length) throw new Error(`Missing bundled dependency license: ${pkg.name}@${pkg.version}`);
  notices.push({ name: pkg.name, version: pkg.version, license: pkg.license, files, ...(fallback ? { provenance: fallback } : {}) });
}
await writeFile('dist/studio-assets/licenses/dependencies.json', JSON.stringify(notices, null, 2));
const inventory = [];
async function inventoryAssets(folder) {
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const path = resolve(folder, entry.name);
    if (entry.isDirectory()) await inventoryAssets(path);
    else { const bytes = await readFile(path); inventory.push({ path: relative(resolve('dist/studio-assets'), path).replaceAll('\\', '/'), bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }); }
  }
}
await inventoryAssets(resolve('dist/studio-assets'));
await writeFile('dist/studio-assets.json', JSON.stringify(inventory, null, 2));
