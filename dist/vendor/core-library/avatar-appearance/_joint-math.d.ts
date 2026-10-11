import type { V3 } from './_animation.js';
/**
 * Small rotation helpers for the move tools (no three.js in the Core Library). Quaternions are [x, y, z, w]; Euler
 * angles are XYZ degrees as the clips use them (three.js order: the matrix is Rx Ry Rz).
 */
export type Q = [number, number, number, number];
export declare const dot3: (a: V3, b: V3) => number;
export declare const cross3: (a: V3, b: V3) => V3;
export declare const scale3: (a: V3, s: number) => V3;
export declare const sub3: (a: V3, b: V3) => V3;
export declare const unit3: (a: V3) => V3;
export declare function qMul(a: Q, b: Q): Q;
export declare const qInv: (q: Q) => Q;
export declare const qAxis: (axis: V3, degrees: number) => Q;
export declare function qRotate(q: Q, v: V3): V3;
/** Euler XYZ degrees to a quaternion (Rx Ry Rz). */
export declare function qFromEuler([x, y, z]: V3): Q;
/** A rotation matrix (columns are where x, y and z go) to Euler XYZ degrees, as three.js reads it. */
export declare function eulerFromBasis(ex: V3, ey: V3, ez: V3): V3;
export declare function eulerFromQ(q: Q): V3;
/**
 * Swing and twist of a rotation around a bone's own axis: `twist` is the turn about the axis (degrees, signed),
 * `swing` the rest (an axis perpendicular to the bone and its angle).
 */
export declare function swingTwist(q: Q, axis: V3): {
    twist: number;
    swingAxis: V3;
    swing: number;
};
/** The shortest turn taking direction `from` to direction `to`. */
export declare function qBetween(from: V3, to: V3): Q;
/**
 * A frame for a bone pointing along `along` whose bending side is `wanted` (perpendicular to `along`), with its turn
 * about its own length kept within `limit` degrees of the untwisted frame (the rest frame swung the shortest way).
 * Returns the clamped bending side.
 */
export declare function clampTwist(rest: V3, restSide: V3, along: V3, wanted: V3, limit: number): {
    side: V3;
    twist: number;
};
