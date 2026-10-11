import {
  Block,
  isSolidBlock,
  VOXEL_CHUNK,
  VOXEL_LAYERS,
  VOXEL_MAX_Y,
  VOXEL_MIN_Y,
  VOXEL_WATER_LEVEL,
  type VoxelData,
} from '@genvr/world';

/**
 * Block ground to triangles (P2-26): only faces between a block and an open neighbor, merged into
 * larger rectangles where neighbors look the same (greedy meshing), with soft corner shading
 * (ambient occlusion) from the blocks around each corner. Pure data, no three.js.
 */

/** Texture layer of a block face: three per block (top, side, bottom). */
export const faceLayer = (block: number, face: Face) =>
  block * 3 + (face === 'top' ? 0 : face === 'side' ? 1 : 2);
type Face = 'top' | 'side' | 'bottom';

/** Water's top face sits a little below the block's top, so lakes read as water from afar. */
export const WATER_TOP_DROP = 0.125;

/** Corner shading for 0 to 3 open neighbors around a corner. */
const AO_SHADE = [0.58, 0.72, 0.86, 1] as const;
/** Corners of a face in (u, v) order; the corner shading follows the same order. */
const CORNERS = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
] as const;

export interface VoxelMeshArrays {
  positions: Float32Array;
  normals: Float32Array;
  /** Texture coordinates in blocks (each whole number starts the picture again). */
  uvs: Float32Array;
  /** Texture layer per vertex (`faceLayer`). */
  layers: Float32Array;
  /** Corner shading per vertex, 0 to 1. */
  shades: Float32Array;
  indices: Uint32Array;
}

export interface VoxelChunkMesh {
  solid: VoxelMeshArrays;
  water: VoxelMeshArrays;
}

class MeshBuilder {
  readonly positions: number[] = [];
  readonly normals: number[] = [];
  readonly uvs: number[] = [];
  readonly layers: number[] = [];
  readonly shades: number[] = [];
  readonly indices: number[] = [];

  quad(
    corners: number[][],
    normal: number[],
    uvs: number[][],
    layer: number,
    ao: readonly number[],
    flip: boolean,
  ) {
    const base = this.positions.length / 3;
    for (let i = 0; i < 4; i += 1) {
      this.positions.push(...corners[i]!);
      this.normals.push(...normal);
      this.uvs.push(...uvs[i]!);
      this.layers.push(layer);
      this.shades.push(AO_SHADE[ao[i]!]!);
    }
    // Split along the diagonal with the more even shading, so shading never looks bent.
    const tri = ao[0]! + ao[2]! < ao[1]! + ao[3]! ? [1, 2, 3, 1, 3, 0] : [0, 1, 2, 0, 2, 3];
    if (flip) tri.reverse();
    for (const i of tri) this.indices.push(base + i);
  }

  build(): VoxelMeshArrays {
    return {
      positions: new Float32Array(this.positions),
      normals: new Float32Array(this.normals),
      uvs: new Float32Array(this.uvs),
      layers: new Float32Array(this.layers),
      shades: new Float32Array(this.shades),
      indices: new Uint32Array(this.indices),
    };
  }
}

/** Blocks treated as solid outside the place, so no faces are drawn toward the border. */
const OUTSIDE = Block.stone;

/**
 * Triangles of chunk (cx, cz) in world coordinates: solid blocks, and water separately (it is
 * drawn see-through after the ground).
 *
 * `step` 2 draws a far chunk with less detail: each cell is 2 x 2 x 2 blocks, solid when any of
 * them is (so far ground is never lower than the real ground next to it), showing its topmost
 * block (grass stays on top). Such a chunk also draws walls down its outer edges, which close any
 * gap to a neighbor drawn in full detail. Cells sit on even blocks everywhere, so far chunks
 * match each other.
 */
