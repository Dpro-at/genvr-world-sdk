import { afterEach, describe, expect, it, vi } from 'vitest';
import { browserUserAvatarStorage, type UserAvatarMetadata, type UserAvatarStorage } from '../src/user-avatar-library.js';
import { DeleteConfirmGate, deletable, deleteFromLibrary, deletePlan } from '../studio/user-avatar-delete.js';

/** Just enough IndexedDB for the library: object stores, put/get/getAll/getAllKeys/delete, transactions that complete. */
function memoryIndexedDb(): IDBFactory {
  const databases = new Map<string, Map<string, { keyPath?: string; rows: Map<string, unknown> }>>();
  const request = <T>(run: () => T, tx?: { pending: number; done(): void }) => {
    const req = { result: undefined as T, error: null, onsuccess: null as null | (() => void), onerror: null };
    if (tx) tx.pending++;
    queueMicrotask(() => { req.result = run(); req.onsuccess?.(); if (tx) { tx.pending--; tx.done(); } });
    return req;
  };
  const database = (stores: Map<string, { keyPath?: string; rows: Map<string, unknown> }>) => ({
    createObjectStore(name: string, options?: { keyPath?: string }) { stores.set(name, { ...(options?.keyPath ? { keyPath: options.keyPath } : {}), rows: new Map() }); },
    transaction(names: string | string[]) {
      const tx = { pending: 0, finished: false, oncomplete: null as null | (() => void), onerror: null, onabort: null, error: null,
        done() { queueMicrotask(() => { if (!tx.pending && !tx.finished) { tx.finished = true; tx.oncomplete?.(); } }); },
        objectStore(name: string) {
          if (![names].flat().includes(name)) throw new Error(`Store ${name} is outside the transaction.`);
          const store = stores.get(name)!, keyOf = (value: unknown, key?: unknown) => String(key ?? store.keyPath!.split('.').reduce((row: any, part) => row[part], value));
          return {
            put: (value: unknown, key?: unknown) => request(() => { store.rows.set(keyOf(value, key), structuredClone(value)); }, tx),
            get: (key: string) => request(() => store.rows.get(key), tx),
            getAll: () => request(() => [...store.rows.values()], tx),
            getAllKeys: () => request(() => [...store.rows.keys()], tx),
            delete: (key: string) => request(() => { store.rows.delete(key); }, tx),
          };
        } };
      tx.done();
      return tx;
    },
    close() {},
  });
  return { open(name: string) {
    const fresh = !databases.has(name); if (fresh) databases.set(name, new Map());
    const req = { result: database(databases.get(name)!), onupgradeneeded: null as null | (() => void), onsuccess: null as null | (() => void), onerror: null, onblocked: null };
    queueMicrotask(() => { if (fresh) req.onupgradeneeded?.(); req.onsuccess?.(); });
    return req;
  } } as unknown as IDBFactory;
}

const glb = () => { const data = new ArrayBuffer(32); new DataView(data).setUint32(0, 0x46546c67, true); return data; };
const meta = (n: number, kind: 'character' | 'motion', name: string, originalFile: string): UserAvatarMetadata => ({ id: `user.mixamo.${String(n).repeat(64).slice(0, 64)}.${kind}`, kind, name, originalFile, sha256: String(n).repeat(64).slice(0, 64), importedAt: '2026-10-20T10:00:00.000Z', source: 'user-import', provider: 'mixamo', sourcePage: 'https://www.mixamo.com/', bundled: false });
const hero = meta(1, 'character', 'Test_Hero', 'hero.glb'), heroCopy = meta(2, 'character', 'Test_Hero', 'hero.glb'), other = meta(3, 'character', 'Other', 'other.glb'), heroWave = meta(4, 'motion', 'hero · Wave', 'hero.glb');

let storage: UserAvatarStorage | null = null;
afterEach(() => { storage?.close(); storage = null; });
const library = async () => {
  storage = browserUserAvatarStorage('a14-test', memoryIndexedDb());
  for (const metadata of [hero, heroCopy, other, heroWave]) await storage.put({ metadata, data: glb() });
  return storage;
};

