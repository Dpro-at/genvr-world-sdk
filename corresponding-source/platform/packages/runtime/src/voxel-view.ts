import type { BlockStyle } from '@genvr/core-library';
import type { VoxelData } from '@genvr/world';
import {
  BufferAttribute,
  BufferGeometry,
  Group,
  Mesh,
  MeshStandardNodeMaterial,
  TSL,
  type DataArrayTexture,
} from 'three/webgpu';
import { meshVoxelChunk, type VoxelMeshArrays } from './voxel-mesh.js';
import { createBlockTexture } from './voxel-textures.js';

const { attribute, dot, float, floor, fract, normalWorld, positionWorld, sin, texture, uv, vec3, vec4 } = TSL;

/** Shade differences between neighboring cubes (share of the color, up and down). */
const CUBE_SHADE: Record<BlockStyle, number> = { pixel: 0.035, plain: 0.075 };

interface ChunkView {
  solid: Mesh | null;
  water: Mesh | null;
  /** 1: every block; 2: far chunk from 2 x 2 x 2 cells (see meshVoxelChunk). */
  step: 1 | 2;
}

/** A far chunk turns back into full detail this much closer than where it turned coarse. */
const LOD_MARGIN = 0.75;

/**
 * Draws block ground (P2-26) in chunks around the viewer: the nearest first, a few per frame so
 * walking never stutters, and nothing beyond the view radius (fog hides the edge). Chunks farther
 * than `lodFrom` chunks are drawn with less detail (2 x 2 x 2 cells, about half the triangles);
 * a margin keeps a chunk at the boundary from switching back and forth. Block arrays of chunks
 * that leave the view are released.
 */
export class VoxelView {
  readonly group = new Group();
  readonly #views = new Map<string, ChunkView>();
  readonly #dirty = new Set<string>();
  readonly #texture: DataArrayTexture;
  readonly #solid: MeshStandardNodeMaterial;
  readonly #water: MeshStandardNodeMaterial;

