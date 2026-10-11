import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { QUICKJS_WASM_SHA256 } from '../src/index.js';

// Supply chain (spec 7.2): the QuickJS-ng WASM file is pinned. Updating it is a deliberate change of this constant.
describe('QuickJS-ng pin', () => {
  it('the WASM file matches the recorded sha256', () => {
    const require = createRequire(import.meta.url);
    const pkg = require.resolve('@jitl/quickjs-ng-wasmfile-release-sync/package.json');
    const wasm = readFileSync(join(dirname(pkg), 'dist', 'emscripten-module.wasm'));
    expect(createHash('sha256').update(wasm).digest('hex')).toBe(QUICKJS_WASM_SHA256);
  });

  it('the three packages are pinned exactly', () => {
    const require = createRequire(import.meta.url);
    const own = require('../package.json') as { dependencies: Record<string, string> };
    expect(own.dependencies).toMatchObject({
      'quickjs-emscripten-core': '0.32.0',
      '@jitl/quickjs-ng-wasmfile-release-sync': '0.32.0',
      '@jitl/quickjs-ffi-types': '0.32.0',
    });
    const quickjs = [
      'quickjs-emscripten-core',
      '@jitl/quickjs-ng-wasmfile-release-sync',
      '@jitl/quickjs-ffi-types',
    ];
    // Every other runtime dependency is one of Genvr's own packages.
    for (const [name, version] of Object.entries(own.dependencies))
      if (!quickjs.includes(name))
        expect([name.startsWith('@genvr/'), version]).toEqual([true, 'workspace:*']);
    for (const name of quickjs) {
      const file = join(dirname(require.resolve('../package.json')), 'node_modules', name, 'package.json');
      const version = (JSON.parse(readFileSync(file, 'utf8')) as { version: string }).version;
      expect(version, name).toBe('0.32.0');
    }
  });
});
