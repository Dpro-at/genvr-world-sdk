/** Tidewater4811ba48 TerrainGPU.js MIT: exact portable terrain sunlight shadow field. */
import { DataTexture, StorageTexture, Vector2, Vector3, type WebGPURenderer } from 'three/webgpu';
type N = any;
export interface TerrainShadowDomain {
    origin: Vector2;
    size: number;
    res: number;
    heightAt: (x: number, z: number) => number;
}
export declare class TerrainSunShadow {
    #private;
    readonly domain: TerrainShadowDomain;
    readonly heights: DataTexture;
    readonly texture: StorageTexture;
    readonly ready: import("three/webgpu").UniformNode<"float", number>;
    /** Editor height queries are sampled in bounded slices; invalidations coalesce for150ms. */
    readonly sampleBudgetMs = 4;
    constructor(domain: TerrainShadowDomain);
    invalidate(): void;
    update(renderer: WebGPURenderer, direction: Vector3, force?: boolean): boolean;
    /** Source exact four-load bilinear with N-1.001 edge clamp, for any world-space receiver. */
    visibilityNode(position: N): N;
    dispose(): void;
}
export {};
