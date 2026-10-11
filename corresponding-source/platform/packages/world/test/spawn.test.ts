import { CommandPayload, WorldDocument } from '@genvr/contracts';
import { describe, expect, it } from 'vitest';
import {
  applyCommand,
  createWorldState,
  encodeTerrain,
  encodeTerrainFieldTile,
  terrainFieldFloat32Bytes,
} from '../src/index.js';

function setup() {
  return createWorldState(
    WorldDocument.parse({
      schemaVersion: 1,
      experienceId: 'exp-spawn',
      version: 0,
      style: { base: 'realistic' },
      sizeTier: 'small',
      access: { mode: 'private' },
      environment: { sky: { preset: 'day' }, weather: { preset: 'clear' }, sea: { level: 20 } },
      terrain: {},
      spawn: { position: [1, 2, 3], rotation: [0, 1, 0, 0], scale: [2, 2, 2] },
    }),
  );
}
describe('standalone world arrival transform', () => {
  it('changes only spawn and restores its exact transform with undo', () => {
    const state = setup();
    state.terrain.getChunk(0, 0).heights.fill(24);
    const before = structuredClone(state.doc),
      terrain = encodeTerrain(state);
    const result = applyCommand(state, {
      type: 'set_spawn',
      params: {
        spawn: { position: [100, 25, 80], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
      },
    });
    expect(result.changedChunks.size).toBe(0);
    expect({ ...state.doc, spawn: before.spawn }).toEqual(before);
    expect(encodeTerrain(state)).toEqual(terrain);
    expect(state.doc.spawn.position).toEqual([100, 25, 80]);
    applyCommand(state, result.inverse);
    expect(state.doc).toEqual(before);
  });
  it('refuses out-of-place and nonfinite positions atomically', () => {
    const state = setup(),
      before = structuredClone(state.doc);
    for (const position of [
      [251, 25, 0],
      [0, 25, -251],
      [0, NaN, 0],
      [Infinity, 1, 0],
    ]) {
      expect(() =>
        applyCommand(state, {
          type: 'set_spawn',
          params: {
            spawn: {
              position: position as [number, number, number],
              rotation: [0, 0, 0, 1],
              scale: [1, 1, 1],
            },
          },
        }),
      ).toThrow();
      expect(state.doc).toEqual(before);
    }
    expect(
      CommandPayload.safeParse({ type: 'set_spawn', params: { spawn: { position: [1, 2] } } }).success,
    ).toBe(false);
  });
  it('works with an active raster without reseeding or changing staged fields', () => {
    const state = setup();
    const descriptor = {
      schemaVersion: 1 as const,
      id: 'raster',
      origin: [0, 0] as [number, number],
      spacing: 1,
      width: 1,
      height: 1,
      sampling: 'cell-center' as const,
      channels: [{ id: 'height', encoding: 'f32le' as const }],
      heightBinding: { channel: 'height', offset: 20 },
    };
    applyCommand(state, { type: 'create_field_set', params: { descriptor } });
    applyCommand(state, {
      type: 'set_field_tile',
      params: {
        tile: encodeTerrainFieldTile(descriptor, {
          tx: 0,
          tz: 0,
          channels: { height: terrainFieldFloat32Bytes(new Float32Array([4])) },
        }),
      },
    });
    applyCommand(state, {
      type: 'set_terrain_surface',
      params: {
        surface: { setId: 'raster', edge: 'clamp', farEdge: 'inclusive', outsideHeight: -70 },
      },
    });
    const terrain = encodeTerrain(state),
      binding = structuredClone(state.doc.terrain);
    applyCommand(state, {
      type: 'set_spawn',
      params: {
        spawn: {
          position: [100, 25, 80],
          rotation: [0, 0, 0, 1],
          scale: [1, 1, 1],
        },
      },
    });
    expect(state.doc.terrain).toEqual(binding);
    expect(encodeTerrain(state)).toEqual(terrain);
    expect(state.terrain.heightAt(100, 80)).toBe(24);
  });
});
