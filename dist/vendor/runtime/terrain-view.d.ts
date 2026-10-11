import { Group, type Material } from 'three/webgpu';
import { type TerrainData } from '../world/index.js';
/** A chunk's world-space footprint: [minX, minZ, maxX, maxZ]. */
export type Rect = readonly [number, number, number, number];
/**
 * Detail of one chunk (P2-43): full wherever things are drawn on it, because a thing rests on the
 * measured ground and must not hang over a coarser drawn one. Coarse only past `fullDetail`.
 */
export declare function stepForChunk(rect: Rect, viewX: number, viewZ: number, fullDetail: number): 1 | 2 | 4;
/** How Realistic places draw the ground (P2-37): a material and the texture layer of each palette slot. */
export interface RealisticGround {
    material: Material;
    layerOfSlot: (slot: number) => number;
}
/**
 * Streams terrain chunk meshes around the viewer: full detail nearby, half and quarter detail
 * farther away, nothing beyond the view radius (fog hides the edge).
 */
export declare class TerrainView {
    #private;
    private readonly terrain;
    private readonly viewRadiusChunks;
    readonly group: Group<import("three/webgpu").Object3DEventMap>;
    constructor(terrain: TerrainData, soilColors: readonly number[], viewRadiusChunks?: number);
    /** New soil colors (a style change): every chunk is rebuilt on the next update. */
    setSoilColors(soilColors: readonly number[]): void;
    /** Draws the ground with real materials (Realistic style), or back with soil colors (null). */
    setRealistic(realistic: RealisticGround | null): void;
    markDirty(keys: Iterable<string>): void;
    /** The step (1, 2 or 4) this view is currently drawing the chunk at a world position with, or 1
     * when that chunk is not tracked (outside the view radius, P2-43 task 11). */
    stepAt(x: number, z: number): number;
    /** See `#stepVersion`. */
    get stepVersion(): number;
    /** Call every frame (cheap when nothing changes). */
    update(viewerX: number, viewerZ: number): void;
    get chunkCount(): number;
    dispose(): void;
}
interface SkirtedMesh {
    positions: Float32Array;
    colors: Float32Array;
    normals: Float32Array;
    indices: Uint32Array;
    slots: number[];
}
/**
 * Adds a wall of triangles along a coarse chunk's four edges, dropping `SKIRT_DROP` below the
 * edge vertices with their same color, normal and soil (P2-43). A finer neighbouring chunk's edge
 * sits at the same height as this chunk's true edge but the coarse grid may not touch it between
 * corners; the skirt fills that gap from underneath so no crack shows through it.
 */
export declare function addSkirt(count: number, positions: Float32Array, colors: Float32Array, normals: Float32Array, indices: Uint32Array, slots: readonly number[]): SkirtedMesh;
export {};
