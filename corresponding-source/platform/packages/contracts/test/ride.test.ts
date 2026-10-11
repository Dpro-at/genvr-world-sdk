import { describe, expect, it } from 'vitest';
import {
  GenvrManifest,
  LeaveRideRequest,
  Ride,
  RIDE_LIMITS,
  RIDE_PARAMS,
  RIDE_PRESETS,
  RideModel,
  RideRefusal,
  RideRequest,
  rideFromParams,
  rideToParams,
} from '../src/index.js';

const models = RideModel.options;

describe('ride presets', () => {
  it('parses every preset as a ride', () => {
    for (const model of models) {
      const parsed = Ride.safeParse({ model, ...RIDE_PRESETS[model] });
      expect(parsed.success, model).toBe(true);
    }
  });

  it('keeps every preset inside the platform limits', () => {
    for (const model of models) {
      expect(RIDE_PRESETS[model].maxSpeed).toBeLessThanOrEqual(RIDE_LIMITS.maxSpeed);
      expect(RIDE_PRESETS[model].seats).toBeLessThanOrEqual(RIDE_LIMITS.seats);
    }
  });
});

describe('rideFromParams', () => {
  it('reads a model alone as its preset', () => {
    expect(rideFromParams({ ride: 'ground' })).toEqual({ model: 'ground', ...RIDE_PRESETS.ground });
  });

  it('clamps numbers out of range and takes the preset for unusable values', () => {
    expect(rideFromParams({ ride: 'air', rideSpeed: 999 })?.maxSpeed).toBe(RIDE_LIMITS.maxSpeed);
    expect(rideFromParams({ ride: 'air', rideSpeed: -5 })?.maxSpeed).toBe(1);
    expect(rideFromParams({ ride: 'air', rideSpeed: 'x' })?.maxSpeed).toBe(RIDE_PRESETS.air.maxSpeed);
    expect(rideFromParams({ ride: 'air', rideSpeed: Number.NaN })?.maxSpeed).toBe(RIDE_PRESETS.air.maxSpeed);
    expect(rideFromParams({ ride: 'ground', rideSeats: 2.6 })?.seats).toBe(3);
    expect(rideFromParams({ ride: 'ground', rideSeats: 40 })?.seats).toBe(RIDE_LIMITS.seats);
    expect(rideFromParams({ ride: 'ground', ridePose: 'fly' })?.pose).toBe('sit');
    expect(rideFromParams({ ride: 'ground', rideGlide: 'yes' })?.glide).toBe(false);
    expect(rideFromParams({ ride: 'ground', rideTag: '  ' })?.tag).toBeUndefined();
    expect(rideFromParams({ ride: 'ground', rideTag: ' lane ' })?.tag).toBe('lane');
  });

  it('is null without a usable model', () => {
    expect(rideFromParams({ ride: 'hover' })).toBeNull();
    expect(rideFromParams({})).toBeNull();
    expect(rideFromParams({ rideSpeed: 10 })).toBeNull();
    expect(rideFromParams({ ride: null })).toBeNull();
  });

  it('takes the item default when the params name no model, and the params over it', () => {
    expect(rideFromParams({}, { model: 'water' })).toEqual({ model: 'water', ...RIDE_PRESETS.water });
    expect(rideFromParams({}, { model: 'water', seats: 4 })?.seats).toBe(4);
    expect(rideFromParams({ rideSeats: 2 }, { model: 'water', seats: 4 })?.seats).toBe(2);
    expect(rideFromParams({ ride: 'air' }, { model: 'water' })?.model).toBe('air');
    expect(rideFromParams({}, { seats: 4 })).toBeNull();
  });
});

describe('rideToParams', () => {
  it('turns riding off with null for every key', () => {
    const off = rideToParams(null);
    expect(Object.keys(off).sort()).toEqual(Object.values(RIDE_PARAMS).sort());
    for (const value of Object.values(off)) expect(value).toBeNull();
    expect(rideFromParams(off)).toBeNull();
  });

  it('round-trips every preset with a tag', () => {
    for (const model of models) {
      const ride = Ride.parse({ model, ...RIDE_PRESETS[model], tag: 'a' });
      expect(rideFromParams(rideToParams(ride))).toEqual(ride);
    }
  });

  it('writes a missing tag as null', () => {
    expect(rideToParams(Ride.parse({ model: 'ground', ...RIDE_PRESETS.ground })).rideTag).toBeNull();
  });

  it('uses param keys of at most 32 characters', () => {
    for (const key of Object.values(RIDE_PARAMS)) expect(key.length).toBeLessThanOrEqual(32);
  });
});

describe('ride wire messages and the manifest default', () => {
  it('parses the requests and names the refusals', () => {
    expect(RideRequest.parse({ instanceId: 'i-1' })).toEqual({ instanceId: 'i-1' });
    expect(RideRequest.safeParse({}).success).toBe(false);
    expect(LeaveRideRequest.parse({})).toEqual({});
    expect(RideRefusal.options).toEqual([
      'not_rideable',
      'too_far',
      'full',
      'cannot_move',
      'side_view',
      'busy',
      'not_here',
    ]);
  });

  it('lets a manifest carry a partial ride default', () => {
    const shape = GenvrManifest.shape.ride;
    expect(shape.safeParse(undefined).success).toBe(true);
    expect(shape.safeParse({ model: 'air', seats: 2 }).success).toBe(true);
    expect(shape.safeParse({ maxSpeed: 999 }).success).toBe(false);
  });
});
