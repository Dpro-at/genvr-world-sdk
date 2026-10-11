/**
 * The rules editor's data (Place settings > Game): the game's counters, rules, ranking and HUD
 * bindings as one draft, with the edits the editor makes, the defaults it adds, the choices its
 * pickers offer and the check before saving. Pure, so it is tested without a page. Every choice
 * comes from the contracts schema (`@genvr/contracts` rules.ts) and its limits (`RULE_LIMITS`);
 * nothing here knows what a game means by a counter, a tag or an event.
 */

import {
  Action,
  Condition,
  Game,
  GameEventName,
  HudBinding,
  RULE_LIMITS,
  rideFromParams,
  zoneFromParams,
  type Compare,
  type Counter,
  type Ranking,
  type RideDefault,
  type Rule,
  type Who,
  type Zone,
} from '@genvr/contracts';

/** The parts of a game the rules editor edits. */
export interface GameRules {
  counters: Counter[];
  rules: Rule[];
  ranking: Ranking | null;
  hud: HudBinding[];
  /** Whether the highest score wins when time is up (the game's `win`); off, the rules end play. */
  scoreWins: boolean;
}

export type ActionKind = Action['kind'];
export type ConditionKind = Condition['kind'];
export type HudKind = HudBinding['kind'];
export type EventName = GameEventName;

/** The schema's choices, in the schema's order. */
export const EVENT_NAMES: readonly EventName[] = GameEventName.options;
export const ACTION_KINDS: readonly ActionKind[] = Action.options.map((option) => option.shape.kind.value);
export const CONDITION_KINDS: readonly ConditionKind[] = Condition.options.map(
  (option) => option.shape.kind.value,
);
export const HUD_KINDS: readonly HudKind[] = HudBinding.options.map((option) => option.shape.kind.value);
export const COMPARES: readonly Compare[] = ['=', '!=', '<', '<=', '>', '>='];
export const SCOPES: readonly Counter['scope'][] = ['player', 'team', 'global'];
export const WHO: readonly Who[] = ['actor', 'everyone', 'team_of_actor'];
export const PHASES = ['waiting', 'countdown', 'playing', 'results'] as const;
export const TEAMS = ['red', 'blue'] as const;
export const ORDERS = ['high', 'low'] as const;

/** Plain words for the pickers (the designer's own names are shown as they typed them). */
export const EVENT_LABELS: Record<EventName, string> = {
  zone_entered: 'Enters a zone',
  zone_exited: 'Leaves a zone',
  zone_crossed: 'Crosses a gate',
  player_joined: 'A player joins',
  player_left: 'A player leaves',
  hit: 'A player hits someone',
  died: 'A player is knocked out',
  respawned: 'A player is back',
  phase_changed: 'The phase changes',
  time_up: 'Time is up',
  counter_changed: 'A counter changes',
  timer_fired: 'A timer ends',
  mounted: 'A player gets on',
  dismounted: 'A player gets off',
};

export const ACTION_LABELS: Record<ActionKind, string> = {
  add_counter: 'Add to a counter',
  set_counter: 'Set a counter',
  add_score: 'Add score',
  end_match: 'End the match',
  start_timer: 'Start a timer',
  damage: 'Damage',
  heal: 'Heal',
  teleport_to_zone: 'Move to a zone',
  show_message: 'Show a message',
  emit: 'Raise a custom event',
  say: 'Say a voice line',
  dismount: 'Get off',
  set_speed: 'Set speed',
};

export const CONDITION_LABELS: Record<ConditionKind, string> = {
  counter: 'A counter',
  phase: 'The phase',
  team: 'The team',
  riding: 'Riding',
};

export const HUD_LABELS: Record<HudKind, string> = {
  counter: 'Counter value',
  rank: 'Place',
  timer: 'Time left',
  speed: 'Speed',
};

export const SCOPE_LABELS: Record<Counter['scope'], string> = {
  player: 'Each player',
  team: 'Each team',
  global: 'One for everyone',
};

export const WHO_LABELS: Record<Who, string> = {
  actor: 'The player',
  everyone: 'Everyone',
  team_of_actor: "The player's team",
};

