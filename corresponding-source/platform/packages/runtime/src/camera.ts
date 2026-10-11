/** Third-person follow camera settings (task P3-15). */
export const FOLLOW_CAMERA = {
  /** Radius of the sphere swept from the player's head to the camera. */
  probeRadius: 0.25,
  /** Gap kept between the camera and whatever blocks it. */
  margin: 0.1,
  /** Closest the camera gets to the head; closer than `hideAvatarBelow` hides the avatar. */
  minDistance: 0.4,
  hideAvatarBelow: 1,
  /** How fast (per second) the camera eases back out once the way is clear. */
  returnRate: 5,
} as const;

/**
 * Chase camera while riding an item (movement modes, spec 8): behind the item at the ride's
 * `camera` distance, looking 20 degrees down, easing to the item's yaw and height; after the player
 * looked around, it waits `lookBack` seconds before easing back behind.
 */
export const CHASE_CAMERA = {
  /** Radians down (20 degrees). */
  pitch: (20 * Math.PI) / 180,
  /** How fast (per second) the camera turns to behind the item and follows its height. */
  rate: 3,
  /** Seconds after the last look input before the camera eases back behind the item. */
  lookBack: 1.5,
  /** Height of the look point above the rider's seat, m. */
  lookHeight: 1.2,
} as const;

/**
 * The chase camera's next orbit yaw: unchanged for `lookBack` seconds after a look input
 * (`sinceLook`), then eased toward `target` (behind the item) the short way round.
 */
export function chaseCameraYaw(current: number, target: number, dt: number, sinceLook: number): number {
  if (sinceLook < CHASE_CAMERA.lookBack) return current;
  const turn = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + turn * (1 - Math.exp(-CHASE_CAMERA.rate * dt));
}

/**
 * Next camera distance: moves in at once when something blocks the view (never clips through a
 * wall), and eases back out smoothly when the way is clear again.
 */
export function nextCameraDistance(current: number, allowed: number, dt: number): number {
  const target = Math.max(FOLLOW_CAMERA.minDistance, allowed);
  if (target <= current) return target;
  return current + (target - current) * (1 - Math.exp(-FOLLOW_CAMERA.returnRate * dt));
}

/** A box turned `yaw` about the vertical axis (as `itemColliderBox` gives it). */
export interface TurnedBox {
  center: readonly number[];
  half: readonly number[];
  yaw: number;
}

/**
 * How far the camera may go from `origin` along the unit vector `dir` (at most `max`) before a
 * sphere of `radius` touches `box`: for things that have no physics body (the scattered woods),
 * so the follow and chase cameras do not end up inside a trunk. A box the origin is already in
 * (the player standing against it) does not stop the camera.
 */
export function rayBoxDistance(
  origin: { x: number; y: number; z: number },
  dir: { x: number; y: number; z: number },
  box: TurnedBox,
  max: number,
  radius: number,
): number {
  const cos = Math.cos(box.yaw);
  const sin = Math.sin(box.yaw);
  const dx = origin.x - box.center[0]!;
  const dz = origin.z - box.center[2]!;
  // Into the box's own frame (the inverse of `itemColliderBox`'s turn).
  const start = [dx * cos - dz * sin, origin.y - box.center[1]!, dx * sin + dz * cos];
  const step = [dir.x * cos - dir.z * sin, dir.y, dir.x * sin + dir.z * cos];
  let near = -Infinity;
  let far = Infinity;
  for (let axis = 0; axis < 3; axis++) {
    const half = box.half[axis]! + radius;
    const s = start[axis]!;
    const d = step[axis]!;
    if (Math.abs(d) < 1e-9) {
      if (Math.abs(s) > half) return max;
      continue;
    }
    let t0 = (-half - s) / d;
    let t1 = (half - s) / d;
    if (t0 > t1) [t0, t1] = [t1, t0];
    near = Math.max(near, t0);
    far = Math.min(far, t1);
    if (near > far) return max;
  }
  if (near < 0 || near > max) return max;
  return near;
}
