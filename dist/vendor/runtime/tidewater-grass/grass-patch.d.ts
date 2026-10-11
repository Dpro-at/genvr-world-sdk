/** Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
import { InstancedBufferGeometry } from 'three';
import { type Rng } from './grass-noise.js';
export declare const CELL = 8;
export declare const R_NEAR = 18;
export declare const R_MID = 46;
export declare const R_FAR = 88;
export declare const FADE_T2: readonly [11, 17];
export declare const FADE_T1: readonly [36, 45];
export declare const FADE_T0: readonly [62, 87];
export declare const MAX_NEAR = 48;
export declare const MAX_MID = 160;
export declare const MAX_FAR = 420;
export declare const CLUMPS = 384;
export declare const BLADES = 7;
export declare const BLADE_TIER: readonly [0, 0, 1, 1, 2, 2, 2];
export declare const TIER_N: readonly [2, 2, 3];
export declare const OATS = 12;
export declare const VINES = 28;
export declare const KIND: {
    readonly GRASS: 0;
    readonly OAT_STALK: 1;
    readonly OAT_HEAD: 2;
    readonly CREEPER: 3;
    readonly FLOWER: 4;
};
export type P2 = [number, number];
type V3 = [number, number, number];
type V4 = [number, number, number, number];
export declare function blueNoise(rand: Rng, n: number, size: number, k?: number): P2[];
export declare class PatchBuilder {
    pos: number[];
    nor: number[];
    side: number[];
    slot: number[];
    bladeData: number[];
    idx: number[];
    get count(): number;
    v(p: V3, n: V3, side: V3 | V4, slot: V4, blade: V4): number;
    blade(slot: V4, kind: number, rows: readonly number[], width: number, dirX: number, dirZ: number, lean: number, height: number, curve: number, rnd: number, base?: P2, w4?: number): void;
    fan(slot: V4, kind: number, center: P2, radius: number, dirX: number, dirZ: number, tilt: number, sides: number, outline: (a: number) => number, rnd: number, lift: number, hf?: number): void;
    ribbon(slot: V4, kind: number, pts: V3[], width: number, rnd: number): void;
    build(): InstancedBufferGeometry;
    get triangles(): number;
}
export interface GrassBlade {
    dx: number;
    dz: number;
    lean: number;
    h: number;
    curve: number;
    rnd: number;
    base: P2;
    tier: number;
}
export interface GrassClump {
    x: number;
    z: number;
    slotRand: number;
    blades: GrassBlade[];
}
export declare function clumpParams(seed: number): GrassClump[];
/** Patch level: 0 near, 1 mid, 2 far. */
export type GrassLevel = 0 | 1 | 2;
export declare function buildPatch(level: GrassLevel, clumps: GrassClump[], seed?: number): PatchBuilder;
export {};
