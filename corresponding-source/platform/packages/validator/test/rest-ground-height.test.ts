import { WorldDocument, type ItemInstance } from '@genvr/contracts';
import { describe, expect, it } from 'vitest';
import { rotate } from '../src/geometry.js';
import { rest, SurfaceIndex, type RestShape } from '../src/index.js';

/**
 * The tilt law at realistic ground heights (ITEMS-close-01, GROUND-01 diagnosis): the plane fit used
 * raw sums, so an off-centre footprint read the absolute ground height as slope. On flat ground 20 m
 * up (the island's sea level) a giant clam leaned 20 degrees and a starfish 30.
 */
const doc = (instances: ItemInstance[] = []) =>
  WorldDocument.parse({
    schemaVersion: 1,
    experienceId: 'x',
    version: 0,
    style: { base: 'realistic' },
    sizeTier: 'small',
    access: { mode: 'private' },
    environment: { sky: { preset: 'day' }, weather: { preset: 'clear' } },
    terrain: {},
    spawn: { position: [0, 1, 0] },
    instances,
  });
const at = (x: number, y: number, z: number, yaw = 0): ItemInstance => ({
  instanceId: 'it',
  itemId: 'it',
  transform: {
    position: [x, y, z],
    rotation: [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)],
    scale: [1, 1, 1],
  },
  params: {},
});
/** Lean from upright in degrees: the angle between the item's own up and the vertical (yaw ignored). */
const tiltOf = (rotation: readonly number[]) =>
  (Math.acos(Math.min(1, rotate([0, 1, 0], rotation)[1])) * 180) / Math.PI;

/** The giant clam's shape: bounds a few millimetres off-centre in z, no base of its own. */
const clam: RestShape = {
  min: [-0.273, 0, -0.182],
  max: [0.273, 0.27, 0.188],
  rule: { mode: 'tilt', sink: 0.05 },
  maxTilt: 20,
};
/** A clearly off-centre base (a rock whose pivot sits at one end). */
const lopsided: RestShape = {
  min: [0, -0.2, -0.4],
  max: [2, 1, 1.2],
  rule: { mode: 'tilt', sink: 0.1 },
  maxTilt: 25,
};

const surfaces = (
  groundAt: (x: number, z: number) => number,
  waterAt?: (x: number, z: number) => number | null,
) => new SurfaceIndex(doc(), { groundAt, itemShape: () => null, ...(waterAt ? { waterAt } : {}) });

describe('tilt rest at realistic ground heights (ITEMS-close-01)', () => {
  for (const shape of [clam, lopsided])
    it.each([0, 20, 120])(`rests an off-centre footprint level on flat ground at %d m`, (height) => {
      for (const yaw of [0, 0.7, 2.5]) {
        const result = rest(
          at(37.3, height + 5, -12.9, yaw),
          shape,
          surfaces(() => height),
        );
        expect(result.ok).toBe(true);
        expect(tiltOf(result.rotation)).toBeLessThan(0.01);
        // Lowest point exactly `sink` below the ground.
        expect(result.position[1] + shape.min[1]!).toBeCloseTo(height - shape.rule.sink!, 3);
      }
    });

  it.each([0, 20, 120])('follows a real slope at %d m with the right tilt', (height) => {
    const slope = (x: number, z: number) => height + 0.2 * x - 0.1 * z; // about 12.6 degrees
    const expected = (Math.atan(Math.hypot(0.2, 0.1)) * 180) / Math.PI;
    for (const shape of [clam, lopsided]) {
      const result = rest(at(40, height + 20, 10, 1.1), shape, surfaces(slope));
      expect(result.ok).toBe(true);
      expect(tiltOf(result.rotation)).toBeCloseTo(expected, 1);
    }
  });

  it('still reports ground too steep for the item', () => {
    const result = rest(
      at(0, 30, 0),
      clam,
      surfaces((x) => 20 + x),
    );
    expect(result.ok).toBe(false);
    expect(tiltOf(result.rotation)).toBeCloseTo(20, 1);
  });
});

describe('items that belong under water rest on the bed (ITEMS-close-01)', () => {
  const seabed = () => 18.2;
  const sea = () => 20;

  it('rests on the water surface by default', () => {
    const result = rest(at(5, 25, 5), clam, surfaces(seabed, sea));
    expect(result.position[1]).toBeCloseTo(20 - 0.05, 3);
  });

  it('rests on the seabed when it may stand in water (`bed`), level on a flat bed', () => {
    const result = rest(at(5, 25, 5), { ...clam, bed: true }, surfaces(seabed, sea));
    expect(result.ok).toBe(true);
    expect(result.position[1]).toBeCloseTo(18.2 - 0.05, 3);
    expect(tiltOf(result.rotation)).toBeLessThan(0.01);
  });

  it('finds the seabed from an item saved on the water surface', () => {
    // Saved at 19.938 (the old rest on the sea surface): the search starts above it and goes down.
    const result = rest(at(5, 19.938, 5), { ...clam, bed: true }, surfaces(seabed, sea));
    expect(result.position[1]).toBeCloseTo(18.15, 3);
  });

  it('is the ground itself on dry land', () => {
    const result = rest(
      at(5, 25, 5),
      { ...clam, bed: true },
      surfaces(() => 21, sea),
    );
    expect(result.position[1]).toBeCloseTo(21 - 0.05, 3);
  });
});
