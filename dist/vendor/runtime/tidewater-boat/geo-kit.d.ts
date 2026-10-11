/** Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
import { BoxGeometry, BufferAttribute, BufferGeometry, Color, CylinderGeometry, LatheGeometry, Matrix4, SphereGeometry, TorusGeometry, TubeGeometry, Vector3, type ColorRepresentation, type EulerOrder, type InterleavedBufferAttribute } from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
export type Attr = BufferAttribute | InterleavedBufferAttribute;
export interface PartOptions {
    color?: ColorRepresentation;
    rough?: number;
    metal?: number;
    pattern?: number;
    anim?: number;
    matrix?: Matrix4 | null;
}
/** Source vertex callbacks get a scratch Vector3 and the vertex index. */
export type VertexFn<T> = (p: Vector3, i: number) => T;
export declare function mat4(x?: number, y?: number, z?: number, rx?: number, ry?: number, rz?: number, sx?: number, sy?: number, sz?: number, order?: EulerOrder): Matrix4;
export declare function alignY(pos: Vector3, dir: Vector3, roll?: number): Matrix4;
export declare function linearColor(c: ColorRepresentation): Color;
export declare function prepare<G extends BufferGeometry>(geo: G, { color, rough, metal, pattern, anim, matrix }?: PartOptions): G;
export declare class GeoKit {
    buckets: Map<string, BufferGeometry[]>;
    constructor();
    add<G extends BufferGeometry>(bucket: string, geometry: G, opts?: PartOptions): G;
    merged(bucket: string): BufferGeometry<import("three").NormalBufferAttributes, import("three").BufferGeometryEventMap> | null;
}
export declare function mergePrepared(list: BufferGeometry[]): BufferGeometry<import("three").NormalBufferAttributes, import("three").BufferGeometryEventMap>;
export declare function box(w: number, h: number, d: number): BoxGeometry;
export declare function roundedBox(w: number, h: number, d: number, radius?: number, segments?: number): RoundedBoxGeometry;
export declare function cylinder(rTop: number, rBottom: number, h: number, radial?: number, heightSegs?: number, open?: boolean, thetaStart?: number, thetaLength?: number): CylinderGeometry;
export declare function rod(a: Vector3, b: Vector3, radius: number, radial?: number, rEnd?: number): CylinderGeometry;
export declare function sphere(r: number, w?: number, h?: number, phiStart?: number, phiLength?: number, thetaStart?: number, thetaLength?: number): SphereGeometry;
export declare function torus(R: number, r: number, radial?: number, tubular?: number, arc?: number): TorusGeometry;
export declare function lathe(profile: readonly (readonly [number, number])[], segments?: number): LatheGeometry;
export declare function tube(points: Vector3[], radius: number, tubular?: number, radial?: number, closed?: boolean, tension?: number): TubeGeometry;
export interface GridOptions {
    flip?: boolean;
    uvFn?: ((p: Vector3, i: number, j: number, u: number, v: number) => readonly [number, number]) | null;
    closeJ?: boolean;
}
export declare function gridSurface(rows: Vector3[][], { flip, uvFn, closeJ }?: GridOptions): BufferGeometry<import("three").NormalBufferAttributes, import("three").BufferGeometryEventMap>;
export declare function fanCap(loop: Vector3[], normalHint: Vector3): BufferGeometry<import("three").NormalBufferAttributes, import("three").BufferGeometryEventMap>;
export declare function orientTowards(g: BufferGeometry, dir: Vector3): BufferGeometry<import("three").NormalBufferAttributes, import("three").BufferGeometryEventMap>;
export declare function planarUV(g: BufferGeometry, normal: Vector3): BufferGeometry<import("three").NormalBufferAttributes, import("three").BufferGeometryEventMap>;
export type Outline = readonly (readonly [number, number])[];
export type SlabMap = (u: number, v: number, side: number) => Vector3;
export declare function slab(outline: Outline, holes: readonly Outline[], map: SlabMap, { edges, back, front }?: {
    edges?: boolean | undefined;
    back?: boolean | undefined;
    front?: boolean | undefined;
}): BufferGeometry<import("three").NormalBufferAttributes, import("three").BufferGeometryEventMap>;
export declare function loft(profiles: Vector3[][], { closed, flip }?: {
    closed?: boolean | undefined;
    flip?: boolean | undefined;
}): BufferGeometry<import("three").NormalBufferAttributes, import("three").BufferGeometryEventMap>;
export declare function paintVertices<G extends BufferGeometry>(g: G, fn: VertexFn<ColorRepresentation>): G;
export declare function auxVertices<G extends BufferGeometry>(g: G, fn: VertexFn<readonly [number, number, number, number]>): G;
export declare function triangleCount(g: BufferGeometry): number;
