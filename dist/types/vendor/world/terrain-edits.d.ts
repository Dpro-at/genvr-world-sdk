import { type TerrainData } from './terrain-data.js';
/**
 * Terrain edits as the points they changed (P3-08 follow-up): each changed vertex with its
 * height and soil before and after. Undoing an edit reverts only those points and keeps what
 * other builders changed later: a point still as this edit left it gets its old value back
 * exactly; a point someone changed since keeps their change plus this edit's height difference
 * reversed (soil only reverts where it is still this edit's soil).
 */
interface ChunkEdit {
    cx: number;
    cz: number;
    indices: Uint16Array;
    heightsBefore: Float32Array;
    heightsAfter: Float32Array;
    soilsBefore: Uint8Array;
    soilsAfter: Uint8Array;
    /** Ground cover (P2-40); an edit stored before it existed reads back as zeroes. */
    coverBefore: Uint8Array;
    coverAfter: Uint8Array;
}
/** Snapshot of chunk contents (copies) to compare against after an edit. */
export type ChunkSnapshot = Map<string, {
    cx: number;
    cz: number;
    heights: Float32Array;
    soils: Uint8Array;
    cover: Uint8Array;
}>;
export declare function snapshotTerrain(terrain: TerrainData, keys: Iterable<string>): ChunkSnapshot;
export declare function decodeTerrainEdit(text: string): ChunkEdit;
/** The points that differ between a snapshot and the terrain now, as encoded edits. */
export declare function diffTerrain(terrain: TerrainData, before: ChunkSnapshot): string[];
/**
 * Reverts encoded edits (after -> before) point by point, keeping later changes by others.
 * Returns the edits that undo this revert and the changed chunk keys.
 */
export declare function revertTerrain(terrain: TerrainData, encoded: readonly string[], clampHeight: (h: number) => number): {
    inverse: string[];
    changed: Set<string>;
};
export {};