export function meshVoxelChunk(voxels: VoxelData, cx: number, cz: number, step: 1 | 2 = 1): VoxelChunkMesh {
  const S = VOXEL_CHUNK;
  const x0 = cx * S;
  const z0 = cz * S;
  // Layers with faces: from just under the lowest ground around the chunk to above the highest.
  let low = VOXEL_MAX_Y;
  let high = VOXEL_MIN_Y;
  for (let z = -1; z <= S; z += 1)
    for (let x = -1; x <= S; x += 1) {
      low = Math.min(low, voxels.floorHeight(x0 + x, z0 + z));
      high = Math.max(high, voxels.columnTop(x0 + x, z0 + z));
    }
  // Dug tunnels (P2-26) reach below the ground's top: in this chunk or across its border.
  for (let dz = -1; dz <= 1; dz += 1)
    for (let dx = -1; dx <= 1; dx += 1) low = Math.min(low, voxels.editedLow(cx + dx, cz + dz) ?? low);
  // Cells start on a whole step from the lowest layer, so every chunk's cells line up.
  const yLo = VOXEL_MIN_Y + Math.floor((Math.max(VOXEL_MIN_Y, low - 2) - VOXEL_MIN_Y) / step) * step;
  const yHi = Math.min(VOXEL_MAX_Y - 1, high + 1);

  const own = voxels.blocks(cx, cz);
  /** The block at a world position (outside the place: stone at the border, air above). */
  const fine = (wx: number, y: number, wz: number): number => {
    if (!voxels.inside(wx, wz)) return OUTSIDE;
    if (y < VOXEL_MIN_Y) return Block.stone;
    if (y >= VOXEL_MIN_Y + VOXEL_LAYERS) return Block.air;
    const x = wx - x0;
    const z = wz - z0;
    if (x >= 0 && x < S && z >= 0 && z < S) return own[((y - VOXEL_MIN_Y) * S + z) * S + x]!;
    return voxels.block(wx, y, wz);
  };
  /** A cell of `step` blocks a side: the topmost solid block in it, else water, else air. */
  const cell = (wx: number, y: number, wz: number): number => {
    if (step === 1) return fine(wx, y, wz);
    let wet = false;
    for (let dy = step - 1; dy >= 0; dy -= 1)
      for (let dz = 0; dz < step; dz += 1)
        for (let dx = 0; dx < step; dx += 1) {
          const block = fine(wx + dx, y + dy, wz + dz);
          if (isSolidBlock(block)) return block;
          if (block === Block.water) wet = true;
        }
    return wet ? Block.water : Block.air;
  };

  // A padded copy of the cells (one cell of the neighbors on every side), in local cell units.
  const N = S / step;
  const layers = Math.floor((yHi - yLo) / step) + 1;
  const P = N + 2;
  const pad = new Uint8Array(P * P * (layers + 2));
  const at = (x: number, y: number, z: number) => ((y + 1) * P + (z + 1)) * P + (x + 1);
  for (let y = -1; y <= layers; y += 1)
    for (let z = -1; z <= N; z += 1)
      for (let x = -1; x <= N; x += 1) pad[at(x, y, z)] = cell(x0 + x * step, yLo + y * step, z0 + z * step);
  const blockAt = (p: readonly number[]) => pad[at(p[0]!, p[1]!, p[2]!)]!;
  /** Far chunks: cells beside the chunk count as open, so edge walls are drawn (see above). */
  const beyondEdge = (p: readonly number[]) =>
    step > 1 && (p[0]! < 0 || p[0]! >= N || p[2]! < 0 || p[2]! >= N);

  const solid = new MeshBuilder();
  const water = new MeshBuilder();
  const start = [0, 0, 0];
  const size = [N, layers, N];

  for (let d = 0; d < 3; d += 1) {
    const u = (d + 1) % 3;
    const v = (d + 2) % 3;
    const w = size[u]!;
    const h = size[v]!;
    for (const sign of [1, -1] as const) {
      const face: Face = d === 1 ? (sign > 0 ? 'top' : 'bottom') : 'side';
      const solidMask = new Int32Array(w * h);
      const waterMask = new Int32Array(w * h);
      for (let s = start[d]!; s < start[d]! + size[d]!; s += 1) {
        solidMask.fill(0);
        waterMask.fill(0);
        for (let j = 0; j < h; j += 1)
          for (let i = 0; i < w; i += 1) {
            const p = [0, 0, 0];
            p[d] = s;
            p[u] = start[u]! + i;
            p[v] = start[v]! + j;
            const block = blockAt(p);
            const n = [...p];
            n[d] = n[d]! + sign;
            const next = blockAt(n);
            if (isSolidBlock(block)) {
              if (isSolidBlock(next) && !beyondEdge(n)) continue;
              // Corner shading from the three blocks around each corner in front of the face.
              let bits = 0;
              CORNERS.forEach(([cu, cv], corner) => {
                const du = cu ? 1 : -1;
                const dv = cv ? 1 : -1;
                const a = [...n];
                a[u] = a[u]! + du;
                const b = [...n];
                b[v] = b[v]! + dv;
                const c = [...a];
                c[v] = c[v]! + dv;
                const sa = isSolidBlock(blockAt(a)) ? 1 : 0;
                const sb = isSolidBlock(blockAt(b)) ? 1 : 0;
                const ao = sa && sb ? 0 : 3 - sa - sb - (isSolidBlock(blockAt(c)) ? 1 : 0);
                bits |= ao << (corner * 2);
              });
              solidMask[j * w + i] = 1 + faceLayer(block, face) + 128 * bits;
            } else if (block === Block.water && next === Block.air) {
              waterMask[j * w + i] = 1 + faceLayer(Block.water, face) + 128 * 0xff;
            }
          }
        emit(solidMask, solid, s, false);
        emit(waterMask, water, s, true);
      }

      /** Merges equal neighbors of one slice into rectangles and adds their quads. */
      function emit(mask: Int32Array, builder: MeshBuilder, slice: number, isWater: boolean) {
        for (let j = 0; j < h; j += 1)
          for (let i = 0; i < w;) {
            const key = mask[j * w + i]!;
            if (!key) {
              i += 1;
              continue;
            }
            let width = 1;
            while (i + width < w && mask[j * w + i + width] === key) width += 1;
            let height = 1;
            grow: while (j + height < h) {
              for (let k = 0; k < width; k += 1) if (mask[(j + height) * w + i + k] !== key) break grow;
              height += 1;
            }
            for (let dj = 0; dj < height; dj += 1) mask.fill(0, (j + dj) * w + i, (j + dj) * w + i + width);
            const bits = Math.floor((key - 1) / 128);
            const ao = [bits & 3, (bits >> 2) & 3, (bits >> 4) & 3, (bits >> 6) & 3];
            const corners: number[][] = [];
            const uvs: number[][] = [];
            for (const [cu, cv] of CORNERS) {
              const c = [0, 0, 0];
              c[d] = slice + (sign > 0 ? 1 : 0);
              c[u] = start[u]! + i + cu * width;
              c[v] = start[v]! + j + cv * height;
              c[0] = c[0]! * step + x0;
              c[1] = c[1]! * step + yLo;
              c[2] = c[2]! * step + z0;
              // Water tops stay at the water level, also in far chunks (their cells are taller).
              if (isWater && face === 'top') c[1] = Math.min(c[1]!, VOXEL_WATER_LEVEL) - WATER_TOP_DROP;
              corners.push(c);
              // Pictures: world x and z on tops and bottoms, upright (v = height) on the sides.
              uvs.push(d === 1 ? [c[0]!, c[2]!] : d === 0 ? [c[2]!, c[1]!] : [c[0]!, c[1]!]);
            }
            const normal = [0, 0, 0];
            normal[d] = sign;
            builder.quad(corners, normal, uvs, (key - 1) % 128, ao, sign < 0);
            i += width;
          }
      }
    }
  }
  return { solid: solid.build(), water: water.build() };
}