export const PHASE_LABELS: Record<(typeof PHASES)[number], string> = {
  waiting: 'Waiting',
  countdown: 'Countdown',
  playing: 'Playing',
  results: 'Results',
};

export const TEAM_LABELS: Record<(typeof TEAMS)[number], string> = { red: 'Red', blue: 'Blue' };
export const ORDER_LABELS: Record<(typeof ORDERS)[number], string> = {
  high: 'Highest first',
  low: 'Lowest first',
};

/** The kinds of winner `end_match` names. */
export type WinnerKind = 'byCounter' | 'player' | 'team' | 'nobody';
export const WINNER_KINDS: readonly WinnerKind[] = ['byCounter', 'player', 'team', 'nobody'];
export const WINNER_LABELS: Record<WinnerKind, string> = {
  byCounter: 'By a counter',
  player: 'The player',
  team: 'A team',
  nobody: 'Nobody',
};

const ENGINE: ReadonlySet<string> = new Set(EVENT_NAMES);

/** Whether `name` is an event the engine raises (otherwise it is a custom one from `emit`). */
export function isEngineEvent(name: string): name is EventName {
  return ENGINE.has(name);
}

/** The zone events: the only ones a tag narrows. */
export const ZONE_EVENTS: ReadonlySet<string> = new Set(['zone_entered', 'zone_exited', 'zone_crossed']);

/** The ride events: a tag narrows them to items with that ride tag. */
export const RIDE_EVENTS: ReadonlySet<string> = new Set(['mounted', 'dismounted']);

/**
 * Which extra fields of `when` an event takes: a zone tag for zone events, a ride tag for the ride
 * events, a counter for `counter_changed`.
 */
export function whenFields(event: string): { tag: 'zone' | 'ride' | null; counter: boolean } {
  const tag = ZONE_EVENTS.has(event) ? 'zone' : RIDE_EVENTS.has(event) ? 'ride' : null;
  return { tag, counter: event === 'counter_changed' };
}

/** The actions that reach players (`who`). */
export function takesWho(kind: ActionKind): boolean {
  return kind !== 'end_match' && kind !== 'start_timer' && kind !== 'emit';
}

/** The game's rules as the editor's draft (a missing part is empty). */
export function rulesOf(game: Game): GameRules {
  return {
    counters: game.counters ?? [],
    rules: game.rules ?? [],
    ranking: game.ranking ?? null,
    hud: game.hud ?? [],
    scoreWins: game.win !== undefined,
  };
}

/** The game with the draft's rules; an empty part is left out, as a game without it is stored. */
export function withRules(game: Game, draft: GameRules): Game {
  const { counters: _counters, rules: _rules, ranking: _ranking, hud: _hud, win, ...rest } = game;
  return {
    ...rest,
    ...(draft.scoreWins ? { win: win ?? { by: 'highest_score' } } : {}),
    ...(draft.counters.length > 0 ? { counters: draft.counters } : {}),
    ...(draft.rules.length > 0 ? { rules: draft.rules } : {}),
    ...(draft.ranking ? { ranking: draft.ranking } : {}),
    ...(draft.hud.length > 0 ? { hud: draft.hud } : {}),
  };
}

/**
 * Whether two drafts are the same (the editor shows Save only when they differ). Compared by
 * value: the order of an object's keys and a key left undefined do not count, so a ranking the
 * editor built as `{ order, by }` equals the saved `{ by, order }`.
 */
