import type { PhysicsWorld } from './physics.js';
import { chunkGeometryArrays, chunkKey, type TerrainData } from '@genvr/world';

/**
 * Keeps full-detail terrain colliders for the chunks around the player (3 x 3), rebuilding
 * them when sculpted. Far chunks need no colliders.
 */
export class TerrainColliders {
  readonly #dirty = new Set<string>();

  constructor(
    private readonly terrain: TerrainData,
    private readonly physics: PhysicsWorld,
    private readonly radiusChunks = 1,
  ) {}

  markDirty(keys: Iterable<string>): void {
    for (const key of keys) this.#dirty.add(key);
  }

  update(x: number, z: number): void {
    const wanted = this.include(x, z);
    for (const key of this.physics.terrainChunkKeys)
      if (!wanted.has(key)) this.physics.removeTerrainChunk(key);
    this.#dirty.clear();
  }

  /**
   * Adds colliders for the chunks around a point without removing others (items settling far
   * from the player, P2-11); the next `update` drops them again. Returns the chunks it covers.
   */
  include(x: number, z: number): Set<string> {
    const { cx: pcx, cz: pcz } = this.terrain.chunkAt(x, z);
    const { min, max } = this.terrain.chunkRange;
    const wanted = new Set<string>();
    for (let cz = pcz - this.radiusChunks; cz <= pcz + this.radiusChunks; cz += 1) {
      for (let cx = pcx - this.radiusChunks; cx <= pcx + this.radiusChunks; cx += 1) {
        if (cx < min || cx > max || cz < min || cz > max) continue;
        const key = chunkKey(cx, cz);
        wanted.add(key);
        if (this.physics.terrainChunkKeys.includes(key) && !this.#dirty.has(key)) continue;
        const { positions, indices } = chunkGeometryArrays(this.terrain, this.terrain.getChunk(cx, cz), 1);
        this.physics.setTerrainChunk(key, positions, indices);
      }
    }
    return wanted;
  }
}
