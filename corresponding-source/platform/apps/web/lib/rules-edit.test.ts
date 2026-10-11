import {
  Action,
  Condition,
  GameEventName,
  HudBinding,
  newGame,
  RULE_LIMITS,
  type Game,
  type RideDefault,
} from '@genvr/contracts';
import { describe, expect, it } from 'vitest';
import {
  ACTION_KINDS,
  actionOfKind,
  addCounter,
  addHud,
  addRule,
  checkRules,
  customEvents,
  defaultAction,
  defaultCondition,
  CONDITION_KINDS,
  EVENT_NAMES,
  followSaved,
  HUD_KINDS,
  hudOfKind,
  missingCounters,
  moveAt,
  removeCounter,
  renameCounter,
  rideTags,
  rideTagSuggestions,
  rulesOf,
  sameRules,
  tagSuggestions,
  takesWho,
  uniqueName,
  whenFields,
  winnerKind,
  winnerOfKind,
  WINNER_KINDS,
  withEvent,
  withRules,
  zoneTags,
  type GameRules,
} from './rules-edit';

const empty = (): GameRules => ({ counters: [], rules: [], ranking: null, hud: [], scoreWins: true });

/** A draft with two counters, a rule that uses them, a ranking and a display. */
const sample = (): GameRules => ({
  counters: [
    { name: 'points', scope: 'player', start: 0 },
    { name: 'shared', scope: 'global', start: 5 },
  ],
  rules: [
    {
      when: { event: 'counter_changed', counter: 'points' },
      if: [{ kind: 'counter', name: 'points', op: '>=', value: { counter: 'shared' } }],
      do: [
        { kind: 'add_counter', name: 'points', by: 1, who: 'actor' },
        { kind: 'end_match', winner: { byCounter: 'points', order: 'high' } },
      ],
    },
  ],
  ranking: { by: 'points', order: 'high', then: 'shared' },
  hud: [{ kind: 'counter', label: 'Points', counter: 'points' }],
  scoreWins: true,
});

describe('the pickers offer exactly the schema', () => {
  it('lists every engine event, action, condition and display kind of the contracts', () => {
    expect(EVENT_NAMES).toEqual(GameEventName.options);
    expect(new Set(ACTION_KINDS)).toEqual(new Set(Action.options.map((o) => o.shape.kind.value)));
    expect(ACTION_KINDS).toHaveLength(13);
    expect(CONDITION_KINDS).toEqual(['counter', 'phase', 'team', 'riding']);
    expect(HUD_KINDS).toEqual(HudBinding.options.map((o) => o.shape.kind.value));
  });

  it('makes a valid default for every action and condition kind', () => {
    const draft = sample();
    for (const kind of ACTION_KINDS)
      expect(Action.safeParse(defaultAction(kind, draft)).success, kind).toBe(true);
    for (const kind of CONDITION_KINDS) {
      expect(defaultCondition(kind, draft).kind).toBe(kind);
      expect(Condition.safeParse(defaultCondition(kind, draft)).success, kind).toBe(true);
    }
    for (const kind of HUD_KINDS)
      expect(HudBinding.safeParse(hudOfKind(draft.hud[0]!, kind, draft)).success, kind).toBe(true);
    expect(hudOfKind(draft.hud[0]!, 'speed', draft)).toEqual({ kind: 'speed', label: 'Points', unit: 'km/h' });
    expect(defaultAction('set_speed', draft)).toEqual({ kind: 'set_speed', factor: 1.5, seconds: 5, who: 'actor' });
    expect(defaultAction('dismount', draft)).toEqual({ kind: 'dismount', who: 'actor' });
    for (const kind of WINNER_KINDS) expect(winnerKind(winnerOfKind(kind, draft))).toBe(kind);
  });

  it('starts a new message with no text: the designer writes it (the field shows a placeholder)', () => {
    expect(defaultAction('show_message', sample())).toEqual({ kind: 'show_message', text: '', who: 'actor' });
  });

  it('asks who only for actions that reach players', () => {
    expect(ACTION_KINDS.filter(takesWho)).toEqual([
      'add_counter',
      'set_counter',
      'add_score',
      'damage',
      'heal',
      'teleport_to_zone',
      'show_message',
      'say',
      'dismount',
      'set_speed',
    ]);
  });
});

