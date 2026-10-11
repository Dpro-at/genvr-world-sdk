/*
 * Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC,
 * MIT (see ./LICENSE-tidewater.md). Source: src/ocean/SeaDetail.js (seaDetailSample, makeNoiseTexture, update),
 * src/util/Noise.js (mulberry32), the wind of src/engine/render/Frame.js L51-55.
 *
 * Large-scale variation of the sea surface in world space (never repeats with the FFT tiles), Ultra only:
 *  - gusts ("cat's paws"): patches of rougher water drifting downwind. Rough water reflects less of the bright
 *    horizon sky, so from a low viewpoint gusts read as irregular dark patches;
 *  - slicks: long calm bands along the wind where capillary waves are damped; mirror-like, in light wind;
 *  - windrows: thin lines along the wind in fresh wind, mostly as smooth lanes with a trace of foam.
 * `rough` scales the short waves (the two finest cascades, the near ripples and the unresolved roughness); `gust`
 * and `streak` add whitecaps (water-surface.ts, water-shading.ts).
 *
 * Where we differ: the drift offset is a function of the sea clock (room time), not summed per frame, so every
 * device shows the same gusts (it jumps once an hour with the clock's wrap, like the FFT); the combining formulas
 * are written once against `ShoreMath` so the CPU tests run the shader's arithmetic; the noise is a half-float
 * DataTexture made on the CPU once per page.
 */
import { DataTexture, DataUtils, HalfFloatType, LinearFilter, RepeatWrapping, RGBAFormat, TSL, type Texture, Vector2 } from 'three/webgpu';
import type { ShoreMath } from './shore-waves.js';

/* eslint-disable @typescript-eslint/no-explicit-any -- the shared formulas run on numbers and on TSL nodes */
type V = any;

/** Tidewater's frame wind (Frame.js L51-55): 7 m/s towards (0.35, 0.94). */
export const SEA_DETAIL_WIND = (() => {
  const l = Math.hypot(0.35, 0.94);
  return { speed: 7, dir: [0.35 / l, 0.94 / l] as [number, number] };
})();

/** SeaDetailParams defaults. */
export const SEA_DETAIL_AMOUNTS = { gust: 1, slick: 1, streak: 0.3 } as const;

/** The noise texture's side. */
export const SEA_DETAIL_SIZE = 256;

/** The drift of the patterns at a sea-clock time t (s): downwind at 0.7 x the wind speed. */
export function seaDetailOffset(t: number): [number, number] {
  const s = SEA_DETAIL_WIND.speed * 0.7 * t;
  return [SEA_DETAIL_WIND.dir[0] * s, SEA_DETAIL_WIND.dir[1] * s];
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Tileable smooth fbm in 4 channels (`makeNoiseTexture`), each normalised to 0..1, RGBA row-major. */
export function seaDetailNoise(size = SEA_DETAIL_SIZE): Float32Array {
  const out = new Float32Array(size * size * 4);
  const channels = [
    { seed: 11, freq: 4, oct: 4 },
    { seed: 23, freq: 5, oct: 4 },
    { seed: 37, freq: 4, oct: 3 },
    { seed: 53, freq: 6, oct: 3 },
  ];
  const vals = new Float32Array(size * size);
  for (let c = 0; c < 4; c += 1) {
    const { seed, freq, oct } = channels[c]!;
    const rand = mulberry32(seed);
    // gradient tables per octave (periodic lattice)
    const tables: Array<{ n: number; g: Float32Array }> = [];
    for (let o = 0; o < oct; o += 1) {
      const n = freq << o;
      const g = new Float32Array(n * n * 2);
      for (let i = 0; i < n * n; i += 1) {
        const a = rand() * Math.PI * 2;
        g[i * 2] = Math.cos(a);
        g[i * 2 + 1] = Math.sin(a);
      }
      tables.push({ n, g });
    }
    let mn = Infinity;
    let mx = -Infinity;
    for (let y = 0; y < size; y += 1)
      for (let x = 0; x < size; x += 1) {
        let v = 0;
        let amp = 1;
        let norm = 0;
        for (const { n, g } of tables) {
          const fx = (x / size) * n;
          const fy = (y / size) * n;
          const xi = Math.floor(fx);
          const yi = Math.floor(fy);
          const xf = fx - xi;
          const yf = fy - yi;
          const grad = (ix: number, iy: number, dx: number, dy: number) => {
            const k = (((iy % n) + n) % n) * n + (((ix % n) + n) % n);
            return g[k * 2]! * dx + g[k * 2 + 1]! * dy;
          };
          const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10);
          const w = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
          const a0 = grad(xi, yi, xf, yf);
          const a1 = grad(xi + 1, yi, xf - 1, yf);
          const b0 = grad(xi, yi + 1, xf, yf - 1);
          const b1 = grad(xi + 1, yi + 1, xf - 1, yf - 1);
          const lo = a0 + (a1 - a0) * u;
          v += (lo + (b0 + (b1 - b0) * u - lo) * w) * amp;
          norm += amp;
          amp *= 0.5;
        }
        v /= norm;
        vals[y * size + x] = v;
        mn = Math.min(mn, v);
        mx = Math.max(mx, v);
      }
    for (let i = 0; i < size * size; i += 1) out[i * 4 + c] = (vals[i]! - mn) / (mx - mn);
  }
  return out;
}

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
export function seaDetailCombine(
  M: ShoreMath,
  r: SeaDetailLoads,
  windSpeed: V,
  amounts: { gust: V; slick: V; streak: V } = { gust: M.c(SEA_DETAIL_AMOUNTS.gust), slick: M.c(SEA_DETAIL_AMOUNTS.slick), streak: M.c(SEA_DETAIL_AMOUNTS.streak) },
): { rough: V; gust: V; slick: V; streak: V } {
  const gustRaw = r.g1.mul(0.62).add(r.g2.mul(0.38));
  const gust = M.sat(gustRaw.sub(0.5).mul(2.4).mul(amounts.gust).add(0.5));
  // slicks: long bands, strongest in light wind, torn apart by gusts
  const calmWind = M.smoothstep(13, 4, windSpeed);
  const slick = M.smoothstep(0.64, 0.76, r.sl).mul(M.c(1).sub(gust.mul(0.8))).mul(calmWind).mul(amounts.slick);
  // windrows: thin foam lines ~10 m apart that come and go along their length
  const freshWind = M.smoothstep(6, 12, windSpeed);
  const streak = M.smoothstep(0.68, 0.82, r.st).mul(M.smoothstep(0.4, 0.62, r.breakUp)).mul(freshWind).mul(amounts.streak);
  // windrows show mostly as smooth lanes (surfactant collects in the convergence lines), with a trace of foam
  const rough = M.mix(M.c(0.5), 1.5, gust)
    .mul(M.c(1).sub(slick.mul(0.8)))
    .mul(M.c(1).sub(streak.div(M.max(amounts.streak, 1e-3)).mul(0.45)));
  return { rough, gust, slick, streak };
}

