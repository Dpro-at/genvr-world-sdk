import { Game } from '@genvr/contracts';
import { describe, expect, it } from 'vitest';
import { GameSession, type GameEvent, type Position, type ZoneSpec } from '../src/index.js';

type GameInput = Parameters<typeof Game.parse>[0] & object;

// An area tagged "north" and a gate tagged "south" (crossed going +z). Tags mean nothing to the engine.
const north: ZoneSpec = { id: 'z-north', shape: 'area', tag: 'north', x: 0, y: 0, z: 20, yaw: 0, width: 4, depth: 4 };
const south: ZoneSpec = { id: 'z-south', shape: 'gate', tag: 'south', x: 0, y: 0, z: -20, yaw: 0, width: 6, depth: 0 };

const base = {
  match: { minPlayers: 2, durationSec: 60, countdownSec: 0, resultsSec: 5 },
  win: { by: 'highest_score' as const },
};

const origin = (): Position => ({ x: 0, y: 0, z: 0 });

/** A session built from data only; `a` and `b` join (and `c` when asked), then play starts. */
function setup(extra: Partial<GameInput>, options: { players?: string[]; play?: boolean } = {}) {
  const game = Game.parse({ ...base, ...extra });
  const pos = new Map<string, Position>();
  const log: string[] = [];
  const seen: GameEvent[] = [];
  let now = 0;
  const s = new GameSession(game, [{ x: 0, y: 0, z: 0, team: 'any' }], 0, {
    positions: (id) => pos.get(id) ?? null,
    zones: [north, south],
    log: (message) => log.push(message),
  });
  for (const type of ['match_won', 'placed', 'message', 'timer_fired', 'custom', 'hit', 'score_changed'] as const)
    s.bus.on(type, (event) => seen.push(event));
  for (const id of options.players ?? ['a', 'b']) {
    pos.set(id, origin());
    s.join(id, now);
  }
  const tick = (ms = 100) => {
    now += ms;
    s.tick(now);
  };
  if (options.play !== false) {
    tick(); // countdown (0 s) ends: play starts and everyone is placed
    tick(); // zones take their first trusted positions
  }
  /** Walks into the tagged area and back out (two ticks). */
  const visitNorth = (id: string) => {
    pos.set(id, { x: 0, y: 0, z: 20 });
    tick();
    pos.set(id, origin());
    tick();
  };
  /** Walks forward through the south gate and back around it (three ticks). */
  const crossSouth = (id: string) => {
    pos.set(id, { x: 0, y: 0, z: -22 });
    tick();
    pos.set(id, { x: 0, y: 0, z: -18 });
    tick();
    pos.set(id, origin());
    tick();
  };
  /** Raises a custom event for `id` from outside (a top-level event). */
  const raise = (name: string, id: string | null = 'a') => {
    s.bus.emit({ type: 'custom', name, id });
    s.bus.flush();
  };
  const counter = (name: string, id: string) => s.view().players.get(id)!.counters[name];
  const of = <T extends GameEvent['type']>(type: T) =>
    seen.filter((event): event is Extract<GameEvent, { type: T }> => event.type === type);
  return { s, pos, log, seen, tick, visitNorth, crossSouth, raise, counter, of, now: () => now };
}

const scoreCounter = { name: 'score', scope: 'player' as const, start: 0 };

