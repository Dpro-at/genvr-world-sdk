import { WorldSession } from './session.js';
/** Browser storage injected so importing the SDK never accesses globals or credentials. */
export function browserStorage(storage, prefix = 'genvr.world.') {
    return { read: async (id) => storage.getItem(prefix + id), write: async (id, data) => { storage.setItem(prefix + id, data); } };
}
export async function saveWorld(session, storage) { await storage.write(session.export().id, session.serialize()); }
export async function openWorld(id, storage, onEvent) {
    const data = await storage.read(id);
    if (!data)
        throw new Error('Saved world not found.');
    return new WorldSession(data, onEvent);
}
//# sourceMappingURL=storage.js.map