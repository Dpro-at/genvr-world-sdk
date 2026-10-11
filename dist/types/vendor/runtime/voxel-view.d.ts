import type { BlockStyle } from '../core-library/index.js';
import type { VoxelData } from '../world/index.js';
import { Group } from 'three/webgpu';
/**
 * Draws block ground (P2-26) in chunks around the viewer: the nearest first, a few per frame so
 * walking never stutters, and nothing beyond the view radius (fog hides the edge). Chunks farther
 * than `lodFrom` chunks are drawn with less detail (2 x 2 x 2 cells, about half the triangles);
 * a margin keeps a chunk at the boundary from switching back and forth. Block arrays of chunks
 * that leave the view are released.
 */
export declare class VoxelView {
    #private;
    private readonly voxels;
    private readonly viewRadiusChunks;
    /** Chunks built per update once the ground under the viewer stands. */
    private readonly budget;
    /** Distance in chunks past which chunks are drawn with less detail. */
    private readonly lodFrom;
    readonly group: Group<import("three/webgpu").Object3DEventMap>;
    constructor(voxels: VoxelData, 
    /** Pixel pictures, or clean colors with a shade per cube (the style decides). */
    blockStyle?: BlockStyle, viewRadiusChunks?: number, 
    /** Chunks built per update once the ground under the viewer stands. */
    budget?: number, 
    /** Distance in chunks past which chunks are drawn with less detail. */
    lodFrom?: number);
    markDirty(keys: Iterable<string>): void;
    /** Call every frame (cheap when nothing changes). */
    update(viewerX: number, viewerZ: number): void;
    /** Builds every chunk in view now (first frame, pictures, and tests). */
    fill(viewerX: number, viewerZ: number): void;
    get chunkCount(): number;
    /** Triangles drawn now (solid and water). */
    get triangles(): number;
    dispose(): void;
}
