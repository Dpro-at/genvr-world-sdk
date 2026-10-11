/** Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
import { BufferGeometry, Matrix4, Vector3 } from 'three';
/** Three numbers (a colour or a point). */
export type Num3 = readonly number[];
export type TintFn = (x: number, y: number, z: number, i: number) => Num3;
export type DataFn = (x: number, y: number, z: number, i: number) => readonly number[];
export type ColorLike = {
    r: number;
    g: number;
    b: number;
};
export type Tint = Num3 | TintFn | ColorLike | null | undefined;
export type VData = readonly number[] | DataFn;
/** Options of the Builder emitters (source `o = {}`). */
export interface PartOptions {
    grain?: number | undefined;
    skip?: number | undefined;
    rx?: number | undefined;
    ry?: number | undefined;
    rz?: number | undefined;
    sx?: number | undefined;
    sy?: number | undefined;
    sz?: number | undefined;
    tint?: Tint;
    data?: VData | undefined;
    segs?: number | undefined;
    capTop?: boolean | undefined;
    capBot?: boolean | undefined;
    swapUV?: boolean | undefined;
    rRef?: number | null | undefined;
    radial?: number | undefined;
    tubular?: number | undefined;
    arc?: number | undefined;
    extend?: number | undefined;
    roll?: number | undefined;
    uDir?: Vector3 | null | undefined;
    up?: Vector3 | null | undefined;
}
export declare const END_GRAIN_U = 1000;
export declare const CAP_U = 2000;
export declare const WRAP_PERIOD: Readonly<Record<string, number>>;
export declare class Part {
    p: Float32Array;
    n: Float32Array;
    uv: Float32Array;
    idx: number[];
    constructor(p: Float32Array | number[], n: Float32Array | number[], uv: Float32Array | number[], idx: number[]);
    get vertexCount(): number;
}
export declare function boxPart(sx: number, sy: number, sz: number, grain?: number, skip?: number): Part;
export interface GridVertex {
    p: Num3;
    n: Num3;
    uv: readonly number[];
}
export declare function gridPart(cols: number, rows: number, fn: (i: number, j: number) => GridVertex): Part;
export declare function cylPart(rTop: number, rBot: number, h: number, segs?: number, capTop?: boolean, capBot?: boolean, swapUV?: boolean, period?: number): Part;
/** Lathe profile point [r, y]. */
export type ProfilePoint = readonly [number, number];
export declare function lathePart(profile: readonly ProfilePoint[], segs?: number, rRef?: number | null, period?: number): Part;
export declare function torusPart(R: number, r: number, radial?: number, tubular?: number, arc?: number): Part;
export declare function tubePart(points: readonly Vector3[], radius: number, radial?: number): Part;
export declare function planePart(w: number, h: number, sw?: number, sh?: number, hang?: boolean): Part;
export declare function quad01Part(w: number, h: number): Part;
export declare function slabPart(pts: readonly Vector3[], thickness: number, uDir?: Vector3 | null, upHint?: Vector3 | null): Part;
export declare function fixWinding(part: Part): Part;
export declare function gablePart(w: number, h: number, depth: number): Part;
export declare class Batch {
    pos: number[];
    nrm: number[];
    uv: number[];
    tint: number[];
    data: number[];
    idx: number[];
    vcount: number;
    get triangles(): number;
    add(part: Part, m: Matrix4, tint: Num3 | TintFn, data: VData): void;
    addBatch(src: Batch, m: Matrix4, tintMul?: Num3 | null, seedOffset?: number): void;
    append(src: Batch, dataFn?: ((d: number[]) => readonly number[]) | null): void;
    build(): BufferGeometry<import("three").NormalBufferAttributes, import("three").BufferGeometryEventMap>;
}
export declare function mat4(x?: number, y?: number, z?: number, ry?: number, rx?: number, rz?: number, out?: Matrix4): Matrix4;
/** Local point [x, y, z] of the Builder emitters. */
export type P3 = readonly number[];
export declare class Builder {
    batches: Record<string, Batch | undefined>;
    frame: Matrix4;
    stack: Matrix4[];
    /** Fish display collector (Props.js fish(), set lazily; see props.ts setFishProps). */
    fishProps?: unknown;
    batch(key: string): Batch;
    push(m: Matrix4): this;
    pushAt(x: number, y: number, z: number, ry?: number, rx?: number, rz?: number): this;
    pop(): this;
    toWorld(x: number, y: number, z: number, out?: Vector3): Vector3;
    add(key: string, part: Part, local: Matrix4, tint?: Tint, data?: VData): void;
    box(key: string, x: number, y: number, z: number, sx: number, sy: number, sz: number, o?: PartOptions): void;
    cyl(key: string, x: number, y: number, z: number, rTop: number, rBot: number, h: number, o?: PartOptions): void;
    lathe(key: string, x: number, y: number, z: number, profile: readonly ProfilePoint[], o?: PartOptions): void;
    torus(key: string, x: number, y: number, z: number, R: number, r: number, o?: PartOptions): void;
    part(key: string, part: Part, x: number, y: number, z: number, o?: PartOptions): void;
    beam(key: string, p0: P3, p1: P3, w: number, h: number, o?: PartOptions): void;
    rod(key: string, p0: P3, p1: P3, r0: number, r1?: number, o?: PartOptions): void;
    tube(key: string, points: readonly Vector3[], radius: number, o?: PartOptions): void;
    slab(key: string, pts: readonly Vector3[], thickness: number, o?: PartOptions): void;
    get triangles(): number;
}
export declare function sagPoints(a: P3, b: P3, sag: number, n?: number): Vector3[];
