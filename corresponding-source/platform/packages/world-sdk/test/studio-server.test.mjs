import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { createStudioServer } from '../serve-studio.mjs';

describe('standalone Studio distribution', () => {
  const server = createStudioServer(); let base;
  beforeAll(async () => { await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); base = `http://127.0.0.1:${server.address().port}`; });
  afterAll(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  it('serves the entry, stylesheet, workers, decoders, models and fonts with correct MIME', async () => {
    for (const [path, mime] of [['/', 'text/html'], ['/dist/studio.css', 'text/css'], ['/dist/workers/script-worker.js', 'text/javascript'], ['/dist/workers/subtitle-worker.js', 'text/javascript'], ['/dist/workers/dubbing-worker.js', 'text/javascript'], ['/decoders/draco/draco_decoder.wasm', 'application/wasm'], ['/mediapipe/wasm/vision_wasm_internal.wasm', 'application/wasm'], ['/mediapipe/wasm/vision_wasm_nosimd_internal.js', 'text/javascript'], ['/human/human-base.bin', 'application/octet-stream'], ['/create/style-blocky.webp', 'image/webp']]) {
      const response = await fetch(base + path, { method: 'HEAD' });
      expect(response.status, path).toBe(200); expect(response.headers.get('content-type'), path).toBe(mime);
      expect(Number(response.headers.get('content-length'))).toBeGreaterThan(0);
    }
  });
  it('never exposes source paths or write/authentication endpoints', async () => {
    for (const path of ['/dist/..%2f..%2fpackage.json', '/.env', '/v1/me']) expect((await fetch(base + path)).status).not.toBe(200);
    expect((await fetch(base + '/', { method: 'POST', body: '{}' })).status).toBe(405);
  });
  it('bundles shared authoring source rather than duplicate SDK toolbars or Next build macros', async () => {
    const sources = JSON.parse(await readFile(new URL('../dist/studio-sources.json', import.meta.url), 'utf8'));
    for (const expected of ['components/create-flow.tsx', 'components/studio/studio-chrome.tsx', 'components/studio/library-panel.tsx', 'components/studio/film/timeline-clip.tsx', 'lib/video-studio/use-video-studio.ts']) expect(sources.some(path => path.endsWith(expected)), expected).toBe(true);
    expect(sources.some(path => path.includes('/next/'))).toBe(false);
    const assets = JSON.parse(await readFile(new URL('../dist/studio-assets.json', import.meta.url), 'utf8'));
    expect(assets.length).toBeGreaterThan(100);
    expect(assets.every(asset => asset.bytes > 0 && /^[0-9a-f]{64}$/.test(asset.sha256))).toBe(true);
    const notices = JSON.parse(await readFile(new URL('../dist/studio-assets/licenses/dependencies.json', import.meta.url), 'utf8'));
    expect(notices.every(notice => notice.files.length > 0)).toBe(true);
    expect(await readFile(new URL('../dist/studio.html', import.meta.url), 'utf8')).toContain("localStorage.getItem('genvr-theme')");
  });
});
