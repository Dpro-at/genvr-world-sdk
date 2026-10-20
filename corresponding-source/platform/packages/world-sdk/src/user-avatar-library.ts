import { z } from 'zod';

export const USER_AVATAR_BYTES = 64 * 1024 * 1024;
export const UserAvatarMetadata = z.object({
  id: z.string().regex(/^user\.mixamo\.[a-f0-9]{64}\.(character|motion)$/),
  kind: z.enum(['character', 'motion']),
  name: z.string().min(1).max(150),
  originalFile: z.string().min(1).max(300),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  importedAt: z.string().datetime(),
  source: z.literal('user-import'),
  provider: z.literal('mixamo'),
  sourcePage: z.literal('https://www.mixamo.com/'),
  bundled: z.literal(false),
  thumbnail: z.string().max(150000).regex(/^data:image\/webp;base64,[A-Za-z0-9+/=]+$/).optional(),
  height: z.number().min(.3).max(4).optional(),
  joints: z.array(z.object({ name: z.string().min(1).max(64), parent: z.string().nullable(), at: z.tuple([z.number(), z.number(), z.number()]) })).max(128).optional(),
  duration: z.number().positive().max(120).optional(),
  /** Set when the import turned A-pose arms out to the T-pose the native clips start from. */
  restPose: z.literal('t-from-a').optional(),
}).strict();
export type UserAvatarMetadata = z.infer<typeof UserAvatarMetadata>;
export interface UserAvatarAsset { metadata: UserAvatarMetadata; data: ArrayBuffer; }
export interface UserAvatarStorage {
  list(): Promise<UserAvatarMetadata[]>;
  get(id: string): Promise<UserAvatarAsset | null>;
  put(asset: UserAvatarAsset): Promise<void>;
  remove(id: string): Promise<void>;
  assignment(projectId: string, target: string): Promise<string | null>;
  assign(projectId: string, target: string, assetId: string | null): Promise<void>;
  subscribe?(listener: () => void): () => void;
  close(): void;
}

/** User files stay in a separate database and never enter world snapshots or package assets. */
export function browserUserAvatarStorage(scope: string, factory: IDBFactory = indexedDB): UserAvatarStorage {
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(scope)) throw new Error('Invalid user library scope.');
  let opening: Promise<IDBDatabase> | null = null;
  const listeners = new Set<() => void>();
  const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(`genvr-user-avatars-v1:${scope}`);
  const publish = () => { for (const listener of listeners) listener(); };
  if (channel) channel.onmessage = () => publish();
  const open = () => opening ??= new Promise((resolve, reject) => {
    const request = factory.open(`genvr-user-avatars-v1:${scope}`, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('assets', { keyPath: 'metadata.id' });
      request.result.createObjectStore('metadata', { keyPath: 'id' });
      request.result.createObjectStore('assignments');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { opening = null; reject(request.error); };
    request.onblocked = () => { opening = null; reject(new Error('Close another tab using this avatar library.')); };
  });
  const run = async <T>(store: string, mode: IDBTransactionMode, task: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
    const db = await open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(store, mode), request = task(transaction.objectStore(store));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = transaction.onerror = () => reject(transaction.error ?? request.error ?? new Error('User library storage failed.'));
    });
  };
  const key = (project: string, target: string) => JSON.stringify([project, target]);
  const changeAsset = async (id: string, asset?: UserAvatarAsset) => {
    const db = await open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['assets', 'metadata'], 'readwrite');
      if (asset) { tx.objectStore('assets').put(asset); tx.objectStore('metadata').put(asset.metadata); }
      else { tx.objectStore('assets').delete(id); tx.objectStore('metadata').delete(id); }
      tx.oncomplete = () => resolve(); tx.onerror = tx.onabort = () => reject(tx.error ?? new Error('Library write failed.'));
    });
    publish(); channel?.postMessage('changed');
  };
  return {
    async list() { return (await run<unknown[]>('metadata', 'readonly', store => store.getAll())).map(row => UserAvatarMetadata.parse(row)).sort((a, b) => a.name.localeCompare(b.name)); },
    async get(id) { const row = await run<UserAvatarAsset | undefined>('assets', 'readonly', store => store.get(id)); return row ? { ...row, metadata: UserAvatarMetadata.parse(row.metadata) } : null; },
    async put(asset) {
      const metadata = UserAvatarMetadata.parse(asset.metadata);
      if (!(asset.data instanceof ArrayBuffer) || asset.data.byteLength < 24 || asset.data.byteLength > USER_AVATAR_BYTES || new DataView(asset.data).getUint32(0, true) !== 0x46546c67) throw new Error('Invalid local avatar GLB.');
      await changeAsset(metadata.id, { metadata, data: asset.data });
    },
    async remove(id) { await changeAsset(id); },
    async assignment(project, target) { return await run<string | undefined>('assignments', 'readonly', store => store.get(key(project, target))) ?? null; },
    async assign(project, target, id) {
      if (id) { const asset = await run<UserAvatarAsset | undefined>('assets', 'readonly', store => store.get(id)); if (asset?.metadata.kind !== 'character') throw new Error('Choose a character from your library.'); }
      if (id) await run('assignments', 'readwrite', store => store.put(id, key(project, target)));
      else await run('assignments', 'readwrite', store => store.delete(key(project, target)));
    },
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    close() { channel?.close(); listeners.clear(); void opening?.then(db => db.close()); opening = null; },
  };
}

export async function avatarDigest(bytes: ArrayBuffer): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), value => value.toString(16).padStart(2, '0')).join('');
}
