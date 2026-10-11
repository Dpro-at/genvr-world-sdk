import { WorldDocument, type CommandPayload } from '@genvr/contracts';
import { describe, expect, it } from 'vitest';
import {
  applyCommand,
  chunkKey,
  CommandError,
  createWorldState,
  decodeHeightTile,
  encodeHeightTile,
  MAX_HEIGHT,
  MIN_HEIGHT,
  type WorldState,
} from '../src/index.js';

const doc = (sea: number | null = null) =>
  WorldDocument.parse({
    schemaVersion: 1,
    experienceId: 'exp-test',
    version: 0,
    style: { base: 'realistic' },
    sizeTier: 'small',
    access: { mode: 'private' },
    environment: {
      sky: { preset: 'day' },
      weather: { preset: 'clear' },
      ...(sea === null ? {} : { sea: { level: sea } }),
    },
    terrain: {},
    spawn: { position: [0, 1, 0] },
  });

/** A tile of heights in metres from a function of the grid position. */
function tile(cols: number, rows: number, at: (i: number, j: number) => number): number[] {
  const out: number[] = [];
  for (let j = 0; j < rows; j += 1) for (let i = 0; i < cols; i += 1) out.push(at(i, j));
  return out;
}

function setHeights(
  state: WorldState,
  x0: number,
  z0: number,
  cols: number,
  rows: number,
  metres: number[],
  base = 0,
) {
  return applyCommand(state, {
    type: 'set_heights',
    params: { x0, z0, cols, rows, step: 2, base, heights: encodeHeightTile(metres, base) },
  });
}

describe('height range (Tidewater world, task 2)', () => {
  it('reaches from -150 m to 450 m', () => {
    expect(MIN_HEIGHT).toBe(-150);
    expect(MAX_HEIGHT).toBe(450);
  });

  it('clamps written heights to the range', () => {
    const state = createWorldState(doc());
    setHeights(state, 0, 0, 2, 1, [470, -160], 150);
    expect(state.terrain.vertexHeight(0, 0)).toBe(450);
    expect(state.terrain.vertexHeight(2, 0)).toBe(-150);
  });
});

describe('height tiles: set_heights', () => {
  it('encodes heights as int16 centimetres from a base, and decodes them back to 1 cm', () => {
    const metres = [0, 1.234, -5.5, 280.01, -90];
    const back = decodeHeightTile(encodeHeightTile(metres, 100), metres.length, 100);
    back.forEach((h, i) => expect(Math.abs(h - metres[i]!)).toBeLessThanOrEqual(0.005));
    expect(() => encodeHeightTile([400], 0)).toThrow(/327/);
  });

  it('writes a 129 x 129 tile exactly where it says, to 1 cm', () => {
    const state = createWorldState(doc());
    const metres = tile(129, 129, (i, j) => Math.round((Math.sin(i * 0.1) * 20 + j * 0.37 - 30) * 100) / 100);
    setHeights(state, -128, -128, 129, 129, metres);
    for (const [i, j] of [
      [0, 0],
      [128, 128],
      [64, 7],
      [3, 100],
      [127, 1],
    ] as const) {
      const h = state.terrain.vertexHeight(-128 + i * 2, -128 + j * 2);
      expect(Math.abs(h - metres[j * 129 + i]!)).toBeLessThanOrEqual(0.01);
    }
  });

  it('a tile across 4 chunks updates all 4, and their shared border vertices match', () => {
    const state = createWorldState(doc());
    // Chunks are 64 m: a 41 x 41 tile at 2 m from (-40, -40) covers (-40..40) and so 4 chunks.
    const metres = tile(41, 41, (i, j) => i * 0.5 - j * 0.25 + 3);
    const { changedChunks } = setHeights(state, -40, -40, 41, 41, metres);
    for (const key of [chunkKey(-1, -1), chunkKey(0, -1), chunkKey(-1, 0), chunkKey(0, 0)])
      expect(changedChunks.has(key)).toBe(true);
    const t = state.terrain;
    // The vertex at x = 0 is stored in chunk -1 (last column) and chunk 0 (first column).
    for (let z = -40; z <= 40; z += 2) {
      const left = t.chunks.get(chunkKey(-1, z < 0 ? -1 : 0))!;
      const right = t.chunks.get(chunkKey(0, z < 0 ? -1 : 0))!;
      const iz = Math.round((z - (z < 0 ? -64 : 0)) / 2);
      expect(left.heights[iz * t.edge + 32]).toBe(right.heights[iz * t.edge + 0]);
    }
    // Soils stay as they were.
    expect([...t.chunks.get(chunkKey(0, 0))!.soils].every((s) => s === 0)).toBe(true);
  });

  it('snaps a corner off the grid onto it', () => {
    const state = createWorldState(doc());
    setHeights(state, 10.6, -3.1, 2, 2, [5, 6, 7, 8]);
    // 10.6 -> 10, -3.1 -> -4 (nearest 2 m grid points)
    expect(state.terrain.vertexHeight(10, -4)).toBe(5);
    expect(state.terrain.vertexHeight(12, -2)).toBe(8);
  });

  it('undo restores the whole tile', () => {
    const state = createWorldState(doc());
    setHeights(
      state,
      -20,
      -20,
      21,
      21,
      tile(21, 21, () => 1),
    );
    const before = tile(41, 41, (i, j) => state.terrain.vertexHeight(-40 + i * 2, -40 + j * 2));
    const { inverse } = setHeights(
      state,
      -40,
      -40,
      41,
      41,
      tile(41, 41, (i, j) => i - j),
    );
    applyCommand(state, inverse);
    const after = tile(41, 41, (i, j) => state.terrain.vertexHeight(-40 + i * 2, -40 + j * 2));
    expect(after).toEqual(before);
  });

  it('refuses a step that is not the ground spacing, a wrong length and a tile outside the place', () => {
    const state = createWorldState(doc());
    const bad = (params: Partial<Extract<CommandPayload, { type: 'set_heights' }>['params']>) => () =>
      applyCommand(state, {
        type: 'set_heights',
        params: {
          x0: 0,
          z0: 0,
          cols: 2,
          rows: 2,
          step: 2,
          base: 0,
          heights: encodeHeightTile([1, 2, 3, 4], 0),
          ...params,
        },
      });
    expect(bad({ step: 1 })).toThrow(/spacing/);
    expect(bad({ cols: 3 })).toThrow(/heights/);
    expect(bad({ x0: 1000, z0: 1000 })).toThrow(CommandError);
  });
});

