import { WorldDocument, type CommandPayload } from '@genvr/contracts';
import { applyCommand, createWorldState, type WorldState } from '@genvr/world';
import { describe, expect, it } from 'vitest';
import { executeTool, toolDefinitions, worldSummary, type AssistantHost } from '../src/index.js';
import { TOOL_ARGS } from '../src/tools.js';

/** A real place: every command the assistant sends is applied, so the document shows the result. */
function host(blockGround = false) {
  const state: WorldState = createWorldState(
    WorldDocument.parse({
      schemaVersion: 1,
      experienceId: 'exp-world',
      version: 0,
      style: { base: 'realistic' },
      sizeTier: 'small',
      access: { mode: 'private' },
      environment: { sky: { preset: 'day' }, weather: { preset: 'clear' } },
      terrain: {},
      spawn: { position: [0, 1, 0] },
    }),
  );
  const applied: CommandPayload[][] = [];
  const assistant: AssistantHost = {
    world: () => state.doc,
    heightAt: (x, z) => state.terrain.heightAt(x, z),
    apply: (commands) => {
      applied.push(commands);
      for (const command of commands) applyCommand(state, command);
      return null;
    },
    addWater: () => null,
    focus: () => ({ x: 0, z: -40 }),
    blockGround: () => blockGround,
  };
  return { host: assistant, applied, state };
}

