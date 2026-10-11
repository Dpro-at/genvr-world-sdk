/** Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
import { BufferGeometry, Vector3 } from 'three';
import { type GeoKit, type PartOptions } from './geo-kit.js';
import { type HullLines } from './hull-lines.js';
/** Parts the hull and house builders hand to BoatModel (boat frame). */
export interface BoatParts {
    wheelCenter?: Vector3;
    wheelAxis?: Vector3;
    throttlePivot?: Vector3;
    radarPivot?: Vector3;
    flagPivot?: Vector3;
}
export declare function buoyGeometry(colors?: readonly number[], stick?: number): [BufferGeometry<import("three").NormalBufferAttributes, import("three").BufferGeometryEventMap>, PartOptions][];
export declare function buildDeckGear(kit: GeoKit, L: HullLines, parts: BoatParts): void;
export declare const TRAP: {
    L: number;
    W: number;
    H: number;
};
export declare const TRAPS: readonly (readonly [number, number, number, number, number])[];
export declare const HAULER: {
    x: number;
    z: number;
    y: number;
};
export declare const FENDERS: readonly (readonly [number, number])[];
export declare const FLAG: {
    w: number;
    h: number;
};
