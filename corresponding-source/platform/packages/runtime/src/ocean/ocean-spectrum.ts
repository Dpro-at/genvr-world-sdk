/*
 * Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC,
 * MIT (see ./LICENSE-tidewater.md). Source: src/ocean/OceanFFT.js (WaveSystem, updateSpectrumUniforms, the WGSL
 * spectrum helpers, the init and conjugate kernels).
 *
 * Pure: the ocean spectrum on the CPU. Tidewater builds h0 in a compute kernel; we build it here once (it only
 * changes with the sea settings) and upload it, which keeps the numbers testable in node and identical on every
 * device. The per-frame part (time evolution and the two FFT passes) runs on the GPU in `ocean-fft.ts`.
 */

/** Points per FFT side (`OceanFFT.js` L26). */
export const FFT_SIZE = 256;
/** Tile sizes of the four cascades in meters; non-integer ratios avoid visible repetition (L32). */
export const DEFAULT_CASCADE_SIZES = [733, 157, 33.3, 7.1] as const;
/** `Frame.js` L108. */
export const GRAVITY = 9.81;
/** Water depth the spectrum assumes (m, L88). */
export const OCEAN_DEPTH = 500;
/** Fixed seed: every machine shows the same sea (L111). */
export const OCEAN_SEED = 1337;

const TWO_PI = Math.PI * 2;

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

export function waveSystem(o: Partial<WaveSystem> = {}): WaveSystem {
  return {
    scale: o.scale ?? 1,
    windSpeed: o.windSpeed ?? 8,
    windDirection: o.windDirection ?? 20,
    fetch: o.fetch ?? 200,
    spreadBlend: o.spreadBlend ?? 0.9,
    swell: o.swell ?? 0.2,
    peakEnhancement: o.peakEnhancement ?? 3.3,
    shortWavesFade: o.shortWavesFade ?? 0.01,
  };
}

/** The local wind sea (L90). */
export const LOCAL_SEA = waveSystem({ windSpeed: 7, windDirection: 25, fetch: 120, spreadBlend: 0.85, swell: 0.05 });
/** The long swell (L91). */
export const SWELL = waveSystem({
  scale: 0.48,
  windSpeed: 6,
  windDirection: 5,
  fetch: 1200,
  spreadBlend: 1,
  swell: 0.9,
  shortWavesFade: 0.1,
});

/** The packed per-system numbers the spectrum reads (`sysA`, `sysB`, L215-225). */
export interface SystemParams {
  /** scale, angle (rad), spreadBlend, swell */
  a: [number, number, number, number];
  /** alpha, peakOmega, gamma, shortWavesFade */
  b: [number, number, number, number];
}

export function systemParams(s: WaveSystem): SystemParams {
  const fetchM = Math.max(1, s.fetch) * 1000;
  const U = Math.max(0.1, s.windSpeed);
  const alpha = 0.076 * Math.pow((GRAVITY * fetchM) / (U * U), -0.22);
  const peakOmega = 22 * Math.pow((U * fetchM) / (GRAVITY * GRAVITY), -0.33);
  return {
    a: [s.scale, (s.windDirection * Math.PI) / 180, s.spreadBlend, s.swell],
    b: [alpha, peakOmega, s.peakEnhancement, s.shortWavesFade],
  };
}

/** Each cascade keeps only the wavenumbers in its own band (L202-209). */
export function bandCuts(sizes: readonly number[]): Array<[number, number]> {
  return sizes.map((size, i) => [
    i === 0 ? 0.0001 : (TWO_PI / size) * 6,
    i === sizes.length - 1 ? 9999 : (TWO_PI / sizes[i + 1]!) * 6,
  ]);
}

export function dispersion(k: number, depth = OCEAN_DEPTH): number {
  return Math.sqrt(k * GRAVITY * Math.tanh(Math.min(k * depth, 20)));
}

export function dispersionDerivative(k: number, depth = OCEAN_DEPTH): number {
  const kd = Math.min(k * depth, 20);
  const th = Math.tanh(kd);
  const ch = Math.cosh(kd);
  return ((GRAVITY * ((depth * k) / (ch * ch) + th)) / dispersion(k, depth)) * 0.5;
}

/** Shallow-water (TMA) correction. */
export function tmaCorrection(omega: number, depth = OCEAN_DEPTH): number {
  const omegaH = omega * Math.sqrt(depth / GRAVITY);
  if (omegaH <= 1) return omegaH * omegaH * 0.5;
  if (omegaH < 2) return 1 - Math.pow(2 - omegaH, 2) * 0.5;
  return 1;
}

