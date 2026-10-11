import { describe, expect, it } from 'vitest';
import type { ItemInstance } from '@genvr/contracts';
import type { RestShape } from '@genvr/validator';
import { drawOffset, plinthMatrix } from '../src/items.js';

const terrain = { drawnHeightAt: (_x: number, _z: number, step: number) => (step === 1 ? 5 : 4.6) };

describe('far things sit on the ground as drawn (P2-43)', () => {
  it('shifts nothing at full detail', () => {
    expect(drawOffset(0, 0, 5, 1, terrain as never)).toBe(0);
  });
  it('lowers a thing onto coarse ground by the difference', () => {
    expect(drawOffset(0, 0, 5, 4, terrain as never)).toBeCloseTo(-0.4, 6);
  });
});

describe('a foundation item’s plinth moves with its coarse-ground offset (P2-43 task 11 review round 1)', () => {
  const instance = {
    instanceId: 'i1',
    itemId: 'house',
    transform: { position: [0, 2, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
    params: {},
  } as unknown as ItemInstance;
  const shape = { min: [-1, 0, -1], max: [1, 1, 1], rule: { mode: 'foundation' } } as RestShape;

  it('is unmoved with no offset', () => {
    const matrix = plinthMatrix(instance, shape, 0.4);
    // bottom = position.y (2) + min.y (0) = 2; center = bottom - plinth / 2 = 1.8.
    expect(matrix.elements[13]).toBeCloseTo(1.8, 6);
  });

  it('shifts by exactly the same offset drawOffset would apply to the item', () => {
    const offsetY = drawOffset(0, 0, 5, 4, terrain as never); // -0.4
    const base = plinthMatrix(instance, shape, 0.4);
    const shifted = plinthMatrix(instance, shape, 0.4, offsetY);
    expect(shifted.elements[13]).toBeCloseTo(base.elements[13] + offsetY, 6);
  });
});
