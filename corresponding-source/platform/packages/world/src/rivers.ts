import { RIVER_LIMITS, type River, type WaterBody, type WorldDocument } from '@genvr/contracts';
import { roadCenterline, polylineLength } from './roads.js';
import { insidePolygon, type HeightUpdate, type TerrainData } from './terrain-data.js';
import { waterSurfaceAt } from './water.js';

type Point = readonly [number, number];

/**
 * Rivers (P2-39): a drawn line becomes a bed carved into the ground whose water surface always
 * runs downhill. Nothing about the levels is stored in the world document: everything here is
 * derived from the terrain, so the browser, the server, and the renderer agree and sculpting a
 * hill moves the river with it.
 */

/** Meters the surface falls per meter of river at the very least, so it never runs uphill. */
const MIN_FALL = 0.02;
/** Distance over which the natural ground is averaged, so a river ignores small bumps. */
const PROFILE_RADIUS = 8;
/** Slope from which a stretch is rapids (white water, faster current). */
const RAPIDS_SLOPE = 0.08;
/** A drop of this many meters within `WATERFALL_SPAN` meters is a waterfall. */
const WATERFALL_DROP = 1.5;
const WATERFALL_SPAN = 3;
/** Meters over which the surface blends to a lake or the sea at the river's mouth. */
const MOUTH_BLEND = 3;
/** Banks slope up to the natural ground over this share of the river's width on each side. */
const BANK = 0.4;
/** How far out a bank may reach to meet the ground (m). */
const BANK_REACH_MAX = 60;
/** Samples (1 m apart) taken together per stretch of bed when a bank has a slope limit. */
const BANK_STRIDE = 4;
/** How much faster the current runs per unit of slope, and the most it can multiply. */
const FLOW_PER_SLOPE = 8;
const MAX_FLOW_FACTOR = 3;

export type RiverStretch = 'calm' | 'rapids' | 'waterfall' | 'mouth';

/** One point along a river's centerline, one per meter. */
export interface RiverSample {
  x: number;
  z: number;
  /** Meters from the start of the river. */
  distance: number;
  /** Height of the carved bed. */
  bed: number;
  /** Height of the water surface (always falling along the river). */
  surface: number;
  /** How steeply the surface falls here (meters per meter, never negative). */
  slope: number;
  /** The river's width at this point; it widens toward the mouth. */
  width: number;
  kind: RiverStretch;
}

/** A river's shape with its derived samples, used for drawing and for the current. */
export interface RiverProfile {
  id: string;
  flow: number;
  samples: RiverSample[];
}

/** How deep a river of this width is, in meters. */
export const riverDepth = (width: number) => Math.min(3.5, Math.max(0.4, 0.3 + width * 0.08));

/** Problems with a river's shape, or null when it can be built. */
export function riverShapeError(points: readonly Point[]): string | null {
  for (let i = 1; i < points.length; i += 1) {
    const [ax, az] = points[i - 1]!;
    const [bx, bz] = points[i]!;
    if (Math.hypot(bx - ax, bz - az) < RIVER_LIMITS.minSegment) return 'River points are too close together.';
  }
  if (polylineLength(points) > RIVER_LIMITS.maxLength)
    return `Rivers can be at most ${RIVER_LIMITS.maxLength} m long.`;
  return null;
}

/** Water level of a lake or the sea at a point, or null where there is none. */
function standingWaterAt(
  x: number,
  z: number,
  water: readonly WaterBody[],
  sea: number | null,
): number | null {
  let level: number | null = sea;
  for (const body of water) {
    if (insidePolygon(x, z, body.area) && (level === null || body.level > level)) level = body.level;
  }
  return level;
}

/**
 * Samples a river every meter: the bed carved into the ground, the water surface that always
 * falls, how steep each stretch is, and whether it is calm water, rapids, a waterfall, or the
 * mouth where the river meets a lake or the sea and stops by itself.
 */
