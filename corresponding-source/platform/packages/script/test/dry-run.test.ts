import { Game, SCRIPT_LIMITS, WorldDocument, type ScriptTestEvent } from '@genvr/contracts';
import { ZONE_GATE_ID } from '@genvr/core-library';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createScriptModule, dryRun, type ScriptModule } from '../src/index.js';
import { BASE_GAME, GATE, PAD, place, script } from './support.js';

// Every script here is an example written for the tests (spec 12: examples are named as examples).

let mod: ScriptModule;
beforeAll(async () => {
  mod = await createScriptModule();
});
afterAll(() => mod.dispose());

const game = (extra: Record<string, unknown> = {}) => Game.parse({ ...BASE_GAME, ...extra });

/** An example: counts gate crossings per player, raises an event every second one, and draws a seeded number. */
const EXAMPLE = `
const seen = {};
genvr.on('zone_crossed', (e) => {
  if (e.tag !== 'line') return;
  genvr.act({ kind: 'add_counter', name: 'n', by: 1 });
  seen[e.id] = (seen[e.id] || 0) + 1;
  if (seen[e.id] % 2 === 0) genvr.emit('second');
  genvr.log('crossed', e.id, Math.floor(genvr.random() * 100));
});
genvr.on('second', (e) => genvr.act({ kind: 'add_score', by: 1 }));
genvr.on('hit', (e) => genvr.act({ kind: 'add_counter', name: 'g', by: e.damage }));
genvr.on('zone_entered', (e) => genvr.act({ kind: 'set_counter', name: 't', to: 7 }));
`;

const shape = (
  requests: Array<{ script: string; action: unknown; actor: string | null; accepted: boolean }>,
) => requests.map(({ script: id, action, actor, accepted }) => ({ id, action, actor, accepted }));

