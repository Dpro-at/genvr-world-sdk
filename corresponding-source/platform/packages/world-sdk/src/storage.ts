import { WorldSession, type WorldEvent } from './session.js';
export interface WorldStorage { read(id: string): Promise<string | null>; write(id: string, data: string): Promise<void>; }
/** Browser storage injected so importing the SDK never accesses globals or credentials. */
export function browserStorage(storage: Pick<Storage, 'getItem' | 'setItem'>, prefix = 'genvr.world.'): WorldStorage {
  return { read: async id => storage.getItem(prefix + id), write: async (id, data) => { storage.setItem(prefix + id, data); } };
}
export async function saveWorld(session: WorldSession, storage: WorldStorage): Promise<void> { await storage.write(session.export().id, session.serialize()); }
export async function openWorld(id: string, storage: WorldStorage, onEvent?: (event: WorldEvent) => void): Promise<WorldSession> {
  const data = await storage.read(id); if (!data) throw new Error('Saved world not found.');
  return new WorldSession(data, onEvent);
}
