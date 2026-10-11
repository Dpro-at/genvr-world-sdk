/** Tidewater4811ba48, ©2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
import * as THREE from 'three';
import { GeoBuilder } from './geometry-builder.js';
export declare const PART: {
    STEM: number;
    FROND: number;
    FERN: number;
    BANANA: number;
    COCONUT: number;
    MONSTERA: number;
    ELEPHANT: number;
    HELICONIA: number;
    BRACT: number;
    STRELITZIA: number;
    BIRD: number;
};
export declare function buildPalmNear(seed?: number): {
    geometry: THREE.BufferGeometry<THREE.NormalBufferAttributes, THREE.BufferGeometryEventMap>;
    triangles: number;
};
export declare function buildPalmFar(seed?: number): {
    geometry: THREE.BufferGeometry<THREE.NormalBufferAttributes, THREE.BufferGeometryEventMap>;
    triangles: number;
};
export declare function buildYoungPalm(seed?: number, b?: GeoBuilder): {
    geometry: THREE.BufferGeometry<THREE.NormalBufferAttributes, THREE.BufferGeometryEventMap>;
    triangles: number;
};
