import { WorldDocument } from '@genvr/contracts';
import { describe, expect, it } from 'vitest';
import { applyCommand, CommandError, createWorldState } from '../src/index.js';

const state = () =>
  createWorldState(
    WorldDocument.parse({
      schemaVersion: 1,
      experienceId: 'exp-paving',
      version: 0,
      style: { base: 'realistic' },
      sizeTier: 'small',
      access: { mode: 'private' },
      environment: { sky: { preset: 'day' }, weather: { preset: 'clear' } },
      terrain: {},
      spawn: { position: [0, 1, 0] },
    }),
  );

describe('pavings (R2l)', () => {
  it('lays a paved area and takes it back', () => {
    const s = state();
    const square: Array<[number, number]> = [[-10, -10], [10, -10], [10, 10], [-10, 10]];
    const { inverse } = applyCommand(s, {
      type: 'add_paving',
      params: { pavingId: 'p1', area: square, materialId: 'genvr.core.ground.large-grey-tiles', name: 'Marktplatz' },
    });
    expect(s.doc.pavings).toEqual([{ id: 'p1', area: square, materialId: 'genvr.core.ground.large-grey-tiles', name: 'Marktplatz' }]);
    const back = applyCommand(s, inverse);
    expect(s.doc.pavings).toEqual([]);
    applyCommand(s, back.inverse);
    expect(s.doc.pavings).toHaveLength(1);
  });

  it('refuses one outside the place, a sliver, or a second with the same id', () => {
    const s = state();
    const add = (area: Array<[number, number]>, id = 'p') =>
      applyCommand(s, { type: 'add_paving', params: { pavingId: id, area, materialId: 'genvr.core.ground.asphalt-02' } });
    expect(() => add([[200, 200], [300, 200], [300, 300]])).toThrow(CommandError);
    expect(() => add([[0, 0], [5, 0], [10, 0.01]])).toThrow(/square metre/);
    add([[0, 0], [5, 0], [5, 5]]);
    expect(() => add([[0, 0], [5, 0], [5, 5]])).toThrow(/exists/);
  });
});
