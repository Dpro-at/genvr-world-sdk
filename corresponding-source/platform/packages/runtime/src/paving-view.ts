import type { Paving } from '@genvr/contracts';
import { getGround } from '@genvr/core-library';
import { BufferAttribute, BufferGeometry, Mesh, MeshStandardMaterial, ShapeUtils, Vector2, type Texture } from 'three/webgpu';
import { groundTexture } from './road-view.js';

type HeightAt = (x: number, z: number) => number;

/** Lift above the ground: over it (no flicker), under roads (6 cm) so streets lie on top of a square. */
const PAVING_LIFT = 0.03;
/** Extra lift per level for a paved area lying on a bigger one (a car park in a shopping area), still under roads. */
const LEVEL_LIFT = 0.006;
/** Highest level: 0.03 + 3 x 0.006 stays under a road's 6 cm. */
export const MAX_PAVING_LEVEL = 3;
/** Longest triangle edge, metres: the surface follows the ground's 2 m grid. */
const MAX_EDGE = 2;

/** One material per paving ground, shared by every paved area that uses it. */
export class PavingMaterials {
  readonly #materials = new Map<string, MeshStandardMaterial>();

  readonly #maps = new Map<string, Texture>();

  /** The material of a ground at a level; a higher level wins the depth test, still less than a road (-2). */
  get(materialId: string, level = 0): MeshStandardMaterial {
    const key = `${materialId}:${level}`;
    let material = this.#materials.get(key);
    if (!material) {
      const name = getGround(materialId)?.name ?? 'large-grey-tiles';
      let map = this.#maps.get(name);
      if (!map) this.#maps.set(name, (map = groundTexture(name)));
      material = new MeshStandardMaterial({ map, roughness: 0.9 });
      material.polygonOffset = true;
      material.polygonOffsetFactor = -1 - 0.25 * level;
      material.polygonOffsetUnits = -1 - 0.25 * level;
      this.#materials.set(key, material);
    }
    return material;
  }

  dispose(): void {
    for (const material of this.#materials.values()) material.dispose();
    for (const map of this.#maps.values()) map.dispose();
    this.#materials.clear();
    this.#maps.clear();
  }
}

/**
 * Levels of paved areas that lie on each other: the biggest first at 0, each one more than the bigger areas it
 * overlaps (by their bounds), so they never share a height and flicker.
 */
export function pavingLevels(pavings: readonly Paving[]): Map<string, number> {
  const bounds = (p: Paving) => {
    const xs = p.area.map((q) => q[0]);
    const zs = p.area.map((q) => q[1]);
    return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
  };
  const size = (p: Paving) => {
    let twice = 0;
    p.area.forEach(([ax, az], i) => {
      const [bx, bz] = p.area[(i + 1) % p.area.length]!;
      twice += ax * bz - bx * az;
    });
    return Math.abs(twice);
  };
  const sorted = [...pavings].sort((a, b) => size(b) - size(a));
  const levels = new Map<string, number>();
  sorted.forEach((p, i) => {
    const b = bounds(p);
    let level = 0;
    for (const q of sorted.slice(0, i)) {
      const c = bounds(q);
      if (b.minX < c.maxX && b.maxX > c.minX && b.minZ < c.maxZ && b.maxZ > c.minZ) level = Math.max(level, (levels.get(q.id) ?? 0) + 1);
    }
    levels.set(p.id, Math.min(level, MAX_PAVING_LEVEL));
  });
  return levels;
}

/**
 * A paved area (R2l): its outline triangulated with the exact edge, every triangle split until no edge is longer than
 * the ground grid, each corner on the ground. Textured in real size (the ground material's tile).
 */
export function buildPaving(paving: Paving, heightAt: HeightAt, materials: PavingMaterials, level = 0): Mesh {
  const lift = PAVING_LIFT + Math.min(level, MAX_PAVING_LEVEL) * LEVEL_LIFT;
  const contour = paving.area.map(([x, z]) => new Vector2(x, z));
  const triangles = ShapeUtils.triangulateShape(contour, []);
  const tile = getGround(paving.materialId)?.tile ?? 3;
  const positions: number[] = [];
  const uvs: number[] = [];
  const corner = (x: number, z: number) => {
    positions.push(x, heightAt(x, z) + lift, z);
    uvs.push(x / tile, z / tile);
  };
  const split = (a: Vector2, b: Vector2, c: Vector2, depth: number) => {
    const ab = a.distanceTo(b);
    const bc = b.distanceTo(c);
    const ca = c.distanceTo(a);
    const longest = Math.max(ab, bc, ca);
    if (longest <= MAX_EDGE || depth > 12) {
      // Wound so the face points up (+y) whichever way the outline runs.
      const up = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x) < 0;
      for (const p of up ? [a, b, c] : [a, c, b]) corner(p.x, p.y);
      return;
    }
    if (longest === ab) {
      const m = a.clone().lerp(b, 0.5);
      split(a, m, c, depth + 1);
      split(m, b, c, depth + 1);
    } else if (longest === bc) {
      const m = b.clone().lerp(c, 0.5);
      split(a, b, m, depth + 1);
      split(a, m, c, depth + 1);
    } else {
      const m = c.clone().lerp(a, 0.5);
      split(a, b, m, depth + 1);
      split(m, b, c, depth + 1);
    }
  };
  for (const [i, j, k] of triangles) split(contour[i!]!, contour[j!]!, contour[k!]!, 0);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  const mesh = new Mesh(geometry, materials.get(paving.materialId, Math.min(level, MAX_PAVING_LEVEL)));
  mesh.receiveShadow = true;
  mesh.name = `paving:${paving.id}`;
  return mesh;
}
