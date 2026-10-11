import { describe, expect, it } from 'vitest';
import { MUSCLE_PAINT_FORMAT, paintedPart, rasterizePaint, type MusclePaint } from '../../../src/character/human/paint.js';

// A row of vertices along x (cm), all facing +z.
const xs = [-10, -5, 0, 5, 10, 20];
const at = (v: number) => [xs[v]!, 0, 0] as const;
const up = () => [0, 0, 1] as const;

describe('muscle paint strokes', () => {
  it('paints a soft round brush on skin facing the stroke, and mirrors it', () => {
    const paint: MusclePaint = {
      format: MUSCLE_PAINT_FORMAT,
      strokes: [{ part: 'biceps', radius: 6, strength: 1, mirror: true, points: [[5, 0, 0, 0, 0, 1]] }],
    };
    const painted = rasterizePaint(paint, xs.length, at, up);
    expect(paintedPart(painted.get(3))).toEqual({ part: 'biceps', weight: 1 }); // x 5: the centre
    expect(paintedPart(painted.get(1))?.part).toBe('biceps'); // x -5: the mirror
    expect(painted.has(5)).toBe(false); // x 20: outside the brush
    // Skin facing away (the other side of a limb) is never painted.
    expect(rasterizePaint(paint, xs.length, at, () => [0, 0, -1]).size).toBe(0);
  });

  it('paints over another part and erases', () => {
    const paint: MusclePaint = {
      format: MUSCLE_PAINT_FORMAT,
      strokes: [
        { part: 'biceps', radius: 6, strength: 1, points: [[0, 0, 0, 0, 0, 1]] },
        { part: 'triceps', radius: 6, strength: 1, points: [[0, 0, 0, 0, 0, 1]] },
        { part: null, radius: 3, strength: 1, points: [[10, 0, 0, 0, 0, 1]] },
      ],
    };
    const painted = rasterizePaint(paint, xs.length, at, up);
    expect(paintedPart(painted.get(2))?.part).toBe('triceps');
    expect(paintedPart(painted.get(4))?.part).toBeNull();
  });
});