export function jonswap(omega: number, p: SystemParams, depth = OCEAN_DEPTH): number {
  const [alpha, peakOmega, gamma] = p.b;
  const sigma = omega <= peakOmega ? 0.07 : 0.09;
  const d = omega - peakOmega;
  const r = Math.exp((-d * d) / (sigma * sigma * peakOmega * peakOmega * 2));
  const inv = 1 / omega;
  const po = peakOmega * inv;
  return (
    p.a[0] *
    tmaCorrection(omega, depth) *
    alpha *
    (GRAVITY * GRAVITY) *
    Math.pow(inv, 5) *
    Math.exp(Math.pow(po, 4) * -1.25) *
    Math.pow(Math.abs(gamma), r)
  );
}

export function normalisationFactor(s: number): number {
  const s2 = s * s;
  const s3 = s2 * s;
  const s4 = s3 * s;
  if (s < 5) return s4 * -0.000564 + s3 * 0.00776 - s2 * 0.044 + s * 0.192 + 0.163;
  return s4 * -4.8e-8 + s3 * 1.07e-5 - s2 * 9.53e-4 + s * 5.9e-2 + 3.93e-1;
}

export function directionSpectrum(theta: number, omega: number, p: SystemParams): number {
  const peakOmega = p.b[1];
  const ratio = omega / peakOmega;
  const spreadPower =
    omega > peakOmega ? Math.pow(Math.abs(ratio), -2.5) * 9.77 : Math.pow(Math.abs(ratio), 5) * 6.97;
  const s = spreadPower + Math.tanh(Math.min(ratio, 20)) * 16 * p.a[3] * p.a[3];
  const dTheta = theta - p.a[1];
  const cos2s = normalisationFactor(s) * Math.pow(Math.abs(Math.cos(dTheta * 0.5)), s * 2);
  const cosT = Math.cos(dTheta);
  const base = cosT * cosT * (2 / Math.PI) * (cosT > 0 ? 1 : 0);
  return base + (cos2s - base) * p.a[2];
}

export function shortWavesFade(k: number, p: SystemParams): number {
  return Math.exp(-p.b[3] * p.b[3] * k * k);
}

/** PCG hash on unsigned 32-bit integers (`fftPcg`). */
export function pcg(v: number): number {
  const state = (Math.imul(v >>> 0, 747796405) + 2891336453) >>> 0;
  const word = Math.imul(((state >>> ((state >>> 28) + 4)) ^ state) >>> 0, 277803737) >>> 0;
  return ((word >>> 22) ^ word) >>> 0;
}

/** A hash to (0, 1), never 0 (`fftToUnit`). */
export function toUnit(h: number): number {
  return (h >>> 8) * (1 / 16777216) + 0.5 / 16777216;
}

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
export function oceanSpectrum(options: SpectrumOptions = {}): { h0: Float32Array; waves: Float32Array; cascades: number } {
  const sizes = options.sizes ?? DEFAULT_CASCADE_SIZES;
  const depth = options.depth ?? OCEAN_DEPTH;
  const seed = options.seed ?? OCEAN_SEED;
  const systems = [systemParams(options.local ?? LOCAL_SEA), systemParams(options.swell ?? SWELL)];
  const cuts = bandCuts(sizes);
  const N = FFT_SIZE;
  const HALF = N / 2;
  const C = sizes.length;
  const raw = new Float64Array(N * N * C * 2);
  const waves = new Float32Array(N * N * C * 4);
  for (let c = 0; c < C; c += 1) {
    const dk = TWO_PI / sizes[c]!;
    const [low, high] = cuts[c]!;
    for (let y = 0; y < N; y += 1)
      for (let x = 0; x < N; x += 1) {
        const idx = c * N * N + y * N + x;
        const kx = (x - HALF) * dk;
        const kz = (y - HALF) * dk;
        const kLen = Math.hypot(kx, kz);
        waves[idx * 4] = kx;
        waves[idx * 4 + 1] = kz;
        if (kLen < low || kLen > high) continue;
        const omega = dispersion(kLen, depth);
        const dOmega = dispersionDerivative(kLen, depth);
        const theta = Math.atan2(kz, kx);
        let S = 0;
        for (const p of systems) S += jonswap(omega, p, depth) * directionSpectrum(theta, omega, p) * shortWavesFade(kLen, p);
        S = Math.max(S, 0);
        // E|h0|^2 = S(k) dk^2 / 2, so var(height) = sum S(k) dk^2 (h has both +k and -k terms)
        const amp = Math.sqrt(((S * Math.abs(dOmega)) / kLen) * dk * dk) * 0.5;
        // Gaussian pair (Box-Muller) from the PCG hash; u32 arithmetic as in the WGSL
        const s = (Math.imul(idx, 4) + Math.imul(seed, 7919)) >>> 0;
        const u1 = toUnit(pcg(s));
        const u2 = toUnit(pcg((s + 1) >>> 0));
        const r = Math.sqrt(Math.log(u1) * -2);
        raw[idx * 2] = r * Math.cos(u2 * TWO_PI) * amp;
        raw[idx * 2 + 1] = r * Math.sin(u2 * TWO_PI) * amp;
        waves[idx * 4 + 2] = 1 / kLen;
        waves[idx * 4 + 3] = omega;
      }
  }
  // conjugate kernel: pair each texel with the one mirrored through the centre (N - x) % N
  const h0 = new Float32Array(N * N * C * 4);
  for (let c = 0; c < C; c += 1)
    for (let y = 0; y < N; y += 1)
      for (let x = 0; x < N; x += 1) {
        const idx = c * N * N + y * N + x;
        const idxm = c * N * N + ((N - y) % N) * N + ((N - x) % N);
        h0[idx * 4] = raw[idx * 2]!;
        h0[idx * 4 + 1] = raw[idx * 2 + 1]!;
        h0[idx * 4 + 2] = raw[idxm * 2]!;
        h0[idx * 4 + 3] = -raw[idxm * 2 + 1]!;
      }
  return { h0, waves, cascades: C };
}

