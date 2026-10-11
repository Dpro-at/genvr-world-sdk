import { describe, expect, it } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { initPhysics, PhysicsWorld } from '../src/physics.js';
import { NativeTerrainColliders, nativeCollisionGeometry } from '../src/terrain-native/colliders.js';

describe('native field collision', () => {
  it('shares edge vertices across negative and positive chunks and source checkerboard winding', () => {
    const surface = { heightAt: (x: number, z: number) => x * 0.5 + z * 0.25 };
    const left = nativeCollisionGeometry(surface, -1, 0),
      right = nativeCollisionGeometry(surface, 0, 0);
    expect(left.positions.length).toBe(41 * 41 * 3);
    expect(left.indices.length).toBe(40 * 40 * 6);
    for (let row = 0; row < 41; row++)
      expect(left.positions.slice((row * 41 + 40) * 3, (row * 41 + 41) * 3)).toEqual(
        right.positions.slice(row * 41 * 3, row * 41 * 3 + 3),
      );
    expect(Array.from(right.indices.slice(0, 12))).toEqual([0, 41, 1, 1, 41, 42, 1, 42, 43, 1, 43, 2]);
    expect(() => nativeCollisionGeometry({ heightAt: () => NaN }, 0, 0)).toThrow('finite');
  });
  it('streams a bounded near ring, reuses unchanged chunks and evicts distant ones', () => {
    const meshes = new Map<string, boolean>();
    let builds = 0;
    const physics = {
      get terrainChunkKeys() {
        return [...meshes.keys()];
      },
      setTerrainChunk(key: string) {
        meshes.set(key, true);
        builds++;
      },
      removeTerrainChunk(key: string) {
        meshes.delete(key);
      },
    };
    const colliders = new NativeTerrainColliders({ heightAt: () => 20, half: 1000 }, physics);
    colliders.update(0, 0);
    expect(meshes.size).toBe(25);
    colliders.update(1, 1);
    expect(builds).toBe(25);
    colliders.update(8, 0);
    expect(builds).toBe(30);
    expect(meshes.size).toBe(25);
    expect(meshes.has('native:-2,0')).toBe(false);
    colliders.include(400, 400);
    expect(meshes.size).toBe(50);
    colliders.update(8, 0);
    expect(meshes.size).toBe(25);
  });
  it('Rapier ray hits follow the native mesh within the bilinear triangle approximation', async () => {
    await initPhysics();
    const physics = new PhysicsWorld();
    // A bilinear saddle has a bounded .01m error on a .2m triangle lattice.
    const surface = { heightAt: (x: number, z: number) => 20 + x * z };
    const mesh = nativeCollisionGeometry(surface, 0, 0);
    physics.setTerrainChunk('native:0,0', mesh.positions, mesh.indices);
    physics.world.step();
    for (const [x, z] of [
      [0.1, 0.1],
      [0.3, 0.1],
      [1.37, 3.29],
      [7.91, 7.93],
    ]) {
      const hit = physics.world.castRay(
        new RAPIER.Ray({ x: x!, y: 200, z: z! }, { x: 0, y: -1, z: 0 }),
        400,
        true,
      );
      expect(hit).not.toBeNull();
      expect(Math.abs(200 - hit!.timeOfImpact - surface.heightAt(x!, z!))).toBeLessThanOrEqual(0.01002);
    }
    physics.dispose();
  });
});
