import { WorldDocument } from '@genvr/contracts';
import { applyCommand, circleArea, createWorldState, planWaterFill, roadProfile } from '@genvr/world';
import { beforeAll, describe, expect, it } from 'vitest';
import { initPhysics, PhysicsWorld } from '../src/physics.js';
import { buildRoad, laneLines, planJunctions, RoadMaterials } from '../src/road-view.js';
import { TerrainColliders } from '../src/terrain-physics.js';

beforeAll(async () => {
  await initPhysics();
});

function lakeWorld() {
  const state = createWorldState(
    WorldDocument.parse({
      schemaVersion: 1,
      experienceId: 'x',
      version: 0,
      style: { base: 'blocky' },
      sizeTier: 'small',
      access: { mode: 'private' },
      environment: { sky: { preset: 'day' }, weather: { preset: 'clear' } },
      terrain: {},
      spawn: { position: [0, 1, 0] },
    }),
  );
  for (let i = 0; i < 3; i += 1)
    applyCommand(state, {
      type: 'sculpt_terrain',
      params: { area: circleArea(0, 0, 12), operation: 'lower', strength: 1, soft: true },
    });
  const fill = planWaterFill(state.terrain, 0, 0)!;
  applyCommand(state, {
    type: 'add_water',
    params: { id: 'lake', kind: 'lake', area: fill.area, level: fill.level, params: {} },
  });
  return state;
}

describe('road view', () => {
  it('railways get rails, bridges get a deck, parapets, and a collider', () => {
    const state = lakeWorld();
    const road = { id: 'r', width: 3.4, materialId: 'genvr.core.road.rail' };
    const points: Array<[number, number]> = [
      [-40, 0],
      [40, 0],
    ];
    const samples = roadProfile(state.terrain, points, state.doc.environment.water);
    const built = buildRoad(road, samples, (x, z) => state.terrain.heightAt(x, z), new RoadMaterials());
    // Surface, rails, bridge structure.
    expect(built.meshes).toHaveLength(3);
    expect(built.collider?.indices.length).toBeGreaterThan(0);
  });

  it('a character can walk across the bridge over the lake', () => {
    const state = lakeWorld();
    const points: Array<[number, number]> = [
      [-40, 0],
      [40, 0],
    ];
    applyCommand(state, { type: 'draw_road', params: { roadId: 'r', points, width: 6 } });
    const samples = roadProfile(state.terrain, points, state.doc.environment.water);
    const { collider } = buildRoad(
      { id: 'r', width: 6 },
      samples,
      (x, z) => state.terrain.heightAt(x, z),
      new RoadMaterials(),
    );
    const physics = new PhysicsWorld();
    physics.setStructure('road:r', [], [collider!]);
    const terrain = new TerrainColliders(state.terrain, physics, 2);
    const character = physics.createCharacter({ x: -30, y: state.terrain.heightAt(-30, 0) + 0.1, z: 0 });
    let lowest = Infinity;
    for (let i = 0; i < 60 * 12; i += 1) {
      character.move({ x: 5, z: 0 }, false, 7, 22, 1 / 60);
      terrain.update(character.feet.x, character.feet.z);
      if (Math.abs(character.feet.x) < 3) lowest = Math.min(lowest, character.feet.y);
    }
    const water = state.doc.environment.water[0]!.level;
    expect(character.feet.x).toBeGreaterThan(20);
    // Over the middle of the lake the character stayed on the deck, above the water.
    expect(lowest).toBeGreaterThan(water + 0.8);
    physics.dispose();
  });
});

