import { Game } from '@genvr/contracts';
import { describe, expect, it } from 'vitest';
import { GameSession, type GameEvent, type Position, type SpawnSpot, type ZoneSpec } from '../src/index.js';

/**
 * Examples: designs built only from zones, counters and rules (data), played by fake positions.
 * They prove the generic engine carries what used to be dedicated components; the words here are
 * the designer's own and mean nothing to the engine.
 */

type GameInput = Parameters<typeof Game.parse>[0] & object;

const base = {
  match: { minPlayers: 2, durationSec: 600, countdownSec: 0, resultsSec: 5 },
};

const START: SpawnSpot[] = [
  { x: -2, y: 0, z: 0, team: 'any' },
  { x: 2, y: 0, z: 0, team: 'any' },
];

/** A session built from data only; `a` and `b` join at z = 0, then play starts. */
function play(input: GameInput, zones: ZoneSpec[] = []) {
  const game = Game.parse(input);
  const at = new Map<string, Position>([
    ['a', { x: 0, y: 0, z: 0 }],
    ['b', { x: 0, y: 0, z: 0 }],
  ]);
  const seen: GameEvent[] = [];
  const log: string[] = [];
  let now = 0;
  const session = new GameSession(game, START, 0, {
    positions: (id) => at.get(id) ?? null,
    zones,
    log: (message) => log.push(message),
  });
  for (const type of ['zone_crossed', 'counter_changed', 'match_won', 'hit', 'died'] as const)
    session.bus.on(type, (event) => seen.push(event));
  session.join('a', now);
  session.join('b', now);
  const step = (ms = 100) => {
    now += ms;
    session.tick(now);
  };
  step(); // the 0 s countdown ends: play starts
  // The placement moved nobody here (positions are ours): restore z = 0, then take a first sample.
  at.set('a', { x: 0, y: 0, z: 0 });
  at.set('b', { x: 0, y: 0, z: 0 });
  step();
  /** Moves `id` through the given z values (at x), one tick each. */
  const move = (id: string, zs: number[], x = 0) => {
    for (const z of zs) {
      at.set(id, { x, y: 0, z });
      step();
    }
  };
  const row = (id: string) => session.view().players.get(id)!;
  return { session, seen, log, step, move, row, now: () => now };
}

describe('example: a two-round course of three gates, only counters and rules', () => {
  /** Gates tagged "a", "b", "c" across a straight path along +z (crossed going +z), 12 m wide. */
  const gate = (tag: string, z: number): ZoneSpec => ({
    id: `gate-${tag}`, shape: 'gate', tag, x: 0, y: 0, z, yaw: 0, width: 12, depth: 0,
  });
  const GATES = [gate('a', 10), gate('b', 20), gate('c', 30)];
  /** Through a, b and c in order. */
  const ROUND = [5, 12, 18, 22, 28, 32];
  /** Back to the start along the path (every gate the wrong way: nothing counts). */
  const BACK = [28, 22, 18, 12, 5, 0];

  const course: GameInput = {
    ...base,
    counters: [
      { name: 'step', scope: 'player', start: 0 },
      { name: 'rounds', scope: 'player', start: 0 },
    ],
    rules: [
      {
        when: { event: 'zone_crossed', tag: 'a' },
        if: [{ kind: 'counter', name: 'step', op: '=', value: 0 }],
        do: [{ kind: 'set_counter', name: 'step', to: 1 }],
      },
      {
        when: { event: 'zone_crossed', tag: 'b' },
        if: [{ kind: 'counter', name: 'step', op: '=', value: 1 }],
        do: [{ kind: 'set_counter', name: 'step', to: 2 }],
      },
      {
        when: { event: 'zone_crossed', tag: 'c' },
        if: [{ kind: 'counter', name: 'step', op: '=', value: 2 }],
        do: [
          { kind: 'add_counter', name: 'rounds', by: 1 },
          { kind: 'set_counter', name: 'step', to: 0 },
        ],
      },
      {
        when: { event: 'counter_changed', counter: 'rounds' },
        if: [{ kind: 'counter', name: 'rounds', op: '>=', value: 2 }],
        do: [{ kind: 'end_match', winner: { byCounter: 'rounds', order: 'high' } }],
      },
    ],
    ranking: { by: 'rounds', order: 'high', then: 'step' },
  };

  it('counts the gates in order, completes a round, and ends after two rounds with the winner first', () => {
    const { move, row, seen, session } = play(course, GATES);
    move('a', ROUND);
    expect(row('a').counters).toEqual({ step: 0, rounds: 1 });
    // b is part way: through a and b, so one step on, not yet a round.
    move('b', [5, 12, 18, 22]);
    expect(row('b').counters).toEqual({ step: 2, rounds: 0 });
    expect([row('a').place, row('b').place]).toEqual([1, 2]);
    move('a', BACK);
    expect(row('a').counters).toEqual({ step: 0, rounds: 1 });
    move('a', ROUND);
    expect(row('a').counters.rounds).toBe(2);
    expect(session.view().phase).toBe('results');
    expect(session.view().winner).toEqual({ kind: 'player', id: 'a' });
    expect(seen.filter((e) => e.type === 'match_won')).toHaveLength(1);
    expect([row('a').place, row('b').place]).toEqual([1, 2]);
  });

  it('ranks by rounds, then by step: one further along the path is ahead with equal rounds', () => {
    const { move, row } = play(course, GATES);
    move('b', [5, 12]);
    expect([row('a').place, row('b').place]).toEqual([2, 1]);
    move('a', [5, 12, 18, 22]);
    expect([row('a').place, row('b').place]).toEqual([1, 2]);
  });

  it('does not count a skipped gate: going round "a" leaves "b" and "c" without effect', () => {
    const { move, row } = play(course, GATES);
    move('a', [4, 8, 14], 20); // beside gate a (x = 20 is outside its 12 m width)
    move('a', [18, 22, 28, 32], 0); // then through b and c
    expect(row('a').counters).toEqual({ step: 0, rounds: 0 });
  });

  it('does not count the wrong way: passing c, b, a backwards changes nothing', () => {
    const { move, row } = play(course, GATES);
    move('a', [5, 15, 25, 35], 20); // beside every gate to the far end
    move('a', [32, 28, 22, 18, 12, 5], 0); // back along the path, every gate the wrong way
    expect(row('a').counters).toEqual({ step: 0, rounds: 0 });
    expect(row('a').place).toBe(1); // nobody moved: join order
  });
});

