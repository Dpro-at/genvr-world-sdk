import { z } from 'zod';
import { Id } from './common.js';

/**
 * Movement modes (docs/superpowers/specs/2026-09-30-movement-modes-design.md): any placed item can
 * be made rideable by a designer. The engine knows only a movement model (the medium it moves in)
 * and generic numbers; what the item is stays the designer's business.
 */

/** Hard limits of the ride settings; the schema, the room, the tool and the assistant share them. */
export const RIDE_LIMITS = {
  seats: 8,
  /** m/s, the platform cap. */
  maxSpeed: 60,
  accel: [0.5, 40],
  turnDeg: [10, 360],
  climb: [0, 30],
  ceiling: [5, 300],
  camera: [2, 40],
  reach: [1, 12],
  exit: [0.5, 10],
  returnSec: [0, 600],
  speedFactor: [0.1, 3],
  tag: 40,
} as const;

/** The medium an item moves in: on a surface, floating on water, or through the air. */
export const RideModel = z.enum(['ground', 'water', 'air']);
export type RideModel = z.infer<typeof RideModel>;

/** Each setting without its default, so a partial default (the manifest's) never fills the rest. */
const FIELDS = {
  seats: z.number().int().min(1).max(RIDE_LIMITS.seats),
  /** Top speed forward, m/s. */
  maxSpeed: z.number().min(1).max(RIDE_LIMITS.maxSpeed),
  /** Top speed backward as a share of maxSpeed (0: cannot back up). */
  reverse: z.number().min(0).max(1),
  /** m/s gained per second at full input; braking is twice this. */
  accel: z.number().min(RIDE_LIMITS.accel[0]).max(RIDE_LIMITS.accel[1]),
  /** Degrees per second at full steer (ground: reached at 30 % of maxSpeed and above). */
  turn: z.number().min(RIDE_LIMITS.turnDeg[0]).max(RIDE_LIMITS.turnDeg[1]),
  /** 0..1: how much sideways sliding is removed per step (1: none, 0: ice). */
  grip: z.number().min(0).max(1),
  /** Gravity multiplier (ground: pulls onto the surface and off ramps; air: ignored while hovering). */
  gravity: z.number().min(0).max(3),
  /** Air only: vertical m/s at full up or down input. */
  climb: z.number().min(RIDE_LIMITS.climb[0]).max(RIDE_LIMITS.climb[1]),
  /** Air only: true needs forward speed to stay up (below 30 % of maxSpeed it sinks); false hovers. */
  glide: z.boolean(),
  /** Air only: highest point above the ground under it, m. */
  ceiling: z.number().min(RIDE_LIMITS.ceiling[0]).max(RIDE_LIMITS.ceiling[1]),
  /** Chase camera distance behind the item, m. */
  camera: z.number().min(RIDE_LIMITS.camera[0]).max(RIDE_LIMITS.camera[1]),
  /** Seat height as a share of the item's height (seats are laid out automatically). */
  seatHeight: z.number().min(0).max(1),
  /** How riders are shown. */
  pose: z.enum(['sit', 'stand']),
  /** How close a player must stand to the item's origin to get on, m. */
  reach: z.number().min(RIDE_LIMITS.reach[0]).max(RIDE_LIMITS.reach[1]),
  /** How far to the side of the item riders are put when they get off, m. */
  exit: z.number().min(RIDE_LIMITS.exit[0]).max(RIDE_LIMITS.exit[1]),
  /** Seconds an empty item waits before going back to where it was placed; 0 = it stays. */
  returnSec: z.number().min(RIDE_LIMITS.returnSec[0]).max(RIDE_LIMITS.returnSec[1]),
  /** Free text for rules (`when mounted tag ...`); the engine never interprets it. */
  tag: z.string().trim().min(1).max(RIDE_LIMITS.tag),
};

