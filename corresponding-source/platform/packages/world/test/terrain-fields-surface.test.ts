/// <reference types="node" />
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import {
  WorldDocument,
  CommandPayload,
  type TerrainActiveSurface,
  type TerrainFieldDescriptor,
} from '@genvr/contracts';
import {
  applyCommand,
  createWorldState,
  encodeTerrain,
  encodeTerrainFieldTile,
  terrainFieldFloat32Bytes,
  TerrainData,
} from '../src/index.js';
const descriptor: TerrainFieldDescriptor = {
  schemaVersion: 1,
  id: 'fields',
  origin: [-2, -2],
  spacing: 1,
  width: 2,
  height: 2,
  sampling: 'cell-center',
  channels: [
    { id: 'height', encoding: 'f32le' },
    { id: 'mask', encoding: 'u8' },
  ],
  heightBinding: { channel: 'height', offset: 10 },
};
const surface: TerrainActiveSurface = {
  setId: 'fields',
  outsideHeight: -80,
  edge: 'constant',
  farEdge: 'exclusive',
  materialBindings: [{ itemId: 'tidewater-rock', inputs: { rock: { channel: 'mask', scale: 1 / 255 } } }],
};
const doc = () =>
  WorldDocument.parse({
    schemaVersion: 1,
    experienceId: 'exp-surface',
    version: 0,
    style: { base: 'realistic' },
    sizeTier: 'small',
    access: { mode: 'private' },
    environment: { sky: { preset: 'day' }, weather: { preset: 'clear' } },
    terrain: {},
    spawn: { position: [0, 1, 0] },
  });
const tile = (d = descriptor) =>
  encodeTerrainFieldTile(d, {
    tx: 0,
    tz: 0,
    channels: {
      height: terrainFieldFloat32Bytes(new Float32Array([0, 2, 4, 8])),
      mask: new Uint8Array([0, 64, 128, 255]),
    },
  });
function staged(d = descriptor) {
  const state = createWorldState(doc());
  state.terrain.getChunk(0, 0).heights.fill(30);
  applyCommand(state, { type: 'create_field_set', params: { descriptor: d } });
  applyCommand(state, { type: 'set_field_tile', params: { tile: tile(d) } });
  return state;
}
const bind = (state: ReturnType<typeof staged>, value: TerrainActiveSurface | null = surface) =>
  applyCommand(state, { type: 'set_terrain_surface', params: { surface: value } });
