import type { Asset } from './model';

/** Saved as it was written: a version 2 film, or an older version 1 project with its next-recording plan. */
export interface StoredProject { project: unknown; assets: Asset[]; plan?: unknown }

async function open(): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((ok, fail) => {
    const request = indexedDB.open('genvr-video-studio', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('projects');
    request.onsuccess = () => ok(request.result); request.onerror = () => fail(request.error);
  });
}

/** One atomic record keeps media and the film together; quota failure never discards memory. */
export async function storage(key: string, value?: StoredProject): Promise<StoredProject | undefined> {
  const db = await open();
  try {
    return await new Promise((ok, fail) => {
      const tx = db.transaction('projects', value ? 'readwrite' : 'readonly');
      const store = tx.objectStore('projects');
      const request = value ? store.put(value, key) : store.get(key);
      tx.oncomplete = () => ok(value ?? request.result);
      tx.onerror = () => fail(tx.error); tx.onabort = () => fail(tx.error ?? new Error('Storage cancelled.'));
    });
  } finally { db.close(); }
}

/** Keeps the old record under its own key before the first version 2 save replaces it. */
export async function backupOnce(key: string, value: StoredProject): Promise<void> {
  const backupKey = `${key}:v1-backup`;
  if (!await storage(backupKey)) await storage(backupKey, value);
}
