/** Tidewater PostFX.js, pinned 4811ba48, MIT; source equations for CPU/GPU parity. */
export declare const FINAL_DEFAULTS: {
    readonly bloom: 0.05;
    readonly vignette: 0.28;
    readonly saturation: 1.06;
    readonly contrast: 1.04;
    readonly warmth: 0.02;
    readonly grain: 0.012;
    readonly sharpen: 0.45;
    readonly exposure: 0.55;
};
export declare const luminance: (c: readonly number[]) => number;
/** Source tap order a..i are the2px3x3 grid; j..m are the1px diagonals. */
export declare function bloomDown13(taps: readonly (readonly number[])[], first?: boolean): number[];
/** Center and its north/west/east/south neighbors, before the HDR proxy. */
export declare function rcasHDR(center: readonly number[], neighbors: readonly (readonly number[])[], sharpen?: number, sky?: boolean): number[];
export declare function acesFilmic(color: readonly number[], exposure?: number): number[];
export declare function postHash(x: number, y: number, frame: number): number;
export declare function adaptExposure(current: number, average: number, dt: number, night?: number, enabled?: boolean): number;
export declare function gradeDisplay(input: readonly number[], uv: readonly number[], pixel: readonly number[], frame?: number, adaptation?: number): number[];