/** The 8 fields the GPU transforms, per texel, after the row and column passes (see `oceanFieldsCpu`). */
export interface OceanFields {
  /** (lambda Dx, Dy, lambda Dz) per texel, 3 floats each */
  displacement: Float64Array;
  /** (dDy/dx, dDy/dz, lambda dDx/dx, lambda dDz/dz) per texel, 4 floats each */
  derivatives: Float64Array;
}

/** Bit reversal of an 8-bit index (`fftBitReverse8`). */
export function bitReverse8(v: number): number {
  let r = v;
  r = ((r & 0x55) << 1) | ((r >> 1) & 0x55);
  r = ((r & 0x33) << 2) | ((r >> 2) & 0x33);
  r = ((r & 0x0f) << 4) | ((r >> 4) & 0x0f);
  return r;
}

/**
 * In-place radix-2 inverse DFT without normalisation, X[n] = sum_k x[k] e^{+2 pi i k n / N}: the transform
 * the GPU kernels run (bit-reversed load, then 8 butterfly stages with twiddle e^{i pi pos / half}).
 */
export function ifftInPlace(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 0; i < n; i += 1) {
    const j = bitReverse8(i) >> (8 - Math.log2(n));
    if (j > i) {
      [re[i], re[j]] = [re[j]!, re[i]!];
      [im[i], im[j]] = [im[j]!, im[i]!];
    }
  }
  for (let half = 1; half < n; half *= 2)
    for (let t = 0; t < n / 2; t += 1) {
      const pos = t & (half - 1);
      const i = ((t >> Math.log2(half)) << (Math.log2(half) + 1)) | pos;
      const j = i + half;
      const ang = (pos * Math.PI) / half;
      const wr = Math.cos(ang);
      const wi = Math.sin(ang);
      const br = re[j]! * wr - im[j]! * wi;
      const bi = re[j]! * wi + im[j]! * wr;
      const ar = re[i]!;
      const ai = im[i]!;
      re[i] = ar + br;
      im[i] = ai + bi;
      re[j] = ar - br;
      im[j] = ai - bi;
    }
}

/**
 * CPU reference for one cascade of the GPU FFT at `time` (double precision): the row kernel's time evolution
 * and packing (L422-451), a 2D inverse transform, and the column kernel's sign fix and outputs (L494-525).
 * Used by the browser test that checks the TSL compute FFT.
 */