describe('the assistant gives a place a world and ground cover (P2-40)', () => {
  it('offers the world and cover tools only where the ground is a height field', () => {
    const names = (blockGround: boolean) =>
      toolDefinitions({ blockGround }).map((tool) => tool.function.name);
    expect(names(false)).toEqual(expect.arrayContaining(['make_world', 'cover_ground']));
    expect(names(true)).not.toContain('make_world');
    expect(names(true)).not.toContain('cover_ground');
  });

  it('refuses both on block ground, even when the model calls them anyway', () => {
    const { host: h, applied } = host(true);
    const world = executeTool('make_world', { kind: 'valley' }, h);
    const cover = executeTool('cover_ground', { x: 0, z: 0, radius: 5, cover: 'plants' }, h);
    expect(world.ok).toBe(false);
    expect(world.result).toContain('made of blocks');
    expect(cover.ok).toBe(false);
    expect(applied).toEqual([]);
  });

  it('makes a world that appears in the document, with the spawn ring, as one undo step', () => {
    const { host: h, applied, state } = host();
    const outcome = executeTool('make_world', { kind: 'valley', seed: 4242 }, h);
    expect(outcome.ok).toBe(true);
    expect(outcome.result).toContain('valley world (seed 4242)');
    expect(state.doc.terrain.world).toEqual({ seed: 4242, kind: 'valley', generator: 2 });
    // One apply call is one undo step, and it carries the trees and rocks around the spawn.
    expect(applied).toHaveLength(1);
    const spawnItems = state.doc.instances.filter((i) => i.instanceId.startsWith('spawn-'));
    expect(spawnItems.length).toBeGreaterThanOrEqual(8);
    // The rest law, not the seed, decides where each one stands (P2-43).
    for (const command of applied[0]!)
      if (command.type === 'place_item') expect(command.params.rest).toBe(true);
    // The spawn moved onto the new ground rather than staying inside or above it.
    const [x, y, z] = state.doc.spawn.position;
    expect(y).toBeCloseTo(state.terrain.heightAt(x, z) + 1, 5);
  });

  it('picks a seed of its own when none is asked for', () => {
    const { host: h, state } = host();
    executeTool('make_world', { kind: 'island' }, h, () => 0.5);
    expect(state.doc.terrain.world).toEqual({
      seed: Math.floor(0.5 * 0x7fffffff),
      kind: 'island',
      generator: 2,
    });
  });

  it('says that ground the builder shaped kept its shape', () => {
    const { host: h } = host();
    executeTool('sculpt_terrain', { x: 60, z: 60, radius: 10, operation: 'raise' }, h);
    const outcome = executeTool('make_world', { kind: 'plain', seed: 7 }, h);
    expect(outcome.result).toContain('kept its old height');
    // A place never touched before says nothing of the kind.
    const fresh = executeTool('make_world', { kind: 'plain', seed: 7 }, host().host);
    expect(fresh.result).not.toContain('kept');
  });

  it('says nothing was kept when the ground was only loaded, as it always is in the studio', () => {
    // The studio streams every chunk in before anyone asks; those chunks are not the builder's.
    const { host: h, state } = host();
    const { min, max } = state.terrain.chunkRange;
    for (let cx = min; cx <= max; cx += 1)
      for (let cz = min; cz <= max; cz += 1) state.terrain.getChunk(cx, cz);
    const outcome = executeTool('make_world', { kind: 'valley', seed: 4242 }, h);
    expect(outcome.result).not.toContain('kept');
    expect(state.terrain.heightAt(60, 60)).not.toBe(0);
  });

  it('replaces the old spawn ring when the world changes, in the same undo step', () => {
    const { host: h, applied, state } = host();
    executeTool('make_world', { kind: 'valley', seed: 4242 }, h);
    const ring = state.doc.instances.filter((i) => i.instanceId.startsWith('spawn-')).length;
    const outcome = executeTool('make_world', { kind: 'mountains', seed: 99 }, h);
    expect(outcome.result).toContain(`replace the ${ring} of the old world`);
    expect(applied).toHaveLength(2);
    expect(applied[1]!.filter((c) => c.type === 'remove_item')).toHaveLength(ring);
    const now = state.doc.instances.filter((i) => i.instanceId.startsWith('spawn-'));
    expect(now.length).toBeLessThanOrEqual(ring + 2); // one ring, not two
    expect(now.length).toBeGreaterThanOrEqual(8);
  });

  it("brings the kind's own ground and water, and takes the old kind's away (task 7)", () => {
    const { host: h, state } = host();
    executeTool('make_world', { kind: 'mountains', seed: 4242 }, h);
    const env = state.doc.environment;
    expect(env.rivers.map((r) => r.id)).toEqual(['starter-river']);
    expect(env.water.map((w) => w.id)).toEqual(['starter-lake']);
    expect(Object.keys(state.doc.terrain.materials ?? {}).sort()).toEqual(['0', '1', '3']);
    // The plain has a lake but no river, and the defaults for ground: the mountain's go.
    executeTool('make_world', { kind: 'plain', seed: 5 }, h);
    expect(state.doc.environment.rivers).toEqual([]);
    expect(state.doc.environment.water.map((w) => w.id)).toEqual(['starter-lake']);
    expect(state.doc.terrain.materials ?? {}).toEqual({});
  });

  it('refuses cover on a place with no world, where nothing would grow', () => {
    const { host: h, applied } = host();
    const outcome = executeTool('cover_ground', { x: 10, z: 10, radius: 5, cover: 'plants' }, h);
    expect(outcome.ok).toBe(false);
    expect(outcome.result).toContain('make_world first');
    expect(applied).toEqual([]);
  });

  it('paints cover, and clears ground so nothing grows there', () => {
    const { host: h, state } = host();
    executeTool('make_world', { kind: 'valley', seed: 4242 }, h);
    const plants = executeTool('cover_ground', { x: 40, z: 40, radius: 6, cover: 'plants' }, h);
    expect(plants.ok).toBe(true);
    expect(state.terrain.coverAt(40, 40)).toBe('plants');
    const cleared = executeTool('cover_ground', { x: -40, z: 40, radius: 6, cover: 'cleared' }, h);
    expect(cleared.result).toContain('nothing grows there');
    expect(state.terrain.coverAt(-40, 40)).toBe('cleared');
    executeTool('cover_ground', { x: -40, z: 40, radius: 6, cover: 'default' }, h);
    expect(state.terrain.coverAt(-40, 40)).toBe('default');
  });

  it('refuses cover outside the place', () => {
    const { host: h, applied } = host();
    const outcome = executeTool('cover_ground', { x: 3000, z: 0, radius: 5, cover: 'pebbles' }, h);
    expect(outcome.ok).toBe(false);
    expect(outcome.result).toContain('outside the place');
    expect(applied).toEqual([]);
  });

  it('can see which kind of world a place has', () => {
    // Without this the assistant would make a new world over the one the builder already has.
    const { host: h, state } = host();
    expect(worldSummary(state.doc, 20)).toContain('Ground: flat');
    executeTool('make_world', { kind: 'mountains', seed: 99 }, h);
    expect(worldSummary(state.doc, 20)).toContain('Ground: a mountains world (seed 99).');
  });
});

