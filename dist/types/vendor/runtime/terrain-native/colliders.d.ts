import type { PhysicsWorld } from '../physics.js';
/** Source nearest CDLOD lattice: 40 cells over eight metres. */
export declare const NATIVE_COLLISION_SIZE = 8;
export declare const NATIVE_COLLISION_CELLS = 40;
type Surface = {
    heightAt(x: number, z: number): number;
    half: number;
};
type Physics = Pick<PhysicsWorld, 'terrainChunkKeys' | 'setTerrainChunk' | 'removeTerrainChunk'>;
/** A triangle approximation of the source bilinear raster, with source checkerboard diagonals. */
export declare function nativeCollisionGeometry(surface: Pick<Surface, 'heightAt'>, cx: number, cz: number): {
    positions: Float32Array<ArrayBuffer>;
    indices: Uint32Array<ArrayBuffer>;
};
/** Bounded near-player collision. Existing owner chunks remain dormant while this surface is active. */
export declare class NativeTerrainColliders {
    #private;
    private readonly surface;
    private readonly physics;
    constructor(surface: Surface, physics: Physics);
    markDirty(keys: Iterable<string>): void;
    include(x: number, z: number): Set<string>;
    update(x: number, z: number): void;
}
export {};
