import { WorldDocument, type ItemInstance } from '@genvr/contracts';
import { describe, expect, it } from 'vitest';
import { restingPoint, type RestingOptions } from '../src/index.js';

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

/** A 4 x 0.5 x 4 platform part, a 1 m block, and a table (a prop, not a part). */
const options: RestingOptions = {
  groundAt: () => 0,
  itemShape: (itemId) =>
    itemId === 'platform'
      ? { min: [-2, 0, -2], max: [2, 0.5, 2], solid: true, part: true }
      : itemId === 'block'
        ? { min: [-0.5, 0, -0.5], max: [0.5, 1, 0.5], solid: true, part: true }
        : itemId === 'table'
          ? { min: [-1, 0, -0.5], max: [1, 0.8, 0.5], solid: true, part: false }
          : null,
};

describe('resting point (P2-11)', () => {
  it('stands on the ground, or on building parts that fill the spot', () => {
    expect(restingPoint(doc([]), options, 3, 3)).toEqual([3, 0, 3]);
    const world = doc([at('p', 'platform', 0, 0, 0), at('b1', 'block', 5, 0, 5), at('b2', 'block', 5, 1, 5)]);
    expect(restingPoint(world, options, 1, 1)).toEqual([1, 0.5, 1]);
    // A wall of two blocks: on top, not inside.
    expect(restingPoint(world, options, 5, 5)).toEqual([5, 2, 5]);
  });

  it('keeps things in a room on its floor, under a high ceiling', () => {
    const room = {
      points: [
        [-3, -3],
        [3, -3],
        [3, 3],
        [-3, 3],
      ] as [number, number][],
      level: 0.3,
    };
    const ceiling = doc([at('roof', 'platform', 0, 3, 0)]);
    expect(restingPoint(ceiling, { ...options, floors: [room] }, 1, 1)).toEqual([1, 0.3, 1]);
  });

  it('stands on a named item, at its middle when the point is beside it', () => {
    const world = doc([at('t', 'table', 10, 0, 10)]);
    expect(restingPoint(world, options, 10.5, 10, 't')).toEqual([10.5, 0.8, 10]);
    expect(restingPoint(world, options, 20, 20, 't')).toEqual([10, 0.8, 10]);
    expect(restingPoint(world, options, 10, 10, 'missing')).toBeNull();
    // Props are not climbed without `on`.
    expect(restingPoint(world, options, 10, 10)).toEqual([10, 0, 10]);
  });
});
