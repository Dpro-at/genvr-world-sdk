import type { PhysicsWorld } from '../physics.js';

/** Source nearest CDLOD lattice: 40 cells over eight metres. */
export const NATIVE_COLLISION_SIZE = 8;
export const NATIVE_COLLISION_CELLS = 40;
const STEP = NATIVE_COLLISION_SIZE / NATIVE_COLLISION_CELLS;
type Surface = { heightAt(x: number, z: number): number; half: number };
type Physics = Pick<PhysicsWorld, 'terrainChunkKeys' | 'setTerrainChunk' | 'removeTerrainChunk'>;

/** A triangle approximation of the source bilinear raster, with source checkerboard diagonals. */
export function nativeCollisionGeometry(surface: Pick<Surface, 'heightAt'>, cx: number, cz: number) {
  if (!Number.isSafeInteger(cx) || !Number.isSafeInteger(cz)) throw new RangeError('Invalid native chunk');
  const count = NATIVE_COLLISION_CELLS + 1;
  const positions = new Float32Array(count * count * 3);
  const indices = new Uint32Array(NATIVE_COLLISION_CELLS ** 2 * 6);
  for (let z = 0; z < count; z++)
    for (let x = 0; x < count; x++) {
      const wx = cx * NATIVE_COLLISION_SIZE + x * STEP;
      const wz = cz * NATIVE_COLLISION_SIZE + z * STEP;
      const height = surface.heightAt(wx, wz);
      if (!Number.isFinite(height)) throw new RangeError('Native collision height must be finite');
      positions.set([wx, height, wz], (z * count + x) * 3);
    }
  let cursor = 0;
  for (let z = 0; z < NATIVE_COLLISION_CELLS; z++)
    for (let x = 0; x < NATIVE_COLLISION_CELLS; x++) {
      const a = z * count + x,
        b = a + 1,
        c = a + count,
        d = c + 1;
      indices.set((x + z) % 2 === 0 ? [a, c, b, b, c, d] : [a, c, d, a, d, b], cursor);
      cursor += 6;
    }
  return { positions, indices };
}

/** Bounded near-player collision. Existing owner chunks remain dormant while this surface is active. */
export class NativeTerrainColliders {
  readonly #dirty = new Set<string>();
  constructor(
    private readonly surface: Surface,
    private readonly physics: Physics,
  ) {}

  markDirty(keys: Iterable<string>): void {
    // A native surface is immutable while active; this also safely handles broad refresh requests.
    for (const key of keys) if (key.startsWith('native:')) this.#dirty.add(key);
  }

  include(x: number, z: number): Set<string> {
    if (!Number.isFinite(x) || !Number.isFinite(z)) throw new RangeError('Invalid collision position');
    const cx = Math.floor(x / NATIVE_COLLISION_SIZE),
      cz = Math.floor(z / NATIVE_COLLISION_SIZE);
    const wanted = new Set<string>();
    const present = new Set(this.physics.terrainChunkKeys);
    for (let iz = cz - 2; iz <= cz + 2; iz++)
      for (let ix = cx - 2; ix <= cx + 2; ix++) {
        if (
          ix * NATIVE_COLLISION_SIZE >= this.surface.half ||
          (ix + 1) * NATIVE_COLLISION_SIZE <= -this.surface.half ||
          iz * NATIVE_COLLISION_SIZE >= this.surface.half ||
          (iz + 1) * NATIVE_COLLISION_SIZE <= -this.surface.half
        )
          continue;
        const key = `native:${ix},${iz}`;
        wanted.add(key);
        if (present.has(key) && !this.#dirty.has(key)) continue;
        const mesh = nativeCollisionGeometry(this.surface, ix, iz);
        this.physics.setTerrainChunk(key, mesh.positions, mesh.indices);
        this.#dirty.delete(key);
      }
    return wanted;
  }

  update(x: number, z: number): void {
    const wanted = this.include(x, z);
    for (const key of this.physics.terrainChunkKeys)
      if (!wanted.has(key)) this.physics.removeTerrainChunk(key);
  }
}