describe('rules: the example (two zones, one counter, a target)', () => {
  const example: Partial<GameInput> = {
    counters: [scoreCounter],
    rules: [
      { when: { event: 'zone_entered', tag: 'north' }, do: [{ kind: 'add_counter', name: 'score', by: 1 }] },
      {
        when: { event: 'counter_changed', counter: 'score' },
        if: [{ kind: 'counter', name: 'score', op: '>=', value: 2 }],
        do: [{ kind: 'end_match', winner: { byCounter: 'score', order: 'high' } }],
      },
    ],
  };

  it('adds one per entry into the tagged zone and ends the match at the target', () => {
    const t = setup(example);
    expect(t.s.view().phase).toBe('playing');
    t.crossSouth('a'); // another tag: nothing
    expect(t.counter('score', 'a')).toBe(0);
    t.visitNorth('a');
    expect(t.counter('score', 'a')).toBe(1);
    expect(t.of('match_won')).toEqual([]);
    t.visitNorth('a');
    expect(t.counter('score', 'a')).toBe(2);
    expect(t.of('match_won')).toEqual([{ type: 'match_won', winner: { kind: 'player', id: 'a' } }]);
    const view = t.s.view();
    expect(view.phase).toBe('results');
    expect(view.winner).toEqual({ kind: 'player', id: 'a' });
    expect(t.log).toEqual([]);
  });

  it('keeps each player their own counter', () => {
    const t = setup(example);
    t.visitNorth('a');
    t.visitNorth('b');
    expect(t.counter('score', 'a')).toBe(1);
    expect(t.counter('score', 'b')).toBe(1);
    t.visitNorth('b');
    expect(t.counter('score', 'a')).toBe(1);
    expect(t.of('match_won')).toEqual([{ type: 'match_won', winner: { kind: 'player', id: 'b' } }]);
  });

  it('gives the same result for the same events (deterministic)', () => {
    const script = () => {
      const t = setup(example, { players: ['a', 'b', 'c'] });
      t.visitNorth('c');
      t.crossSouth('a');
      t.visitNorth('b');
      t.visitNorth('c');
      return { view: t.s.view(), seen: t.seen };
    };
    const one = script();
    const two = script();
    expect(one.view).toEqual(two.view);
    expect(one.seen).toEqual(two.seen);
    expect(one.view.winner).toEqual({ kind: 'player', id: 'c' });
  });
});

describe('rules: matching', () => {
  it('matches a gate crossing by its tag', () => {
    const t = setup({
      counters: [scoreCounter],
      rules: [{ when: { event: 'zone_crossed', tag: 'south' }, do: [{ kind: 'add_counter', name: 'score', by: 5 }] }],
    });
    t.visitNorth('a');
    t.crossSouth('a');
    expect(t.counter('score', 'a')).toBe(5);
  });

  it('runs the rules in the order they are listed', () => {
    const rules = [
      { when: { event: 'ping' }, do: [{ kind: 'set_counter' as const, name: 'score', to: 1 }] },
      {
        when: { event: 'ping' },
        if: [{ kind: 'counter' as const, name: 'score', op: '=' as const, value: 1 }],
        do: [{ kind: 'add_counter' as const, name: 'score', by: 10 }],
      },
    ];
    const forward = setup({ counters: [scoreCounter], rules });
    forward.raise('ping');
    expect(forward.counter('score', 'a')).toBe(11);
    const backward = setup({ counters: [scoreCounter], rules: [...rules].reverse() });
    backward.raise('ping');
    expect(backward.counter('score', 'a')).toBe(1);
  });

  it('runs the actions of a rule in order', () => {
    const t = setup({
      rules: [
        {
          when: { event: 'ping' },
          do: [
            { kind: 'show_message', text: 'one' },
            { kind: 'show_message', text: 'two' },
            { kind: 'show_message', text: 'three' },
          ],
        },
      ],
    });
    t.raise('ping');
    expect(t.of('message').map((m) => m.text)).toEqual(['one', 'two', 'three']);
  });

  it('takes the actor of a hit or a knock-out from who dealt it; harm nobody dealt has no actor', () => {
    const t = setup({
      health: { max: 10 },
      counters: [{ name: 'hits', scope: 'player', start: 0 }, { name: 'downs', scope: 'player', start: 0 }],
      rules: [
        { when: { event: 'hit' }, do: [{ kind: 'add_counter', name: 'hits', by: 1 }] },
        { when: { event: 'died' }, do: [{ kind: 'add_counter', name: 'downs', by: 1 }] },
      ],
    });
    t.s.damage('b', 4, 'a', t.now());
    expect(t.counter('hits', 'a')).toBe(1);
    t.s.damage('b', 10, null, t.now());
    expect(t.s.view().players.get('b')!.alive).toBe(false);
    // The victim is not credited with harm nobody dealt, and neither is anyone else.
    expect(t.counter('hits', 'b')).toBe(0);
    expect(t.counter('downs', 'b')).toBe(0);
    expect(t.counter('hits', 'a')).toBe(1);
    expect(t.counter('downs', 'a')).toBe(0);
  });
});

