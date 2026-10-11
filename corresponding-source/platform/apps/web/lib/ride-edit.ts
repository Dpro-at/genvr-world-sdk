/**
 * The ride settings of a placed item in the studio (movement modes, Task 8): any item can be made
 * rideable with a movement model (the medium it moves in) and generic numbers. Stored flat in the
 * item's params (`RIDE_PARAMS`) through `set_item_params`, exactly as the room, the runtime and the
 * validator read them (`rideFromParams`). Pure, so it is tested without the studio.
 */

import {
  RIDE_LIMITS,
  RIDE_PARAMS,
  RIDE_PRESETS,
  rideToParams,
  type Ride,
  type RideDefault,
  type RideModel,
} from '@genvr/contracts';
import type { ParamsPatch } from './zone-settings';

export type RideChoice = RideModel | 'off';

export const RIDE_CHOICES: readonly RideChoice[] = ['off', 'ground', 'water', 'air'];

/** The medium only: never what the item is. */
export const RIDE_CHOICE_LABELS: Record<RideChoice, string> = {
  off: 'Off',
  ground: 'On ground',
  water: 'On water',
  air: 'In the air',
};

/**
 * The model value that turns riding off for an item that comes rideable by itself (its manifest
 * `ride`): a null param would fall back to that default, a value that is no model does not.
 */
export const RIDE_OFF = 'off';

export type RideNumberKey = { [K in keyof Ride]-?: Ride[K] extends number ? K : never }[keyof Ride];

/** A number setting as the studio shows it; the range is the schema's. */
export interface RideField {
  key: RideNumberKey;
  label: string;
  min: number;
  max: number;
  step: number;
  /** The value in words ("20 m/s", "90 %"). */
  shown: (value: number) => string;
}

const round = (value: number, places = 2) => {
  const f = 10 ** places;
  return Math.round(value * f) / f;
};
const percent = (value: number) => `${Math.round(value * 100)} %`;
const unit = (text: string) => (value: number) => `${round(value)} ${text}`;

const FIELDS: Record<RideNumberKey, RideField> = {
  seats: { key: 'seats', label: 'Seats', min: 1, max: RIDE_LIMITS.seats, step: 1, shown: (v) => `${v}` },
  maxSpeed: {
    key: 'maxSpeed',
    label: 'Top speed',
    min: 1,
    max: RIDE_LIMITS.maxSpeed,
    step: 1,
    shown: unit('m/s'),
  },
  accel: {
    key: 'accel',
    label: 'Acceleration',
    min: RIDE_LIMITS.accel[0],
    max: RIDE_LIMITS.accel[1],
    step: 0.5,
    shown: unit('m/s²'),
  },
  turn: {
    key: 'turn',
    label: 'Turning',
    min: RIDE_LIMITS.turnDeg[0],
    max: RIDE_LIMITS.turnDeg[1],
    step: 5,
    shown: unit('°/s'),
  },
  grip: { key: 'grip', label: 'Grip', min: 0, max: 1, step: 0.05, shown: percent },
  gravity: { key: 'gravity', label: 'Gravity', min: 0, max: 3, step: 0.1, shown: (v) => `${round(v)} ×` },
  climb: {
    key: 'climb',
    label: 'Climb speed',
    min: RIDE_LIMITS.climb[0],
    max: RIDE_LIMITS.climb[1],
    step: 0.5,
    shown: unit('m/s'),
  },
  ceiling: {
    key: 'ceiling',
    label: 'Height limit',
    min: RIDE_LIMITS.ceiling[0],
    max: RIDE_LIMITS.ceiling[1],
    step: 5,
    shown: unit('m'),
  },
  camera: {
    key: 'camera',
    label: 'Camera distance',
    min: RIDE_LIMITS.camera[0],
    max: RIDE_LIMITS.camera[1],
    step: 1,
    shown: unit('m'),
  },
  reverse: { key: 'reverse', label: 'Backward speed', min: 0, max: 1, step: 0.05, shown: percent },
  seatHeight: { key: 'seatHeight', label: 'Seat height', min: 0, max: 1, step: 0.05, shown: percent },
  reach: {
    key: 'reach',
    label: 'Reach',
    min: RIDE_LIMITS.reach[0],
    max: RIDE_LIMITS.reach[1],
    step: 0.5,
    shown: unit('m'),
  },
  exit: {
    key: 'exit',
    label: 'Get-off distance',
    min: RIDE_LIMITS.exit[0],
    max: RIDE_LIMITS.exit[1],
    step: 0.5,
    shown: unit('m'),
  },
  returnSec: {
    key: 'returnSec',
    label: 'Return after',
    min: RIDE_LIMITS.returnSec[0],
    max: RIDE_LIMITS.returnSec[1],
    step: 5,
    shown: (v) => (v === 0 ? 'Stays' : `${round(v)} s`),
  },
};

