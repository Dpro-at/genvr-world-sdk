import { MAX_TERRAIN_SLOPE, WorldDocument, type WorldSeed } from '@genvr/contracts';
import { describe, expect, it } from 'vitest';
import { createWorldState, CLEARING_RADIUS, TerrainData, worldHeightAt } from '../src/index.js';

const HALF = 250;
const valley = (seed = 1): WorldSeed => ({ seed, kind: 'valley', generator: 1 });

const doc = () =>
  WorldDocument.parse({
    schemaVersion: 1,
    experienceId: 'exp-test',
    version: 0,
    style: { base: 'realistic' },
    sizeTier: 'small',
    access: { mode: 'private' },
    environment: { sky: { preset: 'day' }, weather: { preset: 'clear' } },
    terrain: {},
    spawn: { position: [0, 1, 0] },
  });

describe('the starter world (P2-40)', () => {
  it('gives the same ground for the same seed, and different ground for another', () => {
    const points: Array<[number, number]> = [
      [0, 0],
      [40, -60],
      [-120, 90],
      [200, 200],
    ];
    for (const [x, z] of points) {
      expect(worldHeightAt(valley(7), x, z, HALF)).toBe(worldHeightAt(valley(7), x, z, HALF));
    }
    // Two seeds cannot give the same ground everywhere.
    expect(
      points.some(([x, z]) => worldHeightAt(valley(7), x, z, HALF) !== worldHeightAt(valley(8), x, z, HALF)),
    ).toBe(true);
  });

  it('leaves the spawn clearing flat, so nobody arrives on a slope', () => {
    const middle = worldHeightAt(valley(), 0, 0, HALF);
    for (const [x, z] of [
      [0, 0],
      [4, 0],
      [0, -7],
      [8, 8],
    ] as Array<[number, number]>) {
      expect(worldHeightAt(valley(), x, z, HALF)).toBeCloseTo(middle, 6);
    }
    // Outside it the ground is free to move again. Checked over a ring rather than at one point:
    // at any single spot the valley's fall and its noise can happen to cancel out.
    const ring = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
      const angle = (i / 8) * Math.PI * 2;
      const r = CLEARING_RADIUS * 4;
      return worldHeightAt(valley(), Math.cos(angle) * r, Math.sin(angle) * r, HALF);
    });
    expect(Math.max(...ring.map((h) => Math.abs(h - middle)))).toBeGreaterThan(1);
  });

  it('falls away down the valley, so a river along it runs downhill', () => {
    const up = worldHeightAt(valley(), 0, -150, HALF);
    const down = worldHeightAt(valley(), 0, 150, HALF);
    expect(up).toBeGreaterThan(down);
  });

  it('rises toward the sides of the valley', () => {
    const middle = worldHeightAt(valley(), 0, 120, HALF);
    const side = worldHeightAt(valley(), 180, 120, HALF);
    expect(side).toBeGreaterThan(middle);
  });

  it('flattens out at the edge, where the outer ground takes over', () => {
    const edge = worldHeightAt(valley(), HALF, HALF, HALF);
    expect(Math.abs(edge)).toBeLessThan(0.5);
  });

  it('gives every kind of world its own shape', () => {
    const kinds: Array<WorldSeed['kind']> = ['valley', 'island', 'plain', 'mountains'];
    const shapes = kinds.map((kind) =>
      [
        [0, 120],
        [160, 0],
        [-90, -90],
      ]
        .map(([x, z]) => worldHeightAt({ seed: 3, kind, generator: 1 }, x!, z!, HALF).toFixed(2))
        .join(','),
    );
    expect(new Set(shapes).size).toBe(kinds.length);
  });
});

describe('generator versions (2026-09-29)', () => {
  const KINDS = ['valley', 'island', 'plain', 'mountains'] as const;

  it('never makes ground steeper than the Realistic style allows, at any size', () => {
    // The world checks report anything steeper, so a fresh world with it is a fault the creator
    // did not make. Measured the way the checks measure: height steps between 2 m grid points.
    const limit = Math.tan((MAX_TERRAIN_SLOPE.realistic * Math.PI) / 180) * 2;
    for (const kind of KINDS)
      for (const seed of [4242, 197975, 293003])
        for (const half of [250, 500]) {
          const world: WorldSeed = { seed, kind, generator: 2 };
          let worst = 0;
          for (let x = -half; x < half; x += 4)
            for (let z = -half; z < half; z += 4) {
              const h = worldHeightAt(world, x, z, half);
              worst = Math.max(
                worst,
                Math.abs(worldHeightAt(world, x + 2, z, half) - h),
                Math.abs(worldHeightAt(world, x, z + 2, half) - h),
              );
            }
          expect(worst, `${kind} ${seed} ${half}`).toBeLessThan(limit);
        }
  });

  it('leaves version 1 exactly as it was, because its places rested their items on it', () => {
    const points: Array<[number, number]> = [
      [0, 0],
      [100, -150],
      [232, -232],
      [24, 0],
      [-180, 90],
    ];
    const recorded: Record<(typeof KINDS)[number], number[]> = {
      valley: [
        -0.4821279834769667, 24.55119329599169, 18.76493529760415, -0.027849383005822403, 20.984632451976502,
      ],
      island: [
        26.2372640212439, -7.0000000000000036, -3.6499591836734666, 26.849273636646032, -7.0000000000000036,
      ],
      plain: [2.1581760141626, 3.733233151614776, 2.228523764548339, 2.381668005803517, 2.810238877586717],
      mountains: [
        -4.045858160592616, 37.94216905274227, 23.261531220680908, 5.615076130400503, 32.15313197542296,
      ],
    };
    for (const kind of KINDS)
      expect(points.map(([x, z]) => worldHeightAt({ seed: 4242, kind, generator: 1 }, x, z, HALF))).toEqual(
        recorded[kind],
      );
  });
});

describe('the ground a place stands on (P2-40)', () => {
  it('is flat in a place with no starter world, exactly as before', () => {
    const terrain = new TerrainData(HALF);
    expect(terrain.heightAt(0, 0)).toBe(0);
    expect(terrain.heightAt(120, -80)).toBe(0);
  });

  it('follows the generator where nothing has been shaped', () => {
    const terrain = new TerrainData(HALF);
    terrain.world = valley();
    expect(terrain.heightAt(0, 140)).toBeCloseTo(worldHeightAt(valley(), 0, 140, HALF), 5);
  });

  it('lets a stored chunk win over the generator', () => {
    const terrain = new TerrainData(HALF);
    terrain.world = valley();
    const generated = terrain.heightAt(100, 100);
    expect(generated).not.toBe(0);
    // Sculpting stores the chunk, which from then on is the truth.
    terrain.applyHeights(terrain.planHeights({ minX: 60, maxX: 140, minZ: 60, maxZ: 140 }, () => 5));
    expect(terrain.heightAt(100, 100)).toBeCloseTo(5, 5);
    // Ground nobody touched still comes from the generator.
    expect(terrain.heightAt(-200, -200)).toBeCloseTo(worldHeightAt(valley(), -200, -200, HALF), 5);
  });

  it('starts a place from its document without a world, so old places are untouched', () => {
    const state = createWorldState(doc());
    expect(state.doc.terrain.world).toBeUndefined();
    expect(state.terrain.heightAt(50, 50)).toBe(0);
  });
});
