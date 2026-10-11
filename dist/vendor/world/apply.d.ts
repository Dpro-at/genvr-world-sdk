import { CommandPayload, type GroundMaterialRef, type WorldDocument } from '../contracts/index.js';
import { TerrainData } from './terrain-data.js';
import type { TerrainFieldStore } from './terrain-fields.js';
import { VoxelData } from './voxel-data.js';
/** A world being edited: the document plus its terrain heightfield (or block ground, P2-26). */
export interface WorldState {
    doc: WorldDocument;
    terrain: TerrainData;
    /** The block ground of Voxel places made with one (`doc.voxels`). */
    voxels?: VoxelData;
}
/**
 * The palette slot for a ground material (P2-37): the slot that already holds it, else the first
 * extra slot (6-15) that is unassigned or painted nowhere, else null (all 16 in use). The choice
 * depends only on the world, so every copy of the place picks the same slot.
 */
export declare function paletteSlot(state: WorldState, material: GroundMaterialRef): number | null;
export declare function createWorldState(doc: WorldDocument, encodedChunks?: Iterable<string>, options?: {
    fieldStores?: ReadonlyMap<string, TerrainFieldStore>;
}): WorldState;
export declare class CommandError extends Error {
    readonly code: 'invalid' | 'not_found' | 'duplicate' | 'out_of_bounds';
    constructor(code: 'invalid' | 'not_found' | 'duplicate' | 'out_of_bounds', message: string);
}
export interface ApplyResult {
    /** Command that exactly undoes this one. */
    inverse: CommandPayload;
    /** Terrain chunk keys whose data changed (to rebuild meshes/colliders and to persist). */
    changedChunks: Set<string>;
}
/**
 * Validates and applies one command to the world state, returning its exact inverse.
 * Deterministic and shared by the browser (instant feedback), the API (authoritative save),
 * and the realtime server. Throws CommandError when the command cannot apply.
 */
export declare function applyCommand(state: WorldState, input: CommandPayload): ApplyResult;
/** True for a chunk that is still flat grass (the default; never needs saving). */
export declare function isDefaultChunk(chunk: {
    heights: Float32Array;
    soils: Uint8Array;
    cover: Uint8Array;
}): boolean;
/**
 * Terrain chunks encoded for saving. Without `keys`, returns every non-default chunk.
 * With `keys`, returns exactly those chunks (a default chunk means "reset to flat").
 */
export declare function encodeTerrain(state: WorldState, keys?: Iterable<string>): Array<{
    key: string;
    data: string;
}>;
