import type { BuildingLook } from '@genvr/contracts';

type Point = readonly [number, number];
type RoofShape = NonNullable<BuildingLook['roofShape']>;

/** A roof face as a plane: metres above the eaves at (x, z) are `a * x + b * z + c`. */
export interface RoofPlane {
  a: number;
  b: number;
  c: number;
}

/**
 * The rectangle a roof is built over (Real place R4b): the smallest box around the outline along one of its own
 * sides. `u` runs along the ridge (the longer side), `v` across it.
 */
export interface RoofFrame {
  cx: number;
  cz: number;
  ux: number;
  uz: number;
  /** Half the box along the ridge and across it, metres. */
  halfLength: number;
  halfWidth: number;
}

export function roofFrame(points: readonly Point[]): RoofFrame {
  let best: RoofFrame | null = null;
  let bestArea = Infinity;
  for (let i = 0; i < points.length; i += 1) {
    const [ax, az] = points[i]!;
    const [bx, bz] = points[(i + 1) % points.length]!;
    const length = Math.hypot(bx - ax, bz - az);
    if (length < 1e-6) continue;
    const ux = (bx - ax) / length;
    const uz = (bz - az) / length;
    let minU = Infinity;
    let maxU = -Infinity;
    let minV = Infinity;
    let maxV = -Infinity;
    for (const [x, z] of points) {
      const u = x * ux + z * uz;
      const v = -x * uz + z * ux;
      minU = Math.min(minU, u);
      maxU = Math.max(maxU, u);
      minV = Math.min(minV, v);
      maxV = Math.max(maxV, v);
    }
    const area = (maxU - minU) * (maxV - minV);
    if (area >= bestArea - 1e-9) continue;
    bestArea = area;
    const mu = (minU + maxU) / 2;
    const mv = (minV + maxV) / 2;
    const frame = {
      cx: mu * ux - mv * uz,
      cz: mu * uz + mv * ux,
      ux,
      uz,
      halfLength: (maxU - minU) / 2,
      halfWidth: (maxV - minV) / 2,
    };
    // The ridge runs along the longer side.
    best =
      frame.halfLength >= frame.halfWidth
        ? frame
        : { ...frame, ux: -uz, uz: ux, halfLength: frame.halfWidth, halfWidth: frame.halfLength };
  }
  return best ?? { cx: 0, cz: 0, ux: 1, uz: 0, halfLength: 0, halfWidth: 0 };
}

/** Pitch of a roof the map gives no height for: 35 degrees (a tiled roof), 15 for a lean-to. */
const PITCH = Math.tan((35 * Math.PI) / 180);
const SKILLION_PITCH = Math.tan((15 * Math.PI) / 180);
/** A roof can be a whole spire (R4c). */
export const MAX_ROOF_HEIGHT = 80;

/** Height of a roof of this shape over this outline when the map does not say: a usual pitch, 1 m to 8 m. */
export function defaultRoofHeight(points: readonly Point[], shape: RoofShape): number {
  if (shape === 'flat') return 0;
  const { halfWidth } = roofFrame(points);
  const height = shape === 'skillion' ? 2 * halfWidth * SKILLION_PITCH : halfWidth * PITCH;
  return Math.round(Math.min(8, Math.max(1, height)) * 10) / 10;
}

/**
 * The faces of a roof: its height over a point is the lowest of them (never below the eaves). Gabled: two faces
 * meeting at a ridge along the long side. Hipped: also sloped ends, as steep as the sides. Pyramidal: four faces to
 * one top. Skillion: one face rising across the building. Flat: none.
 */
