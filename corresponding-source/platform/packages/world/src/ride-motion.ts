import type { Ride } from '@genvr/contracts';

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
export const MOVE_CHECK = {
  /** Horizontal m/s a walking player may move. */
  walkSpeed: 12,
  /**
   * Metres of lag and jitter a player may be ahead of the allowance, as a budget (not per move): a
   * move beyond the allowance draws on it, a move under it pays it back, never above this. Over any
   * stretch of moves the distance is at most speed times time plus this, however often they come.
   */
  slack: 1.5,
  /** The most time one move is judged over: a client silent for longer gets one second's allowance. */
  maxElapsedMs: 1000,
  /** A rider may go this share faster than the ride's top speed (latency, frame steps). */
  rideTolerance: 1.15,
  /** Metres per second a flying item may go down. */
  fallSpeed: 30,
  /**
   * Metres per second a flying item above its height limit (it crossed a drop, a cliff edge) comes
   * down toward it, instead of snapping there; under `fallSpeed`, so the room accepts it.
   */
  airDrop: 24,
  /** Metres per second such an item must at least come down, as the room judges it (half of `airDrop`: lag). */
  ceilingDrop: 12,
  /** Metres such a descent may fall short per move (jitter of the move times). */
  ceilingDropSlack: 0.4,
  /** How far from a water surface a water item may be, m. */
  waterBand: 2,
  /** How far a water item stranded on dry land may still drift (or rise while settling), m per move. */
  strandedDrift: 0.05,
  /** How far above its ceiling a flying item may be, m. */
  ceilingSlack: 2,
} as const;

const GRAVITY = 9.81;
/** Below this share of its top speed a ground item turns slower and a gliding one sinks. */
const LOW_SPEED = 0.3;
/** Where a water item floats: this far under the surface, m. */
const FLOAT_DEPTH = 0.1;
/** How fast a water item eases to its floating height, per second. */
const FLOAT_EASE = 5;
const DEG = Math.PI / 180;

/** `value` moved toward `target` by at most `step`. */
function approach(value: number, target: number, step: number): number {
  return value < target ? Math.min(target, value + step) : Math.max(target, value - step);
}

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
export function stepRide(
  ride: Ride,
  state: RideState,
  input: RideInput,
  surface: RideSurface,
  dt: number,
  speedFactor = 1,
  out: { dx: number; dy: number; dz: number } = { dx: 0, dy: 0, dz: 0 },
): { dx: number; dy: number; dz: number } {
  out.dx = 0;
  out.dy = 0;
  out.dz = 0;
  if (!(dt > 0)) return out;
  const throttle = Math.max(-1, Math.min(1, input.throttle || 0));
  const steer = Math.max(-1, Math.min(1, input.steer || 0));
  const top = ride.maxSpeed * speedFactor;
  const stranded = ride.model === 'water' && surface.water === null;
  const brakeHard = input.up && ride.model !== 'air';

  // Speed.
  let target = throttle >= 0 ? throttle * top : throttle * ride.reverse * top;
  if (stranded || brakeHard) target = 0;
  const speed = state.speed;
  const slowing = Math.abs(target) < Math.abs(speed) || Math.sign(target) === -Math.sign(speed);
  const against = (throttle !== 0 && Math.sign(throttle) === -Math.sign(speed)) || brakeHard || stranded;
  const rate = slowing && against ? 2 * ride.accel : ride.accel;
  let next = approach(speed, target, rate * dt);
  // Braking stops at zero within a step; going the other way starts on the next one.
  if (next === 0 || (speed !== 0 && Math.sign(next) === -Math.sign(speed))) next = 0;
  state.speed = next;

  // Turning.
  const turnShare = stranded
    ? 0
    : ride.model === 'ground'
      ? Math.min(1, Math.abs(next) / (LOW_SPEED * ride.maxSpeed))
      : 1;
  const turned = -steer * ride.turn * DEG * turnShare * dt * (next < 0 ? -1 : 1);
  state.yaw += turned;
  state.side += next * Math.sin(turned);
  state.side *= (1 - ride.grip) ** (dt * 10);
  if (Math.abs(state.side) < 1e-6) state.side = 0;

  // Horizontal.
  const sin = Math.sin(state.yaw);
  const cos = Math.cos(state.yaw);
  out.dx = (next * sin - state.side * cos) * dt;
  out.dz = (next * cos + state.side * sin) * dt;

  // Vertical.
  if (ride.model === 'air') {
    let vy = ride.climb * ((input.up ? 1 : 0) - (input.down ? 1 : 0));
    const low = LOW_SPEED * ride.maxSpeed;
    if (ride.glide && Math.abs(next) < low) vy -= GRAVITY * ride.gravity * (1 - Math.abs(next) / low);
    let y = airCeiling(ride, state.y, state.y + vy * dt, surface.ground, dt);
    y = Math.max(y, surface.ground);
    state.vy = vy;
    out.dy = y - state.y;
  } else if (ride.model === 'water' && surface.water !== null) {
    const float = surface.water - FLOAT_DEPTH;
    const dy = (float - state.y) * Math.min(1, FLOAT_EASE * dt);
    state.vy = dy / dt;
    out.dy = dy;
  } else {
    state.vy -= GRAVITY * ride.gravity * dt;
    const y = state.y + state.vy * dt;
    if (y <= surface.ground) {
      out.dy = surface.ground - state.y;
      state.vy = 0;
    } else out.dy = y - state.y;
  }
  return out;
}

