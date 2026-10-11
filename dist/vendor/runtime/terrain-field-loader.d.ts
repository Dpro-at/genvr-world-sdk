import { TerrainFieldSetMetadata } from '../contracts/index.js';
import { TerrainFieldStore } from '../world/index.js';
export interface TerrainFieldPageRequest {
    readonly setId: string;
    readonly version: number;
    /** Row-major references from the complete metadata; never more than eight. */
    readonly coordinates: readonly Readonly<{
        tx: number;
        tz: number;
    }>[];
}
export interface TerrainFieldPage {
    readonly version: number;
    readonly tiles: readonly unknown[];
}
export type TerrainFieldPageLoader = (request: TerrainFieldPageRequest, signal?: AbortSignal) => Promise<TerrainFieldPage>;
export interface TerrainFieldLoadOptions {
    signal?: AbortSignal;
    /** Called before page work and between every decoded tile. Default: next timer task. */
    yieldControl?: () => Promise<void>;
    /** Counts only: an incomplete store is never passed to the caller. */
    onProgress?: (progress: Readonly<{
        loaded: number;
        total: number;
    }>) => void;
}
/** Hydrates a caller-selected complete staged set; does not activate or install terrain consumers. */
export declare function hydrateTerrainFieldSet(metadata: TerrainFieldSetMetadata, version: number, loadPage: TerrainFieldPageLoader, { signal, yieldControl, onProgress, }?: TerrainFieldLoadOptions): Promise<TerrainFieldStore>;
