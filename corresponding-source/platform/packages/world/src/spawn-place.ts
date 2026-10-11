import type { WorldDocument } from '@genvr/contracts';
import { SIZE_TIERS } from '@genvr/contracts';
import { insidePolygon } from './terrain-data.js';
import { WALL_THICKNESS, wallSegments } from './walls.js';

/**
 * Where a player may arrive (owner, 2026-10-07): on a street or open ground, never inside a house or any other
 * object. A Real place build puts houses over an old start point, and creators move walls and items after setting
 * one, so the start point is checked where it is used and moved to the nearest free street (else open ground).
 */

/** Metres kept free between a player and a wall line: the player's radius and a little room. */
export const SPAWN_CLEARANCE = 0.6;
/** How far a start point is moved at most, metres. */
export const SPAWN_REACH = 300;
/** Spacing of the points tried along streets and around the start, metres. */
const STEP = 1.5;

type Point = readonly [number, number];

function segmentDistance(x: number, z: number, [a, b]: [Point, Point]): number {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const length = dx * dx + dz * dz;
  const t = length > 0 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / length)) : 0;
  return Math.hypot(x - (a[0] + t * dx), z - (a[1] + t * dz));
}

/** Walls with their bounds, so far ones are skipped at once. */
function wallIndex(doc: WorldDocument) {
  const margin = WALL_THICKNESS / 2 + SPAWN_CLEARANCE;
  return doc.walls.map((wall) => {
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const [x, z] of wall.points) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
    }
    return {
      wall,
      segments: wallSegments(wall.points, wall.closed),
      box: [minX - margin, maxX + margin, minZ - margin, maxZ + margin] as const,
    };
  });
}

/** True when a player standing at (x, z) would be inside a closed building or room, or touch a wall. */
export function insideBuilding(doc: WorldDocument, x: number, z: number): boolean {
  return blockedByWalls(wallIndex(doc), x, z);
}

function blockedByWalls(walls: ReturnType<typeof wallIndex>, x: number, z: number): boolean {
  const margin = WALL_THICKNESS / 2 + SPAWN_CLEARANCE;
  for (const { wall, segments, box } of walls) {
    if (x < box[0] || x > box[1] || z < box[2] || z > box[3]) continue;
    if (wall.closed && insidePolygon(x, z, wall.points)) return true;
    if (segments.some((segment) => segmentDistance(x, z, segment) < margin)) return true;
  }
  return false;
}

/** Points along the place's roads, every `STEP` metres, streets and lanes before other roads. */
function streetPoints(doc: WorldDocument): Point[] {
  const ranked = [...doc.roads].sort(
    (a, b) => Number(!/\.(street|lane)$/.test(a.materialId ?? '')) - Number(!/\.(street|lane)$/.test(b.materialId ?? '')),
  );
  const points: Point[] = [];
  for (const road of ranked)
    for (const [a, b] of wallSegments(road.points, false)) {
      const steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / STEP));
      for (let i = 0; i <= steps; i += 1)
        points.push([a[0] + ((b[0] - a[0]) * i) / steps, a[1] + ((b[1] - a[1]) * i) / steps]);
    }
  return points;
}

export interface FreeSpawn {
  x: number;
  z: number;
  /** False when (x, z) was already free. */
  moved: boolean;
}

/**
 * A free place to stand at or near (x, z): (x, z) itself when nothing is there, else the nearest street point that is
 * free, else the nearest free open ground around it. `blocked` adds the caller's own test (items, which only the
 * studio can size). Stays inside the place; returns (x, z) unmoved when nothing free is within `SPAWN_REACH`.
 */
export function freeSpawnPoint(
  doc: WorldDocument,
  x: number,
  z: number,
  blocked: (x: number, z: number) => boolean = () => false,
): FreeSpawn {
  const walls = wallIndex(doc);
  const half = SIZE_TIERS[doc.sizeTier].sideMeters / 2 - 1;
  const free = (px: number, pz: number) =>
    Math.abs(px) <= half && Math.abs(pz) <= half && !blockedByWalls(walls, px, pz) && !blocked(px, pz);
  if (free(x, z)) return { x, z, moved: false };
  // The nearest free street first: players should start where they can walk off.
  const streets = streetPoints(doc)
    .map((p) => ({ p, d: Math.hypot(p[0] - x, p[1] - z) }))
    .filter(({ d }) => d <= SPAWN_REACH)
    .sort((a, b) => a.d - b.d);
  for (const { p } of streets) if (free(p[0], p[1])) return { x: p[0], z: p[1], moved: true };
  // No street: open ground on rings around the start, nearest first.
  for (let r = STEP; r <= SPAWN_REACH; r += STEP) {
    const count = Math.max(8, Math.ceil((2 * Math.PI * r) / STEP));
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * 2 * Math.PI;
      const px = x + Math.cos(angle) * r;
      const pz = z + Math.sin(angle) * r;
      if (free(px, pz)) return { x: px, z: pz, moved: true };
    }
  }
  return { x, z, moved: false };
}
