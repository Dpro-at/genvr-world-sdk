import { TerrainFieldDescriptor, WorldDocument, type ItemInstance } from '@genvr/contracts';
import { getCoreItem, itemGeneratedLook, restRule } from '@genvr/core-library';
import { SurfaceIndex, rest } from '@genvr/validator';
import {
  createWorldState,
  encodeTerrainFieldTile,
  terrainFieldFloat32Bytes,
  type TerrainData,
} from '@genvr/world';
import { PerspectiveCamera, Quaternion, Vector3 } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { buildStarfish, starfishParams } from '../src/sealife/index.js';
import {
  NATIVE_COLLISION_CELLS,
  NATIVE_COLLISION_SIZE,
  nativeCollisionGeometry,
} from '../src/terrain-native/colliders.js';
import { TerrainLod } from '../src/terrain-lod/index.js';

/**
 * Ground contact of thin ground-hugging items (GROUND-01, Tidewater island beach): the ground an item rests on
 * (`TerrainData.heightAt`, which the rest law, MCP placement and `terrainHeightAt` use) must be the ground that is
 * drawn near the camera and the ground players collide with, and a thin item's own rest rule must not bury it.
 */

const ORIGIN = [100, -80] as const;
const SIZE = 64;
const SEA = 20;

/** A beach like the island's east shore (x 146-160, z -56..-51): about 3 % slope with a gentle undulation. */
const beach = (x: number, z: number) =>
  0.05 +
  0.03 * (x - ORIGIN[0]) * 0.1 +
  0.012 * Math.sin(x * 0.7) * Math.cos(z * 0.55) +
  0.01 * (z - ORIGIN[1]) * 0.1;

function beachState() {
  const descriptor = TerrainFieldDescriptor.parse({
    schemaVersion: 1,
    id: 'beach',
    origin: [...ORIGIN],
    spacing: 1,
    width: SIZE,
    height: SIZE,
    sampling: 'cell-center',
    heightBinding: { channel: 'height', offset: SEA },
    channels: [
      { id: 'height', encoding: 'f32le', range: [-100, 400] },
      { id: 'sand', encoding: 'u8' },
    ],
  });
  const heights = new Float32Array(SIZE * SIZE);
  for (let r = 0; r < SIZE; r++)
    for (let c = 0; c < SIZE; c++) heights[r * SIZE + c] = beach(ORIGIN[0] + c + 0.5, ORIGIN[1] + r + 0.5);
  const tile = encodeTerrainFieldTile(descriptor, {
    tx: 0,
    tz: 0,
    channels: { height: terrainFieldFloat32Bytes(heights), sand: new Uint8Array(SIZE * SIZE).fill(255) },
  });
  const doc = WorldDocument.parse({
    schemaVersion: 1,
    experienceId: 'exp-ground-contact',
    version: 0,
    sizeTier: 'large',
    style: { base: 'realistic' },
    access: { mode: 'private' },
    spawn: { position: [130, 21, -50] },
    environment: { sky: { preset: 'day' }, weather: { preset: 'clear' }, sea: { level: SEA } },
    terrain: {
      world: { seed: 7, kind: 'island', generator: 2 },
      fieldSets: { beach: { descriptor, tiles: ['0,0'] } },
      activeSurface: {
        setId: 'beach',
        outsideHeight: -70,
        edge: 'constant',
        farEdge: 'exclusive',
        materialBindings: [
          {
            itemId: 'genvr.core.ground.tidewater-beach-sand',
            inputs: { coverage: { channel: 'sand', scale: 1 / 255 } },
          },
        ],
      },
    },
  });
  return createWorldState(doc, [JSON.stringify(tile)]);
}

/** Barycentric height of a point inside a triangle in x, z; null when the point is outside it. */
function inTriangle(p: readonly [number, number], a: Vector3, b: Vector3, c: Vector3): number | null {
  const d = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z);
  if (Math.abs(d) < 1e-12) return null;
  const u = ((b.z - c.z) * (p[0] - c.x) + (c.x - b.x) * (p[1] - c.z)) / d;
  const v = ((c.z - a.z) * (p[0] - c.x) + (a.x - c.x) * (p[1] - c.z)) / d;
  const w = 1 - u - v;
  const eps = -1e-6;
  return u >= eps && v >= eps && w >= eps ? u * a.y + v * b.y + w * c.y : null;
}

