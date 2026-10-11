import { z } from 'zod';
import { Id } from './common.js';
import {
  Counter,
  HudBinding,
  RULE_LIMITS,
  Ranking,
  Rule,
  ZONE_PARAMS,
  zoneFromParams,
  type Action,
  type Compare,
  type Condition,
} from './rules.js';

/** Limits of the game settings (P9-12); the validator, the server and the settings page share them. */
export const GAME_LIMITS = {
  minPlayers: { min: 1, max: 50 },
  durationSec: { min: 30, max: 1800 },
  countdownSec: { min: 0, max: 30 },
  resultsSec: { min: 3, max: 60 },
  health: { min: 1, max: 1000 },
  respawnDelaySec: { min: 0, max: 60 },
  protectSec: { min: 0, max: 10 },
  scoreGoal: { min: 1, max: 1000 },
  loadoutItems: 4,
} as const;

const int = (limit: { min: number; max: number }) => z.number().int().min(limit.min).max(limit.max);

/**
 * A place's game (decision 117): each key is one generic rule component; a missing key means the
 * component is off. The server runs it; see docs/superpowers/plans/2026-09-29-generic-rules-engine.md.
 */
const GAME_FIELDS = {
  match: z.object({
    minPlayers: int(GAME_LIMITS.minPlayers),
    durationSec: int(GAME_LIMITS.durationSec),
    countdownSec: int(GAME_LIMITS.countdownSec),
    resultsSec: int(GAME_LIMITS.resultsSec),
  }),
  teams: z.object({ mode: z.enum(['none', 'two']), friendlyFire: z.boolean() }).optional(),
  health: z.object({ max: int(GAME_LIMITS.health) }).optional(),
  respawn: z
    .object({ delaySec: int(GAME_LIMITS.respawnDelaySec), protectSec: int(GAME_LIMITS.protectSec) })
    .optional(),
  loadout: z.object({ items: z.array(Id).max(GAME_LIMITS.loadoutItems) }).optional(),
  score: z.object({ from: z.enum(['kills']), goal: int(GAME_LIMITS.scoreGoal).optional() }).optional(),
  win: z.object({ by: z.enum(['highest_score']) }).optional(),
  /** Generic rules engine: counters, rules, the ranking counter and the HUD bindings (all optional). */
  counters: z.array(Counter).max(RULE_LIMITS.counters).optional(),
  rules: z.array(Rule).max(RULE_LIMITS.rules).optional(),
  ranking: Ranking.optional(),
  hud: z.array(HudBinding).max(RULE_LIMITS.hud).optional(),
};

const LiveGame = z
  .object(GAME_FIELDS)
  // Something ends play: `win`, or a rule with an `end_match` action.
  .refine(
    (game) =>
      game.win !== undefined || (game.rules ?? []).some((rule) => rule.do.some((action) => action.kind === 'end_match')),
    { message: 'A game needs win or a rule that ends the match' },
  )
  // Rules and the HUD name counters, so each name means one counter.
  .refine(
    (game) => new Set((game.counters ?? []).map((c) => c.name)).size === (game.counters ?? []).length,
    { message: 'Counter names must be unique', path: ['counters'] },
  );

// Reading stored games and worlds from before the generic rules (Task 5). The only place outside
// docs and examples that knows the old race, its templates and its gate items; it goes when no
// stored place has them any more.

/** The names of the old game templates, as stored games may still carry them (dropped on read). */
const STORED_TEMPLATES = ['sword_fight', 'car_race'] as const; // old names, read away (migration)

/** The limits of a stored race's settings (as they were). */
const STORED_RACE_LIMITS = { laps: { min: 1, max: 99 }, graceSec: { min: 5, max: 300 } } as const;

