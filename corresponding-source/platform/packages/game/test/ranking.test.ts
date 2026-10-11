import { Game } from '@genvr/contracts';
import { describe, expect, it } from 'vitest';
import { GameSession, type GameEvent, type Position } from '../src/index.js';

type GameInput = Parameters<typeof Game.parse>[0] & object;

const base = {
  match: { minPlayers: 2, durationSec: 60, countdownSec: 0, resultsSec: 5 },
};

const counters = [
  { name: 'score', scope: 'player' as const, start: 0 },
  { name: 'goal', scope: 'player' as const, start: 0 },
  { name: 'shared', scope: 'team' as const, start: 0 },
];

/** `up` adds 1 to the actor's score, `goal` 1 to their goal counter, `down` takes 1 from their score. */
const rules = [
  { when: { event: 'up' }, do: [{ kind: 'add_counter' as const, name: 'score', by: 1 }] },
  { when: { event: 'down' }, do: [{ kind: 'add_counter' as const, name: 'score', by: -1 }] },
  { when: { event: 'goal' }, do: [{ kind: 'add_counter' as const, name: 'goal', by: 1 }] },
  { when: { event: 'end' }, do: [{ kind: 'end_match' as const, winner: 'nobody' as const }] },
];

function setup(extra: Partial<GameInput>, players: string[] = ['a', 'b', 'c']) {
  const game = Game.parse({ ...base, counters, rules, ...extra });
  const log: string[] = [];
  const seen: GameEvent[] = [];
  let now = 0;
  const s = new GameSession(game, [{ x: 0, y: 0, z: 0, team: 'any' }], 0, {
    positions: (): Position => ({ x: 0, y: 0, z: 0 }),
    log: (message) => log.push(message),
  });
  s.bus.on('match_won', (event) => seen.push(event));
  for (const id of players) s.join(id, now);
  const tick = (ms = 100) => {
    now += ms;
    s.tick(now);
  };
  tick(); // countdown (0 s) ends: play starts
  /** Raises a custom event for `id` from outside, one tick later (so each change has its own time). */
  const raise = (name: string, id: string) => {
    tick();
    s.bus.emit({ type: 'custom', name, id });
    s.bus.flush();
  };
  const place = (id: string) => s.view().players.get(id)!.place;
  const places = () => Object.fromEntries([...s.view().players].map(([id, row]) => [id, row.place]));
  const won = () => seen.filter((e): e is Extract<GameEvent, { type: 'match_won' }> => e.type === 'match_won');
  return { s, log, tick, raise, place, places, won, now: () => now };
}

describe('ranking: order by a player counter', () => {
  it('orders by the highest value with order high', () => {
    const t = setup({ ranking: { by: 'score', order: 'high' } });
    t.raise('up', 'b');
    t.raise('up', 'b');
    t.raise('up', 'c');
    expect(t.places()).toEqual({ a: 3, b: 1, c: 2 });
  });

  it('orders by the lowest value with order low', () => {
    const t = setup({ ranking: { by: 'score', order: 'low' } });
    t.raise('up', 'b');
    t.raise('up', 'b');
    t.raise('up', 'c');
    expect(t.places()).toEqual({ a: 1, b: 3, c: 2 });
  });

  it('fills places as soon as the players join and play starts', () => {
    const t = setup({ ranking: { by: 'score', order: 'high' } });
    expect(t.places()).toEqual({ a: 1, b: 2, c: 3 });
  });

  it('breaks a tie with the then counter, in the same order', () => {
    const t = setup({ ranking: { by: 'score', order: 'high', then: 'goal' } });
    t.raise('up', 'a');
    t.raise('up', 'b');
    t.raise('goal', 'b');
    expect(t.place('b')).toBe(1);
    expect(t.place('a')).toBe(2);
    expect(t.place('c')).toBe(3);
  });

  it('breaks a full tie by who reached their value first, not by join order', () => {
    const t = setup({ ranking: { by: 'score', order: 'high' } });
    t.raise('up', 'c');
    t.raise('up', 'b');
    t.raise('up', 'a');
    expect(t.places()).toEqual({ c: 1, b: 2, a: 3 });
    // b goes up and back down: b reached 1 again later than a did.
    t.raise('up', 'b');
    t.raise('down', 'b');
    expect(t.places()).toEqual({ c: 1, a: 2, b: 3 });
  });

  it('uses the then counter time when it was reached after the ranking counter', () => {
    const t = setup({ ranking: { by: 'score', order: 'high', then: 'goal' } });
    t.raise('up', 'a');
    t.raise('up', 'b');
    t.raise('goal', 'b');
    t.raise('goal', 'a'); // both at score 1, goal 1: b got there first
    expect(t.place('b')).toBe(1);
    expect(t.place('a')).toBe(2);
  });

  it('keeps the rows of players who left, with their place', () => {
    const t = setup({ ranking: { by: 'score', order: 'high' } });
    t.raise('up', 'b');
    t.s.leave('b', t.now());
    expect(t.s.view().players.get('b')!.present).toBe(false);
    expect(t.places()).toEqual({ a: 2, b: 1, c: 3 });
    t.raise('up', 'c');
    t.raise('up', 'c');
    expect(t.places()).toEqual({ a: 3, b: 2, c: 1 });
  });

  it('resets every place to 0 when the next match is set up', () => {
    const t = setup({ ranking: { by: 'score', order: 'high' } });
    t.raise('up', 'b');
    t.raise('end', 'a');
    expect(t.s.view().phase).toBe('results');
    t.tick(5_000); // results end: match_reset, then the next countdown
    expect(t.s.view().phase).toBe('countdown');
    expect(t.places()).toEqual({ a: 0, b: 0, c: 0 });
    t.tick(); // play starts again: everyone is back at the start value
    expect(t.places()).toEqual({ a: 1, b: 2, c: 3 });
  });
});

