import { WorldDocument, type ItemInstance } from '@genvr/contracts';
import { describe, expect, it } from 'vitest';
import { validateWorld, type WallBlock, type WorldEnvironment } from '../src/index.js';

const doc = (instances: ItemInstance[], spawn: [number, number, number] = [0, 0, 0]) =>
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

const item = (instanceId: string, itemId: string, x: number, y: number, z: number): ItemInstance => ({
  instanceId,
  itemId,
  transform: { position: [x, y, z], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
  params: {},
});

/** A wall block from a to b on the ground plane (3 m high, 0.3 m thick), like `wallBoxes`. */
function block(a: [number, number], b: [number, number]): WallBlock {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const [dx, dz] = [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
  return {
    center: [(a[0] + b[0]) / 2, 1.25, (a[1] + b[1]) / 2],
    half: [length / 2 + 0.15, 1.75, 0.15],
    yaw: Math.atan2(-dz, dx),
  };
}

/** A square room from (10, 10) to (16, 16); with a door, a 1.2 m gap in the south wall. */
function room(door: boolean): WallBlock[] {
  const south = door
    ? [block([10, 10], [12.4, 10]), block([13.6, 10], [16, 10])]
    : [block([10, 10], [16, 10])];
  return [...south, block([16, 10], [16, 16]), block([16, 16], [10, 16]), block([10, 16], [10, 10])];
}

/**
 * Flat ground (or `groundAt`), 1 m crates and benches (a bench needs 0.8 m in front), walls, and
 * support from the ground or the tops of crates.
 */
function world(
  place: WorldDocument,
  extra: Partial<WorldEnvironment> & { walls?: WallBlock[] } = {},
): WorldEnvironment {
  const groundAt = extra.groundAt ?? (() => 0);
  return {
    groundAt,
    itemShape: () => ({ min: [-0.5, 0, -0.5], max: [0.5, 1, 0.5], solid: true, part: false }),
    itemRules: (itemId) => (itemId === 'test.bench' ? { clearFront: 0.8 } : null),
    supportBelow: (x, z, fromY, ignore) => {
      let best = Math.max(groundAt(x, z), extra.waterAt?.(x, z) ?? -Infinity);
      for (const other of place.instances) {
        if (other.instanceId === ignore) continue;
        const [ox, oy, oz] = other.transform.position;
        if (Math.abs(x - ox) <= 0.5 && Math.abs(z - oz) <= 0.5 && oy + 1 <= fromY)
          best = Math.max(best, oy + 1);
      }
      return best;
    },
    wallBoxes: () => extra.walls ?? [],
    ...extra,
  };
}

const findings = (place: WorldDocument, extra?: Parameters<typeof world>[1]) =>
  validateWorld(place, world(place, extra)).findings.filter((f) => f.code === 'unreachable');

describe('reachability from the start point (P2-11)', () => {
  it('finds nothing in an open place', () => {
    const place = doc([item('bench', 'test.bench', 5, 0, 5), item('crate', 'test.crate', 8, 0, 2)]);
    expect(findings(place)).toEqual([]);
  });

  it('reports a room without a door and the bench inside it', () => {
    const place = doc([item('bench', 'test.bench', 13, 0, 13)]);
    const found = findings(place, { walls: room(false) });
    expect(found.map((f) => f.id)).toEqual([
      'unreachable:bench',
      expect.stringMatching(/^unreachable-area:/),
    ]);
    expect(found[0]!.message).toBe('Players cannot get to bench from the start point.');
    expect(found[1]!.message).toMatch(/^An area of about \d+ m² near \(13, 13\) cannot be reached/);
    // The debug view draws the closed-in area.
    const { min, max } = found[1]!.area!;
    expect(min[0]).toBeGreaterThan(9.9);
    expect(max[0]).toBeLessThan(16.1);
    // With a door players walk in.
    expect(findings(place, { walls: room(true) })).toEqual([]);
  });

  it('still runs when players start under a tree, whose crown is not a wall (2026-09-29)', () => {
    // An 18 m crown over the start point. Measured as solid, the start was "covered" and the whole
    // check returned nothing, so a room without a door went unreported in most new worlds.
    const tree = {
      min: [-9, 0, -9],
      max: [9, 20, 9],
      blocks: { min: [-0.5, 0, -0.5], max: [0.5, 20, 0.5] },
      solid: true,
      part: false,
    } as const;
    const crate = { min: [-0.5, 0, -0.5], max: [0.5, 1, 0.5], solid: true, part: false } as const;
    const itemShape = (itemId: string) => (itemId === 'test.tree' ? tree : crate);
    const place = doc([item('tree', 'test.tree', 3, 0, 0), item('bench', 'test.bench', 13, 0, 13)]);
    expect(findings(place, { walls: room(false), itemShape }).map((f) => f.id)).toEqual([
      'unreachable:bench',
      expect.stringMatching(/^unreachable-area:/),
    ]);
    // With a door, everything is reached again.
    expect(findings(place, { walls: room(true), itemShape })).toEqual([]);
  });

  it('climbs items up to a jump, and ground only as steep as players walk', () => {
    // A 1.8 m high block of ground (a cliff all around) with a bench on top.
    const cliff = (x: number, z: number) => (x > 10 && x < 20 && z > 10 && z < 20 ? 1.8 : 0);
    const bench = item('bench', 'test.bench', 15, 1.8, 15);
    expect(findings(doc([bench]), { groundAt: cliff }).map((f) => f.id)).toEqual([
      'unreachable:bench',
      expect.stringMatching(/^unreachable-area:/),
    ]);
    // A crate at its foot is a step: onto the crate (1 m), then up to the top (0.8 m).
    expect(findings(doc([bench, item('step', 'test.crate', 9.5, 0, 15)]), { groundAt: cliff })).toEqual([]);
  });

  it('climbs ladders up to their top (P2-23)', () => {
    // A 3 m high block of ground: too high for a jump, even from a crate.
    const cliff = (x: number, z: number) => (x > 10 && x < 20 && z > 10 && z < 20 ? 3 : 0);
    const bench = item('bench', 'test.bench', 15, 3, 15);
    const crate = { min: [-0.5, 0, -0.5], max: [0.5, 1, 0.5], solid: true, part: false } as const;
    const ladder = {
      min: [-0.3, 0, -0.05],
      max: [0.3, 3, 0.05],
      solid: false,
      part: false,
      climbable: true,
    } as const;
    const itemShape = (itemId: string) => (itemId === 'test.ladder' ? ladder : crate);
    expect(findings(doc([bench]), { groundAt: cliff, itemShape }).map((f) => f.id)).toEqual([
      'unreachable:bench',
      expect.stringMatching(/^unreachable-area:/),
    ]);
    // A ladder against the cliff (turned to face west) takes players to the top.
    const leaning = item('ladder', 'test.ladder', 9.8, 0, 15);
    leaning.transform.rotation = [0, Math.SQRT1_2, 0, Math.SQRT1_2];
    expect(findings(doc([bench, leaning]), { groundAt: cliff, itemShape })).toEqual([]);
  });

  it('lets players swim to an island', () => {
    const island = (x: number, z: number) => (Math.hypot(x - 30, z) < 4 ? 1 : -3);
    const lake = (x: number, z: number) => (Math.hypot(x - 30, z) < 12 && Math.hypot(x, z) > 3 ? 0 : null);
    const ground = (x: number, z: number) => (Math.hypot(x - 30, z) < 12 ? island(x, z) : 0);
    const place = doc([item('bench', 'test.bench', 30, 1, 0)]);
    expect(findings(place, { groundAt: ground, waterAt: lake })).toEqual([]);
  });

  it('skips the walk when players start inside an item', () => {
    const place = doc([item('crate', 'test.crate', 0, 0, 0), item('bench', 'test.bench', 13, 0, 13)]);
    const codes = validateWorld(place, world(place, { walls: room(false) })).findings.map((f) => f.code);
    expect(codes).toEqual(['spawn-blocked']);
  });
});
