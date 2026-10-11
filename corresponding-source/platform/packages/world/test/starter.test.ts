import { WorldDocument, type CommandPayload, type WorldSeed } from '@genvr/contracts';
import { describe, expect, it } from 'vitest';
import {
  applyCommand,
  createWorldState,
  CLEARING_RADIUS,
  encodeTerrain,
  spawnRing,
  starterGround,
  starterWater,
  starterWorldCommands,
  STARTER_WATER_IDS,
  worldHeightAt,
} from '../src/index.js';

const HALF = 250;
const world = { seed: 4242, kind: 'valley' as const, generator: 1 as const };
const heightAt = (x: number, z: number) => worldHeightAt(world, x, z, HALF);

const doc = () =>
  WorldDocument.parse({
    schemaVersion: 1,
    experienceId: 'exp-starter',
    version: 0,
    style: { base: 'realistic' },
    sizeTier: 'small',
    access: { mode: 'private' },
    environment: { sky: { preset: 'day' }, weather: { preset: 'clear' } },
    terrain: {},
    spawn: { position: [0, 1, 0] },
  });

/** Applies a batch and returns the inverses in the order that undoes them. */
function run(document: WorldDocument, commands: readonly CommandPayload[]): CommandPayload[] {
  const state = createWorldState(document);
  const inverses: CommandPayload[] = [];
  for (const command of commands) inverses.unshift(applyCommand(state, command).inverse);
  return inverses;
}

