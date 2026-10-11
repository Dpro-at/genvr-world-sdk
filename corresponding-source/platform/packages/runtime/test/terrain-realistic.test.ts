import { describe, expect, it } from 'vitest';
import { groundLayers, rockShare, snowShare, triangleCorners } from '../src/terrain-realistic.js';

describe('realistic ground rules (P2-37)', () => {
  it('turns steep slopes to rock between 35 and 45 degrees', () => {
    expect(rockShare(30)).toBe(0);
    expect(rockShare(40)).toBeGreaterThan(0.2);
    expect(rockShare(40)).toBeLessThan(0.8);
    expect(rockShare(50)).toBe(1);
  });

  it('covers ground above the snow line, less on slopes, never with the line off', () => {
    expect(snowShare(50, 60, 0)).toBe(0);
    expect(snowShare(70, 60, 0)).toBe(1);
    expect(snowShare(70, 60, 50)).toBeLessThan(snowShare(70, 60, 10));
    expect(snowShare(500, null, 0)).toBe(0);
  });

  it('gives each triangle its three corner layers and weights', () => {
    // Two triangles over four points; the corner layers come from each point's slot.
    const slots = [0, 6, 2, 3];
    const indices = [0, 2, 1, 1, 2, 3];
    const layerOf = (slot: number) => slot * 10;
    const { layers, bary, order } = triangleCorners(slots, indices, layerOf);
    expect(Array.from(order)).toEqual([0, 2, 1, 1, 2, 3]);
    expect(Array.from(layers.slice(0, 9))).toEqual([0, 20, 60, 0, 20, 60, 0, 20, 60]);
    expect(Array.from(bary.slice(0, 9))).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    expect(Array.from(layers.slice(9, 12))).toEqual([60, 20, 30]);
  });

  it('loads each material once, in slot order, with rock and snow for the slope and height rules', () => {
    const palette = [
      'grass-004',
      'ground-103',
      'ground-080',
      'rock-051',
      'snow-006',
      'ground-106',
      'grass-005',
    ];
    const { names, layerOfSlot } = groundLayers(palette, { rock: 'rock-051', snow: 'snow-012' });
    expect(names).toEqual([
      'grass-004',
      'ground-103',
      'ground-080',
      'rock-051',
      'snow-006',
      'ground-106',
      'grass-005',
      'snow-012',
    ]);
    expect(layerOfSlot(6)).toBe(6);
    expect(layerOfSlot(3)).toBe(3);
    expect(layerOfSlot(12)).toBe(0); // an empty slot falls back to grass
  });
});