const MAIN: Record<RideModel, RideNumberKey[]> = {
  ground: ['maxSpeed', 'accel', 'turn', 'grip', 'gravity', 'camera'],
  water: ['maxSpeed', 'accel', 'turn', 'grip', 'camera'],
  air: ['maxSpeed', 'accel', 'turn', 'grip', 'climb', 'ceiling', 'camera'],
};
const MORE: RideNumberKey[] = ['reverse', 'seatHeight', 'reach', 'exit', 'returnSec'];

/** The number fields a model shows as sliders; `more` gives the ones under "More". */
export function rideFields(model: RideModel, more: boolean): RideField[] {
  return (more ? MORE : MAIN[model]).map((key) => FIELDS[key]);
}

/** The seats field (a stepper, not a slider). */
export const SEATS_FIELD = FIELDS.seats;

/** What the model picker shows for an item's ride. */
export function rideChoice(ride: Ride | null): RideChoice {
  return ride?.model ?? 'off';
}

/**
 * The params patch for a model choice. A model writes its preset numbers, keeping the seats and the
 * tag the designer gave; off clears every ride setting (and, for an item rideable by itself, stores
 * a model that is none so its own default does not come back).
 */
export function choicePatch(
  choice: RideChoice,
  current: Ride | null,
  itemDefault?: RideDefault,
): ParamsPatch {
  if (choice === 'off') {
    const patch = rideToParams(null);
    if (itemDefault?.model) patch[RIDE_PARAMS.model] = RIDE_OFF;
    return patch;
  }
  const preset = RIDE_PRESETS[choice];
  return rideToParams({
    model: choice,
    ...preset,
    seats: current?.seats ?? preset.seats,
    ...(current?.tag ? { tag: current.tag } : {}),
  });
}

/** The params patch for one number, kept inside the schema's range (seats whole); {} when not a number. */
export function numberPatch(key: RideNumberKey, value: number): ParamsPatch {
  if (!Number.isFinite(value)) return {};
  const field = FIELDS[key];
  const clamped = Math.min(field.max, Math.max(field.min, value));
  return { [RIDE_PARAMS[key]]: key === 'seats' ? Math.round(clamped) : round(clamped, 3) };
}

/** The params patch for the air item's glide or the riders' pose. */
export function flagPatch(key: 'glide', value: boolean): ParamsPatch;
export function flagPatch(key: 'pose', value: Ride['pose']): ParamsPatch;
export function flagPatch(key: 'glide' | 'pose', value: boolean | Ride['pose']): ParamsPatch {
  return { [RIDE_PARAMS[key]]: value };
}

/** The params patch for a typed ride tag: trimmed and cut to the limit; empty removes it. */
export function tagPatch(text: string): ParamsPatch {
  const tag = text.trim().slice(0, RIDE_LIMITS.tag).trim();
  return { [RIDE_PARAMS.tag]: tag === '' ? null : tag };
}