describe('junctions (R2f)', () => {
  const flat = { heightAt: () => 0 };
  const road = (id: string, width: number, points: Array<[number, number]>, materialId = 'genvr.core.road.street') => ({
    id,
    width,
    materialId,
    points,
    samples: roadProfile(flat, points),
  });
  /** Surface quads of a built road: four corners and their u texture coordinates. */
  const quads = (built: ReturnType<typeof buildRoad>) => {
    const geometry = built.meshes[0]!.geometry;
    const position = geometry.getAttribute('position');
    const uv = geometry.getAttribute('uv');
    const out: Array<{ corners: number[][]; u: number[] }> = [];
    for (let q = 0; q < position.count; q += 4)
      out.push({
        corners: [0, 1, 2, 3].map((k) => [position.getX(q + k), position.getY(q + k), position.getZ(q + k)]),
        u: [0, 1, 2, 3].map((k) => uv.getX(q + k)),
      });
    return out;
  };
  const main = road('main', 10, [[-40, 0], [40, 0]]);
  const side = road('side', 6, [[0, -40], [0, 40]]);

  it('draws the wider road on top and leaves the narrower one out under it', () => {
    const plan = planJunctions([main, side]);
    expect(plan.get('main')!.level).toBe(1);
    expect(plan.get('side')!.level).toBe(0);
    expect(plan.get('side')!.crossings.map((c) => c.above)).toEqual([true]);
    expect(plan.get('main')!.crossings.map((c) => c.above)).toEqual([false]);

    const materials = new RoadMaterials();
    const under = quads(buildRoad(side, side.samples, flat.heightAt, materials, { junctions: plan.get('side') }));
    // No piece of the side street lies wholly inside the main street.
    expect(under.some((q) => q.corners.every((p) => Math.abs(p[2]!) < 4.99))).toBe(false);
    // It still reaches under the main street's edge (no gap).
    expect(under.some((q) => q.corners.some((p) => Math.abs(p[2]!) < 5))).toBe(true);

    const over = quads(buildRoad(main, main.samples, flat.heightAt, materials, { junctions: plan.get('main') }));
    // The surface is photo asphalt in metres (lines are drawn on their own and stop at the junction, see below).
    expect(over.length).toBeGreaterThan(0);
    // Drawn above the side street, so the two never flicker.
    expect(Math.min(...over.flatMap((q) => q.corners.map((p) => p[1]!)))).toBeGreaterThan(
      Math.max(...under.flatMap((q) => q.corners.map((p) => p[1]!))),
    );
    materials.dispose();
  });

  it('a side street ending at the main street is a junction too', () => {
    const end = road('end', 6, [[0, 30], [0, 4]]);
    const plan = planJunctions([main, end]);
    expect(plan.get('end')!.crossings).toHaveLength(1);
    expect(plan.get('main')!.crossings).toHaveLength(1);
  });

  it('pieces of one street continuing each other are not a junction', () => {
    const a = road('a', 8, [[-40, 0], [0, 0]]);
    const b = road('b', 8, [[0, 0], [40, 2]]);
    const plan = planJunctions([a, b]);
    expect(plan.get('a')!.crossings).toHaveLength(0);
    expect(plan.get('b')!.crossings).toHaveLength(0);
  });

  it('a branch leaving at a shallow angle is a junction', () => {
    const branch = road('branch', 6, [[0, 0], [40, 8]]);
    const plan = planJunctions([main, branch]);
    expect(plan.get('branch')!.crossings.map((c) => c.above)).toEqual([true]);
  });

  it('leaves railways and bridges alone', () => {
    const rail = road('rail', 4, [[0, -40], [0, 40]], 'genvr.core.road.rail');
    const plan = planJunctions([main, rail]);
    expect(plan.get('main')!.crossings).toHaveLength(0);
    expect(plan.get('rail')!.crossings).toHaveLength(0);
  });
});

describe('lane lines (R2g)', () => {
  const flat = { heightAt: () => 0 };
  const solid = (lines: ReturnType<typeof laneLines>) => lines.filter((l) => !l.dash);
  const dashed = (lines: ReturnType<typeof laneLines>) => lines.filter((l) => l.dash);

  it('paints white EU lines from the lanes and direction', () => {
    // One way, three lanes: two edge lines and two dashed lane lines, no centre line.
    const oneWay = laneLines({ width: 10.5, lanes: 3, oneway: true });
    expect(solid(oneWay)).toHaveLength(2);
    expect(dashed(oneWay)).toHaveLength(2);
    // Two way, two lanes: a dashed centre line in the middle.
    const twoWay = laneLines({ width: 7, lanes: 2 });
    expect(dashed(twoWay).map((l) => l.offset)).toEqual([0]);
    // Two way, four lanes: a solid centre line and a dashed line in each direction.
    const wide = laneLines({ width: 13.5, lanes: 4 });
    expect(solid(wide).map((l) => Math.round(l.offset * 100) / 100)).toContain(0);
    expect(dashed(wide)).toHaveLength(2);
    // Too narrow for two lanes: edge lines only.
    expect(laneLines({ width: 5 })).toHaveLength(2);
    // Lanes never narrower than 2.75 m, whatever the count says.
    expect(laneLines({ width: 7, lanes: 6, oneway: true })).toHaveLength(2 + 1);
  });

  it('stops the lines where another road crosses', () => {
    const road = (id: string, width: number, points: Array<[number, number]>) => ({
      id,
      width,
      materialId: 'genvr.core.road.street',
      points,
      samples: roadProfile(flat, points),
    });
    const main = { ...road('main', 10, [[-40, 0], [40, 0]]), lanes: 2 };
    const side = road('side', 6, [[0, -40], [0, 40]]);
    const plan = planJunctions([main, side]);
    const materials = new RoadMaterials();
    const built = buildRoad(main, main.samples, flat.heightAt, materials, { junctions: plan.get('main') });
    const paint = built.meshes.find((m) => m.material === materials.marking(1))!;
    expect(paint).toBeDefined();
    const position = paint.geometry.getAttribute('position');
    let inside = 0;
    for (let k = 0; k < position.count; k += 1) if (Math.abs(position.getX(k)) < 3) inside += 1;
    expect(inside).toBe(0);
    expect(position.count).toBeGreaterThan(0);
    materials.dispose();
  });
});

