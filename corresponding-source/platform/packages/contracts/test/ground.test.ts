import { describe, expect, it } from 'vitest';
import { CommandPayload, COMMAND_TYPES, StyleSelection, WorldDocument } from '../src/index.js';
import { emptyWorld } from './fixtures.js';

const area = [
  [0, 0],
  [4, 0],
  [4, 4],
];
const grass = { id: 'genvr.core.ground.grass-005', soil: 'grass' };

describe('realistic ground contracts (P2-37)', () => {
  it('paints with a soil or a ground material', () => {
    expect(
      CommandPayload.safeParse({ type: 'paint_terrain', params: { area, soilId: 'sand' } }).success,
    ).toBe(true);
    expect(
      CommandPayload.safeParse({ type: 'paint_terrain', params: { area, soilId: 'grass', material: grass } })
        .success,
    ).toBe(true);
    expect(
      CommandPayload.safeParse({
        type: 'paint_terrain',
        params: { area, soilId: 'grass', material: { id: grass.id, soil: 'lava' } },
      }).success,
    ).toBe(false);
  });

  it('sets a ground material for one of 16 slots', () => {
    expect(COMMAND_TYPES).toContain('set_ground_material');
    expect(
      CommandPayload.safeParse({ type: 'set_ground_material', params: { slot: 0, material: grass } }).success,
    ).toBe(true);
    expect(
      CommandPayload.safeParse({ type: 'set_ground_material', params: { slot: 6, material: null } }).success,
    ).toBe(true);
    expect(
      CommandPayload.safeParse({ type: 'set_ground_material', params: { slot: 16, material: grass } })
        .success,
    ).toBe(false);
  });

  it('keeps a palette in the world document', () => {
    const world = { ...emptyWorld, terrain: { materials: { '6': grass } } };
    expect(WorldDocument.safeParse(world).success).toBe(true);
    expect(WorldDocument.safeParse({ ...emptyWorld, terrain: { materials: { '16': grass } } }).success).toBe(
      false,
    );
    expect(WorldDocument.safeParse(emptyWorld).success).toBe(true);
  });

  it('keeps the snow line and rock on slopes in the style', () => {
    expect(StyleSelection.safeParse({ base: 'realistic', snowLine: 80, autoRock: true }).success).toBe(true);
    expect(StyleSelection.safeParse({ base: 'realistic', snowLine: null }).success).toBe(true);
  });
});