describe('example: a knockout, only health, damage and rules', () => {
  const knockout: GameInput = {
    ...base,
    health: { max: 50 },
    respawn: { delaySec: 0, protectSec: 0 },
    counters: [
      { name: 'hits', scope: 'player', start: 0 },
      { name: 'downs', scope: 'player', start: 0 },
    ],
    rules: [
      // The actor of a hit or a knock-out is the one who dealt it.
      { when: { event: 'hit' }, do: [{ kind: 'add_counter', name: 'hits', by: 1 }] },
      { when: { event: 'died' }, do: [{ kind: 'add_counter', name: 'downs', by: 1 }] },
      {
        when: { event: 'counter_changed', counter: 'downs' },
        if: [{ kind: 'counter', name: 'downs', op: '>=', value: 2 }],
        do: [{ kind: 'end_match', winner: { player: 'actor' } }],
      },
    ],
    ranking: { by: 'downs', order: 'high', then: 'hits' },
  };

  it('counts hits and knock-outs for the one who dealt them and ends at the target', () => {
    const { session, row, step, now, seen } = play(knockout);
    session.damage('b', 25, 'a', now());
    expect(row('a').counters).toEqual({ hits: 1, downs: 0 });
    session.damage('b', 25, 'a', now());
    expect(row('a').counters).toEqual({ hits: 2, downs: 1 });
    expect(row('b').alive).toBe(false);
    step(); // b comes back at once (delay 0)
    expect(row('b').alive).toBe(true);
    session.damage('a', 25, 'b', now());
    expect(row('b').counters).toEqual({ hits: 1, downs: 0 });
    expect([row('a').place, row('b').place]).toEqual([1, 2]);
    expect(session.view().phase).toBe('playing');
    session.damage('b', 25, 'a', now());
    session.damage('b', 25, 'a', now());
    expect(row('a').counters).toEqual({ hits: 4, downs: 2 });
    expect(session.view().phase).toBe('results');
    expect(session.view().winner).toEqual({ kind: 'player', id: 'a' });
    expect(seen.filter((e) => e.type === 'match_won')).toHaveLength(1);
  });

  it('gives nobody credit for harm without a dealer (a place hurting a player)', () => {
    const { session, row, now } = play(knockout);
    session.damage('b', 25, null, now());
    expect(row('b').health).toBe(25);
    // Without a dealer there is no actor (see `actorOf`): the victim is not credited either.
    expect(row('a').counters).toEqual({ hits: 0, downs: 0 });
    expect(row('b').counters).toEqual({ hits: 0, downs: 0 });
  });
});

describe('example: a hazard zone, only an area, damage and rules', () => {
  const hazard = (extra: unknown[] = []): GameInput => ({
    ...base,
    health: { max: 50 },
    respawn: { delaySec: 5, protectSec: 0 },
    counters: [{ name: 'downs', scope: 'player', start: 0 }],
    rules: [
      // Stepping into the hazard hurts whoever stepped in.
      { when: { event: 'zone_entered', tag: 'hazard' }, do: [{ kind: 'damage', amount: 25 }] },
      { when: { event: 'died' }, do: [{ kind: 'add_counter', name: 'downs', by: 1 }] },
      { when: { event: 'time_up' }, do: [{ kind: 'end_match', winner: 'nobody' }] },
      ...extra,
    ],
  });
  /** A 4 m square area tagged "hazard" at z = 10. */
  const ZONES: ZoneSpec[] = [{ id: 'pit', shape: 'area', tag: 'hazard', x: 0, y: 0, z: 10, yaw: 0, width: 4, depth: 4 }];

  it('hurts the one who stepped in and credits nobody with the knock-out', () => {
    const { move, row, session } = play(hazard(), ZONES);
    move('a', [5, 10]); // in: 25
    expect(row('a').health).toBe(25);
    move('a', [5, 10]); // out and in again: knocked out
    expect(row('a').alive).toBe(false);
    expect(row('a').counters).toEqual({ downs: 0 });
    expect(row('b').counters).toEqual({ downs: 0 });
    expect(session.view().phase).toBe('playing');
  });

  it('does not make the victim the winner of a rule that ends with the actor', () => {
    const { move, session, seen } = play(
      hazard([{ when: { event: 'died' }, do: [{ kind: 'end_match', winner: { player: 'actor' } }] }]),
      ZONES,
    );
    move('a', [5, 10, 5, 10]);
    expect(session.view().phase).toBe('results');
    expect(seen.filter((e) => e.type === 'match_won')).toEqual([{ type: 'match_won', winner: null }]);
  });
});