let sharedNoise: Float32Array | null = null;

/** `SeaDetail`: the noise texture, the drift and `sample(xz)` for the sea's shader. */
export class SeaDetail {
  readonly texture: Texture;
  /** accumulated wind drift (m) and the sea clock (s) */
  readonly offset = TSL.uniform(new Vector2()) as V;
  readonly time = TSL.uniform(0) as V;

  constructor() {
    sharedNoise ??= seaDetailNoise(SEA_DETAIL_SIZE);
    const half = new Uint16Array(sharedNoise.length);
    for (let i = 0; i < half.length; i += 1) half[i] = DataUtils.toHalfFloat(sharedNoise[i]!);
    const tex = new DataTexture(half, SEA_DETAIL_SIZE, SEA_DETAIL_SIZE, RGBAFormat, HalfFloatType);
    tex.wrapS = RepeatWrapping;
    tex.wrapT = RepeatWrapping;
    tex.magFilter = LinearFilter;
    tex.minFilter = LinearFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    this.texture = tex;
  }

  /** The patterns at sea-clock time t (room time, so every device has the same gusts). */
  setTime(t: number): void {
    const [x, z] = seaDetailOffset(t);
    this.offset.value.set(x, z);
    this.time.value = t;
  }

  /** `seaDetailSample(xz)` as TSL, with the shared combining formulas. */
  sample(M: ShoreMath, xz: V): { rough: V; gust: V; slick: V; streak: V } {
    const T = TSL as any;
    const load = (uv: V) => T.texture(this.texture, uv).level(0);
    const p = xz.sub(this.offset);
    const g1 = load(p.div(620)).x;
    const g2 = load(p.div(230).add(T.vec2(this.time.mul(0.0009), 0.37))).y;
    // wind-aligned frame, lightly domain-warped so bands meander
    const w = T.vec2(SEA_DETAIL_WIND.dir[0], SEA_DETAIL_WIND.dir[1]);
    const along = T.dot(xz, w);
    const across = T.dot(xz, T.vec2(-SEA_DETAIL_WIND.dir[1], SEA_DETAIL_WIND.dir[0])).add(g2.sub(0.5).mul(26));
    const sl = load(T.vec2(along.div(1100), across.div(70))).z;
    const st = load(T.vec2(along.div(380), across.div(11)).add(T.vec2(0.13, 0.71))).w;
    const breakUp = load(T.vec2(along.div(140), across.div(40)).add(T.vec2(0.51, 0.29))).x;
    return seaDetailCombine(M, { g1, g2, sl, st, breakUp }, M.c(SEA_DETAIL_WIND.speed));
  }

  dispose(): void {
    this.texture.dispose();
  }
}
