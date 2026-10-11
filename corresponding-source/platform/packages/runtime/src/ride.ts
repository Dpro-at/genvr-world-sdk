import type { Ride } from '@genvr/contracts';
import { airCeiling, stepRide, type RideInput, type RideState, type RideSurface } from '@genvr/world';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { MoveIntent } from './input.js';
import type { BoxCharacter, PhysicsWorld, Vec3Like } from './physics.js';

/**
 * Riding an item on this device (movement modes, spec sections 6 to 9): where the seats are, how
 * the input drives the item, and the local prediction (`stepRide` resolved against the colliders).
 * The room judges every move; this only predicts and draws. Nothing here knows what the item is.
 */

/** Where an item is: its origin and its turn about the vertical axis. */
export interface Pose4 {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

/** An item's box in its own space (already scaled), as its model bounds give it. */
export interface RideBounds {
  min: Vec3Like;
  max: Vec3Like;
}

/** Seat layout (spec 7): rows of two across, rows this far apart, the first row this share back. */
export const SEATS = {
  /** Narrower than this: one seat per row. */
  narrow: 1.2,
  rowGap: 0.9,
  firstRow: 0.25,
} as const;

/** How a rider sits: the body's root is this far under the seat point when sitting. */
export const RIDER = { sitDrop: 0.45 } as const;

/**
 * The seats of an item, in its own space (forward is +z, left is +x): rows of two across the width
 * (one when the item is narrower than 1.2 m), seat 1 front-left (front-centre when alone in its row),
 * rows 0.9 m apart going back from 25 % of the length, at `seatHeight` of the height.
 */
export function seatLayout(bounds: RideBounds, ride: Pick<Ride, 'seats' | 'seatHeight'>): Vec3Like[] {
  const { min, max } = bounds;
  const width = max.x - min.x;
  const length = max.z - min.z;
  const centerX = (min.x + max.x) / 2;
  const perRow = width < SEATS.narrow ? 1 : 2;
  const y = min.y + ride.seatHeight * (max.y - min.y);
  const front = max.z - SEATS.firstRow * length;
  const seats: Vec3Like[] = [];
  for (let i = 0; i < ride.seats; i += 1) {
    const row = Math.floor(i / perRow);
    const inRow = Math.min(perRow, ride.seats - row * perRow);
    const across = i % perRow;
    const x = inRow === 1 ? centerX : centerX + (across === 0 ? width / 4 : -width / 4);
    seats.push({ x, y, z: front - row * SEATS.rowGap });
  }
  return seats;
}

/**
 * A point in an item's own space placed in the world at `pose` (turned about the vertical axis),
 * written into `out`.
 */
export function seatInWorld(pose: Pose4, local: Vec3Like, out: Vec3Like): Vec3Like {
  const cos = Math.cos(pose.yaw);
  const sin = Math.sin(pose.yaw);
  out.x = pose.x + local.x * cos + local.z * sin;
  out.y = pose.y + local.y;
  out.z = pose.z - local.x * sin + local.z * cos;
  return out;
}

/**
 * The ride input from the move intent: forward and back throttle, left and right steer, jump up,
 * descend down. The stick's circle is stretched to a square, so full forward while steering (W and D
 * together, or the stick pushed to a corner) is still full throttle.
 */
export function rideInput(
  intent: MoveIntent,
  out: RideInput = { throttle: 0, steer: 0, up: false, down: false },
): RideInput {
  const { x, z } = intent.direction;
  const most = Math.max(Math.abs(x), Math.abs(z));
  const stretch = most > 1e-6 ? Math.min(1, Math.hypot(x, z)) / most : 0;
  out.throttle = Math.max(-1, Math.min(1, z * stretch));
  out.steer = Math.max(-1, Math.min(1, x * stretch));
  out.up = intent.jump;
  out.down = Boolean(intent.descend);
  return out;
}

/** The heights under a point, written into `out` (no allocation per frame). */
export type SurfaceAt = (x: number, z: number, out: RideSurface) => RideSurface;

/** The most an item tilts from the ground's slope or a bank, radians. */
const MAX_TILT = 0.6;
/** Bank per radian per second of turning, in the air and a little on water. */
const BANK = { air: 0.35, water: 0.1 } as const;
const probe: RideSurface = { ground: 0, water: null };

/**
 * How an item leans (spec 6, worked out on each device, never sent): on the ground it follows the
 * slope under it (three height samples: the front, and the back left and right); in the air it banks
 * into a turn (`yawRate`, radians per second, negative turning right); on water it bobs with `time`
 * and leans a little into turns. Pitch is about the item's side axis (negative lifts the front),
 * roll about its length (positive lifts the left side).
 */
export function rideTilt(
  ride: Pick<Ride, 'model'>,
  pose: Pose4,
  size: { width: number; length: number },
  surfaceAt: SurfaceAt,
  yawRate: number,
  time: number,
  out: { pitch: number; roll: number },
): { pitch: number; roll: number } {
  const clamp = (value: number) => Math.max(-MAX_TILT, Math.min(MAX_TILT, value));
  if (ride.model === 'air') {
    out.pitch = 0;
    out.roll = clamp(-yawRate * BANK.air);
    return out;
  }
  if (ride.model === 'water') {
    out.pitch = 0.03 * Math.sin(time * 1.3);
    out.roll = clamp(0.04 * Math.sin(time * 1.7) - yawRate * BANK.water);
    return out;
  }
  const sin = Math.sin(pose.yaw);
  const cos = Math.cos(pose.yaw);
  const half = size.length / 2;
  const side = size.width / 2;
  const front = surfaceAt(pose.x + sin * half, pose.z + cos * half, probe).ground;
  // Left is (cos, -sin), back is -(sin, cos).
  const backLeft = surfaceAt(
    pose.x - sin * half + cos * side,
    pose.z - cos * half - sin * side,
    probe,
  ).ground;
  const backRight = surfaceAt(
    pose.x - sin * half - cos * side,
    pose.z - cos * half + sin * side,
    probe,
  ).ground;
  out.pitch = clamp(-Math.atan2(front - (backLeft + backRight) / 2, Math.max(0.1, size.length)));
  out.roll = clamp(Math.atan2(backLeft - backRight, Math.max(0.1, size.width)));
  return out;
}

/** How fast the drawn tilt follows the worked-out one, per second. */
const TILT_RATE = 6;

/**
 * The item the local player steers (seat 1): `stepRide` wants a displacement, the box collider
 * resolves it against walls, terrain and other items, and the result is the item's new pose. No
 * allocation per step.
 */
export class RideController {
  readonly instanceId: string;
  readonly ride: Ride;
  readonly #state: RideState;
  readonly #box: BoxCharacter;
  readonly #surfaceAt: SurfaceAt;
  readonly #surface: RideSurface = { ground: 0, water: null };
  /** The surface as the item's origin sees it: the ground lifted by how far the box reaches below the origin. */
  readonly #under: RideSurface = { ground: 0, water: null };
  readonly #ahead: RideSurface = { ground: 0, water: null };
  readonly #delta = { dx: 0, dy: 0, dz: 0 };
  readonly #want = { x: 0, y: 0, z: 0 };
  readonly #pose: Pose4 = { x: 0, y: 0, z: 0, yaw: 0 };
  readonly #tilt = { pitch: 0, roll: 0 };
  readonly #target = { pitch: 0, roll: 0 };
  readonly #size: { width: number; length: number };
  readonly #below: number;
  #time = 0;