describe('rules: conditions', () => {
  it('gates a rule on the phase', () => {
    const t = setup(
      {
        counters: [scoreCounter],
        rules: [
          { when: { event: 'ping' }, if: [{ kind: 'phase', is: 'playing' }], do: [{ kind: 'add_counter', name: 'score', by: 1 }] },
        ],
      },
      { play: false },
    );
    t.raise('ping');
    expect(t.counter('score', 'a')).toBe(0);
    t.tick();
    expect(t.s.view().phase).toBe('playing');
    t.raise('ping');
    expect(t.counter('score', 'a')).toBe(1);
  });

  it('gates a rule on the team of the actor', () => {
    const t = setup({
      teams: { mode: 'two', friendlyFire: false },
      counters: [scoreCounter],
      rules: [{ when: { event: 'ping' }, if: [{ kind: 'team', is: 'blue' }], do: [{ kind: 'add_counter', name: 'score', by: 1 }] }],
    }); // a is red, b is blue
    t.raise('ping', 'a');
    t.raise('ping', 'b');
    expect(t.counter('score', 'a')).toBe(0);
    expect(t.counter('score', 'b')).toBe(1);
  });

  it('compares a counter with another counter of the same actor', () => {
    const t = setup({
      counters: [scoreCounter, { name: 'goal', scope: 'player', start: 2 }, { name: 'done', scope: 'player', start: 0 }],
      rules: [
        { when: { event: 'ping' }, do: [{ kind: 'add_counter', name: 'score', by: 1 }] },
        {
          when: { event: 'ping' },
          if: [{ kind: 'counter', name: 'score', op: '>=', value: { counter: 'goal' } }],
          do: [{ kind: 'set_counter', name: 'done', to: 1 }],
        },
      ],
    });
    t.raise('ping');
    expect(t.counter('done', 'a')).toBe(0);
    t.raise('ping');
    expect(t.counter('done', 'a')).toBe(1);
    expect(t.counter('done', 'b')).toBe(0);
  });

  it('needs every condition to hold', () => {
    const t = setup({
      counters: [scoreCounter],
      rules: [
        {
          when: { event: 'ping' },
          if: [
            { kind: 'phase', is: 'playing' },
            { kind: 'counter', name: 'score', op: '<', value: 2 },
          ],
          do: [{ kind: 'add_counter', name: 'score', by: 1 }],
        },
      ],
    });
    for (let i = 0; i < 5; i += 1) t.raise('ping');
    expect(t.counter('score', 'a')).toBe(2);
  });
});

describe('rules: who', () => {
  const teamGame = (who: 'actor' | 'everyone' | 'team_of_actor'): Partial<GameInput> => ({
    teams: { mode: 'two', friendlyFire: false },
    counters: [
      scoreCounter,
      { name: 'side', scope: 'team', start: 0 },
      { name: 'all', scope: 'global', start: 0 },
    ],
    rules: [
      {
        when: { event: 'ping' },
        do: [
          { kind: 'add_counter', name: 'score', by: 1, who },
          { kind: 'add_counter', name: 'side', by: 1, who },
          { kind: 'add_counter', name: 'all', by: 1, who },
        ],
      },
    ],
  });
  const players = ['a', 'b', 'c']; // a red, b blue, c red

  it('actor: only the actor (and their team, and the global value once)', () => {
    const t = setup(teamGame('actor'), { players });
    t.raise('ping', 'a');
    const view = t.s.view();
    expect(players.map((id) => view.players.get(id)!.counters.score)).toEqual([1, 0, 0]);
    expect(view.teamCounters).toEqual({ red: { side: 1 }, blue: { side: 0 } });
    expect(view.globalCounters).toEqual({ all: 1 });
  });

  it('everyone: every player here and both teams', () => {
    const t = setup(teamGame('everyone'), { players });
    t.raise('ping', 'a');
    const view = t.s.view();
    expect(players.map((id) => view.players.get(id)!.counters.score)).toEqual([1, 1, 1]);
    expect(view.teamCounters).toEqual({ red: { side: 1 }, blue: { side: 1 } });
    expect(view.globalCounters).toEqual({ all: 1 });
  });

  it("team_of_actor: the actor's teammates here", () => {
    const t = setup(teamGame('team_of_actor'), { players });
    t.raise('ping', 'a');
    const view = t.s.view();
    expect(players.map((id) => view.players.get(id)!.counters.score)).toEqual([1, 0, 1]);
    expect(view.teamCounters).toEqual({ red: { side: 1 }, blue: { side: 0 } });
  });

  it('shows a message to the actor, to everyone, or to each teammate', () => {
    const t = setup(
      {
        teams: { mode: 'two', friendlyFire: false },
        rules: [
          {
            when: { event: 'ping' },
            do: [
              { kind: 'show_message', text: 'mine' },
              { kind: 'show_message', text: 'all', who: 'everyone' },
              { kind: 'show_message', text: 'ours', who: 'team_of_actor' },
            ],
          },
        ],
      },
      { players },
    );
    t.raise('ping', 'c');
    expect(t.of('message')).toEqual([
      { type: 'message', id: 'c', text: 'mine' },
      { type: 'message', id: null, text: 'all' },
      { type: 'message', id: 'a', text: 'ours' },
      { type: 'message', id: 'c', text: 'ours' },
    ]);
  });
});