export function roofPlanes(points: readonly Point[], shape: RoofShape, height: number): RoofPlane[] {
  if (shape === 'flat' || height <= 0) return [];
  const f = roofFrame(points);
  if (f.halfWidth < 1e-3) return [];
  // u (along the ridge) and v (across it) of a point, as planes: u = ux x + uz z - (ux cx + uz cz).
  const u = { a: f.ux, b: f.uz, c: -(f.ux * f.cx + f.uz * f.cz) };
  const v = { a: -f.uz, b: f.ux, c: f.uz * f.cx - f.ux * f.cz };
  /** H * (1 - sign * axis / half): the face falling to the side where `axis` is `sign * half`. */
  const face = (axis: RoofPlane, sign: number, half: number): RoofPlane => ({
    a: (-height * sign * axis.a) / half,
    b: (-height * sign * axis.b) / half,
    c: height - (height * sign * axis.c) / half,
  });
  if (shape === 'skillion')
    // Low on one long side, `height` on the other.
    return [
      {
        a: (height * v.a) / (2 * f.halfWidth),
        b: (height * v.b) / (2 * f.halfWidth),
        c: height / 2 + (height * v.c) / (2 * f.halfWidth),
      },
    ];
  const sides = [face(v, 1, f.halfWidth), face(v, -1, f.halfWidth)];
  if (shape === 'gabled') return sides;
  // Hipped ends as steep as the sides: they reach the ridge `halfWidth` in from each end.
  const endHalf = shape === 'pyramidal' ? f.halfLength : f.halfWidth;
  const end = (sign: number): RoofPlane => {
    const plane = face(u, sign, endHalf);
    // Hipped: the end face lies at the building's end, not at its middle.
    return shape === 'pyramidal'
      ? plane
      : { ...plane, c: plane.c + (height * (f.halfLength - endHalf)) / endHalf };
  };
  return [...sides, end(1), end(-1)];
}

const at = (plane: RoofPlane, x: number, z: number) => plane.a * x + plane.b * z + plane.c;

/** Metres of roof above the eaves at (x, z). */
export function roofHeightAt(planes: readonly RoofPlane[], x: number, z: number): number {
  if (!planes.length) return 0;
  let low = Infinity;
  for (const plane of planes) low = Math.min(low, at(plane, x, z));
  return Math.max(0, low);
}

/**
 * The part of the outline under one roof face: the outline cut by the lines where this face stops being the lowest.
 * A face lies wholly in its part, so the part is drawn as a flat polygon on it.
 */
export function roofFacet(
  points: readonly Point[],
  planes: readonly RoofPlane[],
  index: number,
): Array<[number, number]> {
  let polygon: Array<[number, number]> = points.map(([x, z]) => [x, z]);
  const own = planes[index]!;
  for (let j = 0; j < planes.length && polygon.length >= 3; j += 1) {
    if (j === index) continue;
    const other = planes[j]!;
    // Keep where own <= other.
    const side = (x: number, z: number) => at(own, x, z) - at(other, x, z);
    const next: Array<[number, number]> = [];
    for (let i = 0; i < polygon.length; i += 1) {
      const [ax, az] = polygon[i]!;
      const [bx, bz] = polygon[(i + 1) % polygon.length]!;
      const sa = side(ax, az);
      const sb = side(bx, bz);
      if (sa <= 1e-9) next.push([ax, az]);
      if ((sa < -1e-9 && sb > 1e-9) || (sa > 1e-9 && sb < -1e-9)) {
        const t = sa / (sa - sb);
        next.push([ax + (bx - ax) * t, az + (bz - az) * t]);
      }
    }
    polygon = next;
  }
  // Drop repeated points the cuts can leave.
  return polygon.filter((p, i) => {
    const q = polygon[(i + 1) % polygon.length]!;
    return Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-6;
  });
}

/**
 * Where along a facade side (0..1, from a to b) the roof above it bends: the wall top is straight between them, so
 * a gable end is drawn exactly.
 */
export function roofBends(a: Point, b: Point, planes: readonly RoofPlane[]): number[] {
  const bends = new Set<number>();
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const cuts = (p: RoofPlane, q: RoofPlane | null) => {
    // Where p - q (or p alone, the eaves line) is zero.
    const ca = p.a - (q?.a ?? 0);
    const cb = p.b - (q?.b ?? 0);
    const cc = p.c - (q?.c ?? 0);
    const slope = ca * dx + cb * dz;
    if (Math.abs(slope) < 1e-12) return;
    const t = -(ca * a[0] + cb * a[1] + cc) / slope;
    if (t > 1e-6 && t < 1 - 1e-6) bends.add(Math.round(t * 1e6) / 1e6);
  };
  for (let i = 0; i < planes.length; i += 1) {
    cuts(planes[i]!, null);
    for (let j = i + 1; j < planes.length; j += 1) cuts(planes[i]!, planes[j]!);
  }
  return [...bends].sort((x, y) => x - y);
}
