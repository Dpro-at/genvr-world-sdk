import { TerrainActiveSurface, type WorldSeed } from '../contracts/index.js';
import type { TerrainFieldStore } from './terrain-fields.js';
/**
 * Chunked heightfield terrain (docs/CAPACITY.md, task P2-03). Pure data with no three.js, so the
 * same edits run in the browser, on the server, and in tests.
 *
 * Each chunk stores (resolution + 1)^2 vertex heights and soil indices. Border vertices exist in
 * both neighboring chunks with identical world coordinates; every edit is a deterministic function
 * of world position, so shared borders always stay in sync.
 */
export declare const SOILS: readonly ["grass", "dirt", "sand", "rock", "snow", "mud"];
export type Soil = (typeof SOILS)[number];
/** Lowest and highest ground (metres). Raised for the Tidewater island (-90 .. about 280 m around its sea, task 2). */
export declare const MIN_HEIGHT = -150;
export declare const MAX_HEIGHT = 450;
export interface ChunkData {
    cx: number;
    cz: number;
    heights: Float32Array;
    soils: Uint8Array;
    /**
     * Ground cover (P2-40), one byte per vertex: 0 follows the world's own rules (grass on grass,
     * woods where the generator put them), 1 is cleared, and 2 and up name a cover the creator
     * painted. This one byte is what lets a creator erase something a rule scattered, which a rule
     * otherwise has nothing to delete, and it makes painting and erasing the same operation.
     */
    cover: Uint8Array;
}
/** Ground cover a creator can paint, by the byte stored for it (P2-40). */
export declare const COVERS: readonly ["default", "cleared", "plants", "pebbles"];
export type Cover = (typeof COVERS)[number];
export type Area = ReadonlyArray<readonly [number, number]>;
export interface HeightUpdate {
    chunk: ChunkData;
    index: number;
    value: number;
}
export type SculptOperation = 'raise' | 'lower' | 'flatten' | 'smooth';
export declare const chunkKey: (cx: number, cz: number) => string;
/** Ray casting point-in-polygon on the ground plane (x, z). */
export declare function insidePolygon(x: number, z: number, area: Area): boolean;
export declare class TerrainData {
    #private;
    /** Half the side length of the playable area (world size tier; `set_size_tier` changes it). */
    half: number;
    readonly chunkSize: number;
    /** Cells per chunk edge. */
    readonly resolution: number;
    get activeSurface(): TerrainActiveSurface | null;
    get activeSurfaceStore(): TerrainFieldStore | null;
    get surfaceRevision(): number;
    /** Atomic binding validation; legacy chunks remain dormant and unchanged. */
    bindSurface(input: TerrainActiveSurface | null): void;
    /** Source raster height, bilinear between source sample centers; not collision triangles. */
    rasterHeightAt(x: number, z: number): number;
    /** Stored raster tiles; only an explicitly validated active binding changes height queries. */
    readonly fieldSets: Map<string, TerrainFieldStore>;
    /** Transient staged-set deletion markers for encoding a batch that removes its final tile then set. */
    readonly removedFieldSets: Set<string>;
    readonly chunks: Map<string, ChunkData>;
    /** Meters between two vertices. */
    readonly spacing: number;
    /** Vertices per chunk edge. */
    readonly edge: number;
    /** The starter world this place grew from (P2-40); absent means flat ground. */
    world: WorldSeed | null;
    constructor(
    /** Half the side length of the playable area (world size tier; `set_size_tier` changes it). */
    half: number, chunkSize?: number, 
    /** Cells per chunk edge. */
    resolution?: number);
    /** Inclusive chunk index range covering the playable area. */
    get chunkRange(): {
        min: number;
        max: number;
    };
    chunkAt(x: number, z: number): {
        cx: number;
        cz: number;
    };
    /** Returns the chunk, creating a flat grass chunk on first access. */
    getChunk(cx: number, cz: number): ChunkData;
    /** World position of a chunk vertex. */
    vertexPosition(chunk: ChunkData, ix: number, iz: number): {
        x: number;
        z: number;
    };
    /** Height at a world vertex position (exact grid point). */
    vertexHeight(x: number, z: number): number;
    /**
     * Places where neighboring vertices differ by more than `maxStep` (P2-11 slope check), one
     * entry per `cell`-meter square with its steepest slope in degrees. Only stored chunks are
     * read (untouched ground is flat), so this stays fast in the biggest places.
     */
    steepCells(maxStep: number, cell?: number): Array<{
        x: number;
        z: number;
        degrees: number;
    }>;
    setSlotSoils(soils: readonly Soil[]): void;
    /** Palette slot at the grid point nearest to a world position (0 where nothing was painted). */
    slotAt(x: number, z: number): number;
    /** Soil at the grid point nearest to a world position (footstep sounds, P2-08; item rules). */
    soilAt(x: number, z: number): Soil;
    /** Palette slots painted anywhere on the ground. */
    usedSlots(): Set<number>;
    /**
     * Legacy height is exactly as the terrain triangles are
     * drawn and collided (each grid cell is split along its (x+1, z) - (x, z+1) diagonal), so
     * things placed with it sit exactly on the visible ground. An active raster instead uses its
     * source bilinear query; native collision triangles approximate it between their vertices.
     */
    heightAt(x: number, z: number): number;
    /**
     * Height of the terrain surface exactly as it is drawn at a level of detail (P2-43): the same
     * triangle interpolation as `heightAt`, but only every `step`-th vertex is a corner, matching
     * the coarse grid `chunkGeometryArrays` builds for a distant chunk. `step = 1` is `heightAt`
     * itself, so a thing resting on ground drawn at full detail never needs a different height.
     */
    drawnHeightAt(x: number, z: number, step: number): number;
    /**
     * Applies a sculpt operation inside the area. `strength` 0..1 maps to up to 1 m per call for
     * raise/lower and to the blend factor for flatten/smooth. `maxStep` is the largest height
     * difference allowed between neighboring vertices (the style's maximum slope, P2-11): an edit
     * never makes the ground steeper than that, so raising again and again grows a hill instead
     * of a cliff (ground that was already steeper is left as it was). Returns the changed chunk keys.
     */
    sculpt(area: Area, operation: SculptOperation, strength: number, targetHeight?: number, soft?: boolean, maxStep?: number): Set<string>;
    /**
     * Computes new heights for every chunk vertex inside a box without changing anything.
     * `height(x, z, current)` returns the new height, or undefined to keep it. Border vertices are
     * visited once per chunk that stores them, so shared borders stay identical.
     */
    planHeights(box: {
        minX: number;
        maxX: number;
        minZ: number;
        maxZ: number;
    }, height: (x: number, z: number, current: number) => number | undefined): HeightUpdate[];
    /** Applies planned height updates; returns the keys of the chunks that changed. */
    applyHeights(updates: readonly HeightUpdate[]): Set<string>;
    paint(area: Area, soil: Soil): Set<string>;
    /** Paints a palette slot (P2-37: slots 6-15 hold library ground materials). */
    paintSlot(area: Area, slot: number): Set<string>;
    /** Paints ground cover, or clears it, or hands the ground back to the world's rules (P2-40). */
    paintCover(area: Area, cover: Cover): Set<string>;
    /**
     * Visits every ground point inside a box ([minX, maxX] x [minZ, maxZ], clamped to the place), once per chunk that
     * stores it, so border points shared by two chunks get the same treatment in both. Returns the keys of the chunks
     * where `visit` answered true (it changed something there).
     */
    visitBox(box: {
        minX: number;
        maxX: number;
        minZ: number;
        maxZ: number;
    }, visit: (chunk: ChunkData, index: number, x: number, z: number) => boolean): Set<string>;
    /** Steepest slope at a ground point in degrees, from its four neighbours (Tidewater world, `paint_rule`). */
    slopeAt(x: number, z: number): number;
    /**
     * True while a chunk still holds exactly what the world would give anyway, so it is not worth
     * storing. Without a starter world that means flat and unpainted, as it always did.
     */
    isGenerated(chunk: ChunkData): boolean;
    /** The cover at a point: what the creator painted there, or `default` where they have not. */
    coverAt(x: number, z: number): Cover;
}
/** Vertex positions and triangle indices of one chunk at a level of detail (step 1 = full). */
export declare function chunkGeometryArrays(terrain: TerrainData, chunk: ChunkData, step: number): {
    positions: Float32Array<ArrayBuffer>;
    indices: Uint32Array<ArrayBuffer>;
    count: number;
};
/** Base64 without relying on btoa/Buffer, so the same code runs in browsers, Node, and workers. */
export declare function toBase64(bytes: Uint8Array): string;
export declare function fromBase64(text: string): Uint8Array;
export declare function encodeChunk(chunk: ChunkData): string;
export declare function decodeChunk(text: string): ChunkData;
