import type { ItemInstance, RestRule } from '@genvr/contracts';
import { rotate, type Vec3 } from '../geometry.js';
import type { SurfaceIndex } from './surface-index.js';

export interface RestShape {
  min: readonly number[];
  max: readonly number[];
  rule: RestRule;
  /** Largest lean from upright for `tilt` (manifest `placement.maxTilt`), degrees. */
  maxTilt?: number;
  /**
   * Rests on the bed under water, never on the water surface (ITEMS-close-01): an item whose
   * manifest says it may stand in water (`placement.stands` has `water`: sea life, rocks).
   */
  bed?: boolean;
  /**
   * Grows out of what it stands on (owner, 2026-10-07: trees and plants): it always counts as resting, so every change
   * of the ground under it sets it down again, even after the ground drifted a little from under it. Without this a
   * tree a few centimetres off counted as placed in the air on purpose and was left floating or buried for good.
   */
  rooted?: boolean;
}

export interface RestResult {
  position: [number, number, number];
  rotation: [number, number, number, number];
  /** Ground to level under a `grade` item: world x, z polygon and height. */
  grade: { area: Array<[number, number]>; level: number } | null;
  /** Height from the base down to the lowest ground under it (`foundation` draws a plinth this deep). */
  plinth: number;
  /** False when the law cannot be met (too steep for the mode). */
  ok: boolean;
}

/** Options that override how `rest` looks for a surface. */
export interface RestOptions {
  /** Use this height to search for a surface instead of the computed default (P2-43 task 6). */
  fromY?: number;
}

/** Default sink when a rule gives none (meters). */
export const SINK = 0.05;
/** Default largest tilt for `tilt` (degrees). */
const MAX_TILT = 25;
/** Extra ground levelled around a graded base (meters). */
const GRADE_MARGIN = 0.5;
/** Resting tolerance (meters, and radians for the rotation). */
const TOLERANCE = 0.01;
const ANGLE_TOLERANCE = (0.5 * Math.PI) / 180;

const round = (value: number) => Math.round(value * 1000) / 1000;
/** Determinism for returned rotations (P2-43 review round 1): six decimal places. */
const roundAngle = (value: number) => Math.round(value * 1e6) / 1e6;
const roundQuat = (q: readonly number[]): [number, number, number, number] => [
  roundAngle(q[0]!),
  roundAngle(q[1]!),
  roundAngle(q[2]!),
  roundAngle(q[3]!),
];

