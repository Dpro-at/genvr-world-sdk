import { z } from 'zod';
import { RIDE_LIMITS } from './ride.js';

/** Limits of the generic rules (counters, rules, zones); the validator, the server and the UI share them. */
export const RULE_LIMITS = {
  counters: 32,
  rules: 64,
  conditions: 6,
  actions: 8,
  name: 40,
  text: 80,
  chain: 8,
  actionsPerEvent: 64,
  hud: 8,
} as const;

/** The events the engine raises. Rules may also listen for a custom name raised by an `emit` action. */
export const GameEventName = z.enum([
  'zone_entered',
  'zone_exited',
  'zone_crossed',
  'player_joined',
  'player_left',
  'hit',
  'died',
  'respawned',
  'phase_changed',
  'time_up',
  'counter_changed',
  'timer_fired',
  /** A player got on a rideable item (`when.tag` matches the item's ride tag). */
  'mounted',
  /** A player got off a rideable item. */
  'dismounted',
]);
export type GameEventName = z.infer<typeof GameEventName>;

/**
 * A designer's name or zone tag: trimmed where it is stored, so 'pad ' in a rule is the zone 'pad'
 * (`zoneFromParams` trims a stored tag the same way) and '  ' is no name.
 */
const Name = z.string().trim().min(1).max(RULE_LIMITS.name);
const Text = z.string().max(RULE_LIMITS.text);

/** A zone setting on a placed item: the tag is free text the designer chooses; the engine never interprets it. */
export const Zone = z.object({
  shape: z.enum(['area', 'gate']),
  tag: Name,
  visibleInPlay: z.boolean().default(false),
});
export type Zone = z.infer<typeof Zone>;

export const Counter = z.object({
  name: Name,
  scope: z.enum(['player', 'team', 'global']),
  start: z.number().finite().default(0),
});
export type Counter = z.infer<typeof Counter>;

export const Compare = z.enum(['=', '!=', '<', '<=', '>', '>=']);
export type Compare = z.infer<typeof Compare>;

export const Who = z.enum(['actor', 'everyone', 'team_of_actor']);
export type Who = z.infer<typeof Who>;

export const Condition = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('counter'),
    name: Name,
    op: Compare,
    value: z.union([z.number().finite(), z.object({ counter: Name })]),
  }),
  z.object({ kind: z.literal('phase'), is: z.enum(['waiting', 'countdown', 'playing', 'results']) }),
  z.object({ kind: z.literal('team'), is: z.enum(['red', 'blue']) }),
  /** Whether the actor rides an item (with that ride tag, when given). */
  z.object({ kind: z.literal('riding'), is: z.boolean(), tag: Name.optional() }),
]);
export type Condition = z.infer<typeof Condition>;

export const Action = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('add_counter'), name: Name, by: z.number().finite(), who: Who.default('actor') }),
  z.object({ kind: z.literal('set_counter'), name: Name, to: z.number().finite(), who: Who.default('actor') }),
  z.object({ kind: z.literal('add_score'), by: z.number().finite(), who: Who.default('actor') }),
  z.object({
    kind: z.literal('end_match'),
    winner: z.union([
      z.object({ byCounter: Name, order: z.enum(['high', 'low']) }),
      z.object({ player: z.literal('actor') }),
      z.object({ team: z.enum(['red', 'blue']) }),
      z.literal('nobody'),
    ]),
  }),
  z.object({ kind: z.literal('start_timer'), name: Name, seconds: z.number().min(0.1).max(3600) }),
  z.object({ kind: z.literal('damage'), amount: z.number().int().min(1).max(1000), who: Who.default('actor') }),
  z.object({ kind: z.literal('heal'), amount: z.number().int().min(1).max(1000), who: Who.default('actor') }),
  z.object({ kind: z.literal('teleport_to_zone'), tag: Name, who: Who.default('actor') }),
  z.object({ kind: z.literal('show_message'), text: Text, who: Who.default('actor') }),
  z.object({ kind: z.literal('emit'), event: Name }),
  /**
   * The players say a voice line (an audio item with a voice; lip sync, P2-44): everyone hears it from the speaker and
   * sees their mouth move. The line is a store item id.
   */
  z.object({
    kind: z.literal('say'),
    /** Empty until the designer picks a line: then it says nothing. */
    line: z
      .string()
      .max(130)
      .regex(/^([a-z0-9][a-z0-9._-]*)?$/),
    who: Who.default('actor'),
  }),
  /** Gets the players off what they ride (at the item's exit spot); the room carries it out. */
  z.object({ kind: z.literal('dismount'), who: Who.default('actor') }),
  /** Scales the players' allowed and simulated top speed (walking and riding) for `seconds`. */
  z.object({
    kind: z.literal('set_speed'),
    factor: z.number().min(RIDE_LIMITS.speedFactor[0]).max(RIDE_LIMITS.speedFactor[1]),
    seconds: z.number().min(0.1).max(600),
    who: Who.default('actor'),
  }),
]);
export type Action = z.infer<typeof Action>;

