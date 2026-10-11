import { describe, it, expect } from 'vitest';
import type { TerrainFieldDescriptor } from '@genvr/contracts';
import {
  encodeTerrainFieldTile,
  decodeTerrainFieldTile,
  terrainFieldFloat32Bytes,
  terrainFieldTileShape,
  terrainFieldTileKey,
  serializeTerrainFieldTile,
  parseTerrainFieldTile,
  TerrainFieldStore,
} from '../src/terrain-fields.js';
const descriptor: TerrainFieldDescriptor = {
  schemaVersion: 1,
  id: 'custom',
  origin: [123.5, -44],
  spacing: 0.5,
  width: 129,
  height: 130,
  sampling: 'cell-center',
  channels: [
    { id: 'height', encoding: 'f32le', range: [-90, 400] },
    { id: 'mask', encoding: 'u8' },
  ],
  heightBinding: { channel: 'height', offset: 20 },
};
const make = (tx = 0, tz = 0) => {
  const { cols, rows } = terrainFieldTileShape(descriptor, tx, tz),
    n = cols * rows;
  const heights = new Float32Array(n);
  heights[0] = -0;
  for (let i = 1; i < n; i++) heights[i] = (i % 87) - 40;
  return encodeTerrainFieldTile(descriptor, {
    tx,
    tz,
    channels: {
      height: terrainFieldFloat32Bytes(heights),
      mask: Uint8Array.from({ length: n }, (_, i) => i % 256),
    },
  });
};
describe('lossless raw terrain fields', () => {
  it('retains exact float bits and byte units through JSON storage including nonzero origins', () => {
    const tile = make(1, 1),
      stored = serializeTerrainFieldTile(descriptor, tile);
    expect(parseTerrainFieldTile(descriptor, stored)).toEqual(tile);
    const decoded = decodeTerrainFieldTile(descriptor, tile);
    expect(Array.from(decoded.channels.mask!)).toEqual([0, 1]);
    expect(new DataView(decoded.channels.height!.buffer).getUint32(0, true)).toBe(0x80000000);
    expect(terrainFieldTileShape(descriptor, 1, 1)).toEqual({ cols: 1, rows: 2 });
    expect(terrainFieldTileKey(descriptor, 1, 1)).toBe('f:custom:1,1');
  });
  it('rejects missing/extra channels, malformed bytes and metadata atomically', () => {
    const tile = make(1, 1),
      store = new TerrainFieldStore(descriptor);
    const bad = [
      { ...tile, setId: 'other' },
      { ...tile, cols: 2 },
      { ...tile, tx: 2 },
      { ...tile, channels: { ...tile.channels, mask: 'AA==' } },
      { ...tile, channels: { height: tile.channels.height } },
      { ...tile, channels: { ...tile.channels, extra: 'AA==' } },
      { ...tile, channels: { ...tile.channels, mask: 'AAB=' } },
      { ...tile, channels: { ...tile.channels, mask: '!!!!' } },
      { ...tile, channels: { ...tile.channels, height: 'AACAfwAAgH8=' } }, // infinities
      { ...tile, channels: { ...tile.channels, height: 'AADAfwAAwH8=' } }, // NaNs
    ];
    for (const input of bad) expect(() => store.replace(input, 0)).toThrow();
    expect(store.tileCount).toBe(0);
    expect(store.revision).toBe(0);
  });
  it('enforces declared ranges and effective height bounds without changing raw floats', () => {
    expect(() =>
      encodeTerrainFieldTile(descriptor, {
        tx: 1,
        tz: 1,
        channels: { height: terrainFieldFloat32Bytes(new Float32Array([400.1, 0])), mask: new Uint8Array(2) },
      }),
    ).toThrow();
    const d = { ...descriptor, heightBinding: { channel: 'height', offset: 100 } };
    expect(() =>
      encodeTerrainFieldTile(d, {
        tx: 1,
        tz: 1,
        channels: { height: terrainFieldFloat32Bytes(new Float32Array([400, 0])), mask: new Uint8Array(2) },
      }),
    ).toThrow();
  });
  it('requires complete unique tile coverage; revision guards and inverse restore survive reload', () => {
    const store = new TerrainFieldStore(descriptor),
      first = make();
    const change = store.replace(first, 0);
    expect(change.previous).toBeNull();
    expect(store.complete).toBe(false);
    expect(() => store.replace(first, 0)).toThrow('revision conflict');
    const edited = store.getTile(0, 0)!;
    edited.channels.mask = 'invalid';
    expect(store.getTile(0, 0)).toEqual(first);
    const desc = store.descriptor;
    desc.origin[0] = 0;
    expect(store.descriptor.origin[0]).toBe(123.5);
    for (const [tx, tz] of [
      [1, 0],
      [0, 1],
      [1, 1],
    ] as const)
      store.replace(make(tx, tz), store.revision);
    expect(store.complete).toBe(true);
    expect(store.tileCount).toBe(4);
    const replacement = store.replace(first, store.revision);
    expect(replacement.previous).toEqual(first);
    expect(store.tileCount).toBe(4);
    store.restore(0, 0, change.previous, store.revision);
    expect(store.complete).toBe(false);
    expect(store.getTile(0, 0)).toBeNull();
    store.restore(0, 0, replacement.previous, store.revision);
    expect(store.complete).toBe(true);
    expect(() => store.restore(1, 1, first, store.revision)).toThrow('coordinates mismatch');
    expect(store.complete).toBe(true);
    const loaded = new TerrainFieldStore(store.descriptor);
    for (const [tx, tz] of [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ] as const)
      loaded.replace(
        parseTerrainFieldTile(descriptor, serializeTerrainFieldTile(descriptor, store.getTile(tx, tz)!)),
        loaded.revision,
      );
    expect(loaded.complete).toBe(true);
    expect(loaded.getTile(1, 1)).toEqual(store.getTile(1, 1));
  });
});
