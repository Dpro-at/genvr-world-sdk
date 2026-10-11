import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bakeTerrainMaps, sampleTerrainFields, type TerrainBakeFields } from '../src/tidewater-ground/ground-bake.js';

// Execute the pinned source itself; this oracle is not a reimplementation of its equations.
const original = readFileSync(new URL('../../../../tooling/other-programs/tidewater/src/world/terrain/TerrainBake.js', import.meta.url), 'utf8');
const section = original.slice(original.indexOf('const AO_STEPS'), original.indexOf('// Coarse heights'));
const oracle = new Function(section.replace('export function', 'function') + '; return bakeTerrainMaps;')() as (t: TerrainBakeFields) => ReturnType<typeof bakeTerrainMaps>;
function terrain(heightAt: (x: number, z: number) => number): TerrainBakeFields {
  return sampleTerrainFields({ res: 64, texel: 1, origin: -32, heightAt,
    rockAt: (x,z) => .5 + .3 * Math.sin(x*.2+z*.1),
    sandAt: x => 128+x, pathAt: z => 70+z, gullyAt: x => 30+x,
    seagrassAt: z => 120-z, rubbleAt: x => 90-x, scarpAt: z => 100+z,
    pads: [{x: 3, z:-4, radius:5}] });
}
describe('Tidewater source terrain horizon and cavity bake', () => {
  it.each(['flat', 'ridge', 'basin', 'deep'] as const)('matches executable source byte-for-byte for %s', name => {
    const heights = {
      flat: () => 2,
      ridge: (x:number,z:number) => 18*Math.exp(-x*x/30)+.15*z,
      basin: (x:number,z:number) => 12-Math.max(0,15-Math.hypot(x,z)),
      deep: (x:number,z:number) => -30+.04*x+.03*z,
    };
    const input = terrain(heights[name]);
    const expected=oracle(input), actual=bakeTerrainMaps(input);
    expect(actual.normal).toEqual(expected.normal);
    expect(actual.splat).toEqual(expected.splat);
    expect(actual.ms.ao).toBeGreaterThanOrEqual(0);
  });
  it('preserves flat normals and full ambient visibility without masks', () => {
    const t=sampleTerrainFields({res:8,texel:1,origin:10,heightAt:()=>0});
    const maps=bakeTerrainMaps(t);
    for(let k=0;k<64;k++)expect([...maps.normal.slice(k*4,k*4+4)]).toEqual([128,128,0,255]);
    expect(maps.splat.every(v=>v===0)).toBe(true);
  });
  it('samples translated cell centres and rejects unsupported coarse grids', () => {
    const t=sampleTerrainFields({res:8,texel:2,origin:10,heightAt:(x,z)=>x+z});
    expect(t.heights[0]).toBe(22);expect(t.heights[63]).toBe(50);
    expect(()=>sampleTerrainFields({res:7,texel:1,origin:0,heightAt:()=>0})).toThrow(RangeError);
    expect(()=>bakeTerrainMaps({...t, rock:new Float32Array(1)})).toThrow(RangeError);
  });
});