/**
 * A flying item's height `y` held under its limit `ground + ceiling`: a climb stops at the limit,
 * and an item already above it (the ground under it fell away) comes down at `MOVE_CHECK.airDrop`
 * instead of snapping. `fromY` is where it was before the step. The runtime calls this again with
 * the ground where the item arrives.
 */
export function airCeiling(ride: Ride, fromY: number, y: number, ground: number, dt: number): number {
  const cap = ground + ride.ceiling;
  if (y <= cap) return y;
  return Math.max(cap, Math.min(y, fromY - MOVE_CHECK.airDrop * dt));
}

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

/** Seconds a move is judged over: never negative, never more than `MOVE_CHECK.maxElapsedMs`. */
function elapsedSec(from: MoveSample, now: number): number {
  return Math.min(Math.max(now - from.at, 0), MOVE_CHECK.maxElapsedMs) / 1000;
}

/**
 * The budget left after going `distance` where `allowance` was allowed with `budget` in hand, or
 * -1 when the move is too far: a token bucket that fills at the allowed speed and holds at most
 * `MOVE_CHECK.slack`.
 */
function spend(budget: number | undefined, allowance: number, distance: number): number {
  const have = Math.min(MOVE_CHECK.slack, Math.max(0, budget ?? MOVE_CHECK.slack));
  const left = have + allowance - distance;
  return left < 0 ? -1 : Math.min(MOVE_CHECK.slack, left);
}

/**
 * Whether a walking player's move is within reach: horizontally `walkSpeed` times the `set_speed`
 * factor per second (at most one second of it), plus what is left of the slack budget. Vertical
 * moves are not judged. On success the budget left is written to `out`.
 */
export function walkMoveAllowed(
  from: MoveSample,
  to: { x: number; y: number; z: number },
  now: number,
  speedFactor: number,
  out?: MoveBudget,
): boolean {
  const allowance = MOVE_CHECK.walkSpeed * speedFactor * elapsedSec(from, now);
  const slack = spend(from.slack, allowance, Math.hypot(to.x - from.x, to.z - from.z));
  if (slack < 0) return false;
  if (out) {
    out.slack = slack;
    out.rise = MOVE_CHECK.slack;
  }
  return true;
}

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
export function rideMoveAllowed(
  ride: Ride,
  from: MoveSample,
  to: { x: number; y: number; z: number },
  now: number,
  surfaceAt: (x: number, z: number) => RideSurface,
  speedFactor: number,
  out?: MoveBudget,
): boolean {
  const t = elapsedSec(from, now);
  const { slack, rideTolerance } = MOVE_CHECK;
  const horizontal = ride.maxSpeed * rideTolerance * speedFactor * t;
  const slackLeft = spend(from.slack, horizontal, Math.hypot(to.x - from.x, to.z - from.z));
  if (slackLeft < 0) return false;
  const dy = to.y - from.y;
  const upRate = ride.model === 'air' ? ride.climb * rideTolerance : Math.max(ride.maxSpeed, 20);
  const downRate = ride.model === 'air' ? MOVE_CHECK.fallSpeed : Math.max(ride.maxSpeed, 20);
  const riseLeft = spend(from.rise, upRate * t, Math.max(0, dy));
  if (riseLeft < 0) return false;
  if (-dy > downRate * t + slack) return false;
  if (ride.model === 'water') {
    const surface = surfaceAt(to.x, to.z);
    if (surface.water === null) {
      // Stranded on dry land (the water went): it may stay where it is and settle, never move on.
      const drift = Math.hypot(to.x - from.x, to.z - from.z);
      const stays = drift <= MOVE_CHECK.strandedDrift && dy <= MOVE_CHECK.strandedDrift;
      if (!stays || surfaceAt(from.x, from.z).water !== null) return false;
    } else if (Math.abs(to.y - surface.water) > MOVE_CHECK.waterBand) return false;
  } else if (ride.model === 'air') {
    const cap = surfaceAt(to.x, to.z).ground + ride.ceiling + MOVE_CHECK.ceilingSlack;
    // Over a drop the limit falls with the ground: coming down toward it is fine, staying up is not.
    const descending = to.y <= from.y - MOVE_CHECK.ceilingDrop * t + MOVE_CHECK.ceilingDropSlack;
    if (to.y > cap && !descending) return false;
  }
  if (out) {
    out.slack = slackLeft;
    out.rise = riseLeft;
  }
  return true;
}