  constructor(
    physics: PhysicsWorld,
    item: { instanceId: string; bounds: RideBounds; pose: Pose4 },
    ride: Ride,
    surfaceAt: SurfaceAt,
  ) {
    this.instanceId = item.instanceId;
    this.ride = ride;
    this.#surfaceAt = surfaceAt;
    const { min, max } = item.bounds;
    this.#below = min.y;
    this.#size = { width: max.x - min.x, length: max.z - min.z };
    const { x, y, z, yaw } = item.pose;
    this.#state = { x, y, z, yaw, speed: 0, side: 0, vy: 0 };
    this.#box = physics.createBoxCharacter(
      item.pose,
      yaw,
      { x: (min.x + max.x) / 2, y: (min.y + max.y) / 2, z: (min.z + max.z) / 2 },
      { x: (max.x - min.x) / 2, y: (max.y - min.y) / 2, z: (max.z - min.z) / 2 },
      ride.model === 'ground',
    );
    this.#writePose();
  }

  /** The item's box (the camera sweep skips it). */
  get collider(): RAPIER.Collider {
    return this.#box.collider;
  }

  /** Where the item is now. The same object every time: copy it to keep it. */
  get pose(): Readonly<Pose4> {
    return this.#pose;
  }

  /** Forward speed, m/s (negative backward). */
  get speed(): number {
    return this.#state.speed;
  }

