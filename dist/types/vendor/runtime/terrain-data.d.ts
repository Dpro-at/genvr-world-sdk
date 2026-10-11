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
export declare const MIN_HEIGHT = -50;
export declare const MAX_HEIGHT = 200;
export interface ChunkData {
    cx: number;
    cz: number;
    heights: Float32Array;
    soils: Uint8Array;
}
export type Area = ReadonlyArray<readonly [number, number]>;
export type SculptOperation = 'raise' | 'lower' | 'flatten' | 'smooth';
export declare const chunkKey: (cx: number, cz: number) => string;
/** Ray casting point-in-polygon on the ground plane (x, z). */
export declare function insidePolygon(x: number, z: number, area: Area): boolean;
export declare class TerrainData {
    #private;
    /** Half the side length of the playable area (world size tier). */
    readonly half: number;
    readonly chunkSize: number;
    /** Cells per chunk edge. */
    readonly resolution: number;
    readonly chunks: Map<string, ChunkData>;
    /** Meters between two vertices. */
    readonly spacing: number;
    /** Vertices per chunk edge. */
    readonly edge: number;
    constructor(
    /** Half the side length of the playable area (world size tier). */
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
    /** Bilinear height at any world position. */
    heightAt(x: number, z: number): number;
    /**
     * Applies a sculpt operation inside the area. `strength` 0..1 maps to up to 1 m per call for
     * raise/lower and to the blend factor for flatten/smooth. Returns the changed chunk keys.
     */
    sculpt(area: Area, operation: SculptOperation, strength: number, targetHeight?: number): Set<string>;
    paint(area: Area, soil: Soil): Set<string>;
}
/** Vertex positions and triangle indices of one chunk at a level of detail (step 1 = full). */
export declare function chunkGeometryArrays(terrain: TerrainData, chunk: ChunkData, step: number): {
    positions: Float32Array<ArrayBuffer>;
    indices: Uint32Array<ArrayBuffer>;
    count: number;
};
export declare function encodeChunk(chunk: ChunkData): string;
export declare function decodeChunk(text: string): ChunkData;
