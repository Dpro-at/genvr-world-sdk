import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LEAF_ATLAS_SIZE, LEAF_TILES, LEAF_BAKE_WGSL } from '../src/vegetation/leaf-atlas.js';
const source = readFileSync(new URL('../../../../tooling/other-programs/tidewater/src/world/vegetation/LeafTextures.js', import.meta.url), 'utf8');
describe('source leaf atlas contract', () => {
  it('keeps the original tile definitions and resolution', () => {
    const start = source.indexOf('export const LEAF_TILES = ') + 'export const LEAF_TILES = '.length;
    const expected = new Function('return ' + source.slice(start, source.indexOf(';', start)))();
    expect(LEAF_TILES).toEqual(expected);
    expect(LEAF_ATLAS_SIZE).toBe(Number(source.match(/const SIZE = (\d+)/)![1]));
  });
  it('preserves the original rosette equations verbatim apart from line endings', () => {
    const start = source.indexOf('struct VegRosette');
    const end = source.indexOf('`;', start);
    expect(LEAF_BAKE_WGSL.replaceAll('\r\n', '\n')).toContain(source.slice(start, end).replaceAll('\r\n', '\n'));
  });
});
