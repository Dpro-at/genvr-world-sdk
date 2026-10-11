import { describe, expect, it } from 'vitest';
import { BLOCK_PIXELS, CORE_BLOCKS, getBlock, getStylePack } from '../src/index.js';

describe('ground blocks (P2-26)', () => {
  it('draws every face of every block in both looks at 16 x 16 pixels', () => {
    expect(CORE_BLOCKS.map((block) => block.key)).toEqual([
      'grass',
      'dirt',
      'sand',
      'stone',
      'snow',
      'gravel',
      'water',
      'path',
      'paving',
      'brick',
      'planks',
      'cobble',
    ]);
    for (const { key, look } of CORE_BLOCKS)
      for (const faces of [look, look.plain])
        for (const face of ['top', 'side', 'bottom'] as const) {
          expect(faces[face], `${key} ${face}`).toHaveLength(BLOCK_PIXELS * BLOCK_PIXELS);
          for (const color of faces[face]) expect(color >= 0 && color <= 0xffffff).toBe(true);
        }
  });

  it('has a green edge on the grass sides and see-through water', () => {
    const grass = getBlock('grass')!.look;
    expect(grass.side[0]).not.toBe(grass.side[BLOCK_PIXELS * (BLOCK_PIXELS - 2)]);
    expect(getBlock('water')!.look.opacity).toBeLessThan(1);
    expect(getBlock('stone')!.look.opacity).toBe(1);
  });

  it('gives the Voxel style its square sky and block look', () => {
    const look = getStylePack('voxel').look;
    expect(look.sky).toEqual({ sun: 'square', moon: 'square', clouds: 'cubes', drops: 'pixel' });
    expect(['pixel', 'plain']).toContain(look.blocks);
    expect(look.avatar).toBe('cubes');
    expect(getStylePack('blocky').look.avatar).toBeUndefined();
    expect(getStylePack('realistic').look.sky).toBeUndefined();
  });
});
