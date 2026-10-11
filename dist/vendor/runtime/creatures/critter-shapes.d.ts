/** Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
import { BufferGeometry, Vector4 } from 'three';
export interface CritterTemplate {
    geometry: BufferGeometry;
    bodyData: Float32Array;
    limbs: Vector4[];
    species: number;
    vertices: number;
    triangles: number;
}
export declare const CRITTER: {
    readonly GHOST: 0;
    readonly HERMIT: 1;
    readonly BURROW: 2;
};
export declare const NU = 12, NV = 9;
export declare const BODY_VERTS: number;
export declare const LIMBS = 12;
export declare function buildCritters(): CritterTemplate;
