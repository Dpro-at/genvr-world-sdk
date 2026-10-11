import { describe, expect, it } from 'vitest';
import {
  defaultRoofHeight,
  roofBends,
  roofFacet,
  roofFrame,
  roofHeightAt,
  roofPlanes,
} from '../src/index.js';

// A 10 m x 6 m house, long side along x.
const house: Array<[number, number]> = [
  [0, 0],
  [10, 0],
  [10, 6],
  [0, 6],
];
const area = (polygon: Array<[number, number]>) =>
  Math.abs(
    polygon.reduce((sum, [ax, az], i) => {
      const [bx, bz] = polygon[(i + 1) % polygon.length]!;
      return sum + ax * bz - bx * az;
    }, 0),
  ) / 2;

describe('roofs of real buildings (R4b)', () => {
  it('builds over the smallest box, the ridge along the long side', () => {
    const f = roofFrame(house);
    expect(f.cx).toBeCloseTo(5);
    expect(f.cz).toBeCloseTo(3);
    expect(Math.abs(f.ux)).toBeCloseTo(1);
    expect(f.halfLength).toBeCloseTo(5);
    expect(f.halfWidth).toBeCloseTo(3);
  });

  it('gabled: ridge in the middle at full height, eaves on the long sides', () => {
    const planes = roofPlanes(house, 'gabled', 3);
    expect(roofHeightAt(planes, 5, 3)).toBeCloseTo(3);
    expect(roofHeightAt(planes, 0, 3)).toBeCloseTo(3);
    expect(roofHeightAt(planes, 5, 0)).toBeCloseTo(0);
    expect(roofHeightAt(planes, 5, 6)).toBeCloseTo(0);
    // Two faces, each half the house.
    expect(area(roofFacet(house, planes, 0))).toBeCloseTo(30);
    expect(area(roofFacet(house, planes, 1))).toBeCloseTo(30);
    // A gable end bends once, in its middle.
    expect(roofBends([0, 0], [0, 6], planes)).toEqual([0.5]);
    expect(roofBends([0, 0], [10, 0], planes)).toEqual([]);
  });

  it('hipped: ends slope as steep as the sides, the ridge shorter by the width', () => {
    const planes = roofPlanes(house, 'hipped', 3);
    expect(roofHeightAt(planes, 0, 3)).toBeCloseTo(0);
    expect(roofHeightAt(planes, 3, 3)).toBeCloseTo(3);
    expect(roofHeightAt(planes, 7, 3)).toBeCloseTo(3);
    expect(roofHeightAt(planes, 1.5, 3)).toBeCloseTo(1.5);
    const total = [0, 1, 2, 3].reduce((sum, i) => sum + area(roofFacet(house, planes, i)), 0);
    expect(total).toBeCloseTo(60);
  });

  it('pyramidal: one top in the middle; skillion: one slope; flat: no faces', () => {
    const pyramid = roofPlanes(house, 'pyramidal', 4);
    expect(roofHeightAt(pyramid, 5, 3)).toBeCloseTo(4);
    expect(roofHeightAt(pyramid, 0, 3)).toBeCloseTo(0);
    const lean = roofPlanes(house, 'skillion', 2);
    const low = roofHeightAt(lean, 5, 0);
    const high = roofHeightAt(lean, 5, 6);
    expect(Math.min(low, high)).toBeCloseTo(0);
    expect(Math.max(low, high)).toBeCloseTo(2);
    expect(roofPlanes(house, 'flat', 3)).toEqual([]);
  });

  it('keeps an L-shaped house under its roof and picks a usual pitch', () => {
    const l: Array<[number, number]> = [
      [0, 0],
      [12, 0],
      [12, 4],
      [4, 4],
      [4, 10],
      [0, 10],
    ];
    const planes = roofPlanes(l, 'gabled', 3);
    const total = planes.reduce((sum, _, i) => sum + area(roofFacet(l, planes, i)), 0);
    expect(total).toBeCloseTo(12 * 4 + 4 * 6);
    expect(defaultRoofHeight(house, 'gabled')).toBeCloseTo(2.1);
    expect(defaultRoofHeight(house, 'flat')).toBe(0);
  });
});
