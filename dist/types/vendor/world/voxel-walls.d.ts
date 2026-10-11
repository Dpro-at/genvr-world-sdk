import type { Wall } from '../contracts/index.js';
import { type VoxelColumns } from './voxel-generator.js';
/**
 * Walls on block ground (P2-26 stage 3): a wall stays a line in the world document, and the
 * blocks follow it: one block thick, from the ground up to a flat top (the highest ground under
 * the wall plus its height), a row of cobble at the base and planks above, doors and windows as
 * holes, and a plank floor inside a closed room at the level of the wall's base.
 */
export interface VoxelWallPlan {
    /** Wall cells ("x,z" of the block column) with their opening, if any. */
    cells: Map<string, {
        holeLow: number;
        holeHigh: number;
        door: boolean;
    }>;
    /** Floor cells of a closed room. */
    floor: Set<string>;
    base: number;
    top: number;
    bounds: {
        minX: number;
        maxX: number;
        minZ: number;
        maxZ: number;
    };
}
/** The blocks of a wall over ground `groundAt` (the ground before walls). */
export declare function planVoxelWall(wall: Wall, groundAt: (x: number, z: number) => number): VoxelWallPlan;
/** Chunk keys ("cx,cz") a wall plan changes. */
export declare function voxelWallChunks(plan: VoxelWallPlan): string[];
/** The wall whose blocks stand in column (x, z), or null. */
export declare const onVoxelWall: (plan: VoxelWallPlan, x: number, z: number) => boolean;
/** Stamps walls and room floors into one chunk's columns (after the roads). */
export declare function stampVoxelWalls(columns: VoxelColumns, cx: number, cz: number, plans: readonly VoxelWallPlan[]): void;
