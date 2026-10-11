/** Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
import { BufferGeometry, Mesh, type Material } from 'three';
export type Q4 = [number, number, number, number];
export type V3 = [number, number, number];
export declare const TAU: number;
export declare const clamp: (x: number, a: number, b: number) => number;
export declare const lerp: (a: number, b: number, t: number) => number;
export declare const smooth: (a: number, b: number, x: number) => number;
export declare const angleDiff: (a: number, b: number) => number;
export declare const approach: (rate: number, dt: number) => number;
/** Source util/Noise.js mulberry32: seeded uniform [0, 1) generator. */
export type Rng = () => number;
export declare function mulberry32(seed: number): Rng;
/** A WGSL module of the source engine (ShaderModule options), kept as data. */
export interface WgslModule {
    name: string;
    code: string;
    deps?: WgslModule[];
}
export declare const kitModule: WgslModule;
export declare function qAxis(out: Q4, ax: number, ay: number, az: number, angle: number): Q4;
export declare function qMul(out: Q4, a: Q4, b: Q4): Q4;
export declare function qYawPitchRoll(out: Q4, yaw: number, pitch: number, roll: number): Q4;
export declare function qRotate(out: V3, q: Q4, x: number, y: number, z: number): V3;
export declare function qGround(out: Q4, yaw: number, nx: number, ny: number, nz: number): Q4;
/** Source engine StorageBuffer options (gpu/Texture.js). */
export interface StorageBufferOptions {
    label: string;
    count: number;
    type: string;
    data?: Float32Array;
}
/** What the wildlife code calls on a storage buffer. */
export interface WildlifeStorageBuffer {
    write(data: Float32Array): void;
}
export type StorageBufferFactory = (options: StorageBufferOptions) => WildlifeStorageBuffer;
/** Default storage buffer: records the options, the initial data and a copy of the latest upload. */
export declare class RecordedStorageBuffer implements WildlifeStorageBuffer {
    options: StorageBufferOptions;
    data: Float32Array | null;
    writes: number;
    constructor(options: StorageBufferOptions);
    write(data: Float32Array): void;
}
export declare const recordStorageBuffer: StorageBufferFactory;
/** Options the source passes to its engine `new Material( ... )` (render/Material.js), kept as data. */
export interface WildlifeMaterialOptions {
    name: string;
    roughness?: number;
    metalness?: number;
    lit?: boolean;
    transparent?: boolean;
    blending?: string;
    depthWrite?: boolean;
    velocityWeight?: number;
    vertexColors?: boolean;
    underwaterLighting?: string;
    modules?: WgslModule[];
    uniforms?: Record<string, [string, unknown]>;
    storage?: Record<string, WildlifeStorageBuffer>;
    attributes?: Record<string, string>;
    varyings?: Record<string, string>;
    vertex?: string;
    surface?: string;
}
export type WildlifeMaterialFactory = (options: WildlifeMaterialOptions) => Material;
/** Default material: a three.js stand-in (the WGSL vertex animation is not ported) carrying the options. */
export declare const standInMaterial: WildlifeMaterialFactory;
export declare class InstanceRecords {
    max: number;
    stride: number;
    name: string;
    data: Float32Array;
    buffer: WildlifeStorageBuffer;
    count: number;
    constructor(name: string, max: number, stride: number, makeBuffer?: StorageBufferFactory);
    field(k: number): string;
    begin(): void;
    push(): number;
    commit(): void;
}
/** SunShadows surface read by instancedMesh (cascade cameras). */
export interface CascadeShadows {
    cascades?: {
        camera: unknown;
    }[];
}
export type InstancedTemplate = BufferGeometry & {
    instanceCount: number;
};
export declare function instancedMesh(name: string, geometry: BufferGeometry, material: Material, records: InstanceRecords, { csm, castShadow }?: {
    csm?: CascadeShadows | null;
    castShadow?: boolean;
}): Mesh<InstancedTemplate, Material<import("three").MaterialEventMap>, import("three").Object3DEventMap>;
