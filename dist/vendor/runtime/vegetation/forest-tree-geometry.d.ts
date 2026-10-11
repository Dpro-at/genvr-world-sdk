/** Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
import * as THREE from 'three';
import { GeoBuilder, type Four } from './geometry-builder.js';
/** Source util/Noise.js mulberry32 (same as the private copy in palm-geometry.ts). */
export declare function mulberry32(seed: number): () => number;
export declare const smooth: (a: number, b: number, x: number) => number;
/** Lobe [x, y, z, radius] in plant-local space. */
export type Lobe = readonly [number, number, number, number];
export type FlexFn = (p: THREE.Vector3) => number;
type Rand = () => number;
export declare const _up: THREE.Vector3;
export declare const TREE_H = 12.5;
export declare const TREE_LOBES: readonly Lobe[];
export declare const TREE_VARIANTS = 3;
export declare function addBranch(b: GeoBuilder, p0: THREE.Vector3, p1: THREE.Vector3, r0: number, r1: number, radial: number, rows: number, mat: Four, hScale: number, flexFn: FlexFn, radiusFn?: ((f: number, a: number, c: THREE.Vector3) => number) | null): void;
export interface CardSpec {
    center: THREE.Vector3;
    size: number;
    normal: THREE.Vector3;
    yaw: number;
    lobeC: THREE.Vector3;
    lobeR: number;
    lobeId: number;
    crownC: THREE.Vector3;
    crownR: THREE.Vector3;
    rand: Rand;
    flexFn: FlexFn;
    hScale: number;
    part: number;
    clumpC?: THREE.Vector3 | null;
    clumpR?: number;
}
export interface CardOptions {
    crownC: THREE.Vector3;
    crownR: THREE.Vector3;
    rand: Rand;
    flexFn: FlexFn;
    hScale: number;
    part: number;
    flatten?: number;
}
export declare function lobeCards(lobe: Lobe, id: number, { count, size, crownC, crownR, rand, flexFn, hScale, part, flatten }: CardOptions & {
    count: number;
    size: number;
}): CardSpec[];
export declare function emitCards(b: GeoBuilder, cards: CardSpec[], crownC: THREE.Vector3): void;
export declare function buildTreeNear(seed?: number, b?: GeoBuilder): {
    geometry: THREE.BufferGeometry<THREE.NormalBufferAttributes, THREE.BufferGeometryEventMap>;
    triangles: number;
};
export {};
