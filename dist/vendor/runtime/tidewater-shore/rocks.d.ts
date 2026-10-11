/** Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
import { Group, Vector3, Quaternion, Matrix4, Frustum, Sphere, InstancedMesh, type Camera, type Material, type Object3D } from 'three';
import { type Rng } from './shore-math.js';
export declare const NEAR_SUBDIV = 3;
export declare const FAR_SUBDIV = 2;
export declare const NEAR_DIST = 60;
export declare const FAR_DIST = 700;
export declare const BAND = 0.12;
/** What Rocks reads from the source's TerrainData (Terrain instance or TerrainData). */
export interface RockTerrain {
    origin: number;
    texel: number;
    res: number;
    rock: ArrayLike<number>;
    heightAt(x: number, z: number): number;
    normalAt(x: number, z: number, out: Vector3): unknown;
    pathDistance?: ((x: number, z: number) => number) | undefined;
    rockSites?: readonly {
        kind: string;
        x: number;
        z: number;
        r: number;
    }[] | undefined;
    rubble?: ArrayLike<number> | null | undefined;
}
/** The source's TerrainGPU parts the rock material uses (opaque WGSL modules). */
export interface RockTerrainGpu {
    module: unknown;
    sunModulationModule: unknown;
}
export interface RockFootprint {
    x: number;
    z: number;
    r: number;
}
export interface RockColliders {
    addCylinder(x: number, z: number, r: number, y0: number, y1: number, o: {
        tag: string;
    }): unknown;
}
export interface RockScene {
    add(o: Object3D): unknown;
    remove(o: Object3D): unknown;
}
export interface RockInstance {
    x: number;
    y: number;
    z: number;
    size: number;
    sy: number;
    style: number;
    matrix: Matrix4;
    radius: number;
}
/** The engine material record the source builds (`standard()` + WGSL fields). */
export interface RockMaterialSpec {
    params: {
        name: string;
        roughness: number;
        metalness: number;
    };
    modules: unknown[];
    defines: Record<string, number>;
    attributes?: Record<string, string>;
    varyings?: Record<string, string>;
    vertex?: string;
    shadow?: string;
    surface?: string;
}
export interface RocksOptions {
    scene: RockScene;
    terrain: RockTerrain | {
        data: RockTerrain;
        gpu?: RockTerrainGpu | null;
    };
    village?: {
        getFootprints?: () => readonly RockFootprint[];
    } | null;
    colliders?: RockColliders | null;
    seed?: number;
    castShadow?: boolean;
    sunShadow?: boolean;
    /** WGSL module handles of TerrainShading.js / LODFade.js (opaque, only recorded in the spec). */
    terrainShadingModule?: () => unknown;
    lodFadeModule?: unknown;
    /** three.js material the meshes draw with (default: a MeshStandardMaterial stand-in). */
    material?: Material;
}
interface RockBucket {
    members: RockInstance[];
    near: InstancedMesh;
    far: InstancedMesh;
    nearTris: number;
    farTris: number;
}
export declare function rocksMaterialSpec(gpu: RockTerrainGpu | null, sunShadow: boolean, terrainShadingModule?: () => unknown, lodFadeModule?: unknown): RockMaterialSpec;
export declare class Rocks {
    scene: RockScene;
    terrainData: RockTerrain;
    terrainGPU: RockTerrainGpu | null;
    village: RocksOptions['village'];
    group: Group;
    instances: RockInstance[];
    materialSpec: RockMaterialSpec;
    material: Material;
    meshes: InstancedMesh[];
    buckets: RockBucket[];
    timings: {
        place: number;
        build: number;
    };
    _lastCam: Vector3;
    _frustum: Frustum;
    _m4: Matrix4;
    _sphere: Sphere;
    _lastQuat: Quaternion;
    _tmpV?: Vector3;
    constructor({ scene, terrain, village, colliders, seed, castShadow, sunShadow, terrainShadingModule, lodFadeModule, material }: RocksOptions);
    _place(rand: Rng): RockInstance[];
    update(camera: Camera): void;
    stats(): {
        rocks: number;
        visible: number;
        triangles: number;
        drawCalls: number;
        timings: {
            place: number;
            build: number;
        };
    };
    dispose(): void;
}
export {};
