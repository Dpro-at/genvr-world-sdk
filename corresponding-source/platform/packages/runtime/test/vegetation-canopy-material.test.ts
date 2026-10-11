import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CANOPY_SHADE_WGSL } from '../src/vegetation/canopy-material.js';

const original = readFileSync(
  new URL(
    '../../../../tooling/other-programs/tidewater/src/world/vegetation/VegMaterials.js',
    import.meta.url,
  ),
  'utf8',
);
const compact = (s: string) => s.replace(/\s+/g, '');

describe('source near canopy material', () => {
  it('selects the full shade entry before helper functions', () => {
    expect(CANOPY_SHADE_WGSL.match(/fn\s+(\w+)/)?.[1]).toBe('twCanopyShade');
    expect(CANOPY_SHADE_WGSL).toContain('return mat4x4f');
  });
  it('preserves source spherical leaf normals and authored surface scalars', () => {
    const factory = original.slice(
      original.indexOf('export function createCanopyMaterial'),
      original.indexOf('// Unlit bake materials'),
    );
    for (const line of factory.split('\n')) {
      if (
        line.includes('s.normal =') ||
        line.includes('s.ao =') ||
        line.includes('s.roughness =') ||
        line.includes('s.specularIntensity =')
      ) {
        expect(compact(CANOPY_SHADE_WGSL)).toContain(compact(line));
      }
    }
    expect(CANOPY_SHADE_WGSL).toContain('s.normal = select');
  });
  it('preserves source edge coverage threshold separately from outgoing LOD fade', () => {
    expect(compact(CANOPY_SHADE_WGSL)).toContain('smoothstep(0.08,0.35,facing))*0.45');
    expect(compact(CANOPY_SHADE_WGSL)).toContain('returnisBark||L.x>thr;');
  });
});
