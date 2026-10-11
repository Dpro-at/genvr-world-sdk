import { WorldDocument } from '@genvr/contracts';
import { describe, expect, it } from 'vitest';
import { applyCommand, circleArea, CommandError, createWorldState } from '../src/index.js';

// A whole town needs a large place (R3): a place grows to a bigger size tier and keeps everything where it is.

const doc = (terrain: Record<string, unknown> = {}) =>
  WorldDocument.parse({
    schemaVersion: 1,
    experienceId: 'exp-size',
    version: 0,
    style: { base: 'realistic' },
    sizeTier: 'small',
    access: { mode: 'private' },
    environment: { sky: { preset: 'day' }, weather: { preset: 'clear' } },
    terrain,
    spawn: { position: [0, 1, 0] },
  });

describe('set_size_tier (R3)', () => {
  it('grows the place: building is allowed out to the new border, and undo shrinks it back', () => {
    const state = createWorldState(doc());
    expect(() =>
      applyCommand(state, { type: 'draw_road', params: { roadId: 'r0', points: [[300, 0], [400, 0]], grade: false } }),
    ).toThrow(CommandError);
    const { inverse } = applyCommand(state, { type: 'set_size_tier', params: { sizeTier: 'huge' } });
    expect(state.doc.sizeTier).toBe('huge');
    expect(state.terrain.half).toBe(2000);
    applyCommand(state, { type: 'draw_road', params: { roadId: 'r1', points: [[1500, 0], [1600, 0]], grade: false } });
    // With a road out there it cannot shrink; without it, it can (that is the undo).
    expect(() => applyCommand(state, inverse)).toThrow(/only grow/);
    applyCommand(state, { type: 'remove_road', params: { roadId: 'r1' } });
    applyCommand(state, inverse);
    expect(state.doc.sizeTier).toBe('small');
    expect(state.terrain.half).toBe(250);
  });

  it('keeps edited ground outside a smaller size from being cut off', () => {
    const state = createWorldState(doc());
    applyCommand(state, { type: 'set_size_tier', params: { sizeTier: 'medium' } });
    applyCommand(state, {
      type: 'sculpt_terrain',
      params: { area: circleArea(400, 400, 20), operation: 'raise', strength: 1, soft: true },
    });
    expect(() => applyCommand(state, { type: 'set_size_tier', params: { sizeTier: 'small' } })).toThrow(/only grow/);
  });

  it('leaves ground made for its size alone (starter worlds)', () => {
    const state = createWorldState(doc({ world: { seed: 7, kind: 'valley', generator: 2 } }));
    expect(() => applyCommand(state, { type: 'set_size_tier', params: { sizeTier: 'large' } })).toThrow(/made for its size/);
  });
});
