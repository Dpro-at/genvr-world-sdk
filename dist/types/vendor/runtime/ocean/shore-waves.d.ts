type V = any;
/** Tidewater's ShoreParams (L180-190). */
export declare const SHORE_DEFAULTS: {
    readonly period: 9;
    /** offshore amplitude (H / 2), m */
    readonly amplitude: 0.34;
    readonly variation: 0.55;
    readonly gamma: 0.78;
    readonly breakSpan: 0.13;
    readonly curl: 1;
    readonly runup: 1;
    readonly turbidity: 0.16;
};
/** The run-up is turned into a horizontal excursion with this slope (L38). */
export declare const BEACH_SLOPE = 0.066;
/** Fractions of the period: uprush, backwash (L39). */
export declare const SWASH_UP = 0.4;
export declare const SWASH_DOWN = 0.55;
/** The mesh sheet reaches this far (m) past the leading edge; the pixel front decides where it ends (L40). */
export declare const SWASH_OVERSHOOT = 1.2;
/** Shore waves only where the sea is shallower than this (WaterSurface.js WATER_SHORE_DEEP). */
export declare const WATER_SHORE_DEEP = 26;
export declare const GRAVITY = 9.81;
declare const TAU: number;
/** The operations the shared formulas need, on numbers (`cpuShore`) or on TSL nodes (`tslShore`). */
export interface ShoreMath {
    c(x: number): V;
    sin(a: V): V;
    cos(a: V): V;
    abs(a: V): V;
    floor(a: V): V;
    fract(a: V): V;
    sqrt(a: V): V;
    exp(a: V): V;
    sign(a: V): V;
    pow(a: V, b: V | number): V;
    min(a: V, b: V | number): V;
    max(a: V, b: V | number): V;
    clamp(a: V, lo: number, hi: number): V;
    sat(a: V): V;
    mix(a: V, b: V | number, t: V | number): V;
    smoothstep(e0: V | number, e1: V | number, x: V): V;
    /** cond ? a : b (both sides are evaluated on the GPU: keep them finite). */
    select(cond: V, a: V | number, b: V | number): V;
}
/** A number with the node-style arithmetic of TSL, for the CPU mirror. Booleans are 1 / 0. */
export declare class Num {
    readonly v: number;
    constructor(v: number);
    add(b: Num | number): Num;
    sub(b: Num | number): Num;
    mul(b: Num | number): Num;
    div(b: Num | number): Num;
    negate(): Num;
    lessThan(b: Num | number): Num;
    greaterThan(b: Num | number): Num;
    and(b: Num): Num;
    or(b: Num): Num;
    not(): Num;
}
/** The shared formulas on plain numbers. */
export declare const cpuShore: ShoreMath;
/** The shared formulas as TSL nodes (`select` blends both sides, see `pick`). */
export declare const tslShore: ShoreMath;
/** `shoreHash1`: a hash of the wave index in 0..1 (sin-free, see the header). */
export declare function shoreHash1(M: ShoreMath, x: V): V;
/**
 * `shoreBar`: a bar along the beach with rip channels every ~100 m. k is 1 over the bar, less in a channel; rip
 * (0..1) is the channel mask.
 */
export declare function shoreBar(M: ShoreMath, along: V): {
    k: V;
    rip: V;
};
/** `shoreWobble`: along-shore phase wobble in periods (crests bend over the uneven bottom). */
export declare function shoreWobble(M: ShoreMath, along: V): V;
/** The phase s of `shorePhaseAt` (L517): `(time - T) / period + wobble(along)`; wave m = round(s). */
export declare function shorePhase(M: ShoreMath, time: V, T: V, along: V, period: V): V;
/** The shore waves' settings as values of the running math (uniforms on the GPU, numbers on the CPU). */
export interface ShoreParams {
    period: V;
    amplitude: V;
    variation: V;
    gamma: V;
    breakSpan: V;
    curl: V;
    runup: V;
    /** 0..1, fades every shore effect (ShoreParams.enabled). */
    enabled: V;
}
/** ShoreParams for the CPU mirror, Tidewater's values unless given. */
export declare function cpuShoreParams(over?: Partial<Record<keyof ShoreParams, number>>): ShoreParams;
/**
 * `shoreWaveAmp` (L304-318): each wave's own height. Sets of ~7 with the biggest in the middle, per-wave
 * randomness, along-shore peaks 40-50 m wide (so waves peel instead of closing out), the bar; never below 2 cm.
 */