describe('ranking: bad data', () => {
  it('logs once and leaves places at 0 for an undeclared counter', () => {
    const t = setup({ ranking: { by: 'missing', order: 'high' } });
    t.raise('up', 'a');
    t.raise('up', 'b');
    expect(t.places()).toEqual({ a: 0, b: 0, c: 0 });
    expect(t.log.filter((m) => m.includes('missing'))).toHaveLength(1);
  });

  it('logs once and leaves places at 0 for a counter that is not per player', () => {
    const t = setup({ ranking: { by: 'shared', order: 'high' } });
    t.raise('up', 'a');
    t.raise('up', 'b');
    expect(t.places()).toEqual({ a: 0, b: 0, c: 0 });
    expect(t.log.filter((m) => m.includes('shared'))).toHaveLength(1);
  });

  it('leaves a game without ranking unaffected (place stays 0)', () => {
    const t = setup({});
    t.raise('up', 'a');
    t.raise('up', 'a');
    expect(t.places()).toEqual({ a: 0, b: 0, c: 0 });
    expect(t.log).toEqual([]);
  });
});

describe('ranking: deciding the winner', () => {
  it('names the first-ranked player when the clock ends a match no rule decided', () => {
    const t = setup({ ranking: { by: 'score', order: 'high' } });
    t.raise('up', 'b');
    t.tick(60_000); // the clock runs out: time_up, no rule decides
    t.tick();
    expect(t.won()).toEqual([{ type: 'match_won', winner: { kind: 'player', id: 'b' } }]);
    expect(t.s.view().winner).toEqual({ kind: 'player', id: 'b' });
  });

  it('names the first by reached-first when the clock ends a tie', () => {
    const t = setup({ ranking: { by: 'score', order: 'high' } });
    t.raise('up', 'c');
    t.raise('up', 'a');
    t.tick(60_000);
    t.tick();
    expect(t.won()).toEqual([{ type: 'match_won', winner: { kind: 'player', id: 'c' } }]);
  });

  it('names nobody when the clock ends a match in which nobody moved', () => {
    const t = setup({ ranking: { by: 'score', order: 'high' } });
    t.tick(60_000);
    t.tick();
    expect(t.won()).toEqual([{ type: 'match_won', winner: null }]);
  });

  it('names nobody at the clock without a ranking, even when somebody moved', () => {
    const t = setup({});
    t.raise('up', 'b');
    t.tick(60_000);
    t.tick();
    expect(t.won()).toEqual([{ type: 'match_won', winner: null }]);
  });

  it('breaks a tie of end_match byCounter by reached-first for the ranking counter', () => {
    const t = setup({
      ranking: { by: 'score', order: 'high' },
      rules: [...rules, { when: { event: 'stop' }, do: [{ kind: 'end_match', winner: { byCounter: 'score', order: 'high' } }] }],
    });
    t.raise('up', 'b');
    t.raise('up', 'a');
    t.raise('stop', 'a');
    expect(t.won()).toEqual([{ type: 'match_won', winner: { kind: 'player', id: 'b' } }]);
  });

  it('counts a change made by the same rule that ends the match', () => {
    const t = setup({
      ranking: { by: 'score', order: 'high' },
      rules: [
        ...rules,
        {
          when: { event: 'last' },
          do: [
            { kind: 'add_counter', name: 'score', by: 1 },
            { kind: 'end_match', winner: { byCounter: 'score', order: 'high' } },
          ],
        },
      ],
    });
    t.raise('up', 'a');
    t.raise('last', 'b'); // b reaches 1 later than a, then the match ends at once
    expect(t.won()).toEqual([{ type: 'match_won', winner: { kind: 'player', id: 'a' } }]);
  });

  it('keeps "a tie names nobody" for end_match by another counter', () => {
    const t = setup({
      ranking: { by: 'score', order: 'high' },
      rules: [...rules, { when: { event: 'stop' }, do: [{ kind: 'end_match', winner: { byCounter: 'goal', order: 'high' } }] }],
    });
    t.raise('goal', 'b');
    t.raise('goal', 'a');
    t.raise('stop', 'a');
    expect(t.won()).toEqual([{ type: 'match_won', winner: null }]);
  });
});