describe('dryRun: a real session in a fresh sandbox (spec 12)', () => {
  it('replays a room recording to the same requested actions for the same seed (shared fixture)', async () => {
    const example = script(EXAMPLE);
    // The "room": a real session and runner, driven by moves, a hit and an entry.
    const room = place({ module: mod, scripts: [example] });
    room.cross('a');
    room.cross('b');
    room.tick(300);
    room.cross('a');
    room.session.damage('b', 30, 'a', room.now());
    room.tick();
    room.pos.set('b', { x: 58, y: 0, z: 50 });
    room.tick();
    room.pos.set('b', { x: 50, y: 0, z: 50 });
    room.tick();
    const recording = room.runner.recording();
    expect(room.requests.length).toBeGreaterThan(5);

    const result = await dryRun({
      game: game(),
      zones: [GATE, PAD],
      scripts: [example],
      recording,
      module: mod,
    });
    expect(shape(result.requested)).toEqual(shape(room.requests));
    expect(result.log.filter((l) => l.level === 'log').map((l) => l.text)).toEqual(
      room.logs.filter((l) => l.level === 'log').map((l) => l.text),
    );
    expect(result.skipped).toEqual([]);
    expect(result.counters.players.p1).toEqual({ n: 2 });
    expect(result.counters.players.p2).toEqual({ n: 1 });
    expect(result.counters.teams).toEqual({ red: { t: 0 }, blue: { t: 0 } });
    expect(result.counters.global).toEqual({ g: 30 });
    expect(result.status.map((s) => [s.state, s.strikes])).toEqual([['running', 0]]);
    expect(result.ticks).toBeGreaterThanOrEqual(0);
    room.dispose();
  });

  it('runs given events with two players by default, letting play start first', async () => {
    const events: ScriptTestEvent[] = [
      { type: 'zone_crossed', id: 'p1', zone: 'z-gate', tag: 'line' },
      { type: 'zone_crossed', id: 'p1', zone: 'z-gate', tag: 'line' },
      { type: 'custom', name: 'second', id: 'p2' },
    ];
    const result = await dryRun({
      game: game(),
      zones: [GATE, PAD],
      scripts: [script(EXAMPLE)],
      events,
      seed: 5,
    });
    expect(result.requested.map((r) => [(r.action as { kind: string }).kind, r.actor, r.accepted])).toEqual([
      ['add_counter', 'p1', true],
      ['add_counter', 'p1', true],
      ['emit', 'p1', true],
      ['add_score', 'p1', true],
      ['add_score', 'p2', true],
    ]);
    expect(result.players).toEqual(['p1', 'p2']);
    expect(result.counters.players).toEqual({ p1: { n: 2 }, p2: { n: 0 } });
    expect(result.phase).toBe('playing');
  });

  it('the same events and seed give the same result twice; another seed changes only the drawn numbers', async () => {
    const example = script(EXAMPLE);
    const events: ScriptTestEvent[] = [{ type: 'zone_crossed', id: 'p2', zone: 'z-gate', tag: 'line' }];
    const run = (seed: number) => dryRun({ game: game(), zones: [GATE], scripts: [example], events, seed });
    const [a, b, c] = [await run(1), await run(1), await run(2)];
    expect(b.log).toEqual(a.log);
    expect(shape(b.requested)).toEqual(shape(a.requested));
    expect(shape(c.requested)).toEqual(shape(a.requested));
  });

  it('refuses an event naming an unknown handle, a zone the place does not have, or one the engine raises itself', async () => {
    const result = await dryRun({
      game: game(),
      zones: [GATE],
      scripts: [script(EXAMPLE)],
      events: [
        { type: 'zone_crossed', id: 'p9', zone: 'z-gate', tag: 'line' },
        { type: 'zone_entered', id: 'p1', zone: 'nowhere', tag: 'nothing' },
        { type: 'counter_changed', name: 'n', value: 3, id: 'p1' },
        { type: 'hit', victim: 'p2', by: 'p7', damage: 5, health: 95 },
        { type: 'zone_crossed', id: 'p1', zone: 'z-gate', tag: 'line' },
      ],
    });
    expect(result.skipped.map((s) => [s.index, s.type])).toEqual([
      [0, 'zone_crossed'],
      [1, 'zone_entered'],
      [2, 'counter_changed'],
      [3, 'hit'],
    ]);
    expect(result.skipped[0]!.why).toContain('"p9"');
    expect(result.skipped[1]!.why).toContain('no zone');
    expect(result.skipped[2]!.why).toContain('engine raises');
    expect(result.skipped[3]!.why).toContain('"p7"');
    // The good event still ran.
    expect(result.counters.players.p1).toEqual({ n: 1 });
  });

  it('players join when their player_joined comes, in handle order', async () => {
    const result = await dryRun({
      game: game(),
      zones: [GATE],
      scripts: [
        script(`genvr.on('player_joined', (e) => genvr.log('joined', e.id, genvr.players().length));`),
      ],
      events: [
        { type: 'player_joined', id: 'p1', team: null, returning: false },
        { type: 'player_joined', id: 'p3', team: null, returning: false },
        { type: 'player_joined', id: 'p2', team: null, returning: false },
        { type: 'player_left', id: 'p1' },
      ],
    });
    expect(result.skipped.map((s) => s.index)).toEqual([1]);
    expect(result.skipped[0]!.why).toContain('p2');
    expect(result.log.filter((l) => l.level === 'log').map((l) => l.text)).toEqual([
      'joined p1 1',
      'joined p2 2',
    ]);
    expect(result.players).toEqual(['p1', 'p2']);
  });

  it('runs an unsaved draft and only the chosen script', async () => {
    const other = script(`genvr.on('tap', () => genvr.log('other'));`);
    const draft = script(`genvr.on('tap', () => genvr.log('draft'));`);
    const result = await dryRun({
      game: game(),
      zones: [],
      scripts: [other, draft],
      only: draft.id,
      events: [{ type: 'custom', name: 'tap', id: 'p1' }],
    });
    expect(result.log.filter((l) => l.level === 'log').map((l) => l.text)).toEqual(['draft']);
  });

  it('runs a switched-off script when it is the one tested', async () => {
    const off = script(`genvr.on('tap', () => genvr.log('off but tested'));`, 'example off', false);
    const result = await dryRun({
      game: game(),
      zones: [],
      scripts: [off],
      only: off.id,
      events: [{ type: 'custom', name: 'tap', id: 'p1' }],
    });
    expect(result.log.map((l) => l.text)).toContain('off but tested');
  });

  it('times: events happen at their at, timers fire as the clock passes', async () => {
    const result = await dryRun({
      game: game(),
      zones: [],
      scripts: [
        script(`genvr.on('tap', () => genvr.act({ kind: 'start_timer', name: 'later', seconds: 2 }));
genvr.on('timer_fired', (e) => genvr.log('fired at', genvr.now()));`),
      ],
      events: [
        { type: 'custom', name: 'tap', id: 'p1', at: 1000 },
        { type: 'custom', name: 'nothing', id: null, at: 5000 },
      ],
    });
    const fired = result.log.find((l) => l.text.startsWith('fired at'));
    expect(fired?.text).toBe('fired at 3000');
    expect(result.now).toBe(5000);
  });

  it('a hostile script is switched off and the dry run ends', async () => {
    const result = await dryRun({
      game: game(),
      zones: [],
      scripts: [script(`genvr.on('tap', () => { while (true) {} });`)],
      events: Array.from({ length: 5 }, () => ({ type: 'custom' as const, name: 'tap', id: 'p1' })),
    });
    expect(result.status[0]).toMatchObject({ state: 'off', strikes: SCRIPT_LIMITS.strikes });
    expect(result.log.some((l) => l.level === 'off')).toBe(true);
  });

  it('reads the game, zones and spawn points from a place document as the room does', async () => {
    const doc = WorldDocument.parse({
      schemaVersion: 1,
      experienceId: 'exp-dry',
      version: 0,
      style: { base: 'blocky' },
      sizeTier: 'small',
      access: { mode: 'private' },
      environment: { sky: { preset: 'day' }, weather: { preset: 'clear' } },
      terrain: {},
      spawn: { position: [0, 1, 0] },
      instances: [
        {
          instanceId: 'gate-9',
          itemId: ZONE_GATE_ID,
          transform: { position: [5, 0, 10], rotation: [0, 0.7071, 0, 0.7071], scale: [1, 1, 1] },
          params: { zoneTag: 'line' },
        },
      ],
      game: { ...BASE_GAME, rules: [] },
    });
    const result = await dryRun({
      doc,
      scripts: [script(EXAMPLE)],
      events: [{ type: 'zone_crossed', id: 'p2', zone: 'gate-9', tag: 'line' }],
    });
    expect(result.skipped).toEqual([]);
    expect(result.counters.players.p2).toEqual({ n: 1 });
    await expect(
      dryRun({ doc: { ...doc, game: undefined } as WorldDocument, scripts: [], events: [] }),
    ).rejects.toThrow(/no game/);
  });

  it('takes at most 500 events and at most 8 players', async () => {
    await expect(
      dryRun({
        game: game(),
        zones: [],
        scripts: [script('')],
        events: Array.from({ length: SCRIPT_LIMITS.testEvents + 1 }, () => ({
          type: 'custom' as const,
          name: 'x',
          id: null,
        })),
      }),
    ).rejects.toThrow(/500/);
    await expect(
      dryRun({ game: game(), zones: [], scripts: [script('')], events: [], players: 9 }),
    ).rejects.toThrow(/8/);
  });
});
