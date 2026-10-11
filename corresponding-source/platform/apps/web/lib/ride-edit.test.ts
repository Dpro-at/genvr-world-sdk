import { RIDE_LIMITS, RIDE_PARAMS, RIDE_PRESETS, RideDefault, rideFromParams } from '@genvr/contracts';
import { describe, expect, it } from 'vitest';
import {
  choicePatch,
  numberPatch,
  RIDE_CHOICES,
  rideChoice,
  rideFields,
  flagPatch,
  tagPatch,
} from './ride-edit';

/** Params after a patch, as `set_item_params` applies it (null removes). */
const apply = (params: Record<string, unknown>, patch: Record<string, unknown>) => {
  const next = { ...params };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete next[key];
    else next[key] = value;
  }
  return next;
};

describe('ride settings of a placed item', () => {
  it('offers off and the three media', () => {
    expect(RIDE_CHOICES).toEqual(['off', 'ground', 'water', 'air']);
    expect(rideChoice(null)).toBe('off');
    expect(rideChoice(rideFromParams({ ride: 'water' }))).toBe('water');
  });

  it('writes the preset of a chosen model, keeping the seats and the tag', () => {
    let params: Record<string, unknown> = { color: '#fafafa' };
    params = apply(params, choicePatch('ground', null));
    expect(rideFromParams(params)).toEqual({ model: 'ground', ...RIDE_PRESETS.ground });
    params = apply(params, numberPatch('seats', 3));
    params = apply(params, tagPatch(' lane '));
    params = apply(params, numberPatch('maxSpeed', 35));
    params = apply(params, choicePatch('air', rideFromParams(params)));
    expect(rideFromParams(params)).toEqual({ model: 'air', ...RIDE_PRESETS.air, seats: 3, tag: 'lane' });
    expect(params.color).toBe('#fafafa');
  });

  it('turns riding off by clearing every ride key', () => {
    let params: Record<string, unknown> = { color: '#fafafa' };
    params = apply(params, choicePatch('water', null));
    params = apply(params, tagPatch('pad'));
    params = apply(params, choicePatch('off', rideFromParams(params)));
    expect(params).toEqual({ color: '#fafafa' });
    expect(rideFromParams(params)).toBeNull();
  });

  it('turns off an item that comes rideable by itself with a model that is none', () => {
    const itemDefault: RideDefault = { model: 'ground', seats: 2 };
    const params = apply({}, choicePatch('off', rideFromParams({}, itemDefault), itemDefault));
    expect(rideFromParams(params, itemDefault)).toBeNull();
    // Choosing a model again replaces the "none".
    const back = apply(params, choicePatch('water', null, itemDefault));
    expect(rideFromParams(back, itemDefault)?.model).toBe('water');
  });

  it('writes one key for a number, clamped to the schema limits', () => {
    expect(numberPatch('maxSpeed', 999)).toEqual({ [RIDE_PARAMS.maxSpeed]: RIDE_LIMITS.maxSpeed });
    expect(numberPatch('seats', 2.6)).toEqual({ rideSeats: 3 });
    expect(numberPatch('seats', 0)).toEqual({ rideSeats: 1 });
    expect(numberPatch('grip', -1)).toEqual({ rideGrip: 0 });
    expect(numberPatch('turn', 5)).toEqual({ rideTurn: RIDE_LIMITS.turnDeg[0] });
    expect(numberPatch('accel', Number.NaN)).toEqual({});
    const params = apply({ ride: 'ground' }, numberPatch('accel', 12.5));
    expect(rideFromParams(params)?.accel).toBe(12.5);
  });

  it('writes the flags and a trimmed tag cut to the limit; an empty tag removes it', () => {
    expect(flagPatch('glide', true)).toEqual({ rideGlide: true });
    expect(flagPatch('pose', 'stand')).toEqual({ ridePose: 'stand' });
    expect(tagPatch('x'.repeat(60)).rideTag).toHaveLength(RIDE_LIMITS.tag);
    expect(tagPatch('   ')).toEqual({ rideTag: null });
  });

  it('shows the fields each model uses, the rest under More', () => {
    const keys = (model: 'ground' | 'water' | 'air', more: boolean) =>
      rideFields(model, more).map((field) => field.key);
    expect(keys('ground', false)).toEqual(['maxSpeed', 'accel', 'turn', 'grip', 'gravity', 'camera']);
    expect(keys('water', false)).toEqual(['maxSpeed', 'accel', 'turn', 'grip', 'camera']);
    expect(keys('air', false)).toEqual(['maxSpeed', 'accel', 'turn', 'grip', 'climb', 'ceiling', 'camera']);
    expect(keys('ground', true)).toEqual(['reverse', 'seatHeight', 'reach', 'exit', 'returnSec']);
    // Every field's range is the schema's range.
    for (const field of [
      ...rideFields('air', false),
      ...rideFields('ground', false),
      ...rideFields('air', true),
    ]) {
      expect(numberPatch(field.key, field.min - 1000)[RIDE_PARAMS[field.key]]).toBe(field.min);
      expect(numberPatch(field.key, field.max + 1000)[RIDE_PARAMS[field.key]]).toBe(field.max);
      expect(RideDefault.safeParse({ [field.key]: field.min }).success, field.key).toBe(true);
      expect(RideDefault.safeParse({ [field.key]: field.max }).success, field.key).toBe(true);
      expect(RideDefault.safeParse({ [field.key]: field.min - 0.01 }).success, field.key).toBe(false);
      expect(RideDefault.safeParse({ [field.key]: field.max + 0.01 }).success, field.key).toBe(false);
    }
  });
});
