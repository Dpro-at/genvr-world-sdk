import { describe, expect, it } from 'vitest';
import {
  bandCuts,
  bitReverse8,
  DEFAULT_CASCADE_SIZES,
  dispersion,
  FFT_SIZE,
  ifftInPlace,
  jonswap,
  LOCAL_SEA,
  oceanFieldsCpu,
  oceanSpectrum,
  pcg,
  singleWaveSpectrum,
  SWELL,
  systemParams,
  tmaCorrection,
  toUnit,
} from '../src/ocean/ocean-spectrum.js';

// Hand numbers from Tidewater's OceanFFT.js L215-271 (alpha = 0.076 (g F / U^2)^-0.22,
// peakOmega = 22 (U F / g^2)^-0.33, F in meters), worked out on paper for the two systems.
describe('ocean spectrum (Tidewater OceanFFT port)', () => {
  it('keeps the cascade sizes and the band cuts 2 pi / size x 6 (L204-205)', () => {
    expect(DEFAULT_CASCADE_SIZES).toEqual([733, 157, 33.3, 7.1]);
    const cuts = bandCuts(DEFAULT_CASCADE_SIZES);
    expect(cuts[0]).toEqual([0.0001, expect.closeTo(0.2401, 4)]);
    expect(cuts[1]![0]).toBeCloseTo(0.2401, 4);
    expect(cuts[1]![1]).toBeCloseTo(1.1321, 4);
    expect(cuts[2]![1]).toBeCloseTo(5.3097, 4);
    expect(cuts[3]).toEqual([expect.closeTo(5.3097, 4), 9999]);
  });

  it('works out alpha and the peak frequency of the local sea and the swell', () => {
    const local = systemParams(LOCAL_SEA);
    expect(local.b[0]).toBeCloseTo(0.00826, 5);
    expect(local.b[1]).toBeCloseTo(1.1013, 3);
    expect(local.a[1]).toBeCloseTo((25 * Math.PI) / 180, 6);
    expect(local.a[2]).toBe(0.85);
    expect(local.b[2]).toBe(3.3);
    const swell = systemParams(SWELL);
    expect(swell.a[0]).toBe(0.48);
    expect(swell.b[0]).toBeCloseTo(0.004652, 5);
    expect(swell.b[1]).toBeCloseTo(0.5420, 3);
    expect(swell.b[3]).toBe(0.1);
  });

  it('dispersion is sqrt(k g tanh(min(k d, 20))) and TMA is 1 in deep water', () => {
    expect(dispersion(1)).toBeCloseTo(Math.sqrt(9.81), 5);
    expect(dispersion(0.001, 10)).toBeCloseTo(Math.sqrt(0.001 * 9.81 * Math.tanh(0.01)), 8);
    // omegaH = omega sqrt(d / g): 0.7139 -> omegaH^2 / 2, 1.5 -> 1 - (2 - 1.5)^2 / 2, 7.86 -> 1
    expect(tmaCorrection(0.1)).toBeCloseTo(0.2548, 3);
    expect(tmaCorrection(1.5 / Math.sqrt(500 / 9.81))).toBeCloseTo(0.875, 6);
    expect(tmaCorrection(1.1013)).toBe(1);
  });

  it('JONSWAP at the peak is alpha g^2 w^-5 e^-1.25 gamma (about 0.464 for the local sea)', () => {
    const local = systemParams(LOCAL_SEA);
    expect(jonswap(local.b[1], local)).toBeCloseTo(0.464, 2);
  });

  it('PCG hash and the unit mapping match a BigInt reference of the WGSL', () => {
    const ref = (v: number) => {
      const m = 0xffffffffn;
      const state = (BigInt(v) * 747796405n + 2891336453n) & m;
      const word = (((state >> ((state >> 28n) + 4n)) ^ state) * 277803737n) & m;
      return Number((word >> 22n) ^ word);
    };
    for (const v of [0, 1, 2, 1337 * 7919, 4294967295, 123456789]) expect(pcg(v)).toBe(ref(v));
    expect(toUnit(0)).toBeGreaterThan(0);
    expect(toUnit(0xffffffff)).toBeLessThan(1);
  });

  it('h0 is the same for seed 1337 on every run, zero outside each band, and paired with its mirror', () => {
    const a = oceanSpectrum();
    const b = oceanSpectrum();
    expect(a.cascades).toBe(4);
    expect(a.h0.length).toBe(FFT_SIZE * FFT_SIZE * 4 * 4);
    expect(Buffer.from(a.h0.buffer).equals(Buffer.from(b.h0.buffer))).toBe(true);
    const other = oceanSpectrum({ seed: 7 });
    expect(Buffer.from(a.h0.buffer).equals(Buffer.from(other.h0.buffer))).toBe(false);
    const N = FFT_SIZE;
    // the centre texel (k = 0) is outside every band
    const centre = (N / 2) * N + N / 2;
    expect([...a.h0.subarray(centre * 4, centre * 4 + 4)].map(Math.abs)).toEqual([0, 0, 0, 0]);
    // (z, w) of a texel is (re, -im) of the texel mirrored through the centre
    const idx = 100 * N + 140;
    const mirror = (N - 100) * N + (N - 140);
    expect(a.h0[idx * 4 + 2]).toBe(a.h0[mirror * 4]);
    expect(a.h0[idx * 4 + 3]).toBe(-a.h0[mirror * 4 + 1]!);
    // significant height 4 sigma (sum of |h0|^2, both +k and -k terms): about 3.3 m, mostly the 733 m swell
    let variance = 0;
    for (let i = 0; i < a.h0.length; i += 4) variance += 2 * (a.h0[i]! ** 2 + a.h0[i + 1]! ** 2);
    const hs = 4 * Math.sqrt(variance);
    expect(hs).toBeGreaterThan(2.5);
    expect(hs).toBeLessThan(4);
  });

  it('the radix-2 inverse transform equals the direct sum', () => {
    const n = 256;
    const re = new Float64Array(n);
    const im = new Float64Array(n);
    for (let i = 0; i < n; i += 1) {
      re[i] = Math.sin(i * 1.7) + (i % 7) * 0.1;
      im[i] = Math.cos(i * 0.3) - (i % 5) * 0.2;
    }
    const want = Array.from({ length: n }, (_, m) => {
      let r = 0;
      let s = 0;
      for (let k = 0; k < n; k += 1) {
        const a = (2 * Math.PI * k * m) / n;
        r += re[k]! * Math.cos(a) - im[k]! * Math.sin(a);
        s += re[k]! * Math.sin(a) + im[k]! * Math.cos(a);
      }
      return [r, s];
    });
    ifftInPlace(re, im);
    for (let m = 0; m < n; m += 1) {
      expect(re[m]).toBeCloseTo(want[m]![0]!, 8);
      expect(im[m]).toBeCloseTo(want[m]![1]!, 8);
    }
    expect(bitReverse8(1)).toBe(128);
    expect(bitReverse8(0b00000110)).toBe(0b01100000);
  });

  it('one wave gives a travelling cosine with the right height, slope and sideways swing', () => {
    const N = FFT_SIZE;
    const size = 100;
    const dk = (2 * Math.PI) / size;
    const { h0, waves } = singleWaveSpectrum([{ cascade: 0, dx: 3, dy: 2, amplitude: 0.5, phase: 0.4 }], [size]);
    const [kx, kz] = [3 * dk, 2 * dk];
    const k = Math.hypot(kx, kz);
    const t = 1.3;
    const lambda = 0.9;
    const out = oceanFieldsCpu(h0, waves, 0, t, lambda);
    for (const [X, Y] of [
      [0, 0],
      [17, 40],
      [200, 5],
    ] as const) {
      const phase = kx * ((X * size) / N) + kz * ((Y * size) / N) + dispersion(k) * t + 0.4;
      const o = Y * N + X;
      expect(out.displacement[o * 3 + 1]).toBeCloseTo(0.5 * Math.cos(phase), 6);
      expect(out.displacement[o * 3]).toBeCloseTo(-lambda * (kx / k) * 0.5 * Math.sin(phase), 6);
      expect(out.displacement[o * 3 + 2]).toBeCloseTo(-lambda * (kz / k) * 0.5 * Math.sin(phase), 6);
      expect(out.derivatives[o * 4]).toBeCloseTo(-kx * 0.5 * Math.sin(phase), 6);
      expect(out.derivatives[o * 4 + 1]).toBeCloseTo(-kz * 0.5 * Math.sin(phase), 6);
      expect(out.derivatives[o * 4 + 2]).toBeCloseTo(-lambda * ((kx * kx) / k) * 0.5 * Math.cos(phase), 6);
    }
  });
});
