/** Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
import { Box3, Frustum, InstancedBufferAttribute, Matrix4, Mesh, type CoordinateSystem, type InstancedBufferGeometry, type Material } from 'three';
import { type GrassMaterialFactory, type GrassWgslModule } from './grass-material.js';
/** The terrain grid the field reads (source TerrainData: square, `res` x `res` heights). */
export interface GrassTerrain {
    res: number;
    size: number;
    texel: number;
    origin: number;
    heights: Float32Array;
}
/** RGBA8 density mask over the terrain (grass-mask.ts `buildGrassMask`). */
export interface GrassMask {
    data: Uint8Array;
    res: number;
}
export interface GrassTextureOptions {
    label: string;
    width: number;
    height: number;
    format: 'r32float' | 'rgba8unorm';
    data: Float32Array | Uint8Array;
    sampler?: 'linearClamp';
}
export interface GrassTexture {
    upload(data: Float32Array | Uint8Array): void;
    destroy(): void;
}
export type GrassTextureFactory = (options: GrassTextureOptions) => GrassTexture;
/** Default texture: records the options and every upload; no GPU. */
export declare class RecordedGrassTexture implements GrassTexture {
    options: GrassTextureOptions;
    uploads: (Float32Array | Uint8Array)[];
    destroyed: boolean;
    constructor(options: GrassTextureOptions);
    upload(data: Float32Array | Uint8Array): void;
    destroy(): void;
}
export declare const recordGrassTexture: GrassTextureFactory;
/** The camera fields `update` reads (three.js Camera). */
export interface GrassCamera {
    matrixWorld: Matrix4;
    matrixWorldInverse: Matrix4;
    projectionMatrix: Matrix4;
    coordinateSystem: CoordinateSystem;
    reversedDepth?: boolean;
}
export interface GrassLevelMesh {
    mesh: Mesh;
    geometry: InstancedBufferGeometry;
    attr: InstancedBufferAttribute;
    arr: Float32Array;
    max: number;
    count: number;
}
export interface GrassFieldOptions {
    terrain: GrassTerrain;
    mask: GrassMask;
    textures?: GrassTextureFactory;
    material?: GrassMaterialFactory;
    /** The source's `vegModule` (wind, hashes, detail texture); default a named placeholder. */
    vegModule?: GrassWgslModule;
}
export declare class GrassField {
    terrain: GrassTerrain;
    heightTex: GrassTexture & {
        needsUpdate?: boolean;
    };
    maskTex: GrassTexture;
    cellsPerSide: number;
    cellFlags: Uint8Array;
    cellMinY: Float32Array;
    cellMaxY: Float32Array;
    material: Material;
    patchTris: number[];
    levels: GrassLevelMesh[];
    meshes: Mesh[];
    _frustum: Frustum;
    _mat: Matrix4;
    _box: Box3;
    _last: Float64Array;
    constructor({ terrain, mask, textures, material, vegModule }: GrassFieldOptions);
    get near(): GrassLevelMesh;
    get far(): GrassLevelMesh;
    get nearTris(): number;
    get farTris(): number;
    _createMesh(geometry: InstancedBufferGeometry, max: number, name: string): GrassLevelMesh;
    update(camera: GrassCamera): boolean;
    get triangles(): number;
    dispose(): void;
}
