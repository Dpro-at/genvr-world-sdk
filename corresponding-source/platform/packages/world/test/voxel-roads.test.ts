import { describe, expect, it } from 'vitest';
import { WorldDocument } from '@genvr/contracts';
import {
  applyCommand,
  Block,
  createWorldState,
  VOXEL_ROAD_SHOULDER,
  VOXEL_WATER_LEVEL,
  VoxelData,
} from '../src/index.js';

const voxelState = () =>
  createWorldState(
    WorldDocument.parse({
      schemaVersion: 1,
      experienceId: 'exp-roads',
      version: 0,
      style: { base: 'voxel' },
      sizeTier: 'small',
      access: { mode: 'public' },
      environment: { sky: { preset: 'day' }, weather: { preset: 'clear' } },
      terrain: {},
      voxels: { seed: 1234, generator: 1 },
      spawn: { position: [0, 8, 0] },
    }),
  );

const road = (roadId: string, points: Array<[number, number]>, materialId: string, width = 4) => ({
  type: 'draw_road' as const,
  params: { roadId, points, width, materialId },
});

describe('roads on block ground (P2-26 stage 2)', () => {
  it('lays a flat bed of the road type blocks that climbs in single steps', () => {
    const state = voxelState();
    const voxels = state.voxels!;
    const before = voxels.surfaceHeight(-60, -30);
    applyCommand(
      state,
      road(
        'r1',
        [
          [-80, -30],
          [80, -30],
        ],
        'genvr.core.road.street',
      ),
    );
    let last: number | null = null;
    let lastStepX = -Infinity;
    for (let x = -78; x < 78; x += 1) {
      // Paving tiles across the whole width, all at one height.
      const heights = [-31, -30, -29].map((z) => voxels.surfaceHeight(x, z));
      expect(new Set(heights).size, `x ${x}`).toBe(1);
      expect(voxels.topBlock(x, -30)).toBe('paving');
      const h = heights[0]!;
      if (last !== null && h !== last) {
        expect(Math.abs(h - last)).toBe(1);
        expect(x - lastStepX).toBeGreaterThanOrEqual(2);
        lastStepX = x;
      }
      last = h;
    }
    // Removing the road gives the ground back.
    applyCommand(state, { type: 'remove_road', params: { roadId: 'r1' } });
    expect(voxels.surfaceHeight(-60, -30)).toBe(before);
    expect(voxels.topBlock(-60, -30)).not.toBe('paving');
  });

  it('steps the ground beside the road toward the bed', () => {
    const state = voxelState();
    const voxels = state.voxels!;
    applyCommand(
      state,
      road(
        'r2',
        [
          [-60, 20],
          [60, 20],
        ],
        'genvr.core.road.dirt',
      ),
    );
    for (let x = -50; x < 50; x += 3) {
      const bed = voxels.surfaceHeight(x, 20);
      expect(voxels.topBlock(x, 20)).toBe('path');
      for (let side = 1; side <= VOXEL_ROAD_SHOULDER; side += 1) {
        // Width 4: the bed ends 2 m from the line; this column's middle is side - 0.5 m beyond it.
        const z = 21 + side;
        expect(Math.abs(voxels.surfaceHeight(x, z) - bed), `${x}, ${z}`).toBeLessThanOrEqual(side);
      }
    }
  });

  it('crosses the lake on a causeway one block above the water', () => {
    const state = voxelState();
    const voxels = state.voxels!;
    expect(voxels.waterSurface(0, 44)).toBe(VOXEL_WATER_LEVEL);
    applyCommand(
      state,
      road(
        'r3',
        [
          [-50, 44],
          [50, 44],
        ],
        'genvr.core.road.fantasy',
      ),
    );
    expect(voxels.waterSurface(0, 44)).toBeNull();
    expect(voxels.surfaceHeight(0, 44)).toBe(VOXEL_WATER_LEVEL + 1);
    expect(voxels.block(0, VOXEL_WATER_LEVEL, 44)).toBe(Block.brick);
    // Water stays beside the causeway.
    expect(voxels.waterSurface(0, 52)).toBe(VOXEL_WATER_LEVEL);
  });

  it('reports the chunks a road changed and makes the same blocks everywhere', () => {
    const state = voxelState();
    const voxels = state.voxels!;
    voxels.takeChanged();
    applyCommand(
      state,
      road(
        'r4',
        [
          [5, 5],
          [40, 5],
        ],
        'genvr.core.road.path',
        2.5,
      ),
    );
    const changed = voxels.takeChanged();
    expect(changed).toContain('0,0');
    expect(changed).toContain('1,0');
    expect(voxels.takeChanged()).toEqual([]);
    // A second copy (the server, another player) from the saved document agrees.
    const other = new VoxelData(250, { seed: 1234, generator: 1 });
    other.setRoads(state.doc.roads);
    for (let x = 0; x < 45; x += 1) {
      expect(other.surfaceHeight(x, 5)).toBe(voxels.surfaceHeight(x, 5));
      expect(other.topBlock(x, 5)).toBe(voxels.topBlock(x, 5));
    }
    expect(voxels.topBlock(20, 5)).toBe('gravel');
  });
});
