/*
 * Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC,
 * MIT (see ./LICENSE-tidewater.md). Source: src/ocean/ShoreWaves.js (ShoreParams L180-190, constants L37-41, the
 * WGSL functions L276-625).
 *
 * Depth-aware shoreline waves: the phase comes from the shore field's arrival time T, every wave has its own
 * height (sets, along-shore peaks, a bar with rip channels), shoals by Green's law, plunges where its crest's
 * depth reaches the break depth and runs up the sand as a thin swash sheet.
 *
 * One source for the CPU mirror and the shaders: every function here is written once against `ShoreMath`, a tiny
 * set of operations that `cpuShore` runs on plain numbers (tests, the surf sound later) and `tslShore` turns into
 * TSL nodes. Arithmetic uses the node-style methods (`a.add(b)`, `a.lessThan(b)`), so the formulas read like the
 * WGSL they come from.
 *
 * Where we differ: `shoreHash1` is a sin-free hash (Hoskins' hash11) instead of `fract(sin(x) * 43758)`: the wave
 * index reaches hundreds, and float32 sin of such numbers differs between GPUs and from the CPU, so the CPU mirror
 * would not know each wave's height.
 */

import { TSL } from 'three/webgpu';
import { pick } from './water-shading.js';

/* eslint-disable @typescript-eslint/no-explicit-any -- the shared formulas run on numbers and on TSL nodes */
type V = any;

/** Tidewater's ShoreParams (L180-190). */
export const SHORE_DEFAULTS = {
  period: 9,
  /** offshore amplitude (H / 2), m */
  amplitude: 0.34,
  variation: 0.55,
  gamma: 0.78,
  breakSpan: 0.13,
  curl: 1,
  runup: 1,
  turbidity: 0.16,
} as const;

/** The run-up is turned into a horizontal excursion with this slope (L38). */
export const BEACH_SLOPE = 0.066;
/** Fractions of the period: uprush, backwash (L39). */
export const SWASH_UP = 0.4;
export const SWASH_DOWN = 0.55;
/** The mesh sheet reaches this far (m) past the leading edge; the pixel front decides where it ends (L40). */
export const SWASH_OVERSHOOT = 1.2;
/** Shore waves only where the sea is shallower than this (WaterSurface.js WATER_SHORE_DEEP). */
export const WATER_SHORE_DEEP = 26;
export const GRAVITY = 9.81;
const TAU = Math.PI * 2;

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

const val = (x: Num | number) => (typeof x === 'number' ? x : x.v);

/** A number with the node-style arithmetic of TSL, for the CPU mirror. Booleans are 1 / 0. */
export class Num {
  constructor(readonly v: number) {}
  add(b: Num | number) {
    return new Num(this.v + val(b));
  }
  sub(b: Num | number) {
    return new Num(this.v - val(b));
  }
  mul(b: Num | number) {
    return new Num(this.v * val(b));
  }
  div(b: Num | number) {
    return new Num(this.v / val(b));
  }
  negate() {
    return new Num(-this.v);
  }
  lessThan(b: Num | number) {
    return new Num(this.v < val(b) ? 1 : 0);
  }
  greaterThan(b: Num | number) {
    return new Num(this.v > val(b) ? 1 : 0);
  }
  and(b: Num) {
    return new Num(this.v !== 0 && b.v !== 0 ? 1 : 0);
  }
  or(b: Num) {
    return new Num(this.v !== 0 || b.v !== 0 ? 1 : 0);
  }
  not() {
    return new Num(this.v !== 0 ? 0 : 1);
  }
}

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
const N = (x: number) => new Num(x);

/** The shared formulas on plain numbers. */
export const cpuShore: ShoreMath = {
  c: N,
  sin: (a) => N(Math.sin(a.v)),
  cos: (a) => N(Math.cos(a.v)),
  abs: (a) => N(Math.abs(a.v)),
  floor: (a) => N(Math.floor(a.v)),
  fract: (a) => N(a.v - Math.floor(a.v)),
  sqrt: (a) => N(Math.sqrt(a.v)),
  exp: (a) => N(Math.exp(a.v)),
  sign: (a) => N(Math.sign(a.v)),
  pow: (a, b) => N(Math.pow(a.v, val(b))),
  min: (a, b) => N(Math.min(a.v, val(b))),
  max: (a, b) => N(Math.max(a.v, val(b))),
  clamp: (a, lo, hi) => N(Math.min(hi, Math.max(lo, a.v))),
  sat: (a) => N(Math.min(1, Math.max(0, a.v))),
  mix: (a, b, t) => N(a.v + (val(b) - a.v) * val(t)),
  smoothstep: (e0, e1, x) => N(smooth(val(e0), val(e1), x.v)),
  select: (cond, a, b) => N(cond.v !== 0 ? val(a) : val(b)),
};

