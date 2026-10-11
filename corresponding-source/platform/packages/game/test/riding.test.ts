import { Game, RULE_LIMITS } from '@genvr/contracts';
import { describe, expect, it } from 'vitest';
import { GameSession, type GameEvent, type Position, type ZoneSpec } from '../src/index.js';

const RULE_CHAIN_LIMIT_FOR_TESTS = RULE_LIMITS.chain;

type GameInput = Parameters<typeof Game.parse>[0] & object;

const gate: ZoneSpec = { id: 'g', shape: 'gate', tag: 'gate', x: 0, y: 0, z: 10, yaw: 0, width: 8, depth: 0 };
const pad: ZoneSpec = { id: 'p', shape: 'area', tag: 'pad', x: 50, y: 0, z: 50, yaw: 0, width: 4, depth: 4 };

const base = {
  match: { minPlayers: 1, durationSec: 60, countdownSec: 0, resultsSec: 5 },
  win: { by: 'highest_score' as const },
};

function setup(extra: Partial<GameInput> = {}, players = ['a', 'b']) {
  const game = Game.parse({ ...base, ...extra });
  const pos = new Map<string, Position>();
  const log: string[] = [];
  const seen: GameEvent[] = [];
  let now = 0;
  const s = new GameSession(game, [{ x: 0, y: 0, z: 0, team: 'any' }], 0, {
    positions: (id) => pos.get(id) ?? null,
    zones: [gate, pad],
    log: (message) => log.push(message),
  });
  for (const type of [
    'mounted', 'dismounted', 'relocated', 'dismount_requested', 'speed_requested', 'placed', 'zone_crossed',
  ] as const)
    s.bus.on(type, (event) => seen.push(event));
  for (const id of players) {
    pos.set(id, { x: 0, y: 0, z: 0 });
    s.join(id, now);
  }
  const tick = (ms = 100) => {
    now += ms;
    s.tick(now);
  };
  tick(); // play starts
  tick(); // zones take their first positions
  const of = <T extends GameEvent['type']>(type: T) =>
    seen.filter((event): event is Extract<GameEvent, { type: T }> => event.type === type);
  const counter = (name: string, id: string) => s.view().players.get(id)!.counters[name];
  return { s, pos, log, seen, tick, of, counter, now: () => now };
}

describe('getting on and off', () => {
  it('raises mounted with the tag and the seat, and dismounted, for joined players only', () => {
    const t = setup();
    t.s.mount('a', 'item-1', 'blue', 2, t.now());
    expect(t.of('mounted')).toEqual([{ type: 'mounted', id: 'a', item: 'item-1', tag: 'blue', seat: 2 }]);
    expect(t.s.ridingOf('a')).toEqual({ item: 'item-1', tag: 'blue' });
    t.s.dismount('a', t.now());
    expect(t.of('dismounted')).toEqual([{ type: 'dismounted', id: 'a', item: 'item-1', tag: 'blue' }]);
    expect(t.s.ridingOf('a')).toBeNull();
    // Nobody here, or not riding: nothing happens.
    t.s.mount('stranger', 'item-1', '', 1, t.now());
    t.s.dismount('b', t.now());
    expect(t.of('mounted')).toHaveLength(1);
    expect(t.of('dismounted')).toHaveLength(1);
    expect(t.s.ridingOf('stranger')).toBeNull();
  });

  it('gets a player off the old item when they get on another', () => {
    const t = setup();
    t.s.mount('a', 'item-1', 'x', 1, t.now());
    t.s.mount('a', 'item-2', 'y', 1, t.now());
    expect(t.of('dismounted')).toEqual([{ type: 'dismounted', id: 'a', item: 'item-1', tag: 'x' }]);
    expect(t.s.ridingOf('a')).toEqual({ item: 'item-2', tag: 'y' });
  });

  it('forgets riders who leave and clears riding on match_reset', () => {
    const t = setup({}, ['a', 'b', 'c']);
    t.s.mount('a', 'item-1', '', 1, t.now());
    t.s.mount('b', 'item-2', '', 1, t.now());
    t.s.leave('a', t.now());
    expect(t.s.ridingOf('a')).toBeNull();
    t.s.bus.emit({ type: 'match_reset' });
    t.s.bus.flush();
    expect(t.s.ridingOf('b')).toBeNull();
  });
});

