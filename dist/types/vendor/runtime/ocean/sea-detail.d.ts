import { type Texture } from 'three/webgpu';
import type { ShoreMath } from './shore-waves.js';
type V = any;
/** Tidewater's frame wind (Frame.js L51-55): 7 m/s towards (0.35, 0.94). */
export declare const SEA_DETAIL_WIND: {
    speed: number;
    dir: [number, number];
};
/** SeaDetailParams defaults. */
export declare const SEA_DETAIL_AMOUNTS: {
    readonly gust: 1;
    readonly slick: 1;
    readonly streak: 0.3;
};
/** The noise texture's side. */
export declare const SEA_DETAIL_SIZE = 256;
/** The drift of the patterns at a sea-clock time t (s): downwind at 0.7 x the wind speed. */
export declare function seaDetailOffset(t: number): [number, number];
/** Tileable smooth fbm in 4 channels (`makeNoiseTexture`), each normalised to 0..1, RGBA row-major. */
export declare function seaDetailNoise(size?: number): Float32Array;
/** The four noise reads `seaDetailSample` combines. */
export interface SeaDetailLoads {
    /** gusts: ~620 m and ~230 m features (the second slowly morphing) */
    g1: V;
    g2: V;
    /** slick bands, windrow lines, and their break-up */
    sl: V;
    st: V;
    breakUp: V;
}
/** The combining part of `seaDetailSample`: rough (short-wave slope multiplier), gust, slick, streak (0..1). */
export declare function seaDetailCombine(M: ShoreMath, r: SeaDetailLoads, windSpeed: V, amounts?: {
    gust: V;
    slick: V;
    streak: V;
}): {
    rough: V;
    gust: V;
    slick: V;
    streak: V;
};
/** `SeaDetail`: the noise texture, the drift and `sample(xz)` for the sea's shader. */
export declare class SeaDetail {
    readonly texture: Texture;
    /** accumulated wind drift (m) and the sea clock (s) */
    readonly offset: V;
    readonly time: V;
    constructor();
    /** The patterns at sea-clock time t (room time, so every device has the same gusts). */
    setTime(t: number): void;
    /** `seaDetailSample(xz)` as TSL, with the shared combining formulas. */
    sample(M: ShoreMath, xz: V): {
        rough: V;
        gust: V;
        slick: V;
        streak: V;
    };
    dispose(): void;
}
export {};