const TN = TSL as any;
const toNode = (x: V | number) => (typeof x === 'number' ? TN.float(x) : x);

/** The shared formulas as TSL nodes (`select` blends both sides, see `pick`). */
export const tslShore: ShoreMath = {
  c: (x) => TN.float(x),
  sin: (a) => TN.sin(a),
  cos: (a) => TN.cos(a),
  abs: (a) => TN.abs(a),
  floor: (a) => TN.floor(a),
  fract: (a) => TN.fract(a),
  sqrt: (a) => TN.sqrt(a),
  exp: (a) => TN.exp(a),
  sign: (a) => TN.sign(a),
  pow: (a, b) => TN.pow(a, b),
  min: (a, b) => TN.min(a, b),
  max: (a, b) => TN.max(a, b),
  clamp: (a, lo, hi) => TN.clamp(a, lo, hi),
  sat: (a) => TN.clamp(a, 0, 1),
  mix: (a, b, t) => TN.mix(a, b, t),
  smoothstep: (e0, e1, x) => TN.smoothstep(e0, e1, x),
  select: (cond, a, b) => pick(cond, toNode(a), toNode(b)),
};

/** `shoreHash1`: a hash of the wave index in 0..1 (sin-free, see the header). */
export function shoreHash1(M: ShoreMath, x: V): V {
  let p = M.fract(x.mul(0.1031));
  p = p.mul(p.add(33.33));
  p = p.mul(p.add(p));
  return M.fract(p);
}

/**
 * `shoreBar`: a bar along the beach with rip channels every ~100 m. k is 1 over the bar, less in a channel; rip
 * (0..1) is the channel mask.
 */
export function shoreBar(M: ShoreMath, along: V): { k: V; rip: V } {
  const w = M.sin(along.mul(0.021).add(1.9)).mul(1.4).add(M.sin(along.mul(0.009).add(0.3)).mul(0.9));
  const r = M.sin(along.mul(0.059).add(w));
  const width = M.sin(along.mul(0.017).add(4.1)).mul(0.08).add(0.8);
  const rip = M.smoothstep(width, 0.985, r);
  const bar = M.sin(along.mul(0.031).add(7.3)).mul(0.6).add(M.sin(along.mul(0.083).add(1.1)).mul(0.4)).mul(0.14).add(0.9);
  return { k: bar.mul(rip.mul(-0.58).add(1)), rip };
}

/** `shoreWobble`: along-shore phase wobble in periods (crests bend over the uneven bottom). */
export function shoreWobble(M: ShoreMath, along: V): V {
  return M.sin(along.mul(0.029).add(0.7))
    .mul(0.07)
    .add(M.sin(along.mul(0.083).add(2.1)).mul(0.035))
    .add(M.sin(along.mul(0.19).add(0.4)).mul(0.022))
    .add(M.sin(along.mul(0.37).add(2.6)).mul(0.011))
    .add(shoreBar(M, along).rip.mul(0.045));
}

/** The phase s of `shorePhaseAt` (L517): `(time - T) / period + wobble(along)`; wave m = round(s). */
export function shorePhase(M: ShoreMath, time: V, T: V, along: V, period: V): V {
  return time.sub(T).div(period).add(shoreWobble(M, along));
}

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
export function cpuShoreParams(over: Partial<Record<keyof ShoreParams, number>> = {}): ShoreParams {
  const v = { ...SHORE_DEFAULTS, enabled: 1, ...over };
  return {
    period: N(v.period),
    amplitude: N(v.amplitude),
    variation: N(v.variation),
    gamma: N(v.gamma),
    breakSpan: N(v.breakSpan),
    curl: N(v.curl),
    runup: N(v.runup),
    enabled: N(v.enabled),
  };
}

