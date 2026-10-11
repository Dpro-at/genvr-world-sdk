/** Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
import { Vector3, Quaternion, Matrix4, Frustum, Sphere, BufferGeometry, InstancedBufferAttribute, InstancedMesh, type Camera, type Material, type Object3D } from 'three';
import { type GlbMesh } from './glb.js';
import { type ShoreEngine, type ShoreMaterial, type ShoreTerrainGpu, type ShoreTexture } from './shore-engine.js';
export declare const SCAN_ASSETS: readonly ["dead_quiver_trunk", "dead_quiver_branch_02", "dead_quiver_branch_01", "lambis_shell"];
export declare const SCAN: {
    readonly TRUNK: 0;
    readonly BRANCH_A: 1;
    readonly BRANCH_B: 2;
    readonly SHELL: 3;
};
export declare const SCAN_SIZE: readonly (readonly [number, number, number])[];
export declare const LOD_DIST: readonly [number, number, number];
export declare const BAND = 0.12;
/** Source: `( import.meta.env.BASE_URL || '/' ) + 'models/debris/'`. */
export declare const DEFAULT_BASE = "/models/debris/";
/** RGBA8 pixels of an image, top row first. */
export interface ScanPixels {
    data: Uint8Array;
    width: number;
    height: number;
}
/** One placed scan (DebrisPlacement output); matrix and radius are filled in by the constructor. */
export interface ScanInstance {
    asset: number;
    x: number;
    y: number;
    z: number;
    yaw: number;
    pitch?: number;
    roll?: number;
    sx: number;
    sy: number;
    sz: number;
    rnd: number;
    matrix?: Matrix4;
    radius?: number;
}
export interface ScannedDebrisOptions {
    gpu: ShoreTerrainGpu;
    instances: ScanInstance[];
    parent: {
        add(o: Object3D): unknown;
        remove(o: Object3D): unknown;
    };
    engine?: ShoreEngine;
    /** URL of the folder holding the GLBs and JPEGs (source: BASE_URL + 'models/debris/'). */
    base?: string;
    loadBytes?: (url: string) => Promise<ArrayBuffer>;
    loadPixels?: (url: string) => Promise<ScanPixels>;
    /** three.js material the meshes draw with (default: a MeshStandardMaterial stand-in). */
    material?: Material;
    /** Start loading in the constructor like the source (default true). */
    autoLoad?: boolean;
}
export interface ScanLevel {
    mesh: InstancedMesh;
    iData: InstancedBufferAttribute;
    tris: number;
}
type ScanMap = 'albedo' | 'normal' | 'arm';
export declare function packAtlas(tiles: readonly ScanPixels[]): {
    T: number;
    data: Uint8Array<ArrayBuffer>;
};
export declare function mergeScanLods(glbs: readonly {
    meshes: GlbMesh[];
}[]): BufferGeometry<import("three").NormalBufferAttributes, import("three").BufferGeometryEventMap>[];
export declare class ScannedDebris {
    gpu: ShoreTerrainGpu;
    instances: ScanInstance[];
    parent: ScannedDebrisOptions['parent'];
    engine: ShoreEngine;
    base: string;
    loadBytes: (url: string) => Promise<ArrayBuffer>;
    loadPixels: (url: string) => Promise<ScanPixels>;
    standIn: Material | undefined;
    meshes: InstancedMesh[];
    ready: boolean;
    textures?: Record<ScanMap, ShoreTexture>;
    materialSpec?: ShoreMaterial;
    material?: Material;
    levels: ScanLevel[];
    loadMs?: number;
    promise: Promise<void> | null;
    _lastCam: Vector3;
    _lastQuat: Quaternion;
    _frustum: Frustum;
    _m4: Matrix4;
    _sphere: Sphere;
    _v: Vector3;
    constructor({ gpu, instances, parent, engine, base, loadBytes, loadPixels, material, autoLoad }: ScannedDebrisOptions);
    _load(): Promise<void>;
    _createMaterial(): ShoreMaterial;
    update(camera: Camera): void;
    _put(l: number, counts: number[], r: ScanInstance, fade: number, outgoing: number): void;
    get triangles(): number;
    dispose(): void;
}
export {};