/** The settings of a stored race; read only to migrate it. */
const StoredRace = z.object({
  laps: int(STORED_RACE_LIMITS.laps),
  checkpoints: z.enum(['ordered', 'any_order']),
  finish: z.enum(['all_finish', 'first_wins', 'timed']),
  graceSec: int(STORED_RACE_LIMITS.graceSec),
});

/**
 * What a game may be given as: a live game, or one stored before the generic rules with its old
 * keys (input only; `migrateStoredGame` reads them away). A stored race ends play and ranks its
 * racers itself, so one beside `win` or a `ranking` is rejected, never read.
 */
const GameInput = z
  .object({
    /** @deprecated Input only: the name of an old template, dropped on read. */
    template: z.enum(STORED_TEMPLATES).optional(),
    /** @deprecated Input only: a stored race, read as counters, zone rules and a ranking. */
    race: StoredRace.optional(),
    ...GAME_FIELDS,
  })
  .refine((game) => game.race === undefined || game.win === undefined, {
    message: 'A race cannot have a win rule',
    path: ['win'],
  })
  .refine((game) => game.race === undefined || game.ranking === undefined, {
    message: 'A race cannot have a ranking',
    path: ['ranking'],
  });

/**
 * A place's game as it is given and read now: commands (`set_game`), requests, the settings page
 * and the assistant take only this. It never has the old keys (`template`, `race`).
 */
export const Game = LiveGame;
export type Game = z.output<typeof LiveGame>;

/**
 * A place's game as a stored world document holds it: the live game, or one stored before the
 * generic rules, whose old keys are input only and read away (`migrateStoredGame`). Only the
 * stored-document read path (`WorldDocument`) uses it. A codec, so a document can be written back
 * (responses are encoded): the live game is its own stored form.
 */
export const StoredGame = z.codec(GameInput, LiveGame, {
  decode: (game) => migrateStoredGame(game),
  // A game written back is already live (its defaults are filled): it is its own stored form.
  encode: (game) => game as z.output<typeof GameInput>,
});

/**
 * The Core Library ids of the old race gates (removed from the library), as stored worlds may still
 * hold them; `readLegacyGates` reads them as Zone Gates.
 */
export const LEGACY_GATE_ITEMS = {
  checkpoint: 'genvr.core.gameplay.checkpoint',
  finish: 'genvr.core.gameplay.finish-line',
} as const;

/**
 * How many checkpoints a migrated race counts. The rules cannot see the world, so they are written
 * for every checkpoint index up to this number; a stored course with more checkpoints cannot finish
 * a lap (its finish line's tag has no rule) until the designer rebuilds it with zones.
 */
export const MIGRATED_CHECKPOINTS = 16;

/** The zone tag of the old checkpoint at 1-based position `index` (by `order`, then world order). */
export function legacyCheckpointTag(index: number): string {
  return `checkpoint ${index}`;
}

/** The zone tag of an old finish line in a world with `checkpoints` old checkpoints. */
export function legacyFinishTag(checkpoints: number): string {
  return `finish after ${checkpoints}`;
}

/**
 * Whether a tag is one the rules of a migrated race are written for (`legacyCheckpointTag` 1 to
 * `MIGRATED_CHECKPOINTS`, `legacyFinishTag` 0 to `MIGRATED_CHECKPOINTS`). Most of them have no
 * zone in a given place by design, so the Checks do not report them as missing.
 */
export function isLegacyGateTag(tag: string): boolean {
  for (let n = 0; n <= MIGRATED_CHECKPOINTS; n += 1)
    if (tag === legacyFinishTag(n) || (n > 0 && tag === legacyCheckpointTag(n))) return true;
  return false;
}

/**
 * The zone tags of the old race gates in a world (instance id to tag): checkpoints sorted by their
 * `order` param (a missing or bad one reads as 1; equal orders keep world order), exactly as the old
 * race sorted them; every finish line tagged with the number of checkpoints before it. The room
 * turns these instances into gate zones, so a migrated race plays on the gates already placed.
 */
