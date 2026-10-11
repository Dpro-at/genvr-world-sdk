import { Game, RULE_LIMITS, type Action } from '@genvr/contracts';
import { describe, expect, it } from 'vitest';
import {
  GameSession,
  type GameEvent,
  type Position,
  type ScriptHost,
  type ScriptSessionApi,
  type ZoneSpec,
} from '../src/index.js';

type GameInput = Parameters<typeof Game.parse>[0] & object;

const gate: ZoneSpec = {
  id: 'z-gate',
  shape: 'gate',
  tag: 'line',
  x: 0,
  y: 0,
  z: -20,
  yaw: 0,
  width: 6,
  depth: 0,
};
const base = {
  match: { minPlayers: 2, durationSec: 60, countdownSec: 0, resultsSec: 3 },
  win: { by: 'highest_score' as const },
  counters: [{ name: 'n', scope: 'player' as const, start: 0 }],
};

/** A fake script host: records what it hears (with the order it heard it in) and runs `react` for each event. */
function fakeHost(
  events: ReadonlyArray<GameEvent['type']>,
  react: (event: GameEvent, api: ScriptSessionApi) => void = () => {},
) {
  const heard: GameEvent[] = [];
  let resets = 0;
  const host: ScriptHost = {
    events,
    hear(event, api) {
      heard.push(event);
      react(event, api);
    },
    matchReset() {
      resets += 1;
    },
  };
  return { host, heard, resets: () => resets };
}

function setup(extra: Partial<GameInput>, host?: ScriptHost) {
  const game = Game.parse({ ...base, ...extra });
  const pos = new Map<string, Position>();
  const log: string[] = [];
  const order: string[] = [];
  let now = 0;
  const s = new GameSession(game, [{ x: 0, y: 0, z: 0, team: 'any' }], 0, {
    positions: (id) => pos.get(id) ?? null,
    zones: [gate],
    log: (message) => log.push(message),
    ...(host ? { scripts: host } : {}),
  });
  for (const id of ['a', 'b']) {
    pos.set(id, { x: 0, y: 0, z: 0 });
    s.join(id, now);
  }
  const tick = (ms = 100) => {
    now += ms;
    s.tick(now);
  };
  tick();
  tick();
  const raise = (name: string, id: string | null = 'a') => {
    s.bus.emit({ type: 'custom', name, id });
    s.bus.flush();
  };
  const counter = (id: string) => s.view().players.get(id)!.counters.n;
  return { s, pos, log, order, tick, raise, counter, now: () => now };
}

const add = (by = 1): Action => ({ kind: 'add_counter', name: 'n', by, who: 'actor' });