describe('board A14 · delete an imported character', () => {
  it('removes the asset, its metadata and every assignment that points to it', async () => {
    const lib = await library();
    await lib.assign('project-a', 'self', hero.id); await lib.assign('project-b', 'agent-1', hero.id); await lib.assign('project-a', 'agent-2', other.id);
    expect(await lib.usage(hero.id)).toEqual([{ projectId: 'project-a', target: 'self' }, { projectId: 'project-b', target: 'agent-1' }]);
    await lib.remove(hero.id);
    expect(await lib.get(hero.id)).toBeNull();
    expect((await lib.list()).map(row => row.id)).not.toContain(hero.id);
    expect(await lib.assignment('project-a', 'self')).toBeNull();
    expect(await lib.assignment('project-b', 'agent-1')).toBeNull();
    expect(await lib.assignment('project-a', 'agent-2')).toBe(other.id);
  });
  it('a card deletes every copy of itself; motions from the same file stay unless ticked', async () => {
    const lib = await library();
    const plan = deletePlan(await lib.list(), hero.id)!;
    expect(plan).toMatchObject({ name: 'Test Hero', kind: 'character', ids: [hero.id, heroCopy.id], motionIds: [heroWave.id] });
    await lib.assign('project-a', 'self', heroCopy.id); await lib.assign('project-b', 'self', hero.id);
    // An assigned character: this project's target is reported so it falls back to the robot.
    expect(await deleteFromLibrary(lib, 'project-a', plan, false)).toEqual(['self']);
    expect((await lib.list()).map(row => row.id)).toEqual([heroWave.id, other.id]);
    expect(await lib.assignment('project-b', 'self')).toBeNull();
    await lib.put({ metadata: meta(5, 'motion', 'other · Run', 'other.glb'), data: glb() });
    await deleteFromLibrary(lib, 'project-a', deletePlan(await lib.list(), other.id)!, true);
    expect((await lib.list()).map(row => row.id)).toEqual([heroWave.id]);
  });
  it('built-in bodies have no Delete', async () => {
    const lib = await library();
    for (const id of ['builtin:robot', 'builtin:human', 'genvr.core.avatar.robot']) { expect(deletable(id)).toBe(false); expect(deletePlan(await lib.list(), id)).toBeNull(); }
    expect(deletable(hero.id)).toBe(true);
  });
  it('Cancel keeps everything', async () => {
    const lib = await library(), gate = new DeleteConfirmGate();
    await lib.assign('project-a', 'self', hero.id);
    const plan = deletePlan(await lib.list(), hero.id)!;
    const answer = gate.ask({ ...plan, usedBy: ['My avatar'], by: 'owner' });
    expect(gate.pending?.usedBy).toEqual(['My avatar']);
    gate.answer({ deleted: false, alsoMotions: false });
    expect(await answer).toEqual({ deleted: false, alsoMotions: false });
    expect(gate.pending).toBeNull();
    expect((await lib.list())).toHaveLength(4);
    expect(await lib.assignment('project-a', 'self')).toBe(hero.id);
  });
  it("an agent's delete waits for the owner and reports cancelled when nobody answers", async () => {
    vi.useFakeTimers();
    try {
      const gate = new DeleteConfirmGate(50000), plan = { name: 'Test Hero', kind: 'character' as const, ids: [hero.id], motionIds: [] };
      let settled = false;
      const waiting = gate.ask({ ...plan, usedBy: [], by: 'agent' }).then(answer => { settled = true; return answer; });
      await vi.advanceTimersByTimeAsync(49000);
      expect(settled).toBe(false);
      expect(gate.pending?.by).toBe('agent');
      await expect(gate.ask({ ...plan, usedBy: [], by: 'agent' })).rejects.toThrow('waiting for the owner');
      await vi.advanceTimersByTimeAsync(1000);
      expect(await waiting).toEqual({ deleted: false, alsoMotions: false });
      const owner = gate.ask({ ...plan, usedBy: [], by: 'agent' });
      gate.answer({ deleted: true, alsoMotions: false });
      expect(await owner).toEqual({ deleted: true, alsoMotions: false });
    } finally { vi.useRealTimers(); }
  });
});