/**
 * `shoreWaveAmp` (L304-318): each wave's own height. Sets of ~7 with the biggest in the middle, per-wave
 * randomness, along-shore peaks 40-50 m wide (so waves peel instead of closing out), the bar; never below 2 cm.
 */
export function shoreWaveAmp(M: ShoreMath, m: V, along: V, P: ShoreParams): V {
  const waveSet = M.abs(M.sin(m.mul(Math.PI / 7))).mul(0.6).add(0.55);
  const rnd = shoreHash1(M, m).sub(0.5).mul(2);
  const warp = M.sin(along.mul(0.016).add(m.mul(0.9))).mul(1.6);
  const a1 = M.sin(along.mul(0.062).add(m.mul(1.7)).add(warp));
  const a2 = M.sin(along.mul(0.13).add(m.mul(4.1)).add(1.3).sub(warp.mul(0.7)));
  const a3 = M.sin(along.mul(0.29).add(m.mul(2.3)).add(warp.mul(0.5)))
    .mul(0.6)
    .add(M.sin(along.mul(0.47).add(m.mul(5.9)).add(0.8)).mul(0.4));
  const alongV = a1.mul(0.6).add(a2.mul(0.4)).add(a3.mul(0.28));
  const shape = rnd.mul(P.variation).mul(0.5).add(alongV.mul(P.variation).mul(0.7)).add(1);
  return M.max(P.amplitude.mul(waveSet).mul(shape).mul(shoreBar(M, along).k), 0.02);
}

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

export function shoreBreakParams(M: ShoreMath, A: V, d: V, P: ShoreParams): ShoreBreak {
  // break depth for this wave (Green's law shoaling, H = gamma d)
  const db = M.pow(A.mul(3.556).div(P.gamma), 0.8);
  const b = db.sub(d).div(db.mul(P.breakSpan)); // < 0 shoaling, 0..1 plunging, > 1 bore
  const shoal = M.pow(M.c(10).div(M.clamp(d, 0.35, 10)), 0.25);
  const Ash = A.mul(shoal);
  const p = M.mix(M.c(1), 3, M.smoothstep(-2.5, 0, b));
  const meanP = M.c(1).div(M.sqrt(p.add(0.25).mul(Math.PI)));
  const crestPeak = M.smoothstep(-1, 0.3, b).mul(0.22).add(1);
  const yc = Ash.mul(2).mul(M.c(1).sub(meanP)).mul(crestPeak);
  const yt = Ash.mul(-2).mul(meanP).mul(crestPeak);
  const H = yc.sub(yt);
  const wBore = M.smoothstep(0.85, 1.35, b);
  const Xi = H.mul(0.8);
  const dPos = M.max(d, 0);
  const Hb = M.min(H.mul(0.6), dPos.mul(0.75)).mul(M.smoothstep(0, 0.3, d).mul(0.7).add(0.3));
  const ycB = M.mix(yc, yt.mul(0.6).add(Hb), wBore);
  const ytB = M.mix(yt, yt.mul(0.6), wBore);
  const Xc = M.mix(M.c(0), Xi.sub(Hb.mul(0.55)), wBore).mul(M.smoothstep(0.03, 0.3, Hb));
  const Wt = M.mix(H.mul(M.mix(M.c(0.25), 0.55, M.smoothstep(0.1, 0.9, b))), Hb.mul(0.6).add(0.08), wBore);
  return { db, b, Ash, p, meanP, crestPeak, yc, yt, H, wBore, Xi, Hb, ycB, ytB, Xc, Wt };
}

/** `shoreFaceFill` (L357-362): whitewater over the face after the plunge, s = 0 at the crest .. 1 at the foot. */
export function shoreFaceFill(M: ShoreMath, b: V, s: V): V {
  const k = M.c(1).sub(s).mul(0.45);
  return M.smoothstep(k.add(0.9), k.add(1.08), b);
}

