import { describe, expect, it } from 'vitest';
import type { TerrainFieldDescriptor } from '@genvr/contracts';
import { TerrainFieldSampler } from '../src/terrain-field-sampler.js';
import {
  TerrainFieldStore,
  encodeTerrainFieldTile,
  terrainFieldFloat32Bytes,
} from '../src/terrain-fields.js';

function make(width: number, height: number, sampling: 'cell-center' | 'vertex' = 'cell-center') {
  const descriptor: TerrainFieldDescriptor = {
    schemaVersion: 1,
    id: 'raster',
    origin: [-10, 20],
    spacing: 2,
    width,
    height,
    sampling,
    channels: [
      { id: 'height', encoding: 'f32le' },
      { id: 'mask', encoding: 'u8' },
    ],
  };
  const store = new TerrainFieldStore(descriptor);
  const put = (tx: number, tz: number, value = (x: number, z: number) => x + z * 10) => {
    const cols = Math.min(128, width - tx * 128),
      rows = Math.min(128, height - tz * 128);
    const heights = new Float32Array(cols * rows),
      mask = new Uint8Array(cols * rows);
    for (let z = 0; z < rows; z++)
      for (let x = 0; x < cols; x++) {
        heights[z * cols + x] = value(tx * 128 + x, tz * 128 + z);
        mask[z * cols + x] = (tx * 128 + x + tz * 128 + z) % 256;
      }
    const tile = encodeTerrainFieldTile(descriptor, {
      tx,
      tz,
      channels: { height: terrainFieldFloat32Bytes(heights), mask },
    });
    return store.replace(tile, store.revision);
  };
  return { store, put, sampler: new TerrainFieldSampler(store) };
}
describe('generic lossless raster sampler', () => {
  it('maps origin/spacing and both sample conventions; raw masks are not normalized', () => {
    for (const mode of ['cell-center', 'vertex'] as const) {
      const { put, sampler } = make(2, 2, mode);
      put(0, 0);
      const offset = mode === 'cell-center' ? 1 : 0;
      expect(sampler.sample('height', -10 + offset + 0.5, 20 + offset + 1)).toBe(5.25);
      expect(sampler.sample('mask', -10 + offset + 2, 20 + offset + 2)).toBe(2);
      expect(sampler.sample('height', -10 + offset + 1, 20 + offset, { filter: 'nearest' })).toBe(1);
      expect(sampler.sample('height', -10 + offset - 0.01, 20 + offset)).toBeNull();
      expect(sampler.sample('height', -100, 100, { edge: 'clamp' })).toBe(10);
    }
  });
  it('handles 1x1/1xN, exact last samples and signed zero without reading unused neighbors', () => {
    const one = make(1, 1);
    one.put(0, 0, () => -0);
    expect(Object.is(one.sampler.sample('height', -9, 21), -0)).toBe(true);
    expect(Object.is(one.sampler.sample('height', 500, -500, { edge: 'clamp' }), -0)).toBe(true);
    const line = make(1, 3);
    line.put(0, 0);
    expect(line.sampler.sample('height', -9, 24)).toBe(15);
    expect(line.sampler.sample('height', -9, 25)).toBe(20);
  });
  it('interpolates cross-tile seams and refuses only actually required missing samples', () => {
    const { put, sampler } = make(129, 129);
    put(0, 0);
    const point = (n: number) => n * 2;
    expect(sampler.sample('height', -9 + point(127), 21 + point(127))).toBe(1397);
    expect(sampler.sample('height', -9 + point(127.5), 21 + point(127))).toBeNull();
    put(1, 0);
    put(0, 1);
    put(1, 1);
    expect(sampler.sample('height', -9 + point(127.5), 21 + point(127.5))).toBe(1402.5);
    expect(sampler.sample('height', -9 + point(128), 21 + point(128))).toBe(1408);
  });
  it('invalidates replacement/removal/restore cache, bounds bytes and releases it safely', () => {
    const { store, put, sampler } = make(2, 2);
    put(0, 0);
    expect(store.decodedByteLength).toBe(0);
    expect(sampler.sample('height', -9, 21)).toBe(0);
    expect(store.decodedByteLength).toBe(16);
    sampler.sample('mask', -9, 21);
    expect(store.decodedByteLength).toBe(20);
    const change = put(0, 0, () => 7);
    expect(store.decodedByteLength).toBe(0);
    expect(sampler.sample('height', -9, 21)).toBe(7);
    store.restore(0, 0, change.previous, store.revision);
    expect(sampler.sample('height', -9, 21)).toBe(0);
    store.restore(0, 0, null, store.revision);
    expect(store.decodedByteLength).toBe(0);
    expect(sampler.sample('height', -9, 21)).toBeNull();
    put(0, 0);
    sampler.sample('height', -9, 21);
    sampler.clear();
    expect(store.decodedByteLength).toBe(0);
    expect(sampler.sample('height', -9, 21)).toBe(0);
    sampler.dispose();
    expect(store.decodedByteLength).toBe(0);
    expect(sampler.sample('height', -9, 21)).toBeNull();
    expect(new TerrainFieldSampler(store).sample('height', -9, 21)).toBe(0);
  });
  it('rejects unknown channels/nonfinite coordinates and distinguishes bilinear from triangle height', () => {
    const { put, sampler } = make(2, 2);
    put(0, 0, (x, z) => x * z * 4);
    expect(sampler.sample('height', -8, 22)).toBe(1); // diagonal triangle mesh would yield 2
    expect(sampler.sample('unknown', -9, 21)).toBeNull();
    for (const invalid of [NaN, Infinity, -Infinity])
      expect(sampler.sample('height', invalid, 21)).toBeNull();
  });
});
