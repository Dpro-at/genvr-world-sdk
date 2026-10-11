/** Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
import * as THREE from 'three';
import { WgslMaterial as Material, WgslModule as ShaderModule } from './marine-shared.js';
import { WhaleBrain, type WaterQuery } from './whale-brain.js';
import type { MarineSpray } from './fish.js';
export declare const SPRAY: {
    DROPLET: number;
    MIST: number;
    LIGAMENT: number;
    SPRAY: number;
    SHEET: number;
};
/** One level of the baked mesh (byte offsets into humpback.bin). */
export interface WhaleLevel {
    name: string;
    vertices: number;
    indices: number;
    position: number;
    normal: number;
    uv: number;
    uv1: number;
    rig: number;
    index: number;
}
/** public/models/whale/humpback.json */
export interface WhaleManifest {
    version?: number;
    length?: number;
    levels: WhaleLevel[];
    centerline: {
        z: number[];
        y: number[];
    };
    snoutZ: number;
    notchZ: number;
    tailZ?: number;
    flukeTipZ?: number;
    flukeRootZ?: number;
    snoutY?: number;
    rootS?: number;
    pectoral: {
        left: {
            origin: number[];
            basis: number[][];
        };
        right: {
            origin: number[];
            basis: number[][];
        };
    };
    blowhole: number[];
    textures?: {
        albedo: string;
        height: string;
        size?: number[];
        heightRange: number[];
    };
}
/** The baked levels of detail as geometries (the source's load(), geometry part). */
export declare function whaleGeometries(manifest: WhaleManifest, bin: ArrayBuffer): {
    name: string;
    geometry: THREE.BufferGeometry<THREE.NormalBufferAttributes, THREE.BufferGeometryEventMap>;
}[];
export declare const K = 40;
type Fmt = (x: number) => string;
export interface WhaleOptions {
    scene: THREE.Object3D;
    terrain?: {
        heightAt(x: number, z: number): number;
    } | null;
    query?: WaterQuery | null;
    spray?: MarineSpray | null;
    url?: string;
    /** Route of the brain (x, z points; default: the source's bay route). */
    route?: readonly (readonly number[])[];
    seed?: number;
}
export declare class Whale {
    scene: THREE.Object3D;
    terrain: {
        heightAt(x: number, z: number): number;
    } | null;
    query: WaterQuery | null;
    spray: MarineSpray | null;
    url: string;
    ready: boolean;
    group: THREE.Group;
    brain: WhaleBrain;
    frames: null;
    meshes: THREE.Mesh[];
    lod: number;
    _lod?: number;
    _blowAcc: number;
    _dropAcc: number;
    _slaps: number;
    _loading?: Promise<void>;
    manifest: WhaleManifest;
    albedoTex?: THREE.DataTexture;
    heightTex?: THREE.DataTexture;
    material: Material;
    /** three.js stand-in the meshes draw with (rest pose, see the header). */
    standIn: THREE.MeshStandardMaterial;
    zHead: number;
    dz: number;
    rest: {
        z: number;
        y: number;
    }[];
    rootIndex: number;
    uPos: {
        array: THREE.Vector4[];
    };
    uRot: {
        array: THREE.Vector4[];
    };
    uFlip: {
        array: THREE.Vector4[];
    };
    pos: THREE.Vector3[];
    rot: THREE.Quaternion[];
    pecRoot: THREE.Vector3[];
    pecBasis: THREE.Matrix3[];
    blowLocal: THREE.Vector3;
    _hasPrev: boolean;
    uWater: {
        value: unknown;
    };
    uWet: {
        value: unknown;
    };
    constructor({ scene, terrain, query, spray, url, route, seed }: WhaleOptions);
    load(): Promise<void>;
    _setupRig(m: WhaleManifest): void;
    _pose(): void;
    toWorld(local: THREE.Vector3Like, out: THREE.Vector3): THREE.Vector3;
    update(dt: number, camera: THREE.Camera | null): void;
    _effects(dt: number): void;
    _createMaterial(m: WhaleManifest): Material;
    _rigModule(f: Fmt, pl: THREE.Vector3, pr: THREE.Vector3): ShaderModule;
    _skinShading(m: WhaleManifest, hasTex: boolean, f: Fmt): string;
}
export {};
