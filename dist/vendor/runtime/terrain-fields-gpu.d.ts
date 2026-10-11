import { type TerrainFieldDescriptor } from '../contracts/index.js';
import { type TerrainFieldStore } from '../world/index.js';
import { DataTexture } from 'three/webgpu';
type Node = any;
declare const DEFER_SNAPSHOT: unique symbol;
export interface TerrainFieldTexturePreparation {
    signal?: AbortSignal;
    /** Schedule a browser task, not just a microtask, to keep input/rendering responsive. */
    yieldControl?: () => Promise<void>;
}
/** An explicit, complete GPU snapshot. Staged persistence never activates it implicitly. */
export declare class TerrainFieldTextures {
    #private;
    readonly store: TerrainFieldStore;
    readonly descriptor: TerrainFieldDescriptor;
    readonly channels: readonly string[];
    readonly textures: Map<string, DataTexture>;
    readonly byteLength: number;
    constructor(store: TerrainFieldStore, channels?: readonly string[], defer?: typeof DEFER_SNAPSHOT);
    /** Never returns a partially prepared snapshot. GPU upload still occurs on first render. */
    static createAsync(store: TerrainFieldStore, channels?: readonly string[], options?: TerrainFieldTexturePreparation): Promise<TerrainFieldTextures>;
    get revision(): number;
    /** Validate/build all new arrays before swapping textures. Failed refresh retains the old snapshot. */
    refresh(): boolean;
    /** One bounded source tile per task; all old textures remain usable until the final swap. */
    refreshAsync(options?: TerrainFieldTexturePreparation): Promise<boolean>;
    /** Raw channel units, manual filtering (no float32-filterable feature required).
     * Default clamps to sample centres; supplying outside explicitly selects an out-of-domain value.
     * Height offsets and u8/255 mask normalization belong to the consumer's declared binding.
     */
    sampleNode(channel: string, xz: Node, options?: {
        filter?: 'nearest' | 'bilinear';
        outside?: Node;
    }): Node;
    dispose(): void;
}
export {};
