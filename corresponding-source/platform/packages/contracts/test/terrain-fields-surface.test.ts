import { expect, it } from 'vitest';
import { TerrainActiveSurface } from '../src/terrain-fields.js';
import { CommandPayload } from '../src/commands.js';
const surface = { setId: 'fields', outsideHeight: -90, edge: 'constant', farEdge: 'exclusive' };
it('keeps a bounded generic surface wire contract and normal nullable command', () => {
  expect(CommandPayload.parse({ type: 'set_terrain_surface', params: { surface } }).params).toEqual({
    surface,
  });
  expect(CommandPayload.parse({ type: 'set_terrain_surface', params: { surface: null } }).params).toEqual({
    surface: null,
  });
  for (const extra of [
    { outsideHeight: NaN },
    { outsideHeight: 451 },
    { edge: 'guess' },
    { heightChannel: 'h' },
  ])
    expect(TerrainActiveSurface.safeParse({ ...surface, ...extra }).success).toBe(false);
  const material = { itemId: 'tidewater-rock', inputs: { rock: { channel: 'rock', scale: 1 } } };
  expect(TerrainActiveSurface.parse({ ...surface, materialBindings: [material] }).materialBindings).toEqual([
    material,
  ]);
  for (const scale of [Infinity, NaN, 1e6])
    expect(
      TerrainActiveSurface.safeParse({
        ...surface,
        materialBindings: [{ ...material, inputs: { rock: { channel: 'rock', scale } } }],
      }).success,
    ).toBe(false);
  expect(
    TerrainActiveSurface.safeParse({
      ...surface,
      materialBindings: [{ ...material, itemId: 'invalid item!' }],
    }).success,
  ).toBe(false);
});
