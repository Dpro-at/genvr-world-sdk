import { build } from 'esbuild';
import { mkdir, readFile, writeFile, readdir, cp } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
await mkdir('dist', { recursive: true });
await build({ entryPoints: ['src/index.ts', 'src/runtime.ts'], outdir: 'dist', bundle: true,
  splitting: true, format: 'esm', platform: 'browser', target: 'es2022', sourcemap: true,
});
await build({ entryPoints: ['demo/app.ts'], outfile: 'dist/demo-app.js', bundle: true,
  format: 'esm', platform: 'browser', target: 'es2022', sourcemap: true,
});
await build({ entryPoints: ['src/mcp.ts'], outfile: 'dist/mcp.js', bundle: true, format: 'esm', platform: 'node', target: 'node24',
  banner: { js: '#!/usr/bin/env node\nimport { createRequire } from "node:module";const require=createRequire(import.meta.url);' },
});
// Two existing licensed textures are loaded eagerly by the shared runtime, even in the basic preview.
for (const path of ['materials/grass/cards.webp', 'materials/water/caustics.webp']) {
  await mkdir(dirname(resolve('assets', path)), { recursive: true });
  await cp(resolve('../../apps/web/public', path), resolve('assets', path));
}
// Build a dependency-free distribution manifest: all runtime JS is bundled above.
const original = JSON.parse(await readFile('package.json', 'utf8'));
await cp(resolve('../../../LICENSE'), resolve('LICENSE'));
const vendorNames = ['contracts', 'assistant', 'core-library', 'world', 'runtime', 'validator', 'script', 'game'];
async function declarations(folder, target, recursive = true) {
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const source = resolve(folder, entry.name), dest = resolve(target, entry.name);
    if (entry.isDirectory()) { if (recursive) await declarations(source, dest); continue; }
    if (!entry.name.endsWith('.d.ts')) continue;
    let text = await readFile(source, 'utf8');
    text = text.replace(/(['"])@genvr\/([a-z-]+)(\/[^'"]*)?\1/g, (_, quote, name, subpath) => {
      if (!vendorNames.includes(name)) throw new Error(`Unknown declaration dependency: ${name}`);
      const targetFile = resolve('dist/types/vendor', name, subpath ? `${subpath.slice(1)}.js` : 'index.js');
      let path = relative(dirname(dest), targetFile).replaceAll('\\', '/');
      if (!path.startsWith('.')) path = './' + path;
      return quote + path + quote;
    });
    await mkdir(dirname(dest), { recursive: true }); await writeFile(dest, text);
  }
}
for (const name of vendorNames) await declarations(`../${name}/dist`, `dist/types/vendor/${name}`);
// Keep canonical workspace declarations intact (nominal private class types must match the API).
// The standalone distribution gets separate portable declaration copies.
await declarations('dist', 'dist/types', false);
await writeFile('dist/package-manifest.json', JSON.stringify({ name: '3d-world-sdk', version: original.version,
  type: 'module', description: original.description,
  license: 'AGPL-3.0-only',
  repository: { type: 'git', url: 'git+https://github.com/Dpro-at/genvr-world-sdk.git' },
  publishConfig: { access: 'public', tag: 'preview' },
  engines: { node: '>=24' },
  exports: { '.': { types: './dist/types/index.d.ts', default: './dist/index.js' }, './runtime': { types: './dist/types/runtime.d.ts', default: './dist/runtime.js' } },
  dependencies: { zod: '4.6.5', three: '0.186.1', '@types/three': '0.186.0', '@dimforge/rapier3d-compat': '0.20.0' },
  bin: { 'genvr-world-mcp': './dist/mcp.js', 'genvr-world-demo': './serve.mjs' },
  files: ['dist', 'demo', 'assets', 'serve.mjs', 'README.md', 'LICENSE'],
}, null, 2));