describe('rules: actions', () => {
  it('adds to the score field (and the win component hears it)', () => {
    const t = setup({ rules: [{ when: { event: 'ping' }, do: [{ kind: 'add_score', by: 3 }] }] });
    t.raise('ping');
    expect(t.s.view().players.get('a')!.score).toBe(3);
    expect(t.of('score_changed')).toEqual([{ type: 'score_changed', id: 'a', score: 3 }]);
  });

  it('damages and heals through health', () => {
    const t = setup({
      health: { max: 100 },
      rules: [
        { when: { event: 'hurt' }, do: [{ kind: 'damage', amount: 30 }] },
        { when: { event: 'mend' }, do: [{ kind: 'heal', amount: 50 }] },
      ],
    });
    t.raise('hurt');
    expect(t.s.view().players.get('a')!.health).toBe(70);
    expect(t.of('hit')).toEqual([{ type: 'hit', victim: 'a', by: null, damage: 30, health: 70 }]);
    t.raise('mend');
    expect(t.s.view().players.get('a')!.health).toBe(100); // never above max
    expect(t.s.view().players.get('b')!.health).toBe(100);
  });

  it('moves players to the first zone with the tag, and logs a tag no zone has', () => {
    const t = setup({
      rules: [
        { when: { event: 'go' }, do: [{ kind: 'teleport_to_zone', tag: 'north', who: 'everyone' }] },
        { when: { event: 'lost' }, do: [{ kind: 'teleport_to_zone', tag: 'nowhere' }] },
      ],
    });
    const before = t.of('placed').length;
    t.raise('go');
    expect(t.of('placed').slice(before)).toEqual([
      { type: 'placed', id: 'a', at: { x: 0, y: 0, z: 20, team: 'any' } },
      { type: 'placed', id: 'b', at: { x: 0, y: 0, z: 20, team: 'any' } },
    ]);
    t.raise('lost');
    t.raise('lost');
    expect(t.of('placed').length).toBe(before + 2);
    expect(t.log).toHaveLength(1);
    expect(t.log[0]).toContain('nowhere');
  });

  it('starts a timer that fires once after its time, for the actor who started it', () => {
    const t = setup({
      counters: [scoreCounter],
      rules: [
        { when: { event: 'ping' }, do: [{ kind: 'start_timer', name: 'wait', seconds: 1 }] },
        { when: { event: 'timer_fired' }, do: [{ kind: 'add_counter', name: 'score', by: 1 }] },
      ],
    });
    t.raise('ping', 'b');
    t.tick(500);
    expect(t.of('timer_fired')).toEqual([]);
    t.tick(600);
    expect(t.of('timer_fired')).toEqual([{ type: 'timer_fired', name: 'wait', id: 'b' }]);
    expect(t.counter('score', 'b')).toBe(1);
    t.tick(5000);
    expect(t.of('timer_fired')).toHaveLength(1);
  });

  it('clears the timers when a new match starts', () => {
    const t = setup({ rules: [{ when: { event: 'ping' }, do: [{ kind: 'start_timer', name: 'wait', seconds: 1 }] }] });
    t.raise('ping');
    t.s.bus.emit({ type: 'match_reset' });
    t.s.bus.flush();
    t.tick(2000);
    expect(t.of('timer_fired')).toEqual([]);
  });

  it('chains two rules through a custom event, keeping the actor', () => {
    const t = setup({
      counters: [scoreCounter],
      rules: [
        { when: { event: 'first' }, do: [{ kind: 'emit', event: 'second' }] },
        { when: { event: 'second' }, do: [{ kind: 'add_counter', name: 'score', by: 7 }] },
      ],
    });
    t.raise('first', 'b');
    expect(t.of('custom').map((e) => e.name)).toEqual(['first', 'second']);
    expect(t.of('custom')[1]).toEqual({ type: 'custom', name: 'second', id: 'b' });
    expect(t.counter('score', 'b')).toBe(7);
  });
});

