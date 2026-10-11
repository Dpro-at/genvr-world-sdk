import { PLAYER_BLOCKS } from '@genvr/contracts';
import { Block, BLOCKS, VOXEL_LAYERS, VOXEL_MIN_Y, VOXEL_WATER_LEVEL } from './voxel-generator.js';
import type { VoxelData } from './voxel-data.js';

/** Who asks to place or dig, and the limits that apply to them (decision 109). */
export interface PlayerBuilder {
  /** Account of the player (the author of their blocks). */
  author: string;
  /** Blocks this player may have in the place. */
  share: number;
  /** Where the player stands (feet). */
  position: readonly [number, number, number];
  /** The place's spawn point: nobody builds near it. */
  spawn: readonly [number, number, number];
}

export type PlayerBlocksResult =
  { ok: true; blocks: Array<[number, number, number, number]> } | { ok: false; message: string };

/**
 * Checks a player's place or dig request against the rules of building with the avatar's hands
 * (decision 109) and applies it when every block is allowed; nothing changes otherwise. Placing
 * fills air or water; digging removes natural ground or the player's own blocks, never the
 * owner's building (edits, roads, walls) or other players' blocks. Digging next to water lets
 * the water in, as in the studio.
 */
export function applyPlayerBlocks(
  voxels: VoxelData,
  request: ReadonlyArray<readonly [number, number, number, number]>,
  builder: PlayerBuilder,
): PlayerBlocksResult {
  const wanted = new Map<string, [number, number, number, number]>();
  let added = 0;
  for (const [x, y, z, block] of request) {
    if (!voxels.inside(x, z) || y <= VOXEL_MIN_Y || y >= VOXEL_MIN_Y + VOXEL_LAYERS)
      return { ok: false, message: 'That is outside the place.' };
    if (block >= BLOCKS.length || block === Block.water)
      return { ok: false, message: 'That block cannot be placed.' };
    const [px, py, pz] = builder.position;
    // From about the player's chest to the middle of the block.
    if (Math.hypot(x + 0.5 - px, y + 0.5 - (py + 1.2), z + 0.5 - pz) > PLAYER_BLOCKS.reach)
      return { ok: false, message: 'That is too far away.' };
    if (Math.hypot(x + 0.5 - builder.spawn[0], z + 0.5 - builder.spawn[2]) < PLAYER_BLOCKS.spawnRadius)
      return { ok: false, message: 'Nobody builds next to the start point.' };
    const key = `${x},${y},${z}`;
    const now = wanted.get(key)?.[3] ?? voxels.block(x, y, z);
    const cell = voxels.playerCell(x, y, z);
    const mine = cell?.author === builder.author;
    if (block === Block.air) {
      if (now === Block.air || now === Block.water)
        return { ok: false, message: 'There is nothing to dig there.' };
      if (cell ? !mine : !voxels.natural(x, y, z))
        return {
          ok: false,
          message: cell ? "That is another player's block." : "That is the owner's building.",
        };
    } else if (now !== Block.air && now !== Block.water) {
      return { ok: false, message: 'There is a block there already.' };
    }
    const flooded =
      block === Block.air &&
      y < VOXEL_WATER_LEVEL &&
      [
        voxels.block(x, y + 1, z),
        voxels.block(x + 1, y, z),
        voxels.block(x - 1, y, z),
        voxels.block(x, y, z + 1),
        voxels.block(x, y, z - 1),
      ].includes(Block.water);
    const next = flooded ? Block.water : block;
    // The share counts the player's blocks in the place: a new one adds, digging their own frees.
    const before = mine ? 1 : 0;
    const after = next === voxels.ownerBlock(x, y, z) ? 0 : 1;
    if (!wanted.has(key)) added += after - before;
    wanted.set(key, [x, y, z, next]);
  }
  if (added > 0 && voxels.playerBlockCount(builder.author) + added > builder.share)
    return {
      ok: false,
      message: `You have used your ${builder.share} blocks here. Dig some of yours first.`,
    };
  if (added > 0 && voxels.playerBlockCount() + added > PLAYER_BLOCKS.perPlace)
    return { ok: false, message: 'This place is full of player blocks.' };
  const blocks = [...wanted.values()];
  voxels.setPlayerBlocks(blocks, builder.author);
  return { ok: true, blocks };
}
