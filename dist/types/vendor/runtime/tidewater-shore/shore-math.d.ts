/** Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
import { Vector2, Vector3 } from 'three';
export declare function mulberry32(seed: number): () => number;
export type Rng = () => number;
export declare class Noise2D {
    perm: Uint8Array;
    grad: Float32Array;
    constructor(seed?: number);
    noise(x: number, y: number): number;
    fbm(x: number, y: number, octaves?: number, lacunarity?: number, gain?: number): number;
    ridged(x: number, y: number, octaves?: number): number;
}
export declare const smoothstep: (a: number, b: number, x: number) => number;
export declare const clamp: (x: number, a: number, b: number) => number;
export declare const lerp: (a: number, b: number, t: number) => number;
export declare function hash2(i: number, j: number, s: number): number;
export declare function bandFade(dist: number, start: number, end: number): number;
export declare const WORLD: {
    terrainSize: number;
    terrainRes: number;
    beach: {
        xMin: number;
        xMax: number;
    };
    pier: {
        x: number;
        zStart: number;
        zEnd: number;
        deckHeight: number;
        width: number;
        headWidth: number;
        headDepth: number;
    };
    boatDock: {
        position: Vector3;
        heading: number;
    };
    village: {
        center: Vector3;
        radius: number;
    };
    reef: {
        center: Vector3;
        radius: number;
    };
    spawn: {
        position: Vector3;
        yaw: number;
    };
    start: {
        position: Vector3;
        yaw: number;
    };
    swellDir: Vector2;
};
export type XZ = readonly [number, number];
export interface IslandPath {
    w: number;
    pts: readonly XZ[];
}
export declare const PATHS: readonly IslandPath[];
export declare function polylineDistance(pts: readonly XZ[], x: number, z: number): [number, number];
export declare const srgb: (r: number, g: number, b: number) => string;
export declare const rot2: (v: string, a: number) => string;
