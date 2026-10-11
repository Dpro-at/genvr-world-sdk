import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  hash2,
  softRamp,
  erosionNoise,
  sampleGrid,
  upsample2,
  boxBlur,
} from '../src/tidewater-ground/ground-noise.js';

// Execute the actual pinned source independently; no copied reference constants/equations.
const source = readFileSync(
  new URL('../../../../tooling/other-programs/tidewater/src/world/terrain/TerrainNoise.js', import.meta.url),
  'utf8',
);
const oracle = new Function(
  source.replace(/export /g, '') + ';return {hash2,softRamp,erosionNoise,sampleGrid,upsample2,boxBlur};',
)();
describe('Tidewater source CPU terrain oracle', () => {
  it('matches hashes and zero mean erosion for varied cells/slopes', () => {
    for (let i = -20; i <= 20; i++) {
      expect(hash2(i, i * 31, 57)).toBe(oracle.hash2(i, i * 31, 57));
      expect(erosionNoise(i * 14.2, i * -9.4, i / 50, 0.17)).toBe(
        oracle.erosionNoise(i * 14.2, i * -9.4, i / 50, 0.17),
      );
      expect(softRamp(i / 10, 0.3)).toBe(oracle.softRamp(i / 10, 0.3));
    }
  });
  it('matches full resampling and clamped edge samples', () => {
    const grid = Float32Array.from({ length: 64 }, (_, i) => Math.sin(i * 0.19) * 30);
    for (const cubic of [true, false])
      expect(upsample2(grid, 8, cubic)).toEqual(oracle.upsample2(grid, 8, cubic));
    for (const x of [-100, 0, 0.5, 3.7, 100])
      expect(sampleGrid(grid, 8, 0, 1, x, x)).toBe(oracle.sampleGrid(grid, 8, 0, 1, x, x));
  });
  it('matches separable blur including borders', () => {
    const grid = Float32Array.from({ length: 63 }, (_, i) => Math.cos(i * 0.3));
    for (const radius of [0, 1, 3])
      expect(boxBlur(grid, 9, 7, radius)).toEqual(oracle.boxBlur(grid, 9, 7, radius));
  });
});
