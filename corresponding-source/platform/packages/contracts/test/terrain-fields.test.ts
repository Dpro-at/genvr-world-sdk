import { describe, it, expect } from 'vitest';
import { TerrainFieldDescriptor, TerrainFieldTile } from '../src/terrain-fields.js';
const descriptor = {
  schemaVersion: 1 as const,
  id: 'terrain',
  origin: [-1024, -1024] as [number, number],
  spacing: 1,
  width: 2048,
  height: 2048,
  sampling: 'cell-center' as const,
  channels: [
    { id: 'height', encoding: 'f32le' as const },
    { id: 'rock', encoding: 'f32le' as const },
    ...['sand', 'path', 'gully', 'seagrass', 'rubble', 'scarp'].map((id) => ({
      id,
      encoding: 'u8' as const,
    })),
  ],
  heightBinding: { channel: 'height', offset: 20 },
};
describe('generic field descriptor boundary', () => {
  it('allows full exact source extent independently of playable bounds', () => {
    expect(TerrainFieldDescriptor.parse(descriptor)).toEqual(descriptor);
  });
  it.each([
    { ...descriptor, width: 0 },
    { ...descriptor, width: 4097 },
    { ...descriptor, spacing: NaN },
    { ...descriptor, origin: [Infinity, 0] },
    { ...descriptor, unexpected: 1 },
    { ...descriptor, heightBinding: { channel: 'sand', offset: 0 } },
    {
      ...descriptor,
      channels: [
        { id: 'same', encoding: 'u8' },
        { id: 'same', encoding: 'f32le' },
      ],
    },
    { ...descriptor, channels: [{ id: 'mask', encoding: 'u8', range: [0, 256] }] },
    { ...descriptor, channels: [{ id: 'height', encoding: 'f32le', range: [5, 1] }] },
    { ...descriptor, channels: Array.from({ length: 9 }, (_, i) => ({ id: `f${i}`, encoding: 'f32le' })) },
    { ...descriptor, width: 4096, height: 4096 },
  ])('rejects invalid metadata %#', (value) => {
    expect(TerrainFieldDescriptor.safeParse(value).success).toBe(false);
  });
  it('bounds tile envelopes before allocation', () => {
    expect(
      TerrainFieldTile.safeParse({
        kind: 'terrain-fields-v1',
        setId: 'terrain',
        tx: 32,
        tz: 0,
        cols: 128,
        rows: 128,
        channels: {},
      }).success,
    ).toBe(false);
  });
});

it('rejects excessive envelope channel count and aggregate string payload', () => {
  const envelope = { kind: 'terrain-fields-v1', setId: 'terrain', tx: 0, tz: 0, cols: 128, rows: 128 };
  expect(
    TerrainFieldTile.safeParse({
      ...envelope,
      channels: Object.fromEntries(Array.from({ length: 33 }, (_, i) => ['f' + i, 'AA=='])),
    }).success,
  ).toBe(false);
  expect(
    TerrainFieldTile.safeParse({ ...envelope, channels: { a: 'A'.repeat(600000), b: 'A'.repeat(600000) } })
      .success,
  ).toBe(false);
});
