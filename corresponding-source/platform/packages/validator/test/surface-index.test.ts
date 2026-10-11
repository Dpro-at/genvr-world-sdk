import { WorldDocument, type ItemInstance } from '@genvr/contracts';
import { describe, expect, it } from 'vitest';
import { SurfaceIndex, type SurfaceOptions } from '../src/index.js';

const doc = (instances: ItemInstance[]) =>
  WorldDocument.parse({
    schemaVersion: 1,
    experienceId: 'x',
    version: 0,
    style: { base: 'blocky' },
    sizeTier: 'small',
    access: { mode: 'private' },
    environment: { sky: { preset: 'day' }, weather: { preset: 'clear' } },
    terrain: {},
    spawn: { position: [50, 1, 50] },
    instances,
  });
const at = (instanceId: string, itemId: string, x: number, y: number, z: number): ItemInstance => ({
  instanceId,
  itemId,
  transform: { position: [x, y, z], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
  params: {},
});
const options: SurfaceOptions = {
  groundAt: (x) => x * 0.1,
  itemShape: (id) =>
    id === 'table' ? { min: [-1, 0, -0.5], max: [1, 0.8, 0.5], solid: true, part: false } : null,
  decks: [
    {
      points: [
        [10, -3],
        [20, -3],
        [20, 3],
        [10, 3],
      ],
      level: 5,
    },
  ],
};

describe('surface index (P2-43)', () => {
  it('answers ground, a table top, and a bridge deck', () => {
    const index = new SurfaceIndex(doc([at('t', 'table', 0, 0, 0)]), options);
    expect(index.below(5, 5, 100)).toBeCloseTo(0.5, 6);
    expect(index.below(0, 0, 100)).toBeCloseTo(0.8, 6);
    expect(index.below(0, 0, 100, 't')).toBeCloseTo(0, 6);
    expect(index.below(15, 0, 100)).toBe(5);
    expect(index.below(15, 0, 4)).toBeCloseTo(1.5, 6);
  });

  it('follows an item that moved or was removed', () => {
    const world = doc([at('t', 'table', 0, 0, 0)]);
    const index = new SurfaceIndex(world, options);
    index.update(at('t', 'table', 30, 3, 0), 't');
    expect(index.below(0, 0, 100)).toBeCloseTo(0, 6);
    expect(index.below(30, 0, 100)).toBeCloseTo(3.8, 6);
    index.update(null, 't');
    expect(index.below(30, 0, 100)).toBeCloseTo(3, 6);
  });
});

describe('surface index footprints and layers (P2-43 final review)', () => {
  const tree = {
    min: [-2, 0, -2] as [number, number, number],
    max: [2, 5, 2] as [number, number, number],
  };
  const treeOptions: SurfaceOptions = {
    groundAt: () => 0,
    itemShape: (id) => (id === 'tree' ? { ...tree, solid: true, part: false } : null),
    restShape: (id) =>
      id === 'tree'
        ? { ...tree, rule: { mode: 'upright', sink: 0.3, base: { min: [-0.2, -0.2], max: [0.2, 0.2] } } }
        : null,
  };

  it('lets only the trunk of a tree carry things, never the air under its canopy', () => {
    const index = new SurfaceIndex(doc([at('t', 'tree', 0, 0, 0)]), treeOptions);
    expect(index.below(1.5, 0, 100)).toBe(0);
    expect(index.below(0, 0, 100)).toBe(5);
  });

  it('takes new floors, decks and water without rebuilding the item grid', () => {
    const index = new SurfaceIndex(doc([at('t', 'table', 0, 0, 0)]), options);
    expect(index.below(15, 0, 100)).toBe(5);
    index.setLayers({
      decks: [
        {
          points: [
            [10, -3],
            [20, -3],
            [20, 3],
            [10, 3],
          ],
          level: 7,
        },
      ],
      waterAt: (x) => (x > 40 ? 9 : null),
    });
    expect(index.below(15, 0, 100)).toBe(7);
    expect(index.below(50, 0, 100)).toBe(9);
    expect(index.below(0, 0, 100)).toBeCloseTo(0.8, 6);
  });
});
