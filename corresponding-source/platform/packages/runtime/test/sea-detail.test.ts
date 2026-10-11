import { describe, expect, it } from 'vitest';
import { cpuShore as M } from '../src/ocean/shore-waves.js';
import { seaDetailCombine, seaDetailNoise, SEA_DETAIL_WIND, seaDetailOffset } from '../src/ocean/sea-detail.js';
import { realisticQuality } from '../src/realistic-quality.js';

// Gusts, slicks and windrows (Tidewater sea, plan task 7): SeaDetail.js.
const c = M.c;
const combine = (g1: number, g2: number, sl: number, st: number, breakUp: number, wind: number) => {
  const r = seaDetailCombine(M, { g1: c(g1), g2: c(g2), sl: c(sl), st: c(st), breakUp: c(breakUp) }, c(wind));
  return { rough: r.rough.v as number, gust: r.gust.v as number, slick: r.slick.v as number, streak: r.streak.v as number };
};

describe('sea detail noise (SeaDetail.js makeNoiseTexture)', () => {
  const size = 64;
  const noise = seaDetailNoise(size);

  it('is 4 channels of smooth noise normalised to 0..1 per channel', () => {
    expect(noise.length).toBe(size * size * 4);
    for (let ch = 0; ch < 4; ch += 1) {
      let lo = Infinity;
      let hi = -Infinity;
      for (let i = ch; i < noise.length; i += 4) {
        lo = Math.min(lo, noise[i]!);
        hi = Math.max(hi, noise[i]!);
      }
      expect(lo).toBeCloseTo(0, 6);
      expect(hi).toBeCloseTo(1, 6);
    }
  });

  it('tiles without a seam (periodic lattice) and is the same every time (seeded)', () => {
    const at = (x: number, y: number, ch: number) => noise[(((y + size) % size) * size + ((x + size) % size)) * 4 + ch]!;
    for (let y = 0; y < size; y += 7) {
      // the step across the wrap is like any other step
      const across = Math.abs(at(size - 1, y, 0) - at(0, y, 0));
      const inside = Math.abs(at(1, y, 0) - at(0, y, 0));
      expect(across).toBeLessThan(inside + 0.12);
    }
    expect(seaDetailNoise(size)).toEqual(noise);
  });
});

describe('gusts, slicks and windrows (seaDetailSample)', () => {
  it('gusts make the water rougher (0.5 .. 1.5 of the short waves)', () => {
    expect(combine(0, 0, 0, 0, 0, 7).rough).toBeCloseTo(0.5, 6);
    expect(combine(1, 1, 0, 0, 0, 7).rough).toBeCloseTo(1.5, 6);
    expect(combine(0.5, 0.5, 0, 0, 0, 7).gust).toBeCloseTo(0.5, 6);
  });

  it('slicks only in light to moderate wind, calm and torn apart by gusts', () => {
    const calm = combine(0.5, 0.5, 0.9, 0, 0, 5);
    expect(calm.slick).toBeGreaterThan(0.4);
    expect(calm.rough).toBeLessThan(0.6);
    expect(combine(0.5, 0.5, 0.9, 0, 0, 13).slick).toBe(0);
    expect(combine(1, 1, 0.9, 0, 0, 5).slick).toBeLessThan(calm.slick);
  });

  it('windrows only in fresh wind, as smooth lanes', () => {
    expect(combine(0.5, 0.5, 0, 0.9, 0.9, 6).streak).toBe(0);
    const fresh = combine(0.5, 0.5, 0, 0.9, 0.9, 12);
    expect(fresh.streak).toBeCloseTo(0.3, 6);
    expect(fresh.rough).toBeCloseTo(1 * (1 - 0.45), 6);
  });

  it('the patterns drift downwind at 0.7 x the wind, the same on every device at the same sea time', () => {
    const [x, z] = seaDetailOffset(10);
    expect(Math.hypot(x, z)).toBeCloseTo(SEA_DETAIL_WIND.speed * 0.7 * 10, 6);
    expect(x / z).toBeCloseTo(SEA_DETAIL_WIND.dir[0] / SEA_DETAIL_WIND.dir[1], 6);
  });
});

describe('sea detail per quality', () => {
  it('only Ultra (9-10) on a WebGPU computer', () => {
    expect(realisticQuality({ quality: 10, touchDevice: false, webgpu: true }).oceanDetail).toBe(true);
    expect(realisticQuality({ quality: 9, touchDevice: false, webgpu: true }).oceanDetail).toBe(true);
    expect(realisticQuality({ quality: 8, touchDevice: false, webgpu: true }).oceanDetail).toBe(false);
    expect(realisticQuality({ quality: 10, touchDevice: true, webgpu: true }).oceanDetail).toBe(false);
    expect(realisticQuality({ quality: 10, touchDevice: false, webgpu: false }).oceanDetail).toBe(false);
  });
});