export function sameRules(a: GameRules, b: GameRules): boolean {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

/**
 * The draft after the saved game changed under it (this page's save, or a reload after a save
 * elsewhere, such as a 409 conflict): an untouched draft (`sameRules(draft, base)`) takes the new
 * rules; a changed draft stays; `conflict` says the rules changed both here and elsewhere, so the
 * editor asks which to keep instead of saving over the other builder's rules. While a save is
 * `pending` (the draft sent and the rules it was made from), the page shows it at once and takes
 * it back when it is refused; the sent draft stays through both.
 */
export function followSaved(
  draft: GameRules,
  base: GameRules,
  saved: GameRules,
  pending?: { draft: GameRules; base: GameRules },
): { draft: GameRules; conflict: boolean } {
  if (pending)
    return {
      draft: pending.draft,
      conflict: !sameRules(saved, pending.draft) && !sameRules(saved, pending.base),
    };
  if (sameRules(draft, base)) return { draft: saved, conflict: false };
  return { draft, conflict: !sameRules(saved, base) && !sameRules(saved, draft) };
}

/** A value with every object's keys sorted and undefined keys left out. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value === null || typeof value !== 'object') return value;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0));
  return Object.fromEntries(entries.map(([k, v]) => [k, canonical(v)]));
}

/** The counter names of the draft (optionally only those of one scope). */
export function counterNames(draft: GameRules, scope?: Counter['scope']): string[] {
  return draft.counters.filter((counter) => !scope || counter.scope === scope).map((counter) => counter.name);
}

/** The custom event names the draft's rules raise (`emit`) or listen for, sorted, without duplicates. */
export function customEvents(draft: GameRules): string[] {
  const names = new Set<string>();
  for (const rule of draft.rules) {
    if (!isEngineEvent(rule.when.event)) names.add(rule.when.event);
    for (const action of rule.do) if (action.kind === 'emit') names.add(action.event);
  }
  return [...names]
    .filter((name) => name.trim() !== '' && !isEngineEvent(name))
    .sort((a, b) => a.localeCompare(b));
}

/** A name not used yet: `base`, else `base 2`, `base 3`, ... */
export function uniqueName(base: string, taken: readonly string[]): string {
  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let n = 2; ; n += 1) if (!used.has(`${base} ${n}`)) return `${base} ${n}`;
}

/**
 * The zone tags placed in a world, sorted and without duplicates: every instance whose params make
 * it a zone (`zoneFromParams`); `itemShape` gives the shape an item has by itself (the zone items).
 */
export function zoneTags(
  instances: ReadonlyArray<{ itemId: string; params: Readonly<Record<string, unknown>> }>,
  itemShape: (itemId: string) => Zone['shape'] | undefined,
): string[] {
  const tags = new Set<string>();
  for (const instance of instances) {
    const zone = zoneFromParams(instance.params, itemShape(instance.itemId));
    if (zone) tags.add(zone.tag);
  }
  return [...tags].sort((a, b) => a.localeCompare(b));
}

/** The zone tags to suggest: the world's zones and the zone tags the rules already use. */
export function tagSuggestions(draft: GameRules, worldTags: readonly string[]): string[] {
  const tags = new Set(worldTags);
  for (const rule of draft.rules) {
    if (rule.when.tag && ZONE_EVENTS.has(rule.when.event)) tags.add(rule.when.tag);
    for (const action of rule.do) if (action.kind === 'teleport_to_zone') tags.add(action.tag);
  }
  return [...tags].sort((a, b) => a.localeCompare(b));
}

/**
 * The ride tags placed in a world, sorted and without duplicates: every instance whose params (or
 * the item's own default, `itemDefault`) make it rideable with a tag (`rideFromParams`).
 */
export function rideTags(
  instances: ReadonlyArray<{ itemId: string; params: Readonly<Record<string, unknown>> }>,
  itemDefault: (itemId: string) => RideDefault | undefined,
): string[] {
  const tags = new Set<string>();
  for (const instance of instances) {
    const tag = rideFromParams(instance.params, itemDefault(instance.itemId))?.tag;
    if (tag) tags.add(tag);
  }
  return [...tags].sort((a, b) => a.localeCompare(b));
}

/** The ride tags to suggest: the world's rideable items and the ride tags the rules already use. */
export function rideTagSuggestions(draft: GameRules, worldRideTags: readonly string[]): string[] {
  const tags = new Set(worldRideTags);
  for (const rule of draft.rules) {
    if (rule.when.tag && RIDE_EVENTS.has(rule.when.event)) tags.add(rule.when.tag);
    for (const condition of rule.if)
      if (condition.kind === 'riding' && condition.tag) tags.add(condition.tag);
  }
  return [...tags].sort((a, b) => a.localeCompare(b));
}

// Adding (each returns the draft unchanged at the schema's limit).

