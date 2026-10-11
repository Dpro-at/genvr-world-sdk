import { describe, expect, it } from 'vitest';
import { cascadeAttenuation, cascadeAttenuationTable } from '../src/ocean/water-surface.js';
import { fresnelDielectric, waterPhaseHG } from '../src/ocean/water-shading.js';
import { bakeSeaDepth, seaGridAxis, seaGridGeometry, SEA_DEPTH_RANGE } from '../src/ocean/tidewater-sea.js';
import { DEFAULT_CASCADE_SIZES } from '../src/ocean/ocean-spectrum.js';

describe('Tidewater surface: cascade attenuation (WaterSurface.js L55-63)', () => {
  it('full height from min(40, size x 0.08) m of depth, floors 0, 0.05, 0.25, 0.5', () => {
    const table = cascadeAttenuationTable(DEFAULT_CASCADE_SIZES);
    expect(table.map((t) => t.d0)).toEqual([40, expect.closeTo(12.56, 6), expect.closeTo(2.664, 6), expect.closeTo(0.568, 6)]);
    expect(table.map((t) => t.floor)).toEqual([0, 0.05, 0.25, 0.5]);
  });

  it('long waves vanish in the shallows first, short ones keep a floor until very shallow', () => {
    const at = (c: number, depth: number) => cascadeAttenuation(DEFAULT_CASCADE_SIZES, c, depth);
    for (let c = 0; c < 4; c += 1) {
      expect(at(c, 0)).toBe(0);
      expect(at(c, 60)).toBe(1);
    }
    // 5 m of water: the 733 m swell is mostly gone, the 7.1 m chop is untouched
    expect(at(0, 5)).toBeLessThan(0.05);
    expect(at(3, 5)).toBe(1);
    // 0.6 m: the floor of each cascade is reached before its own fade-in
    expect(at(1, 0.6)).toBeCloseTo(0.05 + 0.95 * (3 * (0.6 / 12.56) ** 2 - 2 * (0.6 / 12.56) ** 3), 6);
    // never above 1, never below 0, and never shrinking as the water gets deeper
    for (let c = 0; c < 4; c += 1)
      for (let d = 0; d < 60; d += 0.25) {
        expect(at(c, d + 0.25)).toBeGreaterThanOrEqual(at(c, d));
        expect(at(c, d)).toBeLessThanOrEqual(1);
      }
  });
});

describe('Tidewater shading helpers (WaterMaterial.js L17-30)', () => {
  it('Fresnel of water is about 2 % straight down and 1 at grazing', () => {
    expect(fresnelDielectric(1, 1.333)).toBeCloseTo(((1.333 - 1) / (1.333 + 1)) ** 2, 4);
    expect(fresnelDielectric(0, 1.333)).toBeCloseTo(1, 6);
    // total internal reflection from below beyond the critical angle
    expect(fresnelDielectric(0.5, 1 / 1.333)).toBe(1);
  });

  it('the HG phase integrates to 1 over the sphere and peaks forward', () => {
    let sum = 0;
    const steps = 20000;
    for (let i = 0; i < steps; i += 1) {
      const mu = -1 + ((i + 0.5) / steps) * 2;
      sum += waterPhaseHG(mu, 0.86) * 2 * Math.PI * (2 / steps);
    }
    expect(sum).toBeCloseTo(1, 2);
    expect(waterPhaseHG(1, 0.86)).toBeGreaterThan(waterPhaseHG(-1, 0.86) * 100);
  });
});

describe('Tidewater sea grid and depth map', () => {
  it('the grid axis is finest under the camera and reaches the radius', () => {
    const axis = seaGridAxis(512, 0.3, 1500);
    expect(axis.length).toBe(513);
    expect(axis[256]).toBe(0);
    expect(axis[0]).toBeCloseTo(-1500, 6);
    expect(axis[512]).toBeCloseTo(1500, 6);
    expect(axis[257]! - axis[256]!).toBeCloseTo(0.3, 2);
    for (let i = 1; i < axis.length; i += 1) expect(axis[i]!).toBeGreaterThan(axis[i - 1]!);
    // cells only grow outwards
    for (let i = 257; i < axis.length - 1; i += 1)
      expect(axis[i + 1]! - axis[i]!).toBeGreaterThanOrEqual(axis[i]! - axis[i - 1]! - 1e-9);
  });

  it('the grid triangles face up and every vertex knows its spacing', () => {
    const geometry = seaGridGeometry(8, 0.5, 20);
    const pos = geometry.getAttribute('position');
    const index = geometry.getIndex()!;
    for (let t = 0; t < index.count; t += 3) {
      const [a, b, c] = [index.getX(t), index.getX(t + 1), index.getX(t + 2)];
      const ux = pos.getX(b) - pos.getX(a);
      const uz = pos.getZ(b) - pos.getZ(a);
      const vx = pos.getX(c) - pos.getX(a);
      const vz = pos.getZ(c) - pos.getZ(a);
      // y of (b - a) x (c - a)
      expect(uz * vx - ux * vz).toBeGreaterThan(0);
    }
    const spacing = geometry.getAttribute('spacing');
    expect(spacing.count).toBe(pos.count);
    expect(Math.min(...(spacing.array as Float32Array))).toBeGreaterThan(0.4);
  });

  it('bakes the sea depth over the square and clamps it', () => {
    const beach = (x: number) => -10 + x * 0.1; // ground rises toward +x
    const depth = bakeSeaDepth(0, 100, beach, 4);
    // cell centres x = -75, -25, 25, 75
    expect([...depth.subarray(0, 4)]).toEqual([17.5, 12.5, 7.5, 2.5]);
    const deep = bakeSeaDepth(0, 10, () => -9999, 2);
    expect(deep[0]).toBe(SEA_DEPTH_RANGE[1]);
    const high = bakeSeaDepth(0, 10, () => 9999, 2);
    expect(high[0]).toBe(SEA_DEPTH_RANGE[0]);
  });
});
