/** Tidewater Environment.js (4811ba48), MIT: cube/GGX/SH reference equations. */
export declare const ENVIRONMENT_SIZE = 128;
export declare const ENVIRONMENT_LEVELS = 6;
export declare const ENVIRONMENT_GGX_SAMPLES = 96;
export type EnvRGB = readonly [number, number, number];
export declare const SH_COSINE: readonly [1, number, number, number, 0.25, 0.25, 0.25, 0.25, 0.25];
export declare function environmentCubeDirection(face: number, x: number, y: number, size: number): [number, number, number];
export declare function environmentSHBasis([x, y, z]: EnvRGB): number[];
export declare function environmentSH(radiance: (direction: EnvRGB) => EnvRGB, size?: number): number[][];
export declare function environmentDiffuse(sh: readonly number[][], normal: EnvRGB): number[];
export declare function environmentHammersley(index: number, count?: number): [number, number];
/** CPU GGX at +Z, useful for energy-conservation and sample-sequence checks. */
export declare function environmentGGX(radiance: (direction: EnvRGB, lod: number) => EnvRGB, roughness: number): number[];