export function legacyGateTags(
  instances: ReadonlyArray<{ instanceId: string; itemId: string; params: Readonly<Record<string, unknown>> }>,
): Map<string, string> {
  const checkpoints = instances
    .filter((i) => i.itemId === LEGACY_GATE_ITEMS.checkpoint)
    .map((i, index) => ({ id: i.instanceId, order: positiveInt(i.params.order) ?? 1, index }))
    .sort((a, b) => a.order - b.order || a.index - b.index);
  const tags = new Map<string, string>();
  checkpoints.forEach((c, index) => tags.set(c.id, legacyCheckpointTag(index + 1)));
  for (const i of instances)
    if (i.itemId === LEGACY_GATE_ITEMS.finish) tags.set(i.instanceId, legacyFinishTag(checkpoints.length));
  return tags;
}

type StoredRace = z.infer<typeof StoredRace>;

/**
 * A stored race as counters, rules over the old gates' zone tags (`legacyGateTags`), a ranking and
 * HUD bindings. What carries over, per the old race component:
 *
 * - `lap` (the current lap, from 1) and `checkpoint` (checkpoints passed in this lap); the ranking
 *   is by `lap`, then `checkpoint`, then who got there first: the old progress order.
 * - `ordered`: checkpoint k counts only when k - 1 were passed. `any_order`: one `checkpoint k
 *   passed` flag per checkpoint, so each counts once a lap; the flags clear at the lap.
 * - A lap completes on the finish line once every checkpoint of the lap was passed; with no
 *   checkpoints every forward pass of it is a lap. A racer past the last lap (`lap > laps`) is
 *   finished: their gates count no more (except `timed`, where laps never finish anyone).
 * - `first_wins`: the first finisher wins. `all_finish`: the first finisher starts a `graceSec`
 *   timer; when it fires, or the clock runs out, the ranking decides (finishers first, in the order
 *   they finished). `timed`: only the clock ends it, the ranking decides.
 *
 * Gaps (the generic engine has no way to express them yet; documented, not dropped silently):
 * - A finished racer's `lap` shows `laps + 1` (the old row kept `laps` and set a finish time).
 * - `all_finish` no longer ends the moment every racer has finished: it ends when the wait after
 *   the first finisher runs out (or the clock). Rules cannot count the players still racing.
 * - No lap times, best lap or finish time, and no `checkpoint` / `lap` wire events.
 * - The live ranking's tie-break by the distance to the next gate is gone (who got there first
 *   decides instead).
 * - No start grid by spawn `slot` and no freeze during the countdown: players are placed like any
 *   game at the start of play.
 * - At most `MIGRATED_CHECKPOINTS` checkpoints.
 */
