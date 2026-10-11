import type { Road } from '../contracts/index.js';
import { type BlockName, type VoxelColumns } from './voxel-generator.js';
/**
 * Roads on block ground (P2-26 stage 2): a road stays a line in the world document, and the
 * blocks under it follow. The bed is flat across and climbs in single steps at least
 * STEP_LENGTH apart; beside it the ground steps toward the bed one block per meter, so hills are
 * cut and dips filled in tidy terraces. Over water the bed stays one block above it (a causeway).
 */
/** Road types drawn with blocks, and their surface block (Core Library road type ids). */
export declare const VOXEL_ROAD_BLOCKS: Readonly<Record<string, BlockName>>;
/** Roads without a type are streets; types without blocks (rails) are paved too. */
export declare const voxelRoadBlock: (materialId: string | undefined) => number;
/** Meters beside the bed where the ground steps toward it. */
export declare const VOXEL_ROAD_SHOULDER = 4;
/** Fewest meters between two height steps along a road. */
export declare const VOXEL_ROAD_STEP = 2;
export interface VoxelRoadPlan {
    block: number;
    halfWidth: number;
    /** Centerline points (about 1 m apart) with the bed height there (whole blocks). */
    xs: Float64Array;
    zs: Float64Array;
    heights: Int16Array;
    bounds: {
        minX: number;
        maxX: number;
        minZ: number;
        maxZ: number;
    };
}
/** The bed of a road over ground `groundAt` (the generated ground, before any road). */
export declare function planVoxelRoad(road: Road, groundAt: (x: number, z: number) => number): VoxelRoadPlan;
/** Chunk keys ("cx,cz") a road plan changes. */
export declare function voxelRoadChunks(plan: VoxelRoadPlan): string[];
/** Whether (x, z) is on the road's bed. */
export declare const onVoxelRoad: (plan: VoxelRoadPlan, x: number, z: number) => boolean;
/**
 * Stamps roads into one chunk's columns: shoulders of every road first, then every bed, so a bed
 * is never cut by a neighbor's shoulder.
 */
export declare function stampVoxelRoads(columns: VoxelColumns, cx: number, cz: number, plans: readonly VoxelRoadPlan[]): void;
