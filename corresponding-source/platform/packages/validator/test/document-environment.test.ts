import { WorldDocument, type ItemInstance } from '@genvr/contracts';
import { describe, expect, it } from 'vitest';
import { documentEnvironment, validateWorld } from '../src/index.js';

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

const item = (instanceId: string, itemId: string, x: number, y: number, z: number): ItemInstance => ({
  instanceId,
  itemId,
  transform: { position: [x, y, z], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
  params: {},
});

/** A 1 m solid crate, a 1 m see-through bush, and unknown items (packages not loaded). */
const shapes = (itemId: string) =>
  itemId === 'crate'
    ? { min: [-0.5, 0, -0.5] as const, max: [0.5, 1, 0.5] as const, solid: true, part: false }
    : itemId === 'bush'
      ? { min: [-0.5, 0, -0.5] as const, max: [0.5, 1, 0.5] as const, solid: false, part: false }
      : null;

const check = (world: WorldDocument, floors = [] as Array<{ points: [number, number][]; level: number }>) =>
  validateWorld(world, documentEnvironment(world, { groundAt: () => 0, itemShape: shapes, floors }));

describe('document environment (P2-12 part 3)', () => {
  it('lets items stand on solid items, and finds floating ones with a fix', () => {
    expect(check(doc([item('low', 'crate', 0, 0, 0), item('top', 'crate', 0, 1, 0)])).findings).toEqual([]);
    const findings = check(doc([item('low', 'crate', 0, 0, 0), item('air', 'crate', 0, 3, 0)])).findings;
    expect(findings.map((f) => [f.code, f.instanceIds])).toEqual([['floating', ['air']]]);
    // Falls onto the crate below, not to the ground.
    expect(findings[0]!.fix![0]).toMatchObject({ params: { position: [0, 1, 0] } });
  });

  it('does not stand items on see-through items, and skips unknown items', () => {
    const findings = check(doc([item('bush', 'bush', 0, 0, 0), item('top', 'crate', 0, 1, 0)])).findings;
    expect(findings.map((f) => f.code)).toEqual(['floating']);
    expect(check(doc([item('pkg', 'user.pkg', 0, 9, 0)])).findings).toEqual([]);
  });

  it('counts room floors as support', () => {
    const room = {
      points: [
        [-3, -3],
        [3, -3],
        [3, 3],
        [-3, 3],
      ] as [number, number][],
      level: 0.5,
    };
    expect(check(doc([item('chair', 'crate', 0, 0.5, 0)]), [room]).findings).toEqual([]);
    // Outside the room the same height floats above the ground.
    expect(check(doc([item('chair', 'crate', 9, 0.5, 9)]), [room]).findings.map((f) => f.code)).toEqual([
      'floating',
    ]);
  });
});
