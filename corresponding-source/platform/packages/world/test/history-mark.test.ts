import { WorldDocument, type CommandPayload } from '@genvr/contracts';
import { describe, expect, it } from 'vitest';
import { CommandHistory, createWorldState } from '../src/index.js';

const emptyDoc = () =>
  WorldDocument.parse({
    schemaVersion: 1,
    experienceId: 'exp-test',
    version: 0,
    style: { base: 'blocky' },
    sizeTier: 'small',
    access: { mode: 'private' },
    environment: { sky: { preset: 'day' }, weather: { preset: 'clear' } },
    terrain: {},
    spawn: { position: [0, 1, 0] },
  });

const sky = (preset: 'day' | 'night'): CommandPayload => ({ type: 'set_sky', params: { preset } });

describe('CommandHistory marks (REAL-06)', () => {
  it('a step on a full history still moves the mark, and merging since it joins the pieces', () => {
    const state = createWorldState(emptyDoc());
    const history = new CommandHistory(state);
    // Fill the 200-step history with earlier edits.
    for (let i = 0; i < 200; i += 1) history.execute(sky(i % 2 ? 'day' : 'night'));
    const start = history.size;
    // A map build applied in three pieces, each joined to the one before.
    let mark = -1;
    for (const preset of ['night', 'day', 'night'] as const) {
      const before = history.size;
      history.execute(sky(preset));
      expect(history.size).toBe(before + 1);
      if (mark >= 0) expect(history.mergeSince(mark - 1)).toBe(true);
      mark = history.size;
    }
    expect(mark).toBe(start + 1);
    expect(state.doc.environment.sky.preset).toBe('night');
    // One undo takes the whole build back, down to the last earlier edit (i = 199: 'day').
    history.undo();
    expect(history.size).toBe(start);
    expect(state.doc.environment.sky.preset).toBe('day');
  });

  it('merging since a mark whose steps were dropped joins what is left', () => {
    const state = createWorldState(emptyDoc());
    const history = new CommandHistory(state, 3);
    const mark = history.size;
    for (let i = 0; i < 5; i += 1) history.execute(sky(i % 2 ? 'day' : 'night'));
    expect(history.size).toBe(mark + 5);
    expect(history.mergeSince(mark)).toBe(true);
    expect(history.size).toBe(3);
    history.undo();
    expect(history.canUndo).toBe(false);
  });
});