/** A new player counter with an unused name. */
export function addCounter(draft: GameRules): GameRules {
  if (draft.counters.length >= RULE_LIMITS.counters) return draft;
  const name = uniqueName('counter', counterNames(draft));
  return { ...draft, counters: [...draft.counters, { name, scope: 'player', start: 0 }] };
}

/** The action a new row of `kind` starts as, naming the first counter and tag there are. */
export function defaultAction(kind: ActionKind, draft: GameRules, tags: readonly string[] = []): Action {
  const counter = draft.counters[0]?.name ?? 'counter';
  switch (kind) {
    case 'add_counter':
      return { kind, name: counter, by: 1, who: 'actor' };
    case 'set_counter':
      return { kind, name: counter, to: 0, who: 'actor' };
    case 'add_score':
      return { kind, by: 1, who: 'actor' };
    case 'end_match':
      return { kind, winner: draft.counters[0] ? { byCounter: counter, order: 'high' } : 'nobody' };
    case 'start_timer':
      return { kind, name: 'timer', seconds: 10 };
    case 'damage':
      return { kind, amount: 10, who: 'actor' };
    case 'heal':
      return { kind, amount: 10, who: 'actor' };
    case 'teleport_to_zone':
      return { kind, tag: tags[0] ?? 'zone', who: 'actor' };
    case 'show_message':
      // Empty: the designer writes the text (the field shows a placeholder).
      return { kind, text: '', who: 'actor' };
    case 'emit':
      return { kind, event: 'custom event' };
    case 'say':
      // Empty: the designer picks the voice line (an audio item; lip sync, P2-44).
      return { kind, line: '', who: 'actor' };
    case 'dismount':
      return { kind, who: 'actor' };
    case 'set_speed':
      return { kind, factor: 1.5, seconds: 5, who: 'actor' };
  }
}

/** The condition a new row of `kind` starts as. */
export function defaultCondition(kind: ConditionKind, draft: GameRules): Condition {
  switch (kind) {
    case 'counter':
      return { kind, name: draft.counters[0]?.name ?? 'counter', op: '>=', value: 1 };
    case 'phase':
      return { kind, is: 'playing' };
    case 'team':
      return { kind, is: 'red' };
    case 'riding':
      return { kind, is: true };
  }
}

/** A new rule: when a player enters a zone, add one to the first counter (or the score). */
export function addRule(draft: GameRules, tags: readonly string[] = []): GameRules {
  if (draft.rules.length >= RULE_LIMITS.rules) return draft;
  const rule: Rule = {
    when: { event: 'zone_entered', ...(tags[0] ? { tag: tags[0] } : {}) },
    if: [],
    do: [defaultAction(draft.counters.length > 0 ? 'add_counter' : 'add_score', draft)],
  };
  return { ...draft, rules: [...draft.rules, rule] };
}

/** A new HUD binding: the first counter's value, or the time left when there is no counter. */
export function addHud(draft: GameRules): GameRules {
  if (draft.hud.length >= RULE_LIMITS.hud) return draft;
  const counter = draft.counters[0]?.name;
  const binding: HudBinding = counter
    ? { kind: 'counter', label: counter, counter }
    : { kind: 'timer', label: 'Time' };
  return { ...draft, hud: [...draft.hud, binding] };
}

/** The label a display of each kind starts with (a counter display: its counter's name). */
function defaultHudLabel(binding: HudBinding): string {
  if (binding.kind === 'counter') return binding.counter;
  return binding.kind === 'rank' ? 'Place' : binding.kind === 'speed' ? 'Speed' : 'Time';
}

/**
 * A binding changed to another kind. The designer's own label is kept; a label still at the tool's
 * default for the old kind becomes the new kind's default (a "points" label on a place display
 * would be wrong).
 */
export function hudOfKind(binding: HudBinding, kind: HudKind, draft: GameRules): HudBinding {
  if (kind === binding.kind) return binding;
  const keep = binding.label !== defaultHudLabel(binding);
  const next: HudBinding =
    kind === 'counter'
      ? { kind, label: '', counter: draft.counters[0]?.name ?? 'counter' }
      : kind === 'speed'
        ? { kind, label: '', unit: 'km/h' }
        : { kind, label: '' };
  return { ...next, label: keep ? binding.label : defaultHudLabel(next) };
}