describe('the assistant sets up the game (P9-12)', () => {
  it('makes a new game with two teams and 3-minute matches as one step, from generic parts only', () => {
    const { host: h, applied, state } = host();
    const outcome = executeTool('set_game', { teams: 'two', minutes: 3 }, h);
    expect(outcome.ok).toBe(true);
    expect(applied).toEqual([
      [
        {
          type: 'set_game',
          params: {
            game: expect.objectContaining({
              teams: { mode: 'two', friendlyFire: false },
              match: expect.objectContaining({ durationSec: 180 }),
              score: { from: 'kills' },
              win: { by: 'highest_score' },
            }),
          },
        },
      ],
    ]);
    expect(state.doc.game?.teams?.mode).toBe('two');
    expect(state.doc.game?.loadout).toBeUndefined();
    expect(worldSummary(state.doc, 20)).toContain('Game: 3 min, two teams, highest score wins.');
  });

  it('changes one setting of an existing game and removes a game', () => {
    const { host: h, applied, state } = host();
    executeTool('set_game', { teams: 'two', minutes: 3 }, h);
    const change = executeTool(
      'set_game',
      { minutes: 5, health: 150, respawn_seconds: 5, min_players: 4 },
      h,
    );
    expect(change.ok).toBe(true);
    expect(state.doc.game).toMatchObject({
      teams: { mode: 'two', friendlyFire: false },
      match: { durationSec: 300, minPlayers: 4 },
      health: { max: 150 },
      respawn: { delaySec: 5, protectSec: 2 },
    });
    const removed = executeTool('set_game', { remove: true }, h);
    expect(removed.ok).toBe(true);
    expect(applied.at(-1)).toEqual([{ type: 'set_game', params: { game: null } }]);
    expect(state.doc.game).toBeUndefined();
    expect(worldSummary(state.doc, 20)).toContain('Game: none.');
  });

  it('keeps the rules of the current game and changes only the given settings', () => {
    const { host: h, state } = host();
    state.doc.game = {
      match: { minPlayers: 2, durationSec: 600, countdownSec: 5, resultsSec: 10 },
      counters: [{ name: 'points', scope: 'player', start: 0 }],
      rules: [{ when: { event: 'zone_entered', tag: 'goal' }, if: [], do: [{ kind: 'end_match', winner: 'nobody' }] }],
      ranking: { by: 'points', order: 'high' },
    };
    executeTool('set_game', { health: 300 }, h);
    executeTool('set_game', { minutes: 4 }, h);
    expect(state.doc.game).toMatchObject({
      health: { max: 300 },
      match: { durationSec: 240 },
      ranking: { by: 'points', order: 'high' },
    });
    expect(state.doc.game?.win).toBeUndefined();
    expect(worldSummary(state.doc, 20)).toContain('Game: 4 min, 1 counter, 1 rule, ranked by points.');
  });

  it('offers no named games: only generic settings and remove', () => {
    expect(Object.keys(TOOL_ARGS.set_game.shape).sort()).toEqual(
      ['health', 'min_players', 'minutes', 'remove', 'respawn_seconds', 'teams', 'tools'],
    );
  });

  it('refuses settings outside the limits', () => {
    const { host: h, applied } = host();
    const outcome = executeTool('set_game', { minutes: 0.1 }, h);
    expect(outcome.ok).toBe(false);
    expect(outcome.result).toMatch(/^Error: /);
    expect(applied).toEqual([]);
  });

  it('is offered in every place, block places too', () => {
    for (const blockGround of [false, true])
      expect(toolDefinitions({ blockGround }).map((tool) => tool.function.name)).toContain('set_game');
  });
});
