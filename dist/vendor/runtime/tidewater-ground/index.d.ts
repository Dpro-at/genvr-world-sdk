import { DataTexture, type MeshStandardNodeMaterial } from 'three/webgpu';
import type { VegetationWindProvider } from '../vegetation/wind.js';
type N = any;
export declare const GROUND_VARIANTS: readonly ["beach-sand", "seabed-sand", "rock", "grass", "dirt", "rubble", "seagrass"];
/** Zero denotes an existing image material, preserving every old palette slot. */
export declare function groundVariantIds(names: readonly string[]): number[];
/** Water owns this persistent bridge and its textures; ground only consumes its nodes. */
export interface GroundShoreProvider {
    wetFoamNode(xz: N, heightSeaRelative: N): N;
    readonly swellDirectionNode: N;
}
export declare class TidewaterGround {
    #private;
    readonly terrain: {
        half: number;
        heightAt(x: number, z: number): number;
    };
    readonly shore?: GroundShoreProvider | undefined;
    readonly detail: import("three/webgpu").Texture<unknown, import("three/webgpu").TextureEventMap>;
    readonly sea: any;
    readonly windDirection: any;
    readonly windSpeed: any;
    readonly gustOffset: any;
    readonly swellDirection: any;
    readonly normal: DataTexture;
    readonly resolution: number;
    constructor(terrain: {
        half: number;
        heightAt(x: number, z: number): number;
    }, shore?: GroundShoreProvider | undefined, wind?: VegetationWindProvider);
    invalidate(): void;
    update(seaLevel: number, dt?: number): void;
    /** Barycentric paint weights select source masks; only selected regions use the source graph. */
    bind(material: MeshStandardNodeMaterial, names: readonly string[], fixedLayer?: number): boolean;
    dispose(): void;
}
export {};