describe('giving a place a starter world (P2-40)', () => {
  it('puts a dozen real things around the spawn, and none of them where a rule would put one', () => {
    const ring = spawnRing({ heightAt }, world);
    // 'about a dozen' (plan task 4): the open wedge takes a quarter of the ring.
    expect(ring.length).toBeGreaterThanOrEqual(11);
    expect(ring.length).toBeLessThanOrEqual(13);
    for (const thing of ring) {
      const [x, , z] = thing.position;
      // The scatter refuses everything inside the clearing, so a rule and a placed item can never
      // land on the same spot.
      expect(Math.hypot(x, z)).toBeLessThan(CLEARING_RADIUS);
    }
    // Both trees and rocks, so the clearing is not a ring of identical trunks.
    const kinds = new Set(ring.map((t) => t.itemId));
    expect(kinds.size).toBeGreaterThan(1);
  });

  it('keeps its things apart, and off the player, when it knows how wide they are', () => {
    // Everything 2.5 m across its middle, the trunk 1 m off the origin like a real EZ-Tree's.
    const footprint = () => ({ x: 1, z: 0, radius: 2.5 });
    for (const seed of [1, 4242, 99991]) {
      const ring = spawnRing({ heightAt }, { ...world, seed }, undefined, footprint);
      expect(ring.length).toBeGreaterThanOrEqual(4);
      const bodies = ring.map((t) => ({
        x: t.position[0] + Math.cos(t.yaw) * t.scale,
        z: t.position[2] - Math.sin(t.yaw) * t.scale,
        radius: 2.5 * t.scale,
      }));
      for (const [i, a] of bodies.entries()) {
        expect(Math.hypot(a.x, a.z)).toBeGreaterThanOrEqual(a.radius + 1.5);
        for (const b of bodies.slice(i + 1))
          expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThanOrEqual(a.radius + b.radius);
      }
    }
  });

  it('leaves the way the camera first looks open', () => {
    for (const thing of spawnRing({ heightAt }, world)) {
      const [x, , z] = thing.position;
      // Nothing stands in the wedge toward +z: arriving should show the place, not a trunk.
      expect(Math.abs(Math.atan2(z, x) - Math.PI / 2)).toBeGreaterThanOrEqual(Math.PI / 4);
    }
  });

  it('is the same world every time from the same seed', () => {
    const a = starterWorldCommands(doc(), world, heightAt);
    const b = starterWorldCommands(doc(), world, heightAt);
    expect(a).toEqual(b);
  });

  it('undoes to exactly the document it started from', () => {
    const before = doc();
    const after = doc();
    const commands = starterWorldCommands(after, world, heightAt);
    const inverses = run(after, commands);
    expect(after).not.toEqual(before);
    run(after, inverses);
    expect(after).toEqual(before);
  });

  it('moves the spawn onto the new ground instead of leaving it underground', () => {
    const document = doc();
    const state = createWorldState(document);
    applyCommand(state, { type: 'generate_world', params: { world } });
    const level = heightAt(0, 0);
    expect(level).not.toBeCloseTo(0, 1); // this seed's clearing is not at zero, so the test means something
    expect(document.spawn.position[1]).toBeCloseTo(level + 1, 5);
  });

  it('keeps ground the creator already shaped', () => {
    const document = doc();
    const state = createWorldState(document);
    state.terrain.sculpt(
      [
        [-8, -8],
        [8, -8],
        [8, 8],
        [-8, 8],
      ],
      'raise',
      1,
    );
    const shaped = state.terrain.heightAt(0, 0);
    applyCommand(state, { type: 'generate_world', params: { world } });
    // A stored chunk always beats the generator, so nothing the creator shaped is overwritten.
    expect(state.terrain.heightAt(0, 0)).toBeCloseTo(shaped, 5);
  });

  it('shows the new world on ground that was only loaded, and redraws it', () => {
    // Streaming the ground creates a chunk for everything it draws. In the studio a flat place is
    // fully loaded before anyone gives it a world, so without this the valley would stay flat.
    const document = doc();
    const state = createWorldState(document);
    const { min, max } = state.terrain.chunkRange;
    for (let cx = min; cx <= max; cx += 1)
      for (let cz = min; cz <= max; cz += 1) state.terrain.getChunk(cx, cz);
    const loaded = state.terrain.chunks.size;
    const { changedChunks, inverse } = applyCommand(state, { type: 'generate_world', params: { world } });
    expect(state.terrain.heightAt(60, 60)).toBeCloseTo(heightAt(60, 60), 4);
    expect(changedChunks.size).toBe(loaded);
    // Nothing is left to store: the place costs nothing until somebody builds in it.
    expect(encodeTerrain(state)).toEqual([]);

    // Undo is the same step backwards: the new world's chunks go and the ground is flat again.
    for (let cx = min; cx <= max; cx += 1)
      for (let cz = min; cz <= max; cz += 1) state.terrain.getChunk(cx, cz);
    expect(applyCommand(state, inverse).changedChunks.size).toBe(loaded);
    expect(state.terrain.heightAt(60, 60)).toBe(0);
  });

  it('does not clash with ids a place already has', () => {
    const document = doc();
    document.instances.push({
      instanceId: 'spawn-0',
      itemId: 'genvr.core.rock',
      transform: { position: [40, 0, 40], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
      params: {},
    });
    const commands = starterWorldCommands(document, world, heightAt);
    const ids = commands.flatMap((c) => (c.type === 'place_item' ? [c.params.instanceId] : []));
    expect(ids).not.toContain('spawn-0');
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('starter world items rest by the law (P2-43 final review)', () => {
  it('asks the rest law for every spawn item, so the server rests them before storing', () => {
    const commands = starterWorldCommands(doc(), world, heightAt);
    const places = commands.filter((command) => command.type === 'place_item');
    expect(places.length).toBeGreaterThan(0);
    for (const command of places) expect(command.type === 'place_item' && command.params.rest).toBe(true);
  });
});

describe('the water a starter world begins with (P2-40 task 7)', () => {
  const made = (kind: WorldSeed['kind'], seed: number, sizeTier: 'small' | 'medium' = 'small') => {
    const document = { ...doc(), sizeTier };
    const state = createWorldState(document);
    const world: WorldSeed = { seed, kind, generator: 2 };
    for (const command of starterWorldCommands(document, world, (x, z) => worldHeightAt(world, x, z, HALF)))
      applyCommand(state, command);
    return state;
  };

  it("gives each kind its own water, from R4's commands, never on the spawn", () => {
    for (const seed of [4242, 7, 99991])
      for (const sizeTier of ['small', 'medium'] as const) {
        const valley = made('valley', seed, sizeTier).doc.environment;
        expect(valley.rivers.map((r) => r.id)).toEqual([STARTER_WATER_IDS.river]);
        expect(valley.water.map((w) => w.id)).toEqual([STARTER_WATER_IDS.lake]);
        const island = made('island', seed, sizeTier);
        expect(island.doc.environment.sea?.level).toBeLessThan(island.terrain.heightAt(0, 0));
        expect(made('plain', seed, sizeTier).doc.environment.water).toHaveLength(1);
        const mountains = made('mountains', seed, sizeTier).doc.environment;
        expect(mountains.rivers).toHaveLength(1);
        expect(mountains.water).toHaveLength(1);
        for (const state of [made('valley', seed, sizeTier), made('plain', seed, sizeTier)])
          for (const lake of state.doc.environment.water)
            expect(lake.level).toBeLessThan(state.terrain.heightAt(0, 0));
      }
  });

  it('leaves no ground steeper than the style allows, river banks and dug lakes included', () => {
    for (const kind of ['valley', 'island', 'plain', 'mountains'] as const)
      for (const seed of [4242, 7, 99991])
        for (const state of [made(kind, seed)])
          // A height step between grid points, the way the world checks ask it.
          expect(
            state.terrain.steepCells(state.terrain.spacing * Math.tan((40 * Math.PI) / 180)),
            `${kind} ${seed}`,
          ).toEqual([]);
  });

  it('fits a place of any size: the river never passes the 1000 m a river may be', () => {
    // Review round 1: end to end in a 2000 m place the river was 1.8 km and make_world threw.
    for (const sizeTier of ['large', 'huge', 'max'] as const)
      for (const kind of ['valley', 'mountains'] as const) {
        const document = { ...doc(), sizeTier };
        const state = createWorldState(document);
        const world: WorldSeed = { seed: 4242, kind, generator: 2 };
        for (const command of starterWorldCommands(document, world, (x, z) =>
          worldHeightAt(world, x, z, HALF),
        ))
          applyCommand(state, command);
        expect(state.doc.environment.rivers, `${sizeTier} ${kind}`).toHaveLength(1);
      }
  });

  it('leaves none of the old world in the ground when a world is given again, and undoes exactly', () => {
    // Review round 1: the valley's carved bed and dug lake were stored chunks, so they won over
    // the mountains and left steps of up to 39 m.
    const state = made('valley', 4242);
    const before = [...state.terrain.chunks.keys()].map(
      (k) => [k, [...state.terrain.chunks.get(k)!.heights]] as const,
    );
    const mountains: WorldSeed = { seed: 99, kind: 'mountains', generator: 2 };
    const inverses: CommandPayload[] = [];
    for (const command of starterWorldCommands(state.doc, mountains, (x, z) =>
      worldHeightAt(mountains, x, z, HALF),
    ))
      inverses.unshift(applyCommand(state, command).inverse);
    const fresh = starterGround(mountains, 'small');
    let off = 0;
    for (let x = -HALF; x <= HALF; x += 8)
      for (let z = -HALF; z <= HALF; z += 8)
        if (Math.abs(state.terrain.heightAt(x, z) - fresh.heightAt(x, z)) > 0.01) off += 1;
    expect(off).toBe(0);
    // One Undo brings the valley back, river bed and all.
    for (const inverse of inverses) applyCommand(state, inverse);
    for (const [key, heights] of before) {
      const now = state.terrain.getChunk(...(key.split(',').map(Number) as [number, number])).heights;
      for (let i = 0; i < heights.length; i += 1) expect(now[i]).toBeCloseTo(heights[i]!, 3);
    }
  });

  it('is the same water every time from the same seed', () => {
    expect(starterWater({ seed: 7, kind: 'valley', generator: 2 }, 'small')).toEqual(
      starterWater({ seed: 7, kind: 'valley', generator: 2 }, 'small'),
    );
  });

  it("takes the old world's water away when a world is given again, and only that", () => {
    const state = made('valley', 4242);
    // Water the creator made themselves stays.
    applyCommand(state, {
      type: 'add_water',
      params: {
        id: 'my-pond',
        kind: 'lake',
        area: [
          [100, 100],
          [110, 100],
          [110, 110],
        ],
        level: 5,
        params: {},
      },
    });
    const island: WorldSeed = { seed: 5, kind: 'island', generator: 2 };
    for (const command of starterWorldCommands(state.doc, island, (x, z) =>
      worldHeightAt(island, x, z, HALF),
    ))
      applyCommand(state, command);
    expect(state.doc.environment.rivers).toEqual([]);
    expect(state.doc.environment.water.map((w) => w.id)).toEqual(['my-pond']);
    expect(state.doc.environment.sea).toBeTruthy();
    // And back to a valley: the island's sea goes, its own river and lake come.
    const valley: WorldSeed = { seed: 6, kind: 'valley', generator: 2 };
    for (const command of starterWorldCommands(state.doc, valley, (x, z) =>
      worldHeightAt(valley, x, z, HALF),
    ))
      applyCommand(state, command);
    expect(state.doc.environment.sea).toBeUndefined();
    expect(state.doc.environment.rivers).toHaveLength(1);
  });
});
