/** Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
import { Matrix4, Vector3 } from 'three';
import { Builder, type Num3, type P3 } from './geo-builder.js';
import type { VillageColliders } from './context.js';
export declare const lin: (hex: number) => number[];
export declare const mulc: (c: Num3, k: number) => number[];
export declare const WOOD: (seed: number, weather?: number, paint?: number, pattern?: number) => number[];
export declare const HARD: (seed: number, rust?: number, metal?: number, rough?: number) => number[];
export declare const C: {
    iron: number[];
    galv: number[];
    rubber: number[];
    brass: number[];
    rope: number[];
    ropeDark: number[];
    ropeBlue: number[];
    white: number[];
    orange: number[];
    red: number[];
    yellow: number[];
    green: number[];
    blue: number[];
    black: number[];
    fishSilver: number[];
    fishDry: number[];
    glassWarm: number[];
    straw: number[];
};
export declare class Rand {
    fn: () => number;
    constructor(fn: () => number);
    next(): number;
    range(a: number, b: number): number;
    int(a: number, b: number): number;
    pick<T>(arr: readonly T[]): T;
    chance(p: number): boolean;
}
/** Source util/Noise.js mulberry32. */
export declare function mulberry32(seed: number): () => number;
export declare function bollard(B: Builder, x: number, y: number, z: number, seed?: number): void;
export declare function cleat(B: Builder, x: number, y: number, z: number, ry?: number, seed?: number): void;
export declare function tireFender(B: Builder, x: number, yTop: number, z: number, ry?: number, drop?: number, seed?: number): void;
export declare function ropeCoil(B: Builder, x: number, y: number, z: number, r0?: number, r1?: number, turns?: number, seed?: number, tint?: Num3): void;
export declare function ropeLoop(B: Builder, x: number, y: number, z: number, R: number, tailTo?: P3 | null, seed?: number): void;
export declare function lifeRing(B: Builder, x: number, y: number, z: number, ry?: number, seed?: number): void;
export declare function lantern(B: Builder, x: number, y: number, z: number, seed?: number, scale?: number): readonly [number, number, number];
export declare function wallLantern(B: Builder, x: number, y: number, z: number, seed?: number): Vector3;
export declare function lampPost(B: Builder, x: number, y: number, z: number, armYaw: number, h?: number, seed?: number): Vector3;
export declare function pathLight(B: Builder, x: number, y: number, z: number, seed?: number): Vector3;
export declare function bench(B: Builder, x: number, y: number, z: number, ry?: number, len?: number, seed?: number, paint?: Num3 | null): void;
export declare function bucket(B: Builder, x: number, y: number, z: number, tint?: Num3, seed?: number): void;
/** Instance options handed to FishProps.add (source FishProps.js 360-400). */
export type FishOptions = Record<string, unknown>;
/** Collector of the fish / ice / leaf / lobster displays (source fish/FishProps.js instance API). */
export interface FishPropsSink {
    add(kind: string, species: string | null, m: Matrix4, pose: string, len: number, o: FishOptions): void;
}
/** The FishProps class: constructor plus the static anchors the props need. */
export interface FishPropsApi {
    new (): FishPropsSink;
    tailAnchor(species: string): number[];
    gillAnchor(species: string): number[];
    restHeight(species: string, len: number): number;
}
/**
 * Placeholder until the fish task ports fish/FishProps.js: records every display (the matrix is
 * copied, the source passes a shared scratch matrix) with zero anchors and rest heights.
 */