describe('rules: ending the match', () => {
  it('picks the winner by a counter, high or low, with a tie for nobody', () => {
    const counters = [scoreCounter];
    const bump = { when: { event: 'bump' }, do: [{ kind: 'add_counter' as const, name: 'score', by: 1 }] };
    const endBy = (order: 'high' | 'low') => ({
      when: { event: 'end' },
      do: [{ kind: 'end_match' as const, winner: { byCounter: 'score', order } }],
    });
    const high = setup({ counters, rules: [bump, endBy('high')] });
    high.raise('bump', 'b');
    high.raise('end', 'a');
    expect(high.s.view().winner).toEqual({ kind: 'player', id: 'b' });

    const low = setup({ counters, rules: [bump, endBy('low')] });
    low.raise('bump', 'b');
    low.raise('end', 'a');
    expect(low.s.view().winner).toEqual({ kind: 'player', id: 'a' });

    const tie = setup({ counters, rules: [bump, endBy('high')] });
    tie.raise('end', 'a');
    expect(tie.of('match_won')).toEqual([{ type: 'match_won', winner: null }]);
  });

  it('counts a player who left mid-match when picking by a counter', () => {
    const t = setup({
      counters: [scoreCounter],
      rules: [
        { when: { event: 'bump' }, do: [{ kind: 'add_counter', name: 'score', by: 1 }] },
        { when: { event: 'end' }, do: [{ kind: 'end_match', winner: { byCounter: 'score', order: 'high' } }] },
      ],
    }, { players: ['a', 'b', 'c'] });
    t.raise('bump', 'c');
    t.s.leave('c', t.now());
    t.raise('end', 'a');
    expect(t.s.view().winner).toEqual({ kind: 'player', id: 'c' });
  });

  it('names the actor, a team, or nobody', () => {
    const actor = setup({ rules: [{ when: { event: 'end' }, do: [{ kind: 'end_match', winner: { player: 'actor' } }] }] });
    actor.raise('end', 'b');
    expect(actor.s.view().winner).toEqual({ kind: 'player', id: 'b' });
    const team = setup({ rules: [{ when: { event: 'end' }, do: [{ kind: 'end_match', winner: { team: 'blue' } }] }] });
    team.raise('end');
    expect(team.s.view().winner).toEqual({ kind: 'team', team: 'blue' });
    const nobody = setup({ rules: [{ when: { event: 'end' }, do: [{ kind: 'end_match', winner: 'nobody' }] }] });
    nobody.raise('end');
    expect(nobody.of('match_won')).toEqual([{ type: 'match_won', winner: null }]);
    expect(nobody.s.view().phase).toBe('results');
  });

  it('ends a match only while playing and only once per match', () => {
    const t = setup(
      {
        rules: [
          { when: { event: 'end' }, do: [{ kind: 'end_match', winner: { player: 'actor' } }] },
          { when: { event: 'end' }, do: [{ kind: 'end_match', winner: 'nobody' }] },
        ],
      },
      { play: false },
    );
    t.raise('end', 'a'); // still gathering
    expect(t.of('match_won')).toEqual([]);
    t.tick(); // play starts
    t.raise('end', 'a');
    t.raise('end', 'b'); // results now
    expect(t.of('match_won')).toEqual([{ type: 'match_won', winner: { kind: 'player', id: 'a' } }]);
    t.tick(5000); // results over: a new match gathers, counts down (0 s) ...
    t.tick(); // ... and plays
    expect(t.s.view().phase).toBe('playing');
    t.raise('end', 'b');
    expect(t.of('match_won')).toEqual([
      { type: 'match_won', winner: { kind: 'player', id: 'a' } },
      { type: 'match_won', winner: { kind: 'player', id: 'b' } },
    ]);
  });
});

