import type { Wall } from '@genvr/contracts';
import { insidePolygon } from './terrain-data.js';
import {
  Block,
  NO_WATER,
  NO_WALL,
  VOXEL_CHUNK,
  VOXEL_MAX_Y,
  VOXEL_WATER_LEVEL,
  type VoxelColumns,
} from './voxel-generator.js';
import { wallSegments } from './walls.js';

/**
 * Walls on block ground (P2-26 stage 3): a wall stays a line in the world document, and the
 * blocks follow it: one block thick, from the ground up to a flat top (the highest ground under
 * the wall plus its height), a row of cobble at the base and planks above, doors and windows as
 * holes, and a plank floor inside a closed room at the level of the wall's base.
 */

export interface VoxelWallPlan {
  /** Wall cells ("x,z" of the block column) with their opening, if any. */
  cells: Map<string, { holeLow: number; holeHigh: number; door: boolean }>;
  /** Floor cells of a closed room. */
  floor: Set<string>;
  base: number;
  top: number;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
}

const cellKey = (x: number, z: number) => `${x},${z}`;

/** Block columns along a segment, joined edge to edge so the wall has no diagonal gaps. */
function rasterize(
  a: readonly [number, number],
  b: readonly [number, number],
): Array<[number, number, number]> {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const steps = Math.max(1, Math.ceil(length / 0.2));
  const out: Array<[number, number, number]> = [];
  let last: [number, number] | null = null;
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const x = Math.floor(a[0] + (b[0] - a[0]) * t);
    const z = Math.floor(a[1] + (b[1] - a[1]) * t);
    if (last && last[0] === x && last[1] === z) continue;
    // A diagonal step gets the corner cell too.
    if (last && last[0] !== x && last[1] !== z) out.push([x, last[1], t * length]);
    out.push([x, z, t * length]);
    last = [x, z];
  }
  return out;
}

/** The blocks of a wall over ground `groundAt` (the ground before walls). */
export function planVoxelWall(wall: Wall, groundAt: (x: number, z: number) => number): VoxelWallPlan {
  const segments = wallSegments(wall.points, wall.closed);
  const cells = new Map<string, { holeLow: number; holeHigh: number; door: boolean }>();
  const along: Array<{ key: string; segment: number; distance: number }> = [];
  segments.forEach(([a, b], segment) => {
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const length = Math.hypot(dx, dz) || 1;
    for (const [x, z] of rasterize(a, b)) {
      const key = cellKey(x, z);
      if (!cells.has(key)) cells.set(key, { holeLow: 0, holeHigh: 0, door: false });
      // Where the column's middle lies along the segment (openings are measured the same way).
      const distance = ((x + 0.5 - a[0]) * dx + (z + 0.5 - a[1]) * dz) / length;
      along.push({ key, segment, distance });
    }
  });
  let base = -Infinity;
  for (const key of cells.keys()) {
    const [x, z] = key.split(',').map(Number) as [number, number];
    base = Math.max(base, groundAt(x, z));
  }
  base = Math.max(base, VOXEL_WATER_LEVEL);
  const top = Math.min(VOXEL_MAX_Y - 1, base + Math.max(1, Math.round(wall.height)));
  for (const opening of wall.openings) {
    const low = base + Math.round(opening.bottom);
    const high = Math.min(top - 1, Math.max(low + 1, base + Math.round(opening.bottom + opening.height)));
    const hole = { holeLow: low, holeHigh: high, door: opening.kind === 'door' };
    const onSegment = along.filter(({ segment }) => segment === opening.segment);
    const within = onSegment.filter(
      ({ distance }) => Math.abs(distance - opening.offset) < opening.width / 2,
    );
    // Every opening gets at least the column nearest to its middle.
    const nearest = onSegment.reduce<(typeof onSegment)[number] | null>(
      (best, cell) =>
        !best || Math.abs(cell.distance - opening.offset) < Math.abs(best.distance - opening.offset)
          ? cell
          : best,
      null,
    );
    for (const { key } of within.length ? within : nearest ? [nearest] : []) cells.set(key, hole);
  }
  const floor = new Set<string>();
  const bounds = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  for (const [x, z] of wall.points) {
    bounds.minX = Math.min(bounds.minX, x - 1);
    bounds.maxX = Math.max(bounds.maxX, x + 1);
    bounds.minZ = Math.min(bounds.minZ, z - 1);
    bounds.maxZ = Math.max(bounds.maxZ, z + 1);
  }
  if (wall.closed)
    for (let z = Math.floor(bounds.minZ); z <= bounds.maxZ; z += 1)
      for (let x = Math.floor(bounds.minX); x <= bounds.maxX; x += 1) {
        const key = cellKey(x, z);
        if (!cells.has(key) && insidePolygon(x + 0.5, z + 0.5, wall.points)) floor.add(key);
      }
  return { cells, floor, base, top, bounds };
}

/** Chunk keys ("cx,cz") a wall plan changes. */
export function voxelWallChunks(plan: VoxelWallPlan): string[] {
  const keys: string[] = [];
  const { minX, maxX, minZ, maxZ } = plan.bounds;
  for (let cz = Math.floor(minZ / VOXEL_CHUNK); cz <= Math.floor(maxZ / VOXEL_CHUNK); cz += 1)
    for (let cx = Math.floor(minX / VOXEL_CHUNK); cx <= Math.floor(maxX / VOXEL_CHUNK); cx += 1)
      keys.push(`${cx},${cz}`);
  return keys;
}

/** The wall whose blocks stand in column (x, z), or null. */
export const onVoxelWall = (plan: VoxelWallPlan, x: number, z: number) =>
  plan.cells.has(cellKey(Math.floor(x), Math.floor(z)));

/** Stamps walls and room floors into one chunk's columns (after the roads). */
export function stampVoxelWalls(
  columns: VoxelColumns,
  cx: number,
  cz: number,
  plans: readonly VoxelWallPlan[],
): void {
  const x0 = cx * VOXEL_CHUNK;
  const z0 = cz * VOXEL_CHUNK;
  for (const plan of plans) {
    for (let lz = 0; lz < VOXEL_CHUNK; lz += 1)
      for (let lx = 0; lx < VOXEL_CHUNK; lx += 1) {
        const key = cellKey(x0 + lx, z0 + lz);
        const i = lz * VOXEL_CHUNK + lx;
        const cell = plan.cells.get(key);
        if (cell) {
          columns.wallTop[i] = Math.max(columns.wallTop[i] === NO_WALL ? 0 : columns.wallTop[i]!, plan.top);
          columns.wallBlock[i] = Block.planks;
          columns.holeLow[i] = cell.holeLow;
          columns.holeHigh[i] = cell.holeHigh;
          columns.door[i] = cell.door ? 1 : 0;
          // A wall standing in water keeps its column dry.
          columns.water[i] = NO_WATER;
        } else if (plan.floor.has(key)) {
          columns.ground[i] = plan.base;
          columns.top[i] = Block.planks;
          columns.under[i] = Block.dirt;
          columns.water[i] = NO_WATER;
        }
      }
  }
}
