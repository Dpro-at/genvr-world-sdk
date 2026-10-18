import { AvatarLook, DEFAULT_AVATAR_LOOK, GenvrManifest } from '@genvr/contracts';
import { bodyFromItem } from '@genvr/core-library';
import { createGenvrAvatar, preloadAvatarLook, registerLocalAvatarBody } from '@genvr/runtime';
import type { UserAvatarStorage } from '../src/user-avatar-library';

/** Leases local model URLs for one Studio lifetime. Nothing is added to a world export. */
export class UserAvatarSession {
  #bodies = new Map<string, { look: AvatarLook; release(): void }>();
  #disposed = false;
  constructor(readonly storage: UserAvatarStorage) {}
  async look(id: string): Promise<AvatarLook> {
    const known = this.#bodies.get(id); if (known) return known.look;
    const asset = await this.storage.get(id);
    if (this.#disposed) throw new Error('Avatar library closed.');
    if (!asset || asset.metadata.kind !== 'character' || !asset.metadata.joints || !asset.metadata.height) throw new Error('Character is missing from your local library.');
    const url = URL.createObjectURL(new Blob([asset.data], { type: 'model/gltf-binary' }));
    const metadata = asset.metadata;
    const manifest = GenvrManifest.parse({ schemaVersion: 1, id, name: metadata.name.slice(0, 80), version: '1.0.0', type: 'avatar', category: 'avatar-appearance', subcategory: 'bodies', styles: ['blocky', 'realistic', 'anime', 'voxel'], author: { id: 'local-user', name: 'User import' }, source: 'user', license: 'Mixamo terms; user project use; not bundled', price: { type: 'free' }, entry: { model: 'character.glb' }, budget: { triangles: 0, textureMB: 0, mobileReady: false }, trainingConsent: false, body: { model: 'character.glb', height: metadata.height, use: 'place', joints: metadata.joints } });
    const body = bodyFromItem(manifest, { model: url });
    if (!body) { URL.revokeObjectURL(url); throw new Error('The imported character rig is unsupported.'); }
    const unregister = registerLocalAvatarBody(body);
    const look = AvatarLook.parse({ ...DEFAULT_AVATAR_LOOK, body: id, wear: [], scale: { height: 1, width: 1, head: 1 } });
    const release = () => { unregister(); URL.revokeObjectURL(url); };
    try {
      await preloadAvatarLook(look);
      if (this.#disposed) throw new Error('Avatar library closed.');
      const check = createGenvrAvatar(look);
      const loaded = check.body === id; check.dispose();
      if (!loaded) throw new Error('The imported model could not be loaded.');
      this.#bodies.set(id, { look, release }); return look;
    } catch (error) { release(); throw error; }
  }
  /** Call after the viewport and its avatars are disposed. */
  dispose() { this.#disposed = true; for (const row of this.#bodies.values()) row.release(); this.#bodies.clear(); }
}