function raceAsRules(race: StoredRace): { counters: Counter[]; rules: Rule[]; ranking: Ranking; hud: HudBinding[] } {
  const LAP = 'lap';
  const CHECKPOINT = 'checkpoint';
  const CLEAR_FLAGS = 'lap flags clear';
  const anyOrder = race.checkpoints === 'any_order';
  const flag = (k: number) => `checkpoint ${k} passed`;
  const counter = (name: string, op: Compare, value: number): Condition => ({ kind: 'counter', name, op, value });
  const set = (name: string, to: number): Action => ({ kind: 'set_counter', name, to, who: 'actor' });
  const add = (name: string, by: number): Action => ({ kind: 'add_counter', name, by, who: 'actor' });
  const byRanking: Action = { kind: 'end_match', winner: { byCounter: LAP, order: 'high' } };
  // A finished racer's gates count no more; in a timed race nobody finishes.
  const racing: Condition[] = race.finish === 'timed' ? [] : [counter(LAP, '<=', race.laps)];
  const ks = Array.from({ length: MIGRATED_CHECKPOINTS }, (_, i) => i + 1);

  const counters: Counter[] = [
    { name: LAP, scope: 'player', start: 1 },
    { name: CHECKPOINT, scope: 'player', start: 0 },
    ...(anyOrder ? ks.map((k): Counter => ({ name: flag(k), scope: 'player', start: 0 })) : []),
  ];
  const rules: Rule[] = ks.map((k): Rule =>
    anyOrder
      ? {
          when: { event: 'zone_crossed', tag: legacyCheckpointTag(k) },
          if: [...racing, counter(flag(k), '=', 0)],
          do: [set(flag(k), 1), add(CHECKPOINT, 1)],
        }
      : {
          when: { event: 'zone_crossed', tag: legacyCheckpointTag(k) },
          if: [...racing, counter(CHECKPOINT, '=', k - 1)],
          do: [set(CHECKPOINT, k)],
        },
  );
  for (let n = 0; n <= MIGRATED_CHECKPOINTS; n += 1)
    rules.push({
      when: { event: 'zone_crossed', tag: legacyFinishTag(n) },
      if: [...racing, ...(n > 0 ? [counter(CHECKPOINT, '>=', n)] : [])],
      do: [set(CHECKPOINT, 0), ...(anyOrder ? [{ kind: 'emit', event: CLEAR_FLAGS } as const] : []), add(LAP, 1)],
    });
  if (anyOrder)
    for (let first = 0; first < ks.length; first += RULE_LIMITS.actions)
      rules.push({
        when: { event: CLEAR_FLAGS },
        if: [],
        do: ks.slice(first, first + RULE_LIMITS.actions).map((k) => set(flag(k), 0)),
      });
  const finished = counter(LAP, '>', race.laps);
  if (race.finish === 'first_wins')
    rules.push({
      when: { event: 'counter_changed', counter: LAP },
      if: [finished],
      do: [{ kind: 'end_match', winner: { player: 'actor' } }],
    });
  if (race.finish === 'all_finish')
    rules.push(
      {
        when: { event: 'counter_changed', counter: LAP },
        if: [finished],
        do: [{ kind: 'start_timer', name: 'grace', seconds: race.graceSec }],
      },
      { when: { event: 'timer_fired' }, if: [], do: [byRanking] },
    );
  rules.push({ when: { event: 'time_up' }, if: [], do: [byRanking] });
  return {
    counters,
    rules,
    ranking: { by: LAP, order: 'high', then: CHECKPOINT },
    hud: [
      { kind: 'counter', label: 'Lap', counter: LAP },
      { kind: 'rank', label: 'Place' },
      { kind: 'timer', label: 'Time' },
    ],
  };
}

/**
 * Reads a game written before the generic rules: drops `template` (a stored template game already
 * uses the generic components) and turns a `race` into generic rules (`raceAsRules`). The
 * designer's own counters and rules come first, the migrated ones after them (the result is
 * checked as a live game, so a clash of counter names or too many rules is rejected). A game
 * without the old keys is returned as it is.
 */
function migrateStoredGame(game: z.output<typeof GameInput>): z.input<typeof LiveGame> {
  const { template: _template, race, ...stored } = game;
  const rest = stored.loadout
    ? { ...stored, loadout: { ...stored.loadout, items: stored.loadout.items.map(readLegacyItemId) } }
    : stored;
  if (race === undefined) return rest;
  const migrated = raceAsRules(race);
  return {
    ...rest,
    counters: [...(rest.counters ?? []), ...migrated.counters],
    rules: [...(rest.rules ?? []), ...migrated.rules],
    ranking: migrated.ranking,
    hud: rest.hud ?? migrated.hud,
  };
}

/**
 * The Core Library's Zone Gate (`ZONE_GATE_ID`; a core-library test checks they agree): the old
 * race gates of a stored world are read as it.
 */
export const LEGACY_GATE_REPLACEMENT = 'genvr.core.gameplay.zone-gate';