function multiply(a: readonly number[], b: readonly number[]): [number, number, number, number] {
  const [ax, ay, az, aw] = a as [number, number, number, number];
  const [bx, by, bz, bw] = b as [number, number, number, number];
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

/** Shortest rotation that carries `up` [0, 1, 0] onto the unit vector `u` (identity when u ≈ up). */
function swingToUp(u: readonly number[]): [number, number, number, number] {
  const cross: Vec3 = [u[2]!, 0, -u[0]!];
  const w = 1 + u[1]!;
  const length = Math.hypot(cross[0], cross[1], cross[2], w);
  if (length < 1e-9) return [0, 0, 0, 1];
  return [cross[0] / length, cross[1] / length, cross[2] / length, w / length];
}

/**
 * Turn about the vertical axis (P2-43 review round 1: swing-twist, not the naive +x azimuth,
 * which misreads the yaw of a rotation that is also tilted). `T` is the shortest rotation from
 * up to the rotation's own up vector (its "swing"); `Y = conj(T) * rotation` is what is left (its
 * "twist" about the vertical), and `yaw` is read off `Y` directly. Reduces to the old +x-azimuth
 * reading for a pure-yaw rotation, since then `T` is the identity and `Y` is the rotation itself.
 */
export function yawOf(rotation: readonly number[]): number {
  const u = rotate([0, 1, 0], rotation);
  const swing = swingToUp(u);
  const conjSwing: [number, number, number, number] = [-swing[0], -swing[1], -swing[2], swing[3]];
  const twist = multiply(conjSwing, rotation);
  const yaw = 2 * Math.atan2(twist[1], twist[3]);
  // atan2 itself reads back to (-π, π]; re-run it through sin/cos to normalize (yaw can be up to
  // ±2π before wrapping) and to fold away -0 (`+ 0`) so a rotation built from this angle is exact.
  return Math.atan2(Math.sin(yaw), Math.cos(yaw)) + 0;
}

const yawQuat = (yaw: number): [number, number, number, number] => [
  0,
  Math.sin(yaw / 2),
  0,
  Math.cos(yaw / 2),
];

/** Nine points spread over the base (a 3 x 3 grid pulled in to 80 %), world x and z. */
export function restFeet(
  shape: RestShape,
  scale: readonly number[],
  yaw: number,
  x: number,
  z: number,
): Array<[number, number]> {
  const base = shape.rule.base ?? {
    min: [shape.min[0]!, shape.min[2]!],
    max: [shape.max[0]!, shape.max[2]!],
  };
  const cx = (base.min[0] + base.max[0]) / 2;
  const cz = (base.min[1] + base.max[1]) / 2;
  const hx = ((base.max[0] - base.min[0]) / 2) * 0.8;
  const hz = ((base.max[1] - base.min[1]) / 2) * 0.8;
  const q = yawQuat(yaw);
  const feet: Array<[number, number]> = [];
  for (const u of [-1, 0, 1])
    for (const v of [-1, 0, 1]) {
      const [wx, , wz] = rotate([(cx + u * hx) * scale[0]!, 0, (cz + v * hz) * scale[2]!] as Vec3, q);
      feet.push([x + wx, z + wz]);
    }
  return feet;
}

/**
 * The height `rest` searches down from when nothing else says where to look: the item's own
 * lowest point plus half its height (at least 0.5 m), so anything below its middle can carry it
 * but a roof above it cannot. Exported so `settleChain` (P2-43 task 6) can add a lift to it for an
 * item whose support just moved up, without duplicating the formula.
 */
export function defaultFromY(instance: ItemInstance, shape: RestShape): number {
  const { position, scale } = instance.transform;
  const lowest = shape.min[1]! * scale[1]!;
  const height = (shape.max[1]! - shape.min[1]!) * scale[1]!;
  return position[1] + lowest + Math.max(0.5, height / 2);
}

/**
 * Where an item rests at x, z (P2-43, decision 116): its lowest point on the surface under its
 * base, the way its rest mode says. Pure and deterministic, so the browser and the server agree.
 *
 * `options.fromY` overrides the computed search height (P2-43 task 6: a lamp following a table
 * that moved needs its own idea of "where to look", not the lamp's stale position).
 */
export function rest(
  instance: ItemInstance,
  shape: RestShape,
  surfaces: SurfaceIndex,
  x = instance.transform.position[0],
  z = instance.transform.position[2],
  options?: RestOptions,
): RestResult {
  const { position, rotation, scale } = instance.transform;
  const rule = shape.rule;
  if (rule.mode === 'float')
    return {
      position: [x, position[1], z],
      rotation: [...rotation] as RestResult['rotation'],
      grade: null,
      plinth: 0,
      ok: true,
    };

  const yaw = yawOf(rotation);
  const lowest = shape.min[1]! * scale[1]!;
  const fromY = options?.fromY ?? defaultFromY(instance, shape);
  const feet = restFeet(shape, scale, yaw, x, z);
  const heights = feet.map(([fx, fz]) => surfaces.below(fx, fz, fromY, instance.instanceId, shape.bed));
  const low = Math.min(...heights);
  const high = Math.max(...heights);
  const upright = yawQuat(yaw);
  const at = (baseY: number): [number, number, number] => [x, round(baseY - lowest), z];

  switch (rule.mode) {
    case 'upright': {
      const sink = rule.sink ?? SINK;
      return {
        position: at(low),
        rotation: roundQuat(upright),
        grade: null,
        plinth: 0,
        ok: high - low <= sink + 1e-6,
      };
    }
    case 'tilt': {
      // Least-squares plane y = a x + b z + c through the feet.
      const n = feet.length;
      let sx = 0;
      let sz = 0;
      let sy = 0;
      let sxx = 0;
      let szz = 0;
      let sxz = 0;
      let sxy = 0;
      let szy = 0;
      feet.forEach(([fx, fz], i) => {
        const dx = fx - x;
        const dz = fz - z;
        const y = heights[i]!;
        sx += dx;
        sz += dz;
        sy += y;
        sxx += dx * dx;
        szz += dz * dz;
        sxz += dx * dz;
        sxy += dx * y;
        szy += dz * y;
      });
      // Centre the sums on the feet before solving (ITEMS-close-01, GROUND-01 diagnosis): with raw
      // sums an off-centre base mixes the absolute ground height into the slope, so on flat ground
      // 20 m up a starfish or a clam was read as a steep slope and tilted to its largest lean.
      const mx = sx / n;
      const mz = sz / n;
      const my = sy / n;
      const cxx = sxx - sx * mx;
      const czz = szz - sz * mz;
      const cxz = sxz - sx * mz;
      const cxy = sxy - sx * my;
      const czy = szy - sz * my;
      const det = cxx * czz - cxz * cxz || 1;
      const a = (cxy * czz - czy * cxz) / det;
      const b = (czy * cxx - cxy * cxz) / det;
      // The plane height at the pivot.
      const c = my - a * mx - b * mz;
      const limit = ((shape.maxTilt ?? MAX_TILT) * Math.PI) / 180;
      const normal: Vec3 = [-a, 1, -b];
      const length = Math.hypot(...normal);
      const angle = Math.acos(1 / length);
      const turn = Math.min(angle, limit);
      const axisLength = Math.hypot(normal[2], normal[0]) || 1;
      const axis: Vec3 = [normal[2] / axisLength, 0, -normal[0] / axisLength];
      const s = Math.sin(turn / 2);
      const tilt: [number, number, number, number] =
        angle < 1e-9 ? [0, 0, 0, 1] : [axis[0] * s, 0, axis[2] * s, Math.cos(turn / 2)];
      // The bottom-face centre is not straight down from the pivot once tilted: it's `lowest`
      // along the item's own (rotated) down direction, `u`. Place the pivot so that point lands
      // exactly `sink` below the fitted plane *at its own x, z* (P2-43 review round 1), not below
      // the plane at the pivot's x, z — the naive `c - sink - lowest` used before this fix.
      const sink = rule.sink ?? SINK;
      const u = rotate([0, 1, 0], tilt);
      const pivotY = c - sink + lowest * (a * u[0] + b * u[2] - u[1]);
      return {
        position: [x, round(pivotY), z],
        rotation: roundQuat(multiply(tilt, upright)),
        grade: null,
        plinth: 0,
        ok: angle <= limit + 1e-9,
      };
    }
    case 'grade': {
      // The ground under the feet, not what is over it (P2-43 final review, I2): a building is
      // graded into the ground, so over a lake it levels the bed, never up to the water surface.
      const ground = feet.map(([fx, fz]) => surfaces.options.groundAt(fx, fz));
      const level = round(ground.reduce((sum, h) => sum + h, 0) / ground.length);
      const [bx0, bz0, bx1, bz1] = [
        shape.min[0]! - GRADE_MARGIN,
        shape.min[2]! - GRADE_MARGIN,
        shape.max[0]! + GRADE_MARGIN,
        shape.max[2]! + GRADE_MARGIN,
      ];
      const area = (
        [
          [bx0, bz0],
          [bx1, bz0],
          [bx1, bz1],
          [bx0, bz1],
        ] as Array<[number, number]>
      ).map(([lx, lz]) => {
        const [wx, , wz] = rotate([lx * scale[0]!, 0, lz * scale[2]!], upright);
        return [round(x + wx), round(z + wz)] as [number, number];
      });
      return {
        position: at(level),
        rotation: roundQuat(upright),
        grade: { area, level },
        plinth: 0,
        ok: true,
      };
    }
    case 'foundation':
      return {
        position: at(high),
        rotation: roundQuat(upright),
        grade: null,
        plinth: round(high - low),
        ok: true,
      };
  }
}

/**
 * Whether a placed item already rests by the law (within 1 cm and half a degree). Always false
 * for `float` (a floating item has no rest position to compare against, by design).
 */
export function isResting(
  instance: ItemInstance,
  shape: RestShape,
  surfaces: SurfaceIndex,
  tolerance = TOLERANCE,
): boolean {
  if (shape.rule.mode === 'float') return false;
  const result = rest(instance, shape, surfaces);
  if (Math.abs(result.position[1] - instance.transform.position[1]) > tolerance) return false;
  const q = instance.transform.rotation;
  const dot = Math.abs(
    q[0]! * result.rotation[0] +
      q[1]! * result.rotation[1] +
      q[2]! * result.rotation[2] +
      q[3]! * result.rotation[3],
  );
  return 2 * Math.acos(Math.min(1, dot)) <= ANGLE_TOLERANCE;
}

/**
 * Metres an item may be off where it would rest and still count as standing there (owner, 2026-10-07: one ground law
 * for everything). Ground that drifted a little under an item (a neighbouring grade, new hills) no longer leaves it
 * floating or buried for good; an item put higher than this, in the air on purpose, is still left alone.
 */
export const STANDS_NEAR = 0.5;

/**
 * Whether the rest law looks after an item when what is under it changes: a rooted plant always; anything else that
 * stands upright as the law would put it, within `STANDS_NEAR` of that height.
 */
export function followsSupport(instance: ItemInstance, shape: RestShape, surfaces: SurfaceIndex): boolean {
  if (shape.rule.mode === 'float') return false;
  return shape.rooted === true || isResting(instance, shape, surfaces, STANDS_NEAR);
}
