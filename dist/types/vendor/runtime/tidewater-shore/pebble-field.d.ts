/** Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
import { InstancedBufferGeometry, InstancedBufferAttribute, Mesh, Frustum, Matrix4, Box3, type Camera, type Material } from 'three';
import { type Rng } from './shore-math.js';
import { type ShoreEngine, type ShoreMaterial, type ShoreShaderModule, type ShoreTerrainGpu, type ShoreTexture } from './shore-engine.js';
export declare const PCELL = 4;
export declare const R_FAR = 25;
export declare const FADE_SMALL: readonly [number, number];
export declare const FADE_COBBLE: readonly [number, number];
export declare const MAX_CELLS = 240;
export declare const N_COBBLE = 18, N_CHIP = 44, N_SMALL = 150;
export declare function blueNoise(rand: Rng, n: number, size: number, k?: number): [number, number][];
export declare function chipPart(v: number): {
    p: number[];
    n: number[];
    idx: number[];
};
export declare function buildPatch(): InstancedBufferGeometry;
export declare const pebbleModule: ShoreShaderModule;
/** What the pebble field reads of the source's TerrainData. */
export interface PebbleTerrain {
    size: number;
    texel: number;
    res: number;
    origin: number;
    heights: ArrayLike<number>;
    heightAt(x: number, z: number): number;
}
/** The debris mask of DebrisPlacement: RGBA8 over the terrain domain. */
export interface PebbleMask {
    data: Uint8Array;
    res: number;
    texel: number;
}
export interface PebbleFieldOptions {
    terrain: PebbleTerrain;
    gpu: ShoreTerrainGpu;
    mask: PebbleMask;
    engine?: ShoreEngine;
    /** three.js material the mesh draws with (default: a MeshStandardMaterial stand-in). */
    material?: Material;
}
type StaticVelocityMesh = Mesh & {
    staticVelocity?: boolean;
};
export declare class PebbleField {
    terrain: PebbleTerrain;
    gpu: ShoreTerrainGpu;
    engine: ShoreEngine;
    maskTex: ShoreTexture;
    cellsPerSide: number;
    cellFlags: Uint8Array;
    cellMinY: Float32Array;
    cellMaxY: Float32Array;
    occupiedCells: number;
    patchTris: number;
    arr: Float32Array;
    attr: InstancedBufferAttribute;
    geometry: InstancedBufferGeometry;
    materialSpec: ShoreMaterial;
    material: Material;
    mesh: StaticVelocityMesh;
    count: number;
    _frustum: Frustum;
    _mat: Matrix4;
    _box: Box3;
    _last: Float64Array;
    constructor({ terrain, gpu, mask, engine, material }: PebbleFieldOptions);
    _createMaterial(): ShoreMaterial;
    update(camera: Camera): boolean;
    get triangles(): number;
    dispose(): void;
}
export {};