describe('script host hook', () => {
  it('hears the events it asked for, after the rules', () => {
    const order: string[] = [];
    const fake = fakeHost(['custom'], (event) => {
      if (event.type === 'custom') order.push(`script:${event.name}`);
    });
    const t = setup(
      {
        rules: [{ when: { event: 'ping' }, do: [{ kind: 'add_counter', name: 'n', by: 1 }] }],
      },
      fake.host,
    );
    t.s.bus.on('counter_changed', () => order.push('counter'));
    t.raise('ping');
    // The rule ran (its add raised counter_changed, delivered after the custom event) and the host heard 'ping' after it.
    expect(t.counter('a')).toBe(1);
    expect(order).toEqual(['script:ping', 'counter']);
    expect(fake.heard.filter((e) => e.type === 'custom')).toHaveLength(1);
  });

  it('runs the rules first for the same event', () => {
    const fake = fakeHost(['custom'], (_event, api) => {
      // The rule's add is already applied when the host hears the event.
      expect(api.view().players.get('a')!.counters.n).toBe(1);
    });
    const t = setup({ rules: [{ when: { event: 'ping' }, do: [add()] }] }, fake.host);
    t.raise('ping');
    expect(fake.heard).toHaveLength(1);
  });

  it('an act from the host runs through the same actions as a rule', () => {
    const fake = fakeHost(['custom'], (event, api) => {
      if (event.type === 'custom' && event.name === 'ping')
        expect(api.act(add(5), api.actorOf(event))).toBe(true);
    });
    const t = setup({}, fake.host);
    t.raise('ping', 'b');
    expect(t.counter('b')).toBe(5);
    expect(t.counter('a')).toBe(0);
  });

  it('with no rules, the runner still exists for scripts', () => {
    const fake = fakeHost(['zone_crossed'], (event, api) => {
      api.act(add(), api.actorOf(event));
    });
    const t = setup({ rules: [] }, fake.host);
    t.pos.set('a', { x: 0, y: 0, z: -22 });
    t.tick();
    t.pos.set('a', { x: 0, y: 0, z: -18 });
    t.tick();
    expect(fake.heard.map((e) => e.type)).toEqual(['zone_crossed']);
    expect(t.counter('a')).toBe(1);
  });

  it('host actions count toward actionsPerEvent with the rule actions of the same root', () => {
    let accepted = 0;
    let refused = 0;
    const fake = fakeHost(['custom'], (event, api) => {
      if (event.type !== 'custom' || event.name !== 'flood') return;
      for (let i = 0; i < RULE_LIMITS.actionsPerEvent; i++) {
        if (api.act(add(), 'a')) accepted += 1;
        else refused += 1;
      }
    });
    const t = setup({ rules: [{ when: { event: 'flood' }, do: [add(), add(), add(), add()] }] }, fake.host);
    t.raise('flood');
    expect(accepted).toBe(RULE_LIMITS.actionsPerEvent - 4);
    expect(refused).toBe(4);
    expect(t.counter('a')).toBe(RULE_LIMITS.actionsPerEvent);
    expect(t.log).toHaveLength(1);
    expect(t.log[0]).toContain(String(RULE_LIMITS.actionsPerEvent));
    // A new top-level event has a new budget.
    accepted = 0;
    t.raise('flood');
    expect(accepted).toBe(RULE_LIMITS.actionsPerEvent - 4);
  });

  it('an emit loop between a rule and the host stops at the chain limit', () => {
    const fake = fakeHost(['custom'], (event, api) => {
      if (event.type === 'custom' && event.name === 'ping')
        api.act({ kind: 'emit', event: 'pong' }, api.actorOf(event));
    });
    const t = setup(
      {
        rules: [{ when: { event: 'pong' }, do: [add(), { kind: 'emit', event: 'ping' }] }],
      },
      fake.host,
    );
    t.raise('ping');
    // ping(0) -> pong(1) -> ping(2) ... every hop is one follow-up deeper; pong runs at depths 1, 3, 5, 7.
    const pings = fake.heard.filter((e) => e.type === 'custom' && e.name === 'ping');
    expect(pings.length).toBe(Math.floor(RULE_LIMITS.chain / 2) + 1);
    expect(t.counter('a')).toBe(Math.ceil(RULE_LIMITS.chain / 2));
    expect(t.log).toHaveLength(1);
    expect(t.log[0]).toContain('chain');
  });

  it('matchReset is called on match_reset, and matchStartedAt moves to the new match', () => {
    let api: ScriptSessionApi | null = null;
    const fake = fakeHost(['phase_changed'], (_event, a) => {
      api = a;
    });
    const t = setup({}, fake.host);
    expect(fake.resets()).toBe(0);
    const firstStart = api!.matchStartedAt();
    expect(firstStart).toBe(0);
    // 60 s of play, then 3 s of results, then a new match.
    for (let i = 0; i < 660; i++) t.tick();
    expect(fake.resets()).toBe(1);
    expect(api!.matchStartedAt()).toBeGreaterThan(firstStart);
    expect(api!.now()).toBe(t.now());
  });

  it('reads zones, riding and the actor through the api', () => {
    let seen: { zones: number; riding: unknown; actor: string | null } | null = null;
    const fake = fakeHost(['custom'], (event, api) => {
      seen = { zones: api.zones().length, riding: api.ridingOf('a'), actor: api.actorOf(event) };
    });
    const t = setup({}, fake.host);
    t.s.mount('a', 'item-1', 'board', 1, t.now());
    t.raise('look', 'b');
    expect(seen).toEqual({ zones: 1, riding: { item: 'item-1', tag: 'board' }, actor: 'b' });
  });

  it('an act outside an event delivery is refused', () => {
    let api: ScriptSessionApi | null = null;
    const fake = fakeHost(['custom'], (_event, a) => {
      api = a;
    });
    const t = setup({}, fake.host);
    t.raise('grab');
    expect(api!.act(add(), 'a')).toBe(false);
    expect(t.counter('a')).toBe(0);
  });

  it('attach gives the host the api once, before the match starts', () => {
    const attached: Array<{ phase: string; players: number }> = [];
    const fake = fakeHost(['custom']);
    const host: ScriptHost = {
      ...fake.host,
      attach(api) {
        attached.push({ phase: api.view().phase, players: api.view().players.size });
      },
    };
    const t = setup({}, host);
    t.raise('x');
    expect(attached).toEqual([{ phase: 'waiting', players: 0 }]);
  });

  it('caused tells a follow-up (raised while another event was delivered) from a call into the session', () => {
    const seen: Array<[string, boolean]> = [];
    const fake = fakeHost(['custom', 'counter_changed', 'zone_crossed'], (event, api) => {
      seen.push([event.type === 'custom' ? event.name : event.type, api.caused(event)]);
    });
    const t = setup(
      { rules: [{ when: { event: 'ping' }, do: [add(), { kind: 'emit', event: 'pong' }] }] },
      fake.host,
    );
    t.raise('ping');
    t.pos.set('a', { x: 0, y: 0, z: -22 });
    t.tick();
    t.pos.set('a', { x: 0, y: 0, z: -18 });
    t.tick();
    expect(seen).toEqual([
      ['ping', false],
      ['counter_changed', true],
      ['pong', true],
      ['zone_crossed', false],
    ]);
  });

  it('counterScope names the scope of a declared counter, null otherwise', () => {
    let api: ScriptSessionApi | null = null;
    const fake = fakeHost(['custom'], (_event, a) => {
      api = a;
    });
    const t = setup(
      {
        counters: [
          { name: 'n', scope: 'player', start: 0 },
          { name: 't', scope: 'team', start: 0 },
          { name: 'g', scope: 'global', start: 0 },
        ],
      },
      fake.host,
    );
    t.raise('x');
    expect([
      api!.counterScope('n'),
      api!.counterScope('t'),
      api!.counterScope('g'),
      api!.counterScope('nope'),
    ]).toEqual(['player', 'team', 'global', null]);
  });
});
