import { WorldDocument, type CommandPayload } from '@genvr/contracts';
import { describe, expect, it } from 'vitest';
import {
  applyCommand,
  COVERS,
  createWorldState,
  decodeChunk,
  encodeChunk,
  encodeTerrain,
  TerrainData,
} from '../src/index.js';

const HALF = 250;
const square = (r: number, cx = 0, cz = 0): Array<[number, number]> => [
  [cx - r, cz - r],
  [cx + r, cz - r],
  [cx + r, cz + r],
  [cx - r, cz + r],
];

const doc = () =>
  WorldDocument.parse({
    schemaVersion: 1,
    experienceId: 'exp-cover',
    version: 0,
    style: { base: 'realistic' },
    sizeTier: 'small',
    access: { mode: 'private' },
    environment: { sky: { preset: 'day' }, weather: { preset: 'clear' } },
    terrain: {},
    spawn: { position: [0, 1, 0] },
  });

describe('the cover layer (P2-40)', () => {
  it('starts as default everywhere, which means follow the world', () => {
    const terrain = new TerrainData(HALF);
    expect(terrain.coverAt(0, 0)).toBe('default');
    expect(COVERS[0]).toBe('default');
    // Cleared has to be its own value, not the absence of one: a rule has nothing to delete.
    expect(COVERS[1]).toBe('cleared');
  });

  it('paints, clears, and hands the ground back to the rules', () => {
    const terrain = new TerrainData(HALF);
    terrain.paintCover(square(10), 'plants');
    expect(terrain.coverAt(0, 0)).toBe('plants');
    terrain.paintCover(square(10), 'cleared');
    expect(terrain.coverAt(0, 0)).toBe('cleared');
    terrain.paintCover(square(10), 'default');
    expect(terrain.coverAt(0, 0)).toBe('default');
    // Outside the brush nothing moved.
    expect(terrain.coverAt(200, 200)).toBe('default');
  });

  it('survives being encoded and read back', () => {
    const terrain = new TerrainData(HALF);
    terrain.paintCover(square(8), 'pebbles');
    const chunk = terrain.getChunk(0, 0);
    const read = decodeChunk(encodeChunk(chunk));
    expect([...read.cover]).toEqual([...chunk.cover]);
    expect(read.cover.some((v) => v !== 0)).toBe(true);
  });

  it('costs nothing in a chunk nobody painted', () => {
    const terrain = new TerrainData(HALF);
    const plain = encodeChunk(terrain.getChunk(0, 0));
    expect(plain).not.toContain('"c"');
    terrain.paintCover(square(8), 'plants');
    expect(encodeChunk(terrain.getChunk(0, 0))).toContain('"c"');
  });

  it('reads a chunk stored before cover existed as all default', () => {
    // Exactly what is on disk for every place made until now: no `c` field at all.
    const terrain = new TerrainData(HALF);
    const old = JSON.parse(encodeChunk(terrain.getChunk(0, 0))) as Record<string, unknown>;
    delete old.c;
    const read = decodeChunk(JSON.stringify(old));
    expect(read.cover.length).toBe(read.soils.length);
    expect(read.cover.every((v) => v === 0)).toBe(true);
  });
});

describe('painting cover is one command with an exact inverse (P2-40)', () => {
  const roundTrip = (command: CommandPayload, setup: CommandPayload[] = []) => {
    const state = createWorldState(doc());
    for (const step of setup) applyCommand(state, step);
    const snapshot = () => JSON.parse(JSON.stringify({ doc: state.doc, terrain: encodeTerrain(state) }));
    const before = snapshot();
    const { inverse } = applyCommand(state, command);
    expect(snapshot()).not.toEqual(before);
    applyCommand(state, inverse);
    expect(snapshot()).toEqual(before);
  };

  it('undoes painting, clearing and handing back', () => {
    const plants: CommandPayload = { type: 'paint_cover', params: { area: square(12), cover: 'plants' } };
    roundTrip(plants);
    roundTrip({ type: 'paint_cover', params: { area: square(12), cover: 'cleared' } });
    roundTrip({ type: 'paint_cover', params: { area: square(12), cover: 'default' } }, [plants]);
    roundTrip({ type: 'paint_cover', params: { area: square(6), cover: 'pebbles' } }, [plants]);
  });

  it('is refused outside the place', () => {
    const state = createWorldState(doc());
    expect(() =>
      applyCommand(state, { type: 'paint_cover', params: { area: square(20, 9000, 9000), cover: 'plants' } }),
    ).toThrow();
  });
});