describe('painting by rule: paint_rule', () => {
  /** A ramp along x: height 0 at x = -40 rising 1 m per 2 m (about 27 degrees) to x = 0, flat at 20 m after. */
  function ramp(): WorldState {
    const state = createWorldState(doc(5));
    setHeights(
      state,
      -60,
      -20,
      61,
      21,
      tile(61, 21, (i) => Math.min(20, Math.max(0, (i * 2 - 20) / 2))),
    );
    return state;
  }

  it('paints only vertices inside the height range', () => {
    const state = ramp();
    applyCommand(state, {
      type: 'paint_rule',
      params: { box: [-60, -20, 60, 20], soilId: 'sand', height: [2, 6] },
    });
    for (let x = -60; x <= 60; x += 2) {
      const h = state.terrain.vertexHeight(x, 0);
      expect(state.terrain.soilAt(x, 0)).toBe(h >= 2 && h <= 6 ? 'sand' : 'grass');
    }
  });

  it('paints only vertices inside the slope range', () => {
    const state = ramp();
    applyCommand(state, {
      type: 'paint_rule',
      params: { box: [-60, -20, 60, 20], soilId: 'rock', slope: [20, 90] },
    });
    // The middle of the ramp is steep, the flat top is not.
    expect(state.terrain.soilAt(-20, 0)).toBe('rock');
    expect(state.terrain.soilAt(40, 0)).toBe('grass');
    expect(state.terrain.soilAt(-56, 0)).toBe('grass');
  });

  it('paints by depth below the sea, and leaves everything outside the box alone', () => {
    const state = ramp();
    applyCommand(state, {
      type: 'paint_rule',
      params: { box: [-60, -10, 0, 10], soilId: 'mud', depth: [1, 10] },
    });
    // sea at 5 m: depth 1..10 m is height -5..4 m
    expect(state.terrain.soilAt(-50, 0)).toBe('mud');
    expect(state.terrain.soilAt(-50, 18)).toBe('grass');
    expect(state.terrain.soilAt(30, 0)).toBe('grass');
  });

  it('paints cover by rule, and undo takes it back', () => {
    const state = ramp();
    const { inverse } = applyCommand(state, {
      type: 'paint_rule',
      params: { box: [-60, -20, 60, 20], cover: 'cleared', height: [10, 30] },
    });
    expect(state.terrain.coverAt(40, 0)).toBe('cleared');
    expect(state.terrain.coverAt(-50, 0)).toBe('default');
    applyCommand(state, inverse);
    expect(state.terrain.coverAt(40, 0)).toBe('default');
  });

  it('refuses a box over 512 m, a depth rule without a sea, and a rule that paints nothing at all', () => {
    const state = ramp();
    expect(() =>
      applyCommand(state, { type: 'paint_rule', params: { box: [-250, -250, 300, 0], soilId: 'sand' } }),
    ).toThrow(/512/);
    const dry = createWorldState(doc());
    expect(() =>
      applyCommand(dry, {
        type: 'paint_rule',
        params: { box: [0, 0, 10, 10], soilId: 'sand', depth: [0, 5] },
      }),
    ).toThrow(/sea/);
    expect(() =>
      applyCommand(state, { type: 'paint_rule', params: { box: [0, 0, 10, 10] } as never }),
    ).toThrow(CommandError);
  });
});