export function riverProfile(
  terrain: Pick<TerrainData, 'heightAt'>,
  points: readonly Point[],
  width: number,
  widen = 1.3,
  water: readonly WaterBody[] = [],
  sea: number | null = null,
): RiverSample[] {
  const line = roadCenterline(points);
  const distances = [0];
  for (let i = 1; i < line.length; i += 1) {
    const [ax, az] = line[i - 1]!;
    const [bx, bz] = line[i]!;
    distances.push(distances[i - 1]! + Math.hypot(bx - ax, bz - az));
  }
  const total = distances[distances.length - 1] || 1;

  // The natural ground smoothed along the line, so the bed ignores small bumps.
  const ground = line.map(([x, z]) => terrain.heightAt(x, z));
  let smooth = ground;
  for (let pass = 0; pass < 2; pass += 1) {
    const source = smooth;
    smooth = source.map((_, i) => {
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

  const widthAt = (i: number) => width * (1 + (widen - 1) * (distances[i]! / total));

  // The surface falls by at least MIN_FALL per meter, so where the ground rises the river cuts
  // into it; where the ground falls faster, the river follows it down.
  const surfaces: number[] = [];
  let end = line.length - 1;
  let mouthLevel: number | null = null;
  for (let i = 0; i < line.length; i += 1) {
    const depth = riverDepth(widthAt(i));
    // Smoothing lets the bed ignore small bumps, but it must never rise above the real ground
    // (the water would hang in the air) and it must keep real cliffs, or a waterfall would be
    // smoothed away into a ramp.
    const natural = Math.min(smooth[i]!, ground[i]!) + depth;
    const step = i === 0 ? 0 : distances[i]! - distances[i - 1]!;
    const surface = i === 0 ? natural : Math.min(natural, surfaces[i - 1]! - MIN_FALL * step);
    surfaces.push(surface);
    // The river ends by itself where it meets standing water at or above its own surface.
    const [x, z] = line[i]!;
    const standing = standingWaterAt(x, z, water, sea);
    if (i > 0 && standing !== null && standing >= surface - 0.01) {
      end = i;
      mouthLevel = standing;
      break;
    }
  }

  // At the mouth the last meters blend to the lake or sea level.
  if (mouthLevel !== null) {
    const endDistance = distances[end]!;
    for (let i = 0; i <= end; i += 1) {
      const fromEnd = endDistance - distances[i]!;
      if (fromEnd > MOUTH_BLEND) continue;
      const t = 1 - fromEnd / MOUTH_BLEND;
      surfaces[i] = surfaces[i]! + (mouthLevel - surfaces[i]!) * t;
    }
  }

  return line.slice(0, end + 1).map(([x, z], i) => {
    const step = i === 0 ? 1 : distances[i]! - distances[i - 1]! || 1;
    const surface = surfaces[i]!;
    const slope = i === 0 ? 0 : Math.max(0, (surfaces[i - 1]! - surface) / step);
    // A waterfall is a big drop over a short distance, not just a steep slope.
    let drop = 0;
    for (let j = i - 1; j >= 0 && distances[i]! - distances[j]! <= WATERFALL_SPAN; j -= 1) {
      drop = Math.max(drop, surfaces[j]! - surface);
    }
    const atMouth = mouthLevel !== null && distances[end]! - distances[i]! <= MOUTH_BLEND;
    const kind: RiverStretch = atMouth
      ? 'mouth'
      : drop >= WATERFALL_DROP
        ? 'waterfall'
        : slope >= RAPIDS_SLOPE
          ? 'rapids'
          : 'calm';
    const widthHere = widthAt(i);
    return {
      x,
      z,
      distance: distances[i]!,
      bed: surface - riverDepth(widthHere),
      surface,
      slope,
      width: widthHere,
      kind,
    };
  });
}

/**
 * Plans the terrain changes that carve a river's bed: flat across the middle at the bed height,
 * sloping up to the natural ground over a bank on both sides. Shaped like `planRoadGrading`, so
 * undo restores the hill exactly.
 */
export function planRiverCarving(
  terrain: TerrainData,
  samples: readonly RiverSample[],
  /**
   * Steepest bank the style allows, in degrees (2026-09-29). A bank was a fixed width however deep
   * the river cut, so a river running down through a bump left cliffs of up to 57° either side and
   * every starter valley failed its own checks. The bank is now a slope under it, up to the ground.
   */
  maxSlope = 90,
): HeightUpdate[] {
  if (samples.length < 2) return [];
  const sp = terrain.spacing;
  // A bank at most this steep (a little under the limit, since the ground has a slope of its own),
  // and how far out one may need to reach before it meets rising ground.
  const gentle = maxSlope >= 90 ? Infinity : Math.tan((maxSlope * Math.PI) / 180) * 0.9;
  // Always the full reach: on a hillside the uphill ground keeps rising beside the river, so a
  // reach worked out from the cut's depth alone stopped short and left a step where it ended.
  const coneReach = Number.isFinite(gentle) ? BANK_REACH_MAX : 0;
  // With a limit the bed is taken a few samples at a time (it is nearly straight over that), which
  // keeps the wider reach quick.
  const stride = Number.isFinite(gentle) ? BANK_STRIDE : 1;
  const nearest = new Map<number, { distance: number; bed: number; flat: number; bank: number }>();
  // With a limit, the lowest height any stretch of the bed asks of a point: the union of straight
  // banks. Taking only the nearest stretch left steps where the bed fell fast (at a mouth).
  const lowest = new Map<number, number>();
  const key = (gx: number, gz: number) => (gx + 50_000) * 100_000 + (gz + 50_000);
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < samples.length - 1; i += stride) {
    const a = samples[i]!;
    const b = samples[Math.min(i + stride, samples.length - 1)]!;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const lengthSq = dx * dx + dz * dz || 1;
    let widest = Math.max(a.width, b.width);
    for (let j = i + 1; j < Math.min(i + stride, samples.length - 1); j += 1)
      widest = Math.max(widest, samples[j]!.width);
    const flat = widest / 2 + sp;
    const bank = widest * BANK;
    const reach = flat + Math.max(bank, coneReach);
    const x0 = Math.min(a.x, b.x) - reach;
    const x1 = Math.max(a.x, b.x) + reach;
    const z0 = Math.min(a.z, b.z) - reach;
    const z1 = Math.max(a.z, b.z) + reach;
    minX = Math.min(minX, x0);
    maxX = Math.max(maxX, x1);
    minZ = Math.min(minZ, z0);
    maxZ = Math.max(maxZ, z1);
    for (let gz = Math.ceil(z0 / sp); gz <= Math.floor(z1 / sp); gz += 1) {
      for (let gx = Math.ceil(x0 / sp); gx <= Math.floor(x1 / sp); gx += 1) {
        const x = gx * sp;
        const z = gz * sp;
        const t = Math.min(1, Math.max(0, ((x - a.x) * dx + (z - a.z) * dz) / lengthSq));
        const distance = Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t));
        if (distance > reach) continue;
        const k = key(gx, gz);
        if (Number.isFinite(gentle)) {
          const bed = a.bed + (b.bed - a.bed) * t;
          const height = distance <= flat ? bed : bed + (distance - flat) * gentle;
          const known = lowest.get(k);
          if (known === undefined || height < known) lowest.set(k, height);
          continue;
        }
        const existing = nearest.get(k);
        if (existing && existing.distance <= distance) continue;
        nearest.set(k, { distance, bed: a.bed + (b.bed - a.bed) * t, flat, bank });
      }
    }
  }

  const ease = (t: number) => t * t * (3 - 2 * t);
  return terrain.planHeights({ minX, maxX, minZ, maxZ }, (x, z, current) => {
    const k = key(Math.round(x / sp), Math.round(z / sp));
    // With a style's limit the bank is a straight slope up from the bed until it meets the ground,
    // so it is never steeper than the limit. Where the ground across the river rises at about 30°
    // or more, the bank may not meet it within `BANK_REACH_MAX` and a step is left where the reach
    // ends (review 2026-09-29; blending at the edge would fix it). Only dig: ground already lower
    // than the bank stays where it is.
    if (Number.isFinite(gentle)) {
      const height = lowest.get(k);
      return height === undefined ? undefined : Math.min(current, height);
    }
    const hit = nearest.get(k);
    if (!hit) return undefined;
    if (hit.distance <= hit.flat) return Math.min(current, hit.bed);
    const f = ease(Math.min(1, (hit.distance - hit.flat) / hit.bank));
    return Math.min(current, hit.bed + (current - hit.bed) * f);
  });
}