/**
 * Reads the instances of a world stored before the generic rules: every old Checkpoint and Finish
 * line (`LEGACY_GATE_ITEMS`) becomes a Zone Gate in the same place, size and turn, tagged as the
 * migrated race's rules expect (`legacyGateTags`), so a stored race plays on the gates already
 * placed and nothing in the world names the old items any more. Zone params set on an old gate
 * (a shape and a tag) are kept as they were; its other old params (`order`) are dropped. Anything
 * else passes through untouched.
 */
export function readLegacyGates<T extends { instanceId: string; itemId: string; params: Record<string, unknown> }>(
  instances: T[],
): T[] {
  const legacy = new Set<string>(Object.values(LEGACY_GATE_ITEMS));
  if (!instances.some((i) => legacy.has(i.itemId))) return instances;
  const tags = legacyGateTags(instances);
  return instances.map((i) => {
    const tag = tags.get(i.instanceId);
    if (!legacy.has(i.itemId) || tag === undefined) return i;
    const { order: _order, ...kept } = i.params;
    // As the room read it: a zone of its own needs a shape in the params; otherwise the migrated tag.
    const own = zoneFromParams(i.params) !== null;
    const { [ZONE_PARAMS.shape]: _shape, [ZONE_PARAMS.tag]: _tag, [ZONE_PARAMS.visible]: _visible, ...plain } = kept;
    return { ...i, itemId: LEGACY_GATE_REPLACEMENT, params: own ? kept : { ...plain, [ZONE_PARAMS.tag]: tag } };
  });
}

/**
 * The Core Library id of the old Sword item (renamed, decision 119: no game-named items), as stored
 * worlds and loadouts may still hold it; `readLegacyItemId` reads it as the Melee tool.
 */
export const LEGACY_MELEE_TOOL_ID = 'genvr.core.gameplay.sword';

/**
 * The Core Library's Melee tool (`MELEE_TOOL_ID`; a core-library test checks they agree): the same
 * held tool and model the old Sword item was, under a neutral name.
 */
export const MELEE_TOOL_REPLACEMENT = 'genvr.core.gameplay.melee-tool';

/** An item id as stored before the renames: the old Sword item reads as the Melee tool; others pass. */
export function readLegacyItemId(itemId: string): string {
  return itemId === LEGACY_MELEE_TOOL_ID ? MELEE_TOOL_REPLACEMENT : itemId;
}

/**
 * Reads the instances of a stored world (`WorldDocument`): old race gates become Zone Gates
 * (`readLegacyGates`) and renamed items take their new id (`readLegacyItemId`). A world without
 * old items is returned as it is.
 */
export function readLegacyItems<T extends { instanceId: string; itemId: string; params: Record<string, unknown> }>(
  instances: T[],
): T[] {
  const gates = readLegacyGates(instances);
  if (!gates.some((i) => i.itemId === LEGACY_MELEE_TOOL_ID)) return gates;
  return gates.map((i) => (i.itemId === LEGACY_MELEE_TOOL_ID ? { ...i, itemId: MELEE_TOOL_REPLACEMENT } : i));
}

/**
 * The game a place starts with when the builder turns one on (Place settings, the assistant's
 * `set_game`): only generic parts, a match clock, a point per knock-out and the highest score
 * winning. The builder changes the rest.
 */
export function newGame(): Game {
  return {
    match: { minPlayers: 2, durationSec: 300, countdownSec: 5, resultsSec: 10 },
    score: { from: 'kills' },
    win: { by: 'highest_score' },
  };
}

/**
 * A player uses the tool in hand (P9-12), as sent to the room. Tagged by kind so ranged tools
 * (the shooter) add their own shape; `{ yaw }` alone is still taken as a melee strike (clients
 * before the tag). `target` is the session id the client thinks it hit: the server judges hits
 * itself and only counts a claim it cannot confirm (cheat evidence).
 */