describe('rules: safety', () => {
  it('stops an endless emit loop at the chain limit and logs one line', () => {
    const t = setup({
      counters: [scoreCounter],
      rules: [
        {
          when: { event: 'again' },
          do: [
            { kind: 'add_counter', name: 'score', by: 1 },
            { kind: 'emit', event: 'again' },
          ],
        },
      ],
    });
    t.raise('again');
    // The raised event and 8 chained ones run; the 9th chained one is dropped.
    expect(t.counter('score', 'a')).toBe(9);
    expect(t.log).toHaveLength(1);
    expect(t.log[0]).toContain('chain');
  });

  it('stops after 64 actions for one top-level event and logs one line', () => {
    const t = setup({
      counters: [scoreCounter],
      rules: [
        {
          when: { event: 'split' },
          do: [
            { kind: 'add_counter', name: 'score', by: 1 },
            { kind: 'emit', event: 'split' },
            { kind: 'emit', event: 'split' },
          ],
        },
      ],
    });
    t.raise('split');
    // 21 full runs use 63 actions; the 22nd adds (64) and its emits are dropped.
    expect(t.counter('score', 'a')).toBe(22);
    expect(t.log).toHaveLength(1);
    expect(t.log[0]).toContain('64');
    t.raise('split'); // a new top-level event has a new budget
    expect(t.counter('score', 'a')).toBe(44);
  });

  it('ignores a rule that names an unknown counter and logs it once', () => {
    const t = setup({
      counters: [scoreCounter],
      rules: [
        { when: { event: 'ping' }, do: [{ kind: 'add_counter', name: 'missing', by: 1 }] },
        { when: { event: 'ping' }, if: [{ kind: 'counter', name: 'missing', op: '=', value: 0 }], do: [{ kind: 'add_counter', name: 'score', by: 1 }] },
        { when: { event: 'ping' }, do: [{ kind: 'set_counter', name: 'missing', to: 3 }] },
      ],
    });
    t.raise('ping');
    t.raise('ping');
    expect(t.counter('score', 'a')).toBe(0);
    expect(t.s.view().players.get('a')!.counters).toEqual({ score: 0 });
    expect(t.log).toHaveLength(1);
    expect(t.log[0]).toContain('missing');
  });
});

describe('rules: one decision per match', () => {
  const endRule = { when: { event: 'end' }, do: [{ kind: 'end_match' as const, winner: 'nobody' as const }] };

  it('ends a game without win one tick after the clock runs out, with no winner', () => {
    const t = setup({ win: undefined, rules: [endRule] });
    t.tick(60_000); // the clock runs out: time_up, nothing decides
    expect(t.s.view().phase).toBe('playing');
    t.tick();
    expect(t.of('match_won')).toEqual([{ type: 'match_won', winner: null }]);
    expect(t.s.view().phase).toBe('results');
  });

  it('lets a rule chain started by time_up name its own winner', () => {
    const t = setup({
      win: undefined,
      rules: [
        { when: { event: 'time_up' }, do: [{ kind: 'emit', event: 'late' }] },
        { when: { event: 'late' }, do: [{ kind: 'end_match', winner: { team: 'blue' } }] },
      ],
    });
    t.tick(60_000);
    t.tick();
    t.tick();
    expect(t.of('match_won')).toEqual([{ type: 'match_won', winner: { kind: 'team', team: 'blue' } }]);
    expect(t.s.view().winner).toEqual({ kind: 'team', team: 'blue' });
  });

  it('ends a game without win when everyone has left, unless someone came back', () => {
    const t = setup({ win: undefined, rules: [endRule] });
    t.s.leave('a', t.now());
    t.s.leave('b', t.now());
    t.s.join('a', t.now());
    t.tick();
    expect(t.s.view().phase).toBe('playing');
    t.s.leave('a', t.now());
    t.tick();
    expect(t.of('match_won')).toEqual([{ type: 'match_won', winner: null }]);
    expect(t.s.view().phase).toBe('results');
  });

  it('raises one match_won when a rule and the score goal decide in the same flush', () => {
    const t = setup({
      teams: { mode: 'two', friendlyFire: false },
      score: { from: 'kills', goal: 3 },
      rules: [{ when: { event: 'ping' }, do: [{ kind: 'add_score', by: 3 }, { kind: 'end_match', winner: { player: 'actor' } }] }],
    });
    t.raise('ping', 'a');
    expect(t.of('match_won')).toEqual([{ type: 'match_won', winner: { kind: 'player', id: 'a' } }]);
    expect(t.s.view().winner).toEqual({ kind: 'player', id: 'a' });
    expect(t.s.view().phase).toBe('results');
  });

  it('drops the running timers when the match is decided', () => {
    const t = setup({
      rules: [
        { when: { event: 'ping' }, do: [{ kind: 'start_timer', name: 'wait', seconds: 1 }] },
        { when: { event: 'end' }, do: [{ kind: 'end_match', winner: 'nobody' }] },
      ],
    });
    t.raise('ping');
    t.raise('end');
    expect(t.s.view().phase).toBe('results');
    t.tick(1500);
    expect(t.s.view().phase).toBe('results');
    expect(t.of('timer_fired')).toEqual([]);
  });
});