  constructor(
    private readonly voxels: VoxelData,
    /** Pixel pictures, or clean colors with a shade per cube (the style decides). */
    blockStyle: BlockStyle = 'pixel',
    private readonly viewRadiusChunks = 7,
    /** Chunks built per update once the ground under the viewer stands. */
    private readonly budget = 2,
    /** Distance in chunks past which chunks are drawn with less detail. */
    private readonly lodFrom = 3.5,
  ) {
    this.group.name = 'voxels';
    this.#texture = createBlockTexture(blockStyle);
    const sample = texture(this.#texture, fract(uv())).depth(attribute('layer', 'float'));
    // Every cube a little lighter or darker than its neighbors, from its position: the cube is
    // half a block behind the face.
    const cube = floor(positionWorld.sub(normalWorld.mul(0.5)));
    const random = fract(sin(dot(cube, vec3(12.9898, 78.233, 37.719))).mul(43758.5453));
    const tint = float(1).add(random.sub(0.5).mul(2 * CUBE_SHADE[blockStyle]));
    this.#solid = new MeshStandardNodeMaterial({ roughness: 0.92, metalness: 0 });
    this.#solid.colorNode = vec4(sample.rgb.mul(attribute('shade', 'float')).mul(tint), 1);
    this.#water = new MeshStandardNodeMaterial({
      roughness: 0.15,
      metalness: 0,
      transparent: true,
      depthWrite: false,
    });
    this.#water.colorNode = sample.rgb;
    this.#water.opacityNode = sample.a;
  }

  markDirty(keys: Iterable<string>): void {
    for (const key of keys) this.#dirty.add(key);
  }

  #mesh(arrays: VoxelMeshArrays, material: MeshStandardNodeMaterial, name: string): Mesh | null {
    if (arrays.indices.length === 0) return null;
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(arrays.positions, 3));
    geometry.setAttribute('normal', new BufferAttribute(arrays.normals, 3));
    geometry.setAttribute('uv', new BufferAttribute(arrays.uvs, 2));
    geometry.setAttribute('layer', new BufferAttribute(arrays.layers, 1));
    geometry.setAttribute('shade', new BufferAttribute(arrays.shades, 1));
    geometry.setIndex(new BufferAttribute(arrays.indices, 1));
    geometry.computeBoundingSphere();
    const mesh = new Mesh(geometry, material);
    mesh.name = name;
    return mesh;
  }

  #build(cx: number, cz: number, step: 1 | 2): ChunkView {
    const { solid, water } = meshVoxelChunk(this.voxels, cx, cz, step);
    const view: ChunkView = {
      step,
      solid: this.#mesh(solid, this.#solid, `voxels:${cx},${cz}`),
      water: this.#mesh(water, this.#water, `voxel-water:${cx},${cz}`),
    };
    if (view.solid) {
      view.solid.castShadow = true;
      view.solid.receiveShadow = true;
      this.group.add(view.solid);
    }
    if (view.water) {
      view.water.renderOrder = 1;
      this.group.add(view.water);
    }
    return view;
  }

  /** Call every frame (cheap when nothing changes). */
  update(viewerX: number, viewerZ: number): void {
    const { cx: vcx, cz: vcz } = this.voxels.chunkAt(viewerX, viewerZ);
    const { min, max } = this.voxels.chunkRange;
    const r = this.viewRadiusChunks;
    const wanted: Array<{ key: string; cx: number; cz: number; distance: number }> = [];
    for (let cz = vcz - r; cz <= vcz + r; cz += 1)
      for (let cx = vcx - r; cx <= vcx + r; cx += 1) {
        if (cx < min || cx > max || cz < min || cz > max) continue;
        const distance = Math.hypot(cx - vcx, cz - vcz);
        if (distance > r + 0.5) continue;
        wanted.push({ key: `${cx},${cz}`, cx, cz, distance });
      }
    const keep = new Set(wanted.map((chunk) => chunk.key));
    for (const key of [...this.#views.keys()]) if (!keep.has(key)) this.#remove(key, true);
    wanted.sort((a, b) => a.distance - b.distance);
    let built = 0;
    for (const chunk of wanted) {
      const current = this.#views.get(chunk.key)?.step;
      const far = chunk.distance > (current === 2 ? this.lodFrom - LOD_MARGIN : this.lodFrom);
      const step = far ? 2 : 1;
      if (current === step && !this.#dirty.has(chunk.key)) continue;
      // The ground around the viewer always stands at once; farther chunks come a few per frame.
      if (built >= this.budget && chunk.distance > 1.5) break;
      if (current) this.#remove(chunk.key, false);
      this.#views.set(chunk.key, this.#build(chunk.cx, chunk.cz, step));
      this.#dirty.delete(chunk.key);
      built += 1;
    }
  }

  /** Builds every chunk in view now (first frame, pictures, and tests). */
  fill(viewerX: number, viewerZ: number): void {
    let before = -1;
    while (before !== this.#views.size) {
      before = this.#views.size;
      this.update(viewerX, viewerZ);
    }
  }

  #remove(key: string, release: boolean): void {
    const view = this.#views.get(key);
    if (!view) return;
    for (const mesh of [view.solid, view.water]) {
      if (!mesh) continue;
      this.group.remove(mesh);
      mesh.geometry.dispose();
    }
    this.#views.delete(key);
    if (release) {
      const [cx, cz] = key.split(',').map(Number) as [number, number];
      this.voxels.release(cx, cz);
    }
  }

  get chunkCount(): number {
    return this.#views.size;
  }

  /** Triangles drawn now (solid and water). */
  get triangles(): number {
    let count = 0;
    for (const view of this.#views.values())
      for (const mesh of [view.solid, view.water]) if (mesh) count += (mesh.geometry.index?.count ?? 0) / 3;
    return count;
  }

  dispose(): void {
    for (const key of [...this.#views.keys()]) this.#remove(key, false);
    this.#solid.dispose();
    this.#water.dispose();
    this.#texture.dispose();
  }
}
