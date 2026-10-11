/** Points per FFT side (`OceanFFT.js` L26). */
export declare const FFT_SIZE = 256;
/** Tile sizes of the four cascades in meters; non-integer ratios avoid visible repetition (L32). */
export declare const DEFAULT_CASCADE_SIZES: readonly [733, 157, 33.3, 7.1];
/** `Frame.js` L108. */
export declare const GRAVITY = 9.81;
/** Water depth the spectrum assumes (m, L88). */
export declare const OCEAN_DEPTH = 500;
/** Fixed seed: every machine shows the same sea (L111). */
export declare const OCEAN_SEED = 1337;
/** One wave system (`WaveSystem`, L36-51). */
export interface WaveSystem {
    scale: number;
    /** m/s */
    windSpeed: number;
    /** degrees */
    windDirection: number;
    /** km */
    fetch: number;
    spreadBlend: number;
    swell: number;
    peakEnhancement: number;
    shortWavesFade: number;
}
export declare function waveSystem(o?: Partial<WaveSystem>): WaveSystem;
/** The local wind sea (L90). */
export declare const LOCAL_SEA: WaveSystem;
/** The long swell (L91). */
export declare const SWELL: WaveSystem;
/** The packed per-system numbers the spectrum reads (`sysA`, `sysB`, L215-225). */
export interface SystemParams {
    /** scale, angle (rad), spreadBlend, swell */
    a: [number, number, number, number];
    /** alpha, peakOmega, gamma, shortWavesFade */
    b: [number, number, number, number];
}
export declare function systemParams(s: WaveSystem): SystemParams;
/** Each cascade keeps only the wavenumbers in its own band (L202-209). */
export declare function bandCuts(sizes: readonly number[]): Array<[number, number]>;
export declare function dispersion(k: number, depth?: number): number;
export declare function dispersionDerivative(k: number, depth?: number): number;
/** Shallow-water (TMA) correction. */
export declare function tmaCorrection(omega: number, depth?: number): number;
export declare function jonswap(omega: number, p: SystemParams, depth?: number): number;
export declare function normalisationFactor(s: number): number;
export declare function directionSpectrum(theta: number, omega: number, p: SystemParams): number;
export declare function shortWavesFade(k: number, p: SystemParams): number;
/** PCG hash on unsigned 32-bit integers (`fftPcg`). */
export declare function pcg(v: number): number;
/** A hash to (0, 1), never 0 (`fftToUnit`). */
export declare function toUnit(h: number): number;
export interface SpectrumOptions {
    sizes?: readonly number[];
    depth?: number;
    seed?: number;
    local?: WaveSystem;
    swell?: WaveSystem;
}
/**
 * The starting spectrum of every cascade, as the GPU wants it after Tidewater's init + conjugate + copy
 * kernels (L297-379):
 * - `h0` per texel: (h0(k).re, h0(k).im, h0(-k).re, -h0(-k).im), so one read gives h0 and conj(h0(-k));
 * - `waves` per texel: (kx, kz, 1/|k|, omega), or (kx, kz, 0, 0) outside the cascade's band.
 * Index: cascade * N * N + row * N + column; texel (x, y) holds k = ((x - N/2), (y - N/2)) * 2 pi / size.
 */
export declare function oceanSpectrum(options?: SpectrumOptions): {
    h0: Float32Array;
    waves: Float32Array;
    cascades: number;
};
/** The 8 fields the GPU transforms, per texel, after the row and column passes (see `oceanFieldsCpu`). */
export interface OceanFields {
    /** (lambda Dx, Dy, lambda Dz) per texel, 3 floats each */
    displacement: Float64Array;
    /** (dDy/dx, dDy/dz, lambda dDx/dx, lambda dDz/dz) per texel, 4 floats each */
    derivatives: Float64Array;
}
/** Bit reversal of an 8-bit index (`fftBitReverse8`). */
export declare function bitReverse8(v: number): number;
/**
 * In-place radix-2 inverse DFT without normalisation, X[n] = sum_k x[k] e^{+2 pi i k n / N}: the transform
 * the GPU kernels run (bit-reversed load, then 8 butterfly stages with twiddle e^{i pi pos / half}).
 */
export declare function ifftInPlace(re: Float64Array, im: Float64Array): void;
/**
 * CPU reference for one cascade of the GPU FFT at `time` (double precision): the row kernel's time evolution
 * and packing (L422-451), a 2D inverse transform, and the column kernel's sign fix and outputs (L494-525).
 * Used by the browser test that checks the TSL compute FFT.
 */
export declare function oceanFieldsCpu(h0: Float32Array, waves: Float32Array, cascade: number, time: number, choppiness?: number): OceanFields;
/** One wave for tests: texel offset (dx, dy) from the centre of a cascade's spectrum, height amplitude and phase. */
export interface SingleWave {
    cascade: number;
    dx: number;
    dy: number;
    amplitude: number;
    phase: number;
}
/**
 * A spectrum holding only the given waves, packed like `oceanSpectrum` (h0 at +k, its conjugate partner at -k),
 * so each wave comes out of the FFT as amplitude x cos(k . x + omega t + phase).
 */
export declare function singleWaveSpectrum(list: readonly SingleWave[], sizes?: readonly number[]): {
    h0: Float32Array;
    waves: Float32Array;
    cascades: number;
};