/**
 * Roads a river runs across. A road is graded flat when it is drawn and bridged where it meets
 * water that already exists, so a river carved across one afterwards leaves it hanging over the
 * new channel until its grading is run again. The builder is told rather than left to find out.
 */
export function roadsCrossedBy(
  samples: readonly RiverSample[],
  roads: ReadonlyArray<{
    id: string;
    name?: string | undefined;
    points: ReadonlyArray<Point>;
    width?: number | undefined;
  }>,
): string[] {
  const crossed: string[] = [];
  for (const road of roads) {
    const half = (road.width ?? 6) / 2;
    const line = roadCenterline(road.points, 2);
    const hit = line.some(([rx, rz]) =>
      samples.some((sample) => {
        const reach = half + sample.width / 2;
        const dx = rx - sample.x;
        const dz = rz - sample.z;
        return dx * dx + dz * dz <= reach * reach;
      }),
    );
    if (hit) crossed.push(road.name ?? road.id);
  }
  return crossed;
}

/** Builds the profiles of a place's rivers, ready for drawing and for the current. */
export function riverProfiles(
  terrain: Pick<TerrainData, 'heightAt'>,
  rivers: readonly River[],
  water: readonly WaterBody[] = [],
  sea: number | null = null,
): RiverProfile[] {
  return rivers.map((river) => ({
    id: river.id,
    flow: river.flow,
    samples: riverProfile(terrain, river.points, river.width, river.widen, water, sea),
  }));
}

