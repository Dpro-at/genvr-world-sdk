import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, it } from 'vitest';
import { Block, VoxelData, VOXEL_MIN_Y, VOXEL_WATER_LEVEL } from '@genvr/world';
import { initPhysics, PhysicsWorld } from '../src/physics.js';
import { faceLayer, meshVoxelChunk, WATER_TOP_DROP } from '../src/voxel-mesh.js';
import { VoxelColliders } from '../src/voxel-physics.js';

const ground = () => new VoxelData(250, { seed: 1234, generator: 1 });

describe('voxel meshing', () => {
  it('draws only open faces, merged, with grass on top', () => {
    const voxels = ground();
    const { solid } = meshVoxelChunk(voxels, 0, 0);
    const triangles = solid.indices.length / 3;
    // Rolling hills: far fewer triangles than one quad per visible block face.
    expect(triangles).toBeGreaterThan(200);
    expect(triangles).toBeLessThan(12_000);
    // Every position lies inside the chunk (x and z 0..32).
    for (let i = 0; i < solid.positions.length; i += 3) {
      expect(solid.positions[i]).toBeGreaterThanOrEqual(0);
      expect(solid.positions[i]).toBeLessThanOrEqual(32);
      expect(solid.positions[i + 2]).toBeGreaterThanOrEqual(0);
      expect(solid.positions[i + 2]).toBeLessThanOrEqual(32);
    }
    // The top face over (3, 5) is grass at the ground height.
    const height = voxels.surfaceHeight(3, 5);
    let found = false;
    for (let v = 0; v < solid.layers.length; v += 1) {
      if (solid.normals[v * 3 + 1] !== 1) continue;
      if (solid.positions[v * 3 + 1] !== height) continue;
      if (solid.layers[v] === faceLayer(Block[voxels.topBlock(3, 5)], 'top')) found = true;
    }
    expect(found).toBe(true);
  });

  it('draws the lake as a see-through surface just under the water level', () => {
    const voxels = ground();
    const { cx, cz } = voxels.chunkAt(0, 44);
    const { water } = meshVoxelChunk(voxels, cx, cz);
    expect(water.indices.length).toBeGreaterThan(0);
    const tops = new Set<number>();
    for (let v = 0; v < water.normals.length / 3; v += 1)
      if (water.normals[v * 3 + 1] === 1) tops.add(water.positions[v * 3 + 1]!);
    expect([...tops]).toEqual([VOXEL_WATER_LEVEL - WATER_TOP_DROP]);
  });

  it('draws far chunks from 2 x 2 x 2 cells: fewer triangles, never lower, edges closed', () => {
    const voxels = ground();
    let [full, far] = [0, 0];
    for (const [cx, cz] of [
      [0, 0],
      [1, 1],
      [2, 4],
    ] as const) {
      full += meshVoxelChunk(voxels, cx, cz).solid.indices.length;
      const { solid } = meshVoxelChunk(voxels, cx, cz, 2);
      far += solid.indices.length;
      // Every corner sits on even blocks, the same in every far chunk.
      for (let i = 0; i < solid.positions.length; i += 1)
        expect(Math.abs((solid.positions[i]! - (i % 3 === 1 ? VOXEL_MIN_Y : 0)) % 2)).toBe(0);
    }
    expect(far).toBeLessThan(full * 0.6);

    // Over every column the far ground is at least as high as the real ground, so no gap opens
    // toward a chunk drawn in full detail.
    const { solid } = meshVoxelChunk(voxels, 1, 1, 2);
    const tops: Array<{ x0: number; x1: number; z0: number; z1: number; y: number }> = [];
    for (let q = 0; q < solid.positions.length / 12; q += 1) {
      if (solid.normals[q * 12 + 1] !== 1) continue;
      const xs = [0, 1, 2, 3].map((k) => solid.positions[q * 12 + k * 3]!);
      const zs = [0, 1, 2, 3].map((k) => solid.positions[q * 12 + k * 3 + 2]!);
      tops.push({
        x0: Math.min(...xs),
        x1: Math.max(...xs),
        z0: Math.min(...zs),
        z1: Math.max(...zs),
        y: solid.positions[q * 12 + 1]!,
      });
    }
    for (let z = 32; z < 64; z += 1)
      for (let x = 32; x < 64; x += 1) {
        const over = tops.filter((t) => x + 0.5 > t.x0 && x + 0.5 < t.x1 && z + 0.5 > t.z0 && z + 0.5 < t.z1);
        expect(Math.max(...over.map((t) => t.y))).toBeGreaterThanOrEqual(voxels.surfaceHeight(x, z));
      }
    // Walls down the chunk's edges (facing out) close gaps to neighbors drawn in full detail.
    let edge = 0;
    for (let v = 0; v < solid.normals.length / 3; v += 1)
      if (solid.normals[v * 3] === -1 && solid.positions[v * 3] === 32) edge += 1;
    expect(edge).toBeGreaterThan(0);

    // Far lakes keep their water at the water level.
    const lake = voxels.chunkAt(0, 44);
    const { water } = meshVoxelChunk(voxels, lake.cx, lake.cz, 2);
    const levels = new Set<number>();
    for (let v = 0; v < water.normals.length / 3; v += 1)
      if (water.normals[v * 3 + 1] === 1) levels.add(water.positions[v * 3 + 1]!);
    expect([...levels]).toEqual([VOXEL_WATER_LEVEL - WATER_TOP_DROP]);
  });

  it('meshes a chunk quickly enough to stream while walking', () => {
    const voxels = ground();
    meshVoxelChunk(voxels, 1, 1);
    const started = performance.now();
    for (let cz = 3; cz < 6; cz += 1) meshVoxelChunk(voxels, 2, cz); // mountains
    const perChunk = (performance.now() - started) / 3;
    expect(perChunk).toBeLessThan(120);
  });
});

describe('voxel colliders', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  it('stands the ground at the top face of the blocks', () => {
    const voxels = ground();
    const physics = new PhysicsWorld();
    new VoxelColliders(voxels, physics).update(0, 0);
    physics.world.step();
    for (const [x, z] of [
      [0.5, 0.5],
      [7.5, -3.5],
      [-12.5, 9.5],
    ] as const) {
      const hit = physics.world.castRay(new RAPIER.Ray({ x, y: 80, z }, { x: 0, y: -1, z: 0 }), 200, true);
      expect(hit, `${x}, ${z}`).not.toBeNull();
      expect(80 - hit!.timeOfImpact).toBeCloseTo(voxels.surfaceHeight(x, z), 3);
    }
  });

  it('lets a character stand on the blocks', () => {
    const voxels = ground();
    const physics = new PhysicsWorld();
    new VoxelColliders(voxels, physics).update(0, 0);
    const top = voxels.surfaceHeight(0.5, 0.5);
    const character = physics.createCharacter({ x: 0.5, y: top + 2, z: 0.5 });
    for (let i = 0; i < 90; i += 1) {
      character.move({ x: 0, z: 0 }, false, 5, 20, 1 / 60);
      physics.world.step();
    }
    expect(character.feet.y).toBeCloseTo(top, 1);
  });
});