export declare function shoreWaveAmp(M: ShoreMath, m: V, along: V, P: ShoreParams): V;
/** The break parameters of a wave of offshore amplitude A in depth d (`shoreBreakParams`, L322-346). */
export interface ShoreBreak {
    db: V;
    b: V;
    Ash: V;
    p: V;
    meanP: V;
    crestPeak: V;
    yc: V;
    yt: V;
    H: V;
    wBore: V;
    Xi: V;
    Hb: V;
    ycB: V;
    ytB: V;
    Xc: V;
    Wt: V;
}
export declare function shoreBreakParams(M: ShoreMath, A: V, d: V, P: ShoreParams): ShoreBreak;
/** `shoreFaceFill` (L357-362): whitewater over the face after the plunge, s = 0 at the crest .. 1 at the foot. */
export declare function shoreFaceFill(M: ShoreMath, b: V, s: V): V;
/** `shoreWhitewater` (L364-376): whitewater at xi (m, shoreward of the crest's rest position). */
export declare function shoreWhitewater(M: ShoreMath, xi: V, lam: V, B: ShoreBreak): V;
/** One point of the cross-section (`ShoreProfile`). */
export interface ShoreProfileOut {
    x: V;
    y: V;
    b: V;
    foam: V;
    face: V;
    roller: V;
}
/**
 * `shoreProfile` (L381-424): the cross-section at local phase u (-0.5..0.5, crest at 0, u < 0 shoreward of it).
 * x: shoreward displacement, y: height above the mean; with foam, the whitewater, the clear plunging face and the
 * roller's relief.
 */
export declare function shoreProfile(M: ShoreMath, u: V, lam: V, B: ShoreBreak, P: ShoreParams, withFoam: boolean): ShoreProfileOut;
/** The run-up of the latest wave at a beach point (`ShoreRunup`). */
export interface ShoreRunup {
    tau: V;
    Rt: V;
    inland: V;
    RhMax: V;
    su: V;
    sb: V;
    isUp: V;
    /** The wave index ms whose run-up this is. */
    ms: V;
}
/**
 * `shoreSwashRunup` (L575-597): run-up of the most recent wave, in metres up the beach face. `Ts`: the arrival time
 * at the shoreline (field alpha), `exposure` the field's, `groundH` the sand height, `level` the sea level.
 */
export declare function shoreSwashRunup(M: ShoreMath, time: V, Ts: V, exposure: V, along: V, groundH: V, level: V, P: ShoreParams): ShoreRunup;
/**
 * The thin swash sheet's surface over the sand (from `shoreEvaluate`, L133-147): `front` = Rt - inland (> 0 under
 * the sheet); the mesh sheet overshoots the front by SWASH_OVERSHOOT and the pixel shader cuts it on the front.
 */
export declare function shoreSwashThickness(M: ShoreMath, front: V): V;
export { TAU };
/**
 * Reads the shore field (RGBA float: T, dir x exposure, Ts) at world xz with a bilinear blend of 4 exact loads
 * (`terrainShoreSample`, TerrainGPU.js L268-282): float32 textures cannot be filtered on every GPU. `field` is a
 * `texture()` node (swap its `.value` for a new field), `res` its cells per side (a uniform).
 */
export declare function shoreFieldSample(field: V, xz: V, origin: V, size: V, res: V): V;