describe('complete active raster surface', () => {
  it('cached bulk decoding preserves every byte value and Float32 bits across padded tiles', () => {
    const d = { ...descriptor, width: 257, height: 1 };
    const state = createWorldState(doc());
    applyCommand(state, { type: 'create_field_set', params: { descriptor: d } });
    const expected = Float32Array.from({ length: 257 }, (_, i) => (i === 0 ? -0 : Math.sin(i) * 100));
    for (const tx of [0, 1, 2]) {
      const start = tx * 128,
        end = Math.min(257, start + 128);
      const raw = encodeTerrainFieldTile(d, {
        tx,
        tz: 0,
        channels: {
          height: terrainFieldFloat32Bytes(expected.slice(start, end)),
          mask: Uint8Array.from({ length: end - start }, (_, i) => (start + i) % 256),
        },
      });
      applyCommand(state, { type: 'set_field_tile', params: { tile: raw } });
    }
    const out = new Float64Array(257),
      store = state.terrain.fieldSets.get('fields')!;
    expect(store.readRow('height', 0, 0, out)).toBe(true);
    expect([...out].every((value, index) => Object.is(value, expected[index]))).toBe(true);
    expect(store.readRow('mask', 0, 0, out)).toBe(true);
    expect([...out]).toEqual(Array.from({ length: 257 }, (_, i) => i % 256));
  });
  it('bulk reads exact raw channels into owned rows, with atomic missing/invalid refusal', () => {
    const state = staged(),
      store = state.terrain.fieldSets.get('fields')!;
    const out = new Float64Array([99, 99]);
    expect(store.readRow('height', 1, 0, out)).toBe(true);
    expect([...out]).toEqual([4, 8]);
    out.fill(99);
    expect(store.readRow('mask', 1, 0, out)).toBe(true);
    expect([...out]).toEqual([128, 255]);
    out[0] = -1000;
    expect(store.readValue('mask', 0, 1)).toBe(128);
    for (const [channel, row, col] of [
      ['missing', 0, 0],
      ['height', -1, 0],
      ['height', 0, 1],
    ] as const) {
      out.fill(99);
      expect(store.readRow(channel, row, col, out)).toBe(false);
      expect([...out]).toEqual([99, 99]);
    }
    const raw = tile();
    raw.channels.height = 'AAAAgAAAAD8AAIA/AACAPw=='; // -0, .5, 1, 1
    store.replace(raw, store.revision);
    expect(store.readRow('height', 0, 0, out)).toBe(true);
    expect(Object.is(out[0], -0)).toBe(true);
    const d = { ...descriptor, width: 129, height: 1 };
    const partial = createWorldState(doc());
    applyCommand(partial, { type: 'create_field_set', params: { descriptor: d } });
    const left = encodeTerrainFieldTile(d, {
      tx: 0,
      tz: 0,
      channels: { height: terrainFieldFloat32Bytes(new Float32Array(128)), mask: new Uint8Array(128) },
    });
    applyCommand(partial, { type: 'set_field_tile', params: { tile: left } });
    out.fill(99);
    expect(partial.terrain.fieldSets.get('fields')!.readRow('height', 0, 127, out)).toBe(false);
    expect([...out]).toEqual([99, 99]);
  });
  it('caches immutable slope results, protects cached values and invalidates changed store/binding', () => {
    const state = staged();
    bind(state, { ...surface, farEdge: 'inclusive' });
    const store = state.terrain.activeSurfaceStore!,
      reads = vi.spyOn(store, 'readRow');
    const first = state.terrain.steepCells(1);
    expect(reads).toHaveBeenCalledTimes(2);
    first[0]!.degrees = 0;
    expect(state.terrain.steepCells(1)[0]!.degrees).toBe(81);
    expect(reads).toHaveBeenCalledTimes(2);
    const flat = encodeTerrainFieldTile(descriptor, {
      tx: 0,
      tz: 0,
      channels: { height: terrainFieldFloat32Bytes(new Float32Array(4)), mask: new Uint8Array(4) },
    });
    store.replace(flat, store.revision); // regression for out-of-band revision changes
    expect(state.terrain.steepCells(1)).toEqual([]);
    expect(reads).toHaveBeenCalledTimes(4);
    bind(state, { ...surface, farEdge: 'inclusive' });
    expect(state.terrain.steepCells(1)).toEqual([]);
    expect(reads).toHaveBeenCalledTimes(6);
  });
  it('scans active source slopes at raster spacing, buckets worst values and clips playable centers', () => {
    const state = staged();
    // Dormant legacy heights deliberately disagree with the source grid.
    state.terrain.getChunk(0, 0).heights[0] = -100;
    bind(state, { ...surface, farEdge: 'inclusive' });
    expect(state.terrain.steepCells(1)).toEqual([{ x: -0.5, z: -1.5, degrees: 81 }]);
    expect(state.terrain.steepCells(6)).toEqual([]);
    expect(state.terrain.steepCells(1, 0.5)).toEqual([
      { x: -1.5, z: -1.5, degrees: 76 },
      { x: -0.5, z: -1.5, degrees: 81 },
      { x: -1.5, z: -0.5, degrees: 76 },
    ]);
    bind(state);
    expect(state.terrain.steepCells(0)).toEqual([]); // exclusive far edge leaves one center
    const clipped = new TerrainData(0.75);
    clipped.fieldSets.set('fields', state.terrain.activeSurfaceStore!);
    clipped.bindSurface({ ...surface, farEdge: 'inclusive' });
    expect(clipped.steepCells(0)).toEqual([]); // no slope from/to an outside playable center
    for (const [maxStep, bucket] of [
      [NaN, 16],
      [-1, 16],
      [0, 0],
      [0, Infinity],
    ])
      expect(() => clipped.steepCells(maxStep!, bucket!)).toThrow(/Invalid raster slope/);
  });
  it('reads source slope neighbors across tile seams and handles a one-row raster', () => {
    const d: TerrainFieldDescriptor = {
      ...descriptor,
      origin: [0, 0],
      width: 129,
      height: 1,
      sampling: 'vertex',
    };
    const state = createWorldState(doc());
    applyCommand(state, { type: 'create_field_set', params: { descriptor: d } });
    for (const tx of [0, 1]) {
      const cols = tx === 0 ? 128 : 1;
      const raw = encodeTerrainFieldTile(d, {
        tx,
        tz: 0,
        channels: {
          height: terrainFieldFloat32Bytes(new Float32Array(cols).fill(tx === 0 ? 0 : 10)),
          mask: new Uint8Array(cols),
        },
      });
      applyCommand(state, { type: 'set_field_tile', params: { tile: raw } });
    }
    bind(state, { ...surface, farEdge: 'inclusive' });
    expect(state.terrain.steepCells(1)).toEqual([{ x: 127, z: 0, degrees: 84 }]);
  });
  it('refuses closed grade-free walls before saving a reload-invalid active document', () => {
    const state = staged();
    bind(state);
    const before = JSON.stringify(state.doc);
    expect(() =>
      applyCommand(state, {
        type: 'draw_wall',
        params: {
          wallId: 'closed',
          points: [
            [0, 0],
            [1, 0],
            [1, 1],
          ],
          closed: true,
          grade: false,
        },
      }),
    ).toThrow(/Deactivate raster terrain/);
    expect(JSON.stringify(state.doc)).toBe(before);
    const loaded = createWorldState(
      WorldDocument.parse(state.doc),
      encodeTerrain(state).map((row) => row.data),
    );
    expect(loaded.terrain.heightAt(-1, -1)).toBe(13.5);
    applyCommand(state, {
      type: 'draw_wall',
      params: {
        wallId: 'open',
        points: [
          [0, 0],
          [1, 0],
        ],
        closed: false,
        grade: false,
      },
    });
    expect(
      createWorldState(
        WorldDocument.parse(state.doc),
        encodeTerrain(state).map((row) => row.data),
      ).doc.walls,
    ).toHaveLength(1);
  });
  it('matches the executable pinned original heightAt equation and boundary policy', () => {
    const source = readFileSync(
      new URL('../../../../tooling/other-programs/tidewater/src/world/TerrainData.js', import.meta.url),
      'utf8',
    );
    const start = source.indexOf('\theightAt( x, z ) {');
    const end = source.indexOf('\n\tnormalAt(', start);
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const oracle = runInNewContext(`({${source.slice(start, end)}})`) as {
      heightAt(x: number, z: number): number;
      res: number;
      texel: number;
      origin: number;
      heights: Float32Array;
    };
    Object.assign(oracle, { res: 2, texel: 1, origin: -2, heights: new Float32Array([0, 2, 4, 8]) });
    const state = staged();
    bind(state);
    for (let n = 0; n < 1000; n++) {
      const x = -2 + (((n * 73) % 997) / 997) * 2;
      const z = -2 + (((n * 197) % 991) / 991) * 2;
      expect(state.terrain.heightAt(x, z)).toBe(oracle.heightAt(x, z) + 10);
    }
    for (const [x, z] of [
      [-1.5, -1.5],
      [-0.5, -1],
      [-1, -0.5],
      [-1.50001, -1],
    ])
      expect(state.terrain.heightAt(x!, z!)).toBe(oracle.heightAt(x!, z!) + 10);
  });
  it('activates source bilinear/offset/exclusive edges, preserves dormant chunks and inverses', () => {
    const state = staged();
    const legacy = state.terrain.chunks.get('0,0')!.heights.slice();
    const changed = bind(state);
    expect(changed.changedChunks.size).toBe(0);
    expect(state.terrain.surfaceRevision).toBe(1);
    expect(state.terrain.heightAt(-1, -1)).toBe(13.5);
    expect(state.terrain.vertexHeight(-1, -1)).toBe(13.5);
    expect(state.terrain.rasterHeightAt(-1.5, -1.5)).toBe(10);
    expect(state.terrain.heightAt(-0.5, -1)).toBe(-80);
    expect(state.terrain.heightAt(-1.5001, -1)).toBe(-80);
    expect(state.terrain.heightAt(Infinity, 0)).toBe(-80);
    expect(state.terrain.chunks.get('0,0')!.heights).toEqual(legacy);
    applyCommand(state, changed.inverse);
    expect(state.doc.terrain.activeSurface).toBeUndefined();
    expect(state.terrain.heightAt(0, 0)).toBe(30);
    expect(state.terrain.surfaceRevision).toBe(2);
    const back = bind(state);
    const off = bind(state, null);
    applyCommand(state, off.inverse);
    expect(state.terrain.heightAt(-1, -1)).toBe(13.5);
    expect(back.inverse).toEqual({ type: 'set_terrain_surface', params: { surface: null } });
  });
  it('supports clamp/inclusive policy explicitly and validates channels atomically', () => {
    const state = staged();
    bind(state, { ...surface, farEdge: 'inclusive' });
    expect(state.terrain.heightAt(-0.5, -0.5)).toBe(18);
    bind(state, { ...surface, edge: 'clamp' });
    expect(state.terrain.heightAt(500, 500)).toBe(18);
    const before = JSON.stringify(state.doc);
    expect(() =>
      bind(state, {
        ...surface,
        materialBindings: [{ itemId: 'tidewater-rock', inputs: { rock: { channel: 'missing', scale: 1 } } }],
      }),
    ).toThrow(/Unknown material/);
    expect(JSON.stringify(state.doc)).toBe(before);
    expect(state.terrain.heightAt(500, 500)).toBe(18);
  });
  it('fails closed for incomplete/noheight/nonrealistic/roads/closedwall state', () => {
    const state = createWorldState(doc());
    applyCommand(state, { type: 'create_field_set', params: { descriptor } });
    expect(() => bind(state)).toThrow(/complete loaded/);
    const noHeight = { ...descriptor };
    delete noHeight.heightBinding;
    expect(() => bind(staged(noHeight))).toThrow(/heightBinding/);
    for (const kind of ['blocky', 'voxel'] as const) {
      const s = staged();
      s.doc.style.base = kind;
      expect(() => bind(s)).toThrow(/realistic/);
    }
    const roads = staged();
    roads.doc.roads.push({
      id: 'r',
      points: [
        [0, 0],
        [10, 0],
      ],
      width: 2,
    });
    expect(() => bind(roads)).toThrow(/without roads/);
    const walls = staged();
    walls.doc.walls.push({
      id: 'w',
      points: [
        [0, 0],
        [1, 0],
        [1, 1],
      ],
      closed: true,
      height: 3,
      openings: [],
    });
    expect(() => bind(walls)).toThrow(/without roads/);
  });
  it('reconstructs active encoded state and installs exact complete hydrated stores without raw reencoding', () => {
    const state = staged();
    bind(state);
    const restored = createWorldState(
      WorldDocument.parse(state.doc),
      encodeTerrain(state).map((row) => row.data),
    );
    expect(restored.terrain.heightAt(-1, -1)).toBe(13.5);
    expect(() => createWorldState(WorldDocument.parse(state.doc))).toThrow(/complete loaded/);
    const hydrated = createWorldState(WorldDocument.parse(state.doc), [], {
      fieldStores: state.terrain.fieldSets,
    });
    expect(hydrated.terrain.activeSurfaceStore).toBe(state.terrain.activeSurfaceStore);
    expect(hydrated.terrain.heightAt(-1, -1)).toBe(13.5);
    const mismatch = WorldDocument.parse(state.doc);
    mismatch.terrain.fieldSets!.fields!.descriptor.spacing = 2;
    expect(() => createWorldState(mismatch, [], { fieldStores: state.terrain.fieldSets })).toThrow(
      /does not match/,
    );
  });
  it('guards active mutations before edits and permits ordinary items/sea and other staged sets', () => {
    const state = staged();
    bind(state);
    const commands: CommandPayload[] = [
      { type: 'set_field_tile', params: { tile: tile() } },
      { type: 'remove_field_tile', params: { setId: 'fields', tx: 0, tz: 0 } },
      { type: 'restore_field_tile', params: { setId: 'fields', tx: 0, tz: 0, before: null, after: tile() } },
      { type: 'remove_field_set', params: { setId: 'fields' } },
      { type: 'set_style', params: { base: 'blocky' } },
      { type: 'set_blocks', params: { blocks: [[0, 0, 0, 1]] } },
      { type: 'set_water_level', params: { waterId: 'lake', level: 5 } },
      {
        type: 'draw_river',
        params: {
          riverId: 'river',
          points: [
            [0, 0],
            [10, 0],
          ],
          carve: false,
        },
      },
      { type: 'remove_river', params: { riverId: 'river' } },
      {
        type: 'draw_wall',
        params: {
          wallId: 'wall',
          points: [
            [0, 0],
            [1, 0],
            [1, 1],
          ],
          closed: true,
        },
      },
      {
        type: 'sculpt_terrain',
        params: {
          area: [
            [0, 0],
            [1, 0],
            [0, 1],
          ],
          operation: 'raise',
          strength: 1,
        },
      },
      {
        type: 'draw_road',
        params: {
          roadId: 'r',
          points: [
            [0, 0],
            [10, 0],
          ],
          grade: false,
        },
      },
    ];
    const before = JSON.stringify(state.doc);
    for (const command of commands) {
      CommandPayload.parse(command);
      expect(() => applyCommand(state, command)).toThrow(/Deactivate raster terrain/);
      expect(JSON.stringify(state.doc)).toBe(before);
    }
    applyCommand(state, {
      type: 'place_item',
      params: { instanceId: 'item', itemId: 'genvr.core.crate', position: [0, 1, 0] },
    });
    applyCommand(state, { type: 'set_sea', params: { level: 20 } });
    expect(state.terrain.heightAt(-1, -1)).toBe(13.5);
    applyCommand(state, { type: 'create_field_set', params: { descriptor: { ...descriptor, id: 'other' } } });
    expect(state.terrain.fieldSets.has('other')).toBe(true);
  });
});
