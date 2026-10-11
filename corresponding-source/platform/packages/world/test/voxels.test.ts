import { describe, expect, it } from 'vitest';
import { WorldDocument } from '@genvr/contracts';
import {
  applyCommand,
  Block,
  createWorldState,
  generateColumns,
  VoxelData,
  VOXEL_EDGE_HEIGHT,
  VOXEL_WATER_LEVEL,
} from '../src/index.js';

const voxelDoc = () =>
  WorldDocument.parse({
    schemaVersion: 1,
    experienceId: 'exp-voxel',
    version: 0,
    style: { base: 'voxel' },
    sizeTier: 'small',
    access: { mode: 'public' },
    environment: { sky: { preset: 'day' }, weather: { preset: 'clear' } },
    terrain: {},
    voxels: { seed: 1234, generator: 1 },
    spawn: { position: [0, 8, 0] },
  });

describe('voxel ground', () => {
  it('makes the same columns from the same seed', () => {
    const a = generateColumns(42, 250, -1, -2);
    const b = generateColumns(42, 250, -1, -2);
    expect(Array.from(a.ground)).toEqual(Array.from(b.ground));
    expect(Array.from(a.top)).toEqual(Array.from(b.top));
    expect(Array.from(generateColumns(43, 250, -1, -2).ground)).not.toEqual(Array.from(a.ground));
  });

  it('has a lake in front of the spawn and mountains behind it', () => {
    const voxels = new VoxelData(250, { seed: 1234, generator: 1 });
    // Lake center: under water, with water up to the water level.
    expect(voxels.waterSurface(0, 44)).toBe(VOXEL_WATER_LEVEL);
    expect(voxels.surfaceHeight(0, 44)).toBeLessThan(VOXEL_WATER_LEVEL);
    // The spawn stands on dry grass.
    expect(voxels.waterSurface(0, 0)).toBeNull();
    expect(voxels.surfaceHeight(0, 0)).toBeGreaterThan(VOXEL_WATER_LEVEL);
    // The mountain range reaches far higher than the hills, with snow on the tops.
    let highest = 0;
    let snow = 0;
    for (let x = -240; x < 240; x += 4)
      for (let z = 120; z < 240; z += 4) {
        highest = Math.max(highest, voxels.surfaceHeight(x, z));
        if (voxels.topBlock(x, z) === 'snow') snow += 1;
      }
    expect(highest).toBeGreaterThan(35);
    expect(snow).toBeGreaterThan(0);
    // The border meets the flat ground outside.
    expect(voxels.surfaceHeight(249, 0)).toBe(VOXEL_EDGE_HEIGHT);
    expect(voxels.surfaceHeight(400, 0)).toBe(VOXEL_EDGE_HEIGHT);
  });

  it('fills chunks from the columns', () => {
    const voxels = new VoxelData(250, { seed: 1234, generator: 1 });
    const x = 3;
    const z = 5;
    const ground = voxels.surfaceHeight(x, z);
    expect(voxels.solidAt(x, ground - 1, z)).toBe(true);
    expect(voxels.block(x, ground - 1, z)).toBe(Block[voxels.topBlock(x, z)]);
    expect(voxels.block(x, ground, z)).toBe(Block.air);
    expect(voxels.block(x, -16, z)).toBe(Block.stone);
    expect(voxels.block(300, 0, 0)).toBe(Block.air);
    // Water blocks between the lake floor and the water level.
    const floor = voxels.surfaceHeight(0, 44);
    expect(voxels.block(0, floor, 44)).toBe(Block.water);
    expect(voxels.block(0, VOXEL_WATER_LEVEL, 44)).toBe(Block.air);
  });

  it('keeps height field tools out of block places', () => {
    const state = createWorldState(voxelDoc());
    expect(state.voxels).toBeInstanceOf(VoxelData);
    expect(() =>
      applyCommand(state, {
        type: 'sculpt_terrain',
        params: {
          area: [
            [0, 0],
            [4, 0],
            [4, 4],
          ],
          operation: 'raise',
          strength: 1,
        },
      }),
    ).toThrow(/block ground/);
    const placed = applyCommand(state, {
      type: 'place_item',
      params: {
        instanceId: 'i1',
        itemId: 'genvr.core.nature.pine-tree',
        position: [0, voxels(state).surfaceHeight(0, 0), 0],
      },
    });
    expect(placed.inverse.type).toBe('remove_item');
  });
});

const voxels = (state: ReturnType<typeof createWorldState>) => state.voxels!;
