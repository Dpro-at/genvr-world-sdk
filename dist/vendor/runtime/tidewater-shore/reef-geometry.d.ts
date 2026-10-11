/** Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
import * as THREE from 'three';
import type { Rng } from './shore-math.js';
/** aData triple [ x, z, w ] returned by shape callbacks. */
export type DataTriple = readonly number[];
export type MoundStyle = 'rock' | 'slab' | 'boulder' | 'knobby' | 'smooth';
/** Tube options (source `o = {}`). */
export interface TubeOptions {
    sides?: number | undefined;
    cap?: boolean | undefined;
    capLength?: number | undefined;
    ellipse?: number | undefined;
    axis?: THREE.Vector3 | ((i: number) => THREE.Vector3) | undefined;
    twist?: number | undefined;
    data?: ((i: number, t: number) => DataTriple) | undefined;
}
export interface TubeFrames {
    T: THREE.Vector3[];
    N: THREE.Vector3[];
    B: THREE.Vector3[];
    length: number;
}
export interface LatheRow {
    r: number;
    y: number;
    d?: DataTriple | undefined;
}
export interface OcclusionOptions {
    radius: number;
    strength?: number | undefined;
    ground?: boolean | undefined;
}
export interface BuildOptions {
    normals?: boolean | undefined;
    ao?: OcclusionOptions | null | undefined;
}
export interface Icosphere {
    verts: THREE.Vector3[];
    faces: number[][];
}
export declare const rand: (rng: Rng, a: number, b: number) => number;
export declare function perpendicular(v: THREE.Vector3, out?: THREE.Vector3): THREE.Vector3;
export declare function randomUnitVector(rng: Rng, out?: THREE.Vector3): THREE.Vector3;
export declare function waveNoise(rng: Rng, count: number, fMin: number, fMax: number): (x: number, y: number, z: number) => number;
export declare class MeshBuilder {
    position: number[];
    normal: number[];
    data: number[];
    index: number[];
    constructor();
    get count(): number;
    vertex(p: THREE.Vector3, n: THREE.Vector3, d0?: number, d1?: number, d2?: number, d3?: number): number;
    tri(a: number, b: number, c: number): void;
    quad(a: number, b: number, c: number, d: number): void;
    backfaces(firstVertex: number, firstIndex: number): void;
    build({ normals, ao }?: BuildOptions): THREE.BufferGeometry<THREE.NormalBufferAttributes, THREE.BufferGeometryEventMap>;
}
export declare function bakeOcclusion(geometry: THREE.BufferGeometry, radius: number, strength?: number, ground?: boolean): void;
export declare function tube(b: MeshBuilder, points: readonly THREE.Vector3[], radii: readonly number[], o?: TubeOptions): TubeFrames;
export declare function lathe(b: MeshBuilder, profile: readonly LatheRow[], segments: number, radial?: ((phi: number, i: number) => number) | null, ox?: number, oz?: number): void;
export declare function icosphere(detail: number): Icosphere;
export declare function blob(b: MeshBuilder, detail: number, fn: (dir: THREE.Vector3, out: THREE.Vector3) => DataTriple | null | undefined | void): void;
export declare function sheet(b: MeshBuilder, nu: number, nv: number, fn: (u: number, v: number, out: THREE.Vector3) => DataTriple | null | undefined | void, twoSided?: boolean): void;
export declare function smoothNormals(b: MeshBuilder, first?: number, firstIndex?: number): void;
export declare function branch<S>(roots: readonly S[], budget: number, grow: (spec: S) => readonly S[] | null | undefined | void): void;
export declare function path(p: THREE.Vector3, dir: THREE.Vector3, length: number, steps: number, bend?: ((i: number, dir: THREE.Vector3) => void) | null): THREE.Vector3[];
export declare function createMound(rng: Rng, lod: number, style?: MoundStyle): THREE.BufferGeometry<THREE.NormalBufferAttributes, THREE.BufferGeometryEventMap>;
export declare function createLobes(rng: Rng, lod: number): THREE.BufferGeometry<THREE.NormalBufferAttributes, THREE.BufferGeometryEventMap>;
export declare function createDome(rng: Rng, lod: number): THREE.BufferGeometry<THREE.NormalBufferAttributes, THREE.BufferGeometryEventMap>;
export declare function createPillars(rng: Rng, lod: number): THREE.BufferGeometry<THREE.NormalBufferAttributes, THREE.BufferGeometryEventMap>;
export declare function createElkhorn(rng: Rng, lod: number): THREE.BufferGeometry<THREE.NormalBufferAttributes, THREE.BufferGeometryEventMap>;
export declare function createStaghorn(rng: Rng, lod: number): THREE.BufferGeometry<THREE.NormalBufferAttributes, THREE.BufferGeometryEventMap>;
export declare function createFingers(rng: Rng, lod: number): THREE.BufferGeometry<THREE.NormalBufferAttributes, THREE.BufferGeometryEventMap>;
export declare function createBlades(rng: Rng, lod: number): THREE.BufferGeometry<THREE.NormalBufferAttributes, THREE.BufferGeometryEventMap>;
export declare function createPlates(rng: Rng, lod: number): THREE.BufferGeometry<THREE.NormalBufferAttributes, THREE.BufferGeometryEventMap>;
export declare function createSeaRod(rng: Rng, lod: number): THREE.BufferGeometry<THREE.NormalBufferAttributes, THREE.BufferGeometryEventMap>;
export declare function createWhips(rng: Rng, lod: number): THREE.BufferGeometry<THREE.NormalBufferAttributes, THREE.BufferGeometryEventMap>;
export declare function createBarrel(rng: Rng, lod: number): THREE.BufferGeometry<THREE.NormalBufferAttributes, THREE.BufferGeometryEventMap>;
export declare function createTubes(rng: Rng, lod: number, vase?: boolean): THREE.BufferGeometry<THREE.NormalBufferAttributes, THREE.BufferGeometryEventMap>;
export declare function createRopes(rng: Rng, lod: number): THREE.BufferGeometry<THREE.NormalBufferAttributes, THREE.BufferGeometryEventMap>;
export declare function createUrchin(rng: Rng, lod: number): THREE.BufferGeometry<THREE.NormalBufferAttributes, THREE.BufferGeometryEventMap>;
export declare function createAnemone(rng: Rng, lod: number): THREE.BufferGeometry<THREE.NormalBufferAttributes, THREE.BufferGeometryEventMap>;
export declare function createRubble(rng: Rng, lod: number): THREE.BufferGeometry<THREE.NormalBufferAttributes, THREE.BufferGeometryEventMap>;
export declare function createSeagrass(rng: Rng, lod: number): THREE.BufferGeometry<THREE.NormalBufferAttributes, THREE.BufferGeometryEventMap>;
export declare function createSeaFan(rng: Rng, lod: number): THREE.BufferGeometry<THREE.NormalBufferAttributes, THREE.BufferGeometryEventMap>;
export declare function createSeaPlume(rng: Rng, lod: number): THREE.BufferGeometry<THREE.NormalBufferAttributes, THREE.BufferGeometryEventMap>;
export declare function createMeadow(rng: Rng, lod: number): THREE.BufferGeometry<THREE.NormalBufferAttributes, THREE.BufferGeometryEventMap>;
export declare function createHalimeda(rng: Rng, lod: number): THREE.BufferGeometry<THREE.NormalBufferAttributes, THREE.BufferGeometryEventMap>;
export declare function createPenicillus(rng: Rng, lod: number): THREE.BufferGeometry<THREE.NormalBufferAttributes, THREE.BufferGeometryEventMap>;
export declare function createSargassum(rng: Rng, lod: number): THREE.BufferGeometry<THREE.NormalBufferAttributes, THREE.BufferGeometryEventMap>;
export declare function createLettuce(rng: Rng, lod: number): THREE.BufferGeometry<THREE.NormalBufferAttributes, THREE.BufferGeometryEventMap>;
export declare function createWallPlates(rng: Rng, lod: number): THREE.BufferGeometry<THREE.NormalBufferAttributes, THREE.BufferGeometryEventMap>;
export declare function createWireCoral(rng: Rng, lod: number): THREE.BufferGeometry<THREE.NormalBufferAttributes, THREE.BufferGeometryEventMap>;
export declare function createBlackCoral(rng: Rng, lod: number): THREE.BufferGeometry<THREE.NormalBufferAttributes, THREE.BufferGeometryEventMap>;
export declare function createEarSponge(rng: Rng, lod: number): THREE.BufferGeometry<THREE.NormalBufferAttributes, THREE.BufferGeometryEventMap>;
export declare function createStarfish(rng: Rng, lod: number): THREE.BufferGeometry<THREE.NormalBufferAttributes, THREE.BufferGeometryEventMap>;
export declare function createCucumber(rng: Rng, lod: number): THREE.BufferGeometry<THREE.NormalBufferAttributes, THREE.BufferGeometryEventMap>;
export declare function createConch(rng: Rng, lod: number): THREE.BufferGeometry<THREE.NormalBufferAttributes, THREE.BufferGeometryEventMap>;
