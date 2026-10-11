import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  AttackMessage,
  COMMAND_TYPES,
  CommandPayload,
  decodeGameWinner,
  encodeGameWinner,
  Game,
  LEGACY_GATE_REPLACEMENT,
  LEGACY_MELEE_TOOL_ID,
  legacyCheckpointTag,
  legacyFinishTag,
  legacyGateTags,
  MELEE_TOOL_REPLACEMENT,
  MIGRATED_CHECKPOINTS,
  newGame,
  positiveInt,
  StoredGame,
  WorldDocument,
} from '../src/index.js';
import { emptyWorld, testGame } from './fixtures.js';

describe('game contract', () => {
  it('parses a game built from generic components as it is', () => {
    const game = testGame();
    expect(Game.parse(game)).toEqual(game);
  });

  it('rejects out-of-range settings', () => {
    const game = testGame();
    expect(Game.safeParse({ ...game, match: { ...game.match, durationSec: 5 } }).success).toBe(false);
    expect(Game.safeParse({ ...game, health: { max: 0 } }).success).toBe(false);
  });

  it('starts a new game from generic parts only: a clock, a point per knock-out, the highest score wins', () => {
    const game = newGame();
    expect(Game.parse(game)).toEqual(game);
    expect(game).toEqual({
      match: { minPlayers: 2, durationSec: 300, countdownSec: 5, resultsSec: 10 },
      score: { from: 'kills' },
      win: { by: 'highest_score' },
    });
  });

  it('lists set_game as a command', () => {
    expect(COMMAND_TYPES).toContain('set_game');
  });

  it('has no named games in what it reads out: no template, no race (they are input only, for stored games)', () => {
    const properties = Object.keys((z.toJSONSchema(Game, { io: 'output' }) as { properties: object }).properties);
    expect(properties).not.toContain('template');
    expect(properties).not.toContain('race');
    expect(properties).toContain('rules');
  });

  it('writes a game back as it is (responses are encoded), in a world document too', () => {
    const game = Game.parse(testGame());
    expect(z.encode(Game, game)).toEqual(game);
    const world = WorldDocument.parse({ ...emptyWorld, game: testGame() });
    expect(z.encode(WorldDocument, world)).toEqual(world);
  });
});

describe('attack message', () => {
  it('takes tagged melee strikes, and a bare yaw as melee; refuses other kinds', () => {
    expect(AttackMessage.parse({ kind: 'melee', yaw: 1, target: 's1' })).toEqual({ kind: 'melee', yaw: 1, target: 's1' });
    expect(AttackMessage.parse({ yaw: 2 })).toEqual({ kind: 'melee', yaw: 2 });
    expect(AttackMessage.safeParse({ kind: 'ranged', yaw: 2 }).success).toBe(false);
  });
});

describe('game winner encoding', () => {
  it('round-trips players, teams and a draw', () => {
    for (const winner of [{ kind: 'player', id: 's1' }, { kind: 'team', team: 'blue' }, null] as const)
      expect(decodeGameWinner(encodeGameWinner(winner))).toEqual(winner);
    expect(encodeGameWinner({ kind: 'team', team: 'red' })).toBe('team:red');
    expect(decodeGameWinner('player:')).toBeNull();
  });
});

describe('how a game ends', () => {
  it('rejects a game with neither a win rule nor a rule that ends the match (it would never end)', () => {
    const { win: _win, ...neither } = testGame();
    const result = Game.safeParse(neither);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('A game needs win or a rule that ends the match');
  });
});

/**
 * Stored games from before the generic rules (Task 5): read as the equivalent counters, rules and
 * ranking. The literals are what the old templates produced when they were stored.
 */
