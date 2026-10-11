import { describe, expect, it } from 'vitest';
import { CommandPayload, PlacementRules, RestRule } from '../src/index.js';

describe('rest rule (P2-43)', () => {
  it('accepts the five modes with an optional sink and base', () => {
    expect(
      RestRule.parse({ mode: 'upright', sink: 0.3, base: { min: [-0.2, -0.2], max: [0.2, 0.2] } }).mode,
    ).toBe('upright');
    for (const mode of ['tilt', 'grade', 'foundation', 'float'] as const)
      expect(RestRule.parse({ mode }).mode).toBe(mode);
    expect(() => RestRule.parse({ mode: 'fly' })).toThrow();
    expect(() => RestRule.parse({ mode: 'upright', sink: -1 })).toThrow();
  });

  it('is part of an item placement rules', () => {
    expect(PlacementRules.parse({ rest: { mode: 'grade' } }).rest?.mode).toBe('grade');
  });

  it('lets place and move commands ask the host to rest the item', () => {
    const place = CommandPayload.parse({
      type: 'place_item',
      params: { instanceId: 'a', itemId: 'b', position: [1, 2, 3], rest: true },
    });
    expect(place.type === 'place_item' && place.params.rest).toBe(true);
    const move = CommandPayload.parse({ type: 'transform_item', params: { instanceId: 'a', rest: true } });
    expect(move.type === 'transform_item' && move.params.rest).toBe(true);
  });
});
