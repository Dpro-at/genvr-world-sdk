/** Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
import { BufferGeometry, Matrix4, Vector3, type Camera, type Object3D } from 'three';
import { type MarineBatch, type WgslMaterial } from './marine-shared.js';
declare function iceGeometry(lod: number): BufferGeometry<import("three").NormalBufferAttributes, import("three").BufferGeometryEventMap>;
declare function leafGeometry(lod: number): BufferGeometry<import("three").NormalBufferAttributes, import("three").BufferGeometryEventMap>;
declare function lobsterGeometry(lod: number): BufferGeometry<import("three").NormalBufferAttributes, import("three").BufferGeometryEventMap>;
export declare function bendPoint(x: number, y: number, z: number, curl: number, sag: number, out: Vector3): Vector3;
export declare const POSE: Record<string, Matrix4>;
export { iceGeometry, leafGeometry, lobsterGeometry };
/** Placement options (the village's fish()/iceBed()/bananaLeaf()/lobster() pass these). */
export interface FishPropOptions {
    curl?: number;
    sag?: number;
    jaw?: number;
    seed?: number;
    anchor?: number[];
    cloudy?: number;
    wet?: number;
    dried?: number;
    blood?: number;
    [key: string]: unknown;
}
/** One collected display piece (the source's item record). */
export interface FishPropItem {
    kind: string;
    species: string | null;
    L: number;
    x: number;
    y: number;
    z: number;
    q: number[];
    pattern: number;
    seed: number;
    curl: number;
    sag: number;
    jaw: number;
    flags: number[];
}
export declare class FishProps {
    items: FishPropItem[] | null;
    mesh: Object3D | null;
    kind0?: Uint16Array;
    pos?: Float32Array;
    batch?: MarineBatch;
    material?: WgslMaterial;
    fadeMaterial?: WgslMaterial;
    _frame?: number;
    add(kind: string, species: string | null, frame: Matrix4, pose: string, L: number, o?: FishPropOptions): void;
    static restHeight(species: string, L: number): number;
    static tailAnchor(species: string): number[];
    static gillAnchor(species: string): number[];
    build(): Object3D<import("three").Object3DEventMap>;
    cull(camera: Camera, frame: number): void;
}