/** `shoreWhitewater` (L364-376): whitewater at xi (m, shoreward of the crest's rest position). */
export function shoreWhitewater(M: ShoreMath, xi: V, lam: V, B: ShoreBreak): V {
  const landed = M.smoothstep(0.86, 0.99, B.b);
  const spread = M.sat(B.b.sub(0.9).div(0.45));
  const reach = B.Xi.mul(0.25).add(spread.mul(B.Xi.mul(0.9).add(1)));
  const impact = landed
    .mul(M.smoothstep(reach, reach.mul(0.6), M.abs(xi.sub(B.Xi))))
    .mul(M.c(1).sub(M.smoothstep(1.4, 1.9, B.b)));
  const toe = B.Xc.add(B.Wt);
  const faceFill = shoreFaceFill(M, B.b, M.sat(xi.sub(B.Xc).div(M.max(B.Wt, 0.05))));
  // (exponents clamped so the unused side of a blend stays finite on the GPU)
  const ahead = M.exp(M.min(xi.sub(toe).mul(-3), 30)).mul(B.wBore);
  const behind = M.exp(M.min(B.Xc.sub(xi).div(lam).mul(-16), 30)).mul(B.wBore);
  const roller = M.select(xi.greaterThan(toe), ahead, M.select(xi.lessThan(B.Xc), behind, M.max(faceFill, B.wBore)));
  return M.sat(M.max(impact, roller));
}

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
export function shoreProfile(M: ShoreMath, u: V, lam: V, B: ShoreBreak, P: ShoreParams, withFoam: boolean): ShoreProfileOut {
  // shoaling: peaked (cnoidal-like) crest, the front compressed by a phase skew
  const skew = M.smoothstep(-3, 0, B.b).mul(0.55);
  const phi = u.sub(skew.mul(M.c(1).sub(M.cos(u.mul(TAU)))).div(TAU));
  const c = M.max(M.cos(phi.mul(TAU)).add(1).mul(0.5), 0);
  const yPre = B.Ash.mul(2).mul(M.pow(c, B.p).sub(B.meanP)).mul(B.crestPeak);
  const Q = M.smoothstep(-3, 0, B.b).mul(0.25).add(0.1);
  const xPre = M.sin(u.mul(TAU)).mul(B.Ash).mul(Q);
  // plunging / bore: the upper uf of the front is an elliptic arc crest -> trough, the rest trough; the back decays
  const uf = 0.09;
  const inFace = u.greaterThan(-uf);
  const th = M.clamp(u.negate().div(uf), 0, 1).mul(Math.PI / 2);
  const fx = M.mix(M.c(1).sub(M.cos(th)), M.sin(th), B.wBore);
  const fy = M.mix(M.c(1).sub(M.sin(th)), M.cos(th), B.wBore);
  const sTr = M.clamp(u.negate().sub(uf).div(0.5 - uf), 0, 1);
  const ul = u.mul(lam);
  const xFront = M.select(inFace, B.Xc.add(B.Wt.mul(fx)), M.mix(B.Xc.add(B.Wt), lam.mul(0.5), sTr)).add(ul);
  const yFront = M.select(inFace, B.ytB.add(B.ycB.sub(B.ytB).mul(fy)), B.ytB);
  const cb = M.pow(M.max(M.cos(u.mul(TAU * 0.85)).add(1).mul(0.5), 0), B.p);
  const yBack = B.ytB.add(B.ycB.sub(B.ytB).mul(M.mix(cb, M.exp(M.min(u.mul(-7), 30)), B.wBore)));
  const xBack = B.Xc.mul(M.exp(M.min(u.mul(-6), 30)))
    .mul(M.smoothstep(0.5, 0.35, u))
    .add(xPre.mul(M.c(1).sub(B.wBore)));
  const front = u.lessThan(0);
  const wC = M.smoothstep(-0.35, 0.25, B.b).mul(P.curl);
  const out: ShoreProfileOut = {
    x: M.mix(xPre, M.select(front, xFront, xBack), wC),
    y: M.mix(yPre, M.select(front, yFront, yBack), wC),
    b: B.b,
    foam: M.c(0),
    face: M.c(0),
    roller: M.c(0),
  };
  if (withFoam) {
    out.foam = shoreWhitewater(M, out.x.sub(u.mul(lam)), lam, B);
    const onFace = front.and(inFace);
    const faceFill = shoreFaceFill(M, B.b, fx);
    out.face = M.select(onFace, 1, 0).mul(M.smoothstep(-0.4, 0, B.b)).mul(M.c(1).sub(faceFill));
    out.roller = M.select(front, M.select(inFace, 1, 0), M.exp(M.min(u.mul(-25), 30)))
      .mul(B.wBore)
      .mul(B.Hb)
      .mul(wC);
  }
  return out;
}

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
export function shoreSwashRunup(
  M: ShoreMath,
  time: V,
  Ts: V,
  exposure: V,
  along: V,
  groundH: V,
  level: V,
  P: ShoreParams,
): ShoreRunup {
  const inland = M.max(groundH.sub(level), 0).div(BEACH_SLOPE);
  const ss = time.sub(Ts).div(P.period).add(shoreWobble(M, along));
  const ms = M.floor(ss);
  const tau = ss.sub(ms); // 0..1 since that wave's bore reached the shoreline
  const Am = shoreWaveAmp(M, ms, along, P);
  // vertical run-up ~ H on a gentle beach, as a horizontal excursion
  const RhMax = Am.mul(2.1).mul(P.runup).mul(M.sat(exposure.mul(1.4))).div(BEACH_SLOPE);
  // decelerating uprush, then a backwash that starts slowly and accelerates as the sheet drains
  const su = M.sat(tau.div(SWASH_UP));
  const sb = M.sat(tau.sub(SWASH_UP).div(SWASH_DOWN));
  const isUp = tau.lessThan(SWASH_UP);
  const Rh = M.select(isUp, M.c(1).sub(M.pow(M.c(1).sub(su), 1.5)), M.c(1).sub(M.pow(sb, 1.6)))
    .mul(RhMax)
    .sub(0.3);
  // a lobed front, different for every wave along the beach
  const lobes = M.sin(along.mul(0.61).add(ms.mul(2.3)))
    .mul(0.5)
    .add(M.sin(along.mul(1.73).add(ms.mul(5.1))).mul(0.3))
    .add(M.sin(along.mul(4.3).add(ms.mul(1.7))).mul(0.2));
  // a film always covers the first decimetres, so the sea never meets the sand along mesh triangles
  const Rt = M.max(Rh.add(lobes.mul(M.max(Rh, 0).mul(0.07).add(0.35))), 0.35).mul(P.enabled);
  return { tau, Rt, inland, RhMax, su, sb, isUp, ms };
}

