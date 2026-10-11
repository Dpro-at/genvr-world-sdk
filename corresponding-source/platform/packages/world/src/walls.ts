import type { Wall, WallOpening } from '@genvr/contracts';
import { insidePolygon, type HeightUpdate, type TerrainData } from './terrain-data.js';

type Point = readonly [number, number];
type HeightAt = (x: number, z: number) => number;

export const WALL_THICKNESS = 0.3;
/**
 * Walls of a real building (Real place R4): drawn with a roof on top instead of a room floor, all such buildings in one
 * mesh. Other walls and rooms are unchanged.
 */
export const BUILDING_WALL_MATERIAL = 'genvr.core.wall.building';
/**
 * Looks a plain wall can have: its `materialId` names the Core ground material shown on it. A wall without one keeps
 * the light plaster bricks.
 */
export const WALL_SURFACES = {
  'old-stone': 'bricks-102',
  stone: 'sandstone-blocks-04',
  'old-brick': 'bricks-097',
  brick: 'bricks-104',
  'yellow-brick': 'bricks-105',
  concrete: 'concrete-wall-008',
  wood: 'weathered-plank-siding',
} as const;
export type WallSurface = keyof typeof WALL_SURFACES;
export const WALL_LIMITS = { maxLength: 1000, minSegment: 0.5 } as const;
/** Standard opening sizes used by the door and window tools. */
export const OPENING_PRESETS = {
  door: { width: 1.2, height: 2.2, bottom: 0 },
  window: { width: 1.4, height: 1.2, bottom: 1 },
} as const;
/** Solid wall kept between an opening and a corner, another opening, or the wall top. */
const OPENING_MARGIN = 0.2;
/** How far walls reach below the lowest ground, so slopes never show a gap. */
const FOOTING = 0.5;

/** Straight segments of a wall; a closed wall adds the segment back to the first point last. */
export function wallSegments(points: readonly Point[], closed: boolean): Array<[Point, Point]> {
  const segments: Array<[Point, Point]> = [];
  for (let i = 1; i < points.length; i += 1) segments.push([points[i - 1]!, points[i]!]);
  if (closed) segments.push([points[points.length - 1]!, points[0]!]);
  return segments;
}

const segmentLength = ([a, b]: [Point, Point]) => Math.hypot(b[0] - a[0], b[1] - a[1]);

/** Problems with a wall's shape, or null when it can be built. */
export function wallShapeError(points: readonly Point[], closed: boolean): string | null {
  if (closed && points.length < 3) return 'A room needs at least 3 corners.';
  const segments = wallSegments(points, closed);
  if (segments.some((segment) => segmentLength(segment) < WALL_LIMITS.minSegment))
    return 'Wall corners are too close together.';
  if (segments.reduce((sum, segment) => sum + segmentLength(segment), 0) > WALL_LIMITS.maxLength)
    return `Walls can be at most ${WALL_LIMITS.maxLength} m long.`;
  return null;
}

/** Problems with placing an opening in a wall, or null when it fits. */
export function openingError(wall: Wall, opening: WallOpening, ignoreId?: string): string | null {
  const segments = wallSegments(wall.points, wall.closed);
  const segment = segments[opening.segment];
  if (!segment) return 'That wall segment does not exist.';
  const length = segmentLength(segment);
  const left = opening.offset - opening.width / 2;
  const right = opening.offset + opening.width / 2;
  if (left < OPENING_MARGIN || right > length - OPENING_MARGIN) return 'It does not fit on this wall.';
  if (opening.bottom + opening.height > wall.height - OPENING_MARGIN) return 'The wall is too low for it.';
  for (const other of wall.openings) {
    if (other.id === ignoreId || other.segment !== opening.segment) continue;
    const otherLeft = other.offset - other.width / 2;
    const otherRight = other.offset + other.width / 2;
    if (left >= otherRight + OPENING_MARGIN || right <= otherLeft - OPENING_MARGIN) continue;
    // Openings may stack (a window on every storey, Real place R4a) when they share one span and keep the margin
    // between them vertically.
    const sameSpan = Math.abs(left - otherLeft) < 1e-6 && Math.abs(right - otherRight) < 1e-6;
    const apart =
      opening.bottom >= other.bottom + other.height + OPENING_MARGIN ||
      other.bottom >= opening.bottom + opening.height + OPENING_MARGIN;
    if (!sameSpan || !apart) return 'It overlaps another door or window.';
  }
  return null;
}

