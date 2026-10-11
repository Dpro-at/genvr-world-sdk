import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CANOPY_SURFACE_WGSL } from '../src/vegetation/canopy-surface.js';

const base = '../../../tooling/other-programs/tidewater/src/';
const nodes = readFileSync(base + 'world/vegetation/VegNodes.js', 'utf8');
const source = readFileSync(base + 'world/vegetation/VegMaterials.js', 'utf8');
const common = readFileSync(base + 'engine/render/wgsl/common.js', 'utf8');
const normalize = (s: string) => s.replace(/\s+/g, ' ').trim();

describe('source canopy surface helpers', () => {
  it('preserves the complete original module after executing its own color conversion', () => {
    const C = new Function(
      nodes.slice(nodes.indexOf('const _lin =')).replace('export const C', 'const C') + ';return C;',
    )();
    const body = source.slice(
      source.indexOf('fn vegPick4'),
      source.indexOf('`,', source.indexOf('fn vegPick4')),
    );
    const original = new Function('C', 'return `' + body + '`;')(C);
    expect(normalize(CANOPY_SURFACE_WGSL.slice(CANOPY_SURFACE_WGSL.indexOf('fn vegPick4')))).toBe(
      normalize(original),
    );
  });
  it('preserves independent original hash/noise and luminance dependencies', () => {
    const original = nodes.slice(nodes.indexOf('\nfn vegHash12') + 1, nodes.indexOf('// Wind ----'));
    expect(normalize(CANOPY_SURFACE_WGSL)).toContain(normalize(original));
    expect(CANOPY_SURFACE_WGSL).toContain(common.match(/fn luminance[^\n]+/)![0].trim());
    expect(CANOPY_SURFACE_WGSL).not.toContain('vegPalmBark');
  });
});
