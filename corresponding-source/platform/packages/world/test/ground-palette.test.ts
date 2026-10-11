import { WorldDocument, type CommandPayload } from '@genvr/contracts';
import { describe, expect, it } from 'vitest';
import { applyCommand, CommandError, createWorldState } from '../src/index.js';

const doc = () =>
  WorldDocument.parse({
    schemaVersion: 1,
    experienceId: 'exp-ground',
    version: 0,
    style: { base: 'realistic' },
    sizeTier: 'small',
    access: { mode: 'private' },
    environment: { sky: { preset: 'day' }, weather: { preset: 'clear' } },
    terrain: {},
    spawn: { position: [0, 1, 0] },
  });

const square = (r: number, cx = 0, cz = 0): Array<[number, number]> => [
  [cx - r, cz - r],
  [cx + r, cz - r],
  [cx + r, cz + r],
  [cx - r, cz + r],
];
type Soil = 'grass' | 'dirt' | 'sand' | 'rock' | 'snow' | 'mud';
const material = (name: string, soil: Soil = 'grass') => ({ id: `genvr.core.ground.${name}`, soil });
const paint = (name: string, soil: Soil, cx = 0): CommandPayload => ({
  type: 'paint_terrain',
  params: { area: square(3, cx), soilId: soil, material: material(name, soil) },
});

describe('ground palette (P2-37)', () => {
  it('gives a new material the first free extra slot and reuses it', () => {
    const state = createWorldState(doc());
    applyCommand(state, paint('grass-005', 'grass'));
    expect(state.doc.terrain.materials?.['6']).toEqual(material('grass-005'));
    expect(state.terrain.slotAt(0, 0)).toBe(6);
    applyCommand(state, paint('grass-005', 'grass', 20));
    applyCommand(state, paint('rock-063', 'rock', 40));
    expect(state.doc.terrain.materials?.['7']).toEqual(material('rock-063', 'rock'));
    expect(state.terrain.soilAt(40, 0)).toBe('rock');
  });

  it('frees a slot once no ground uses it (after undo)', () => {
    const state = createWorldState(doc());
    const first = applyCommand(state, paint('grass-005', 'grass'));
    applyCommand(state, first.inverse);
    applyCommand(state, paint('snow-012', 'snow', 30));
    expect(state.doc.terrain.materials?.['6']).toEqual(material('snow-012', 'snow'));
    expect(state.terrain.soilAt(30, 0)).toBe('snow');
  });

  it('refuses a seventeenth material', () => {
    const state = createWorldState(doc());
    for (let i = 0; i < 10; i += 1) applyCommand(state, paint(`ground-${100 + i}`, 'dirt', -200 + i * 20));
    expect(() => applyCommand(state, paint('ground-999', 'dirt', 100))).toThrowError(
      'This place already uses 16 ground materials.',
    );
    try {
      applyCommand(state, paint('ground-999', 'dirt', 100));
    } catch (error) {
      expect((error as CommandError).code).toBe('invalid');
    }
  });

  it('paints plain soils as before', () => {
    const state = createWorldState(doc());
    applyCommand(state, { type: 'paint_terrain', params: { area: square(3), soilId: 'sand' } });
    expect(state.terrain.slotAt(0, 0)).toBe(2);
    expect(state.terrain.soilAt(0, 0)).toBe('sand');
    expect(state.doc.terrain.materials).toBeUndefined();
  });

  it('sets what a slot shows in the whole place, with an exact inverse', () => {
    const state = createWorldState(doc());
    const result = applyCommand(state, {
      type: 'set_ground_material',
      params: { slot: 0, material: material('grass-001') },
    });
    expect(state.doc.terrain.materials?.['0']).toEqual(material('grass-001'));
    applyCommand(state, result.inverse);
    expect(state.doc.terrain.materials?.['0']).toBeUndefined();
  });

  it('reads the soil of extra slots from a loaded document', () => {
    const loaded = doc();
    loaded.terrain.materials = { '6': material('ground-054', 'sand') };
    const state = createWorldState(loaded);
    applyCommand(state, paint('ground-054', 'sand'));
    expect(state.terrain.slotAt(0, 0)).toBe(6);
    expect(state.terrain.soilAt(0, 0)).toBe('sand');
  });
});