  /** How the item leans now (eased), radians. */
  get tilt(): Readonly<{ pitch: number; roll: number }> {
    return this.#tilt;
  }

  /** One step of `dt` seconds with the rider's input and `set_speed` factor. */
  step(input: RideInput, dt: number, speedFactor: number): void {
    if (!(dt > 0)) return;
    const state = this.#state;
    const surface = this.#surfaceAt(state.x, state.z, this.#surface);
    this.#under.ground = surface.ground - this.#below;
    this.#under.water = surface.water;
    const yawBefore = state.yaw;
    const fromY = state.y;
    const delta = stepRide(this.ride, state, input, this.#under, dt, speedFactor, this.#delta);
    // The height limit of a flying item is the one where it arrives: past a cliff edge it comes
    // down in that same step (at `airDrop`), as the room judges it, instead of a step later.
    if (this.ride.model === 'air') {
      const ahead = this.#surfaceAt(state.x + delta.dx, state.z + delta.dz, this.#ahead);
      delta.dy = airCeiling(this.ride, fromY, fromY + delta.dy, ahead.ground - this.#below, dt) - fromY;
    }
    this.#want.x = delta.dx;
    this.#want.y = delta.dy;
    this.#want.z = delta.dz;
    // A water item never leaves the water: the shore stops it like a wall (the room refuses the rest).
    if (
      this.ride.model === 'water' &&
      surface.water !== null &&
      this.#surfaceAt(state.x + delta.dx, state.z + delta.dz, this.#ahead).water === null
    ) {
      this.#want.x = 0;
      this.#want.z = 0;
      delta.dx = 0;
      delta.dz = 0;
      state.speed = 0;
      state.side = 0;
    }
    const moved = this.#box.move(this.#want, state.yaw, dt);
    // Blocked sideways (a wall, another item): the speed goes with the way that was left.
    const wanted = Math.hypot(delta.dx, delta.dz);
    if (wanted > 1e-4) {
      const got = Math.hypot(moved.x, moved.z);
      if (got < wanted * 0.9) {
        const share = got / wanted;
        state.speed *= share;
        state.side *= share;
      }
    }
    // Held up or down by something the height values do not know (a deck, a roof): stop falling or climbing.
    if (Math.abs(moved.y - delta.dy) > 1e-3) state.vy = 0;
    const at = this.#box.position;
    state.x = at.x;
    state.y = at.y;
    state.z = at.z;
    this.#time += dt;
    const yawRate = (state.yaw - yawBefore) / dt;
    rideTilt(this.ride, this.#writePose(), this.#size, this.#surfaceAt, yawRate, this.#time, this.#target);
    const k = 1 - Math.exp(-TILT_RATE * dt);
    this.#tilt.pitch += (this.#target.pitch - this.#tilt.pitch) * k;
    this.#tilt.roll += (this.#target.roll - this.#tilt.roll) * k;
  }

  /** The room put the item somewhere else (a correction): there at once, standing still. */
  teleport(pose: Pose4): void {
    const state = this.#state;
    state.x = pose.x;
    state.y = pose.y;
    state.z = pose.z;
    state.yaw = pose.yaw;
    state.speed = 0;
    state.side = 0;
    state.vy = 0;
    this.#box.teleport(pose, pose.yaw);
    this.#writePose();
  }

  dispose(): void {
    this.#box.dispose();
  }

  #writePose(): Pose4 {
    const state = this.#state;
    this.#pose.x = state.x;
    this.#pose.y = state.y;
    this.#pose.z = state.z;
    // Kept within (-pi, pi], so the pose sent to the room stays small.
    state.yaw = Math.atan2(Math.sin(state.yaw), Math.cos(state.yaw));
    this.#pose.yaw = state.yaw;
    return this.#pose;
  }
}
