import { describe, expect, it } from 'vitest';
import { TerrainFieldStore, encodeTerrainFieldTile, terrainFieldFloat32Bytes } from '@genvr/world';
import { FloatType, NearestFilter, UnsignedByteType } from 'three/webgpu';
import { TerrainFieldTextures } from '../src/terrain-fields-gpu.js';

function fixture() {
  const descriptor = {
    schemaVersion: 1 as const,
    id: 'fields',
    origin: [-7, 19] as [number, number],
    width: 129,
    height: 2,
    spacing: 0.5,
    sampling: 'cell-center' as const,
    channels: [
      { id: 'height', encoding: 'f32le' as const },
      { id: 'mask', encoding: 'u8' as const },
    ],
  };
  const store = new TerrainFieldStore(descriptor);
  const tile = (tx: number, offset = 0) => {
    const cols = tx === 0 ? 128 : 1;
    const heights = new Float32Array(cols * 2),
      mask = new Uint8Array(cols * 2);
    for (let row = 0; row < 2; row++)
      for (let col = 0; col < cols; col++) {
        const index = row * cols + col,
          x = tx * 128 + col;
        heights[index] = x + row * 0.25 + offset;
        mask[index] = (x + row * 9) % 256;
      }
    if (tx === 0 && offset === 0) heights[0] = -0;
    return encodeTerrainFieldTile(descriptor, {
      tx,
      tz: 0,
      channels: { height: terrainFieldFloat32Bytes(heights), mask },
    });
  };
  store.replace(tile(0), store.revision);
  store.replace(tile(1), store.revision);
  return { store, tile };
}
describe('explicit terrain field GPU snapshots', () => {
  it('prepares the same bytes asynchronously with a task boundary after each tile', async () => {
    const { store } = fixture();
    let yields = 0;
    const gpu = await TerrainFieldTextures.createAsync(store, undefined, {
      yieldControl: async () => {
        yields++;
      },
    });
    const sync = new TerrainFieldTextures(store);
    expect(yields).toBe(2);
    for (const id of gpu.channels)
      expect(gpu.textures.get(id)!.image.data).toEqual(sync.textures.get(id)!.image.data);
    expect(Object.is(gpu.textures.get('height')!.image.data![0], -0)).toBe(true);
    expect(await gpu.refreshAsync()).toBe(false);
    gpu.dispose();
    sync.dispose();
  });
  it('keeps bound textures unchanged on abort and can retry', async () => {
    const { store, tile } = fixture();
    const gpu = new TerrainFieldTextures(store);
    const texture = gpu.textures.get('height')!,
      data = texture.image.data,
      revision = gpu.revision;
    store.replace(tile(1, 50), store.revision);
    const abort = new AbortController();
    await expect(
      gpu.refreshAsync({
        signal: abort.signal,
        yieldControl: async () => {
          abort.abort();
        },
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(texture.image.data).toBe(data);
    expect(gpu.revision).toBe(revision);
    expect(await gpu.refreshAsync()).toBe(true);
    expect(gpu.textures.get('height')).toBe(texture);
    expect(texture.image.data![128]).toBe(178);
    gpu.dispose();
  });
  it('rejects a mixed snapshot even when a later tile changes during the last yield', async () => {
    const { store, tile } = fixture();
    const gpu = new TerrainFieldTextures(store);
    const data = gpu.textures.get('height')!.image.data,
      revision = gpu.revision;
    store.replace(tile(0, 1), store.revision);
    let yields = 0;
    await expect(
      gpu.refreshAsync({
        yieldControl: async () => {
          if (++yields === 2) store.replace(tile(1, 8), store.revision);
        },
      }),
    ).rejects.toThrow('changed');
    expect(gpu.textures.get('height')!.image.data).toBe(data);
    expect(gpu.revision).toBe(revision);
    gpu.dispose();
  });
  it('serializes refreshes and does not resurrect disposed textures', async () => {
    const { store, tile } = fixture();
    const gpu = new TerrainFieldTextures(store);
    store.replace(tile(0, 2), store.revision);
    let release!: () => void;
    const pending = gpu.refreshAsync({
      yieldControl: () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    });
    expect(() => gpu.refresh()).toThrow('in progress');
    await expect(gpu.refreshAsync()).rejects.toThrow('in progress');
    gpu.dispose();
    release();
    await expect(pending).rejects.toThrow('disposed');
    expect(gpu.textures.size).toBe(0);
  });
  it('propagates scheduler failure and rejects pre-aborted factories without work', async () => {
    const { store } = fixture();
    const abort = new AbortController();
    abort.abort();
    let yielded = false;
    await expect(
      TerrainFieldTextures.createAsync(store, undefined, {
        signal: abort.signal,
        yieldControl: async () => {
          yielded = true;
        },
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(yielded).toBe(false);
    await expect(
      TerrainFieldTextures.createAsync(store, undefined, {
        yieldControl: async () => {
          throw new Error('scheduler failed');
        },
      }),
    ).rejects.toThrow('scheduler failed');
  });
  it('reassembles odd-width cross-tile rows in exact raw units without resampling', () => {
    const { store } = fixture(),
      gpu = new TerrainFieldTextures(store);
    const height = gpu.textures.get('height')!,
      mask = gpu.textures.get('mask')!;
    expect(height.type).toBe(FloatType);
    expect(mask.type).toBe(UnsignedByteType);
    expect(height.minFilter).toBe(NearestFilter);
    expect(height.generateMipmaps).toBe(false);
    expect(mask.unpackAlignment).toBe(1);
    expect(gpu.byteLength).toBe(129 * 2 * 5);
    expect(Object.is(height.image.data![0], -0)).toBe(true);
    expect(Array.from(height.image.data!.slice(127, 131))).toEqual([127, 128, 0.25, 1.25]);
    expect(height.image.data![257]).toBe(128.25);
    expect(mask.image.data![257]).toBe(137);
    expect(gpu.refresh()).toBe(false);
    gpu.dispose();
  });
  it('refreshes all channels atomically and preserves bound texture identity', () => {
    const { store, tile } = fixture(),
      gpu = new TerrainFieldTextures(store);
    const texture = gpu.textures.get('height')!,
      oldData = texture.image.data;
    store.replace(tile(1, 50), store.revision);
    expect(gpu.refresh()).toBe(true);
    expect(gpu.textures.get('height')).toBe(texture);
    expect(texture.image.data![128]).toBe(178);
    expect(oldData![128]).toBe(128);
    const snapshot = texture.image.data,
      revision = gpu.revision;
    store.restore(1, 0, null, store.revision);
    expect(() => gpu.refresh()).toThrow('every tile');
    expect(texture.image.data).toBe(snapshot);
    expect(gpu.revision).toBe(revision);
    gpu.dispose();
  });
  it('requires complete selected channels and releases each texture once', () => {
    const { store } = fixture();
    expect(() => new TerrainFieldTextures(store, [])).toThrow();
    expect(() => new TerrainFieldTextures(store, ['mask', 'mask'])).toThrow();
    expect(() => new TerrainFieldTextures(store, ['unknown'])).toThrow();
    const gpu = new TerrainFieldTextures(store, ['mask']);
    let disposals = 0;
    gpu.textures.get('mask')!.addEventListener('dispose', () => disposals++);
    expect(gpu.byteLength).toBe(258);
    gpu.dispose();
    gpu.dispose();
    expect(disposals).toBe(1);
    expect(gpu.textures.size).toBe(0);
    expect(() => gpu.refresh()).toThrow('disposed');
    expect(() => gpu.sampleNode('mask', null)).toThrow('disposed');
  });
});
