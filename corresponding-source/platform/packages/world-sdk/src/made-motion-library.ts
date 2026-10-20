import { MadeMotionEntry } from '@genvr/contracts';

/**
 * My motions made in the Lab (board M19): every saved version of a made motion, private on this device, in its own
 * database beside the imported characters and motions. Projects copy the keys of the ones they use, so a project
 * plays without this store and without the lab project.
 */
export interface MadeMotionStorage {
  list(): Promise<MadeMotionEntry[]>;
  put(entry: MadeMotionEntry): Promise<void>;
  subscribe?(listener: () => void): () => void;
}

export function browserMadeMotionStorage(scope: string, factory: IDBFactory = indexedDB): MadeMotionStorage {
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(scope)) throw new Error('Invalid made motion library scope.');
  const name = `genvr-made-motions-v1:${scope}`;
  let opening: Promise<IDBDatabase> | null = null;
  const listeners = new Set<() => void>();
  const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(name);
  const publish = () => { for (const listener of listeners) listener(); };
  if (channel) channel.onmessage = () => publish();
  const open = () => opening ??= new Promise((resolve, reject) => {
    const request = factory.open(name, 1);
    request.onupgradeneeded = () => { request.result.createObjectStore('motions', { keyPath: 'id' }); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { opening = null; reject(request.error); };
  });
  const run = async <T>(mode: IDBTransactionMode, task: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('motions', mode), request = task(tx.objectStore('motions'));
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = tx.onerror = () => reject(tx.error ?? request.error ?? new Error('My motions storage failed.'));
    });
  };
  return {
    async list() { return (await run<unknown[]>('readonly', store => store.getAll())).flatMap(row => { const parsed = MadeMotionEntry.safeParse(row); return parsed.success ? [parsed.data] : []; }); },
    async put(entry) { const checked = MadeMotionEntry.parse(entry); await run('readwrite', store => store.put(checked)); publish(); channel?.postMessage('changed'); },
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
}