export const AttackMessage = z
  .union([
    z.object({
      kind: z.literal('melee'),
      yaw: z.number().finite(),
      target: z.string().min(1).max(64).optional(),
    }),
    z.object({ yaw: z.number().finite() }).strict(),
  ])
  .transform((message) => ('kind' in message ? message : { kind: 'melee' as const, yaw: message.yaw }));
export type AttackMessage = z.output<typeof AttackMessage>;

// What clients see of a running game (P9-12). The room keys everything by session id: accounts
// never reach clients.

/** One row of the game's scoreboard, as the room syncs it (`state.game.players`, by session id). */
export interface GamePlayerRow {
  /** 'red', 'blue', or '' when teams are off. */
  team: string;
  health: number;
  max: number;
  alive: boolean;
  score: number;
  kills: number;
  deaths: number;
  /** False for a player who left mid-match (they keep their row until the match ends). */
  present: boolean;
  /** The item in hand (a Core Library tool id); '' for none. */
  tool: string;
  /** When a knocked-out player comes back (server `Date.now()` ms); 0 when not waiting. */
  respawnAt: number;
  /** The live place by the game's ranking, 1 is first (0 when the game has no ranking). */
  place: number;
  /** This player's own counters (those declared with scope `player`), by name. */
  counters: ReadonlyMap<string, number>;
}

/**
 * The game's synced counters beside the rows (`state.game`): the team counters, keyed by
 * `teamCounterKey` (`'red:<name>'`, `'blue:<name>'`), and the global counters, by name. Each
 * player's own counters are in their row (`GamePlayerRow.counters`).
 */
export interface GameCounterMaps {
  teamCounters: ReadonlyMap<string, number>;
  globalCounters: ReadonlyMap<string, number>;
}

/**
 * The key of a team counter in the synced `teamCounters` map (`GameCounterMaps`): the team, a
 * colon, the counter name (`'red:shared'`).
 */
export function teamCounterKey(team: 'red' | 'blue', name: string): string {
  return `${team}:${name}`;
}

/** A match's winner: a player (by session id), a team, or null for a draw. */
export type GameWinner = { kind: 'player'; id: string } | { kind: 'team'; team: 'red' | 'blue' } | null;

/** The winner as synced: '' (draw or none yet), 'player:<sessionId>', 'team:red' or 'team:blue'. */
export function encodeGameWinner(winner: GameWinner): string {
  if (winner === null) return '';
  return winner.kind === 'player' ? `player:${winner.id}` : `team:${winner.team}`;
}

export function decodeGameWinner(text: string): GameWinner {
  if (text === 'team:red' || text === 'team:blue') return { kind: 'team', team: text === 'team:red' ? 'red' : 'blue' };
  if (text.startsWith('player:') && text.length > 'player:'.length) return { kind: 'player', id: text.slice(7) };
  return null;
}

/** What the room announces to everyone (message `game-event`); ids are session ids. */
export type GameWireEvent =
  | { type: 'hit'; victim: string; by: string | null; damage: number; health: number }
  | { type: 'died'; victim: string; by: string | null }
  /** A player's strike with the tool in hand was accepted: everyone else shows it on them (one per strike). */
  | { type: 'struck'; id: string }
  /** `winner` encoded as in `encodeGameWinner`. */
  | { type: 'match_won'; winner: string }
  /** A rule's `show_message` text; sent only to the players it names. */
  | { type: 'message'; text: string }
  /** A player got on or off a rideable item (`item` is its instance id). */
  | { type: 'mounted' | 'dismounted'; id: string; item: string }
  /** A player says a voice line (a store item id; lip sync, P2-44): play it from them, with their mouth moving. */
  | { type: 'said'; id: string; line: string };

/**
 * A positive whole number from an instance param, given as a number or a numeric string (the
 * builder's param field may store either). The old gates' `order` is read through it.
 */
export function positiveInt(value: unknown): number | undefined {
  if (typeof value !== 'number' && (typeof value !== 'string' || value.trim() === '')) return undefined;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}
