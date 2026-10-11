import { TerrainFieldStore } from './terrain-fields.js';
export interface TerrainFieldSampleOptions {
    filter?: 'bilinear' | 'nearest';
    edge?: 'clamp' | 'none';
}
/** Raw raster samples; no normalization, height binding, triangle interpolation or activation. */
export declare class TerrainFieldSampler {
    #private;
    readonly store: TerrainFieldStore;
    constructor(store: TerrainFieldStore);
    sample(channel: string, x: number, z: number, options?: TerrainFieldSampleOptions): number | null;
    /** Releases the shared store's decoded cache; other samplers lazily rebuild it. */
    clear(): void;
    dispose(): void;
}
