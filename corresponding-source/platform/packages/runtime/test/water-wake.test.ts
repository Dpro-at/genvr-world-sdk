import { describe, expect, it } from 'vitest';
import {
  KELVIN_DEGREES,
  MAX_RINGS,
  RING_LIFE,
  RING_SPACING,
  SPREAD_SHARE,
  WakeField,
  wakeAt,
} from '../src/water-wake.js';

/** Swims along +z from z = 0, dropping rings as it goes, and returns the field at the end. */
function swim(speed: number, seconds: number, step = 0.05) {
  const field = new WakeField();
  for (let t = 0; t <= seconds; t += step) field.follow('me', 0, t * speed, speed, t);
  return { field, now: seconds };
}

describe("the wake a swimmer leaves (P2-39, owner's request)", () => {
  it('has the one angle a wake always has, whatever the speed', () => {
    // A moving body's rings spread at a third of its speed, and the V that is their envelope
    // therefore opens at arcsin(1/3). It is the same for a duck and for a ship, and the point of
    // building it from the rings is that this comes out on its own.
    expect(SPREAD_SHARE).toBeCloseTo(1 / 3, 10);
    expect(KELVIN_DEGREES).toBeCloseTo(19.47, 2);
  });

  it('really does open at that angle, measured off the rings themselves', () => {
    // Follow the edge of the oldest ring still alive: how far it has spread against how far the
    // swimmer has gone since is the sine of the half-angle.
    for (const speed of [0.6, 1.5, 4]) {
      const { field, now } = swim(speed, 3);
      const rings = field.ringsAt(now);
      const oldest = rings.reduce((a, b) => (a.born < b.born ? a : b));
      const age = now - oldest.born;
      const spread = oldest.speed * age;
      const travelled = speed * age;
      expect(Math.asin(spread / travelled) * (180 / Math.PI)).toBeCloseTo(KELVIN_DEGREES, 1);
    }
  });

  it('drops rings evenly along the way, not by how often it is asked', () => {
    const often = new WakeField();
    const rarely = new WakeField();
    for (let t = 0; t <= 2; t += 0.02) often.follow('me', 0, t, 1, t);
    for (let t = 0; t <= 2; t += 0.2) rarely.follow('me', 0, t, 1, t);
    // Both swam 2 m at 1 m/s, so both left the same trail: one ring where they started and one
    // every RING_SPACING after it. The coarse one fills in the gaps it jumped over.
    expect(often.ringsAt(2).length).toBe(rarely.ringsAt(2).length);
    expect(often.ringsAt(2).length).toBe(Math.floor(2 / RING_SPACING) + 1);
  });

  it('leaves nothing behind someone treading water', () => {
    const field = new WakeField();
    for (let t = 0; t <= 3; t += 0.05) field.follow('me', 4, 4, 0, t);
    // One ring where they are, and no trail.
    expect(field.ringsAt(3).length).toBe(1);
  });

  it('fades away instead of piling up', () => {
    const { field } = swim(1, 12);
    expect(field.ringsAt(12).length).toBeLessThanOrEqual(MAX_RINGS);
    // Nothing older than its life is still counted.
    const rings = field.ringsAt(12);
    for (const ring of rings) expect(12 - ring.born).toBeLessThanOrEqual(RING_LIFE);
  });

  it('lifts the water behind the swimmer and leaves it flat far away', () => {
    const { field, now } = swim(1, 2);
    const rings = field.ringsAt(now);
    let behind = 0;
    for (let z = 0; z < 2; z += 0.05) behind = Math.max(behind, Math.abs(wakeAt(rings, 0, z, now).lift));
    expect(behind).toBeGreaterThan(0.001);
    expect(Math.abs(wakeAt(rings, 60, 60, now).lift)).toBeLessThan(1e-6);
  });

  it('is whitest at the swimmer, still white along the trail, and clear away from it', () => {
    const { field, now } = swim(1, 2);
    const rings = field.ringsAt(now);
    // The swimmer is at z = 2 after two seconds at 1 m/s.
    const atBody = wakeAt(rings, 0, 2, now).foam;
    expect(atBody).toBeGreaterThan(0.4);
    // The crests behind carry some white as well: that is what makes the V visible at all, and
    // it has to be weaker than the water breaking at the body itself.
    let behind = 0;
    for (let z = 0; z < 1.6; z += 0.05) behind = Math.max(behind, wakeAt(rings, 0, z, now).foam);
    expect(behind).toBeGreaterThan(0.05);
    expect(behind).toBeLessThan(atBody);
    // Water the swimmer never went near shows nothing. The rings fade off exponentially, so it is
    // never exactly zero, just far below anything an eye or a screen could show.
    expect(wakeAt(rings, 0, -20, now).foam).toBeLessThan(1e-6);
  });

  it('can be turned off, and says so to the shader', () => {
    const { field } = swim(1, 2);
    expect(field.live.value).toBeGreaterThan(0);
    field.setCapacity(0);
    expect(field.live.value).toBe(0);
    field.follow('me', 0, 10, 1, 3);
    expect(field.ringsAt(3).length).toBe(0);
  });

  it('follows each swimmer separately and forgets one that stops', () => {
    const field = new WakeField();
    field.follow('a', 0, 0, 1, 0);
    field.follow('b', 20, 20, 1, 0);
    expect(field.ringsAt(0).length).toBe(2);
    field.forget('a');
    // Forgetting only stops new rings; what is already there still fades on its own.
    expect(field.ringsAt(0).length).toBe(2);
  });
});
