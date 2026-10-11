import { describe, it, expect } from 'vitest';
import { WorldDocument, type TerrainFieldDescriptor, type CommandPayload } from '@genvr/contracts';
import {
  applyCommand,
  createWorldState,
  encodeTerrain,
  CommandHistory,
  fieldCommandKeys,
  isFieldCommand,
  fieldTileStorageKey,
  parseFieldTileStorageKey,
  encodeTerrainFieldTile,
  terrainFieldFloat32Bytes,
} from '../src/index.js';
const emptyDoc = () =>
  WorldDocument.parse({
    schemaVersion: 1,
    experienceId: 'exp-fields',
    version: 0,
    style: { base: 'realistic' },
    sizeTier: 'small',
    access: { mode: 'private' },
    environment: { sky: { preset: 'day' }, weather: { preset: 'clear' } },
    terrain: {},
    spawn: { position: [0, 1, 0] },
  });
const descriptor: TerrainFieldDescriptor = {
  schemaVersion: 1,
  id: 'fields',
  origin: [-1024, -1024],
  spacing: 1,
  width: 129,
  height: 1,
  sampling: 'cell-center',
  channels: [
    { id: 'height', encoding: 'f32le' },
    { id: 'mask', encoding: 'u8' },
  ],
  heightBinding: { channel: 'height', offset: 20 },
};
const create: CommandPayload = { type: 'create_field_set', params: { descriptor } };
const tile = (tx = 0, h = 5) =>
  encodeTerrainFieldTile(descriptor, {
    tx,
    tz: 0,
    channels: {
      height: terrainFieldFloat32Bytes(new Float32Array(tx === 0 ? 128 : 1).fill(h)),
      mask: new Uint8Array(tx === 0 ? 128 : 1).fill(173),
    },
  });
const command = (tx = 0, h = 5): CommandPayload => ({
  type: 'set_field_tile',
  params: { tile: tile(tx, h) },
});
const snapshot = (s: ReturnType<typeof createWorldState>) => ({
  doc: JSON.parse(JSON.stringify(s.doc)) as WorldDocument,
  encoded: encodeTerrain(s),
});
describe('staged field state and lossless command inverses', () => {
  it('creates staged metadata and exact changed f: rows without changing legacy heights/materials', () => {
    const state = createWorldState(emptyDoc());
    const baseline = snapshot(state);
    const originalHeight = state.terrain.heightAt(0, 0);
    const removed = applyCommand(state, create);
    expect(removed.changedChunks.size).toBe(0);
    const changed = applyCommand(state, command());
    expect([...changed.changedChunks]).toEqual(['f:fields:0,0']);
    expect(state.doc.terrain.fieldSets?.fields?.tiles).toEqual(['0,0']);
    const encoded = encodeTerrain(state, changed.changedChunks);
    expect(encoded[0]?.key).toBe('f:fields:0,0');
    const reloaded = createWorldState(
      WorldDocument.parse(state.doc),
      encoded.map((r) => r.data),
    );
    expect(reloaded.terrain.fieldSets.get('fields')?.getTile(0, 0)).toEqual(tile());
    expect(reloaded.terrain.heightAt(0, 0)).toBe(originalHeight);
    expect(reloaded.doc.terrain.materials).toBeUndefined();
    applyCommand(state, changed.inverse);
    expect(encodeTerrain(state, changed.changedChunks)).toEqual([{ key: 'f:fields:0,0', data: '' }]);
    applyCommand(state, removed.inverse);
    expect(snapshot(state)).toEqual(baseline);
  });
  it('uses normal history for grouped create/upload/undo/redo and exact raw replacement undo', () => {
    const state = createWorldState(emptyDoc()),
      history = new CommandHistory(state),
      before = snapshot(state);
    history.beginGroup();
    history.execute(create);
    history.execute(command(1));
    history.execute(command(0));
    history.endGroup();
    const complete = snapshot(state);
    expect(state.terrain.fieldSets.get('fields')?.complete).toBe(true);
    history.undo();
    expect(snapshot(state)).toEqual(before);
    history.redo();
    expect(snapshot(state)).toEqual(complete);
    const changed = applyCommand(state, command(0, 8));
    expect(state.terrain.fieldSets.get('fields')?.getTile(0, 0)).toEqual(tile(0, 8));
    const undone = applyCommand(state, changed.inverse);
    expect(state.terrain.fieldSets.get('fields')?.getTile(0, 0)).toEqual(tile());
    applyCommand(state, undone.inverse);
    expect(state.terrain.fieldSets.get('fields')?.getTile(0, 0)).toEqual(tile(0, 8));
  });
  it('refuses to overwrite a tile changed after the recorded inverse, atomically', () => {
    const state = createWorldState(emptyDoc());
    applyCommand(state, create);
    applyCommand(state, command());
    const step = applyCommand(state, command(0, 8));
    applyCommand(state, command(0, 9));
    const before = snapshot(state);
    expect(() => applyCommand(state, step.inverse)).toThrow('changed since');
    expect(snapshot(state)).toEqual(before);
  });
  it('fails closed when a referenced old tile was omitted by selective loading', () => {
    const full = createWorldState(emptyDoc());
    applyCommand(full, create);
    applyCommand(full, command());
    const partial = createWorldState(WorldDocument.parse(full.doc));
    expect(encodeTerrain(partial)).toEqual([]);
    const before = snapshot(partial);
    expect(() => applyCommand(partial, command(0, 8))).toThrow('not loaded');
    expect(() =>
      applyCommand(partial, { type: 'remove_field_tile', params: { setId: 'fields', tx: 0, tz: 0 } }),
    ).toThrow('not loaded');
    expect(() => encodeTerrain(partial, ['f:fields:0,0'])).toThrow('not loaded');
    expect(() => applyCommand(partial, { type: 'remove_field_set', params: { setId: 'fields' } })).toThrow(
      'empty',
    );
    expect(snapshot(partial)).toEqual(before);
    applyCommand(partial, command(1));
    expect(partial.doc.terrain.fieldSets?.fields?.tiles).toEqual(['0,0', '1,0']);
    expect(encodeTerrain(partial).map((r) => r.key)).toEqual(['f:fields:1,0']);
  });
  it('supports explicit tile deletion, empty-set deletion and batch tombstones', () => {
    const state = createWorldState(emptyDoc());
    applyCommand(state, create);
    applyCommand(state, command());
    const deletion = applyCommand(state, {
      type: 'remove_field_tile',
      params: { setId: 'fields', tx: 0, tz: 0 },
    });
    applyCommand(state, { type: 'remove_field_set', params: { setId: 'fields' } });
    expect(encodeTerrain(state, deletion.changedChunks)).toEqual([{ key: 'f:fields:0,0', data: '' }]);
    expect(() => applyCommand(state, command())).toThrow('not found');
  });
  it('rejects orphan/duplicate persisted rows and malformed tile/metadata/keys', () => {
    const state = createWorldState(emptyDoc());
    applyCommand(state, create);
    expect(() => createWorldState(WorldDocument.parse(state.doc), [JSON.stringify(tile())])).toThrow(
      'no metadata',
    );
    applyCommand(state, command());
    const row = encodeTerrain(state)[0]!.data;
    expect(() => createWorldState(WorldDocument.parse(state.doc), [row, row])).toThrow('Duplicate');
    const before = snapshot(state);
    expect(() => applyCommand(state, create)).toThrow('already exists');
    expect(() =>
      applyCommand(state, { type: 'set_field_tile', params: { tile: { ...tile(), channels: {} } } }),
    ).toThrow('every declared');
    expect(() =>
      applyCommand(state, {
        type: 'restore_field_tile',
        params: { setId: 'fields', tx: 1, tz: 0, before: tile(), after: null },
      }),
    ).toThrow('coordinates mismatch');
    expect(snapshot(state)).toEqual(before);
    expect(() => parseFieldTileStorageKey('f:fields:00,0')).toThrow();
    expect(() => fieldTileStorageKey('bad:id', 0, 0)).toThrow();
  });
  it('exports distinct selective keys and field-only detection without descriptors', () => {
    expect(
      fieldCommandKeys([
        create,
        command(),
        command(),
        { type: 'remove_field_tile', params: { setId: 'fields', tx: 1, tz: 0 } },
      ]),
    ).toEqual(['f:fields:0,0', 'f:fields:1,0']);
    expect(isFieldCommand(create)).toBe(true);
    expect(isFieldCommand({ type: 'set_sea', params: { level: 20 } })).toBe(false);
  });
});