export const sortOpenings = (openings: WallOpening[]) =>
  openings.sort((a, b) => a.segment - b.segment || a.offset - b.offset || (a.id < b.id ? -1 : 1));

function samplesAlong([a, b]: [Point, Point]): Point[] {
  const count = Math.max(1, Math.ceil(segmentLength([a, b])));
  const out: Point[] = [];
  for (let i = 0; i <= count; i += 1) {
    const t = i / count;
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return out;
}

/** Ground kept flat around a room's outline, and the slope back to natural ground beyond it. */
const ROOM_PAD = 1.5;
const ROOM_SHOULDER = 4;

const smoothstep = (t: number) => t * t * (3 - 2 * t);

function distanceToOutline(x: number, z: number, points: readonly Point[]) {
  let best = Infinity;
  for (const [a, b] of wallSegments(points, true)) {
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const t = Math.min(1, Math.max(0, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
    best = Math.min(best, Math.hypot(x - (a[0] + dx * t), z - (a[1] + dz * t)));
  }
  return best;
}

/**
 * Plans flattening the ground under a room to the average height of its outline, so the floor,
 * doors, and the ground outside line up (kids never get a room they cannot walk into).
 */
export function planRoomGrading(terrain: TerrainData, points: readonly Point[]): HeightUpdate[] {
  const samples = wallSegments(points, true).flatMap(samplesAlong);
  const level = samples.reduce((sum, [x, z]) => sum + terrain.heightAt(x, z), 0) / samples.length;
  const reach = ROOM_PAD + ROOM_SHOULDER;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [x, z] of points) {
    minX = Math.min(minX, x - reach);
    maxX = Math.max(maxX, x + reach);
    minZ = Math.min(minZ, z - reach);
    maxZ = Math.max(maxZ, z + reach);
  }
  return terrain.planHeights({ minX, maxX, minZ, maxZ }, (x, z, current) => {
    if (insidePolygon(x, z, points)) return level;
    const distance = distanceToOutline(x, z, points);
    if (distance <= ROOM_PAD) return level;
    if (distance >= reach) return undefined;
    return level + (current - level) * smoothstep((distance - ROOM_PAD) / ROOM_SHOULDER);
  });
}

/** Floor height of a closed wall (room): the highest ground on its outline and inside it. */
export function roomFloorLevel(wall: Wall, heightAt: HeightAt): number | null {
  if (!wall.closed) return null;
  let level = -Infinity;
  for (const segment of wallSegments(wall.points, true))
    for (const [x, z] of samplesAlong(segment)) level = Math.max(level, heightAt(x, z));
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
  for (let z = Math.ceil(minZ); z <= maxZ; z += 1)
    for (let x = Math.ceil(minX); x <= maxX; x += 1)
      if (insidePolygon(x, z, wall.points)) level = Math.max(level, heightAt(x, z));
  return level + 0.05;
}

/** A solid block of wall: center, half extents (along the wall, up, thickness), rotation about Y. */
export interface WallBox {
  center: [number, number, number];
  half: [number, number, number];
  /** Rotation about the vertical axis (right-handed, same as three.js and Rapier). */
  yaw: number;
}

/**
 * Splits a wall into solid boxes around its doors and windows. The same boxes are used for
 * rendering and for physics colliders, so what players see is exactly what they bump into.
 */
export function wallBoxes(wall: Wall, heightAt: HeightAt): WallBox[] {
  const boxes: WallBox[] = [];
  const floor = roomFloorLevel(wall, heightAt);
  const half = WALL_THICKNESS / 2;
  wallSegments(wall.points, wall.closed).forEach((segment, index) => {
    const [a, b] = segment;
    const length = segmentLength(segment);
    const heights = samplesAlong(segment).map(([x, z]) => heightAt(x, z));
    const base = floor ?? Math.max(...heights);
    const bottom = Math.min(...heights) - FOOTING;
    const top = base + wall.height;
    const dx = (b[0] - a[0]) / length;
    const dz = (b[1] - a[1]) / length;
    const yaw = Math.atan2(-dz, dx);
    const piece = (u0: number, u1: number, y0: number, y1: number) => {
      if (u1 - u0 < 0.01 || y1 - y0 < 0.01) return;
      const u = (u0 + u1) / 2;
      boxes.push({
        center: [a[0] + dx * u, (y0 + y1) / 2, a[1] + dz * u],
        half: [(u1 - u0) / 2, (y1 - y0) / 2, half],
        yaw,
      });
    };
    // Extend each end by half the thickness so corners close.
    let cursor = -half;
    // Openings sharing one span (stacked storeys) are one column: solid wall between them, below and above.
    const columns: WallOpening[][] = [];
    for (const opening of wall.openings.filter((o) => o.segment === index)) {
      const last = columns[columns.length - 1];
      if (last && Math.abs(last[0]!.offset - opening.offset) < 1e-6 && Math.abs(last[0]!.width - opening.width) < 1e-6)
        last.push(opening);
      else columns.push([opening]);
    }
    for (const column of columns) {
      const left = column[0]!.offset - column[0]!.width / 2;
      const right = column[0]!.offset + column[0]!.width / 2;
      piece(cursor, left, bottom, top);
      let y = bottom;
      for (const opening of column.slice().sort((a, b) => a.bottom - b.bottom)) {
        piece(left, right, y, base + opening.bottom);
        y = base + opening.bottom + opening.height;
      }
      piece(left, right, y, top);
      cursor = right;
    }
    piece(cursor, length + half, bottom, top);
  });
  return boxes;
}

/** Segment index and distance along it of the point on the wall nearest to (x, z). */
export function nearestWallPosition(wall: Wall, x: number, z: number) {
  let best = { segment: 0, offset: 0, distance: Infinity };
  wallSegments(wall.points, wall.closed).forEach(([a, b], segment) => {
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const lengthSq = dx * dx + dz * dz || 1;
    const t = Math.min(1, Math.max(0, ((x - a[0]) * dx + (z - a[1]) * dz) / lengthSq));
    const distance = Math.hypot(x - (a[0] + dx * t), z - (a[1] + dz * t));
    if (distance < best.distance) best = { segment, offset: t * Math.sqrt(lengthSq), distance };
  });
  return best;
}

/** A door cut into a wall: where its sill is and which way it faces (P2-11 door check). */
export interface DoorSpot {
  wallId: string;
  openingId: string;
  /** Middle of the doorway on the ground plane. */
  x: number;
  z: number;
  /** Height of the door's lower edge. */
  sill: number;
  /** Unit direction across the wall (either side is checked). */
  normal: [number, number];
  width: number;
}

/** Every door opening of a wall with its sill height, the same base as `wallBoxes`. */
export function doorSpots(wall: Wall, heightAt: HeightAt): DoorSpot[] {
  const floor = roomFloorLevel(wall, heightAt);
  const segments = wallSegments(wall.points, wall.closed);
  return wall.openings
    .filter((opening) => opening.kind === 'door')
    .flatMap((opening) => {
      const segment = segments[opening.segment];
      if (!segment) return [];
      const [a, b] = segment;
      const length = segmentLength(segment);
      const dx = (b[0] - a[0]) / length;
      const dz = (b[1] - a[1]) / length;
      const base = floor ?? Math.max(...samplesAlong(segment).map(([x, z]) => heightAt(x, z)));
      return [
        {
          wallId: wall.id,
          openingId: opening.id,
          x: a[0] + dx * opening.offset,
          z: a[1] + dz * opening.offset,
          sill: base + opening.bottom,
          normal: [-dz, dx] as [number, number],
          width: opening.width,
        },
      ];
    });
}
