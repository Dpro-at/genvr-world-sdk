import { Game, LEGACY_MELEE_TOOL_ID, RULE_LIMITS, WorldDocument, type ItemInstance, type Rule } from '@genvr/contracts';
import { MELEE_TOOL_ID, SPAWN_POINT_ID, ZONE_AREA_ID, ZONE_GATE_ID } from '@genvr/core-library';
import { describe, expect, it } from 'vitest';
import {
  documentEnvironment,
  PLACE_BUDGET,
  SurfaceIndex,
  validateWorld,
  type RestShape,
  type WorldEnvironment,
} from '../src/index.js';
import { testGame } from './support.js';

const doc = (instances: ItemInstance[], spawn: [number, number, number] = [50, 1, 50]) =>
  WorldDocument.parse({
    schemaVersion: 1,
    experienceId: 'x',
    version: 0,
    style: { base: 'blocky' },
    sizeTier: 'small',
    access: { mode: 'private' },
    environment: { sky: { preset: 'day' }, weather: { preset: 'clear' } },
    terrain: {},
    spawn: { position: spawn },
    instances,
  });

const item = (
  instanceId: string,
  x: number,
  y: number,
  z: number,
  extra: Partial<ItemInstance> = {},
): ItemInstance => ({
  instanceId,
  itemId: 'test.crate',
  transform: { position: [x, y, z], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
  params: {},
  ...extra,
});

/**
 * Flat ground at 0, a 1 m crate model (bottom at its origin), and support from the ground or
 * the tops of other crates (like the runtime's downward ray).
 */
function flatWorld(world: WorldDocument, options: { water?: number } = {}): WorldEnvironment {
  return {
    groundAt: () => 0,
    // A pond around the origin when `water` is given.
    waterAt: (x, z) => (Math.abs(x) < 5 && Math.abs(z) < 5 ? (options.water ?? null) : null),
    itemShape: () => ({ min: [-0.5, 0, -0.5], max: [0.5, 1, 0.5], solid: true, part: false }),
    itemTriangles: () => 12,
    supportBelow: (x, z, fromY, ignore) => {
      let best = Math.abs(x) < 5 && Math.abs(z) < 5 ? (options.water ?? 0) : 0;
      for (const other of world.instances) {
        if (other.instanceId === ignore) continue;
        const [ox, oy, oz] = other.transform.position;
        const top = oy + 1;
        if (Math.abs(x - ox) <= 0.5 && Math.abs(z - oz) <= 0.5 && top <= fromY) best = Math.max(best, top);
      }
      return best;
    },
  };
}

const check = (world: WorldDocument, options?: { water?: number }) =>
  validateWorld(world, flatWorld(world, options));

describe('trees are solid at their trunks (2026-09-29)', () => {
  // An 18 m crown over a 1 m trunk: crowns overlapping is what woods look like, and standing under
  // one is not standing inside it.
  const treeWorld = (world: WorldDocument): WorldEnvironment => ({
    ...flatWorld(world),
    itemShape: () => ({
      min: [-9, 0, -9],
      max: [9, 20, 9],
      blocks: { min: [-0.5, 0, -0.5], max: [0.5, 20, 0.5] },
      solid: true,
      part: false,
    }),
  });

  it('does not call two trees with touching crowns "inside each other"', () => {
    const world = doc([item('a', 0, 0, 0), item('b', 6, 0, 0)]);
    expect(validateWorld(world, treeWorld(world)).findings.map((f) => f.code)).toEqual([]);
  });

  it('still finds two trunks in one spot', () => {
    const world = doc([item('a', 0, 0, 0), item('b', 0.2, 0, 0)]);
    expect(validateWorld(world, treeWorld(world)).findings.map((f) => f.code)).toEqual(['overlap']);
  });

  it('does not call a door blocked by a crown, only by a trunk in front of it', () => {
    const door = { wallId: 'w', openingId: 'd', x: 20, z: 20, sill: 0, normal: [0, 1] as const, width: 1.2 };
    const doorMessages = (world: WorldDocument) =>
      validateWorld(world, { ...treeWorld(world), doors: () => [door] }).findings.map((f) => f.message);
    expect(doorMessages(doc([item('tree', 20, 0, 25)]))).toEqual([]);
    expect(doorMessages(doc([item('tree', 20, 0, 21)]))).toEqual([
      expect.stringMatching(/^A door is blocked by/),
    ]);
  });

  it('lets players start under a crown, but not inside the trunk', () => {
    const under = doc([item('a', 0, 0, 0)], [4, 1, 0]);
    expect(validateWorld(under, treeWorld(under)).findings.map((f) => f.code)).toEqual([]);
    const inside = doc([item('a', 0, 0, 0)], [0.1, 1, 0]);
    expect(validateWorld(inside, treeWorld(inside)).findings.map((f) => f.code)).toEqual(['spawn-blocked']);
  });
});

describe('world validator (P2-12)', () => {
  it('finds nothing in a tidy place', () => {
    const world = doc([item('a', 0, 0, 0), item('b', 0, 1, 0), item('c', 3, 0, 0)]);
    expect(check(world).findings).toEqual([]);
    expect(check(world).stats).toEqual({ items: 3, triangles: 36 });
  });

  it('settles floating items onto what is under them, as one fix each', () => {
    const world = doc([item('base', 0, 0, 0), item('high', 0, 2.5, 0), item('air', 5, 3, 5)]);
    const { findings } = check(world);
    expect(findings.map((f) => [f.code, f.instanceIds[0]])).toEqual([
      ['floating', 'high'],
      ['floating', 'air'],
    ]);
    // "high" rests on the crate below (top at 1); "air" drops to the ground.
    expect(findings[0]!.fix).toEqual([
      { type: 'transform_item', params: { instanceId: 'high', position: [0, 1, 0] } },
    ]);
    expect(findings[1]!.fix).toEqual([
      { type: 'transform_item', params: { instanceId: 'air', position: [5, 0, 5] } },
    ]);
    // A small gap (a crate resting a little high) is fine.
    expect(check(doc([item('a', 0, 0.2, 0)])).findings).toEqual([]);
  });

  it('leaves items that are meant to float in the air (P2-11)', () => {
    expect(check(doc([item('balloon', 0, 5, 0, { floats: true })])).findings).toEqual([]);
    // An item type that floats can still be told to rest.
    const world = doc([item('cloud', 0, 5, 0), item('rested', 3, 5, 3, { floats: false })]);
    const env = flatWorld(world);
    const shape = env.itemShape('test.crate')!;
    const floaty = { ...env, itemShape: () => ({ ...shape, floats: true }) };
    expect(validateWorld(world, floaty).findings.map((f) => f.instanceIds)).toEqual([['rested']]);
  });

  it('raises buried items and lets items float on water', () => {
    const buried = check(doc([item('deep', 0, -2, 0)])).findings;
    expect(buried.map((f) => f.code)).toEqual(['buried']);
    expect(buried[0]!.fix![0]).toMatchObject({ params: { position: [0, 0, 0] } });
    expect(check(doc([item('boat', 0, 2, 0)]), { water: 2 }).findings).toEqual([]);
  });

  it('reports a thing left under water without pretending to know where it should go', () => {
    // Giving a place a starter world (P2-40) can put a lake where a bench stood. The ground was
    // not overwritten and the item has not moved, so it is neither buried nor floating.
    const drowned = check(doc([item('bench', 0, 0, 0)]), { water: 2 }).findings;
    expect(drowned.map((f) => f.code)).toEqual(['drowned']);
    expect(drowned[0]!.message).toContain('1 m under the water');
    // No fix: where it should go instead is the creator's to decide, and a thing meant to be under
    // water is a fair thing to build.
    expect(drowned[0]!.fix).toBeNull();
    expect(drowned[0]!.level).toBe('info');
    // A thing standing clear of the surface is not drowned.
    expect(check(doc([item('post', 0, 1.5, 0)]), { water: 2 }).findings).toEqual([]);
  });

  it('does not call sea life drowned: it belongs under water (ITEMS-close-01)', () => {
    const clam = item('clam', 0, 0, 0, { itemId: 'genvr.core.tidewater.giant-clam' });
    const codes = check(doc([clam]), { water: 2 }).findings.map((f) => f.code);
    expect(codes).not.toContain('drowned');
  });

  it('reports solid items inside each other, but not grouped items', () => {
    const inside = check(doc([item('a', 0, 0, 0), item('b', 0.2, 0, 0.1)])).findings;
    expect(inside.map((f) => [f.code, f.instanceIds])).toEqual([['overlap', ['a', 'b']]]);
    expect(inside[0]!.fix).toBeNull();
    const grouped = doc([item('a', 0, 0, 0, { groupId: 'g' }), item('b', 0.2, 0, 0.1, { groupId: 'g' })]);
    expect(check(grouped).findings).toEqual([]);
    // Touching side by side is not inside each other.
    expect(check(doc([item('a', 0, 0, 0), item('b', 1, 0, 0)])).findings).toEqual([]);
  });

  it('warns when players start inside an item or in deep water', () => {
    const blocked = check(doc([item('wall', 50, 0, 50)], [50, 1, 50])).findings;
    expect(blocked.map((f) => f.code)).toEqual(['spawn-blocked']);
    expect(check(doc([], [0, 1, 0]), { water: 2 }).findings.map((f) => f.code)).toEqual(['spawn-water']);
  });

  it('warns when players start inside a building', () => {
    const house = { id: 'h', points: [[40, 40], [60, 40], [60, 60], [40, 60]], height: 6, closed: true };
    const inside = check(WorldDocument.parse({ ...doc([], [50, 1, 50]), walls: [house] })).findings;
    expect(inside.map((f) => f.code)).toEqual(['spawn-blocked']);
    expect(check(WorldDocument.parse({ ...doc([], [70, 1, 70]), walls: [house] })).findings).toEqual([]);
  });

  it('warns when the place is over the phone budget, listing a limited number of findings', () => {
    const many = Array.from({ length: PLACE_BUDGET.items + 1 }, (_, i) =>
      item(`i${i}`, (i % 60) * 1.5, 3, Math.floor(i / 60) * 1.5),
    );
    const { findings } = check(doc(many, [-50, 1, -50]));
    const codes = findings.map((f) => f.code);
    expect(codes.filter((code) => code === 'floating')).toHaveLength(51); // 50 listed + "more"
    expect(findings.find((f) => f.id === 'more:floating')?.message).toMatch(/^2951 more/);
    expect(codes).toContain('many-items');
  });

  it('reports steep ground with a smoothing fix (P2-11)', () => {
    const world = doc([]);
    const env = { ...flatWorld(world), steepCells: (max: number) => [{ x: 10, z: 20, degrees: max + 15 }] };
    const [finding] = validateWorld(world, env).findings;
    expect(finding).toMatchObject({ code: 'steep', id: 'steep:10,20' });
    expect(finding!.message).toMatch(/70° steep; the blocky style allows 55°/);
    expect(finding!.fix).toHaveLength(3);
    expect(finding!.fix![0]).toMatchObject({ type: 'sculpt_terrain', params: { operation: 'smooth' } });
  });

  it('checks that doors open onto walkable space (P2-11)', () => {
    const door = { wallId: 'w', openingId: 'd', x: 20, z: 20, sill: 0, normal: [0, 1] as const, width: 1.2 };
    const codes = (world: WorldDocument, extra: Partial<WorldEnvironment>) =>
      validateWorld(world, { ...flatWorld(world), doors: () => [door], ...extra }).findings.map(
        (f) => f.message,
      );
    expect(codes(doc([]), {})).toEqual([]);
    // A crate right in front of the door.
    expect(codes(doc([item('box', 20, 0, 21)]), {})).toEqual(['A door is blocked by crate.']);
    // A door high up on the wall, above a drop.
    expect(codes(doc([]), { doors: () => [{ ...door, sill: 3 }] })).toEqual([
      'A door opens onto a drop of 3 m.',
    ]);
    // Ground piled up on one side.
    expect(codes(doc([]), { groundAt: (_x, z) => (z > 20.5 ? 2 : 0) })).toEqual([
      'A door opens into the ground.',
    ]);
  });
});

const docWith = doc;
const at = (
  instanceId: string,
  itemId: string,
  x: number,
  y: number,
  z: number,
  extra: Partial<ItemInstance> = {},
): ItemInstance => ({
  instanceId,
  itemId,
  transform: { position: [x, y, z], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
  params: {},
  ...extra,
});

/** Rest shapes for the rest-law tests: a tiltable rock and an upright tree with a narrow trunk base. */
const REST_SHAPES: Record<string, RestShape> = {
  rock: { min: [-0.5, 0, -0.5], max: [0.5, 0.6, 0.5], rule: { mode: 'tilt' } },
  tree: {
    min: [-0.6, 0, -0.6],
    max: [0.6, 3, 0.6],
    rule: { mode: 'upright', sink: 0.3, base: { min: [-0.15, -0.15], max: [0.15, 0.15] } },
  },
  /** A Core-library rock: tilts and sinks 0.1 m (rest-rules.ts). */
  boulder: { min: [-0.5, 0, -0.5], max: [0.5, 0.6, 0.5], rule: { mode: 'tilt', sink: 0.1 } },
  /** An oak with the widest trunk base the Core rule gives (0.3 m half-width). */
  oak: {
    min: [-3, 0, -3],
    max: [3, 8, 3],
    rule: { mode: 'upright', sink: 0.3, base: { min: [-0.3, -0.3], max: [0.3, 0.3] } },
  },
  crate: { min: [-0.5, 0, -0.5], max: [0.5, 1, 0.5], rule: { mode: 'upright', sink: 0.05 } },
  /** Zone items are wide markers that rest upright (a gate 12 m, an area 4 m square). */
  [ZONE_GATE_ID]: { min: [-6, 0, -0.5], max: [6, 4, 0.5], rule: { mode: 'upright' } },
  [ZONE_AREA_ID]: { min: [-2, 0, -2], max: [2, 0.2, 2], rule: { mode: 'upright' } },
};

function envWithRest(options: {
  groundAt: (x: number, z: number) => number;
  scattered?: () => ItemInstance[];
  surfaces?: () => SurfaceIndex;
}): WorldEnvironment {
  return {
    groundAt: options.groundAt,
    waterAt: () => null,
    itemShape: (itemId) => {
      const shape = REST_SHAPES[itemId];
      return shape
        ? {
            min: shape.min as [number, number, number],
            max: shape.max as [number, number, number],
            solid: true,
            part: false,
          }
        : { min: [-0.5, 0, -0.5], max: [0.5, 1, 0.5], solid: true, part: false };
    },
    itemTriangles: () => 12,
    supportBelow: (x, z) => options.groundAt(x, z),
    restShape: (itemId) => REST_SHAPES[itemId] ?? null,
    ...(options.scattered ? { scattered: options.scattered } : {}),
    ...(options.surfaces ? { surfaces: options.surfaces } : {}),
  };
}

describe('rest law findings (P2-43)', () => {
  it('reports floating by the law and fixes it by resting, including tilt', () => {
    const report = validateWorld(
      docWith([at('r', 'rock', 5, 3, 0)]),
      envWithRest({ groundAt: (x) => x * 0.2 }),
    );
    const finding = report.findings.find((f) => f.code === 'floating')!;
    expect(finding.fix).toEqual([
      {
        type: 'transform_item',
        params: { instanceId: 'r', position: expect.any(Array), rotation: expect.any(Array), rest: true },
      },
    ]);
  });

  it('allows a tree its sink without calling it buried', () => {
    const report = validateWorld(docWith([at('t', 'tree', 0, -0.2, 0)]), envWithRest({ groundAt: () => 0 }));
    expect(report.findings.filter((f) => f.code === 'buried')).toEqual([]);
  });

  it('reports a tree on a slope steeper than its mode allows', () => {
    const report = validateWorld(
      docWith([at('t', 'tree', 10, 20, 0)]),
      envWithRest({ groundAt: (x) => x * 2 }),
    );
    expect(report.findings.some((f) => f.code === 'slope')).toBe(true);
  });

  it('does not raise slope for map markers (zone items) on steep ground', () => {
    const env = envWithRest({ groundAt: (x) => x * 2 });
    const report = validateWorld(
      docWith([
        at('c', ZONE_GATE_ID, 10, 20, 0, { params: { zoneTag: 'north' } }),
        at('f', ZONE_AREA_ID, 12, 24, 0, { params: { zoneTag: 'south' } }),
        at('t', 'tree', 10, 20, 5),
      ]),
      env,
    );
    const slopes = report.findings.filter((f) => f.code === 'slope').flatMap((f) => f.instanceIds);
    expect(slopes).toEqual(['t']);
  });

  it('reports scattered things in the air, which are not in the document', () => {
    const env = envWithRest({ groundAt: () => 0, scattered: () => [at('s1', 'tree', 3, 1, 3)] });
    const finding = validateWorld(docWith([]), env).findings.find((f) =>
      f.id.startsWith('floating:scatter'),
    )!;
    expect(finding.message).toContain('1');
    expect(finding.fix).toBeNull();
  });
});

describe('the checks ask the same surfaces as the law (P2-43 final review, C1)', () => {
  // A bridge deck at 2 m over water at 1 m, over a lake bed at 0.
  const deck = {
    points: [
      [-5, -5],
      [5, -5],
      [5, 5],
      [-5, 5],
    ] as Array<[number, number]>,
    level: 2,
  };
  const crateShape = () => ({
    min: [-0.5, 0, -0.5] as [number, number, number],
    max: [0.5, 1, 0.5] as [number, number, number],
    solid: true,
    part: false,
  });

  it('does not call a crate on a bridge deck floating (studio: the rest law surface index)', () => {
    const world = docWith([at('c', 'crate', 0, 2, 0)]);
    const index = new SurfaceIndex(world, {
      groundAt: () => 0,
      waterAt: () => 1,
      itemShape: crateShape,
      decks: [deck],
    });
    const env = envWithRest({ groundAt: () => 0, surfaces: () => index });
    const report = validateWorld(world, env);
    expect(report.findings.filter((f) => f.code === 'floating' || f.code === 'buried')).toEqual([]);
  });

  it('does not call a crate on a bridge deck floating (server: the document environment)', () => {
    const world = docWith([at('c', 'crate', 0, 2, 0)]);
    const env = documentEnvironment(world, {
      groundAt: () => 0,
      waterAt: () => 1,
      itemShape: crateShape,
      decks: [deck],
      restShape: (itemId) => REST_SHAPES[itemId] ?? null,
    });
    const report = validateWorld(world, env);
    expect(report.findings.filter((f) => f.code === 'floating' || f.code === 'buried')).toEqual([]);
  });
});

describe('the scattered alarm fires only for real floating (P2-43 final review, I3)', () => {
  const alarm = (env: WorldEnvironment) =>
    validateWorld(docWith([]), env).findings.find((f) => f.id === 'floating:scatter');
  const slope17 = Math.tan((17 * Math.PI) / 180);

  it('stays quiet for a rock scattered on flat ground at the ground height', () => {
    const env = envWithRest({ groundAt: () => 0, scattered: () => [at('s1', 'boulder', 3, 0, 3)] });
    expect(alarm(env)).toBeUndefined();
  });

  it('stays quiet for oaks scattered on a 17 degree slope at the ground under their middle', () => {
    const groundAt = (x: number) => x * slope17;
    const oaks = [0, 10, 20, 30].map((x, i) => at(`o${i}`, 'oak', x, groundAt(x), 0));
    expect(alarm(envWithRest({ groundAt, scattered: () => oaks }))).toBeUndefined();
  });

  it('fires for one thing lifted a metre into the air', () => {
    const groundAt = (x: number) => x * slope17;
    const things = [at('o0', 'oak', 0, 0, 0), at('o1', 'oak', 10, groundAt(10) + 1, 0)];
    const finding = alarm(envWithRest({ groundAt, scattered: () => things }))!;
    expect(finding.message).toContain('1 scattered');
  });
});

describe('game checks (P9-12)', () => {
  const spawnPoint = (instanceId: string, x: number, team?: string) =>
    item(instanceId, x, 0, 0, { itemId: SPAWN_POINT_ID, params: team ? { team } : {} });
  const twoTeams = { ...testGame(), teams: { mode: 'two' as const, friendlyFire: false } };

  it('reports a game with no spawn point, with a fix that places one at the place spawn', () => {
    const world = { ...doc([]), game: testGame() };
    const finding = check(world).findings.find((f) => f.code === 'game-no-spawn');
    // The room falls back to the place's start point: the match does not need one to start.
    expect(finding?.message).toContain('choose where players start and come back');
    expect(finding?.message).not.toContain('to start the match');
    expect(finding?.fix?.[0]).toMatchObject({
      type: 'place_item',
      params: { itemId: SPAWN_POINT_ID, position: [50, 1, 50], rest: true },
    });
    expect(finding?.fix).toHaveLength(1);
  });

  it('reports a team with no spawn point when teams are on, with a fix beside the place spawn', () => {
    const world = { ...doc([spawnPoint('s1', 0, 'red')]), game: twoTeams };
    const findings = check(world).findings.filter((f) => f.code === 'game-team-no-spawn');
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toContain('blue');
    expect(findings[0]!.fix).toEqual([
      {
        type: 'place_item',
        params: expect.objectContaining({
          itemId: SPAWN_POINT_ID,
          position: [54, 1, 50],
          itemParams: { team: 'blue' },
          rest: true,
        }),
      },
    ]);
  });

  it('counts a spawn point for any team as serving both teams', () => {
    const world = { ...doc([spawnPoint('s1', 0)]), game: twoTeams };
    expect(check(world).findings.some((f) => f.code.startsWith('game-'))).toBe(false);
  });

  it('asks for one spawn point, not per team, when teams are off', () => {
    const world = { ...doc([spawnPoint('s1', 0, 'red')]), game: testGame() };
    expect(check(world).findings.some((f) => f.code.startsWith('game-'))).toBe(false);
  });

  it('reports only the missing spawn when a two-team game has no spawn point at all', () => {
    const world = { ...doc([]), game: twoTeams };
    const codes = check(world).findings.map((f) => f.code);
    expect(codes.filter((c) => c === 'game-no-spawn')).toHaveLength(1);
    expect(codes.filter((c) => c === 'game-team-no-spawn')).toHaveLength(0);
  });

  it('reports a loadout item that is not a tool, with a fix that keeps only the tools', () => {
    const game = { ...testGame(), loadout: { items: [SPAWN_POINT_ID, MELEE_TOOL_ID, 'nope.item'] } };
    const world = { ...doc([spawnPoint('s1', 0)]), game };
    const findings = check(world).findings.filter((f) => f.code === 'game-loadout-not-tool');
    expect(findings.map((f) => f.id)).toEqual([
      `game-loadout-not-tool:${SPAWN_POINT_ID}`,
      'game-loadout-not-tool:nope.item',
    ]);
    expect(findings[0]!.message).toContain('Spawn Point');
    expect(findings[0]!.fix).toEqual([
      { type: 'set_game', params: { game: { ...game, loadout: { items: [MELEE_TOOL_ID] } } } },
    ]);
    const fine = { ...doc([spawnPoint('s1', 0)]), game: { ...testGame(), loadout: { items: [MELEE_TOOL_ID] } } };
    expect(check(fine).findings.some((f) => f.code === 'game-loadout-not-tool')).toBe(false);
  });

  it('finds nothing wrong with a stored loadout that holds the old Sword id: it is read as the Melee tool', () => {
    const stored = WorldDocument.parse({
      ...doc([spawnPoint('s1', 0)]),
      game: { ...testGame(), loadout: { items: [LEGACY_MELEE_TOOL_ID] } },
    });
    expect(stored.game?.loadout?.items).toEqual([MELEE_TOOL_ID]);
    expect(check(stored).findings.some((f) => f.code === 'game-loadout-not-tool')).toBe(false);
  });

  it('says nothing about spawns in a place without a game', () => {
    expect(check(doc([])).findings.some((f) => f.code.startsWith('game-'))).toBe(false);
  });
});

describe('generic rules checks (P9-12 generic rules, Task 8)', () => {
  const spawn = item('s1', 0, 0, 0, { itemId: SPAWN_POINT_ID });
  const zoneItem = (instanceId: string, x: number, tag: string) =>
    item(instanceId, x, 0, 40, { itemId: ZONE_AREA_ID, params: { zoneTag: tag } });
  const withRules = (extra: Partial<Game>, instances: ItemInstance[] = []) => ({
    ...doc([spawn, ...instances]),
    game: { ...testGame(), ...extra } as Game,
  });
  const found = (world: WorldDocument, code: string) => check(world).findings.filter((f) => f.code === code);
  const rule = (when: Rule['when'], actions: Rule['do'], conditions: Rule['if'] = []): Rule => ({
    when,
    if: conditions,
    do: actions,
  });

  it('reports each counter the rules, ranking or displays name but nobody declared, with a fix that declares it', () => {
    const world = withRules({
      counters: [{ name: 'declared', scope: 'team', start: 0 }],
      rules: [
        rule({ event: 'player_joined' }, [
          { kind: 'add_counter', name: 'points', by: 1, who: 'actor' },
          { kind: 'set_counter', name: 'declared', to: 0, who: 'actor' },
        ]),
        rule({ event: 'counter_changed', counter: 'watched' }, [{ kind: 'show_message', text: 'hi', who: 'actor' }], [
          { kind: 'counter', name: 'points', op: '>=', value: { counter: 'limit' } },
        ]),
        rule({ event: 'hit' }, [{ kind: 'end_match', winner: { byCounter: 'best', order: 'low' } }]),
      ],
      ranking: { by: 'points', order: 'high', then: 'second' },
      hud: [{ kind: 'counter', label: 'Shown', counter: 'shown' }],
    });
    const findings = found(world, 'game-counter-undeclared');
    expect(findings.map((f) => f.id)).toEqual([
      'game-counter-undeclared:points',
      'game-counter-undeclared:watched',
      'game-counter-undeclared:limit',
      'game-counter-undeclared:best',
      'game-counter-undeclared:second',
      'game-counter-undeclared:shown',
    ]);
    expect(findings[0]!.level).toBe('warning');
    expect(findings[0]!.message).toContain('"points"');
    // One fix declares every missing counter: each fix is made from the same game, so separate
    // ones applied together ("Fix all") would each undo the one before.
    const fix = findings[0]!.fix!;
    expect(fix).toHaveLength(1);
    expect(fix[0]).toMatchObject({ type: 'set_game' });
    const fixed = (fix[0]!.params as { game: Game }).game;
    expect(fixed.counters).toEqual([
      { name: 'declared', scope: 'team', start: 0 },
      ...['points', 'watched', 'limit', 'best', 'second', 'shown'].map((name) => ({
        name,
        scope: 'player',
        start: 0,
      })),
    ]);
    expect(Game.safeParse(fixed).success).toBe(true);
    expect(findings.slice(1).map((f) => f.fix)).toEqual([null, null, null, null, null]);
    expect(findings[0]!.message).toContain('The fix declares all 6');
  });

  it('"Fix all" of the rules findings leaves no counter undeclared', () => {
    const world = withRules({
      rules: [
        rule({ event: 'hit' }, [
          { kind: 'add_counter', name: 'a', by: 1, who: 'actor' },
          { kind: 'add_counter', name: 'b', by: 1, who: 'actor' },
        ]),
      ],
    });
    // As the console's Fix all: every fixable finding's commands, in order, from the same report.
    const commands = check(world).findings.flatMap((f) => f.fix ?? []);
    let fixed = world;
    for (const command of commands)
      if (command.type === 'set_game') fixed = { ...fixed, game: (command.params as { game: Game }).game };
    expect(found(fixed, 'game-counter-undeclared')).toEqual([]);
  });

  it('"Fix all" with a loadout fix and a counter fix applies both (the game fixes compose)', () => {
    const world = withRules({
      loadout: { items: [SPAWN_POINT_ID, MELEE_TOOL_ID] },
      rules: [rule({ event: 'hit' }, [{ kind: 'add_counter', name: 'a', by: 1, who: 'actor' }])],
    });
    const findings = check(world).findings;
    expect(findings.some((f) => f.code === 'game-loadout-not-tool')).toBe(true);
    expect(findings.some((f) => f.code === 'game-counter-undeclared')).toBe(true);
    // As the console's Fix all: every fixable finding's commands, in order, from the same report.
    const commands = findings.flatMap((f) => f.fix ?? []);
    let fixed = world;
    for (const command of commands)
      if (command.type === 'set_game') fixed = { ...fixed, game: (command.params as { game: Game }).game };
    expect(found(fixed, 'game-loadout-not-tool')).toEqual([]);
    expect(found(fixed, 'game-counter-undeclared')).toEqual([]);
    // In the other order too: whichever whole-game fix runs last keeps the other's repair.
    let reversed = world;
    for (const command of [...commands].reverse())
      if (command.type === 'set_game') reversed = { ...reversed, game: (command.params as { game: Game }).game };
    expect(reversed.game).toEqual(fixed.game);
    expect(Game.safeParse(fixed.game).success).toBe(true);
  });

  it('gives no fix when the game already has the most counters it may have', () => {
    const counters = Array.from({ length: RULE_LIMITS.counters }, (_, i) => ({
      name: `c${i}`,
      scope: 'player' as const,
      start: 0,
    }));
    const world = withRules({
      counters,
      rules: [rule({ event: 'hit' }, [{ kind: 'add_counter', name: 'extra', by: 1, who: 'actor' }])],
    });
    const [finding] = found(world, 'game-counter-undeclared');
    expect(finding?.fix).toBeNull();
  });

  it('reports a zone tag the rules listen to or teleport to that no zone in the place has', () => {
    const world = withRules(
      {
        rules: [
          rule({ event: 'zone_entered', tag: 'north' }, [{ kind: 'teleport_to_zone', tag: 'south', who: 'actor' }]),
          rule({ event: 'zone_crossed', tag: 'west' }, [{ kind: 'add_score', by: 1, who: 'actor' }]),
        ],
      },
      [
        zoneItem('z1', 0, 'north'),
        // Any item can be a zone through its params.
        item('z2', 20, 0, 40, { params: { zone: 'gate', zoneTag: 'west' } }),
      ],
    );
    const findings = found(world, 'game-zone-tag-missing');
    expect(findings.map((f) => f.id)).toEqual(['game-zone-tag-missing:south']);
    expect(findings[0]!.level).toBe('warning');
    expect(findings[0]!.message).toContain('"south"');
    expect(findings[0]!.fix).toBeNull();
  });

  it('does not report the tags a stored race read as rules is written for but the place does not have', () => {
    // A world stored before the generic rules: a race over two old checkpoints and a finish line.
    // Its rules are written for checkpoints 1..16 and finish lines after 0..16 (the rules cannot
    // see the world); only the tags the place's old gates got are real.
    const gate = (instanceId: string, itemId: string, x: number, params: ItemInstance['params'] = {}) =>
      item(instanceId, x, 0, 40, { itemId, params });
    const world = WorldDocument.parse({
      ...doc([
        spawn,
        gate('c1', 'genvr.core.gameplay.checkpoint', 0, { order: 1 }),
        gate('c2', 'genvr.core.gameplay.checkpoint', 20, { order: 2 }),
        gate('f', 'genvr.core.gameplay.finish-line', 40),
      ]),
      game: {
        template: 'car_race',
        match: { minPlayers: 2, durationSec: 600, countdownSec: 5, resultsSec: 15 },
        race: { laps: 3, checkpoints: 'ordered', finish: 'all_finish', graceSec: 30 },
      },
    });
    expect(world.game?.rules?.length).toBeGreaterThan(20);
    expect(found(world, 'game-zone-tag-missing')).toEqual([]);
    expect(found(world, 'game-zone-tag-unused')).toEqual([]);
    // A tag the designer wrote is still reported beside them.
    const typo = {
      ...world,
      game: {
        ...world.game!,
        rules: [...world.game!.rules!, rule({ event: 'zone_entered', tag: 'south' }, [{ kind: 'add_score', by: 1, who: 'actor' }])],
      },
    };
    expect(found(typo, 'game-zone-tag-missing').map((f) => f.id)).toEqual(['game-zone-tag-missing:south']);
  });

  it('reports a zone whose tag no rule uses, as info, naming the zones', () => {
    const world = withRules(
      { rules: [rule({ event: 'zone_entered', tag: 'north' }, [{ kind: 'add_score', by: 1, who: 'actor' }])] },
      [zoneItem('z1', 0, 'north'), zoneItem('z2', 20, 'east'), zoneItem('z3', 40, 'east')],
    );
    const findings = found(world, 'game-zone-tag-unused');
    expect(findings.map((f) => [f.id, f.level, f.instanceIds])).toEqual([
      ['game-zone-tag-unused:east', 'info', ['z2', 'z3']],
    ]);
  });

  it('says nothing about zones in a place without a game', () => {
    const world = doc([zoneItem('z1', 0, 'east')]);
    expect(check(world).findings.some((f) => f.code.startsWith('game-'))).toBe(false);
  });

  it('notes a game that only the clock can end (no win rule, match ended only when time is up)', () => {
    const { win: _win, ...noWin } = testGame();
    const clockOnly = {
      ...doc([spawn]),
      game: { ...noWin, rules: [rule({ event: 'time_up' }, [{ kind: 'end_match', winner: 'nobody' }])] } as Game,
    };
    const findings = found(clockOnly, 'game-clock-only');
    expect(findings).toHaveLength(1);
    expect(findings[0]!.level).toBe('info');
    expect(findings[0]!.message).toContain('5 min');
    const early = {
      ...doc([spawn]),
      game: {
        ...noWin,
        rules: [rule({ event: 'died' }, [{ kind: 'end_match', winner: { player: 'actor' } }])],
      } as Game,
    };
    expect(found(early, 'game-clock-only')).toHaveLength(0);
    // The highest score winning at the end is the designer's own choice of ending.
    expect(found(withRules({}), 'game-clock-only')).toHaveLength(0);
  });

  it('reports a rule waiting for a timer when no rule starts one', () => {
    const listens = rule({ event: 'timer_fired' }, [{ kind: 'add_score', by: 1, who: 'actor' }]);
    const world = withRules({ rules: [listens] });
    const findings = found(world, 'game-timer-not-started');
    expect(findings).toHaveLength(1);
    expect(findings[0]!.level).toBe('warning');
    const started = withRules({
      rules: [listens, rule({ event: 'player_joined' }, [{ kind: 'start_timer', name: 'wait', seconds: 5 }])],
    });
    expect(found(started, 'game-timer-not-started')).toHaveLength(0);
  });

  it('reports a timer started when time is up, since the match is decided in that same moment', () => {
    const world = withRules({
      rules: [
        rule({ event: 'time_up' }, [{ kind: 'start_timer', name: 'extra', seconds: 10 }]),
        rule({ event: 'timer_fired' }, [{ kind: 'end_match', winner: 'nobody' }]),
      ],
    });
    const findings = found(world, 'game-timer-after-time-up');
    expect(findings).toHaveLength(1);
    expect(findings[0]!.level).toBe('warning');
    expect(found(world, 'game-timer-not-started')).toHaveLength(0);
  });

  it('reports a custom event a rule listens to that no rule raises', () => {
    const world = withRules({
      rules: [
        rule({ event: 'bonus' }, [{ kind: 'add_score', by: 1, who: 'actor' }]),
        rule({ event: 'raised' }, [{ kind: 'add_score', by: 1, who: 'actor' }]),
        rule({ event: 'hit' }, [{ kind: 'emit', event: 'raised' }]),
      ],
    });
    const findings = found(world, 'game-event-not-emitted');
    expect(findings.map((f) => f.id)).toEqual(['game-event-not-emitted:bonus']);
    expect(findings[0]!.message).toContain('"bonus"');
  });

  it('finds nothing in a consistent rule set', () => {
    const world = withRules(
      {
        counters: [{ name: 'points', scope: 'player', start: 0 }],
        rules: [
          rule({ event: 'zone_entered', tag: 'pad' }, [
            { kind: 'add_counter', name: 'points', by: 1, who: 'actor' },
            { kind: 'emit', event: 'scored' },
          ]),
          rule({ event: 'scored' }, [{ kind: 'start_timer', name: 'wait', seconds: 3 }]),
          rule({ event: 'timer_fired' }, [{ kind: 'teleport_to_zone', tag: 'pad', who: 'actor' }]),
        ],
        ranking: { by: 'points', order: 'high' },
        hud: [{ kind: 'counter', label: 'Points', counter: 'points' }],
      },
      [zoneItem('z1', 0, 'pad')],
    );
    expect(check(world).findings.filter((f) => f.code.startsWith('game-'))).toEqual([]);
  });
});

describe('ride checks (movement modes, Task 9)', () => {
  const rideable = (instanceId: string, x: number, y: number, z: number, params: Record<string, unknown>) =>
    item(instanceId, x, y, z, { params });
  const found = (world: WorldDocument, code: string, env: Partial<WorldEnvironment> = {}, water?: number) =>
    validateWorld(world, { ...flatWorld(world, water === undefined ? {} : { water }), ...env }).findings.filter(
      (f) => f.code === code,
    );

  it('notes rideable items in a side-view place, where riding is off', () => {
    const world = doc([rideable('r1', 20, 0, 20, { ride: 'ground' }), item('plain', 30, 0, 30)]);
    const findings = found(world, 'ride-side-view', { playView: 'side' });
    expect(findings.map((f) => [f.level, f.instanceIds])).toEqual([['info', ['r1']]]);
    expect(found(world, 'ride-side-view', { playView: 'free' })).toEqual([]);
    expect(found(world, 'ride-side-view')).toEqual([]);
  });

  it('warns about an item moving on water placed where there is no water', () => {
    const dry = doc([rideable('w1', 20, 0, 20, { ride: 'water' }), rideable('g1', 22, 0, 20, { ride: 'ground' })]);
    const findings = found(dry, 'ride-water-dry');
    expect(findings.map((f) => [f.level, f.instanceIds, f.fix])).toEqual([['warning', ['w1'], null]]);
    expect(findings[0]!.message).toContain('rideable item');
    // On the pond (surface at 2 m), within 2 m of the surface: quiet.
    const wet = doc([rideable('w1', 0, 1.8, 0, { ride: 'water' })]);
    expect(found(wet, 'ride-water-dry', {}, 2)).toEqual([]);
    // Far below the surface (a sunk item) is not on the water.
    const deep = doc([rideable('w1', 0, -3, 0, { ride: 'water' })]);
    expect(found(deep, 'ride-water-dry', {}, 2)).toHaveLength(1);
  });

  it('warns about a ride tag the rules use that no rideable item has; zone and ride tags never mix', () => {
    const rules: Rule[] = [
      { when: { event: 'mounted', tag: 'lane' }, if: [], do: [{ kind: 'add_score', by: 1, who: 'actor' }] },
      {
        when: { event: 'zone_entered', tag: 'pad' },
        if: [{ kind: 'riding', is: true, tag: 'deck' }],
        do: [{ kind: 'dismount', who: 'actor' }],
      },
      { when: { event: 'dismounted', tag: 'gone' }, if: [], do: [{ kind: 'add_score', by: 1, who: 'actor' }] },
    ];
    const instances = [
      item('s1', 0, 0, 0, { itemId: SPAWN_POINT_ID }),
      rideable('r1', 20, 0, 20, { ride: 'ground', rideTag: 'lane' }),
      // A zone tagged like the ride tags the rules use: it is no rideable item.
      item('z1', 30, 0, 30, { itemId: ZONE_AREA_ID, params: { zoneTag: 'deck' } }),
      item('z2', 30, 0, 40, { itemId: ZONE_AREA_ID, params: { zoneTag: 'pad' } }),
    ];
    const world = { ...doc(instances), game: { ...testGame(), rules } as Game };
    expect(found(world, 'ride-tag-unused').map((f) => [f.id, f.level])).toEqual([
      ['ride-tag-unused:deck', 'warning'],
      ['ride-tag-unused:gone', 'warning'],
    ]);
    // Ride tags are not zone tags: the zone "deck" is still unused by the rules, "lane" is no missing zone.
    expect(found(world, 'game-zone-tag-unused').map((f) => f.id)).toEqual(['game-zone-tag-unused:deck']);
    expect(found(world, 'game-zone-tag-missing')).toEqual([]);
    const all = {
      ...world,
      instances: [
        ...instances,
        rideable('r2', 22, 0, 20, { ride: 'air', rideTag: 'deck' }),
        rideable('r3', 24, 0, 20, { ride: 'air', rideTag: 'gone' }),
      ],
    };
    expect(found(all, 'ride-tag-unused')).toEqual([]);
  });

  it('warns above 32 rideable items (phones)', () => {
    const many = (n: number) =>
      doc(Array.from({ length: n }, (_, i) => rideable(`r${i}`, 20 + i * 2, 0, 20, { ride: 'ground' })));
    expect(found(many(32), 'ride-many')).toEqual([]);
    const findings = found(many(33), 'ride-many');
    expect(findings.map((f) => [f.level, f.fix])).toEqual([['warning', null]]);
    expect(findings[0]!.message).toContain('33 rideable items');
  });

  it('notes more seats than the place has players', () => {
    // A small place holds 30 players; 4 items of 8 seats are 32.
    const world = doc(
      Array.from({ length: 4 }, (_, i) => rideable(`r${i}`, 20 + i * 3, 0, 20, { ride: 'ground', rideSeats: 8 })),
    );
    const findings = found(world, 'ride-seats-vs-players');
    expect(findings.map((f) => [f.level, f.fix])).toEqual([['info', null]]);
    expect(findings[0]!.message).toContain('32 seats');
    expect(found(world, 'ride-seats-vs-players', { maxPlayers: 50 })).toEqual([]);
    const few = doc([rideable('r1', 20, 0, 20, { ride: 'ground', rideSeats: 8 })]);
    expect(found(few, 'ride-seats-vs-players')).toEqual([]);
  });
});