export const Rule = z.object({
  when: z.object({
    event: z.union([GameEventName, Name]),
    tag: Name.optional(),
    counter: Name.optional(),
  }),
  if: z.array(Condition).max(RULE_LIMITS.conditions).default([]),
  do: z.array(Action).min(1).max(RULE_LIMITS.actions),
});
export type Rule = z.infer<typeof Rule>;

/** The counter that orders players (scoreboard, place, default winner); the designer chooses it. */
export const Ranking = z.object({ by: Name, order: z.enum(['high', 'low']), then: Name.optional() });
export type Ranking = z.infer<typeof Ranking>;

export const HudBinding = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('counter'), label: Text, counter: Name }),
  z.object({ kind: z.literal('rank'), label: Text }),
  z.object({ kind: z.literal('timer'), label: Text }),
  /** The local player's speed, walking or riding, worked out on the device. */
  z.object({ kind: z.literal('speed'), label: Text, unit: z.enum(['km/h', 'm/s']).default('km/h') }),
]);
export type HudBinding = z.infer<typeof HudBinding>;

/**
 * The zone settings of a placed item, stored flat in its instance params (`set_item_params` takes
 * only strings, numbers, booleans and null): `zone` is the shape ('area' | 'gate'), `zoneTag` the
 * tag, `zoneVisible` whether players see it while playing. The room, the validator and the studio
 * read them through `zoneFromParams`, so they agree on what is a zone.
 */
export const ZONE_PARAMS = { shape: 'zone', tag: 'zoneTag', visible: 'zoneVisible' } as const;

/**
 * A zone's size in metres from its item's scale: a gate is 12 m wide times the x scale (2 to
 * 120 m) with no depth; an area is 4 m times the x and z scale (1 to 120 m each). Width is across
 * the item's facing, depth along it. The room judges zones with it and the assistant reports it.
 */
export function zoneSize(shape: Zone['shape'], scale: readonly number[]): { width: number; depth: number } {
  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
  const [sx = 1, , sz = 1] = scale;
  return shape === 'gate'
    ? { width: clamp(12 * sx, 2, 120), depth: 0 }
    : { width: clamp(4 * sx, 1, 120), depth: clamp(4 * sz, 1, 120) };
}

/**
 * The zone an item's params describe, or null when it is none: no shape (neither in the params nor
 * `itemShape`, the shape a zone item has by itself), or no usable tag (a string of 1 to
 * `RULE_LIMITS.name` characters once trimmed). A shape in the params wins over `itemShape`.
 */
export function zoneFromParams(params: Readonly<Record<string, unknown>>, itemShape?: Zone['shape']): Zone | null {
  const named = params[ZONE_PARAMS.shape];
  const shape = named === 'area' || named === 'gate' ? named : named === undefined || named === null ? itemShape : undefined;
  const raw = params[ZONE_PARAMS.tag];
  const tag = typeof raw === 'string' ? raw.trim() : '';
  if (!shape || tag.length === 0 || tag.length > RULE_LIMITS.name) return null;
  return { shape, tag, visibleInPlay: params[ZONE_PARAMS.visible] === true };
}