/** A rideable item's settings. */
export const Ride = z.object({
  model: RideModel,
  seats: FIELDS.seats.default(1),
  maxSpeed: FIELDS.maxSpeed,
  reverse: FIELDS.reverse.default(0.4),
  accel: FIELDS.accel,
  turn: FIELDS.turn,
  grip: FIELDS.grip,
  gravity: FIELDS.gravity.default(1),
  climb: FIELDS.climb.default(0),
  glide: FIELDS.glide.default(false),
  ceiling: FIELDS.ceiling.default(100),
  camera: FIELDS.camera.default(8),
  seatHeight: FIELDS.seatHeight.default(0.35),
  pose: FIELDS.pose.default('sit'),
  reach: FIELDS.reach.default(4),
  exit: FIELDS.exit.default(2),
  returnSec: FIELDS.returnSec.default(0),
  tag: FIELDS.tag.optional(),
});
export type Ride = z.infer<typeof Ride>;

/**
 * A ride default an item may come with (`GenvrManifest.ride`): any subset of the settings, no
 * defaults filled in (the preset of the model fills the rest, and instance params win).
 */
export const RideDefault = z
  .object({
    model: RideModel,
    ...FIELDS,
  })
  .partial();
export type RideDefault = z.infer<typeof RideDefault>;

/** Starting numbers per model; the designer tunes from there. */
export const RIDE_PRESETS: Record<RideModel, Omit<Ride, 'model' | 'tag'>> = {
  ground: {
    seats: 1, maxSpeed: 20, reverse: 0.4, accel: 8, turn: 90, grip: 0.9, gravity: 1, climb: 0, glide: false,
    ceiling: 100, camera: 7, seatHeight: 0.35, pose: 'sit', reach: 4, exit: 2, returnSec: 0,
  },
  water: {
    seats: 1, maxSpeed: 12, reverse: 0.3, accel: 4, turn: 60, grip: 0.3, gravity: 1, climb: 0, glide: false,
    ceiling: 100, camera: 9, seatHeight: 0.35, pose: 'sit', reach: 4, exit: 2, returnSec: 0,
  },
  air: {
    seats: 1, maxSpeed: 30, reverse: 0, accel: 6, turn: 70, grip: 0.6, gravity: 1, climb: 6, glide: false,
    ceiling: 100, camera: 12, seatHeight: 0.35, pose: 'sit', reach: 4, exit: 2, returnSec: 0,
  },
};

/** Stored flat in instance params (`set_item_params` takes strings, numbers, booleans, null; keys <= 32 chars). */
export const RIDE_PARAMS = {
  model: 'ride',
  seats: 'rideSeats',
  maxSpeed: 'rideSpeed',
  reverse: 'rideReverse',
  accel: 'rideAccel',
  turn: 'rideTurn',
  grip: 'rideGrip',
  gravity: 'rideGravity',
  climb: 'rideClimb',
  glide: 'rideGlide',
  ceiling: 'rideCeiling',
  camera: 'rideCamera',
  seatHeight: 'rideSeatHeight',
  pose: 'ridePose',
  reach: 'rideReach',
  exit: 'rideExit',
  returnSec: 'rideReturn',
  tag: 'rideTag',
} as const satisfies Record<keyof Ride, string>;

type NumberKey = { [K in keyof Ride]-?: Ride[K] extends number ? K : never }[keyof Ride];

/** The range of each number setting, and whether it is whole. */
const RANGES: Record<NumberKey, { min: number; max: number; int?: boolean }> = {
  seats: { min: 1, max: RIDE_LIMITS.seats, int: true },
  maxSpeed: { min: 1, max: RIDE_LIMITS.maxSpeed },
  reverse: { min: 0, max: 1 },
  accel: { min: RIDE_LIMITS.accel[0], max: RIDE_LIMITS.accel[1] },
  turn: { min: RIDE_LIMITS.turnDeg[0], max: RIDE_LIMITS.turnDeg[1] },
  grip: { min: 0, max: 1 },
  gravity: { min: 0, max: 3 },
  climb: { min: RIDE_LIMITS.climb[0], max: RIDE_LIMITS.climb[1] },
  ceiling: { min: RIDE_LIMITS.ceiling[0], max: RIDE_LIMITS.ceiling[1] },
  camera: { min: RIDE_LIMITS.camera[0], max: RIDE_LIMITS.camera[1] },
  seatHeight: { min: 0, max: 1 },
  reach: { min: RIDE_LIMITS.reach[0], max: RIDE_LIMITS.reach[1] },
  exit: { min: RIDE_LIMITS.exit[0], max: RIDE_LIMITS.exit[1] },
  returnSec: { min: RIDE_LIMITS.returnSec[0], max: RIDE_LIMITS.returnSec[1] },
};

