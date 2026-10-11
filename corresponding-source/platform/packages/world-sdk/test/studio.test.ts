import { describe, expect, it } from 'vitest';
import { defaultPlaySettings, type TerrainFieldDescriptor } from '@genvr/contracts';
import { getCoreItem } from '@genvr/core-library';
import { CommandHistory, createWorldState, encodeTerrain, encodeTerrainFieldTile, terrainFieldFloat32Bytes } from '@genvr/world';
import { createStudioProject, importStudioProject, readStudioProject } from '../src/studio-project.js';
import { StudioSaveQueue, flushStudioClose } from '../src/studio-save.js';
import { WorldSession } from '../src/session.js';

describe('shared Studio local projects', () => {
  it('preserves custom assets and refuses incomplete imports before a storage write', () => {
    const project = createStudioProject('blocky', 'small');
    const manifest = { ...structuredClone(getCoreItem('genvr.core.part.box')!.manifest), id: 'local.test-box' };
    project.world.instances[0]!.itemId = manifest.id;
    expect(() => readStudioProject(project)).toThrow('Local asset is missing');
    project.assets.push({ id: manifest.id, manifest, files: [{ path: 'scripts/test.js', contentType: 'text/javascript', data: btoa('export {};') }] });
    expect(importStudioProject(JSON.stringify(project))).toEqual(project);
  });
  it('preserves sculpted terrain heights and soils in an edited snapshot', () => {
    const project = createStudioProject('blocky', 'empty'), state = createWorldState(project.world);
    state.terrain.sculpt([[-4, -4], [4, -4], [4, 4], [-4, 4]], 'raise', 2);
    const next = readStudioProject({ ...project, world: state.doc, terrainChunks: encodeTerrain(state).map(row => row.data).filter(Boolean) });
    const restored = createWorldState(next.world, next.terrainChunks);
    expect(restored.terrain.heightAt(0, 0)).toBeCloseTo(state.terrain.heightAt(0, 0));
    expect(restored.terrain.heightAt(0, 0)).toBeGreaterThan(0);
    expect(importStudioProject(JSON.stringify(next))).toEqual(next);
  });
  it.each(['blocky', 'realistic', 'voxel'] as const)('creates the shared small starter for %s and roundtrips all chunks', style => {
    const project = createStudioProject(style, 'small');
    expect(project.world.instances).toHaveLength(14);
    expect(project.world.access.mode).toBe('private');
    expect(importStudioProject(JSON.stringify(project))).toEqual(project);
    if (style === 'voxel') expect(project.terrainChunks.length).toBeGreaterThan(0);
  });
  it('keeps play settings and snapshot history including undo and redo, without a second journal', () => {
    const play = { ...defaultPlaySettings(), view: 'side' as const };
    const project = createStudioProject('realistic', 'empty', play);
    const state = createWorldState(project.world, project.terrainChunks), history = new CommandHistory(state);
    const snapshot = () => readStudioProject({ ...project, world: state.doc, terrainChunks: encodeTerrain(state).map(row => row.data).filter(Boolean) });
    history.execute({ type: 'set_sky', params: { preset: 'sunset' } });
    const after = snapshot();
    history.undo(); expect(snapshot().world.environment.sky.preset).toBe('day');
    history.redo(); expect(snapshot()).toEqual(after);
    expect(after.play.view).toBe('side');
  });
  it('preserves staged inactive field pages and rejects referenced missing pages', () => {
    const project = createStudioProject('blocky', 'empty');
    const descriptor: TerrainFieldDescriptor = { schemaVersion: 1, id: 'staged', origin: [0, 0], spacing: 1, width: 129, height: 1, sampling: 'cell-center', channels: [{ id: 'height', encoding: 'f32le' }], heightBinding: { channel: 'height', offset: 0 } };
    project.world.terrain.fieldSets = { staged: { descriptor, tiles: ['0,0'] } };
    expect(() => readStudioProject(project)).toThrow('page is missing');
    const tile = encodeTerrainFieldTile(descriptor, { tx: 0, tz: 0, channels: { height: terrainFieldFloat32Bytes(new Float32Array(128).fill(5)) } });
    project.terrainChunks = [JSON.stringify(tile)];
    expect(importStudioProject(JSON.stringify(project))).toEqual(project);
  });
  it('rejects malformed and duplicate chunks, unknown versions and non-private projects', () => {
    const project = createStudioProject('voxel', 'small');
    expect(() => readStudioProject({ ...project, version: 2 })).toThrow();
    expect(() => readStudioProject({ ...project, terrainChunks: [...project.terrainChunks, project.terrainChunks[0]] })).toThrow('Duplicate');
    expect(() => readStudioProject({ ...project, terrainChunks: [JSON.stringify({ kind: 'voxel-edits', cx: 0, cz: 0, v: 1, e: 'AAAA' })] })).toThrow('length');
    expect(() => readStudioProject({ ...project, world: { ...project.world, access: { mode: 'public' } } })).toThrow();
  });
  it('imports existing format-1 worlds without changing their replay semantics', () => {
    const session = WorldSession.create();
    session.apply([{ type: 'set_sky', params: { preset: 'night' } }]);
    const project = importStudioProject(session.serialize());
    expect(project.world).toEqual(session.world);
    expect(project.terrainChunks).toEqual(session.terrainChunks);
  });
});

describe('Studio save ordering', () => {
  it.each(['recording', 'film-edit', 'asset-edit'] as const)('keeps the editor mounted when %s starts during a delayed world save', async change => {
    let busy = false, project = {}, assets = {}, unmounted = false, release!: () => void;
    const delayed = new Promise<boolean>(resolve => { release = () => resolve(true); });
    const closing = flushStudioClose({ busy: () => busy, snapshot: () => ({ project, assets }), flush: async () => true }, () => delayed)
      .then(allowed => { if (allowed) unmounted = true; });
    await Promise.resolve();
    if (change === 'recording') busy = true;
    if (change === 'film-edit') project = {};
    if (change === 'asset-edit') assets = {};
    release(); await closing;
    expect(unmounted).toBe(false);
    busy = false;
    expect(await flushStudioClose({ busy: () => busy, snapshot: () => ({ project, assets }), flush: async () => true }, async () => true)).toBe(true);
  });
  it('does not permit leaving after a stale write and serializes the latest snapshot', async () => {
    const queue = new StudioSaveQueue(), saved: number[] = [];
    let release!: () => void;
    const delayed = new Promise<void>(resolve => { release = resolve; });
    queue.changed();
    const first = queue.write(async () => { await delayed; saved.push(1); });
    queue.changed();
    const latest = queue.write(async () => { saved.push(2); });
    release();
    expect(await first).toBe(false); expect(await latest).toBe(true); expect(saved).toEqual([1, 2]);
  });
  it('recovers the write queue after a rejected storage transaction', async () => {
    const queue = new StudioSaveQueue();
    await expect(queue.write(async () => { throw new Error('quota'); })).rejects.toThrow('quota');
    expect(await queue.write(async () => {})).toBe(true);
  });
});
