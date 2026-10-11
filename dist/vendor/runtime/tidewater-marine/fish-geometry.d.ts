/** Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
import { BufferGeometry } from 'three';
import type { FishAnatomy } from './fish-species.js';
export declare const PART: {
    readonly BODY: 0;
    readonly DORSAL1: 1;
    readonly DORSAL2: 2;
    readonly ANAL: 3;
    readonly CAUDAL: 4;
    readonly PECTORAL: 5;
    readonly PELVIC: 6;
    readonly FINLET: 7;
    readonly EYE: 8;
    readonly MOUTH: 9;
    readonly FLESH: 10;
    readonly ICE: 11;
    readonly LEAF: 12;
    readonly SHELL: 13;
    readonly FILLET: 14;
    readonly DISC: 15;
    readonly WHIP: 16;
    readonly CARAPACE: 17;
    readonly SKIN: 18;
    readonly FLIPPER: 19;
};
type Profile = readonly (readonly number[])[];
export declare const prof: (pts: Profile, u: number) => number;
export declare class MeshData {
    pos: number[];
    dat: number[];
    idx: number[];
    seams: [number, number][];
    v(x: number, y: number, z: number, d0: number, d1: number, d2: number, d3: number): number;
    tri(a: number, b: number, c: number): void;
    quad(a: number, b: number, c: number, d: number): void;
    build(): BufferGeometry<import("three").NormalBufferAttributes, import("three").BufferGeometryEventMap>;
}
/** Cross-section: depth above (T) / below (B) the axis, half width (W), exponent e = 2 / sec. */
export interface Section {
    T: number;
    B: number;
    W: number;
    e: number;
}
export declare function section(S: FishAnatomy, u: number): Section;
export declare function surfaceX(c: Section, y: number): number;
/** Build options of a fish (see fishGeometry). */
export interface FishGeometryOptions {
    lod?: number;
    pose?: 'swim' | 'dead';
    mouth?: boolean;
    eyes?: boolean;
    fins?: boolean;
    u0?: number;
    u1?: number;
}
/** A fin ray: base and tip points and their positions along the fish. */
export interface FinRay {
    b: number[];
    t: number[];
    ub: number;
    ut: number;
}
export declare function membrane(M: MeshData, part: number, rays: FinRay[], notch: number, rows: number, rayIds: number[], flip: boolean): void;
export declare function fishGeometry(S: FishAnatomy, opts?: FishGeometryOptions): BufferGeometry<import("three").NormalBufferAttributes, import("three").BufferGeometryEventMap>;
export declare function splitFishGeometry(S: FishAnatomy, { lod }?: {
    lod?: number;
}): BufferGeometry<import("three").NormalBufferAttributes, import("three").BufferGeometryEventMap>;
export {};
