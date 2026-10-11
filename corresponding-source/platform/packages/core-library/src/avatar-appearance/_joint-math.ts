import type { V3 } from './_animation.js';

/**
 * Small rotation helpers for the move tools (no three.js in the Core Library). Quaternions are [x, y, z, w]; Euler
 * angles are XYZ degrees as the clips use them (three.js order: the matrix is Rx Ry Rz).
 */
export type Q = [number, number, number, number];

const RAD = Math.PI / 180;

export const dot3 = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross3 = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const scale3 = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
export const sub3 = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const unit3 = (a: V3): V3 => {
  const length = Math.hypot(a[0], a[1], a[2]);
  return length > 1e-9 ? scale3(a, 1 / length) : [0, 0, 0];
};

export function qMul(a: Q, b: Q): Q {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}
export const qInv = (q: Q): Q => [-q[0], -q[1], -q[2], q[3]];
export const qAxis = (axis: V3, degrees: number): Q => {
  const [x, y, z] = unit3(axis);
  const s = Math.sin((degrees * RAD) / 2);
  return [x * s, y * s, z * s, Math.cos((degrees * RAD) / 2)];
};
export function qRotate(q: Q, v: V3): V3 {
  const u: V3 = [q[0], q[1], q[2]];
  const t = scale3(cross3(u, v), 2);
  return [v[0] + q[3] * t[0] + cross3(u, t)[0], v[1] + q[3] * t[1] + cross3(u, t)[1], v[2] + q[3] * t[2] + cross3(u, t)[2]];
}

/** Euler XYZ degrees to a quaternion (Rx Ry Rz). */
export function qFromEuler([x, y, z]: V3): Q {
  return qMul(qMul(qAxis([1, 0, 0], x), qAxis([0, 1, 0], y)), qAxis([0, 0, 1], z));
}

/** A rotation matrix (columns are where x, y and z go) to Euler XYZ degrees, as three.js reads it. */
export function eulerFromBasis(ex: V3, ey: V3, ez: V3): V3 {
  // Row-major entries: m[row][col], column c is the image of axis c.
  const m11 = ex[0], m12 = ey[0], m13 = ez[0];
  const m22 = ey[1], m23 = ez[1];
  const m32 = ey[2], m33 = ez[2];
  const round = (r: number) => Math.round((r / RAD) * 100) / 100;
  const y = Math.asin(Math.max(-1, Math.min(1, m13)));
  if (Math.abs(m13) < 0.9999999) return [round(Math.atan2(-m23, m33)), round(y), round(Math.atan2(-m12, m11))];
  return [round(Math.atan2(m32, m22)), round(y), 0];
}

export function eulerFromQ(q: Q): V3 {
  return eulerFromBasis(qRotate(q, [1, 0, 0]), qRotate(q, [0, 1, 0]), qRotate(q, [0, 0, 1]));
}

/**
 * Swing and twist of a rotation around a bone's own axis: `twist` is the turn about the axis (degrees, signed),
 * `swing` the rest (an axis perpendicular to the bone and its angle).
 */
export function swingTwist(q: Q, axis: V3): { twist: number; swingAxis: V3; swing: number } {
  const a = unit3(axis);
  const projection = dot3([q[0], q[1], q[2]], a);
  let twistQ: Q = [a[0] * projection, a[1] * projection, a[2] * projection, q[3]];
  const length = Math.hypot(...twistQ);
  twistQ = length > 1e-9 ? (twistQ.map((v) => v / length) as Q) : [0, 0, 0, 1];
  if (twistQ[3] < 0) twistQ = twistQ.map((v) => -v) as Q;
  const twist = (2 * Math.atan2(dot3([twistQ[0], twistQ[1], twistQ[2]], a), twistQ[3])) / RAD;
  let swingQ = qMul(q, qInv(twistQ));
  if (swingQ[3] < 0) swingQ = swingQ.map((v) => -v) as Q;
  const swing = (2 * Math.acos(Math.min(1, swingQ[3]))) / RAD;
  return { twist, swingAxis: unit3([swingQ[0], swingQ[1], swingQ[2]]), swing };
}

/** The shortest turn taking direction `from` to direction `to`. */
export function qBetween(from: V3, to: V3): Q {
  const a = unit3(from);
  const b = unit3(to);
  const d = dot3(a, b);
  if (d < -0.999999) {
    const side = Math.abs(a[0]) < 0.9 ? cross3(a, [1, 0, 0]) : cross3(a, [0, 1, 0]);
    return qAxis(side, 180);
  }
  const c = cross3(a, b);
  const q: Q = [c[0], c[1], c[2], 1 + d];
  const length = Math.hypot(...q);
  return q.map((v) => v / length) as Q;
}

/**
 * A frame for a bone pointing along `along` whose bending side is `wanted` (perpendicular to `along`), with its turn
 * about its own length kept within `limit` degrees of the untwisted frame (the rest frame swung the shortest way).
 * Returns the clamped bending side.
 */
export function clampTwist(rest: V3, restSide: V3, along: V3, wanted: V3, limit: number): { side: V3; twist: number } {
  const swing = qBetween(rest, along);
  const neutral = qRotate(swing, restSide);
  const a = unit3(along);
  const angle = Math.atan2(dot3(cross3(neutral, wanted), a), dot3(neutral, wanted)) * (180 / Math.PI);
  const twist = Math.max(-limit, Math.min(limit, angle));
  return { side: qRotate(qAxis(a, twist), neutral), twist: angle };
}
