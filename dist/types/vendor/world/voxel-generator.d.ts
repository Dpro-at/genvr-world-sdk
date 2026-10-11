/**
 * Block ground generator, version 1 (P2-26, decision 98): rolling grass hills, a lake with sand
 * beaches in front of the spawn (+z, where the camera first looks), and stone mountains with snowy tops behind it, as in the owner's
 * Voxel picture (docs/reference/create-cards/01-style-voxel.webp). The seed changes the details.
 *
 * Only integer hashing, + - * /, Math.floor, and Math.sqrt are used (all exact in IEEE doubles),
 * so the browser, the server, and every JavaScript engine make the same blocks from the same seed.
 */
export declare const VOXEL_CHUNK = 32;
/** Lowest block layer (y) and one past the highest. */
export declare const VOXEL_MIN_Y = -16;
export declare const VOXEL_MAX_Y = 64;
export declare const VOXEL_LAYERS: number;
/** Top of the water: water blocks fill every column whose ground is lower, up to y = 0. */
export declare const VOXEL_WATER_LEVEL = 1;
/** Ground height at the place's border (the flat ground outside meets it). */
export declare const VOXEL_EDGE_HEIGHT = 3;
/** Block ids stored in chunks; new blocks are only ever added at the end. */
export declare const BLOCKS: readonly ["air", "grass", "dirt", "sand", "stone", "snow", "gravel", "water", "path", "paving", "brick", "planks", "cobble"];
export type BlockName = (typeof BLOCKS)[number];
export declare const Block: {
    readonly [K in BlockName]: number;
};
/** Blocks players stand on and that hide the faces behind them (water and air do not). */
export declare const isSolidBlock: (block: number) => boolean;
/** One chunk's columns: the ground height, the water top, and the blocks they are made of. */
export interface VoxelColumns {
    /** Surface height: the top face of the highest solid block (its layer is ground - 1). */
    ground: Int16Array;
    /** Water surface, or NO_WATER. */
    water: Int16Array;
    /** The top block and the block under it (a few layers deep, then stone). */
    top: Uint8Array;
    under: Uint8Array;
    /**
     * Walls (P2-26 stage 3): blocks from the ground up to `wallTop` (NO_WALL when none), with at
     * most one opening (door or window) from `holeLow` up to `holeHigh` (equal when none).
     */
    wallTop: Int16Array;
    wallBlock: Uint8Array;
    holeLow: Int16Array;
    holeHigh: Int16Array;
    /** 1 where the opening is a door (people stand in it). */
    door: Uint8Array;
}
export declare const NO_WALL = -32768;
export declare const NO_WATER = -32768;
/** Layers of `under` below the top block before stone. */
export declare const UNDER_DEPTH = 3;
/** Ground height of block column (x, z) as the generator makes it (before roads). */
export declare const generatedHeight: (seed: number, half: number, x: number, z: number) => number;
/** Columns of chunk (cx, cz); block (x, z) covers x..x+1, z..z+1 in meters. */
export declare function generateColumns(seed: number, half: number, cx: number, cz: number): VoxelColumns;
