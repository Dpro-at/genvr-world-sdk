import { WorldDocument, type CommandPayload, type Game, type PlaceScript } from '@genvr/contracts';
import { describe, expect, it } from 'vitest';
import { applyCommand, CommandError, createWorldState } from '../src/index.js';

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

const body = (name: string, source = `genvr.log('${name}');`): Omit<PlaceScript, 'id'> => ({
  name,
  api: 1,
  enabled: true,
  source,
});

const set = (scriptId: string, script: Omit<PlaceScript, 'id'> | null, index?: number): CommandPayload => ({
  type: 'set_script',
  params: { scriptId, script, ...(index === undefined ? {} : { index }) },
});

const game: Game = {
  match: { minPlayers: 2, durationSec: 300, countdownSec: 5, resultsSec: 10 },
  win: { by: 'highest_score' },
};

/** Applies a command then its inverse and checks the document returns to the same JSON. */
function roundTrip(command: CommandPayload, setup: CommandPayload[] = []) {
  const state = createWorldState(emptyDoc());
  for (const step of setup) applyCommand(state, step);
  const before = JSON.stringify(state.doc);
  const { inverse } = applyCommand(state, command);
  expect(JSON.stringify(state.doc)).not.toBe(before);
  applyCommand(state, inverse);
  expect(JSON.stringify(state.doc)).toBe(before);
  return inverse;
}

describe('set_script', () => {
  it('adds a script with an exact inverse', () => {
    const inverse = roundTrip(set('scr-00000001', body('A')));
    expect(inverse).toEqual(set('scr-00000001', null));
  });

  it('replaces a script in place with an exact inverse', () => {
    const setup = [
      set('scr-00000001', body('A')),
      set('scr-00000002', body('B')),
      set('scr-00000003', body('C')),
    ];
    roundTrip(set('scr-00000002', { ...body('B2'), enabled: false }), setup);
    const state = createWorldState(emptyDoc());
    for (const step of setup) applyCommand(state, step);
    applyCommand(state, set('scr-00000002', body('B2')));
    expect(state.doc.scripts?.map((s) => s.name)).toEqual(['A', 'B2', 'C']);
  });

  it('removes a script from the middle and undo puts it back at the same place', () => {
    const setup = [
      set('scr-00000001', body('A')),
      set('scr-00000002', body('B')),
      set('scr-00000003', body('C')),
    ];
    const inverse = roundTrip(set('scr-00000002', null), setup);
    expect(inverse).toEqual(set('scr-00000002', body('B'), 1));
  });

  it('removing the last script leaves no scripts field, as in an old document', () => {
    const state = createWorldState(emptyDoc());
    const { inverse } = applyCommand(state, set('scr-00000001', body('A')));
    applyCommand(state, inverse);
    expect('scripts' in state.doc).toBe(false);
  });

  it('keeps where a copied script came from through undo', () => {
    const from = { itemId: 'example.counter', version: '1.0.0', sha256: 'b'.repeat(64) };
    roundTrip(set('scr-00000001', null), [set('scr-00000001', { ...body('A'), from })]);
    roundTrip(set('scr-00000001', body('A')), [set('scr-00000001', { ...body('A'), from })]);
  });

  it('refuses removing a script that is not there', () => {
    const state = createWorldState(emptyDoc());
    expect(() => applyCommand(state, set('scr-00000009', null))).toThrow(CommandError);
  });

  it('refuses a 9th script and more than 65 536 characters in total', () => {
    const state = createWorldState(emptyDoc());
    for (let i = 0; i < 8; i++) applyCommand(state, set(`scr-0000000${i}`, body(`S${i}`)));
    expect(() => applyCommand(state, set('scr-000000ff', body('Ninth')))).toThrow(CommandError);
    const big = createWorldState(emptyDoc());
    for (let i = 0; i < 4; i++) applyCommand(big, set(`scr-0000000${i}`, body(`S${i}`, 'x'.repeat(16_384))));
    expect(() => applyCommand(big, set('scr-000000ff', body('More', 'x')))).toThrow(CommandError);
    // Replacing one with a shorter source is fine.
    applyCommand(big, set('scr-00000001', body('S1', 'x')));
  });

  it('set_script leaves game alone, and set_game leaves scripts alone', () => {
    const state = createWorldState(emptyDoc());
    applyCommand(state, { type: 'set_game', params: { game } });
    applyCommand(state, set('scr-00000001', body('A')));
    expect(state.doc.game).toBeDefined();
    applyCommand(state, { type: 'set_game', params: { game: null } });
    expect(state.doc.scripts).toHaveLength(1);
    applyCommand(state, { type: 'set_game', params: { game } });
    applyCommand(state, set('scr-00000001', null));
    expect(state.doc.game).toBeDefined();
  });

  it('the saved document parses again', () => {
    const state = createWorldState(emptyDoc());
    applyCommand(state, set('scr-00000001', body('A')));
    expect(WorldDocument.parse(JSON.parse(JSON.stringify(state.doc))).scripts).toHaveLength(1);
  });
});