describe('riding in the rules', () => {
  const counters = [{ name: 'n', scope: 'player' as const, start: 0 }];

  it('counts a tagged mounted rule only for that tag, and an untagged one for every mount', () => {
    const t = setup({
      counters: [...counters, { name: 'all', scope: 'player', start: 0 }],
      rules: [
        { when: { event: 'mounted', tag: 'a' }, do: [{ kind: 'add_counter', name: 'n', by: 1 }] },
        { when: { event: 'mounted' }, do: [{ kind: 'add_counter', name: 'all', by: 1 }] },
      ],
    });
    t.s.mount('a', 'i1', 'a', 1, t.now());
    t.s.mount('b', 'i2', 'other', 1, t.now());
    t.s.mount('b', 'i3', '', 1, t.now());
    expect(t.counter('n', 'a')).toBe(1);
    expect(t.counter('n', 'b')).toBe(0);
    expect(t.counter('all', 'a')).toBe(1);
    expect(t.counter('all', 'b')).toBe(2);
  });

  it('hears dismounted with the tag of the item left', () => {
    const t = setup({
      counters,
      rules: [{ when: { event: 'dismounted', tag: 'a' }, do: [{ kind: 'add_counter', name: 'n', by: 1 }] }],
    });
    t.s.mount('a', 'i1', 'a', 1, t.now());
    t.s.dismount('a', t.now());
    expect(t.counter('n', 'a')).toBe(1);
  });

  it('checks the riding condition, with and without a tag', () => {
    const t = setup({
      counters: [
        { name: 'riding', scope: 'player', start: 0 },
        { name: 'on a', scope: 'player', start: 0 },
        { name: 'walking', scope: 'player', start: 0 },
      ],
      rules: [
        { when: { event: 'poke' }, if: [{ kind: 'riding', is: true }], do: [{ kind: 'add_counter', name: 'riding', by: 1 }] },
        {
          when: { event: 'poke' },
          if: [{ kind: 'riding', is: true, tag: 'a' }],
          do: [{ kind: 'add_counter', name: 'on a', by: 1 }],
        },
        { when: { event: 'poke' }, if: [{ kind: 'riding', is: false }], do: [{ kind: 'add_counter', name: 'walking', by: 1 }] },
      ],
    });
    const poke = (id: string) => {
      t.s.bus.emit({ type: 'custom', name: 'poke', id });
      t.s.bus.flush();
    };
    t.s.mount('a', 'i1', 'a', 1, t.now());
    t.s.mount('b', 'i2', 'b', 1, t.now());
    poke('a');
    poke('b');
    expect([t.counter('riding', 'a'), t.counter('on a', 'a'), t.counter('walking', 'a')]).toEqual([1, 1, 0]);
    expect([t.counter('riding', 'b'), t.counter('on a', 'b'), t.counter('walking', 'b')]).toEqual([1, 0, 0]);
    t.s.dismount('b', t.now());
    poke('b');
    expect(t.counter('walking', 'b')).toBe(1);
  });

  it('raises dismount_requested and speed_requested for each target of who', () => {
    const t = setup(
      {
        rules: [
          { when: { event: 'off' }, do: [{ kind: 'dismount', who: 'everyone' }] },
          { when: { event: 'fast' }, do: [{ kind: 'set_speed', factor: 2, seconds: 5 }] },
        ],
      },
      ['a', 'b', 'c'],
    );
    t.s.bus.emit({ type: 'custom', name: 'off', id: 'a' });
    t.s.bus.emit({ type: 'custom', name: 'fast', id: 'b' });
    t.s.bus.flush();
    expect(t.of('dismount_requested').map((e) => e.id).sort()).toEqual(['a', 'b', 'c']);
    expect(t.of('speed_requested')).toEqual([{ type: 'speed_requested', id: 'b', factor: 2, until: t.now() + 5000 }]);
  });

  it('gets a rider off before a teleport_to_zone moves them', () => {
    const t = setup({ rules: [{ when: { event: 'go' }, do: [{ kind: 'teleport_to_zone', tag: 'pad', who: 'everyone' }] }] });
    t.s.mount('a', 'i1', '', 1, t.now());
    const before = t.seen.length;
    t.s.bus.emit({ type: 'custom', name: 'go', id: 'a' });
    t.s.bus.flush();
    const order = t.seen.slice(before).filter((e) => e.type === 'dismount_requested' || e.type === 'placed').map((e) => `${e.type}:${'id' in e ? e.id : ''}`);
    expect(order).toEqual(['dismount_requested:a', 'placed:a', 'placed:b']);
  });

  it('keeps the chain limits: a rule loop through dismount stops', () => {
    const t = setup({
      rules: [{ when: { event: 'loop' }, do: [{ kind: 'dismount' }, { kind: 'emit', event: 'loop' }] }],
    });
    t.s.bus.emit({ type: 'custom', name: 'loop', id: 'a' });
    t.s.bus.flush();
    expect(t.of('dismount_requested').length).toBeLessThanOrEqual(RULE_CHAIN_LIMIT_FOR_TESTS + 1);
    expect(t.log.some((line) => line.includes('stopped a chain'))).toBe(true);
  });
});

describe('zones after a server teleport', () => {
  it('judges nothing across a relocation', () => {
    const t = setup();
    t.pos.set('a', { x: 0, y: 0, z: 8 });
    t.tick();
    t.pos.set('a', { x: 0, y: 0, z: 12 });
    t.s.relocated('a', t.now());
    expect(t.of('relocated')).toEqual([{ type: 'relocated', id: 'a' }]);
    t.tick();
    expect(t.of('zone_crossed')).toHaveLength(0);
    // Later moves are judged again.
    t.pos.set('a', { x: 0, y: 0, z: 8 });
    t.tick();
    t.pos.set('a', { x: 0, y: 0, z: 12 });
    t.tick();
    expect(t.of('zone_crossed')).toHaveLength(1);
  });
});
