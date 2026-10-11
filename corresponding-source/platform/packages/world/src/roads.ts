import type { WaterBody } from '@genvr/contracts';
import { insidePolygon, type HeightUpdate, type TerrainData } from './terrain-data.js';

type Point = readonly [number, number];

export const ROAD_LIMITS = {
  /** Total length of the control polyline in meters. */
  maxLength: 1000,
  /** Shortest distance between two control points. */
  minSegment: 1,
} as const;

/** Meters of sloped ground between the flat road bed and the untouched terrain. */
const SHOULDER = 4;
/** Distance over which the road height profile is averaged, so roads climb hills gently. */
const PROFILE_RADIUS = 10;

export const polylineLength = (points: readonly Point[]) => {
  let length = 0;
  for (let i = 1; i < points.length; i += 1) {
    const [ax, az] = points[i - 1]!;
    const [bx, bz] = points[i]!;
    length += Math.hypot(bx - ax, bz - az);
  }
  return length;
};

/**
 * Smooth centerline through the control points (Catmull-Rom), sampled about every `step`
 * meters. Always passes through every control point; two points give a straight line.
 */
export function roadCenterline(points: readonly Point[], step = 1): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const at = (i: number) => points[Math.min(points.length - 1, Math.max(0, i))]!;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const count = Math.max(1, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
    for (let s = 0; s < count; s += 1) {
      const t = s / count;
      const t2 = t * t;
      const t3 = t2 * t;
      const blend = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([blend(p0[0], p1[0], p2[0], p3[0]), blend(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  const last = points[points.length - 1]!;
  out.push([last[0], last[1]]);
  return out;
}

/** Problems with a road's shape, or null when it can be built. */
export function roadShapeError(points: readonly Point[]): string | null {
  for (let i = 1; i < points.length; i += 1) {
    const [ax, az] = points[i - 1]!;
    const [bx, bz] = points[i]!;
    if (Math.hypot(bx - ax, bz - az) < ROAD_LIMITS.minSegment) return 'Road points are too close together.';
  }
  if (polylineLength(points) > ROAD_LIMITS.maxLength)
    return `Roads can be at most ${ROAD_LIMITS.maxLength} m long.`;
  return null;
}

const smoothstep = (t: number) => t * t * (3 - 2 * t);

/** Bridges: deck height above the water, ramp steepness, and dry land kept under each end. */
export const BRIDGE = { clearance: 1.2, rampSlope: 0.12, abutment: 2 } as const;

/** One point on a road's centerline with the height the road surface should have there. */
export interface RoadSample {
  x: number;
  z: number;
  /** Meters from the start of the road. */
  distance: number;
  height: number;
  /** True where the road is a bridge (over water, including a short abutment on each shore). */
  bridge: boolean;
  /** True where the road is over water (the ground there is never graded). */
  overWater: boolean;
}

/**
 * Height profile of a road: the natural ground smoothed along the road so it climbs hills
 * gently, raised to a bridge deck over water with ramps on both sides. Deterministic, so the
 * browser, the server, and the renderer agree.
 */
export function roadProfile(
  /** The ground under the road: the height field, or block ground (P2-26). */
  terrain: Pick<TerrainData, 'heightAt'>,
  points: readonly Point[],
  water: readonly WaterBody[] = [],
): RoadSample[] {
  const line = roadCenterline(points);
  const distances = [0];
  for (let i = 1; i < line.length; i += 1) {
    const [ax, az] = line[i - 1]!;
    const [bx, bz] = line[i]!;
    distances.push(distances[i - 1]! + Math.hypot(bx - ax, bz - az));
  }

  // Moving average over distance (two passes approximate a gentle curve).
  let profile = line.map(([x, z]) => terrain.heightAt(x, z));
  for (let pass = 0; pass < 2; pass += 1) {
    const source = profile;
    profile = source.map((_, i) => {
      let sum = 0;
      let count = 0;
      for (let j = i; j >= 0 && distances[i]! - distances[j]! <= PROFILE_RADIUS; j -= 1) {
        sum += source[j]!;
        count += 1;
      }
      for (let j = i + 1; j < source.length && distances[j]! - distances[i]! <= PROFILE_RADIUS; j += 1) {
        sum += source[j]!;
        count += 1;
      }
      return sum / count;
    });
  }

  // Toward both ends the road meets the natural ground (no dip or step where it starts).
  const total = distances[distances.length - 1] ?? 0;
  const ground = line.map(([x, z]) => terrain.heightAt(x, z));
  profile = profile.map((h, i) => {
    const fromEnd = Math.min(distances[i]!, total - distances[i]!);
    const w = Math.min(1, fromEnd / PROFILE_RADIUS);
    return ground[i]! + (h - ground[i]!) * w;
  });

  // Samples over water get a deck; everything near a deck ramps up to it.
  const deck = line.map(([x, z]) => {
    let level = -Infinity;
    for (const body of water) {
      if (body.level > terrain.heightAt(x, z) - 0.01 && insidePolygon(x, z, body.area))
        level = Math.max(level, body.level + BRIDGE.clearance);
    }
    return level;
  });
  const decks = deck.flatMap((level, i) => (Number.isFinite(level) ? [i] : []));
  return line.map(([x, z], i) => {
    let height = profile[i]!;
    let bridge = false;
    for (const j of decks) {
      const gap = Math.abs(distances[i]! - distances[j]!);
      height = Math.max(height, deck[j]! - gap * BRIDGE.rampSlope);
      if (gap <= BRIDGE.abutment) bridge = true;
    }
    return { x, z, distance: distances[i]!, height, bridge, overWater: Number.isFinite(deck[i]!) };
  });
}

/**
 * Plans the terrain changes that give a road a flat bed: the ground under the road follows a
 * smoothed height profile along the centerline, and blends back to the natural ground over a
 * shoulder on both sides. Deterministic, so every client and the server grade identically.
 */
export function planRoadGrading(
  terrain: TerrainData,
  points: readonly Point[],
  width: number,
  water: readonly WaterBody[] = [],
): HeightUpdate[] {
  const samples = roadProfile(terrain, points, water);
  const line = samples.map((s) => [s.x, s.z] as const);
  const profile = samples.map((s) => s.height);

  // Nearest centerline point for every grid vertex near the road.
  const sp = terrain.spacing;
  const flat = width / 2 + sp;
  const reach = flat + SHOULDER;
  const nearest = new Map<number, { distance: number; height: number; overWater: boolean }>();
  const key = (gx: number, gz: number) => (gx + 50_000) * 100_000 + (gz + 50_000);
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < line.length - 1; i += 1) {
    const [ax, az] = line[i]!;
    const [bx, bz] = line[i + 1]!;
    const dx = bx - ax;
    const dz = bz - az;
    const lengthSq = dx * dx + dz * dz || 1;
    const x0 = Math.min(ax, bx) - reach;
    const x1 = Math.max(ax, bx) + reach;
    const z0 = Math.min(az, bz) - reach;
    const z1 = Math.max(az, bz) + reach;
    minX = Math.min(minX, x0);
    maxX = Math.max(maxX, x1);
    minZ = Math.min(minZ, z0);
    maxZ = Math.max(maxZ, z1);
    for (let gz = Math.ceil(z0 / sp); gz <= Math.floor(z1 / sp); gz += 1) {
      for (let gx = Math.ceil(x0 / sp); gx <= Math.floor(x1 / sp); gx += 1) {
        const x = gx * sp;
        const z = gz * sp;
        const t = Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / lengthSq));
        const distance = Math.hypot(x - (ax + dx * t), z - (az + dz * t));
        if (distance > reach) continue;
        const k = key(gx, gz);
        const existing = nearest.get(k);
        if (existing && existing.distance <= distance) continue;
        nearest.set(k, {
          distance,
          height: profile[i]! + (profile[i + 1]! - profile[i]!) * t,
          overWater: t < 0.5 ? samples[i]!.overWater : samples[i + 1]!.overWater,
        });
      }
    }
  }

  return terrain.planHeights({ minX, maxX, minZ, maxZ }, (x, z, current) => {
    const hit = nearest.get(key(Math.round(x / sp), Math.round(z / sp)));
    // Over water the ground (the lake bed) stays as it is; the shore ends become embankments.
    if (!hit || hit.overWater) return undefined;
    if (hit.distance <= flat) return hit.height;
    const f = smoothstep((hit.distance - flat) / SHOULDER);
    return hit.height + (current - hit.height) * f;
  });
}