// Changing.

/** The list with item `index` replaced. */
export function replaceAt<T>(list: readonly T[], index: number, item: T): T[] {
  return list.map((entry, i) => (i === index ? item : entry));
}

/** The list without item `index`. */
export function removeAt<T>(list: readonly T[], index: number): T[] {
  return list.filter((_, i) => i !== index);
}

/** The list with item `index` moved by `delta` places (kept inside the list). */
export function moveAt<T>(list: readonly T[], index: number, delta: number): T[] {
  const to = Math.max(0, Math.min(list.length - 1, index + delta));
  if (to === index || index < 0 || index >= list.length) return [...list];
  const next = [...list];
  const [item] = next.splice(index, 1);
  next.splice(to, 0, item!);
  return next;
}

/**
 * A rule listening for another event: a zone tag stays only between zone events, a ride tag only
 * between the ride events, and a counter only for `counter_changed` (otherwise the rule could never
 * match).
 */
export function withEvent(rule: Rule, event: string): Rule {
  const fields = whenFields(event);
  const when: Rule['when'] = { event };
  if (fields.tag && fields.tag === whenFields(rule.when.event).tag && rule.when.tag) when.tag = rule.when.tag;
  if (fields.counter && rule.when.counter) when.counter = rule.when.counter;
  return { ...rule, when };
}

/** An action of another kind: the new kind's defaults, keeping `who` where both take it. */
export function actionOfKind(
  action: Action,
  kind: ActionKind,
  draft: GameRules,
  tags: readonly string[] = [],
): Action {
  if (kind === action.kind) return action;
  const next = defaultAction(kind, draft, tags);
  if ('who' in next && 'who' in action) return { ...next, who: action.who } as Action;
  return next;
}

/** The kind of winner an `end_match` names. */
export function winnerKind(winner: Extract<Action, { kind: 'end_match' }>['winner']): WinnerKind {
  if (winner === 'nobody') return 'nobody';
  if ('byCounter' in winner) return 'byCounter';
  if ('player' in winner) return 'player';
  return 'team';
}

/** The winner of a kind, with its defaults. */
export function winnerOfKind(
  kind: WinnerKind,
  draft: GameRules,
): Extract<Action, { kind: 'end_match' }>['winner'] {
  switch (kind) {
    case 'byCounter':
      return { byCounter: draft.counters[0]?.name ?? 'counter', order: 'high' };
    case 'player':
      return { player: 'actor' };
    case 'team':
      return { team: 'red' };
    case 'nobody':
      return 'nobody';
  }
}

/**
 * A counter renamed everywhere the draft names it: the rules' `when`, conditions (also as the
 * value compared with) and actions, the ranking and the HUD bindings.
 */
export function renameCounter(draft: GameRules, from: string, to: string): GameRules {
  if (from === to) return draft;
  const name = (value: string) => (value === from ? to : value);
  const rules = draft.rules.map((rule): Rule => ({
    when: rule.when.counter === undefined ? rule.when : { ...rule.when, counter: name(rule.when.counter) },
    if: rule.if.map((condition): Condition =>
      condition.kind === 'counter'
        ? {
            ...condition,
            name: name(condition.name),
            value:
              typeof condition.value === 'number'
                ? condition.value
                : { counter: name(condition.value.counter) },
          }
        : condition,
    ),
    do: rule.do.map((action): Action => {
      if (action.kind === 'add_counter' || action.kind === 'set_counter')
        return { ...action, name: name(action.name) };
      if (action.kind === 'end_match' && typeof action.winner === 'object' && 'byCounter' in action.winner)
        return { ...action, winner: { ...action.winner, byCounter: name(action.winner.byCounter) } };
      return action;
    }),
  }));
  const ranking = draft.ranking
    ? {
        ...draft.ranking,
        by: name(draft.ranking.by),
        ...(draft.ranking.then !== undefined ? { then: name(draft.ranking.then) } : {}),
      }
    : null;
  return {
    ...draft,
    counters: draft.counters.map((counter) => (counter.name === from ? { ...counter, name: to } : counter)),
    rules,
    ranking,
    hud: draft.hud.map((binding) =>
      binding.kind === 'counter' && binding.counter === from ? { ...binding, counter: to } : binding,
    ),
  };
}

