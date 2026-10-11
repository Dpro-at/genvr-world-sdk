import { describe, expect, it } from 'vitest';
import { PLAYER_BLOCKS, WorldDocument } from '@genvr/contracts';
import {
  applyCommand,
  applyPlayerBlocks,
  Block,
  createWorldState,
  storedPlayerAuthors,
  VoxelData,
  withoutPlayerAuthor,
  type PlayerBuilder,
} from '../src/index.js';

const doc = () =>
  WorldDocument.parse({
    schemaVersion: 1,
    experienceId: 'exp-players',
    version: 0,
    style: { base: 'voxel' },
    sizeTier: 'small',
    access: { mode: 'public' },
    environment: { sky: { preset: 'day' }, weather: { preset: 'clear' } },
    terrain: {},
    voxels: { seed: 1234, generator: 1 },
    spawn: { position: [0.5, 8, 0.5] },
  });

/** A dry column away from the spawn, and a builder standing on it. */
function setup(share: number = PLAYER_BLOCKS.defaultShare) {
  const state = createWorldState(doc());
  const voxels = state.voxels!;
  let x = 20;
  while (voxels.waterSurface(x, 20) !== null || voxels.waterSurface(x + 1, 20) !== null) x += 1;
  const ground = voxels.surfaceHeight(x, 20);
  const builder = (author: string): PlayerBuilder => ({
    author,
    share,
    position: [x + 0.5, ground, 20.5],
    spawn: [0.5, 8, 0.5],
  });
  return { state, voxels, x, z: 20, ground, builder };
}

