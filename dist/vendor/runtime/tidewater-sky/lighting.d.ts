/** Runtime adapters for the source lighting modules; task7 replaces the generic terrain provider. */
import { DataTexture, Vector3, type Scene, type Camera, type DirectionalLight, type WebGPURenderer } from 'three/webgpu';
import { GroundBounce } from './ground-bounce.js';
import { LocalLights } from './local-lights.js';
import { TerrainSunShadow } from '../tidewater-ground/terrain-shadow.js';
export declare class TidewaterLighting {
    #private;
    readonly renderer: WebGPURenderer;
    readonly scene: Scene;
    readonly sun: DirectionalLight;
    readonly terrain: {
        half: number;
        heightAt(x: number, z: number): number;
        slotAt(x: number, z: number): number;
    };
    readonly kindOf: (slot: number) => string;
    readonly local: LocalLights;
    readonly direction: import("three/webgpu").UniformNode<"vec3", Vector3>;
    readonly color: import("three/webgpu").UniformNode<"vec3", Vector3>;
    readonly sea: import("three/webgpu").UniformNode<"float", number>;
    readonly height: DataTexture;
    readonly covers: DataTexture;
    readonly bounce: GroundBounce;
    readonly terrainShadow: TerrainSunShadow;
    constructor(renderer: WebGPURenderer, scene: Scene, sun: DirectionalLight, terrain: {
        half: number;
        heightAt(x: number, z: number): number;
        slotAt(x: number, z: number): number;
    }, kindOf?: (slot: number) => string);
    invalidate(): void;
    update(dt: number, camera: Camera, on: boolean, seaLevel: number, night: number): void;
    get retainedMaterials(): number;
    get retainedMeshes(): number;
    dispose(): void;
}
