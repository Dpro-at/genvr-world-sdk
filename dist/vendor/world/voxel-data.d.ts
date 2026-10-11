/**
 * Block ground of Voxel places (P2-26, decision 98): a grid of 1 m blocks in chunks of 32 x 32
 * columns and VOXEL_LAYERS layers. Pure data with no three.js, so the same blocks exist in the
 * browser, on the server, and in tests.
 *
 * Columns (ground height, water, top block) come from the seeded generator and are cheap; the
 * full block array of a chunk is made only when something needs it (drawing and physics near the
 * player) and can be released again.
 */
import type { Road, VoxelGround, Wall } from '../contracts/index.js';
import { type BlockName, type VoxelColumns } from './voxel-generator.js';
import { type Soil } from './terrain-data.js';
export * from './voxel-generator.js';
export * from './voxel-roads.js';
export * from './voxel-walls.js';
/**
 * The soil each block counts as (placement rules and footstep sounds read soils).
 */
export declare const BLOCK_SOILS: Readonly<Record<BlockName, Soil>>;
/** Marks stored block edits among a place's stored chunks. */
export declare const VOXEL_EDITS_KIND = "voxel-edits";
/** Storage key of a chunk's block edits (height field chunks use "cx,cz"). */
export declare const voxelEditsKey: (cx: number, cz: number) => string;
/** Stored player blocks of a chunk (decision 109), with the account of each block's author. */
export declare const PLAYER_BLOCKS_KIND = "player-blocks";
/** A block a player placed or dug with the avatar's hands, and who did it. */
export interface PlayerCell {
    block: number;
    author: string;
}
/** A player block with its position. */
export interface PlayerBlockAt extends PlayerCell {
    x: number;
    y: number;
    z: number;
}
/** How many blocks each author has in a stored chunk (see `VoxelData.encodePlayerBlocks`). */
export declare function storedPlayerAuthors(text: string): Map<string, number>;
/**
 * A stored chunk without one author's blocks (the owner removes a player's building while no room
 * is open): the new text, or null when no block is left, and how many blocks remain.
 */
