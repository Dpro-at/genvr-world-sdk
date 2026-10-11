import { describe, expect, it } from 'vitest';
import {
  Action,
  Condition,
  Counter,
  Game,
  HudBinding,
  Rule,
  RULE_LIMITS,
  teamCounterKey,
  Zone,
  zoneFromParams,
} from '../src/index.js';
import { testGame } from './fixtures.js';

const goalRule = {
  when: { event: 'zone_entered', tag: 'goal' },
  do: [
    { kind: 'add_counter', name: 'score', by: 1 },
    { kind: 'end_match', winner: { byCounter: 'score', order: 'high' } },
  ],
};

describe('generic rules schemas', () => {
  it('parses a small rule set with defaults filled in', () => {
    const rule = Rule.parse(goalRule);
    expect(rule.if).toEqual([]);
    expect(rule.do[0]).toMatchObject({ kind: 'add_counter', who: 'actor' });
    expect(Counter.parse({ name: 'score', scope: 'player' }).start).toBe(0);
    expect(Zone.parse({ shape: 'area', tag: 'goal' }).visibleInPlay).toBe(false);
  });

  it('rejects rules, actions, names and numbers outside the limits', () => {
    const many = Array.from({ length: RULE_LIMITS.rules + 1 }, () => goalRule);
    expect(Game.safeParse({ ...testGame(), rules: many }).success).toBe(false);
    const nineActions = Array.from({ length: RULE_LIMITS.actions + 1 }, () => ({ kind: 'add_counter', name: 'a', by: 1 }));
    expect(Rule.safeParse({ ...goalRule, do: nineActions }).success).toBe(false);
    expect(Rule.safeParse({ ...goalRule, do: [] }).success).toBe(false);
    expect(Counter.safeParse({ name: 'x'.repeat(RULE_LIMITS.name + 1), scope: 'global' }).success).toBe(false);
    expect(Action.safeParse({ kind: 'add_counter', name: 'a', by: Number.POSITIVE_INFINITY }).success).toBe(false);
    expect(Action.safeParse({ kind: 'add_counter', name: 'a', by: Number.NaN }).success).toBe(false);
  });

  it('rejects unknown condition and action kinds', () => {
    expect(Condition.safeParse({ kind: 'weather', is: 'rain' }).success).toBe(false);
    expect(Action.safeParse({ kind: 'explode' }).success).toBe(false);
  });

  it('requires a tag on a zone', () => {
    expect(Zone.safeParse({ shape: 'area' }).success).toBe(false);
    expect(Zone.safeParse({ shape: 'gate', tag: '' }).success).toBe(false);
  });

  it('compares a counter with a number or with another counter', () => {
    expect(Condition.safeParse({ kind: 'counter', name: 'score', op: '>=', value: 3 }).success).toBe(true);
    expect(Condition.safeParse({ kind: 'counter', name: 'score', op: '<', value: { counter: 'limit' } }).success).toBe(true);
    expect(Condition.safeParse({ kind: 'counter', name: 'score', op: '~', value: 3 }).success).toBe(false);
  });

  it('lets a game carry counters, rules, ranking and hud, and end by a rule alone', () => {
    const base = testGame();
    const { win, ...noWin } = base;
    expect(win).toBeDefined();
    const game = {
      ...noWin,
      counters: [{ name: 'score', scope: 'player' }],
      rules: [goalRule],
      ranking: { by: 'score', order: 'high' },
      hud: [{ kind: 'counter', label: 'Score', counter: 'score' }, { kind: 'rank', label: 'Place' }],
    };
    expect(Game.safeParse(game).success).toBe(true);
    // Still rejected: nothing ends the game.
    expect(Game.safeParse({ ...noWin, counters: [], rules: [] }).success).toBe(false);
    expect(Game.safeParse({ ...noWin, rules: [{ ...goalRule, do: [{ kind: 'add_score', by: 1 }] }] }).success).toBe(false);
  });

  it('rejects two counters with the same name', () => {
    const game = { ...testGame(), counters: [{ name: 'score', scope: 'player' }, { name: 'score', scope: 'team' }] };
    const result = Game.safeParse(game);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]).toMatchObject({ message: 'Counter names must be unique', path: ['counters'] });
    expect(Game.safeParse({ ...game, counters: [{ name: 'score', scope: 'player' }, { name: 'other', scope: 'team' }] }).success).toBe(true);
  });

  it('caps the HUD bindings at their own limit', () => {
    const hud = (n: number) => Array.from({ length: n }, () => ({ kind: 'rank', label: 'Place' }));
    expect(RULE_LIMITS.hud).toBe(8);
    expect(Game.safeParse({ ...testGame(), hud: hud(RULE_LIMITS.hud) }).success).toBe(true);
    expect(Game.safeParse({ ...testGame(), hud: hud(RULE_LIMITS.hud + 1) }).success).toBe(false);
  });
});