/** A finite number from a param (a number or a numeric string, as the builder's field may store). */
function finite(value: unknown): number | undefined {
  if (typeof value !== 'number' && (typeof value !== 'string' || value.trim() === '')) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function model(value: unknown): RideModel | undefined {
  return value === 'ground' || value === 'water' || value === 'air' ? value : undefined;
}

function tagOf(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const tag = value.trim();
  return tag.length > 0 && tag.length <= RIDE_LIMITS.tag ? tag : undefined;
}

/**
 * The ride an item's params describe, or null when it is not rideable (no model in the params nor in
 * `itemDefault`, the manifest's `ride`; a model in the params that is not one of the models). Never
 * throws: a missing number takes the item default, then the preset; a number out of range is clamped;
 * a bad enum or boolean takes the preset. The room, the runtime, the validator and the studio all
 * read rides through this one function, so they agree.
 */
export function rideFromParams(params: Readonly<Record<string, unknown>>, itemDefault?: RideDefault): Ride | null {
  const named = params[RIDE_PARAMS.model];
  const chosen = named === undefined || named === null ? model(itemDefault?.model) : model(named);
  if (!chosen) return null;
  const preset = RIDE_PRESETS[chosen];
  const pick = (key: keyof Ride): unknown => {
    const own = params[RIDE_PARAMS[key]];
    return own === undefined || own === null ? itemDefault?.[key] : own;
  };
  const numbers = {} as Record<NumberKey, number>;
  for (const key of Object.keys(RANGES) as NumberKey[]) {
    const range = RANGES[key];
    const raw = finite(pick(key));
    if (raw === undefined) {
      numbers[key] = preset[key];
      continue;
    }
    const clamped = Math.min(range.max, Math.max(range.min, raw));
    numbers[key] = range.int ? Math.round(clamped) : clamped;
  }
  const glide = pick('glide');
  const pose = pick('pose');
  const tag = tagOf(pick('tag'));
  return {
    model: chosen,
    ...numbers,
    glide: typeof glide === 'boolean' ? glide : preset.glide,
    pose: pose === 'sit' || pose === 'stand' ? pose : preset.pose,
    ...(tag === undefined ? {} : { tag }),
  };
}

/** The params `set_item_params` writes for a ride (null for every key turns riding off). */
export function rideToParams(ride: Ride | null): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {};
  for (const [key, param] of Object.entries(RIDE_PARAMS) as Array<[keyof Ride, string]>)
    out[param] = ride === null ? null : (ride[key] ?? null);
  return out;
}

/** Client -> room `ride`: get on the item with this instance id. */
export const RideRequest = z.object({ instanceId: Id });
export type RideRequest = z.infer<typeof RideRequest>;

/** Client -> room `leave-ride`: get off. */
export const LeaveRideRequest = z.object({});
export type LeaveRideRequest = z.infer<typeof LeaveRideRequest>;

/**
 * Why the room refused to let a player get on (room -> client `ride-refused { reason }`). `not_here`:
 * the item cannot move where it is (one that moves on water with no water under it).
 */
export const RideRefusal = z.enum(['not_rideable', 'too_far', 'full', 'cannot_move', 'side_view', 'busy', 'not_here']);
export type RideRefusal = z.infer<typeof RideRefusal>;