/**
 * The thin swash sheet's surface over the sand (from `shoreEvaluate`, L133-147): `front` = Rt - inland (> 0 under
 * the sheet); the mesh sheet overshoots the front by SWASH_OVERSHOOT and the pixel shader cuts it on the front.
 */
export function shoreSwashThickness(M: ShoreMath, front: V): V {
  const fm = front.add(SWASH_OVERSHOOT);
  return M.clamp(M.min(fm.mul(0.3), M.max(fm.sub(0.1), 0).mul(BEACH_SLOPE * 0.22).add(0.03)), -0.1, 0.12);
}

export { TAU };

/**
 * Reads the shore field (RGBA float: T, dir x exposure, Ts) at world xz with a bilinear blend of 4 exact loads
 * (`terrainShoreSample`, TerrainGPU.js L268-282): float32 textures cannot be filtered on every GPU. `field` is a
 * `texture()` node (swap its `.value` for a new field), `res` its cells per side (a uniform).
 */
export function shoreFieldSample(field: V, xz: V, origin: V, size: V, res: V): V {
  const f = xz.sub(origin).div(size).mul(res).sub(0.5);
  const top = res.sub(1.001);
  const fc = TN.clamp(f, TN.vec2(0, 0), TN.vec2(top, top));
  const i = TN.floor(fc);
  const t = TN.fract(fc);
  const ii = TN.ivec2(i);
  const last = TN.int(res).sub(1);
  const mx = TN.ivec2(last, last);
  const load = (o: V) => field.load(TN.min(ii.add(o), mx)).level(0);
  const a = load(TN.ivec2(0, 0));
  const b = load(TN.ivec2(1, 0));
  const c = load(TN.ivec2(0, 1));
  const d = load(TN.ivec2(1, 1));
  return TN.mix(TN.mix(a, b, t.x), TN.mix(c, d, t.x), t.y);
}
