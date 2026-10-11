export declare const GRASS_MASK_TEXEL = 2;
/** Scatter.js RULES values the mask reads. */
export declare const GRASS_MASK_RULES: {
    readonly villageRadius: 100;
    readonly spawnClear: 5;
    readonly obstacleClear: 2;
};
/** Land cover at a point (VegSite.cover fields the mask reads). */
export interface GrassCover {
    h: number;
    forest: number;
    bare: number;
    sand: number;
    path: number;
    scarp: number;
}
export interface GrassNoise {
    noise(x: number, y: number): number;
}
/** The VegSite surface `buildGrassMask` uses. */
export interface GrassMaskSite<M = unknown> {
    terrain: {
        size: number;
        origin: number;
        heightAt(x: number, z: number): number;
        scarp?: M | null;
    };
    noise: GrassNoise;
    noise2: GrassNoise;
    hasVillage: boolean;
    rock(x: number, z: number): number;
    cover(x: number, z: number, out: GrassCover): GrassCover;
    spawnDist(x: number, z: number): number;
    obstacleDist(x: number, z: number): number;
    villageDist(x: number, z: number): number;
    inBay(x: number, z: number): boolean;
    height(x: number, z: number): number;
    /** Bilinear sample of a terrain mask array times `scale` (VegSite._mask). */
    _mask(mask: M, x: number, z: number, scale: number): number;
}
export interface GrassMaskOptions {
    /** Rows outside this z band stay empty (source: the island's -950..0). */
    zMin?: number;
    zMax?: number;
    rules?: {
        villageRadius: number;
        spawnClear: number;
        obstacleClear: number;
    };
}
export interface GrassMaskResult {
    data: Uint8Array;
    res: number;
}
export declare function buildGrassMask<M>(site: GrassMaskSite<M>, { zMin, zMax, rules: RULES }?: GrassMaskOptions): GrassMaskResult;
/** Plain per-point inputs for `soilGrassSite` (Genvr soils / covers, or a test ground). */
export interface SoilGrassInputs {
    size: number;
    origin: number;
    heightAt(x: number, z: number): number;
    /** Sand soil weight 0..1. */
    sand(x: number, z: number): number;
    /** Forest cover weight 0..1. */
    forest(x: number, z: number): number;
    rock?(x: number, z: number): number;
    path?(x: number, z: number): number;
    /** Bare rock face tendency (> 0.5 skips the texel); default from `rock` as VegSite.cover: rock * 1.4. */
    bare?(x: number, z: number): number;
    /** Beach zone where dune grass, oats and creeper grow. Default: everywhere. */
    inBay?(x: number, z: number): boolean;
    spawnDist?(x: number, z: number): number;
    obstacleDist?(x: number, z: number): number;
    /** Noise seed: VegSite's `seed` (1234) and `seed * 7 + 3`. */
    seed?: number;
}
/**
 * A `GrassMaskSite` from plain callbacks: no village, no embankment (scarp), distances 1e9 unless
 * given (VegSite.obstacleDist's "far away"). Not part of the source; the source's VegSite derives the
 * same fields from its terrain splats.
 */
export declare function soilGrassSite(inputs: SoilGrassInputs): GrassMaskSite<null>;
