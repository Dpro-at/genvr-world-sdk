/** Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
import { Vector3 } from 'three';
import { Part, type Builder, type Num3 } from '../tidewater-village/geo-builder.js';
import type { Rng } from './shore-math.js';
/** Terrain height at (x, z) (the source's `ground( x, z )`). */
export type Ground = (x: number, z: number) => number;
export declare const KIND: {
    STONE: number;
    COCONUT: number;
    WEED: number;
    SHELL: number;
    CORAL: number;
    FROND: number;
    DRIFT: number;
};
export declare const nat: (seed: number, kind: number, p0?: number, size?: number) => number[];
export declare function hash1(n: number): number;
export declare function vnoise3(x: number, y: number, z: number, s?: number): number;
export declare function gridMesh(P: readonly (readonly Num3[])[], wrap: boolean, uvFn: (i: number, j: number) => Num3, ref?: ((j: number, i: number, p: Num3) => Num3) | null): Part;
export declare function mergeParts(parts: readonly Part[]): Part;
export declare function taperTube(pts: readonly Num3[], radii: readonly number[], radial?: number, rFn?: ((k: number, a: number) => number) | null, uScale?: number): {
    part: Part;
    rings: number[][][];
    T: Vector3[];
    len: number[];
};
export declare function stonePart(variant: number, detail?: number, angular?: number): Part;
/** stone() options (source `o = {}`). */
export interface StoneOptions {
    y?: number | undefined;
    sink?: number | undefined;
    detail?: number | undefined;
    angular?: number | undefined;
    tilt?: number | undefined;
    tint?: Num3 | undefined;
    palette?: number | undefined;
}
export declare function stone(B: Builder, ground: Ground, x: number, z: number, sx: number, sy: number, sz: number, rand: Rng, o?: StoneOptions): number;
export declare function minGround(ground: Ground, x: number, z: number, r: number): number;
/** driftLog() options (source `o = {}`). */
export interface DriftLogOptions {
    len?: number | undefined;
    r0?: number | undefined;
    r1?: number | undefined;
    roots?: boolean | undefined;
    weather?: number | undefined;
    sink?: number | undefined;
    bend?: number | undefined;
    stubs?: number | undefined;
    bark?: number | undefined;
}
export declare function driftLog(B: Builder, ground: Ground, x: number, z: number, yaw: number, rand: Rng, o?: DriftLogOptions): {
    y: number;
    pitch: number;
    r: number;
};
/** branch() options (source `o = {}`; `weather` is passed by the placer but unused). */
export interface BranchOptions {
    tone?: Num3 | undefined;
    twigs?: number | undefined;
    weather?: number | undefined;
}
export declare function branch(B: Builder, ground: Ground, x: number, z: number, yaw: number, len: number, r0: number, rand: Rng, o?: BranchOptions): number[][];
/** plank() options (source `o = {}`). */
export interface PlankOptions {
    lift?: number | undefined;
    y?: number | undefined;
    sink?: number | undefined;
    paint?: number | undefined;
    tint?: Num3 | undefined;
    weather?: number | undefined;
}
export declare function plank(B: Builder, ground: Ground, x: number, z: number, yaw: number, len: number, w: number, th: number, rand: Rng, o?: PlankOptions): number;
/** coconut() options (source `o = {}`). */
export interface CoconutOptions {
    scale?: number | undefined;
    age?: number | undefined;
}
export declare function coconut(B: Builder, ground: Ground, x: number, z: number, rand: Rng, o?: CoconutOptions): void;
export declare function husk(B: Builder, ground: Ground, x: number, z: number, rand: Rng): void;
/** weedMat() options (source `o = {}`). */
export interface WeedMatOptions {
    aspect?: number | undefined;
    rot?: number | undefined;
    dry?: number | undefined;
    tint?: Num3 | undefined;
    fringe?: boolean | undefined;
    strands?: number | undefined;
}
export declare function weedMat(B: Builder, ground: Ground, x: number, z: number, R: number, H: number, rand: Rng, o?: WeedMatOptions): void;
/** seagrassWrack() options (source `o = {}`). */
export interface SeagrassOptions {
    count?: number | undefined;
    dir?: number | undefined;
    lift?: number | undefined;
    minLen?: number | undefined;
    dry?: number | undefined;
}
export declare function seagrassWrack(B: Builder, ground: Ground, x: number, z: number, R: number, rand: Rng, o?: SeagrassOptions): void;
/** frond() options (source `o = {}`). */
export interface FrondOptions {
    dry?: number | undefined;
    arch?: number | undefined;
    leaflets?: number | undefined;
    broken?: number | undefined;
}
export declare function frond(B: Builder, ground: Ground, x: number, z: number, yaw: number, len: number, rand: Rng, o?: FrondOptions): void;
/** shell() options (source `o = {}`). */
export interface ShellOptions {
    type?: number | undefined;
}
export declare function shell(B: Builder, ground: Ground, x: number, z: number, size: number, rand: Rng, o?: ShellOptions): void;
/** coralPiece() options (source `o = {}`). */
export interface CoralOptions {
    bleach?: number | undefined;
    head?: boolean | undefined;
}
export declare function coralPiece(B: Builder, ground: Ground, x: number, z: number, size: number, rand: Rng, o?: CoralOptions): void;
/** tyre() options (source `o = {}`). */
export interface TyreOptions {
    R?: number | undefined;
    r?: number | undefined;
    y?: number | undefined;
    lean?: number | undefined;
    sink?: number | undefined;
    ry?: number | undefined;
}
export declare function tyre(B: Builder, ground: Ground, x: number, z: number, rand: Rng, o?: TyreOptions): number;
export declare function bottle(B: Builder, ground: Ground, x: number, z: number, rand: Rng): void;
export declare function flipFlop(B: Builder, ground: Ground, x: number, z: number, rand: Rng): void;
/** ropeScrap() options (source `o = {}`). */
export interface RopeScrapOptions {
    r?: number | undefined;
    tint?: Num3 | undefined;
    tangle?: boolean | undefined;
    R?: number | undefined;
    len?: number | undefined;
}
export declare function ropeScrap(B: Builder, ground: Ground, x: number, z: number, rand: Rng, o?: RopeScrapOptions): void;
/** netScrap() options (source `o = {}`). */
export interface NetScrapOptions {
    w?: number | undefined;
    d?: number | undefined;
    tint?: Num3 | undefined;
}
export declare function netScrap(B: Builder, ground: Ground, x: number, z: number, rand: Rng, o?: NetScrapOptions): void;
/** floatBuoy() options (source `o = {}`). */
export interface FloatBuoyOptions {
    kind?: number | undefined;
}
export declare function floatBuoy(B: Builder, ground: Ground, x: number, z: number, rand: Rng, o?: FloatBuoyOptions): void;
/** wheelbarrow() options (source `o = {}`). */
export interface WheelbarrowOptions {
    tint?: Num3 | undefined;
}
export declare function wheelbarrow(B: Builder, ground: Ground, x: number, z: number, yaw: number, rand: Rng, o?: WheelbarrowOptions): void;
/** plankPile() options (source `o = {}`). */
export interface PlankPileOptions {
    n?: number | undefined;
    len?: number | undefined;
}
export declare function plankPile(B: Builder, ground: Ground, x: number, z: number, yaw: number, rand: Rng, o?: PlankPileOptions): {
    h: number;
    L: number;
};
