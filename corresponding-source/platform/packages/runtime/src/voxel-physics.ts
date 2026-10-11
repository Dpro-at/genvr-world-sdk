import RAPIER from '@dimforge/rapier3d-compat';
import { isSolidBlock, VOXEL_CHUNK, type VoxelData } from '@genvr/world';
import type { PhysicsWorld } from './physics.js';

/**
 * Colliders of block ground (P2-26) for the chunks around the player (3 x 3): Rapier's voxel shape
 * from every solid block that touches an open one (blocks deep inside the ground never collide).
 */
export class VoxelColliders {
  readonly #colliders = new Map<string, RAPIER.Collider>();
  readonly #dirty = new Set<string>();

  constructor(
    private readonly voxels: VoxelData,
    private readonly physics: PhysicsWorld,
    private readonly radiusChunks = 1,
  ) {}

  markDirty(keys: Iterable<string>): void {
    for (const key of keys) this.#dirty.add(key);
  }

  update(x: number, z: number): void {
    const wanted = this.include(x, z);
    for (const key of [...this.#colliders.keys()]) if (!wanted.has(key)) this.#remove(key);
    this.#dirty.clear();
  }

  /** Adds colliders around a point without removing others; the next `update` drops them again. */
  include(x: number, z: number): Set<string> {
    const { cx: pcx, cz: pcz } = this.voxels.chunkAt(x, z);
    const { min, max } = this.voxels.chunkRange;
    const wanted = new Set<string>();
    for (let cz = pcz - this.radiusChunks; cz <= pcz + this.radiusChunks; cz += 1)
      for (let cx = pcx - this.radiusChunks; cx <= pcx + this.radiusChunks; cx += 1) {
        if (cx < min || cx > max || cz < min || cz > max) continue;
        const key = `${cx},${cz}`;
        wanted.add(key);
        if (this.#colliders.has(key) && !this.#dirty.has(key)) continue;
        this.#remove(key);
        const collider = this.#build(cx, cz);
        if (collider) this.#colliders.set(key, collider);
      }
    return wanted;
  }

  #build(cx: number, cz: number): RAPIER.Collider | null {
    const x0 = cx * VOXEL_CHUNK;
    const z0 = cz * VOXEL_CHUNK;
    const cells: number[] = [];
    // Dug tunnels (P2-26) need their floors and walls below the ground's top.
    let tunnels = Infinity;
    for (let dz = -1; dz <= 1; dz += 1)
      for (let dx = -1; dx <= 1; dx += 1)
        tunnels = Math.min(tunnels, this.voxels.editedLow(cx + dx, cz + dz) ?? Infinity);
    for (let lz = 0; lz < VOXEL_CHUNK; lz += 1)
      for (let lx = 0; lx < VOXEL_CHUNK; lx += 1) {
        const x = x0 + lx;
        const z = z0 + lz;
        if (!this.voxels.inside(x, z)) continue;
        // Up to the highest block (walls too; their openings are air and left out below).
        const top = this.voxels.columnTop(x, z) - 1;
        // Down to the lowest open neighbor, so cliff sides are solid too.
        let bottom = top;
        for (const [nx, nz] of [
          [x - 1, z],
          [x + 1, z],
          [x, z - 1],
          [x, z + 1],
        ] as const)
          if (this.voxels.inside(nx, nz)) bottom = Math.min(bottom, this.voxels.floorHeight(nx, nz) - 1);
        for (let y = Math.min(bottom, tunnels) - 1; y <= top; y += 1)
          if (isSolidBlock(this.voxels.block(x, y, z))) cells.push(lx, y, lz);
      }
    if (cells.length === 0) return null;
    return this.physics.world.createCollider(
      RAPIER.ColliderDesc.voxels(new Int32Array(cells), { x: 1, y: 1, z: 1 }).setTranslation(x0, 0, z0),
    );
  }

  #remove(key: string): void {
    const collider = this.#colliders.get(key);
    if (!collider) return;
    this.physics.world.removeCollider(collider, false);
    this.#colliders.delete(key);
  }
}
