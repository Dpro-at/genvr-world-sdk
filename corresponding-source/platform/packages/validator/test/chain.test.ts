import { WorldDocument, type CommandPayload, type ItemInstance } from '@genvr/contracts';
import { describe, expect, it } from 'vitest';
import {
  gradeCommands,
  isResting,
  refreshesLayers,
  regionOf,
  restingBefore,
  settleChain,
  SurfaceIndex,
  type RestShape,
} from '../src/index.js';

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
const at = (id: string, itemId: string, x: number, y: number, z: number): ItemInstance => ({
  instanceId: id,
  itemId,
  transform: { position: [x, y, z], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
  params: {},
});
const round6 = (v: number) => Math.round(v * 1e6) / 1e6;
const atYaw = (id: string, itemId: string, x: number, y: number, z: number, yaw: number): ItemInstance => ({
  instanceId: id,
  itemId,
  transform: {
    position: [x, y, z],
    rotation: [round6(0), round6(Math.sin(yaw / 2)), round6(0), round6(Math.cos(yaw / 2))],
    scale: [1, 1, 1],
  },
  params: {},
});
const shapes: Record<string, RestShape & { solid: boolean }> = {
  platform: {
    min: [-1.5, 0, -1.5],
    max: [1.5, 0.5, 1.5],
    rule: { mode: 'upright', sink: 0.05 },
    solid: true,
  },
  table: { min: [-1, 0, -0.5], max: [1, 0.8, 0.5], rule: { mode: 'upright', sink: 0.05 }, solid: true },
  lamp: { min: [-0.1, 0, -0.1], max: [0.1, 0.5, 0.1], rule: { mode: 'upright', sink: 0.05 }, solid: true },
  cloud: { min: [-1, 0, -1], max: [1, 1, 1], rule: { mode: 'float' }, solid: false },
  /** A large slab placed in the air on purpose (P2-43 task 6 review round 1, CRITICAL 1). */
  roof: { min: [-1.5, 0, -1.5], max: [1.5, 0.2, 1.5], rule: { mode: 'upright', sink: 0.05 }, solid: true },
  house: { min: [-2, 0, -2], max: [2, 3, 2], rule: { mode: 'grade' }, solid: true },
  tree: { min: [-0.3, 0, -0.3], max: [0.3, 2, 0.3], rule: { mode: 'upright', sink: 0.05 }, solid: true },
};
const shapeOf = (id: string) => shapes[id] ?? null;
const itemShapeOf = (id: string) =>
  shapes[id]
    ? {
        ...shapes[id]!,
        part: false,
        min: shapes[id]!.min as unknown as [number, number, number],
        max: shapes[id]!.max as unknown as [number, number, number],
      }
    : null;

function world(instances: ItemInstance[], ground: { h: number }) {
  const d = doc(instances);
  const surfaces = new SurfaceIndex(d, { groundAt: () => ground.h, itemShape: itemShapeOf });
  const apply = (command: CommandPayload) => {
    if (command.type !== 'transform_item') throw new Error(`unexpected ${command.type}`);
    const instance = d.instances.find((i) => i.instanceId === command.params.instanceId)!;
    if (command.params.position) instance.transform.position = command.params.position;
    if (command.params.rotation) instance.transform.rotation = command.params.rotation;
    surfaces.update(instance, instance.instanceId);
  };
  return { d, surfaces, apply };
}

/**
 * A ground made of whole-meter cells that a `sculpt_terrain` command can override (review round
 * 1's IMPORTANT 1 test, and review round 2's IMPORTANT (I1) and MINOR level-limit tests): unset
 * cells read `base`; `apply` handles both `transform_item` (as `world()` does) and
 * `sculpt_terrain` (sets every whole-meter cell in the command's bounding box to its
 * `targetHeight`, ignoring `soft`/shape — good enough to prove the chain reacts to the ground it
 * itself changes, not a real terrain renderer).
 */
function heightGridWorld(instances: ItemInstance[], base = 0) {
  const overrides = new Map<string, number>();
  const cellKey = (x: number, z: number) => `${Math.round(x)},${Math.round(z)}`;
  const groundAt = (x: number, z: number) => overrides.get(cellKey(x, z)) ?? base;
  const applyOverride = (area: ReadonlyArray<readonly [number, number]>, targetHeight: number) => {
    const minX = Math.floor(Math.min(...area.map((p) => p[0])));
    const maxX = Math.ceil(Math.max(...area.map((p) => p[0])));
    const minZ = Math.floor(Math.min(...area.map((p) => p[1])));
    const maxZ = Math.ceil(Math.max(...area.map((p) => p[1])));
    for (let x = minX; x <= maxX; x++)
      for (let z = minZ; z <= maxZ; z++) overrides.set(cellKey(x, z), targetHeight);
  };
  const d = doc(instances);
  const surfaces = new SurfaceIndex(d, { groundAt, itemShape: itemShapeOf });
  const apply = (command: CommandPayload) => {
    if (command.type === 'sculpt_terrain') {
      applyOverride(command.params.area, command.params.targetHeight ?? base);
      return;
    }
    if (command.type !== 'transform_item') throw new Error(`unexpected ${command.type}`);
    const instance = d.instances.find((i) => i.instanceId === command.params.instanceId)!;
    if (command.params.position) instance.transform.position = command.params.position;
    if (command.params.rotation) instance.transform.rotation = command.params.rotation;
    surfaces.update(instance, instance.instanceId);
  };
  return { d, surfaces, apply, applyOverride };
}

describe('rest chain (P2-43)', () => {
  it('moves a table and the lamp on it when the ground rises', () => {
    const ground = { h: 0 };
    const { d, surfaces, apply } = world(
      [at('t', 'table', 0, 0, 0), at('l', 'lamp', 0, 0.8, 0), at('c', 'cloud', 0, 5, 0)],
      ground,
    );
    const region = regionOf(
      {
        type: 'sculpt_terrain',
        params: {
          area: [
            [-5, -5],
            [5, -5],
            [5, 5],
          ],
          operation: 'raise',
          strength: 1,
        },
      },
      d,
      shapeOf,
    );
    const before = restingBefore(d, region, shapeOf, surfaces);
    expect(before.get('c')).toBe(false);
    ground.h = 2;
    const result = settleChain(d, shapeOf, surfaces, before, apply);
    expect(result.truncated).toBe(false);
    expect(d.instances.find((i) => i.instanceId === 't')!.transform.position[1]).toBeCloseTo(2, 3);
    expect(d.instances.find((i) => i.instanceId === 'l')!.transform.position[1]).toBeCloseTo(2.8, 3);
    expect(d.instances.find((i) => i.instanceId === 'c')!.transform.position[1]).toBe(5);
  });

  it('drops the lamp when the table under it is removed', () => {
    const ground = { h: 0 };
    const { d, surfaces, apply } = world([at('t', 'table', 0, 0, 0), at('l', 'lamp', 0, 0.8, 0)], ground);
    const remove: CommandPayload = { type: 'remove_item', params: { instanceId: 't' } };
    const before = restingBefore(d, regionOf(remove, d, shapeOf), shapeOf, surfaces);
    d.instances.splice(0, 1);
    surfaces.update(null, 't');
    settleChain(d, shapeOf, surfaces, before, apply);
    expect(d.instances[0]!.transform.position[1]).toBeCloseTo(0, 3);
  });

  it('leaves a thing placed in the air on purpose alone', () => {
    const ground = { h: 0 };
    const { d, surfaces, apply } = world([at('l', 'lamp', 0, 3, 0)], ground);
    const before = restingBefore(d, [[-5, -5, 5, 5]], shapeOf, surfaces);
    ground.h = 1;
    expect(settleChain(d, shapeOf, surfaces, before, apply).commands).toEqual([]);
  });

  it('stops at the item limit and says so', () => {
    const ground = { h: 0 };
    const lamps = Array.from({ length: 30 }, (_, i) => at(`l${i}`, 'lamp', i, 0, 0));
    const { d, surfaces, apply } = world(lamps, ground);
    const before = restingBefore(d, 'all', shapeOf, surfaces);
    ground.h = 1;
    expect(settleChain(d, shapeOf, surfaces, before, apply, { levels: 16, items: 10 }).truncated).toBe(true);
  });

  it('grades with a soft ring and then a level base', () => {
    const [soft, hard] = gradeCommands({
      area: [
        [0, 0],
        [4, 0],
        [4, 4],
        [0, 4],
      ],
      level: 2,
    });
    expect(soft).toMatchObject({ type: 'sculpt_terrain', params: { soft: true, targetHeight: 2 } });
    expect(hard).toMatchObject({
      type: 'sculpt_terrain',
      params: {
        area: [
          [0, 0],
          [4, 0],
          [4, 4],
          [0, 4],
        ],
        targetHeight: 2,
      },
    });
  });

  it('grows each edge of a rectangle outward by exactly BLEND (review round 1, MINOR)', () => {
    const [soft] = gradeCommands({
      area: [
        [0, 0],
        [4, 0],
        [4, 4],
        [0, 4],
      ],
      level: 2,
    });
    // A proper edge offset of an axis-aligned square grows every side by the same amount, so the
    // grown square is centered on the original and each side moved out by BLEND (3 m): [-3, 7].
    const area = (soft as { params: { area: Array<[number, number]> } }).params.area;
    for (const [x, z] of area) {
      expect(Math.abs(x) === 3 || Math.abs(x - 4) === 3).toBe(true);
      expect(Math.abs(z) === 3 || Math.abs(z - 4) === 3).toBe(true);
    }
  });

  it('carries a lamp on a table on a platform when the ground under all three rises (controller ruling)', () => {
    const ground = { h: 0 };
    const { d, surfaces, apply } = world(
      [at('p', 'platform', 0, 0, 0), at('t', 'table', 0, 0.5, 0), at('l', 'lamp', 0, 1.3, 0)],
      ground,
    );
    const before = restingBefore(d, 'all', shapeOf, surfaces);
    expect(before.get('p')).toBe(true);
    expect(before.get('t')).toBe(true);
    expect(before.get('l')).toBe(true);
    ground.h = 2;
    const result = settleChain(d, shapeOf, surfaces, before, apply);
    expect(result.truncated).toBe(false);
    expect(d.instances.find((i) => i.instanceId === 'p')!.transform.position[1]).toBeCloseTo(2, 3);
    expect(d.instances.find((i) => i.instanceId === 't')!.transform.position[1]).toBeCloseTo(2.5, 3);
    expect(d.instances.find((i) => i.instanceId === 'l')!.transform.position[1]).toBeCloseTo(3.3, 3);
  });

  it('does not let an unrelated overhead roof steal the lamp (review round 1, CRITICAL 1: lift must not double-count)', () => {
    const ground = { h: 0 };
    const { d, surfaces, apply } = world(
      [
        at('p', 'platform', 0, 0, 0),
        at('t', 'table', 0, 0.5, 0),
        at('l', 'lamp', 0, 1.3, 0),
        // A roof slab floating in the air on purpose (top at 4.2), never touched: not resting.
        at('r', 'roof', 0, 4.0, 0),
      ],
      ground,
    );
    const before = restingBefore(d, 'all', shapeOf, surfaces);
    expect(before.get('p')).toBe(true);
    expect(before.get('t')).toBe(true);
    expect(before.get('l')).toBe(true);
    expect(before.get('r')).toBe(false);
    ground.h = 2;
    const result = settleChain(d, shapeOf, surfaces, before, apply);
    expect(result.truncated).toBe(false);
    expect(d.instances.find((i) => i.instanceId === 'p')!.transform.position[1]).toBeCloseTo(2, 3);
    expect(d.instances.find((i) => i.instanceId === 't')!.transform.position[1]).toBeCloseTo(2.5, 3);
    // With the old (double-counting) lift formula the lamp's search height reached the floating
    // roof at 4.2; with the fix it lands on the table at 3.3, and the roof never moves.
    expect(d.instances.find((i) => i.instanceId === 'l')!.transform.position[1]).toBeCloseTo(3.3, 3);
    expect(d.instances.find((i) => i.instanceId === 'r')!.transform.position[1]).toBe(4.0);
  });

  it('emits no commands for 200 already-resting yawed lamps on unchanged ground (review round 1, CRITICAL 2)', () => {
    const ground = { h: 0 };
    const lamps = Array.from({ length: 200 }, (_, k) => atYaw(`l${k}`, 'lamp', k * 1, 0, 0, k * 0.0317));
    const { d, surfaces, apply } = world(lamps, ground);
    const before = restingBefore(d, 'all', shapeOf, surfaces);
    // Every lamp is already exactly where and how the law would place it.
    expect([...before.values()].every(Boolean)).toBe(true);
    const result = settleChain(d, shapeOf, surfaces, before, apply);
    expect(result.commands).toEqual([]);
  });

  it('re-settles a tree just outside a graded house base after the grade (review round 1, IMPORTANT 1)', () => {
    const overrides = new Map<string, number>();
    const cellKey = (x: number, z: number) => `${Math.round(x)},${Math.round(z)}`;
    const groundAt = (x: number, z: number) => overrides.get(cellKey(x, z)) ?? 0;
    const applyOverride = (area: ReadonlyArray<readonly [number, number]>, targetHeight: number) => {
      const minX = Math.floor(Math.min(...area.map((p) => p[0])));
      const maxX = Math.ceil(Math.max(...area.map((p) => p[0])));
      const minZ = Math.floor(Math.min(...area.map((p) => p[1])));
      const maxZ = Math.ceil(Math.max(...area.map((p) => p[1])));
      for (let x = minX; x <= maxX; x++)
        for (let z = minZ; z <= maxZ; z++) overrides.set(cellKey(x, z), targetHeight);
    };
    const d = doc([at('h', 'house', 0, 0, 0), at('t', 'tree', 4, 0, 0)]);
    const surfaces = new SurfaceIndex(d, { groundAt, itemShape: itemShapeOf });
    const apply = (command: CommandPayload) => {
      if (command.type === 'sculpt_terrain') {
        applyOverride(command.params.area, command.params.targetHeight ?? 0);
        return;
      }
      if (command.type !== 'transform_item') throw new Error(`unexpected ${command.type}`);
      const instance = d.instances.find((i) => i.instanceId === command.params.instanceId)!;
      if (command.params.position) instance.transform.position = command.params.position;
      if (command.params.rotation) instance.transform.rotation = command.params.rotation;
      surfaces.update(instance, instance.instanceId);
    };

    // A terrain edit touching only the house's own footprint (GRADE_MARGIN = 0.5, so [-2.5, 2.5])
    // — not the tree 2 m outside its base (at x = 4): the region and "before" state see only the
    // house.
    const houseFootprint: Array<[number, number]> = [
      [-2.5, -2.5],
      [2.5, -2.5],
      [2.5, 2.5],
      [-2.5, 2.5],
    ];
    const edit: CommandPayload = {
      type: 'sculpt_terrain',
      params: { area: houseFootprint, operation: 'flatten', strength: 1, targetHeight: 2 },
    };
    const region = regionOf(edit, d, shapeOf);
    const before = restingBefore(d, region, shapeOf, surfaces);
    expect(before.has('t')).toBe(false);
    expect(before.get('h')).toBe(true);

    applyOverride(houseFootprint, 2);
    const result = settleChain(d, shapeOf, surfaces, before, apply);
    expect(result.truncated).toBe(false);
    expect(d.instances.find((i) => i.instanceId === 'h')!.transform.position[1]).toBeCloseTo(2, 3);
    // The house's own grade blends BLEND = 3 m past its base, reaching the tree at x = 4; without
    // the fix the tree is never re-queued (it was outside the triggering region) and is left
    // floating 2 m above the newly-raised ground.
    expect(d.instances.find((i) => i.instanceId === 't')!.transform.position[1]).toBeCloseTo(2, 3);
  });

  it("keeps a moved item findable for a later grade's blend, and both houses end up resting (review round 2, IMPORTANT I1)", () => {
    // Two grade houses 6 m apart: close enough that each one's own blend ring (BLEND = 3 m past
    // its GRADE_MARGIN = 0.5 m-grown base, so a 5.5 m half-width) reaches the other's box, so
    // raising the ground under house a alone still ends up moving house b too, and then house b's
    // own grade blend reaches back over house a — which only works if house a is still findable in
    // the spatial index after its own move (the bug: it was deleted from the index and never
    // re-inserted).
    const { d, surfaces, apply, applyOverride } = heightGridWorld(
      [at('a', 'house', 0, 0, 0), at('b', 'house', 6, 0, 0)],
      0,
    );
    const footprintOf = (cx: number): Array<[number, number]> => [
      [cx - 2.5, -2.5],
      [cx + 2.5, -2.5],
      [cx + 2.5, 2.5],
      [cx - 2.5, 2.5],
    ];
    const edit: CommandPayload = {
      type: 'sculpt_terrain',
      params: { area: footprintOf(0), operation: 'flatten', strength: 1, targetHeight: 2 },
    };
    const region = regionOf(edit, d, shapeOf);
    const before = restingBefore(d, region, shapeOf, surfaces);
    expect(before.get('a')).toBe(true);
    expect(before.has('b')).toBe(false);

    applyOverride(footprintOf(0), 2);
    const result = settleChain(d, shapeOf, surfaces, before, apply);
    expect(result.truncated).toBe(false);

    const a = d.instances.find((i) => i.instanceId === 'a')!;
    const b = d.instances.find((i) => i.instanceId === 'b')!;
    const houseShape = shapeOf('house')!;
    // The real assertion: after the whole chain, both houses are actually resting on the ground as
    // it finally stands, including whatever each one's own grade did to the other. Without the
    // fix, house b's later grade changes the ground under house a again but a is never found to
    // re-settle, so `isResting(a, ...)` comes back false even though `a`'s stored position hasn't
    // moved since its own turn.
    expect(isResting(a, houseShape, surfaces)).toBe(true);
    expect(isResting(b, houseShape, surfaces)).toBe(true);
  });

  /**
   * A straight line of grade houses, 6 m apart: close enough that each one's own blend ring (a
   * 5.5 m half-width past its own centre) reaches the very next house's westmost sampled foot
   * (at 6 - 1.6 = 4.4 m) but not the next one's box after that (a clearance of 2 x 6 - 2 x 2 = 8 m,
   * so its blend, reaching only to 5.5 m, never touches it) — the same shape as the review round 1
   * IMPORTANT 1 test and the review round 2 I1 test, just repeated down a line. Only one of each
   * house's three sampled feet falls in the blend, so each level only inherits a third of the
   * previous one's height; starting the raise absurdly high (1e6 m — this is a synthetic fixture,
   * not a real place) keeps every level's move well above the 1 cm "did it really move" floor
   * through 16 levels of that decay (1e6 / 3^16 ≈ 23 m, still 2,300x the floor). Raising the ground
   * only under house 0 then cascades exactly one grade-and-requeue per house, so house `k`'s
   * settle depth is really `k` (review round 2, MINOR: the level-limit test).
   */
  function staircaseWorld(count: number) {
    const step = 6;
    const houses = Array.from({ length: count }, (_, i) => at(`h${i}`, 'house', i * step, 0, 0));
    const { d, surfaces, apply, applyOverride } = heightGridWorld(houses, 0);
    const footprint0: Array<[number, number]> = [
      [-2.5, -2.5],
      [2.5, -2.5],
      [2.5, 2.5],
      [-2.5, 2.5],
    ];
    const raise = 1_000_000;
    const edit: CommandPayload = {
      type: 'sculpt_terrain',
      params: { area: footprint0, operation: 'flatten', strength: 1, targetHeight: raise },
    };
    // The edit's own region (footprint0, ± the sculpt margin) doesn't reach house 1 at 6 m out, so
    // only house 0 starts known-resting: everything past it is discovered by the chain's own
    // propagation, one level at a time.
    const before = restingBefore(d, regionOf(edit, d, shapeOf), shapeOf, surfaces);
    applyOverride(footprint0, raise);
    return { d, surfaces, apply, before };
  }

  it('stops a 17-house staircase at the 16-level limit and says so (review round 2, MINOR)', () => {
    const { d, surfaces, apply, before } = staircaseWorld(17);
    const result = settleChain(d, shapeOf, surfaces, before, apply);
    expect(result.truncated).toBe(true);
    // House 16 (depth 16) is the one the limit stops; everything up to house 15 (depth 15) settled.
    expect(d.instances.find((i) => i.instanceId === 'h15')!.transform.position[1]).toBeGreaterThan(0);
    expect(d.instances.find((i) => i.instanceId === 'h16')!.transform.position[1]).toBe(0);
  });

  it('does not truncate a 16-house staircase, one level shallower (review round 2, MINOR)', () => {
    const { d, surfaces, apply, before } = staircaseWorld(16);
    expect(settleChain(d, shapeOf, surfaces, before, apply).truncated).toBe(false);
  });

  /** A grid of `count` lamps on flat ground that then rises 1 m, with a counter on `below()`. */
  const lampField = (count: number) => {
    const ground = { h: 0 };
    const many = Array.from({ length: count }, (_, i) =>
      at(`l${i}`, 'lamp', (i % 50) * 2, 0, Math.floor(i / 50) * 2),
    );
    const d = doc(many);
    const surfaces = new SurfaceIndex(d, { groundAt: () => ground.h, itemShape: itemShapeOf });
    const calls = { below: 0 };
    const below = surfaces.below.bind(surfaces);
    surfaces.below = (x, z, fromY, ignore) => {
      calls.below += 1;
      return below(x, z, fromY, ignore);
    };
    const byId = new Map(d.instances.map((i) => [i.instanceId, i] as const));
    const apply = (command: CommandPayload) => {
      if (command.type !== 'transform_item') throw new Error(`unexpected ${command.type}`);
      const instance = byId.get(command.params.instanceId)!;
      if (command.params.position) instance.transform.position = command.params.position;
      if (command.params.rotation) instance.transform.rotation = command.params.rotation;
      surfaces.update(instance, instance.instanceId);
    };
    const before = restingBefore(d, 'all', shapeOf, surfaces);
    ground.h = 1;
    calls.below = 0;
    return { d, surfaces, before, apply, calls };
  };

  it('does work that grows linearly with the items it settles (P2-43 final review, I7)', () => {
    const small = lampField(500);
    const big = lampField(2000);
    const a = settleChain(small.d, shapeOf, small.surfaces, small.before, small.apply);
    const b = settleChain(big.d, shapeOf, big.surfaces, big.before, big.apply);
    expect(a.commands).toHaveLength(500);
    expect(b.commands).toHaveLength(2000);
    // Four times the items is four times the surface queries, not sixteen: no hidden n².
    expect(big.calls.below).toBe(small.calls.below * 4);
    expect(big.d.instances.every((i) => i.transform.position[1] === 1)).toBe(true);
  });

  // Wall-clock timing only on request (GENVR_PERF=1): under a parallel test run a timer measures
  // the machine's load, not the chain (P2-43 final review, I7).
  it.runIf(process.env.GENVR_PERF === '1')(
    'settles 2000 items under 50 ms: median of 5 timed runs, one warm-up run first',
    () => {
      const warm = lampField(2000);
      settleChain(warm.d, shapeOf, warm.surfaces, warm.before, warm.apply);
      const times: number[] = [];
      for (let i = 0; i < 5; i++) {
        const w = lampField(2000);
        const start = performance.now();
        settleChain(w.d, shapeOf, w.surfaces, w.before, w.apply);
        times.push(performance.now() - start);
      }
      times.sort((x, y) => x - y);
      expect(times[2]!).toBeLessThan(50);
    },
  );
});

describe('regionOf (P2-43 task 6 review round 1, IMPORTANT 2)', () => {
  const d = doc([at('t', 'table', 0, 0, 0)]);

  it('a new style changes every shape, so it reaches everything (P2-43 final review)', () => {
    expect(regionOf({ type: 'set_style', params: { base: 'voxel' } } as CommandPayload, d, shapeOf)).toBe(
      'all',
    );
  });

  it('transform_item covers both the old and the new box', () => {
    const region = regionOf(
      { type: 'transform_item', params: { instanceId: 't', position: [10, 0, 10] } },
      d,
      shapeOf,
    );
    expect(Array.isArray(region)).toBe(true);
    const rects = region as [number, number, number, number][];
    expect(rects).toHaveLength(2);
    // The old box is around the origin; the new one is around (10, 10).
    expect(rects[0]![0]).toBeLessThan(2);
    expect(rects[1]![0]).toBeGreaterThan(8);
  });

  it('remove_water reads the removed body from the document before it is gone', () => {
    const withWater = doc([]);
    withWater.environment.water.push({
      id: 'w',
      kind: 'lake',
      area: [
        [0, 0],
        [4, 0],
        [4, 4],
        [0, 4],
      ],
      level: 0,
      params: {},
    });
    const region = regionOf({ type: 'remove_water', params: { waterId: 'w' } }, withWater, shapeOf);
    expect(region).not.toEqual([]);
    expect(region).not.toBe('all');
  });

  it('edit_river unions the old and new shape', () => {
    const withRiver = doc([]);
    withRiver.environment.rivers.push({
      id: 'r',
      points: [
        [0, 0],
        [10, 0],
      ],
      width: 6,
      widen: 1.3,
      flow: 1.5,
      params: {},
    });
    const region = regionOf(
      {
        type: 'edit_river',
        params: {
          riverId: 'r',
          points: [
            [100, 100],
            [110, 100],
          ],
        },
      },
      withRiver,
      shapeOf,
    ) as [number, number, number, number][];
    // A single rect covering both the old points (near 0) and the new ones (near 100).
    expect(region[0]![0]).toBeLessThanOrEqual(0);
    expect(region[0]![2]).toBeGreaterThanOrEqual(100);
  });

  it('revert_terrain and restore_terrain are undo/redo payloads: no region (the chain never runs on undo/redo)', () => {
    expect(regionOf({ type: 'revert_terrain', params: { edits: [] } }, d, shapeOf)).toEqual([]);
    expect(regionOf({ type: 'restore_terrain', params: { chunks: ['x'] } }, d, shapeOf)).toEqual([]);
  });
});

describe('refreshesLayers (P2-43 final review, I6)', () => {
  const sculpt: CommandPayload = {
    type: 'sculpt_terrain',
    params: {
      area: [
        [0, 0],
        [1, 0],
        [1, 1],
      ],
      operation: 'raise',
      strength: 1,
    },
  };

  it('asks for new floors, decks and water after a sculpt only where walls, roads or rivers are', () => {
    const plain = doc([]);
    expect(refreshesLayers(sculpt, plain)).toBe(false);
    const withRoad = {
      ...plain,
      roads: [{ id: 'r', points: [[0, 0] as [number, number], [10, 0] as [number, number]], width: 4 }],
    } as unknown as typeof plain;
    expect(refreshesLayers(sculpt, withRoad)).toBe(true);
    expect(refreshesLayers({ type: 'remove_item', params: { instanceId: 'x' } }, withRoad)).toBe(false);
  });
});

describe('deferring a grade (P2-43 final review, sculpt drags)', () => {
  it('rests a graded house on the new ground but leaves its grade to the caller when asked', () => {
    const { d, surfaces, apply, applyOverride } = heightGridWorld([at('h', 'house', 0, 0, 0)], 0);
    const square: Array<[number, number]> = [
      [-2.5, -2.5],
      [2.5, -2.5],
      [2.5, 2.5],
      [-2.5, 2.5],
    ];
    const edit: CommandPayload = {
      type: 'sculpt_terrain',
      params: { area: square, operation: 'flatten', strength: 1, targetHeight: 2 },
    };
    const before = restingBefore(d, regionOf(edit, d, shapeOf), shapeOf, surfaces);
    applyOverride(square, 2);
    const deferred: string[] = [];
    const result = settleChain(d, shapeOf, surfaces, before, apply, undefined, {
      deferGrade: (id) => {
        deferred.push(id);
        return true;
      },
    });
    expect(deferred).toEqual(['h']);
    expect(result.commands.map((c) => c.type)).toEqual(['transform_item']);
    expect(d.instances[0]!.transform.position[1]).toBeCloseTo(2, 3);
  });
});