/**
 * CPU twin of the native terrain mesh (`NativeTerrainView`): the same CDLOD configuration (grid 40, leaf 8 m,
 * range factor 2), the selected nodes for this camera, each vertex morphed exactly as the shader does and lifted to
 * the active surface height at its morphed x, z (the GPU sampler is exact to 4e-5 raw units, see
 * docs/reference/tidewater-world/09-field-gpu), triangulated with the mesh's own alternating diagonals.
 */
function drawnSurface(terrain: TerrainData, camera: PerspectiveCamera) {
  const lod = new TerrainLod({
    gridSize: 40,
    leafSize: 8,
    levels: Math.log2(SIZE / 8) + 1,
    rangeFactor: 2,
    center: { x: ORIGIN[0], z: ORIGIN[1], size: SIZE },
    minY: -150,
    maxY: 450,
  });
  lod.update(camera);
  const view = camera.position.clone();
  const nodeData = lod.geometry.getAttribute('nodeData').array as Float32Array;
  const nodes = Array.from(
    { length: lod.geometry.instanceCount },
    (_, i) => [nodeData[i * 4]!, nodeData[i * 4 + 1]!, nodeData[i * 4 + 2]!, nodeData[i * 4 + 3]!] as const,
  );
  const vertex = (node: (typeof nodes)[number], i: number, j: number) => {
    const grid = [i / 40, j / 40] as const;
    const snapped = lod.snapped(node, grid);
    const morphed = lod.morphVertex(node, grid, view, terrain.heightAt(snapped[0], snapped[1]));
    const [x, z] = morphed.worldXZ;
    return new Vector3(x, terrain.heightAt(x, z), z);
  };
  const heightAt = (x: number, z: number): { y: number; lod: number } | null => {
    for (const node of nodes) {
      const [nx, nz, size, level] = node;
      if (x < nx || z < nz || x > nx + size || z > nz + size) continue;
      const cell = size / 40;
      const ci = Math.min(39, Math.floor((x - nx) / cell));
      const cj = Math.min(39, Math.floor((z - nz) / cell));
      // A morphed vertex moves by at most one cell, so the drawn triangle is within one cell of the grid cell.
      for (let j = Math.max(0, cj - 1); j <= Math.min(39, cj + 1); j++)
        for (let i = Math.max(0, ci - 1); i <= Math.min(39, ci + 1); i++) {
          const a = vertex(node, i, j),
            b = vertex(node, i + 1, j),
            c = vertex(node, i, j + 1),
            d = vertex(node, i + 1, j + 1);
          const triangles =
            (i + j) % 2 === 0
              ? [
                  [a, c, b],
                  [b, c, d],
                ]
              : [
                  [a, c, d],
                  [a, d, b],
                ];
          for (const [p, q, r] of triangles) {
            const y = inTriangle([x, z], p!, q!, r!);
            if (y !== null) return { y, lod: level };
          }
        }
    }
    return null; // outside the view: culled, not drawn
  };
  return { heightAt, lod };
}

