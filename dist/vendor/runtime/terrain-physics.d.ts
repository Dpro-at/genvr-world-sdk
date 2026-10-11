import type { PhysicsWorld } from './physics.js';
import { type TerrainData } from '../world/index.js';
/**
 * Keeps full-detail terrain colliders for the chunks around the player (3 x 3), rebuilding
 * them when sculpted. Far chunks need no colliders.
 */
export declare class TerrainColliders {
    #private;
    private readonly terrain;
    private readonly physics;
    private readonly radiusChunks;
    constructor(terrain: TerrainData, physics: PhysicsWorld, radiusChunks?: number);
    markDirty(keys: Iterable<string>): void;
    update(x: number, z: number): void;
    /**
     * Adds colliders for the chunks around a point without removing others (items settling far
     * from the player, P2-11); the next `update` drops them again. Returns the chunks it covers.
     */
    include(x: number, z: number): Set<string>;
}
