/** Tidewater Player.js 4811ba48 (MIT), source swim motion adapted from eye anchor to capsule feet. */
export interface SwimMotionState {
  floating: boolean;
  velocity: { x: number; y: number; z: number };
}
export const createSwimMotion = (): SwimMotionState => ({ floating: true, velocity: { x: 0, y: 0, z: 0 } });
/** Default third-person orbit looks down; calibrate its neutral view to horizontal swimming. */
export function swimLookForward(yaw: number, orbitPitch: number, neutralPitch: number) {
  const pitch = orbitPitch - neutralPitch;
  return { x: -Math.sin(yaw) * Math.cos(pitch), y: -Math.sin(pitch), z: -Math.cos(yaw) * Math.cos(pitch) };
}
/** Deep valid water can lie below the legacy dry-world fallout threshold. */
export function swimFallout(feetY: number, swimming: boolean, waterLevel: number | null): boolean {
  return feetY < -30 && !(swimming && waterLevel !== null);
}
export interface SwimMotionInput {
  forward: { x: number; y: number; z: number };
  right: { x: number; z: number };
  direction: { x: number; z: number };
  ascend: boolean;
  dive: boolean;
  sprint: boolean;
  /** Analogue movement magnitude; keyboard walking supplies 1. */
  magnitude: number;
}
/** Returns desired displacement. River current is applied by caller before collision resolution. */
export function stepSwimMotion(
  state: SwimMotionState,
  input: SwimMotionInput,
  feetY: number,
  floatFeetY: number,
  dt: number,
) {
  if (!(dt > 0) || !Number.isFinite(dt)) return { x: 0, y: 0, z: 0 };
  const wish = {
    x: input.forward.x * input.direction.z + input.right.x * input.direction.x,
    y: input.forward.y * input.direction.z + Number(input.ascend) - Number(input.dive),
    z: input.forward.z * input.direction.z + input.right.z * input.direction.x,
  };
  const length = Math.hypot(wish.x, wish.y, wish.z);
  if (length > 0) {
    wish.x /= length;
    wish.y /= length;
    wish.z /= length;
  }
  // Source p target=-.062, surface threshold=-.45 => target-.388 in feet coordinates.
  if (state.floating && feetY > floatFeetY - 0.388 && wish.y > -0.25 && !input.dive)
    wish.y = Math.max(wish.y, 0);
  const speed =
    (input.sprint ? 2.5 : 1.5) * (input.ascend || input.dive ? 1 : Math.min(1, Math.max(0, input.magnitude)));
  const k = 1 - Math.exp(-dt * 3);
  state.velocity.x += (wish.x * speed - state.velocity.x) * k;
  state.velocity.y += (wish.y * speed - state.velocity.y) * k;
  state.velocity.z += (wish.z * speed - state.velocity.z) * k;
  const diving = input.dive || (input.direction.z > 0 && input.forward.y < -Math.sin(0.35)) || wish.y < -0.1;
  if (diving) state.floating = false;
  else if (feetY > floatFeetY - 0.15) state.floating = true;
  let lift = 0;
  if (state.floating) {
    lift = (floatFeetY - feetY) * (1 - Math.exp(-dt * 5));
    if (state.velocity.y > 0) state.velocity.y *= 0.5;
  }
  return {
    x: state.velocity.x * dt,
    y: Math.min(lift + state.velocity.y * dt, floatFeetY + 0.112 - feetY),
    z: state.velocity.z * dt,
  };
}
