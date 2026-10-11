import { WorldDocument } from '@genvr/contracts';
import { describe, expect, it } from 'vitest';
import { freeSpawnPoint, insideBuilding } from '../src/index.js';

const doc = (extra: Record<string, unknown> = {}) =>
  WorldDocument.parse({
    schemaVersion: 1,
    experienceId: 'exp-test',
    version: 0,
    style: { base: 'blocky' },
    sizeTier: 'small',
    access: { mode: 'private' },
    environment: { sky: { preset: 'day' }, weather: { preset: 'clear' } },
    terrain: {},
    spawn: { position: [0, 1, 0] },
    ...extra,
  });

const house = (id: string, x: number, z: number, side = 10) => ({
  id,
  points: [
    [x - side / 2, z - side / 2],
    [x + side / 2, z - side / 2],
    [x + side / 2, z + side / 2],
    [x - side / 2, z + side / 2],
  ],
  height: 6,
  closed: true,
});

describe('spawn place (never inside a house)', () => {
  it('keeps a free start point where it is', () => {
    const world = doc({ walls: [house('h', 30, 30)] });
    expect(freeSpawnPoint(world, 0, 0)).toEqual({ x: 0, z: 0, moved: false });
  });

  it('sees inside a house and next to its walls', () => {
    const world = doc({ walls: [house('h', 0, 0)] });
    expect(insideBuilding(world, 0, 0)).toBe(true);
    expect(insideBuilding(world, 5.3, 0)).toBe(true);
    expect(insideBuilding(world, 7, 0)).toBe(false);
  });

  it('moves a start inside a house to the nearest street', () => {
    const world = doc({
      walls: [house('h', 0, 0)],
      roads: [{ id: 'far', points: [[-40, 40], [40, 40]], width: 6, materialId: 'genvr.core.road.street' }, { id: 'near', points: [[-40, 12], [40, 12]], width: 6, materialId: 'genvr.core.road.street' }],
    });
    const spot = freeSpawnPoint(world, 1, 2);
    expect(spot.moved).toBe(true);
    expect(spot.z).toBe(12);
    expect(Math.abs(spot.x - 1)).toBeLessThan(1);
  });

  it('skips street points that run inside a house', () => {
    const world = doc({
      walls: [house('h', 0, 0, 30)],
      roads: [{ id: 'through', points: [[-40, 0], [40, 0]], width: 6 }],
    });
    const spot = freeSpawnPoint(world, 0, 0);
    expect(spot.moved).toBe(true);
    expect(spot.z).toBe(0);
    expect(Math.abs(spot.x)).toBeGreaterThan(15.7);
    expect(insideBuilding(world, spot.x, spot.z)).toBe(false);
  });

  it('without streets finds the nearest open ground, also clear of the caller\'s items', () => {
    const world = doc({ walls: [house('h', 0, 0)] });
    const tree = (x: number, z: number) => Math.hypot(x - 6.5, z) < 3;
    const spot = freeSpawnPoint(world, 0, 0, tree);
    expect(spot.moved).toBe(true);
    expect(insideBuilding(world, spot.x, spot.z)).toBe(false);
    expect(tree(spot.x, spot.z)).toBe(false);
    expect(Math.hypot(spot.x, spot.z)).toBeLessThan(10);
  });

  it('moves a start that stands inside an item', () => {
    const world = doc();
    const crate = (x: number, z: number) => Math.abs(x) < 1 && Math.abs(z) < 1;
    const spot = freeSpawnPoint(world, 0, 0, crate);
    expect(spot.moved).toBe(true);
    expect(crate(spot.x, spot.z)).toBe(false);
  });
});
