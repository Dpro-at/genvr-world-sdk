/** Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
import { BufferGeometry } from 'three';
import { type GeoKit } from './geo-kit.js';
import { type HullLines } from './hull-lines.js';
export declare const PALETTE: {
    gelcoat: number;
    lining: number;
    deck: number;
    antifouling: number;
    stainless: number;
};
export declare function buildHull(kit: GeoKit, L: HullLines): void;
export declare function buildHullVolume(L: HullLines): BufferGeometry<import("three").NormalBufferAttributes, import("three").BufferGeometryEventMap>;
export declare function keelBottomAt(z: number): number;
export declare const KEEL: {
    zFront: number;
    zAft: number;
    shoeAft: number;
    bottom: number;
    shoeTop: number;
};
export declare function keelVolume(L: HullLines): number;
export declare function foredeckY(L: HullLines, t: number, x: number): number;
export declare function houseHalfWidth(L: HullLines, z: number): number;
