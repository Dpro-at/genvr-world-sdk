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
export type PlayerBlocksResult = {
    ok: true;
    blocks: Array<[number, number, number, number]>;
} | {
    ok: false;
    message: string;
};
/**
 * Checks a player's place or dig request against the rules of building with the avatar's hands
 * (decision 109) and applies it when every block is allowed; nothing changes otherwise. Placing
 * fills air or water; digging removes natural ground or the player's own blocks, never the
 * owner's building (edits, roads, walls) or other players' blocks. Digging next to water lets
 * the water in, as in the studio.
 */
export declare function applyPlayerBlocks(voxels: VoxelData, request: ReadonlyArray<readonly [number, number, number, number]>, builder: PlayerBuilder): PlayerBlocksResult;
