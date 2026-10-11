import { describe, expect, it } from 'vitest';
import {
  BEACH_SLOPE,
  cpuShore as M,
  cpuShoreParams,
  shoreBreakParams,
  shoreHash1,
  shoreProfile,
  shoreSwashRunup,
  shoreSwashThickness,
  shoreWaveAmp,
  SWASH_UP,
} from '../src/ocean/shore-waves.js';

// The shore waves' CPU mirror (Tidewater sea, plan task 5): ShoreWaves.js L276-625.
const P = cpuShoreParams();
const c = M.c;

describe('shore waves (ShoreWaves.js)', () => {
  it('breaks at db = (A x 3.556 / gamma)^0.8: b < 0 shoaling, 0..1 plunging, > 1 bore', () => {
    for (const A of [0.1, 0.34, 0.8]) {
      const db = Math.pow((A * 3.556) / 0.78, 0.8);
      expect(shoreBreakParams(M, c(A), c(10), P).db.v).toBeCloseTo(db, 9);
      expect(shoreBreakParams(M, c(A), c(db), P).b.v).toBeCloseTo(0, 9);
      expect(shoreBreakParams(M, c(A), c(db * 2), P).b.v).toBeLessThan(0);
      expect(shoreBreakParams(M, c(A), c(db * (1 - 0.13)), P).b.v).toBeCloseTo(1, 9);
      expect(shoreBreakParams(M, c(A), c(db * 0.5), P).b.v).toBeGreaterThan(1);
    }
    // Tidewater's default wave (0.34 m offshore) breaks in about 1.42 m of water
    expect(shoreBreakParams(M, c(0.34), c(5), P).db.v).toBeCloseTo(1.4199, 3);
  });

  it('comes in sets of 7 with the biggest in the middle', () => {
    const mean = new Array(7).fill(0);
    for (let set = -40; set < 40; set += 1)
      for (let k = 0; k < 7; k += 1)
        for (let along = -500; along <= 500; along += 7) mean[k] += shoreWaveAmp(M, c(set * 7 + k), c(along), P).v;
    const top = mean.indexOf(Math.max(...mean));
    expect([3, 4]).toContain(top);
    expect(mean[0]).toBe(Math.min(...mean));
    expect(mean[3] / mean[0]).toBeGreaterThan(1.5);
  });

  it('never makes a wave below 2 cm', () => {
    let lo = Infinity;
    for (let m = -300; m < 300; m += 1)
      for (let along = -800; along <= 800; along += 3.7) lo = Math.min(lo, shoreWaveAmp(M, c(m), c(along), P).v);
    expect(lo).toBeGreaterThanOrEqual(0.02);
  });

  it('the hash is a plain 0..1 number for the CPU and the GPU alike', () => {
    for (let m = -500; m <= 500; m += 1) {
      const h = shoreHash1(M, c(m)).v;
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(1);
    }
  });

  it('runs up for 40 % of the period and drains for 55 %, never below the 0.35 m film', () => {
    const at = (tau: number, along = 12) => {
      // a point on the sand 0.2 m above the sea: inland = 0.2 / slope
      const r = shoreSwashRunup(M, c(1000 + tau * 9), c(1000), c(1), c(along), c(0.2), c(0), P);
      return r;
    };
    // the wobble shifts tau; read it back from the result
    let best = { tau: 0, Rt: -Infinity };
    let floor = Infinity;
    for (let t = 0; t < 1; t += 0.002) {
      const r = at(t);
      if (r.Rt.v > best.Rt) best = { tau: r.tau.v, Rt: r.Rt.v };
      floor = Math.min(floor, r.Rt.v);
    }
    expect(best.tau).toBeCloseTo(SWASH_UP, 1);
    expect(floor).toBeGreaterThanOrEqual(0.35);
    // at tau = 0.95 the backwash has drained to the film
    const r = shoreSwashRunup(M, c(0), c(0), c(1), c(0), c(0.2), c(0), P);
    const tau0 = r.tau.v;
    const drained = shoreSwashRunup(M, c((0.95 - tau0) * 9), c(0), c(1), c(0), c(0.2), c(0), P);
    expect(drained.tau.v).toBeCloseTo(0.95, 6);
    expect(drained.Rt.v).toBeLessThan(0.36 + 0.35 * 0.5);
    // the inland distance of a sand point is its height over the beach slope
    expect(r.inland.v).toBeCloseTo(0.2 / BEACH_SLOPE, 9);
  });

  it('the sheet is a few centimetres thick behind the front and ends under the sand ahead of it', () => {
    expect(shoreSwashThickness(M, c(5)).v).toBeGreaterThan(0.03);
    expect(shoreSwashThickness(M, c(5)).v).toBeLessThanOrEqual(0.12);
    expect(shoreSwashThickness(M, c(-1.2)).v).toBeCloseTo(0, 9);
    expect(shoreSwashThickness(M, c(-5)).v).toBe(-0.1);
  });

  it('the cross-section: a crest above, a trough below, a plunging face and a white bore after it', () => {
    const lam = 9 * Math.sqrt(9.81 * 2);
    const deep = shoreBreakParams(M, c(0.34), c(6), P);
    const crest = shoreProfile(M, c(0), c(lam), deep, P, true);
    const trough = shoreProfile(M, c(0.5), c(lam), deep, P, true);
    expect(crest.y.v).toBeGreaterThan(0);
    expect(trough.y.v).toBeLessThan(0);
    // shoaling: no whitewater yet
    expect(crest.foam.v).toBe(0);
    const bore = shoreBreakParams(M, c(0.34), c(0.6), P);
    expect(bore.b.v).toBeGreaterThan(1.35);
    const front = shoreProfile(M, c(-0.03), c(lam), bore, P, true);
    expect(front.foam.v).toBeGreaterThan(0.5);
    expect(front.roller.v).toBeGreaterThan(0);
    // every value finite across the whole phase and depth range
    for (let u = -0.5; u <= 0.5; u += 0.01)
      for (const d of [0, 0.1, 0.5, 1, 1.4, 2, 5, 25]) {
        const p = shoreProfile(M, c(u), c(lam), shoreBreakParams(M, c(0.34), c(d), P), P, true);
        for (const v of [p.x.v, p.y.v, p.foam.v, p.face.v, p.roller.v]) expect(Number.isFinite(v)).toBe(true);
      }
  });
});
