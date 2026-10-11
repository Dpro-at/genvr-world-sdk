/** Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
/** Seeded uniform [0, 1) generator (Noise.js mulberry32). */
export type Rng = () => number;
export declare function mulberry32(seed: number): Rng;
/** Seeded 2D gradient noise (Noise.js Noise2D: constructor and `noise`). */
export declare class Noise2D {
    perm: Uint8Array;
    grad: Float32Array;
    constructor(seed?: number);
    noise(x: number, y: number): number;
}
export declare const smoothstep: (a: number, b: number, x: number) => number;
export declare const clamp: (x: number, a: number, b: number) => number;
