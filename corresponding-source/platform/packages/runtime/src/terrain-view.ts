import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  Mesh,
  MeshStandardMaterial,
  type Material,
} from 'three/webgpu';
import { chunkGeometryArrays, chunkKey, type ChunkData, type TerrainData } from '@genvr/world';
import { DRAW_DISTANCE } from './scatter-view.js';
import { triangleCorners } from './terrain-realistic.js';

/** A chunk's world-space footprint: [minX, minZ, maxX, maxZ]. */
export type Rect = readonly [number, number, number, number];

/**
 * Detail of one chunk (P2-43): full wherever things are drawn on it, because a thing rests on the
 * measured ground and must not hang over a coarser drawn one. Coarse only past `fullDetail`.
 */
export function stepForChunk(rect: Rect, viewX: number, viewZ: number, fullDetail: number): 1 | 2 | 4 {
  const dx = Math.max(rect[0] - viewX, 0, viewX - rect[2]);
  const dz = Math.max(rect[1] - viewZ, 0, viewZ - rect[3]);
  const near = Math.hypot(dx, dz);
  if (near <= fullDetail) return 1;
  if (near <= fullDetail * 2) return 2;
  return 4;
}

/**
 * How far below the edge a skirt drops, so no gap shows next to a finer neighbouring chunk. A
 * step-4 chunk was measured 2.1 m off the true ground on mountains (P2-43 final review), so 2 m
 * left cracks there; 8 m covers it with room to spare.
 */
const SKIRT_DROP = 8;

/** How Realistic places draw the ground (P2-37): a material and the texture layer of each palette slot. */
export interface RealisticGround {
  material: Material;
  layerOfSlot: (slot: number) => number;
}

interface ChunkView {
  mesh: Mesh;
  step: number;
}

/**
 * Streams terrain chunk meshes around the viewer: full detail nearby, half and quarter detail
 * farther away, nothing beyond the view radius (fog hides the edge).
 */
export class TerrainView {
  readonly group = new Group();
  readonly #views = new Map<string, ChunkView>();
  readonly #material: Material;
  readonly #palette: Color[];
  readonly #dirty = new Set<string>();
  #realistic: RealisticGround | null = null;
  /** Increases whenever a chunk's drawn step changes (P2-43 task 11), so `ItemsView` can cheaply
   * tell whether it needs to recompute the coarse-ground offset of placed items. */
  #stepVersion = 0;

  constructor(
    private readonly terrain: TerrainData,
    soilColors: readonly number[],
    private readonly viewRadiusChunks = 4,
  ) {
    this.group.name = 'terrain';
    this.#material = new MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: false });
    this.#palette = soilColors.map((color) => new Color(color));
  }

