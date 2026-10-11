import { type VoxelData } from '../world/index.js';
import type { PhysicsWorld } from './physics.js';
/**
 * Colliders of block ground (P2-26) for the chunks around the player (3 x 3): Rapier's voxel shape
 * from every solid block that touches an open one (blocks deep inside the ground never collide).
 */
export declare class VoxelColliders {
    #private;
    private readonly voxels;
    private readonly physics;
    private readonly radiusChunks;
    constructor(voxels: VoxelData, physics: PhysicsWorld, radiusChunks?: number);
    markDirty(keys: Iterable<string>): void;
    update(x: number, z: number): void;
    /** Adds colliders around a point without removing others; the next `update` drops them again. */
    include(x: number, z: number): Set<string>;
}