/**
 * The draft without counter `index`. The ranking and the HUD bindings that show it go with it (they
 * would show nothing); rules that name it stay as they are, so the designer sees and fixes them.
 */
export function removeCounter(draft: GameRules, index: number): GameRules {
  const name = draft.counters[index]?.name;
  if (name === undefined) return draft;
  let ranking = draft.ranking;
  if (ranking?.by === name) ranking = null;
  else if (ranking?.then === name) ranking = { by: ranking.by, order: ranking.order };
  return {
    ...draft,
    counters: removeAt(draft.counters, index),
    ranking,
    hud: draft.hud.filter((binding) => !(binding.kind === 'counter' && binding.counter === name)),
  };
}

/** The counters the draft's rules, ranking and HUD name that are not declared (sorted). */
export function missingCounters(draft: GameRules): string[] {
  const declared = new Set(counterNames(draft));
  const named = new Set<string>();
  for (const rule of draft.rules) {
    if (rule.when.counter) named.add(rule.when.counter);
    for (const condition of rule.if)
      if (condition.kind === 'counter') {
        named.add(condition.name);
        if (typeof condition.value !== 'number') named.add(condition.value.counter);
      }
    for (const action of rule.do) {
      if (action.kind === 'add_counter' || action.kind === 'set_counter') named.add(action.name);
      if (action.kind === 'end_match' && typeof action.winner === 'object' && 'byCounter' in action.winner)
        named.add(action.winner.byCounter);
    }
  }
  if (draft.ranking) {
    named.add(draft.ranking.by);
    if (draft.ranking.then) named.add(draft.ranking.then);
  }
  for (const binding of draft.hud) if (binding.kind === 'counter') named.add(binding.counter);
  return [...named].filter((name) => !declared.has(name)).sort((a, b) => a.localeCompare(b));
}

// Checking before saving.

const PART_NAMES: Record<string, string> = {
  counters: 'Counter',
  rules: 'Rule',
  hud: 'Display',
};

/** Where in the game a schema problem is, in the editor's words ("Rule 2", "Ranking"). */
function placeOf(path: ReadonlyArray<PropertyKey>): string {
  const [part, index] = path;
  if (typeof part !== 'string') return 'The game';
  if (part === 'ranking') return 'Ranking';
  const name = PART_NAMES[part];
  if (name && typeof index === 'number') return `${name} ${index + 1}`;
  if (name) return `${name}s`;
  return 'The game';
}

/** A schema problem in words. */
function problemText(issue: { code: string; message: string; path: ReadonlyArray<PropertyKey> }): string {
  const field = issue.path.at(-1);
  if (
    issue.code === 'too_small' &&
    (field === 'name' || field === 'tag' || field === 'event' || field === 'counter')
  )
    return 'a name is empty';
  if (issue.code === 'too_big' && typeof field === 'string') return 'a text is too long';
  if (issue.code === 'too_big') return 'too many entries';
  if (issue.code === 'too_small' && field === 'do') return 'needs at least one action';
  return issue.message.charAt(0).toLowerCase() + issue.message.slice(1);
}

/**
 * The game with the draft's rules, checked with the contracts schema before it is saved: the game
 * as the schema reads it, or the first problem in the editor's words ("Rule 2: a name is empty").
 */
export function checkRules(
  game: Game,
  draft: GameRules,
): { ok: true; game: Game } | { ok: false; message: string } {
  const checked = Game.safeParse(withRules(game, draft));
  if (checked.success) return { ok: true, game: checked.data };
  const issue = checked.error.issues[0]!;
  const place = placeOf(issue.path);
  if (issue.message === 'A game needs win or a rule that ends the match')
    return {
      ok: false,
      message: 'Something must end the match: add a rule that ends it, or keep the highest score winning.',
    };
  if (issue.message === 'Counter names must be unique')
    return { ok: false, message: 'Two counters have the same name.' };
  return { ok: false, message: `${place}: ${problemText(issue)}.` };
}
