import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { DataUtils, Vector2 } from 'three/webgpu';
import { buildShadowHeights } from '../src/tidewater-ground/terrain-shadow-bake.js';
import { TerrainSunShadow } from '../src/tidewater-ground/terrain-shadow.js';
const original = readFileSync(
  new URL('../../../../tooling/other-programs/tidewater/src/world/terrain/TerrainBake.js', import.meta.url),
  'utf8',
);
const oracle = new Function(
  'DataUtils',
  original.slice(original.indexOf('export function buildShadowHeights')).replace('export ', '') +
    ';return buildShadowHeights;',
)(DataUtils);
describe('source terrain sunlight bake', () => {
  it('compares every source half-float mip bit after base averaging', () => {
    const terrain = {
      res: 64,
      texel: 1,
      heights: Float32Array.from({ length: 4096 }, (_, i) => Math.sin(i * 0.072) * 18 + (i % 31) * 0.027),
    };
    const actual = buildShadowHeights(terrain),
      expected = oracle(terrain);
    expect(actual).toEqual(expected);
    expect(actual.levels.map((l) => l.width)).toEqual([16, 8, 4, 2, 1]);
  });
  it('rejects invalid mip domains and is safe after disposal', () => {
    expect(
      () => new TerrainSunShadow({ origin: new Vector2(), size: 20, res: 20, heightAt: () => 0 }),
    ).toThrow();
    const shadow = new TerrainSunShadow({ origin: new Vector2(), size: 64, res: 64, heightAt: () => 0 });
    shadow.dispose();
    shadow.dispose();
    shadow.invalidate();
    expect(shadow.ready.value).toBe(0);
  });
});