describe('reading stored games from before the generic rules', () => {
  const STORED_SWORD_FIGHT = {
    template: 'sword_fight',
    match: { minPlayers: 2, durationSec: 300, countdownSec: 5, resultsSec: 10 },
    teams: { mode: 'none', friendlyFire: false },
    health: { max: 100 },
    respawn: { delaySec: 3, protectSec: 2 },
    loadout: { items: ['genvr.core.gameplay.sword'] },
    score: { from: 'kills' },
    win: { by: 'highest_score' },
  };
  const STORED_CAR_RACE = {
    template: 'car_race',
    match: { minPlayers: 2, durationSec: 600, countdownSec: 5, resultsSec: 15 },
    race: { laps: 3, checkpoints: 'ordered', finish: 'all_finish', graceSec: 30 },
  };
  const race = STORED_CAR_RACE.race;

  it('takes only a live game in a command and a request: the old keys are read from stored worlds only', () => {
    // The old keys are not part of it: a template name is dropped, a race is not read (so a game
    // that had only the race to end it is refused).
    expect(Game.parse(STORED_SWORD_FIGHT)).not.toHaveProperty('template');
    expect(Game.safeParse(STORED_CAR_RACE).success).toBe(false);
    expect(CommandPayload.safeParse({ type: 'set_game', params: { game: STORED_CAR_RACE } }).success).toBe(false);
    expect(CommandPayload.safeParse({ type: 'set_game', params: { game: newGame() } }).success).toBe(true);
    const input = JSON.stringify(z.toJSONSchema(CommandPayload, { io: 'input' }));
    expect(input).not.toContain('"template"');
    expect(input).not.toContain('"race"');
    // A stored world still reads them, and writes the game back as the live game it is.
    const world = WorldDocument.parse({ ...emptyWorld, game: STORED_CAR_RACE });
    expect(Game.safeParse(world.game).success).toBe(true);
    expect(z.encode(WorldDocument, world)).toEqual(world);
  });

  it('reads a stored sword fight as the same generic components, without its template name', () => {
    const { template: _template, ...generic } = STORED_SWORD_FIGHT;
    const game = StoredGame.parse(STORED_SWORD_FIGHT);
    // The old Sword item of the loadout is read as the Melee tool (same model, a neutral name).
    expect(game).toEqual({ ...generic, loadout: { items: [MELEE_TOOL_REPLACEMENT] } });
    expect('template' in game).toBe(false);
  });

  it('reads the old Sword item as the Melee tool in any stored loadout and world, once', () => {
    expect(LEGACY_MELEE_TOOL_ID).toBe('genvr.core.gameplay.sword');
    expect(MELEE_TOOL_REPLACEMENT).toBe('genvr.core.gameplay.melee-tool');
    const { template: _template, ...live } = STORED_SWORD_FIGHT;
    const stored = { ...live, loadout: { items: ['genvr.core.gameplay.spawn-point', LEGACY_MELEE_TOOL_ID] } };
    expect(StoredGame.parse(stored).loadout?.items).toEqual(['genvr.core.gameplay.spawn-point', MELEE_TOOL_REPLACEMENT]);
    const transform = { position: [1, 2, 3] };
    const world = WorldDocument.parse({
      ...emptyWorld,
      game: stored,
      instances: [
        { instanceId: 'held', itemId: LEGACY_MELEE_TOOL_ID, transform, params: { color: '#ffffff' } },
        { instanceId: 'tree', itemId: 'genvr.core.nature.tree', transform },
      ],
    });
    expect(world.game?.loadout?.items).toEqual(['genvr.core.gameplay.spawn-point', MELEE_TOOL_REPLACEMENT]);
    expect(world.instances.map((i) => i.itemId)).toEqual([MELEE_TOOL_REPLACEMENT, 'genvr.core.nature.tree']);
    expect(world.instances[0]!.params).toEqual({ color: '#ffffff' });
    expect(WorldDocument.parse(world)).toEqual(world);
    expect(JSON.stringify(z.encode(WorldDocument, world))).not.toContain(LEGACY_MELEE_TOOL_ID);
  });

  it('reads a stored race as counters, zone rules and a ranking by lap then checkpoint', () => {
    const game = StoredGame.parse(STORED_CAR_RACE);
    expect('race' in game).toBe(false);
    expect('template' in game).toBe(false);
    expect(game.match).toEqual(STORED_CAR_RACE.match);
    expect(game.counters).toEqual([
      { name: 'lap', scope: 'player', start: 1 },
      { name: 'checkpoint', scope: 'player', start: 0 },
    ]);
    expect(game.ranking).toEqual({ by: 'lap', order: 'high', then: 'checkpoint' });
    const rules = game.rules ?? [];
    // Ordered: checkpoint k counts only right after k - 1, and only while the racer has laps to go.
    expect(rules).toContainEqual({
      when: { event: 'zone_crossed', tag: legacyCheckpointTag(2) },
      if: [
        { kind: 'counter', name: 'lap', op: '<=', value: 3 },
        { kind: 'counter', name: 'checkpoint', op: '=', value: 1 },
      ],
      do: [{ kind: 'set_counter', name: 'checkpoint', to: 2, who: 'actor' }],
    });
    // The finish line of a course with 2 checkpoints completes a lap once both are passed.
    expect(rules).toContainEqual({
      when: { event: 'zone_crossed', tag: legacyFinishTag(2) },
      if: [
        { kind: 'counter', name: 'lap', op: '<=', value: 3 },
        { kind: 'counter', name: 'checkpoint', op: '>=', value: 2 },
      ],
      do: [
        { kind: 'set_counter', name: 'checkpoint', to: 0, who: 'actor' },
        { kind: 'add_counter', name: 'lap', by: 1, who: 'actor' },
      ],
    });
    // all_finish: the first finisher starts the wait; its end (or the clock) ends the match by the ranking.
    expect(rules).toContainEqual({
      when: { event: 'counter_changed', counter: 'lap' },
      if: [{ kind: 'counter', name: 'lap', op: '>', value: 3 }],
      do: [{ kind: 'start_timer', name: 'grace', seconds: 30 }],
    });
    expect(rules).toContainEqual({
      when: { event: 'timer_fired' },
      if: [],
      do: [{ kind: 'end_match', winner: { byCounter: 'lap', order: 'high' } }],
    });
    expect(rules).toContainEqual({
      when: { event: 'time_up' },
      if: [],
      do: [{ kind: 'end_match', winner: { byCounter: 'lap', order: 'high' } }],
    });
    // Every checkpoint index up to the supported count has its rule, and every finish line its own.
    for (let k = 1; k <= MIGRATED_CHECKPOINTS; k += 1)
      expect(rules.some((rule) => rule.when.tag === legacyCheckpointTag(k))).toBe(true);
    for (let n = 0; n <= MIGRATED_CHECKPOINTS; n += 1)
      expect(rules.some((rule) => rule.when.tag === legacyFinishTag(n))).toBe(true);
    expect(game.hud).toEqual([
      { kind: 'counter', label: 'Lap', counter: 'lap' },
      { kind: 'rank', label: 'Place' },
      { kind: 'timer', label: 'Time' },
    ]);
  });

  it('reads first_wins as ending on the first finisher, and timed as ending on the clock only', () => {
    const first = StoredGame.parse({ ...STORED_CAR_RACE, race: { ...race, finish: 'first_wins' } });
    expect(first.rules).toContainEqual({
      when: { event: 'counter_changed', counter: 'lap' },
      if: [{ kind: 'counter', name: 'lap', op: '>', value: 3 }],
      do: [{ kind: 'end_match', winner: { player: 'actor' } }],
    });
    const timed = StoredGame.parse({ ...STORED_CAR_RACE, race: { ...race, finish: 'timed' } });
    expect(timed.rules?.some((rule) => rule.when.event === 'counter_changed')).toBe(false);
    // Laps never stop counting in a timed race.
    expect(timed.rules?.find((rule) => rule.when.tag === legacyCheckpointTag(1))?.if).toEqual([
      { kind: 'counter', name: 'checkpoint', op: '=', value: 0 },
    ]);
  });

  it('reads any_order with one passed flag per checkpoint, cleared at every lap', () => {
    const game = StoredGame.parse({ ...STORED_CAR_RACE, race: { ...race, checkpoints: 'any_order' } });
    expect(game.counters).toContainEqual({ name: 'checkpoint 1 passed', scope: 'player', start: 0 });
    expect(game.counters).toHaveLength(2 + MIGRATED_CHECKPOINTS);
    expect(game.rules).toContainEqual({
      when: { event: 'zone_crossed', tag: legacyCheckpointTag(1) },
      if: [
        { kind: 'counter', name: 'lap', op: '<=', value: 3 },
        { kind: 'counter', name: 'checkpoint 1 passed', op: '=', value: 0 },
      ],
      do: [
        { kind: 'set_counter', name: 'checkpoint 1 passed', to: 1, who: 'actor' },
        { kind: 'add_counter', name: 'checkpoint', by: 1, who: 'actor' },
      ],
    });
  });

  it('checks a stored race as it was: laps and grace within the old limits, a known finish rule', () => {
    expect(StoredGame.safeParse({ ...STORED_CAR_RACE, race: { ...race, laps: 0 } }).success).toBe(false);
    expect(StoredGame.safeParse({ ...STORED_CAR_RACE, race: { ...race, laps: 100 } }).success).toBe(false);
    expect(StoredGame.safeParse({ ...STORED_CAR_RACE, race: { ...race, graceSec: 4 } }).success).toBe(false);
    const unknown = StoredGame.safeParse({ ...STORED_CAR_RACE, race: { ...race, finish: 'sudden_death' } });
    expect(unknown.success).toBe(false);
    expect(unknown.error?.issues[0]?.path).toEqual(['race', 'finish']);
    expect(StoredGame.safeParse({ ...STORED_CAR_RACE, template: 'unknown' }).success).toBe(false);
  });

  it('rejects a stored race beside a win rule or a ranking (both would decide the match)', () => {
    expect(StoredGame.safeParse({ ...STORED_CAR_RACE, win: { by: 'highest_score' } }).success).toBe(false);
    const ranked = StoredGame.safeParse({
      ...STORED_CAR_RACE,
      counters: [{ name: 'points', scope: 'player', start: 0 }],
      ranking: { by: 'points', order: 'high' },
    });
    expect(ranked.success).toBe(false);
    expect(ranked.error?.issues[0]?.message).toBe('A race cannot have a ranking');
  });

  it('reads a stored race nested in a world document too', () => {
    const world = WorldDocument.parse({ ...emptyWorld, game: STORED_CAR_RACE });
    expect(world.game).not.toHaveProperty('race');
    expect(world.game?.ranking).toEqual({ by: 'lap', order: 'high', then: 'checkpoint' });
    expect(WorldDocument.safeParse({ ...emptyWorld, game: { ...STORED_CAR_RACE, race: { ...race, laps: 0 } } }).success).toBe(false);
  });

  it('keeps the rules and counters a stored race already had, and still rejects a broken race', () => {
    const extra = {
      counters: [{ name: 'coins', scope: 'player', start: 0 }],
      rules: [{ when: { event: 'zone_entered', tag: 'coin' }, do: [{ kind: 'add_counter', name: 'coins', by: 1 }] }],
    };
    const game = StoredGame.parse({ ...STORED_CAR_RACE, ...extra });
    expect(game.counters?.[0]?.name).toBe('coins');
    expect(game.rules?.[0]?.when.tag).toBe('coin');
    expect(game.counters?.some((c) => c.name === 'lap')).toBe(true);
    // A broken race is not migrated away: it is rejected as before.
    expect(StoredGame.safeParse({ ...STORED_CAR_RACE, race: { ...race, laps: 0 } }).success).toBe(false);
    // A designer counter with a migrated name is a clash, not an overwrite.
    const clash = StoredGame.safeParse({ ...STORED_CAR_RACE, counters: [{ name: 'lap', scope: 'player', start: 0 }] });
    expect(clash.success).toBe(false);
    expect(clash.error?.issues[0]?.message).toBe('Counter names must be unique');
  });

  it('tags the old gates as the migrated rules expect: checkpoints by their order, the finish by their count', () => {
    const at = (instanceId: string, itemId: string, params: Record<string, unknown> = {}) => ({ instanceId, itemId, params });
    const tags = legacyGateTags([
      at('f', 'genvr.core.gameplay.finish-line'),
      at('c3', 'genvr.core.gameplay.checkpoint', { order: '7' }),
      at('c1', 'genvr.core.gameplay.checkpoint', { order: 2 }),
      at('c2', 'genvr.core.gameplay.checkpoint'), // no order reads as 1, as the old race read it
      at('x', 'genvr.core.nature.tree'),
    ]);
    expect(Object.fromEntries(tags)).toEqual({
      c2: legacyCheckpointTag(1),
      c1: legacyCheckpointTag(2),
      c3: legacyCheckpointTag(3),
      f: legacyFinishTag(3),
    });
  });

  it('reads the old gates of a stored world as Zone Gates with those tags, in the same place, size and turn', () => {
    const transform = { position: [1, 2, 3], rotation: [0, Math.SQRT1_2, 0, Math.SQRT1_2], scale: [2, 1, 1] };
    const world = WorldDocument.parse({
      ...emptyWorld,
      game: STORED_CAR_RACE,
      instances: [
        { instanceId: 'f', itemId: 'genvr.core.gameplay.finish-line', transform },
        { instanceId: 'c2', itemId: 'genvr.core.gameplay.checkpoint', transform, params: { order: 2 } },
        { instanceId: 'c1', itemId: 'genvr.core.gameplay.checkpoint', transform, params: { order: 1, color: '#ff0000' } },
        // A zone of its own (a shape and a tag) is kept as it was.
        { instanceId: 'own', itemId: 'genvr.core.gameplay.checkpoint', transform, params: { order: 3, zone: 'area', zoneTag: 'mine' } },
        // A lone tag without a shape made no zone of its own: the migrated tag wins.
        { instanceId: 'lone', itemId: 'genvr.core.gameplay.checkpoint', transform, params: { order: 4, zoneTag: 'x', zoneVisible: true } },
        { instanceId: 'tree', itemId: 'genvr.core.nature.tree', transform: { position: [0, 0, 0] } },
      ],
    });
    const byId = new Map(world.instances.map((i) => [i.instanceId, i]));
    for (const id of ['f', 'c2', 'c1', 'own', 'lone']) {
      expect(byId.get(id)!.itemId).toBe(LEGACY_GATE_REPLACEMENT);
      expect(byId.get(id)!.transform).toMatchObject(transform);
    }
    expect(byId.get('f')!.params).toEqual({ zoneTag: legacyFinishTag(4) });
    expect(byId.get('c1')!.params).toEqual({ color: '#ff0000', zoneTag: legacyCheckpointTag(1) });
    expect(byId.get('c2')!.params).toEqual({ zoneTag: legacyCheckpointTag(2) });
    expect(byId.get('own')!.params).toEqual({ zone: 'area', zoneTag: 'mine' });
    expect(byId.get('lone')!.params).toEqual({ zoneTag: legacyCheckpointTag(4) });
    expect(byId.get('tree')!.itemId).toBe('genvr.core.nature.tree');
    // Read once, the world holds no old item: reading it again changes nothing.
    expect(WorldDocument.parse(world)).toEqual(world);
  });
});

describe('positiveInt', () => {
  it('reads a positive whole number given as a number or a numeric string', () => {
    expect(positiveInt(2)).toBe(2);
    expect(positiveInt('2')).toBe(2);
    expect(positiveInt(' 3 ')).toBe(3);
  });
  it('reads nothing else', () => {
    for (const bad of [0, -1, 1.5, '', '  ', 'x', '1.5', null, undefined, true, {}]) expect(positiveInt(bad)).toBeUndefined();
  });
});
