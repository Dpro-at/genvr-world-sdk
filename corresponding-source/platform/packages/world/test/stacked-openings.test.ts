import type { Wall } from '@genvr/contracts';
import { describe, expect, it } from 'vitest';
import { openingError, wallBoxes } from '../src/index.js';

const wall = (openings: Wall['openings']): Wall => ({
  id: 'w',
  points: [
    [0, 0],
    [10, 0],
  ],
  height: 9,
  closed: false,
  openings,
});
const window = (id: string, offset: number, bottom: number, width = 1.2) => ({
  id,
  kind: 'window' as const,
  segment: 0,
  offset,
  width,
  height: 1.3,
  bottom,
});

describe('stacked openings (a window on every storey, Real place R4a)', () => {
  it('allows windows above each other in one span, never side by side or touching', () => {
    const below = wall([window('a', 5, 0.9)]);
    expect(openingError(below, window('b', 5, 3.9))).toBeNull();
    expect(openingError(below, window('c', 5, 2.1))).toBe('It overlaps another door or window.');
    expect(openingError(below, window('d', 5.5, 3.9))).toBe('It overlaps another door or window.');
    expect(openingError(below, window('e', 5, 3.9, 1.6))).toBe('It overlaps another door or window.');
  });

  it('builds solid wall between, below and above stacked windows, and leaves the holes open', () => {
    const boxes = wallBoxes(wall([window('a', 5, 0.9), window('b', 5, 3.9), window('c', 5, 6.9)]), () => 0);
    // Left of the column, right of it, and four pieces in it: below a, a-b, b-c, above c.
    expect(boxes).toHaveLength(6);
    const column = boxes.filter((b) => Math.abs(b.center[0] - 5) < 1e-6);
    const spans = column.map((b) => [b.center[1] - b.half[1], b.center[1] + b.half[1]]).sort((p, q) => p[0]! - q[0]!);
    expect(spans.map(([lo, hi]) => [Math.round(lo! * 10) / 10, Math.round(hi! * 10) / 10])).toEqual([
      [-0.5, 0.9],
      [2.2, 3.9],
      [5.2, 6.9],
      [8.2, 9],
    ]);
  });

  it('keeps one opening per span exactly as before', () => {
    expect(wallBoxes(wall([window('a', 5, 0.9)]), () => 0)).toHaveLength(4);
  });
});
