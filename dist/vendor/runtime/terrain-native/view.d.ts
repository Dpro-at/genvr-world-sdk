import { TerrainActiveSurface } from '../../contracts/index.js';
import type { TerrainFieldStore } from '../../world/index.js';
import { Group, MeshStandardNodeMaterial, type Camera } from 'three/webgpu';
import { TerrainFieldTextures, type TerrainFieldTexturePreparation } from '../terrain-fields-gpu.js';
import { TerrainLod } from '../terrain-lod/index.js';
import { type NativeGroundProviders } from './material.js';
type Node = any;
export interface NativeTerrainPreparation extends TerrainFieldTexturePreparation {
    providers?: NativeGroundProviders;
    seaLevel?: number;
    /** WebGL retains source geometry with a simplified TSL material, because source WGSL is WebGPU-only. */
    sourceMaterial?: boolean;
}
export declare function validateNativeSurface(store: TerrainFieldStore, surface: TerrainActiveSurface): void;
/** Geometry and shader share the active CPU surface edge policy; no place-size rescaling. */
export declare function nativeHeightNode(gpu: TerrainFieldTextures, surface: TerrainActiveSurface, xz: Node): Node;
export declare class NativeTerrainView {
    #private;
    readonly gpu: TerrainFieldTextures;
    readonly surface: TerrainActiveSurface;
    readonly group: Group<import("three/webgpu").Object3DEventMap>;
    readonly seaLevel: import("three/webgpu").UniformNode<"float", number>;
    material: MeshStandardNodeMaterial;
    readonly fallbackMaterial: MeshStandardNodeMaterial;
    readonly sourceMaterial: MeshStandardNodeMaterial | null;
    readonly lod: TerrainLod;
    private constructor();
    static create(store: TerrainFieldStore, surface: TerrainActiveSurface, options?: NativeTerrainPreparation): Promise<NativeTerrainView>;
    /** Switch cached graphs; callers invalidate their lighting clones after a material change. */
    setSourceMaterial(enabled: boolean): void;
    update(camera: Camera, seaLevel?: number): void;
    dispose(): void;
}
export {};
