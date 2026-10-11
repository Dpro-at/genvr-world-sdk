import { describe, expect, it } from 'vitest';
import { WorldSession, browserStorage, openWorld, saveWorld, GenvrClient, type ChatModel } from '../src/index.js';

describe('standalone world authoring', () => {
  it('runs agent generation, edits and reopens the same local world with terrain intact', async () => {
    const session = WorldSession.create({ id: 'local.test' });
    let calls = 0;
    const model: ChatModel = async () => ++calls === 1 ? { content: '', tool_calls: [
      { function: { name: 'place_item', arguments: { itemId: 'genvr.core.bench', x: 5, z: 4 } } },
      { function: { name: 'set_sky', arguments: { preset: 'sunset' } } },
    ] } : { content: 'Garden ready.', tool_calls: [] };
    await session.generate('Make a garden', model);
    expect((await session.tool('add_water', { x: -20, z: -20 })).ok).toBe(true);
    expect(session.terrainChunks.length).toBeGreaterThan(0);
    expect(session.world.instances).toHaveLength(1);
    expect(session.world.environment.sky.preset).toBe('sunset');
    const id = session.world.instances[0]!.instanceId;
    expect((await session.tool('move_item', { instanceId: id, x: 9, z: 8 })).ok).toBe(true);
    const edited = session.world;
    session.undo(); expect(session.world.instances[0]!.transform.position[0]).toBe(5);
    session.redo(); expect(session.world).toEqual(edited);
    const values = new Map<string, string>();
    const storage = browserStorage({ getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); } });
    await saveWorld(session, storage);
    const reopened = await openWorld('local.test', storage);
    expect(reopened.world).toEqual(session.world);
    expect(reopened.terrainChunks).toEqual(session.terrainChunks);
    expect(reopened.serialize()).not.toContain('token');
  });
  it('refused batches do not change world, history or saved data', () => {
    const session = WorldSession.create({ id: 'local.atomic' }); const before = session.serialize();
    expect(() => session.apply([
      { type: 'set_sky', params: { preset: 'sunset' } },
      { type: 'remove_item', params: { instanceId: 'missing' } },
    ])).toThrow();
    expect(session.serialize()).toBe(before); expect(session.canUndo).toBe(false);
  });
  it('rejects unknown package versions and oversized records', () => {
    const record = WorldSession.create().export();
    expect(() => new WorldSession({ ...record, formatVersion: 2 })).toThrow();
    expect(() => new WorldSession(' '.repeat(8 * 1024 * 1024 + 1))).toThrow('8 MB');
    expect(() => sessionFrom([{ type: 'create_field_set', params: {} }])).toThrow();
  });
  it('refuses excessive terrain work and temporary enlargement before replay', () => {
    const polygon = Array.from({ length: 129 }, (_, i) => [Math.cos(i) * 200, Math.sin(i) * 200]);
    expect(() => sessionFrom([{ type: 'paint_cover', params: { area: polygon, cover: 'cleared' } }])).toThrow('128 points');
    const area = [[-249,-249],[249,-249],[249,249],[-249,249]];
    expect(() => sessionFrom(Array.from({ length: 30 }, () => ({ type: 'paint_cover', params: { area, cover: 'cleared' } })))).toThrow('work budget');
    expect(() => sessionFrom(Array.from({ length: 30 }, () => ({ type: 'paint_rule', params: { box: [-249,-249,249,249], cover: 'cleared', slope: [0,90] } })))).toThrow('work budget');
    expect(() => sessionFrom([{ type: 'set_size_tier', params: { sizeTier: 'max' } }, { type: 'set_size_tier', params: { sizeTier: 'small' } }])).toThrow('size tier');
  });
  it('keeps local generation separate from explicit world and item publication', async () => {
    const requests: Array<{ url: string; body: unknown }> = [];
    const fetcher: typeof fetch = async (url, init) => {
      requests.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      return new Response(JSON.stringify(String(url).endsWith('/import') ? { version: 1 } : { id: 'exp.test' }), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    const client = new GenvrClient('https://api.genvr.net', fetcher); const session = WorldSession.create();
    await session.tool('set_sky', { preset: 'night' }); expect(requests).toHaveLength(0);
    const draft = await client.createDraft(session);
    const uploaded = await client.uploadWorld(session, { id: draft.id, baseVersion: 0 });
    expect(uploaded.version).toBe(1);
    expect(requests.some(r => r.url.endsWith('/publish'))).toBe(false);
    await client.submitItem({ name: 'My bench', kind: 'props-and-decor', styles: ['blocky'], model: 'AAAA' });
    expect(requests.at(-1)!.url).toContain('/v1/items/uploads');
  });
});
function sessionFrom(commands: unknown[]) { return new WorldSession({ ...WorldSession.create().export(), commands }); }