export declare function withoutPlayerAuthor(text: string, author: string): {
    data: string | null;
    blocks: number;
};
/** Index of block (lx, y, lz) in a chunk's block array: layer by layer from VOXEL_MIN_Y. */
export declare const voxelIndex: (lx: number, y: number, lz: number) => number;
export declare class VoxelData {
    #private;
    /** Half the side length of the playable area. */
    readonly half: number;
    readonly settings: VoxelGround;
    constructor(
    /** Half the side length of the playable area. */
    half: number, settings: VoxelGround);
    /** Inclusive chunk index range covering the playable area. */
    get chunkRange(): {
        min: number;
        max: number;
    };
    chunkAt(x: number, z: number): {
        cx: number;
        cz: number;
    };
    /** Inside the playable area (a whole block column). */
    inside(bx: number, bz: number): boolean;
    columns(cx: number, cz: number): VoxelColumns;
    /**
     * Follows the world's roads: new, changed, and removed roads remake the blocks of the chunks
     * they cross (see `takeChanged`). Cheap when nothing changed.
     */
    setRoads(roads: readonly Road[]): void;
    /**
     * Follows the world's walls like `setRoads`: a wall's base is the highest generated ground
     * under it, so walls and room floors do not depend on roads or on the order they were drawn.
     */
    setWalls(walls: readonly Wall[]): void;
    /** The wall whose blocks stand at (x, z), the newest first, or null. */
    wallAt(x: number, z: number): string | null;
    /** Room floors of closed walls: the outline and the level of the plank floor. */
    roomFloors(walls: readonly Wall[]): Array<{
        points: Wall['points'];
        level: number;
    }>;
    /** The road whose bed covers (x, z), the newest first, or null. */
    roadAt(x: number, z: number): string | null;
    /** Chunk keys whose blocks changed since the last call (to redraw them and their colliders). */
    takeChanged(): string[];
    /**
     * Where things stand at (x, z): the ground's top face, the top of a wall, or the sill of a door
     * in a wall; outside the place, the border height.
     */
    surfaceHeight(x: number, z: number): number;
    /**
     * Where a player stands at (x, z) near the height `near` (exit spots, movement modes): of the
     * places to stand in the column (a block or open water with two free blocks above) at most
     * `climb` above `near`, the one closest to it, higher on a tie; so the floor under a roof or an
     * overhang, not its top. The column's surface when there is none (a wall higher than the climb).
     */
    standHeight(x: number, z: number, near: number, climb: number): number;
    /** The ground under walls (room floors and wall footings read it), or the border height. */
    floorHeight(x: number, z: number): number;
    /** One above the highest block of column (x, z): ground, water, or wall. */
    columnTop(x: number, z: number): number;
    /** Top of the water at (x, z), or null on dry ground. */
    waterSurface(x: number, z: number): number | null;
    /** The block players see from above at (x, z). */
    topBlock(x: number, z: number): BlockName;
    /** Every block of a chunk (see `voxelIndex`), made on first use. */
    blocks(cx: number, cz: number): Uint8Array;
    /** The block at (x, y, z) before anyone dug or stacked there. */
    baseBlock(x: number, y: number, z: number): number;
    /**
     * Digging and stacking (P2-26): sets blocks at whole-meter positions (inside the place and the
     * layers) and returns the blocks that were there, in the same order (the undo). Only blocks
     * that differ from the generated ground are kept.
     */
    setBlocks(list: ReadonlyArray<readonly [number, number, number, number]>): Array<[number, number, number, number]>;
    /**
     * Lowest edited layer in chunk (cx, cz), by the owner or players, or null: tunnels reach below
     * the ground's top.
     */
    editedLow(cx: number, cz: number): number | null;
    /** Chunks with digging or stacking in them ("cx,cz"). */
    editedChunks(): string[];
    /** A chunk's digging and stacking for storage, or null when it has none. */
    encodeEdits(cx: number, cz: number): string | null;
    /** Loads stored digging and stacking (see `encodeEdits`). */
    loadEdits(text: string): void;
    /** The block at whole-meter position (x, y, z): air above the layers and outside the place. */
    block(x: number, y: number, z: number): number;
    /** The block at (x, y, z) as the owner made it: generated ground, roads, walls, their edits. */
    ownerBlock(x: number, y: number, z: number): number;
    /**
     * Whether (x, y, z) holds what the generator made there: no road, wall, or owner's edit
     * (players may dig natural ground, never the owner's building).
     */
    natural(x: number, y: number, z: number): boolean;
    /** The player block at (x, y, z), or null where the owner's block shows. */
    playerCell(x: number, y: number, z: number): PlayerCell | null;
    /**
     * A player places or digs blocks (decision 109; the caller checks the rules): each position
     * shows the block, remembered as the author's; a block equal to the owner's removes the player
     * block there.
     */
    setPlayerBlocks(list: ReadonlyArray<readonly [number, number, number, number]>, author: string): void;
    /** Player blocks of one author, or of everyone. */
    playerBlockCount(author?: string): number;
    /** Takes every player block away (a client loading the room's blocks again). */
    clearPlayerBlocks(): void;
    /** Who built with their hands here and how many blocks each has, most first. */
    playerAuthors(): Array<{
        author: string;
        blocks: number;
    }>;
    /**
     * The owner removes one player's building in one step (decision 109): every block of the
     * author goes back to the owner's block. Returns how many were removed.
     */
    removePlayerBlocksBy(author: string): number;
    /** Player blocks within `radius` meters of (x, y, z), block centers measured (a report of a build). */
    playerBlocksNear(x: number, y: number, z: number, radius: number): PlayerBlockAt[];
    /** Player blocks in chunk (cx, cz). */
    playerBlockCountIn(cx: number, cz: number): number;
    /** Chunks ("cx,cz") with player blocks in them. */
    playerChunks(): string[];
    /** Chunks ("cx,cz") whose player blocks changed since the last call (to save them). */
    takePlayerDirty(): string[];
    /**
     * A chunk's player blocks for storage, or null when it has none. Without `authors` (for
     * clients) every block's author is left out.
     */
    encodePlayerBlocks(cx: number, cz: number, authors?: boolean): string | null;
    /**
     * Loads stored player blocks (see `encodePlayerBlocks`); without authors they are ''. With
     * `keep`, they only fill free cells: blocks already there stay, and the chunk stays changed so
     * the merged result is saved (a room that starts keeping player blocks, decision 109).
     */
    loadPlayerBlocks(text: string, options?: {
        keep?: boolean;
    }): void;
    /** Drops a chunk's block array (it is made again on the next use). */
    release(cx: number, cz: number): void;
    /** The soil of the top block at (x, z). */
    soilAt(x: number, z: number): Soil;
    /** Whether the block at (x, y, z) is ground to stand on. */
    solidAt(x: number, y: number, z: number): boolean;
}