describe('zone settings on a placed item (flat instance params)', () => {
  it('reads the shape, the tag and the visibility from the params', () => {
    expect(zoneFromParams({ zone: 'gate', zoneTag: 'door', zoneVisible: true })).toEqual({
      shape: 'gate',
      tag: 'door',
      visibleInPlay: true,
    });
    expect(zoneFromParams({ zone: 'area', zoneTag: ' room ' })).toEqual({ shape: 'area', tag: 'room', visibleInPlay: false });
  });

  it('takes the item own shape when the params name none, and the params shape over it', () => {
    expect(zoneFromParams({ zoneTag: 'pad' }, 'area')).toMatchObject({ shape: 'area' });
    expect(zoneFromParams({ zone: 'gate', zoneTag: 'pad' }, 'area')).toMatchObject({ shape: 'gate' });
  });

  it('is null without a shape or a usable tag', () => {
    expect(zoneFromParams({})).toBeNull();
    expect(zoneFromParams({ zoneTag: 'x' })).toBeNull();
    expect(zoneFromParams({ zone: 'box', zoneTag: 'x' })).toBeNull();
    expect(zoneFromParams({ zone: 'area' })).toBeNull();
    expect(zoneFromParams({ zone: 'area', zoneTag: '  ' })).toBeNull();
    expect(zoneFromParams({ zone: 'area', zoneTag: 7 })).toBeNull();
    expect(zoneFromParams({ zone: 'area', zoneTag: 'x'.repeat(RULE_LIMITS.name + 1) })).toBeNull();
  });

  it('ignores a visibility that is not a boolean', () => {
    expect(zoneFromParams({ zone: 'area', zoneTag: 'a', zoneVisible: 'yes' })?.visibleInPlay).toBe(false);
  });
});

describe('names and tags are trimmed where they are stored', () => {
  it("reads 'pad ' as 'pad', so a rule's tag matches the zone the studio stored", () => {
    const rule = Rule.parse({
      when: { event: 'zone_entered', tag: 'pad ' },
      do: [
        { kind: 'teleport_to_zone', tag: ' pad' },
        { kind: 'add_counter', name: ' points ', by: 1 },
      ],
    });
    expect(rule.when.tag).toBe('pad');
    expect(rule.do[0]).toMatchObject({ tag: 'pad' });
    expect(rule.do[1]).toMatchObject({ name: 'points' });
    expect(rule.when.tag).toBe(zoneFromParams({ zone: 'area', zoneTag: 'pad ' })?.tag);
    expect(Zone.parse({ shape: 'gate', tag: '  pad  ' }).tag).toBe('pad');
    expect(Counter.parse({ name: 'points ', scope: 'player' }).name).toBe('points');
  });

  it('refuses a tag or a name that is only spaces', () => {
    expect(Rule.safeParse({ when: { event: 'zone_entered', tag: '   ' }, do: [{ kind: 'add_score', by: 1 }] }).success).toBe(false);
    expect(Counter.safeParse({ name: '  ', scope: 'player' }).success).toBe(false);
  });

  it('checks counter names for being unique after trimming', () => {
    const counters = [
      { name: 'points', scope: 'player' },
      { name: 'points ', scope: 'player' },
    ];
    expect(Game.safeParse({ ...testGame(), counters }).success).toBe(false);
  });
});

describe('riding in the rules', () => {
  it('parses a mounted rule with the riding condition, set_speed and dismount', () => {
    const rule = Rule.parse({
      when: { event: 'mounted', tag: 'a' },
      if: [{ kind: 'riding', is: true }],
      do: [
        { kind: 'set_speed', factor: 1.5, seconds: 5 },
        { kind: 'dismount' },
      ],
    });
    expect(rule.when.event).toBe('mounted');
    expect(rule.if[0]).toEqual({ kind: 'riding', is: true });
    expect(rule.do[0]).toEqual({ kind: 'set_speed', factor: 1.5, seconds: 5, who: 'actor' });
    expect(rule.do[1]).toEqual({ kind: 'dismount', who: 'actor' });
    expect(Rule.safeParse({ when: { event: 'dismounted' }, do: [{ kind: 'add_score', by: 1 }] }).success).toBe(true);
    expect(Condition.parse({ kind: 'riding', is: false, tag: ' b ' })).toEqual({ kind: 'riding', is: false, tag: 'b' });
  });

  it('rejects a set_speed outside its limits', () => {
    expect(Action.safeParse({ kind: 'set_speed', factor: 4, seconds: 5 }).success).toBe(false);
    expect(Action.safeParse({ kind: 'set_speed', factor: 0.05, seconds: 5 }).success).toBe(false);
    expect(Action.safeParse({ kind: 'set_speed', factor: 2, seconds: 0 }).success).toBe(false);
    expect(Action.safeParse({ kind: 'set_speed', factor: 2, seconds: 601 }).success).toBe(false);
    expect(Action.safeParse({ kind: 'set_speed', factor: 3, seconds: 600 }).success).toBe(true);
  });

  it('shows the speed in km/h unless the binding says m/s', () => {
    expect(HudBinding.parse({ kind: 'speed', label: 'Speed' })).toEqual({ kind: 'speed', label: 'Speed', unit: 'km/h' });
    expect(HudBinding.parse({ kind: 'speed', label: 'Speed', unit: 'm/s' }).kind).toBe('speed');
    expect(HudBinding.safeParse({ kind: 'speed', label: 'Speed', unit: 'mph' }).success).toBe(false);
  });
});

describe('synced team counter keys', () => {
  it('joins the team and the counter name', () => {
    expect(teamCounterKey('red', 'shared')).toBe('red:shared');
    expect(teamCounterKey('blue', 'a:b')).toBe('blue:a:b');
  });
});
