/** Tidewater4811ba48, ©2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
import * as THREE from 'three';
export type Four = readonly [number, number, number, number];
export declare class GeoBuilder {
    pos: number[];
    nor: number[];
    uv: number[];
    veg: number[];
    mat: number[];
    lobe: number[];
    idx: number[];
    kind: number;
    constructor();
    get count(): number;
    vertex(p: THREE.Vector3, n: THREE.Vector3, u: number, v: number, veg: Four, mat: Four, lobe?: Four | null): number;
    tri(a: number, b: number, c: number): void;
    quad(a: number, b: number, c: number, d: number): void;
    build(boundingRadius?: number, boundingCenter?: THREE.Vector3 | null): THREE.BufferGeometry<THREE.NormalBufferAttributes, THREE.BufferGeometryEventMap>;
    get triangles(): number;
}