it('preserves legacy height/soil/cover blobs while field rows coexist on reload', () => {
  const state = createWorldState(emptyDoc()),
    chunk = state.terrain.getChunk(0, 0);
  chunk.heights[0] = 3.125;
  chunk.soils[0] = 2;
  chunk.cover[0] = 1;
  const legacy = encodeTerrain(state);
  applyCommand(state, create);
  applyCommand(state, command());
  const rows = encodeTerrain(state),
    loaded = createWorldState(
      WorldDocument.parse(state.doc),
      rows.map((r) => r.data),
    );
  expect(rows.find((r) => r.key === '0,0')).toEqual(legacy[0]);
  expect(loaded.terrain.getChunk(0, 0).heights).toEqual(chunk.heights);
  expect(loaded.terrain.getChunk(0, 0).soils).toEqual(chunk.soils);
  expect(loaded.terrain.getChunk(0, 0).cover).toEqual(chunk.cover);
  expect(loaded.terrain.fieldSets.get('fields')?.getTile(0, 0)).toEqual(tile());
});
it('fails aggregate set creation atomically before metadata/map mutation', () => {
  const state = createWorldState(emptyDoc());
  for (const id of ['a', 'b'])
    applyCommand(state, {
      type: 'create_field_set',
      params: {
        descriptor: {
          ...descriptor,
          id,
          width: 4096,
          height: 4096,
          channels: [{ id: 'height', encoding: 'f32le' }],
        },
      },
    });
  const before = snapshot(state);
  expect(() =>
    applyCommand(state, { type: 'create_field_set', params: { descriptor: { ...descriptor, id: 'c' } } }),
  ).toThrow('aggregate');
  expect(snapshot(state)).toEqual(before);
  expect(state.terrain.fieldSets.size).toBe(2);
});
