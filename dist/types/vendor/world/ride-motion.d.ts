import type { Ride } from '../contracts/index.js';
/**
 * The motion model of a ridden item and the room's check of its moves (movement modes, spec
 * sections 1.2 and 5.3). Pure and shared: the runtime predicts with `stepRide`, the room judges the
 * results with `rideMoveAllowed`, and the tests drive one with the other. Kinematic and arcade: no
 * wheels, no forces between items; the numbers are the ride's own (`Ride`).
 */
/** Where a ridden item is and how it moves. Forward is (sin yaw, cos yaw); right is (-cos yaw, sin yaw). */
export interface RideState {
    x: number;
    y: number;
    z: number;
    yaw: number;
    /** Forward speed, m/s (negative: backward). */
    speed: number;
    /** Sideways speed along the right vector, m/s (a slide the grip removes). */
    side: number;
    /** Vertical speed, m/s. */
    vy: number;
}
export interface RideInput {
    /** -1..1: forward (positive) or backward and braking (negative). */
    throttle: number;
    /** -1..1: positive turns right. */
    steer: number;
    /** Air: climb. Ground and water: brake hard. */
    up: boolean;
    /** Air: descend. */
    down: boolean;
}
/** Heights under a point; null water means none. The runtime passes collider-aware values, the server terrain and water. */
export interface RideSurface {
    ground: number;
    water: number | null;
}
/** The numbers of the room's move check (walking and riding). */
export declare const MOVE_CHECK: {
    /** Horizontal m/s a walking player may move. */
    readonly walkSpeed: 12;
    /**
     * Metres of lag and jitter a player may be ahead of the allowance, as a budget (not per move): a
     * move beyond the allowance draws on it, a move under it pays it back, never above this. Over any
     * stretch of moves the distance is at most speed times time plus this, however often they come.
     */
    readonly slack: 1.5;
    /** The most time one move is judged over: a client silent for longer gets one second's allowance. */
    readonly maxElapsedMs: 1000;
    /** A rider may go this share faster than the ride's top speed (latency, frame steps). */
    readonly rideTolerance: 1.15;
    /** Metres per second a flying item may go down. */
    readonly fallSpeed: 30;
    /**
     * Metres per second a flying item above its height limit (it crossed a drop, a cliff edge) comes
     * down toward it, instead of snapping there; under `fallSpeed`, so the room accepts it.
     */
    readonly airDrop: 24;
    /** Metres per second such an item must at least come down, as the room judges it (half of `airDrop`: lag). */
    readonly ceilingDrop: 12;
    /** Metres such a descent may fall short per move (jitter of the move times). */
    readonly ceilingDropSlack: 0.4;
    /** How far from a water surface a water item may be, m. */
    readonly waterBand: 2;
    /** How far a water item stranded on dry land may still drift (or rise while settling), m per move. */
    readonly strandedDrift: 0.05;
    /** How far above its ceiling a flying item may be, m. */
    readonly ceilingSlack: 2;
};
/**
 * One step of `dt` seconds: updates the state's speed, yaw, side speed and vertical speed, and
 * returns the wanted displacement; the caller resolves collisions and writes back the position.
 * `speedFactor` is the rider's `set_speed` factor (it scales the top speeds, not the acceleration).
 * Pass `out` to reuse an object (no allocation per frame).
 *
 * - Speed moves toward `throttle * maxSpeed` (backward: `reverse * maxSpeed`) by `accel` per
 *   second; slowing down against the input (or `up` on ground and water) is twice as fast. A water
 *   item with no water under it slows to a stop and does not turn.
 * - Yaw turns by `turn` degrees per second at full steer, reversed going backward; a ground item
 *   turns in proportion to its speed up to 30 % of its top speed.
 * - A turn turns forward speed into sideways speed; `grip` removes it (`side *= (1 - grip) ** (dt * 10)`).
 * - Ground: falls with `gravity` and lands on the surface. Water: floats just under the water
 *   surface (with no water under it, it falls like a ground item and does not climb out). Air: climbs
 *   and descends at `climb`; hovers, or with `glide` sinks when slower than 30 % of its top speed;
 *   never above `ground + ceiling` (coming down to it at `airDrop` when above, `airCeiling`), never
 *   below the ground.
 */
export declare function stepRide(ride: Ride, state: RideState, input: RideInput, surface: RideSurface, dt: number, speedFactor?: number, out?: {
    dx: number;
    dy: number;
    dz: number;
}): {
    dx: number;
    dy: number;
    dz: number;
};
/**
 * A flying item's height `y` held under its limit `ground + ceiling`: a climb stops at the limit,
 * and an item already above it (the ground under it fell away) comes down at `MOVE_CHECK.airDrop`
 * instead of snapping. `fromY` is where it was before the step. The runtime calls this again with
 * the ground where the item arrives.
 */
export declare function airCeiling(ride: Ride, fromY: number, y: number, ground: number, dt: number): number;
/**
 * The last accepted position and when it was accepted (server ms); the room's `Tracked` has this
 * shape. `slack` and `rise` are what is left of the lag budgets (`MOVE_CHECK.slack`, horizontal and
 * upward); missing means full (a fresh start, a teleport by the room).
 */
export interface MoveSample {
    x: number;
    y: number;
    z: number;
    at: number;
    slack?: number;
    rise?: number;
}
/** What is left of the lag budgets after an accepted move (keep it with the new sample). */
export interface MoveBudget {
    slack: number;
    rise: number;
}
/**
 * Whether a walking player's move is within reach: horizontally `walkSpeed` times the `set_speed`
 * factor per second (at most one second of it), plus what is left of the slack budget. Vertical
 * moves are not judged. On success the budget left is written to `out`.
 */
export declare function walkMoveAllowed(from: MoveSample, to: {
    x: number;
    y: number;
    z: number;
}, now: number, speedFactor: number, out?: MoveBudget): boolean;
/**
 * Whether seat 1's move of a ridden item is within the ride's limits (spec 5.3): horizontally
 * `maxSpeed * rideTolerance` times the `set_speed` factor; upward `max(maxSpeed, 20)` per second on
 * ground and water and `climb * rideTolerance` in the air (both with the slack as budgets, over at
 * most one second); downward `max(maxSpeed, 20)`, in the air `fallSpeed`, plus the slack per move;
 * a water item within `waterBand` of a water surface (stranded on dry land it may only stay where
 * it is and settle, `strandedDrift`), a flying one under `ground + ceiling +
 * ceilingSlack` where it arrives, or above it coming down at `ceilingDrop` at least (it crossed a
 * drop; `airCeiling`). Ground items have no surface test (decks and bridges stand above the terrain, and the room has no
 * colliders). On success the budgets left are written to `out`.
 */
export declare function rideMoveAllowed(ride: Ride, from: MoveSample, to: {
    x: number;
    y: number;
    z: number;
}, now: number, surfaceAt: (x: number, z: number) => RideSurface, speedFactor: number, out?: MoveBudget): boolean;