/**
 * The river's water surface at a point, or null outside its banks. Rivers have no polygon, so
 * `waterSurfaceAt` cannot find them: without this a player walks along the riverbed and never
 * swims, and the current never reaches anyone. Both the browser and the server call it, from the
 * same profiles, so they agree.
 */
export function riverSurfaceAt(profiles: readonly RiverProfile[], x: number, z: number): number | null {
  let surface: number | null = null;
  for (const profile of profiles) {
    for (const sample of profile.samples) {
      // Square check first: cheaper than a square root on every sample of every river.
      const dx = x - sample.x;
      const dz = z - sample.z;
      const reach = sample.width / 2;
      if (dx * dx + dz * dz > reach * reach) continue;
      if (surface === null || sample.surface > surface) surface = sample.surface;
    }
  }
  return surface;
}

/**
 * The water surface at a point from everything in the place: lakes, the sea and rivers, the
 * higher wins; null where the ground is dry. The studio draws and swims by this, and the rest law
 * (P2-43) floats things on it in the browser and on the server alike.
 */
export function placeWaterAt(
  environment: Pick<WorldDocument['environment'], 'water' | 'sea'>,
  terrain: TerrainData,
  profiles: readonly RiverProfile[],
  x: number,
  z: number,
): number | null {
  const still = waterSurfaceAt(environment.water, terrain, x, z, environment.sea?.level ?? null);
  const river = riverSurfaceAt(profiles, x, z);
  return still === null ? river : river === null ? still : Math.max(still, river);
}

/**
 * `placeWaterAt` for a document as it stands now, with its rivers' profiles worked out once
 * (P2-43): the water a `SurfaceIndex` rests things on. Build it again after the water, the rivers
 * or the ground under them change.
 */
export function restWaterAt(
  doc: Pick<WorldDocument, 'environment'>,
  terrain: TerrainData,
): (x: number, z: number) => number | null {
  const { water, rivers, sea } = doc.environment;
  const profiles = riverProfiles(terrain, rivers, water, sea?.level ?? null);
  return (x, z) => placeWaterAt(doc.environment, terrain, profiles, x, z);
}

/**
 * The current at a point: the river's direction there times its speed, which rises with the
 * slope. Zero outside the banks, so swimmers only feel it in the water.
 */
export function riverFlowAt(profiles: readonly RiverProfile[], x: number, z: number): [number, number] {
  let best: { profile: RiverProfile; index: number; distance: number } | null = null;
  for (const profile of profiles) {
    for (let i = 0; i < profile.samples.length; i += 1) {
      const sample = profile.samples[i]!;
      const distance = Math.hypot(x - sample.x, z - sample.z);
      if (distance > sample.width / 2) continue;
      if (!best || distance < best.distance) best = { profile, index: i, distance };
    }
  }
  if (!best) return [0, 0];
  const { samples } = best.profile;
  const here = samples[best.index]!;
  const previous = samples[Math.max(0, best.index - 1)]!;
  const next = samples[Math.min(samples.length - 1, best.index + 1)]!;
  const dx = next.x - previous.x;
  const dz = next.z - previous.z;
  const length = Math.hypot(dx, dz);
  if (length < 1e-6) return [0, 0];
  const speed = best.profile.flow * Math.min(MAX_FLOW_FACTOR, 1 + here.slope * FLOW_PER_SLOPE);
  return [(dx / length) * speed, (dz / length) * speed];
}
