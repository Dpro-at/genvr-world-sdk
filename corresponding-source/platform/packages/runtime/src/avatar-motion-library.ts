import type { AnimationClip, Object3D, SkinnedMesh } from 'three/webgpu';
import type { AvatarBody } from '@genvr/core-library';
import { fixedClip, type GenvrAvatar } from './avatar.js';
import { retargetAvatarMotion } from './avatar-motion.js';
import { bakedAnimation, type BakedMotion } from './avatar-motion-bake.js';

export interface AvatarMotionEntry {
  id: string;
  name: string;
  category: string;
  loop: boolean;
  /** The host supplies private, self-contained motion-only GLB data (retargeted when played)… */
  load?(): Promise<ArrayBuffer>;
  /** …or a motion already in our own keys (`bakeMotion`), played through our clip pipeline on every body. */
  motion?(): Promise<BakedMotion>;
}
export interface AvatarMotionLibrary {
  entries: readonly AvatarMotionEntry[];
  /** Native clip names mapped to library IDs; omitting a name keeps its original clip. */
  replacements?: Readonly<Record<string, string>>;
  onError?(id: string, error: unknown): void;
}
let active: AvatarMotionLibrary | null = null;
let revision = 0;
const layers: AvatarMotionLibrary[] = [];
const listeners = new Set<() => void>();
const buffers = new Map<string, Promise<ArrayBuffer>>();
const baked = new Map<string, Promise<BakedMotion>>();
export const avatarMotionLibraryRevision = () => revision;
export const subscribeAvatarMotionLibrary = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
/** Installs a host-owned catalog for every compatible avatar; disposing restores native clips. */
export function registerAvatarMotionLibrary(library: AvatarMotionLibrary): () => void {
  const ids = new Set<string>();
  for (const entry of library.entries) {
    if (!/^motion:[A-Za-z0-9_-]{1,100}$/.test(entry.id) || ids.has(entry.id)) throw new Error('Invalid or duplicate motion ID.');
    ids.add(entry.id);
  }
  for (const id of Object.values(library.replacements ?? {})) if (!ids.has(id)) throw new Error('Replacement motion is missing from the catalog.');

  for (const entry of library.entries) if (!entry.load && !entry.motion) throw new Error(`Motion ${entry.id} has no data.`);
  const set = (next: AvatarMotionLibrary | null) => { active = next; buffers.clear(); baked.clear(); revision++; for (const listener of listeners) listener(); };
  layers.push(library); set(library);
  return () => { const index = layers.lastIndexOf(library); if (index < 0) return; layers.splice(index, 1); if (active === library) set(layers.at(-1) ?? null); };
}
export function avatarMotionEntry(name: string): AvatarMotionEntry | undefined {
  const id = active?.replacements?.[name] ?? name;
  return active?.entries.find(entry => entry.id === id);
}
export async function resolveAvatarLibraryMotion(root: Object3D, name: string): Promise<{ clip: AnimationClip; loop: boolean } | null> {
  const library = active, entry = avatarMotionEntry(name);
  if (!library || !entry) return null;
  let mesh: SkinnedMesh | undefined;
  root.traverse(node => { if ((node as SkinnedMesh).isSkinnedMesh && node.name === 'avatar-body') mesh = node as SkinnedMesh; });
  const body = mesh?.userData.fittedBody?.id as GenvrAvatar['body'] | undefined;
  if (!body) return null;
  const target = root.name === 'avatar-body' && root.parent?.name === 'avatar-pose' ? root.parent.parent ?? root : root;
  try {
    if (entry.motion) {
      let motion = baked.get(entry.id);
      if (!motion) { motion = entry.motion(); baked.set(entry.id, motion); }
      const fitted = mesh!.userData.fittedBody as AvatarBody;
      return { clip: fixedClip(bakedAnimation(await motion, name), fitted), loop: entry.loop };
    }
    let pending = buffers.get(entry.id);
    if (!pending) { pending = entry.load!(); buffers.set(entry.id, pending); }
    const clip = await retargetAvatarMotion(await pending, { root: target, body }, name);
    return { clip, loop: entry.loop };
  } catch (error) { library.onError?.(entry.id, error); return null; }
}

export function avatarMotionEntries(): readonly AvatarMotionEntry[] { return active?.entries ?? []; }
