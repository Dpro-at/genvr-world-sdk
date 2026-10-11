import type { Road } from '@genvr/contracts';
import { roadProfile } from './roads.js';
import {
  Block,
  NO_WATER,
  VOXEL_CHUNK,
  VOXEL_WATER_LEVEL,
  type BlockName,
  type VoxelColumns,
} from './voxel-generator.js';

/**
 * Roads on block ground (P2-26 stage 2): a road stays a line in the world document, and the
 * blocks under it follow. The bed is flat across and climbs in single steps at least
 * STEP_LENGTH apart; beside it the ground steps toward the bed one block per meter, so hills are
 * cut and dips filled in tidy terraces. Over water the bed stays one block above it (a causeway).
 */

/** Road types drawn with blocks, and their surface block (Core Library road type ids). */
export const VOXEL_ROAD_BLOCKS: Readonly<Record<string, BlockName>> = {
  'genvr.core.road.dirt': 'path',
  'genvr.core.road.street': 'paving',
  'genvr.core.road.fantasy': 'brick',
  'genvr.core.road.path': 'gravel',
};

/** Roads without a type are streets; types without blocks (rails) are paved too. */
export const voxelRoadBlock = (materialId: string | undefined): number =>
  Block[VOXEL_ROAD_BLOCKS[materialId ?? 'genvr.core.road.street'] ?? 'paving'];

/** Block under a road's surface, down to the stone. */
const UNDER: Partial<Record<number, number>> = {
  [Block.path]: Block.dirt,
  [Block.gravel]: Block.gravel,
};

/** Meters beside the bed where the ground steps toward it. */
export const VOXEL_ROAD_SHOULDER = 4;
/** Fewest meters between two height steps along a road. */
export const VOXEL_ROAD_STEP = 2;

export interface VoxelRoadPlan {
  block: number;
  halfWidth: number;
  /** Centerline points (about 1 m apart) with the bed height there (whole blocks). */
  xs: Float64Array;
  zs: Float64Array;
  heights: Int16Array;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
}

/** The bed of a road over ground `groundAt` (the generated ground, before any road). */
export function planVoxelRoad(road: Road, groundAt: (x: number, z: number) => number): VoxelRoadPlan {
  const samples = roadProfile({ heightAt: groundAt }, road.points);
  const heights = new Int16Array(samples.length);
  let current = Math.max(VOXEL_WATER_LEVEL + 1, Math.round(samples[0]?.height ?? 0));
  let lastStep = -Infinity;
  samples.forEach((sample, i) => {
    const target = Math.max(VOXEL_WATER_LEVEL + 1, Math.round(sample.height));
    if (target !== current && sample.distance - lastStep >= VOXEL_ROAD_STEP) {
      current += Math.sign(target - current);
      lastStep = sample.distance;
    }
    heights[i] = current;
  });
  const reach = road.width / 2 + VOXEL_ROAD_SHOULDER + 1;
  const bounds = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  for (const { x, z } of samples) {
    bounds.minX = Math.min(bounds.minX, x - reach);
    bounds.maxX = Math.max(bounds.maxX, x + reach);
    bounds.minZ = Math.min(bounds.minZ, z - reach);
    bounds.maxZ = Math.max(bounds.maxZ, z + reach);
  }
  return {
    block: voxelRoadBlock(road.materialId),
    halfWidth: road.width / 2,
    xs: Float64Array.from(samples, (s) => s.x),
    zs: Float64Array.from(samples, (s) => s.z),
    heights,
    bounds,
  };
}

/** Chunk keys ("cx,cz") a road plan changes. */
export function voxelRoadChunks(plan: VoxelRoadPlan): string[] {
  const keys: string[] = [];
  const { minX, maxX, minZ, maxZ } = plan.bounds;
  for (let cz = Math.floor(minZ / VOXEL_CHUNK); cz <= Math.floor(maxZ / VOXEL_CHUNK); cz += 1)
    for (let cx = Math.floor(minX / VOXEL_CHUNK); cx <= Math.floor(maxX / VOXEL_CHUNK); cx += 1)
      keys.push(`${cx},${cz}`);
  return keys;
}