describe('editing a draft', () => {
  it('reads a game without rules as an empty draft and writes empty parts back as left out', () => {
    const game = newGame();
    expect(rulesOf(game)).toEqual(empty());
    expect(withRules(game, empty())).toEqual(game);
    const withSample = withRules(game, sample());
    expect(rulesOf(withSample)).toEqual(sample());
    expect(withRules(withSample, empty())).toEqual(game);
    expect(sameRules(rulesOf(withSample), sample())).toBe(true);
  });

  it('follows a game saved elsewhere: an untouched draft takes it, a changed one is flagged', () => {
    const before = empty();
    const elsewhere = sample();
    // Nothing changed here: the draft takes the new rules.
    expect(followSaved(before, before, elsewhere)).toEqual({ draft: elsewhere, conflict: false });
    // Changed here, and the saved rules did not change (another setting did): keep the draft.
    const mine = { ...before, scoreWins: false };
    expect(followSaved(mine, before, before)).toEqual({ draft: mine, conflict: false });
    // This page's own save came back: the saved rules are the draft.
    expect(followSaved(mine, before, mine)).toEqual({ draft: mine, conflict: false });
    // Changed here and elsewhere: never overwrite either silently.
    expect(followSaved(mine, before, elsewhere)).toEqual({ draft: mine, conflict: true });
  });

  it('keeps the draft being saved through the page showing it, taking it back and reloading (a 409)', () => {
    const before = empty();
    const mine = { ...before, scoreWins: false };
    const elsewhere = sample();
    const pending = { draft: mine, base: before };
    // The page shows the save at once; the saved rules are the draft.
    expect(followSaved(mine, mine, mine, pending)).toEqual({ draft: mine, conflict: false });
    // The save was refused: the page goes back to the rules before it. The draft stays.
    expect(followSaved(mine, mine, before, pending)).toEqual({ draft: mine, conflict: false });
    // The page reloads the rules another builder saved: the draft stays and the builder chooses.
    expect(followSaved(mine, before, elsewhere, pending)).toEqual({ draft: mine, conflict: true });
    // The reload may also come after the save has finished: the same answer.
    expect(followSaved(mine, before, elsewhere)).toEqual({ draft: mine, conflict: true });
  });

  it('compares drafts by their values, not the order of their keys', () => {
    // The editor builds a new ranking as { order, by }; the saved game comes back as { by, order }.
    const edited: GameRules = {
      ...empty(),
      ranking: { order: 'high', by: 'points' } as GameRules['ranking'],
    };
    const saved: GameRules = { ...empty(), ranking: { by: 'points', order: 'high' } };
    expect(sameRules(edited, saved)).toBe(true);
    expect(sameRules(edited, { ...saved, ranking: { by: 'points', order: 'low' } })).toBe(false);
    // A key left undefined is the same as a key left out.
    expect(sameRules({ ...saved, ranking: { by: 'points', order: 'high', then: undefined } }, saved)).toBe(
      true,
    );
  });

  it('adds counters with unused names and stops at the limit', () => {
    let draft = empty();
    draft = addCounter(addCounter(draft));
    expect(draft.counters.map((c) => c.name)).toEqual(['counter', 'counter 2']);
    for (let i = 0; i < 40; i += 1) draft = addCounter(draft);
    expect(draft.counters).toHaveLength(RULE_LIMITS.counters);
    expect(uniqueName('a', ['a', 'a 2'])).toBe('a 3');
  });

  it('adds rules and displays up to their limits', () => {
    let draft = empty();
    for (let i = 0; i < 70; i += 1) draft = addRule(draft, ['north']);
    expect(draft.rules).toHaveLength(RULE_LIMITS.rules);
    expect(draft.rules[0]!.when).toEqual({ event: 'zone_entered', tag: 'north' });
    expect(draft.rules[0]!.do[0]!.kind).toBe('add_score');
    for (let i = 0; i < 10; i += 1) draft = addHud(draft);
    expect(draft.hud).toHaveLength(RULE_LIMITS.hud);
    expect(addRule(sample()).rules.at(-1)!.do[0]).toMatchObject({ kind: 'add_counter', name: 'points' });
  });

  it('keeps a tag only for zone events and a counter only for counter_changed', () => {
    const rule = {
      when: { event: 'zone_entered', tag: 'north' },
      if: [],
      do: [defaultAction('add_score', empty())],
    };
    expect(whenFields('zone_crossed')).toEqual({ tag: 'zone', counter: false });
    expect(whenFields('counter_changed')).toEqual({ tag: null, counter: true });
    expect(whenFields('my event')).toEqual({ tag: null, counter: false });
    expect(withEvent(rule, 'zone_exited').when).toEqual({ event: 'zone_exited', tag: 'north' });
    expect(withEvent(rule, 'time_up').when).toEqual({ event: 'time_up' });
    expect(withEvent(sample().rules[0]!, 'died').when).toEqual({ event: 'died' });
  });

  it('keeps a ride tag between the ride events, never across to a zone event', () => {
    expect(whenFields('mounted')).toEqual({ tag: 'ride', counter: false });
    expect(whenFields('dismounted')).toEqual({ tag: 'ride', counter: false });
    const rule = { when: { event: 'mounted', tag: 'lane' }, if: [], do: [defaultAction('add_score', empty())] };
    expect(withEvent(rule, 'dismounted').when).toEqual({ event: 'dismounted', tag: 'lane' });
    expect(withEvent(rule, 'zone_entered').when).toEqual({ event: 'zone_entered' });
    const zone = { ...rule, when: { event: 'zone_crossed', tag: 'north' } };
    expect(withEvent(zone, 'mounted').when).toEqual({ event: 'mounted' });
  });

  it('changes an action kind with fresh defaults, keeping who', () => {
    const draft = sample();
    const heal = actionOfKind({ kind: 'damage', amount: 5, who: 'everyone' }, 'heal', draft);
    expect(heal).toEqual({ kind: 'heal', amount: 10, who: 'everyone' });
    expect(actionOfKind(heal, 'emit', draft)).toEqual({ kind: 'emit', event: 'custom event' });
    expect(actionOfKind(heal, 'teleport_to_zone', draft, ['south'])).toEqual({
      kind: 'teleport_to_zone',
      tag: 'south',
      who: 'everyone',
    });
  });

  it('changes a display kind keeping its label', () => {
    const draft = sample();
    const timer = hudOfKind(draft.hud[0]!, 'timer', draft);
    expect(timer).toEqual({ kind: 'timer', label: 'Points' });
    expect(hudOfKind(timer, 'counter', draft)).toEqual({
      kind: 'counter',
      label: 'Points',
      counter: 'points',
    });
  });

  it('changes a display kind with its default label to the new kind default label', () => {
    const draft = sample();
    // A new display starts labelled with its counter's name: that is the tool's default, not the
    // designer's words, so it follows the kind.
    const fresh = { kind: 'counter' as const, label: 'points', counter: 'points' };
    const rank = hudOfKind(fresh, 'rank', draft);
    expect(rank).toEqual({ kind: 'rank', label: 'Place' });
    const timer = hudOfKind(rank, 'timer', draft);
    expect(timer).toEqual({ kind: 'timer', label: 'Time' });
    expect(hudOfKind(timer, 'counter', draft)).toEqual({ kind: 'counter', label: 'points', counter: 'points' });
  });

  it('renames a counter everywhere it is named', () => {
    const renamed = renameCounter(sample(), 'points', 'stars');
    expect(renamed.counters[0]!.name).toBe('stars');
    expect(renamed.rules[0]!.when.counter).toBe('stars');
    expect(renamed.rules[0]!.if[0]).toMatchObject({ name: 'stars', value: { counter: 'shared' } });
    expect(renamed.rules[0]!.do[0]).toMatchObject({ name: 'stars' });
    expect(renamed.rules[0]!.do[1]).toMatchObject({ winner: { byCounter: 'stars' } });
    expect(renamed.ranking).toEqual({ by: 'stars', order: 'high', then: 'shared' });
    expect(renamed.hud[0]).toMatchObject({ counter: 'stars' });
    expect(missingCounters(renamed)).toEqual([]);
    expect(renameCounter(sample(), 'shared', 'pool').rules[0]!.if[0]).toMatchObject({
      value: { counter: 'pool' },
    });
  });

  it('removes a counter with its ranking and displays, and names what the rules still use', () => {
    const removed = removeCounter(sample(), 0);
    expect(removed.counters.map((c) => c.name)).toEqual(['shared']);
    expect(removed.ranking).toBeNull();
    expect(removed.hud).toEqual([]);
    expect(missingCounters(removed)).toEqual(['points']);
    expect(removeCounter(sample(), 1).ranking).toEqual({ by: 'points', order: 'high' });
  });

  it('moves items inside the list only', () => {
    expect(moveAt(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c']);
    expect(moveAt(['a', 'b', 'c'], 2, 1)).toEqual(['a', 'b', 'c']);
    expect(moveAt(['a', 'b', 'c'], 2, -2)).toEqual(['c', 'a', 'b']);
  });
});

describe('suggestions', () => {
  it('lists the custom events the rules raise or hear, not engine names', () => {
    const draft: GameRules = {
      ...empty(),
      rules: [
        { when: { event: 'round over' }, if: [], do: [{ kind: 'emit', event: 'bonus' }] },
        { when: { event: 'died' }, if: [], do: [{ kind: 'emit', event: 'time_up' }] },
      ],
    };
    expect(customEvents(draft)).toEqual(['bonus', 'round over']);
  });

  it('suggests the world zone tags and the tags the rules use', () => {
    const shapes: Record<string, 'area' | 'gate'> = { 'zone.area': 'area' };
    const instances = [
      { itemId: 'zone.area', params: { zoneTag: 'north' } },
      { itemId: 'crate', params: { zone: 'gate', zoneTag: ' line ' } },
      { itemId: 'crate', params: { zoneTag: 'not a zone' } },
      { itemId: 'zone.area', params: { zoneTag: 'north' } },
    ];
    const tags = zoneTags(instances, (id) => shapes[id]);
    expect(tags).toEqual(['line', 'north']);
    const draft: GameRules = {
      ...empty(),
      rules: [
        {
          when: { event: 'zone_entered', tag: 'south' },
          if: [],
          do: [{ kind: 'teleport_to_zone', tag: 'home', who: 'actor' }],
        },
      ],
    };
    expect(tagSuggestions(draft, tags)).toEqual(['home', 'line', 'north', 'south']);
  });
});

describe('ride tags', () => {
  it('collects the ride tags placed in a world, with the item defaults', () => {
    const defaults: Record<string, RideDefault> = { raft: { model: 'water', tag: 'dock' } };
    const instances = [
      { itemId: 'crate', params: { ride: 'ground', rideTag: ' lane ' } },
      { itemId: 'crate', params: { rideTag: 'not rideable' } },
      { itemId: 'raft', params: {} },
      { itemId: 'crate', params: { ride: 'air', rideTag: 'lane' } },
      { itemId: 'crate', params: { ride: 'air' } },
    ];
    expect(rideTags(instances, (id) => defaults[id])).toEqual(['dock', 'lane']);
  });

  it('suggests the world ride tags and the ride tags the rules use, not zone tags', () => {
    const draft: GameRules = {
      ...empty(),
      rules: [
        {
          when: { event: 'mounted', tag: 'blue' },
          if: [{ kind: 'riding', is: true, tag: 'deck' }],
          do: [{ kind: 'teleport_to_zone', tag: 'home', who: 'actor' }],
        },
        { when: { event: 'zone_entered', tag: 'north' }, if: [], do: [{ kind: 'dismount', who: 'actor' }] },
      ],
    };
    expect(rideTagSuggestions(draft, ['lane'])).toEqual(['blue', 'deck', 'lane']);
    expect(tagSuggestions(draft, [])).toEqual(['home', 'north']);
  });
});

describe('checking before saving', () => {
  const game = (): Game => newGame();

  it('accepts a valid draft and returns the game as the schema reads it', () => {
    const result = checkRules(game(), sample());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.game.counters).toEqual(sample().counters);
  });

  it("saves tags and names trimmed, so a rule's 'pad ' is the zone 'pad'", () => {
    const draft = sample();
    draft.rules = [
      {
        when: { event: 'zone_entered', tag: 'pad ' },
        if: [],
        do: [{ kind: 'add_score', by: 1, who: 'actor' }],
      },
      ...draft.rules,
    ];
    const result = checkRules(game(), draft);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.game.rules?.[0]?.when.tag).toBe('pad');
  });

  it('names the rule with an empty name', () => {
    const draft = sample();
    draft.rules = [{ ...draft.rules[0]!, do: [{ kind: 'add_counter', name: '', by: 1, who: 'actor' }] }];
    expect(checkRules(game(), draft)).toEqual({ ok: false, message: 'Rule 1: a name is empty.' });
  });

  it('refuses a rule without actions, duplicate counters, and a game that cannot end', () => {
    const noActions = sample();
    noActions.rules = [{ ...noActions.rules[0]!, do: [] }];
    expect(checkRules(game(), noActions)).toEqual({
      ok: false,
      message: 'Rule 1: needs at least one action.',
    });
    const twins = sample();
    twins.counters = [twins.counters[0]!, twins.counters[0]!];
    expect(checkRules(game(), twins)).toEqual({ ok: false, message: 'Two counters have the same name.' });
    const { win: _win, ...noWin } = game();
    const endless = checkRules(noWin as Game, { ...empty(), scoreWins: false });
    expect(endless.ok).toBe(false);
    expect(checkRules(noWin as Game, { ...sample(), scoreWins: false }).ok).toBe(true);
  });

  it('turns the highest-score win off for a game its rules end, and back on', () => {
    const off = checkRules(game(), { ...sample(), scoreWins: false });
    expect(off.ok).toBe(true);
    if (!off.ok) return;
    expect(off.game.win).toBeUndefined();
    expect(rulesOf(off.game).scoreWins).toBe(false);
    const on = checkRules(off.game, { ...rulesOf(off.game), scoreWins: true });
    expect(on.ok && on.game.win).toEqual({ by: 'highest_score' });
    // Off with nothing else ending the match is refused in the editor's words.
    expect(checkRules(game(), { ...empty(), scoreWins: false })).toEqual({
      ok: false,
      message: 'Something must end the match: add a rule that ends it, or keep the highest score winning.',
    });
  });

  it('refuses a message longer than the limit', () => {
    const draft = sample();
    draft.rules = [
      {
        ...draft.rules[0]!,
        do: [{ kind: 'show_message', text: 'x'.repeat(RULE_LIMITS.text + 1), who: 'actor' }],
      },
    ];
    expect(checkRules(game(), draft)).toEqual({ ok: false, message: 'Rule 1: a text is too long.' });
  });
});