export function oceanFieldsCpu(
  h0: Float32Array,
  waves: Float32Array,
  cascade: number,
  time: number,
  choppiness = 0.9,
): OceanFields {
  const N = FFT_SIZE;
  // 8 real fields packed as 4 complex: c0 = Dx + i Dz, c1 = Dy + i dDx/dz, c2 = dDy/dx + i dDy/dz, c3 = dDx/dx + i dDz/dz
  const fields = Array.from({ length: 4 }, () => ({ re: new Float64Array(N * N), im: new Float64Array(N * N) }));
  for (let y = 0; y < N; y += 1)
    for (let x = 0; x < N; x += 1) {
      const idx = cascade * N * N + y * N + x;
      const kx = waves[idx * 4]!;
      const kz = waves[idx * 4 + 1]!;
      const ik = waves[idx * 4 + 2]!;
      const omega = waves[idx * 4 + 3]!;
      const ph = omega * time;
      const cs = Math.cos(ph);
      const sn = Math.sin(ph);
      const [ax, ay, bx, by] = [h0[idx * 4]!, h0[idx * 4 + 1]!, h0[idx * 4 + 2]!, h0[idx * 4 + 3]!];
      const hr = ax * cs - ay * sn + bx * cs + by * sn;
      const hi = ax * sn + ay * cs - bx * sn + by * cs;
      const fx = kx * ik;
      const fz = kz * ik;
      const q = -(kx * kz * ik);
      const a = -(kx * kx * ik);
      const b = -(kz * kz * ik);
      const values: Array<[number, number]> = [
        [-(fx * hi + fz * hr), fx * hr - fz * hi],
        [hr - q * hi, hi + q * hr],
        [-(kx * hi + kz * hr), kx * hr - kz * hi],
        [a * hr - b * hi, a * hi + b * hr],
      ];
      const o = y * N + x;
      values.forEach(([r, i], f) => {
        fields[f]!.re[o] = r;
        fields[f]!.im[o] = i;
      });
    }
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  for (const field of fields) {
    for (let y = 0; y < N; y += 1) {
      re.set(field.re.subarray(y * N, y * N + N));
      im.set(field.im.subarray(y * N, y * N + N));
      ifftInPlace(re, im);
      field.re.set(re, y * N);
      field.im.set(im, y * N);
    }
    for (let x = 0; x < N; x += 1) {
      for (let y = 0; y < N; y += 1) {
        re[y] = field.re[y * N + x]!;
        im[y] = field.im[y * N + x]!;
      }
      ifftInPlace(re, im);
      for (let y = 0; y < N; y += 1) {
        field.re[y * N + x] = re[y]!;
        field.im[y * N + x] = im[y]!;
      }
    }
  }
  const displacement = new Float64Array(N * N * 3);
  const derivatives = new Float64Array(N * N * 4);
  for (let y = 0; y < N; y += 1)
    for (let x = 0; x < N; x += 1) {
      const o = y * N + x;
      const sign = ((x + y) & 1) === 0 ? 1 : -1;
      const [c0, c1, c2, c3] = fields as [
        (typeof fields)[0],
        (typeof fields)[0],
        (typeof fields)[0],
        (typeof fields)[0],
      ];
      displacement[o * 3] = choppiness * c0.re[o]! * sign;
      displacement[o * 3 + 1] = c1.re[o]! * sign;
      displacement[o * 3 + 2] = choppiness * c0.im[o]! * sign;
      derivatives[o * 4] = c2.re[o]! * sign;
      derivatives[o * 4 + 1] = c2.im[o]! * sign;
      derivatives[o * 4 + 2] = choppiness * c3.re[o]! * sign;
      derivatives[o * 4 + 3] = choppiness * c3.im[o]! * sign;
    }
  return { displacement, derivatives };
}

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
export function singleWaveSpectrum(
  list: readonly SingleWave[],
  sizes: readonly number[] = DEFAULT_CASCADE_SIZES,
): { h0: Float32Array; waves: Float32Array; cascades: number } {
  const N = FFT_SIZE;
  const C = sizes.length;
  const h0 = new Float32Array(N * N * C * 4);
  const waves = new Float32Array(N * N * C * 4);
  for (const w of list) {
    const dk = TWO_PI / sizes[w.cascade]!;
    const kx = w.dx * dk;
    const kz = w.dy * dk;
    const k = Math.hypot(kx, kz);
    const omega = dispersion(k);
    const at = (dx: number, dy: number) => w.cascade * N * N + (N / 2 + dy) * N + (N / 2 + dx);
    const plus = at(w.dx, w.dy);
    const minus = at(-w.dx, -w.dy);
    const re = (w.amplitude / 2) * Math.cos(w.phase);
    const im = (w.amplitude / 2) * Math.sin(w.phase);
    h0[plus * 4] = h0[plus * 4]! + re;
    h0[plus * 4 + 1] = h0[plus * 4 + 1]! + im;
    // the -k texel reads conj(h0(k)) in its (z, w)
    h0[minus * 4 + 2] = h0[minus * 4 + 2]! + re;
    h0[minus * 4 + 3] = h0[minus * 4 + 3]! - im;
    waves.set([kx, kz, 1 / k, omega], plus * 4);
    waves.set([-kx, -kz, 1 / k, omega], minus * 4);
  }
  return { h0, waves, cascades: C };
}