/** Whether (x, z) is on the road's bed. */
export const onVoxelRoad = (plan: VoxelRoadPlan, x: number, z: number) =>
  x >= plan.bounds.minX &&
  x <= plan.bounds.maxX &&
  z >= plan.bounds.minZ &&
  z <= plan.bounds.maxZ &&
  nearest(plan, x, z, 0, Math.max(1, plan.xs.length - 1)).distance <= plan.halfWidth;

/** Distance from (x, z) to the road's centerline and the bed height at the closest point. */
function nearest(plan: VoxelRoadPlan, x: number, z: number, from: number, to: number) {
  let best = Infinity;
  let height = 0;
  for (let i = from; i < to; i += 1) {
    const ax = plan.xs[i]!;
    const az = plan.zs[i]!;
    const bx = plan.xs[i + 1] ?? ax;
    const bz = plan.zs[i + 1] ?? az;
    const dx = bx - ax;
    const dz = bz - az;
    const length = dx * dx + dz * dz;
    const t = length > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / length)) : 0;
    const px = ax + dx * t - x;
    const pz = az + dz * t - z;
    const d = px * px + pz * pz;
    if (d < best) {
      best = d;
      height = plan.heights[t < 0.5 ? i : Math.min(i + 1, plan.heights.length - 1)]!;
    }
  }
  return { distance: Math.sqrt(best), height };
}

/**
 * Stamps roads into one chunk's columns: shoulders of every road first, then every bed, so a bed
 * is never cut by a neighbor's shoulder.
 */
export function stampVoxelRoads(
  columns: VoxelColumns,
  cx: number,
  cz: number,
  plans: readonly VoxelRoadPlan[],
): void {
  const x0 = cx * VOXEL_CHUNK;
  const z0 = cz * VOXEL_CHUNK;
  const beds: Array<{ i: number; block: number; height: number }> = [];
  for (const plan of plans) {
    const reach = plan.halfWidth + VOXEL_ROAD_SHOULDER + 1;
    // Only centerline points near this chunk.
    let from = -1;
    let to = -1;
    for (let i = 0; i < plan.xs.length; i += 1) {
      const near =
        plan.xs[i]! > x0 - reach &&
        plan.xs[i]! < x0 + VOXEL_CHUNK + reach &&
        plan.zs[i]! > z0 - reach &&
        plan.zs[i]! < z0 + VOXEL_CHUNK + reach;
      if (!near) continue;
      if (from < 0) from = Math.max(0, i - 1);
      to = Math.min(plan.xs.length - 1, i + 1);
    }
    if (from < 0) continue;
    if (to === from) to = from + 1;
    for (let lz = 0; lz < VOXEL_CHUNK; lz += 1)
      for (let lx = 0; lx < VOXEL_CHUNK; lx += 1) {
        const { distance, height } = nearest(plan, x0 + lx + 0.5, z0 + lz + 0.5, from, to);
        const i = lz * VOXEL_CHUNK + lx;
        const beside = distance - plan.halfWidth;
        if (beside <= 0) beds.push({ i, block: plan.block, height });
        else if (beside <= VOXEL_ROAD_SHOULDER) {
          const steps = Math.ceil(beside);
          const ground = columns.ground[i]!;
          const shaped = Math.max(height - steps, Math.min(height + steps, ground));
          if (shaped !== ground) {
            columns.ground[i] = shaped;
            // Raised out of a lake: dry ground (sand at the shore, grass above it).
            if (ground < VOXEL_WATER_LEVEL && shaped >= VOXEL_WATER_LEVEL) columns.top[i] = Block.sand;
          }
        }
      }
  }
  for (const { i, block, height } of beds) {
    columns.ground[i] = height;
    columns.top[i] = block;
    columns.under[i] = UNDER[block] ?? Block.stone;
  }
  for (let i = 0; i < columns.ground.length; i += 1)
    columns.water[i] = columns.ground[i]! < VOXEL_WATER_LEVEL ? VOXEL_WATER_LEVEL : NO_WATER;
}
