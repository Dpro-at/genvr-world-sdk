import { describe, expect, it } from 'vitest';
import { WorldDocument } from '@genvr/contracts';
import { applyCommand, Block, createWorldState } from '../src/index.js';

const voxelState = () =>
  createWorldState(
    WorldDocument.parse({
      schemaVersion: 1,
      experienceId: 'exp-walls',
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

/** A 6 x 6 m room at x -30..-24, z -20..-14, door and window on the front (the first segment). */
const room = {
  type: 'draw_wall' as const,
  params: {
    wallId: 'w1',
    points: [
      [-30, -14],
      [-24, -14],
      [-24, -20],
      [-30, -20],
    ] as Array<[number, number]>,
    closed: true,
    height: 3,
    openings: [
      { id: 'door', kind: 'door' as const, segment: 0, offset: 2, width: 1.2, height: 2.2, bottom: 0 },
      { id: 'window', kind: 'window' as const, segment: 0, offset: 4.5, width: 1.2, height: 1.2, bottom: 1 },
    ],
  },
};

describe('walls on block ground (P2-26 stage 3)', () => {
  it('stands a wall of blocks with a flat top, a door, a window, and a plank floor', () => {
    const state = voxelState();
    const voxels = state.voxels!;
    applyCommand(state, room);
    const [floor] = voxels.roomFloors(state.doc.walls);
    const base = floor!.level;
    // Plank floor inside, level with the wall's base.
    expect(voxels.surfaceHeight(-27.5, -17.5)).toBe(base);
    expect(voxels.topBlock(-27.5, -17.5)).toBe('planks');
    // A plain wall column: solid up to base + 3, people stand on top of it.
    expect(voxels.block(-25, base + 2, -20)).toBe(Block.planks);
    expect(voxels.block(-25, base + 3, -20)).toBe(Block.air);
    expect(voxels.surfaceHeight(-24.5, -19.5)).toBe(base + 3);
    // The door (2 m in along the front): open for two blocks from the base, wall above it.
    expect(voxels.block(-28, base, -14)).toBe(Block.air);
    expect(voxels.block(-28, base + 1, -14)).toBe(Block.air);
    expect(voxels.block(-28, base + 2, -14)).toBe(Block.planks);
    expect(voxels.surfaceHeight(-27.5, -13.5)).toBe(base);
    // The window: open one block above the base, wall below and above it.
    expect(voxels.block(-26, base + 1, -14)).toBe(Block.air);
    expect(voxels.block(-26, base + 2, -14)).toBe(Block.planks);
    expect(voxels.wallAt(-25.5, -13.5)).toBe('w1');
    expect(voxels.wallAt(-27.5, -17.5)).toBeNull();
    expect(voxels.columnTop(-24.5, -19.5)).toBe(base + 3);
  });

  it('follows openings added later and gives the ground back when removed', () => {
    const state = voxelState();
    const voxels = state.voxels!;
    const before = voxels.surfaceHeight(-27.5, -17.5);
    const { params } = room;
    applyCommand(state, { type: 'draw_wall', params: { ...params, openings: [] } });
    const base = voxels.roomFloors(state.doc.walls)[0]!.level;
    expect(voxels.block(-28, base, -14)).not.toBe(Block.air);
    voxels.takeChanged();
    applyCommand(state, { type: 'add_wall_opening', params: { wallId: 'w1', opening: params.openings[0]! } });
    expect(voxels.block(-28, base, -14)).toBe(Block.air);
    expect(voxels.takeChanged().length).toBeGreaterThan(0);
    applyCommand(state, { type: 'remove_wall', params: { wallId: 'w1' } });
    expect(voxels.surfaceHeight(-27.5, -17.5)).toBe(before);
    expect(voxels.wallAt(-25.5, -13.5)).toBeNull();
  });
});
