import { describe, expect, it } from 'vitest';
import { BRIDGE, bridgeDecks } from '../src/index.js';

const flat = { heightAt: () => 0 };
const pond = [
  {
    id: 'w',
    kind: 'lake' as const,
    area: [
      [-5, -20],
      [5, -20],
      [5, 20],
      [-5, 20],
    ] as Array<[number, number]>,
    level: 1,
  },
];
const road = {
  id: 'r',
  points: [
    [-30, 0],
    [30, 0],
  ] as Array<[number, number]>,
  width: 6,
};

describe('bridge decks (P2-43)', () => {
  it('gives a surface over the water at the deck height', () => {
    const decks = bridgeDecks([road], flat, pond as never);
    expect(decks.length).toBeGreaterThan(0);
    const over = decks.filter((d) => d.points.some(([x]) => Math.abs(x) < 1));
    expect(over.length).toBeGreaterThan(0);
    for (const deck of over) expect(deck.level).toBeCloseTo(1 + BRIDGE.clearance, 5);
  });

  it('gives nothing for a road without water', () => {
    expect(bridgeDecks([road], flat, [])).toEqual([]);
  });
});