describe("building with the avatar's hands (P2-28, decision 109)", () => {
  it("places and digs player blocks, counted per author, and keeps them out of the owner's edits", () => {
    const { voxels, x, z, ground, builder } = setup();
    const placed = applyPlayerBlocks(voxels, [[x, ground, z, Block.planks]], builder('ann'));
    expect(placed.ok).toBe(true);
    expect(voxels.surfaceHeight(x, z)).toBe(ground + 1);
    expect(voxels.playerCell(x, ground, z)).toEqual({ block: Block.planks, author: 'ann' });
    expect(voxels.playerBlockCount('ann')).toBe(1);
    expect(voxels.editedChunks()).toEqual([]);
    expect(voxels.editedLow(0, 0)).toBe(ground);
    // Digging natural ground is a player block too (air), and digging your own block frees it.
    expect(applyPlayerBlocks(voxels, [[x + 1, ground - 1, z, Block.air]], builder('ann')).ok).toBe(true);
    expect(voxels.playerBlockCount('ann')).toBe(2);
    expect(applyPlayerBlocks(voxels, [[x, ground, z, Block.air]], builder('ann')).ok).toBe(true);
    expect(voxels.playerCell(x, ground, z)).toBeNull();
    expect(voxels.playerBlockCount('ann')).toBe(1);
    expect(voxels.playerBlockCount()).toBe(1);
  });

  it("protects the owner's building, other players' blocks, the spawn, and far blocks", () => {
    const { state, voxels, x, z, ground, builder } = setup();
    applyCommand(state, { type: 'set_blocks', params: { blocks: [[x, ground, z, Block.cobble]] } });
    expect(applyPlayerBlocks(voxels, [[x, ground, z, Block.air]], builder('ann'))).toEqual({
      ok: false,
      message: "That is the owner's building.",
    });
    expect(applyPlayerBlocks(voxels, [[x + 1, ground, z, Block.planks]], builder('ann')).ok).toBe(true);
    expect(applyPlayerBlocks(voxels, [[x + 1, ground, z, Block.air]], builder('bob'))).toEqual({
      ok: false,
      message: "That is another player's block.",
    });
    expect(applyPlayerBlocks(voxels, [[x + 1, ground, z, Block.sand]], builder('bob')).ok).toBe(false);
    const far = applyPlayerBlocks(voxels, [[x + 10, ground + 3, z, Block.planks]], builder('ann'));
    expect(far).toEqual({ ok: false, message: 'That is too far away.' });
    const nearSpawn = applyPlayerBlocks(voxels, [[1, voxels.surfaceHeight(1, 1), 1, Block.planks]], {
      ...builder('ann'),
      position: [1.5, voxels.surfaceHeight(1, 1), 1.5],
    });
    expect(nearSpawn).toEqual({ ok: false, message: 'Nobody builds next to the start point.' });
    expect(applyPlayerBlocks(voxels, [[x, ground + 1, z, Block.water]], builder('ann')).ok).toBe(false);
  });

  it('keeps each player to their share, all or nothing', () => {
    const { voxels, x, z, ground, builder } = setup(PLAYER_BLOCKS.minShare);
    const column = Array.from({ length: 5 }, (_, i): [number, number, number, number] => [
      x,
      ground + i,
      z,
      Block.planks,
    ]);
    for (let n = 0; n < PLAYER_BLOCKS.minShare; n += 1)
      voxels.setPlayerBlocks([[x + 2, ground + (n % 5), z + 2 + Math.floor(n / 5), Block.sand]], 'ann');
    expect(voxels.playerBlockCount('ann')).toBe(PLAYER_BLOCKS.minShare);
    const full = applyPlayerBlocks(voxels, column, builder('ann'));
    expect(full.ok).toBe(false);
    expect(voxels.playerCell(x, ground, z)).toBeNull();
    expect(applyPlayerBlocks(voxels, column, builder('bob')).ok).toBe(true);
  });

  it("gives way to the owner: a studio edit replaces a player block, and its undo does not bring it back as the owner's", () => {
    const { state, voxels, x, z, ground, builder } = setup();
    applyPlayerBlocks(voxels, [[x, ground, z, Block.planks]], builder('ann'));
    const edit = applyCommand(state, {
      type: 'set_blocks',
      params: { blocks: [[x, ground, z, Block.cobble]] },
    });
    expect(voxels.playerCell(x, ground, z)).toBeNull();
    expect(voxels.playerBlockCount('ann')).toBe(0);
    applyCommand(state, edit.inverse);
    expect(voxels.block(x, ground, z)).toBe(Block.air);
    expect(voxels.editedChunks()).toEqual([]);
  });

  it('stores player blocks per chunk with their authors, and without them for clients', () => {
    const { voxels, x, z, ground, builder } = setup();
    applyPlayerBlocks(voxels, [[x, ground, z, Block.planks]], builder('ann'));
    applyPlayerBlocks(voxels, [[x + 1, ground, z, Block.sand]], builder('bob'));
    expect(voxels.takePlayerDirty()).toEqual(['0,0']);
    const stored = voxels.encodePlayerBlocks(0, 0)!;
    const copy = new VoxelData(voxels.half, voxels.settings);
    copy.loadPlayerBlocks(stored);
    expect(copy.playerCell(x, ground, z)).toEqual({ block: Block.planks, author: 'ann' });
    expect(copy.playerBlockCount('bob')).toBe(1);
    expect(copy.takePlayerDirty()).toEqual([]);
    const shared = new VoxelData(voxels.half, voxels.settings);
    shared.loadPlayerBlocks(voxels.encodePlayerBlocks(0, 0, false)!);
    expect(shared.playerCell(x + 1, ground, z)).toEqual({ block: Block.sand, author: '' });
    expect(voxels.encodePlayerBlocks(0, 0, false)).not.toContain('ann');
    voxels.clearPlayerBlocks();
    expect(voxels.playerBlockCount()).toBe(0);
    expect(voxels.block(x, ground, z)).toBe(Block.air);
  });

  it('merges stored player blocks into free cells only, keeping the blocks already there', () => {
    const { voxels, x, z, ground, builder } = setup();
    // Stored earlier: ann's planks at two cells.
    applyPlayerBlocks(voxels, [[x, ground, z, Block.planks]], builder('ann'));
    applyPlayerBlocks(voxels, [[x + 1, ground, z, Block.planks]], builder('ann'));
    const stored = voxels.encodePlayerBlocks(0, 0)!;
    // The room built since: bob's sand at one of those cells.
    const room = new VoxelData(voxels.half, voxels.settings);
    room.setPlayerBlocks([[x, ground, z, Block.sand]], 'bob');
    room.takePlayerDirty();
    room.loadPlayerBlocks(stored, { keep: true });
    expect(room.playerCell(x, ground, z)).toEqual({ block: Block.sand, author: 'bob' });
    expect(room.playerCell(x + 1, ground, z)).toEqual({ block: Block.planks, author: 'ann' });
    expect(room.playerBlockCount('ann')).toBe(1);
    expect(room.playerBlockCount('bob')).toBe(1);
  });

  it("lists who built how much and removes one player's building in one step (stage 3)", () => {
    const { voxels, x, z, ground, builder } = setup();
    applyPlayerBlocks(
      voxels,
      [
        [x, ground, z, Block.planks],
        [x, ground + 1, z, Block.planks],
      ],
      builder('ann'),
    );
    applyPlayerBlocks(voxels, [[x + 1, ground, z, Block.sand]], builder('bob'));
    expect(voxels.playerAuthors()).toEqual([
      { author: 'ann', blocks: 2 },
      { author: 'bob', blocks: 1 },
    ]);
    const near = voxels.playerBlocksNear(x + 0.5, ground, z + 0.5, 3);
    expect(near.map((cell) => cell.author).sort()).toEqual(['ann', 'ann', 'bob']);
    expect(voxels.playerBlocksNear(x + 40, ground, z, 3)).toEqual([]);
    voxels.takePlayerDirty();
    expect(voxels.removePlayerBlocksBy('ann')).toBe(2);
    expect(voxels.block(x, ground, z)).toBe(Block.air);
    expect(voxels.playerCell(x + 1, ground, z)).toEqual({ block: Block.sand, author: 'bob' });
    expect(voxels.playerAuthors()).toEqual([{ author: 'bob', blocks: 1 }]);
    expect(voxels.takePlayerDirty()).toEqual(['0,0']);
    expect(voxels.removePlayerBlocksBy('nobody')).toBe(0);
  });

  it('counts and removes one author in stored chunks without a room', () => {
    const { voxels, x, z, ground, builder } = setup();
    applyPlayerBlocks(voxels, [[x, ground, z, Block.planks]], builder('ann'));
    applyPlayerBlocks(
      voxels,
      [
        [x + 1, ground, z, Block.sand],
        [x + 2, ground, z, Block.sand],
      ],
      builder('bob'),
    );
    applyPlayerBlocks(voxels, [[x + 3, ground, z, Block.planks]], builder('cy'));
    const stored = voxels.encodePlayerBlocks(0, 0)!;
    expect(Object.fromEntries(storedPlayerAuthors(stored))).toEqual({ ann: 1, bob: 2, cy: 1 });
    const left = withoutPlayerAuthor(stored, 'bob');
    expect(left.blocks).toBe(2);
    const copy = new VoxelData(voxels.half, voxels.settings);
    copy.loadPlayerBlocks(left.data!);
    expect(copy.playerCell(x, ground, z)).toEqual({ block: Block.planks, author: 'ann' });
    expect(copy.playerCell(x + 1, ground, z)).toBeNull();
    expect(copy.playerCell(x + 3, ground, z)).toEqual({ block: Block.planks, author: 'cy' });
    expect(withoutPlayerAuthor(stored, 'nobody')).toEqual({ data: stored, blocks: 4 });
    const alone = voxels.encodePlayerBlocks(0, 0)!;
    voxels.removePlayerBlocksBy('bob');
    voxels.removePlayerBlocksBy('cy');
    expect(withoutPlayerAuthor(voxels.encodePlayerBlocks(0, 0)!, 'ann')).toEqual({ data: null, blocks: 0 });
    expect(alone).toBe(stored);
  });
});