export declare class FishPropsRecorder implements FishPropsSink {
    items: {
        kind: string;
        species: string | null;
        matrix: Matrix4;
        pose: string;
        len: number;
        o: FishOptions;
    }[];
    add(kind: string, species: string | null, m: Matrix4, pose: string, len: number, o: FishOptions): void;
    static tailAnchor(): number[];
    static gillAnchor(): number[];
    static restHeight(): number;
}
/** Inject the real fish display collector (fish task); returns the previous one. */
export declare function setFishProps(api: FishPropsApi): FishPropsApi;
export interface FishPlacement {
    species?: string;
    len?: number;
    kind?: string;
    pose?: string;
    ry?: number;
    rx?: number;
    rz?: number;
    flip?: boolean;
    curl?: number;
    sag?: number;
    jaw?: number;
    seed?: number;
    cloudy?: number;
    wet?: number;
    dried?: number;
    blood?: number;
}
export declare function fish(B: Builder, x: number, y: number, z: number, o?: FishPlacement): void;
export declare function iceBed(B: Builder, x: number, y: number, z: number, r: number, seed?: number): void;
export declare function bananaLeaf(B: Builder, x: number, y: number, z: number, ry?: number, len?: number, seed?: number, tilt?: number): void;
export declare function lobster(B: Builder, x: number, y: number, z: number, ry?: number, len?: number, seed?: number, rx?: number): void;
export declare function fishTwine(B: Builder, a: P3, b: P3, seed?: number, loop?: number): void;
export declare function sHook(B: Builder, x: number, yRail: number, z: number, railR?: number, seed?: number): number;
export declare function cleaningTable(B: Builder, x: number, y: number, z: number, ry?: number, seed?: number): void;
export interface Turn {
    rx?: number;
    ry?: number;
    rz?: number;
}
export declare function buoy(B: Builder, x: number, y: number, z: number, colA: Num3, colB: Num3, kind?: number, seed?: number, o?: Turn): void;
export declare function buoyString(B: Builder, a: P3, b: P3, count: number, rand: Rand, sag?: number): void;
export declare function oar(B: Builder, p0: P3, p1: P3, seed?: number, bladeTint?: Num3 | null): void;
export interface RowboatOptions {
    length?: number;
    beam?: number;
    depth?: number;
    seed?: number;
    hull?: Num3;
    bottom?: Num3;
    trim?: Num3;
    upsideDown?: boolean;
    rx?: number;
    rz?: number;
    interior?: boolean;
    oars?: boolean;
}
export declare function rowboat(B: Builder, x: number, y: number, z: number, ry?: number, o?: RowboatOptions): void;
export interface WreckOptions {
    length?: number;
    beam?: number;
    depth?: number;
    rx?: number;
    rz?: number;
}
export declare function wreck(B: Builder, x: number, y: number, z: number, ry: number, rand: Rand, o?: WreckOptions): void;
type LocalGround = (lx: number, lz: number) => number;
export declare function netRack(B: Builder, x: number, gy: number, z: number, ry: number, len?: number, netTint?: Num3, seed?: number, groundFn?: LocalGround | null): void;
export declare function fishRack(B: Builder, x: number, gy: number, z: number, ry: number, len?: number, seed?: number, rand?: Rand | null): void;
export declare function fence(B: Builder, pts: readonly (readonly [number, number])[], groundFn: LocalGround, style?: string, tint?: Num3, seed?: number, colliders?: VillageColliders | null, toWorld?: ((x: number, z: number) => Vector3) | null): void;
export declare function waterTank(B: Builder, x: number, gy: number, z: number, seed?: number, galvanized?: boolean): number;
export declare function woodpile(B: Builder, x: number, gy: number, z: number, ry: number, rand: Rand): void;
export declare function flagPole(B: Builder, x: number, gy: number, z: number, h?: number, flagTint?: Num3, seed?: number): void;
export declare function laundryLine(B: Builder, a: P3, b: P3, rand: Rand, colors: readonly Num3[]): void;
export type InstancedPropType = 'barrel' | 'crate' | 'trap';
export declare class InstancedProps {
    target: Builder;
    protos: Record<InstancedPropType, Builder>;
    counts: Record<InstancedPropType, number>;
    _m: Matrix4;
    constructor(target: Builder);
    _proto(fn: (B: Builder) => void): Builder;
    add(type: string, x: number, y: number, z: number, ry?: number, color?: readonly number[] | null, rx?: number, rz?: number): void;
    get count(): number;
    build(): never[];
}
export {};