describe('ranking: movement counts on the then counter too', () => {
  it('names the player who only moved the then counter when the clock ends the match', () => {
    const t = setup({ ranking: { by: 'score', order: 'high', then: 'goal' } });
    t.raise('goal', 'c');
    expect(t.place('c')).toBe(1);
    t.tick(60_000);
    t.tick();
    expect(t.won()).toEqual([{ type: 'match_won', winner: { kind: 'player', id: 'c' } }]);
  });

  it('gives the same answer for end_match by the ranking counter', () => {
    const t = setup({
      ranking: { by: 'score', order: 'high', then: 'goal' },
      rules: [...rules, { when: { event: 'stop' }, do: [{ kind: 'end_match', winner: { byCounter: 'score', order: 'high' } }] }],
    });
    t.raise('goal', 'c');
    t.raise('stop', 'a');
    expect(t.won()).toEqual([{ type: 'match_won', winner: { kind: 'player', id: 'c' } }]);
  });
});

describe('ranking: fix round 1', () => {
  const onTimeUp = (order: 'high' | 'low') => ({
    when: { event: 'time_up' },
    do: [{ kind: 'end_match' as const, winner: { byCounter: 'score', order } }],
  });

  it('names nobody when a rule ends by the ranking counter and nobody moved', () => {
    const t = setup({ ranking: { by: 'score', order: 'high' }, rules: [...rules, onTimeUp('high')] });
    t.tick(60_000);
    t.tick();
    expect(t.won()).toEqual([{ type: 'match_won', winner: null }]);
  });

  it('names the one who moved when a rule ends by the ranking counter', () => {
    const t = setup({ ranking: { by: 'score', order: 'high' }, rules: [...rules, onTimeUp('high')] });
    t.raise('up', 'c');
    t.tick(60_000);
    t.tick();
    expect(t.won()).toEqual([{ type: 'match_won', winner: { kind: 'player', id: 'c' } }]);
  });

  it('resolves a tie with movement by reached-first when a rule ends by the ranking counter', () => {
    const t = setup({ ranking: { by: 'score', order: 'high' }, rules: [...rules, onTimeUp('high')] });
    t.raise('up', 'b');
    t.raise('up', 'a');
    t.tick(60_000);
    t.tick();
    expect(t.won()).toEqual([{ type: 'match_won', winner: { kind: 'player', id: 'b' } }]);
  });

  it('counts movement by any player, also one not ranked first', () => {
    // Lowest first: a and b stay at the start value, c moved up; a leads and wins.
    const t = setup({ ranking: { by: 'score', order: 'low' } });
    t.raise('up', 'c');
    t.tick(60_000);
    t.tick();
    expect(t.won()).toEqual([{ type: 'match_won', winner: { kind: 'player', id: 'a' } }]);
  });

  it('keeps "a tie names nobody" for end_match by the ranking counter in the opposite order', () => {
    const t = setup({ ranking: { by: 'score', order: 'high' }, rules: [...rules, onTimeUp('low')] });
    t.raise('up', 'a');
    t.raise('up', 'b');
    t.raise('up', 'c');
    t.tick(60_000);
    t.tick();
    expect(t.won()).toEqual([{ type: 'match_won', winner: null }]);
  });

  it('breaks a tie with the then counter in order low', () => {
    const t = setup({ ranking: { by: 'score', order: 'low', then: 'goal' } });
    t.raise('goal', 'a');
    t.raise('goal', 'a');
    t.raise('goal', 'c');
    expect(t.places()).toEqual({ b: 1, c: 2, a: 3 });
  });

  it('logs a bad then counter once and ranks without it', () => {
    const t = setup({ ranking: { by: 'score', order: 'high', then: 'nothing' } });
    t.raise('up', 'b');
    t.raise('up', 'c');
    expect(t.places()).toEqual({ b: 1, c: 2, a: 3 });
    expect(t.log.filter((m) => m.includes('nothing'))).toHaveLength(1);
  });

  it('ranks a mid-match joiner behind the players who already stand at the start value', () => {
    const t = setup({ ranking: { by: 'score', order: 'high' } }, ['a', 'b']);
    t.raise('up', 'a');
    t.raise('down', 'a'); // a is back at the start value, reached at this time
    t.tick();
    t.s.join('c', t.now());
    expect(t.places()).toEqual({ b: 1, a: 2, c: 3 });
  });

  it('clears the reached times when the next match is set up', () => {
    const t = setup({ ranking: { by: 'score', order: 'high' } });
    t.raise('up', 'a');
    t.raise('down', 'a'); // a reached the start value late: last this match
    expect(t.places()).toEqual({ b: 1, c: 2, a: 3 });
    t.raise('end', 'b');
    t.tick(5_000);
    t.tick(); // the next match plays: everyone is back at the start from the start
    expect(t.s.view().phase).toBe('playing');
    expect(t.places()).toEqual({ a: 1, b: 2, c: 3 });
  });

  it('does not re-rank on a counter the ranking does not use', () => {
    const t = setup({ ranking: { by: 'score', order: 'high' } });
    const row = t.s.view().players; // the places filled at play start
    expect(row.get('a')!.place).toBe(1);
    t.raise('goal', 'c');
    expect(t.places()).toEqual({ a: 1, b: 2, c: 3 });
  });
});
