import { type VoxelData } from '../world/index.js';
/**
 * Block ground to triangles (P2-26): only faces between a block and an open neighbor, merged into
 * larger rectangles where neighbors look the same (greedy meshing), with soft corner shading
 * (ambient occlusion) from the blocks around each corner. Pure data, no three.js.
 */
/** Texture layer of a block face: three per block (top, side, bottom). */
export declare const faceLayer: (block: number, face: Face) => number;
type Face = 'top' | 'side' | 'bottom';
/** Water's top face sits a little below the block's top, so lakes read as water from afar. */
export declare const WATER_TOP_DROP = 0.125;
export interface VoxelMeshArrays {
    positions: Float32Array;
    normals: Float32Array;
    /** Texture coordinates in blocks (each whole number starts the picture again). */
    uvs: Float32Array;
    /** Texture layer per vertex (`faceLayer`). */
    layers: Float32Array;
    /** Corner shading per vertex, 0 to 1. */
    shades: Float32Array;
    indices: Uint32Array;
}
export interface VoxelChunkMesh {
    solid: VoxelMeshArrays;
    water: VoxelMeshArrays;
}
/**
 * Triangles of chunk (cx, cz) in world coordinates: solid blocks, and water separately (it is
 * drawn see-through after the ground).
 *
 * `step` 2 draws a far chunk with less detail: each cell is 2 x 2 x 2 blocks, solid when any of
 * them is (so far ground is never lower than the real ground next to it), showing its topmost
 * block (grass stays on top). Such a chunk also draws walls down its outer edges, which close any
 * gap to a neighbor drawn in full detail. Cells sit on even blocks everywhere, so far chunks
 * match each other.
 */
export declare function meshVoxelChunk(voxels: VoxelData, cx: number, cz: number, step?: 1 | 2): VoxelChunkMesh;
export {};