/** Height of the near-player collision triangles (`NativeTerrainColliders`) at a point. */
function colliderHeightAt(terrain: TerrainData, x: number, z: number): number {
  const cx = Math.floor(x / NATIVE_COLLISION_SIZE),
    cz = Math.floor(z / NATIVE_COLLISION_SIZE);
  const { positions, indices } = nativeCollisionGeometry(terrain, cx, cz);
  const at = (k: number) => new Vector3(positions[k * 3], positions[k * 3 + 1], positions[k * 3 + 2]);
  const step = NATIVE_COLLISION_SIZE / NATIVE_COLLISION_CELLS;
  const ci = Math.floor((x - cx * NATIVE_COLLISION_SIZE) / step);
  const cj = Math.floor((z - cz * NATIVE_COLLISION_SIZE) / step);
  // Float32 vertex positions: a point on a cell edge may fall just into the neighbouring cell.
  for (let j = Math.max(0, cj - 1); j <= Math.min(NATIVE_COLLISION_CELLS - 1, cj + 1); j++)
    for (let i = Math.max(0, ci - 1); i <= Math.min(NATIVE_COLLISION_CELLS - 1, ci + 1); i++) {
      const cell = (j * NATIVE_COLLISION_CELLS + i) * 6;
      for (const offset of [0, 3]) {
        const y = inTriangle(
          [x, z],
          at(indices[cell + offset]!),
          at(indices[cell + offset + 1]!),
          at(indices[cell + offset + 2]!),
        );
        if (y !== null) return y;
      }
    }
  throw new Error(`No collision triangle covers ${x}, ${z}`);
}

/** Owner-like viewpoints: standing on the beach, eye 1.7 m over the sand, looking at the starfish strip. */
function cameraAt(terrain: TerrainData, from: readonly [number, number], to: readonly [number, number]) {
  const camera = new PerspectiveCamera(60, 16 / 9, 0.1, 5000);
  camera.position.set(from[0], terrain.heightAt(from[0], from[1]) + 1.7, from[1]);
  camera.lookAt(to[0], terrain.heightAt(to[0], to[1]), to[1]);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  return camera;
}

/** Sample points of the starfish strip, including CDLOD node borders (every 8 m) and collision chunk borders. */
const POINTS: Array<[number, number]> = [];
for (let x = 136; x <= 160; x += 0.7) for (let z = -60; z <= -45; z += 0.9) POINTS.push([x, z]);
for (const x of [136, 144, 152, 160])
  for (let z = -60; z <= -45; z += 0.37) POINTS.push([x, z], [x + 1e-6, z]);
for (const z of [-56, -48]) for (let x = 136; x <= 160; x += 0.41) POINTS.push([x, z], [x, z - 1e-6]);

