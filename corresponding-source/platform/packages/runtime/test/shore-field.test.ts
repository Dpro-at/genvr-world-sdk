import { describe, expect, it } from 'vitest';
import { autoSwellDirection, computeShoreField, type ShoreFieldInput } from '../src/ocean/shore-field.js';
import { shoreFieldFromHeights } from '../src/ocean/shore-field-worker.js';

// The shore field (Tidewater sea, plan task 4): wave arrival time over our terrain, ShoreField.js L66-243.
const RES = 128;
const SIZE = 512;
const ORIGIN = -SIZE / 2;
const cell = SIZE / RES;
const at = (i: number, j: number) => [ORIGIN + (i + 0.5) * cell, ORIGIN + (j + 0.5) * cell] as const;

function grid(depthAt: (x: number, z: number) => number, res = RES): Float32Array {
  const out = new Float32Array(res * res);
  const h = SIZE / res;
  for (let j = 0; j < res; j += 1)
    for (let i = 0; i < res; i += 1) out[j * res + i] = depthAt(ORIGIN + (i + 0.5) * h, ORIGIN + (j + 0.5) * h);
  return out;
}

const island = (x: number, z: number) => {
  // a round island of radius 60 m with a beach sloping 0.066 into 25 m of water
  const r = Math.hypot(x, z);
  return Math.min(25, (r - 60) * 0.066 * 3);
};

const input = (depth: Float32Array, swellDir: [number, number] = [0, 1], res = RES): ShoreFieldInput => ({
  depth,
  res,
  origin: ORIGIN,
  size: SIZE,
  swellDir,
});

const T = (f: { data: Float32Array }, i: number, j: number, res = RES) => f.data[(j * res + i) * 4]!;
const dirE = (f: { data: Float32Array }, i: number, j: number) => {
  const k = (j * RES + i) * 4;
  return [f.data[k + 1]!, f.data[k + 2]!] as const;
};
const Ts = (f: { data: Float32Array }, i: number, j: number) => f.data[(j * RES + i) * 4 + 3]!;

describe('shore field (ShoreField.js computeShoreField)', () => {
  it('a flat bottom gives straight fronts: T grows along the swell and is the same across it', () => {
    // deeper than the 25 m cap, so the border's plane wave and the inside travel at the same speed
    const f = computeShoreField(input(grid(() => 30)));
    const c = Math.sqrt(9.81 * 25);
    for (let j = 4; j < RES - 4; j += 8) {
      const row = [10, 40, 64, 90, 117].map((i) => T(f, i, j));
      for (const t of row) expect(t).toBeCloseTo(row[0]!, 1);
      // one cell further along the swell takes cell / c seconds
      expect(T(f, 64, j + 1) - T(f, 64, j)).toBeCloseTo(cell / c, 2);
    }
    // every water cell faces the swell head-on: exposure 1 (capped), direction (0, 1)
    const [dx, dz] = dirE(f, 64, 64);
    expect(dx).toBeCloseTo(0, 3);
    expect(dz).toBeCloseTo(1, 3);
  });

  it('a round island bends the fronts: they wrap around it and arrive later and weaker on the lee side', () => {
    const f = computeShoreField(input(grid(island)));
    // shore cells just outside the beach: exposed (facing the swell, north side z < 0) and lee (south side)
    const ci = RES / 2;
    const r = Math.ceil(64 / cell);
    const exposed = [ci, ci - r - 1] as const;
    const lee = [ci, ci + r] as const;
    expect(T(f, ...lee)).toBeGreaterThan(T(f, ...exposed));
    const e = (p: readonly [number, number]) => Math.hypot(...dirE(f, ...p));
    expect(e(lee)).toBeLessThan(e(exposed));
    // on the island's west flank the waves turn toward the beach (refraction): the direction gains +x
    const flank = [ci - r - 1, ci] as const;
    expect(dirE(f, ...flank)[0]).toBeGreaterThan(0.15);
  });

  it('exposure stays in 0.02..1 everywhere', () => {
    const f = computeShoreField(input(grid(island)));
    for (let k = 0; k < RES * RES; k += 1) {
      const e = Math.hypot(f.data[k * 4 + 1]!, f.data[k * 4 + 2]!);
      expect(e).toBeGreaterThanOrEqual(0.02 - 1e-6);
      expect(e).toBeLessThanOrEqual(1 + 1e-6);
    }
  });

  it('land cells near the shore get T and the shoreline time Ts by extension', () => {
    const f = computeShoreField(input(grid(island)));
    const ci = RES / 2;
    // 20 m inland from the beach on the exposed side (the water line is at r = 60 m)
    const land = [ci, ci - Math.floor(40 / cell)] as const;
    const [x, z] = at(...land);
    expect(island(x, z)).toBeLessThan(0);
    expect(T(f, ...land)).toBeLessThan(1e5);
    expect(Ts(f, ...land)).toBeLessThan(1e5);
    // Ts on land equals the arrival time at the nearby waterline, not later
    const shore = [ci, ci - Math.ceil(60 / cell)] as const;
    expect(Math.abs(Ts(f, ...land) - T(f, ...shore))).toBeLessThan(3);
    // the middle of a big island far from water stays unset (1e5) only beyond the extension
    expect(Number.isFinite(T(f, ci, ci))).toBe(true);
  });

  it('is deterministic', () => {
    const a = computeShoreField(input(grid(island)));
    const b = computeShoreField(input(grid(island)));
    expect(Buffer.from(a.data.buffer).equals(Buffer.from(b.data.buffer))).toBe(true);
  });

  it('solves 512 x 512 in under a second', () => {
    const depth = grid(island, 512);
    const t0 = performance.now();
    const f = computeShoreField(input(depth, [0, 1], 512));
    const ms = performance.now() - t0;
    expect(f.res).toBe(512);
    expect(ms).toBeLessThan(1000);
  });

  it('the worker path gives the same field when no Worker exists (node) and reads heights', async () => {
    const level = 20;
    const heights = (x: number, z: number) => level - island(x, z);
    const viaHeights = await shoreFieldFromHeights({ heightAt: heights, level, extent: SIZE / 2, res: RES, swellDir: [0, 1] });
    const direct = computeShoreField(input(grid(island)));
    expect(viaHeights.res).toBe(RES);
    for (let k = 0; k < RES * RES * 4; k += 997) expect(viaHeights.data[k]).toBeCloseTo(direct.data[k]!, 3);
  });
});

describe('automatic swell direction', () => {
  it('comes from the open sea: land on the east side sends the swell from the west (travelling +x)', () => {
    const depth = grid((x) => (x > 100 ? -5 : 30));
    const [dx, dz] = autoSwellDirection(depth, RES);
    expect(dx).toBeGreaterThan(0.9);
    expect(Math.abs(dz)).toBeLessThan(0.4);
  });

  it('land on the north side sends it from the south (travelling -z)', () => {
    const depth = grid((_x, z) => (z < -100 ? -5 : 30));
    const [dx, dz] = autoSwellDirection(depth, RES);
    expect(dz).toBeLessThan(-0.9);
    expect(Math.abs(dx)).toBeLessThan(0.4);
  });

  it('an island in the middle of open sea keeps Tidewater default (-0.12, -1)', () => {
    const [dx, dz] = autoSwellDirection(grid(island), RES);
    const l = Math.hypot(-0.12, -1);
    expect(dx).toBeCloseTo(-0.12 / l, 3);
    expect(dz).toBeCloseTo(-1 / l, 3);
  });
});