  /** New soil colors (a style change): every chunk is rebuilt on the next update. */
  setSoilColors(soilColors: readonly number[]): void {
    this.#palette.splice(0, this.#palette.length, ...soilColors.map((color) => new Color(color)));
    for (const key of this.#views.keys()) this.#dirty.add(key);
  }

  /** Draws the ground with real materials (Realistic style), or back with soil colors (null). */
  setRealistic(realistic: RealisticGround | null): void {
    this.#realistic = realistic;
    for (const key of this.#views.keys()) this.#dirty.add(key);
  }

  markDirty(keys: Iterable<string>): void {
    for (const key of keys) this.#dirty.add(key);
  }

  /** The step (1, 2 or 4) this view is currently drawing the chunk at a world position with, or 1
   * when that chunk is not tracked (outside the view radius, P2-43 task 11). */
  stepAt(x: number, z: number): number {
    const { cx, cz } = this.terrain.chunkAt(x, z);
    return this.#views.get(chunkKey(cx, cz))?.step ?? 1;
  }

  /** See `#stepVersion`. */
  get stepVersion(): number {
    return this.#stepVersion;
  }

  #build(chunk: ChunkData, step: number): Mesh {
    const { positions, indices, count } = chunkGeometryArrays(this.terrain, chunk, step);
    const colors = new Float32Array(count * count * 3);
    const normals = new Float32Array(count * count * 3);
    const slots: number[] = [];
    const edge = this.terrain.edge;
    const d = this.terrain.spacing;
    let c = 0;
    for (let iz = 0; iz < edge; iz += step) {
      for (let ix = 0; ix < edge; ix += step) {
        const soil = chunk.soils[iz * edge + ix] ?? 0;
        slots.push(soil);
        const color = this.#palette[soil] ?? this.#palette[0]!;
        // Normals from the whole heightfield (not per chunk), so chunk borders have no lighting seams.
        const { x, z } = this.terrain.vertexPosition(chunk, ix, iz);
        const nx = this.terrain.vertexHeight(x - d, z) - this.terrain.vertexHeight(x + d, z);
        const nz = this.terrain.vertexHeight(x, z - d) - this.terrain.vertexHeight(x, z + d);
        const length = Math.hypot(nx, 2 * d, nz);
        normals[c] = nx / length;
        normals[c + 1] = (2 * d) / length;
        normals[c + 2] = nz / length;
        colors[c++] = color.r;
        colors[c++] = color.g;
        colors[c++] = color.b;
      }
    }
    // A coarse chunk's edge does not line up with a full-detail neighbour's, so it gets a skirt:
    // a wall dropping below the edge that fills whatever gap the mismatch leaves (P2-43).
    const built =
      step > 1
        ? addSkirt(count, positions, colors, normals, indices, slots)
        : { positions, colors, normals, indices, slots };
    const geometry = this.#realistic
      ? realisticGeometry(built.positions, built.normals, built.indices, built.slots, this.#realistic)
      : new BufferGeometry();
    if (!this.#realistic) {
      geometry.setAttribute('position', new BufferAttribute(built.positions, 3));
      geometry.setAttribute('normal', new BufferAttribute(built.normals, 3));
      geometry.setAttribute('color', new BufferAttribute(built.colors, 3));
      geometry.setIndex(new BufferAttribute(built.indices, 1));
    }
    geometry.computeBoundingSphere();
    const mesh = new Mesh(geometry, this.#realistic?.material ?? this.#material);
    mesh.receiveShadow = true;
    mesh.name = `terrain:${chunkKey(chunk.cx, chunk.cz)}`;
    return mesh;
  }

  /** Call every frame (cheap when nothing changes). */
  update(viewerX: number, viewerZ: number): void {
    const { cx: vcx, cz: vcz } = this.terrain.chunkAt(viewerX, viewerZ);
    const { min, max } = this.terrain.chunkRange;
    const wanted = new Set<string>();
    for (let cz = vcz - this.viewRadiusChunks; cz <= vcz + this.viewRadiusChunks; cz += 1) {
      for (let cx = vcx - this.viewRadiusChunks; cx <= vcx + this.viewRadiusChunks; cx += 1) {
        if (cx < min || cx > max || cz < min || cz > max) continue;
        const key = chunkKey(cx, cz);
        wanted.add(key);
        const size = this.terrain.chunkSize;
        const rect: Rect = [cx * size, cz * size, cx * size + size, cz * size + size];
        const step = stepForChunk(rect, viewerX, viewerZ, DRAW_DISTANCE);
        const existing = this.#views.get(key);
        if (existing && existing.step === step && !this.#dirty.has(key)) continue;
        if (!existing || existing.step !== step) this.#stepVersion += 1;
        if (existing) this.#remove(key);
        const mesh = this.#build(this.terrain.getChunk(cx, cz), step);
        this.group.add(mesh);
        this.#views.set(key, { mesh, step });
      }
    }
    for (const key of [...this.#views.keys()]) if (!wanted.has(key)) this.#remove(key);
    this.#dirty.clear();
  }

  #remove(key: string): void {
    const view = this.#views.get(key);
    if (!view) return;
    this.group.remove(view.mesh);
    view.mesh.geometry.dispose();
    this.#views.delete(key);
  }

  get chunkCount(): number {
    return this.#views.size;
  }

  dispose(): void {
    for (const key of [...this.#views.keys()]) this.#remove(key);
    this.#material.dispose();
  }
}

interface SkirtedMesh {
  positions: Float32Array;
  colors: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
  slots: number[];
}

/**
 * Adds a wall of triangles along a coarse chunk's four edges, dropping `SKIRT_DROP` below the
 * edge vertices with their same color, normal and soil (P2-43). A finer neighbouring chunk's edge
 * sits at the same height as this chunk's true edge but the coarse grid may not touch it between
 * corners; the skirt fills that gap from underneath so no crack shows through it.
 */
export function addSkirt(
  count: number,
  positions: Float32Array,
  colors: Float32Array,
  normals: Float32Array,
  indices: Uint32Array,
  slots: readonly number[],
): SkirtedMesh {
  // `flip` reverses the triangle order so the skirt's face normal points outward, away from the
  // chunk: the grid's own winding (`a, c, b` in `chunkGeometryArrays`, `c` the +z neighbour) makes
  // a "z-then-x" triangle order face +Z or +X, which is outward on the south and west edges but
  // inward - and so culled with the rest of the ground - on the north (iz = 0) and east
  // (ix = count - 1) edges, exactly where a crack would otherwise show through.
  const edges: Array<{ base: number[]; flip: boolean }> = [
    { base: Array.from({ length: count }, (_, ix) => ix), flip: true }, // north: iz = 0
    { base: Array.from({ length: count }, (_, ix) => (count - 1) * count + ix), flip: false }, // south: iz = count - 1
    { base: Array.from({ length: count }, (_, iz) => iz * count), flip: false }, // west: ix = 0
    { base: Array.from({ length: count }, (_, iz) => iz * count + (count - 1)), flip: true }, // east: ix = count - 1
  ];
  const baseVerts = count * count;
  const extraVerts = edges.reduce((sum, e) => sum + e.base.length, 0);
  const outPositions = new Float32Array((baseVerts + extraVerts) * 3);
  const outColors = new Float32Array((baseVerts + extraVerts) * 3);
  const outNormals = new Float32Array((baseVerts + extraVerts) * 3);
  outPositions.set(positions);
  outColors.set(colors);
  outNormals.set(normals);
  const outSlots = slots.slice();
  const extraTris = edges.reduce((sum, e) => sum + (e.base.length - 1) * 2, 0);
  const outIndices = new Uint32Array(indices.length + extraTris * 3);
  outIndices.set(indices);
  let vi = baseVerts;
  let ii = indices.length;
  for (const { base: edgeIndices, flip } of edges) {
    const skirtIndex: number[] = [];
    for (const base of edgeIndices) {
      outPositions[vi * 3] = positions[base * 3]!;
      outPositions[vi * 3 + 1] = positions[base * 3 + 1]! - SKIRT_DROP;
      outPositions[vi * 3 + 2] = positions[base * 3 + 2]!;
      outColors[vi * 3] = colors[base * 3]!;
      outColors[vi * 3 + 1] = colors[base * 3 + 1]!;
      outColors[vi * 3 + 2] = colors[base * 3 + 2]!;
      outNormals[vi * 3] = normals[base * 3]!;
      outNormals[vi * 3 + 1] = normals[base * 3 + 1]!;
      outNormals[vi * 3 + 2] = normals[base * 3 + 2]!;
      outSlots.push(slots[base] ?? 0);
      skirtIndex.push(vi);
      vi += 1;
    }
    for (let i = 0; i < edgeIndices.length - 1; i += 1) {
      const a = edgeIndices[i]!;
      const b = edgeIndices[i + 1]!;
      const sa = skirtIndex[i]!;
      const sb = skirtIndex[i + 1]!;
      outIndices.set(flip ? [a, b, sa, b, sb, sa] : [a, sa, b, b, sa, sb], ii);
      ii += 6;
    }
  }
  return {
    positions: outPositions,
    colors: outColors,
    normals: outNormals,
    indices: outIndices,
    slots: outSlots,
  };
}

/**
 * A Realistic chunk (P2-37): non-indexed, so every triangle carries the texture layers of its three
 * corners (`groundLayers`) and a barycentric weight (`groundBary`) to blend them.
 */
function realisticGeometry(
  positions: Float32Array,
  normals: Float32Array,
  indices: Uint32Array,
  slots: readonly number[],
  realistic: RealisticGround,
): BufferGeometry {
  const { layers, bary, order } = triangleCorners(slots, indices, realistic.layerOfSlot);
  const outPositions = new Float32Array(order.length * 3);
  const outNormals = new Float32Array(order.length * 3);
  for (let v = 0; v < order.length; v += 1) {
    const from = order[v]! * 3;
    outPositions.set(positions.subarray(from, from + 3), v * 3);
    outNormals.set(normals.subarray(from, from + 3), v * 3);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(outPositions, 3));
  geometry.setAttribute('normal', new BufferAttribute(outNormals, 3));
  geometry.setAttribute('groundLayers', new BufferAttribute(layers, 3));
  geometry.setAttribute('groundBary', new BufferAttribute(bary, 3));
  return geometry;
}
