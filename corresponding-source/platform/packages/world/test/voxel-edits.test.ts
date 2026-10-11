import { describe, expect, it } from 'vitest';
import { WorldDocument } from '@genvr/contracts';
import {
  applyCommand,
  Block,
  CommandHistory,
  createWorldState,
  encodeTerrain,
  VOXEL_MIN_Y,
  VOXEL_WATER_LEVEL,
} from '../src/index.js';

const doc = () =>
  WorldDocument.parse({
    schemaVersion: 1,
    experienceId: 'exp-edits',
    version: 0,
    style: { base: 'voxel' },
    sizeTier: 'small',
    access: { mode: 'public' },
    environment: { sky: { preset: 'day' }, weather: { preset: 'clear' } },
    terrain: {},
    voxels: { seed: 1234, generator: 1 },
    spawn: { position: [0, 8, 0] },
  });

const set = (blocks: Array<[number, number, number, number]>) => ({
  type: 'set_blocks' as const,
  params: { blocks },
});

describe('digging and stacking (P2-26)', () => {
  it('stacks and digs blocks, and undo puts them back', () => {
    const state = createWorldState(doc());
    const voxels = state.voxels!;
    const ground = voxels.surfaceHeight(3, 5);
    // Stack two planks on the ground.
    const stacked = applyCommand(
      state,
      set([
        [3, ground, 5, Block.planks],
        [3, ground + 1, 5, Block.planks],
      ]),
    );
    expect(voxels.surfaceHeight(3, 5)).toBe(ground + 2);
    expect(voxels.topBlock(3, 5)).toBe('planks');
    expect([...stacked.changedChunks]).toEqual(['v:0,0']);
    // Dig the top ground block of a neighbor.
    applyCommand(state, set([[4, ground - 1, 5, Block.air]]));
    expect(voxels.surfaceHeight(4, 5)).toBe(ground - 1);
    // Undo both: the ground is as generated again, and no edits are left to store.
    applyCommand(state, stacked.inverse);
    applyCommand(state, set([[4, ground - 1, 5, voxels.baseBlock(4, ground - 1, 5)]]));
    expect(voxels.surfaceHeight(3, 5)).toBe(ground);
    expect(voxels.surfaceHeight(4, 5)).toBe(ground);
    expect(voxels.editedChunks()).toEqual([]);
  });

  it('works with the undo history', () => {
    const state = createWorldState(doc());
    const history = new CommandHistory(state);
    const ground = state.voxels!.surfaceHeight(6, 2);
    history.execute(set([[6, ground, 2, Block.brick]]));
    expect(state.voxels!.block(6, ground, 2)).toBe(Block.brick);
    history.undo();
    expect(state.voxels!.block(6, ground, 2)).toBe(Block.air);
    history.redo();
    expect(state.voxels!.block(6, ground, 2)).toBe(Block.brick);
  });

  it('stores edits per chunk and loads them back', () => {
    const state = createWorldState(doc());
    const ground = state.voxels!.surfaceHeight(40, -20);
    const result = applyCommand(
      state,
      set([
        [40, ground, -20, Block.cobble],
        [41, ground, -20, Block.cobble],
        [40, ground - 1, -21, Block.air],
      ]),
    );
    const stored = encodeTerrain(state, result.changedChunks);
    expect(stored.map((row) => row.key)).toEqual(['v:1,-1']);
    expect(stored[0]!.data).toContain('"kind":"voxel-edits"');
    // Everything stored (no keys) includes the edits too.
    expect(encodeTerrain(state).map((row) => row.key)).toEqual(['v:1,-1']);
    const loaded = createWorldState(
      doc(),
      stored.map((row) => row.data),
    );
    expect(loaded.voxels!.block(41, ground, -20)).toBe(Block.cobble);
    expect(loaded.voxels!.surfaceHeight(40, -21)).toBe(ground - 1);
    // Taking every edit away stores an empty row (the saver deletes it).
    applyCommand(state, result.inverse);
    expect(encodeTerrain(state, result.changedChunks)).toEqual([{ key: 'v:1,-1', data: '' }]);
  });

  it('lets water into holes dug under the lake and keeps the bottom layer', () => {
    const state = createWorldState(doc());
    const voxels = state.voxels!;
    const floor = voxels.surfaceHeight(0, 44);
    expect(floor).toBeLessThan(VOXEL_WATER_LEVEL);
    applyCommand(state, set([[0, floor - 1, 44, Block.air]]));
    expect(voxels.block(0, floor - 1, 44)).toBe(Block.water);
    expect(voxels.waterSurface(0, 44)).toBe(VOXEL_WATER_LEVEL);
    expect(() => applyCommand(state, set([[0, VOXEL_MIN_Y, 0, Block.air]]))).toThrow(/Blocks go from/);
    expect(() => applyCommand(state, set([[400, 5, 0, Block.dirt]]))).toThrow(/outside/);
  });

  it('refuses blocks in places without block ground', () => {
    const plain = { ...doc(), voxels: undefined };
    expect(() => applyCommand(createWorldState(plain), set([[0, 1, 0, Block.dirt]]))).toThrow(/block ground/);
  });
});

describe('where a player stands near a height (exit spots)', () => {
  it('stands under a roof on the floor, not on the roof', () => {
    const state = createWorldState(doc());
    const voxels = state.voxels!;
    const ground = voxels.surfaceHeight(3, 5);
    // A roof block 3 m above the ground: the column's top is the roof.
    voxels.setBlocks([[3, ground + 3, 5, Block.planks]]);
    expect(voxels.surfaceHeight(3, 5)).toBe(ground + 4);
    expect(voxels.standHeight(3.5, 5.5, ground, 3)).toBe(ground);
    // Standing on the roof when the height asked about is up there.
    expect(voxels.standHeight(3.5, 5.5, ground + 4, 3)).toBe(ground + 4);
  });

  it('stands on a low wall only when there is nothing lower, never on one above the climb', () => {
    const state = createWorldState(doc());
    const voxels = state.voxels!;
    const ground = voxels.surfaceHeight(3, 5);
    voxels.setBlocks([
      [3, ground, 5, Block.planks],
      [3, ground + 1, 5, Block.planks],
    ]);
    // A 2 m wall column: its top is the only place to stand there.
    expect(voxels.standHeight(3.5, 5.5, ground, 3)).toBe(ground + 2);
    // A 5 m wall is out of the climb: the column's surface (the caller tries another way).
    voxels.setBlocks([
      [3, ground + 2, 5, Block.planks],
      [3, ground + 3, 5, Block.planks],
      [3, ground + 4, 5, Block.planks],
    ]);
    expect(voxels.standHeight(3.5, 5.5, ground, 3)).toBe(ground + 5);
  });

  it('needs two free blocks above a floor', () => {
    const state = createWorldState(doc());
    const voxels = state.voxels!;
    const ground = voxels.surfaceHeight(3, 5);
    // A ceiling 1 m over the ground: no room to stand under it, so on it.
    voxels.setBlocks([[3, ground + 1, 5, Block.planks]]);
    expect(voxels.standHeight(3.5, 5.5, ground, 3)).toBe(ground + 2);
  });
});