describe('sidewalks (R2h)', () => {
  const flat = { heightAt: () => 0 };
  const road = (id: string, width: number, points: Array<[number, number]>, sidewalk?: number) => ({
    id,
    width,
    materialId: 'genvr.core.road.street',
    points,
    ...(sidewalk ? { sidewalk } : {}),
    samples: roadProfile(flat, points),
  });

  it('raises a paved sidewalk with a kerb on both sides, and you can walk on it', () => {
    const materials = new RoadMaterials();
    const street = road('s', 7, [[-30, 0], [30, 0]], 2);
    const built = buildRoad(street, street.samples, flat.heightAt, materials);
    const walk = built.meshes.find((m) => m.material === materials.sidewalk)!;
    expect(walk).toBeDefined();
    const position = walk.geometry.getAttribute('position');
    let top = -Infinity;
    let outer = 0;
    for (let k = 0; k < position.count; k += 1) {
      top = Math.max(top, position.getY(k));
      outer = Math.max(outer, Math.abs(position.getZ(k)));
    }
    expect(top).toBeGreaterThan(0.15);
    expect(outer).toBeCloseTo(3.5 + 2, 5);
    // The sidewalk tops are solid; the road itself lies on the ground's collider.
    expect(built.collider).not.toBeNull();
    materials.dispose();
  });

  it('opens the sidewalk where a street joins, and keeps the corner of the street on top', () => {
    const materials = new RoadMaterials();
    const main = road('main', 10, [[-40, 0], [40, 0]], 2);
    const side = road('side', 6, [[0, 40], [0, 4]], 1.5);
    const plan = planJunctions([main, side]);
    const xs = (r: typeof main) => {
      const built = buildRoad(r, r.samples, flat.heightAt, materials, { junctions: plan.get(r.id) });
      const position = built.meshes.find((m) => m.material === materials.sidewalk)!.geometry.getAttribute('position');
      return Array.from({ length: position.count }, (_, k) => [position.getX(k), position.getZ(k)] as const);
    };
    // The main street's sidewalk on the side street's side has a gap the side street's width.
    const mainWalk = xs(main).filter(([, z]) => z > 5);
    expect(mainWalk.some(([x]) => Math.abs(x) < 2.5)).toBe(false);
    // The side street's sidewalk stops before the main street and its sidewalk.
    expect(xs(side).every(([, z]) => z >= 7 - 1e-6)).toBe(true);
    materials.dispose();
  });
});

describe('roads on slopes (R2k)', () => {
  it('lie on a steep slope instead of floating above it', () => {
    // A 50 % slope rising along the road.
    const slope = { heightAt: (x: number) => x * 0.5 };
    const road = { id: 'r', width: 3, materialId: 'genvr.core.road.path', points: [[-20, 0], [20, 0]] as Array<[number, number]> };
    const samples = roadProfile(slope, road.points);
    const materials = new RoadMaterials();
    const built = buildRoad(road, samples, slope.heightAt, materials);
    const position = built.meshes[0]!.geometry.getAttribute('position');
    let worst = 0;
    for (let k = 0; k < position.count; k += 1) worst = Math.max(worst, position.getY(k) - slope.heightAt(position.getX(k)));
    // Only the lift that keeps it from flickering with the ground (6 cm), not slope x 0.8 m (40 cm) as before.
    expect(worst).toBeLessThan(0.1);
    materials.dispose();
  });
});
