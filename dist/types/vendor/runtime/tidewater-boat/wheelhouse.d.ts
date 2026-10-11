/** Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
import { BufferGeometry, Vector3 } from 'three';
import { type GeoKit } from './geo-kit.js';
import { type HullLines } from './hull-lines.js';
import { type BoatParts } from './deck-gear.js';
export type { BoatParts };
export declare const HOUSE: {
    wallT: number;
    wsBottomY: number;
    wsTopY: number;
    roofUnderY: number;
    roofZ0: number;
    roofZ1: number;
    winBottom: number;
    winTop: number;
    dash: {
        zFace: number;
        yKnee: number;
        zTop: number;
        yTop: number;
        zBack: number;
        halfW: number;
    };
    helmX: number;
    seatZ: number;
};
export declare function wsZ(L: HullLines, y: number): number;
export declare function wallX(L: HullLines, z: number, y: number): number;
export declare function roofTopY(x: number): number;
export declare function quad(a: Vector3, b: Vector3, c: Vector3, d: Vector3, uvs?: number[]): BufferGeometry<import("three").NormalBufferAttributes, import("three").BufferGeometryEventMap>;
export declare function buildWheelhouse(kit: GeoKit, L: HullLines, parts: BoatParts): void;
export declare function panelFrame(): {
    along: Vector3;
    normal: Vector3;
    at: (x: number, f: number) => Vector3;
    length: number;
    angle: number;
};
export declare function wheelGeometry(): BufferGeometry<import("three").NormalBufferAttributes, import("three").BufferGeometryEventMap>;
export declare function throttleGeometry(): BufferGeometry<import("three").NormalBufferAttributes, import("three").BufferGeometryEventMap>;
export declare function radarArrayGeometry(): BufferGeometry<import("three").NormalBufferAttributes, import("three").BufferGeometryEventMap>;
