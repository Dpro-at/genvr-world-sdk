import type { ItemInstance, RestRule } from '../../contracts/index.js';
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
    grade: {
        area: Array<[number, number]>;
        level: number;
    } | null;
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
export declare const SINK = 0.05;
/**
 * Turn about the vertical axis (P2-43 review round 1: swing-twist, not the naive +x azimuth,
 * which misreads the yaw of a rotation that is also tilted). `T` is the shortest rotation from
 * up to the rotation's own up vector (its "swing"); `Y = conj(T) * rotation` is what is left (its
 * "twist" about the vertical), and `yaw` is read off `Y` directly. Reduces to the old +x-azimuth
 * reading for a pure-yaw rotation, since then `T` is the identity and `Y` is the rotation itself.
 */
export declare function yawOf(rotation: readonly number[]): number;
/** Nine points spread over the base (a 3 x 3 grid pulled in to 80 %), world x and z. */
export declare function restFeet(shape: RestShape, scale: readonly number[], yaw: number, x: number, z: number): Array<[number, number]>;
/**
 * The height `rest` searches down from when nothing else says where to look: the item's own
 * lowest point plus half its height (at least 0.5 m), so anything below its middle can carry it
 * but a roof above it cannot. Exported so `settleChain` (P2-43 task 6) can add a lift to it for an
 * item whose support just moved up, without duplicating the formula.
 */
export declare function defaultFromY(instance: ItemInstance, shape: RestShape): number;
/**
 * Where an item rests at x, z (P2-43, decision 116): its lowest point on the surface under its
 * base, the way its rest mode says. Pure and deterministic, so the browser and the server agree.
 *
 * `options.fromY` overrides the computed search height (P2-43 task 6: a lamp following a table
 * that moved needs its own idea of "where to look", not the lamp's stale position).
 */
export declare function rest(instance: ItemInstance, shape: RestShape, surfaces: SurfaceIndex, x?: number, z?: number, options?: RestOptions): RestResult;
/**
 * Whether a placed item already rests by the law (within 1 cm and half a degree). Always false
 * for `float` (a floating item has no rest position to compare against, by design).
 */
export declare function isResting(instance: ItemInstance, shape: RestShape, surfaces: SurfaceIndex, tolerance?: number): boolean;
/**
 * Metres an item may be off where it would rest and still count as standing there (owner, 2026-10-07: one ground law
 * for everything). Ground that drifted a little under an item (a neighbouring grade, new hills) no longer leaves it
 * floating or buried for good; an item put higher than this, in the air on purpose, is still left alone.
 */
export declare const STANDS_NEAR = 0.5;
/**
 * Whether the rest law looks after an item when what is under it changes: a rooted plant always; anything else that
 * stands upright as the law would put it, within `STANDS_NEAR` of that height.
 */
export declare function followsSupport(instance: ItemInstance, shape: RestShape, surfaces: SurfaceIndex): boolean;
