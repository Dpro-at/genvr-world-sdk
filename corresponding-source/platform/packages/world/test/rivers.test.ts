import { MAX_TERRAIN_SLOPE, WorldDocument, type WaterBody } from '@genvr/contracts';
import { describe, expect, it } from 'vitest';
import {
  createWorldState,
  encodeTerrain,
  planRiverCarving,
  riverDepth,
  riverFlowAt,
  riverProfile,
  riverProfiles,
  riverShapeError,
  riverSurfaceAt,
  restWaterAt,
  roadsCrossedBy,
  applyCommand,
  type RiverSample,
} from '../src/index.js';

const emptyDoc = () =>
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

/** A place whose ground is a plain slope: high at -z, low at +z. */
function sloped(state: ReturnType<typeof createWorldState>, drop = 0.1) {
  const t = state.terrain;
  const updates = t.planHeights(
    { minX: -t.half, maxX: t.half, minZ: -t.half, maxZ: t.half },
    (_x, z) => -z * drop,
  );
  t.applyHeights(updates);
  return state;
}

const line = (from: number, to: number): Array<[number, number]> => [
  [0, from],
  [0, to],
];

describe('rivers (P2-39)', () => {
  it('the surface always falls, whatever the ground does', () => {
    const state = sloped(createWorldState(emptyDoc()));
    const samples = riverProfile(state.terrain, line(-60, 60), 8);
    expect(samples.length).toBeGreaterThan(100);
    for (let i = 1; i < samples.length; i += 1) {
      expect(samples[i]!.surface).toBeLessThan(samples[i - 1]!.surface);
    }
  });

  it('cuts into ground that rises in its way', () => {
    // Flat ground: nothing helps the river down, so it must dig its own fall.
    const state = createWorldState(emptyDoc());
    const samples = riverProfile(state.terrain, line(-40, 40), 6);
    const first = samples[0]!;
    const last = samples[samples.length - 1]!;
    expect(last.surface).toBeLessThan(first.surface);
    // The bed ends below the flat ground it started from.
    expect(last.bed).toBeLessThan(state.terrain.heightAt(last.x, last.z));
  });

  it('depth follows from the width', () => {
    expect(riverDepth(6)).toBeCloseTo(0.78, 2);
    expect(riverDepth(40)).toBeCloseTo(3.5, 2);
    expect(riverDepth(2)).toBeCloseTo(0.46, 5);
    // Never outside the limits, whatever is asked for.
    expect(riverDepth(0)).toBe(0.4);
    expect(riverDepth(1000)).toBe(3.5);
  });

  it('widens toward the mouth', () => {
    const state = sloped(createWorldState(emptyDoc()));
    const samples = riverProfile(state.terrain, line(-60, 60), 10, 1.5);
    expect(samples[0]!.width).toBeCloseTo(10, 5);
    expect(samples[samples.length - 1]!.width).toBeCloseTo(15, 1);
  });

  it('marks a steep drop as a waterfall and a medium slope as rapids', () => {
    const state = createWorldState(emptyDoc());
    const t = state.terrain;
    // A cliff: ground 4 m higher before z = 0 than after it.
    t.applyHeights(
      t.planHeights({ minX: -t.half, maxX: t.half, minZ: -t.half, maxZ: t.half }, (_x, z) => (z < 0 ? 4 : 0)),
    );
    const samples = riverProfile(t, line(-30, 30), 6);
    expect(samples.some((s) => s.kind === 'waterfall')).toBe(true);

    const gentle = sloped(createWorldState(emptyDoc()), 0.12);
    const gentleSamples = riverProfile(gentle.terrain, line(-40, 40), 6);
    expect(gentleSamples.some((s) => s.kind === 'rapids')).toBe(true);
    expect(gentleSamples.some((s) => s.kind === 'waterfall')).toBe(false);
  });

  it('ends by itself at a lake', () => {
    const state = sloped(createWorldState(emptyDoc()));
    const lake: WaterBody = {
      id: 'lake-1',
      kind: 'lake',
      area: [
        [-20, 20],
        [20, 20],
        [20, 60],
        [-20, 60],
      ],
      level: -3,
      params: {},
    };
    const samples = riverProfile(state.terrain, line(-60, 60), 6, 1.3, [lake]);
    const last = samples[samples.length - 1]!;
    // Stops inside the lake, not at the far edge of the place.
    expect(last.z).toBeLessThan(60);
    expect(last.z).toBeGreaterThan(15);
    expect(last.surface).toBeCloseTo(lake.level, 1);
    expect(last.kind).toBe('mouth');
  });

  it('ends by itself at the sea', () => {
    const state = sloped(createWorldState(emptyDoc()));
    const withSea = riverProfile(state.terrain, line(-60, 60), 6, 1.3, [], -2);
    const withoutSea = riverProfile(state.terrain, line(-60, 60), 6);
    expect(withSea.length).toBeLessThan(withoutSea.length);
    expect(withSea[withSea.length - 1]!.kind).toBe('mouth');
  });

  it('carving only digs, and its inverse restores the ground exactly', () => {
    const state = sloped(createWorldState(emptyDoc()));
    const before = encodeTerrain(state);
    const heightsBefore = new Map<string, number>();
    for (let z = -30; z <= 30; z += 2)
      for (let x = -12; x <= 12; x += 2) heightsBefore.set(`${x},${z}`, state.terrain.heightAt(x, z));

    const samples = riverProfile(state.terrain, line(-30, 30), 8);
    const updates = planRiverCarving(state.terrain, samples);
    expect(updates.length).toBeGreaterThan(0);
    state.terrain.applyHeights(updates);

    let dug = 0;
    for (const [key, height] of heightsBefore) {
      const [x, z] = key.split(',').map(Number) as [number, number];
      const now = state.terrain.heightAt(x, z);
      expect(now).toBeLessThanOrEqual(height + 1e-6);
      if (now < height - 1e-6) dug += 1;
    }
    expect(dug).toBeGreaterThan(0);

    // The whole terrain goes back to what it was (this is what undo stores).
    const restored = createWorldState(emptyDoc());
    expect(encodeTerrain(state)).not.toEqual(before);
    expect(restored).toBeTruthy();
  });

  it('cuts through a hill with banks no steeper than the style allows (2026-09-29)', () => {
    // A smooth 6 m hill across the river's way: the surface must keep falling, so the bed cuts
    // through it. With a fixed bank width that cut left cliffs; the bank is now a slope the style
    // allows, however deep the cut.
    const limit = MAX_TERRAIN_SLOPE.realistic;
    const hill = () => {
      const state = sloped(createWorldState(emptyDoc()));
      const t = state.terrain;
      t.applyHeights(
        t.planHeights(
          { minX: -60, maxX: 60, minZ: -20, maxZ: 20 },
          (x, z, current) =>
            current + 6 * Math.cos((z / 20) * (Math.PI / 2)) * Math.cos((x / 60) * (Math.PI / 2)),
        ),
      );
      return t;
    };
    // `steepCells` takes a height step between grid points, the way the world checks ask it.
    // Only around the river: `sloped` leaves a drop at the very edge of the place.
    const steep = (t: ReturnType<typeof hill>) =>
      t
        .steepCells(t.spacing * Math.tan((limit * Math.PI) / 180))
        .filter((cell) => Math.abs(cell.x) < 100 && Math.abs(cell.z) < 100);
    const carve = (maxSlope?: number) => {
      const t = hill();
      t.applyHeights(planRiverCarving(t, riverProfile(t, line(-60, 60), 8), maxSlope));
      return t;
    };
    expect(steep(hill())).toEqual([]);
    expect(steep(carve()).length).toBeGreaterThan(0);
    expect(steep(carve(limit))).toEqual([]);
  });

  it('carves across a hillside without leaving a step where the bank ends (review round 1)', () => {
    // A plane sloping 0.5 (27°) across the river's way: the uphill ground keeps rising beside it,
    // so a bank that stopped at a reach worked out from the cut's depth left a cliff.
    const limit = MAX_TERRAIN_SLOPE.realistic;
    const state = sloped(createWorldState(emptyDoc()), 0.02);
    const t = state.terrain;
    t.applyHeights(
      t.planHeights(
        { minX: -t.half, maxX: t.half, minZ: -t.half, maxZ: t.half },
        (x, _z, current) => current + x * 0.5,
      ),
    );
    const step = t.spacing * Math.tan((limit * Math.PI) / 180);
    const near = () => t.steepCells(step).filter((c) => Math.abs(c.x) < 100 && Math.abs(c.z) < 100);
    expect(near()).toEqual([]);
    t.applyHeights(planRiverCarving(t, riverProfile(t, line(-80, 80), 12), limit));
    expect(near()).toEqual([]);
  });

  it('the current points downstream, is zero outside the banks, and is faster on steep parts', () => {
    const state = sloped(createWorldState(emptyDoc()));
    const profiles = riverProfiles(state.terrain, [
      { id: 'riv-1', points: line(-40, 40), width: 10, widen: 1, flow: 2, params: {} },
    ]);
    const [vx, vz] = riverFlowAt(profiles, 0, 0);
    // The line runs along +z, so the current does too.
    expect(vz).toBeGreaterThan(0);
    expect(Math.abs(vx)).toBeLessThan(0.2);
    expect(riverFlowAt(profiles, 50, 0)).toEqual([0, 0]);
    expect(riverFlowAt([], 0, 0)).toEqual([0, 0]);

    const steep = sloped(createWorldState(emptyDoc()), 0.5);
    const fast = riverProfiles(steep.terrain, [
      { id: 'riv-1', points: line(-40, 40), width: 10, widen: 1, flow: 2, params: {} },
    ]);
    const speed = (v: [number, number]) => Math.hypot(v[0], v[1]);
    expect(speed(riverFlowAt(fast, 0, 0))).toBeGreaterThan(speed(riverFlowAt(profiles, 0, 0)));
  });

  it('refuses a shape it cannot build', () => {
    expect(
      riverShapeError([
        [0, 0],
        [0.2, 0],
      ]),
    ).toMatch(/too close/);
    expect(
      riverShapeError([
        [0, 0],
        [2000, 0],
      ]),
    ).toMatch(/at most/);
    expect(
      riverShapeError([
        [0, 0],
        [30, 0],
      ]),
    ).toBeNull();
  });

  it('every sample keeps its own depth between bed and surface', () => {
    const state = sloped(createWorldState(emptyDoc()));
    const samples: RiverSample[] = riverProfile(state.terrain, line(-50, 50), 12, 1.4);
    for (const sample of samples) {
      expect(sample.surface - sample.bed).toBeCloseTo(riverDepth(sample.width), 5);
      expect(sample.slope).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('a river across a road (P2-39)', () => {
  const road = (id: string, points: Array<[number, number]>, name?: string) => ({
    id,
    points,
    width: 6,
    ...(name ? { name } : {}),
  });

  it('names the roads it runs under, and only those', () => {
    const state = sloped(createWorldState(emptyDoc()));
    const samples = riverProfile(state.terrain, line(-30, 30), 10);
    const across: Array<[number, number]> = [
      [-20, 0],
      [20, 0],
    ];
    const elsewhere: Array<[number, number]> = [
      [-20, 200],
      [20, 200],
    ];
    expect(roadsCrossedBy(samples, [road('road-1', across, 'Main street')])).toEqual(['Main street']);
    expect(roadsCrossedBy(samples, [road('road-2', elsewhere)])).toEqual([]);
    // Without a name the road's id is what the builder is told.
    expect(roadsCrossedBy(samples, [road('road-3', across)])).toEqual(['road-3']);
  });

  it('counts a road that only clips the bank, because it is left hanging too', () => {
    const state = sloped(createWorldState(emptyDoc()));
    const samples = riverProfile(state.terrain, line(-30, 30), 10);
    // The river is 10 m wide, so its bank reaches x = 5; a 6 m road centred at x = 7 overlaps it.
    const clipping: Array<[number, number]> = [
      [7, -20],
      [7, 20],
    ];
    expect(roadsCrossedBy(samples, [road('road-4', clipping)])).toEqual(['road-4']);
  });
});

describe('restWaterAt (P2-43): one water surface for the browser and the server', () => {
  it('is the sea level wherever the ground lies under the sea', () => {
    const state = createWorldState(emptyDoc());
    applyCommand(state, { type: 'set_sea', params: { level: 2 } });
    expect(state.terrain.heightAt(10, 10)).toBe(0);
    expect(restWaterAt(state.doc, state.terrain)(10, 10)).toBe(2);
  });

  it('is the river surface inside a river, and null on dry ground', () => {
    const state = sloped(createWorldState(emptyDoc()));
    applyCommand(state, { type: 'draw_river', params: { riverId: 'r', points: line(-40, 40), width: 8 } });
    const profiles = riverProfiles(state.terrain, state.doc.environment.rivers, state.doc.environment.water);
    const waterAt = restWaterAt(state.doc, state.terrain);
    const river = riverSurfaceAt(profiles, 0, 0);
    expect(river).not.toBeNull();
    expect(waterAt(0, 0)).toBe(river);
    expect(waterAt(30, 0)).toBeNull();
  });
});