describe('ground contact on the drawn beach (GROUND-01)', () => {
  const state = beachState();
  const terrain = state.terrain;

  it('rests on the active surface: the stored 1 m raster height plus its offset', () => {
    expect(terrain.activeSurface).not.toBeNull();
    const x = 150.5,
      z = -53.5;
    expect(terrain.heightAt(x, z)).toBeCloseTo(SEA + beach(x, z), 6);
  });

  it('draws the near terrain within 2 mm of the height items rest on, across LOD levels, morphs and node borders', () => {
    const views: Array<[readonly [number, number], readonly [number, number]]> = [
      [
        [148, -62],
        [148, -52],
      ],
      [
        [147.6, -54.4],
        [146.9, -55.4],
      ],
      [
        [130, -70],
        [152, -52],
      ],
      [
        [163, -40],
        [140, -58],
      ],
    ];
    let worst = 0;
    let covered = 0;
    const levels = new Set<number>();
    for (const [from, to] of views) {
      const drawn = drawnSurface(terrain, cameraAt(terrain, from, to));
      for (const [x, z] of POINTS) {
        const hit = drawn.heightAt(x, z);
        if (!hit) continue;
        const { y, lod } = hit;
        covered++;
        levels.add(lod);
        worst = Math.max(worst, Math.abs(y - terrain.heightAt(x, z)));
      }
    }
    expect(covered, 'drawn points sampled').toBeGreaterThan(POINTS.length);
    expect(levels.size, 'several LOD levels sampled').toBeGreaterThan(1);
    expect(worst).toBeLessThan(0.002);
  });

  it('collides with the same ground (player feet and colliders agree with what is drawn)', () => {
    let worst = 0;
    for (const [x, z] of POINTS)
      worst = Math.max(worst, Math.abs(colliderHeightAt(terrain, x, z) - terrain.heightAt(x, z)));
    expect(worst).toBeLessThan(0.002);
  });

  it('rests a starfish level on level ground 20 m up (no plane-fit tilt from an off-centre footprint)', () => {
    // The tilt law fits its plane with raw sums; feet not centred on the pivot then read the absolute ground
    // height as slope (30 degrees at 20 m). The starfish's footprint is centred, so it lies flat.
    const item = getCoreItem('genvr.core.tidewater.starfish')!;
    const look = itemGeneratedLook(item, 'realistic')!;
    const rule = restRule(item, look.generated.bounds);
    const shape = { min: look.generated.bounds.min, max: look.generated.bounds.max, rule, maxTilt: 30 };
    for (const level of [0, 20, 120]) {
      const flat = { below: () => level } as unknown as SurfaceIndex;
      const instance = {
        instanceId: 'flat',
        itemId: item.manifest.id,
        transform: {
          position: [150, level + 5, -53],
          rotation: [0, 0.5, 0, Math.sqrt(0.75)],
          scale: [1, 1, 1],
        },
        params: {},
      } as unknown as ItemInstance;
      const placed = rest(instance, shape, flat);
      expect(placed.ok, `level ${level}`).toBe(true);
      expect(Math.abs(placed.rotation[0]) + Math.abs(placed.rotation[2]), `tilt at ${level}`).toBeLessThan(
        1e-6,
      );
      expect(placed.position[1]).toBeCloseTo(level - (rule.sink ?? 0), 3);
    }
  });

  it('rests a starfish so its arms stay on top of the sand, not buried by its own rest rule', () => {
    const item = getCoreItem('genvr.core.tidewater.starfish')!;
    const look = itemGeneratedLook(item, 'realistic')!;
    const rule = restRule(item, look.generated.bounds);
    const shape = {
      min: look.generated.bounds.min,
      max: look.generated.bounds.max,
      rule,
      ...(item.manifest.placement?.maxTilt !== undefined ? { maxTilt: item.manifest.placement.maxTilt } : {}),
    };
    const surfaces = new SurfaceIndex(state.doc, {
      groundAt: (x, z) => terrain.heightAt(x, z),
      itemShape: () => null,
    });
    const cases = [
      { seed: 520, size: 0.15, arms: 5 },
      { seed: 21708, size: 0.2, arms: 5 },
      { seed: 44325, size: 0.24, arms: 5 },
      { seed: 50459, size: 0.28, arms: 6 },
      { seed: 31988, size: 0.35, arms: 6 },
    ];
    for (const [k, params] of cases.entries()) {
      const x = 146.87 + k * 3.1,
        z = -53.15 - k * 0.6;
      const instance = {
        instanceId: `star-${k}`,
        itemId: item.manifest.id,
        transform: { position: [x, 30, z], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
        params,
      } as unknown as ItemInstance;
      const placed = rest(instance, shape, surfaces);
      expect(placed.ok, JSON.stringify(placed)).toBe(true);
      const turn = new Quaternion(...placed.rotation);
      const geometry = buildStarfish(starfishParams(params), 0);
      const position = geometry.getAttribute('position');
      const index = geometry.getIndex()!;
      const world = (i: number) =>
        new Vector3(position.getX(i), position.getY(i), position.getZ(i))
          .applyQuaternion(turn)
          .add(new Vector3(...placed.position));
      let top = 0;
      let shown = 0;
      for (let t = 0; t < index.count; t += 3) {
        const a = world(index.getX(t)),
          b = world(index.getX(t + 1)),
          c = world(index.getX(t + 2));
        const normal = new Vector3().subVectors(b, a).cross(new Vector3().subVectors(c, a));
        if (normal.y <= 0) continue; // underside, faces the ground
        const area = normal.y / 2;
        top += area;
        // Seen when every corner is at least 1 mm above the drawn sand under it.
        if ([a, b, c].every((v) => v.y - terrain.heightAt(v.x, v.z) > 0.001)) shown += area;
      }
      expect(top, `starfish ${k} has a top`).toBeGreaterThan(0);
      expect(shown / top, `visible top share of starfish ${k} (sink ${rule.sink})`).toBeGreaterThan(0.95);
    }
  });
});
