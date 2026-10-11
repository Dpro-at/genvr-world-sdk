import { describe, it, expect } from 'vitest';
import { CommandPayload } from '../src/commands.js';
import { TerrainFieldSets, TerrainFieldSetMetadata } from '../src/terrain-fields.js';
const descriptor = {
  schemaVersion: 1 as const,
  id: 'fields',
  origin: [-1024, -1024] as [number, number],
  spacing: 1,
  width: 256,
  height: 128,
  sampling: 'cell-center' as const,
  channels: [{ id: 'height', encoding: 'f32le' as const }],
};
describe('staged field metadata and command envelopes', () => {
  it('keeps a typed descriptor/reference wire array without an output transform', () => {
    expect(TerrainFieldSets.parse({ fields: { descriptor, tiles: ['1,0', '0,0'] } }).fields?.tiles).toEqual([
      '1,0',
      '0,0',
    ]);
    expect(CommandPayload.parse({ type: 'create_field_set', params: { descriptor } }).type).toBe(
      'create_field_set',
    );
    expect(CommandPayload.parse({ type: 'remove_field_set', params: { setId: 'fields' } }).type).toBe(
      'remove_field_set',
    );
  });
  it('rejects duplicate/outside refs, key mismatch, extra active data and global set count/budget', () => {
    for (const value of [
      { descriptor, tiles: ['0,0', '0,0'] },
      { descriptor, tiles: ['2,0'] },
      { descriptor, tiles: [], active: true },
    ])
      expect(TerrainFieldSetMetadata.safeParse(value).success).toBe(false);
    expect(TerrainFieldSets.safeParse({ wrong: { descriptor, tiles: [] } }).success).toBe(false);
    const many = Object.fromEntries(
      Array.from({ length: 5 }, (_, i) => [
        `s${i}`,
        { descriptor: { ...descriptor, id: `s${i}` }, tiles: [] },
      ]),
    );
    expect(TerrainFieldSets.safeParse(many).success).toBe(false);
    const large = { ...descriptor, width: 4096, height: 4096 };
    const sets = Object.fromEntries(
      ['a', 'b', 'c'].map((id) => [id, { descriptor: { ...large, id }, tiles: [] }]),
    );
    expect(TerrainFieldSets.safeParse(sets).success).toBe(false); // each64MiB allowed, aggregate192MiB rejected
  });
  it('rejects malformed inverse and field-coordinate bounds', () => {
    expect(
      CommandPayload.safeParse({
        type: 'restore_field_tile',
        params: { setId: 'fields', tx: 0, tz: 0, before: null },
      }).success,
    ).toBe(false);
    expect(
      CommandPayload.safeParse({ type: 'remove_field_tile', params: { setId: 'fields', tx: 32, tz: 0 } })
        .success,
    ).toBe(false);
  });
});
