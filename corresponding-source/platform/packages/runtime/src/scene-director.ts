export type SceneMotion = 'dance' | 'bob' | 'spin' | 'sway';
export interface ScenePose { x: number; y: number; z: number; yaw: number; pitch?: number; roll?: number }
/** A filming-only pose overlay. It never invokes native sit toggles or owns gameplay state. */
export class SceneAnimationLayer {
  #clip: string | null = null;
  #left: number | null = null;
  get active(): boolean { return this.#clip !== null; }
  start(clip: string, duration: number | null): void { this.#clip = clip; this.#left = duration; }
  stop(): void { this.#clip = null; this.#left = null; }
  update(dt: number): void {
    if (this.#left !== null) { this.#left -= Math.max(0, dt); if (this.#left <= 0) this.stop(); }
  }
  resolve(gameplay: string, rider: string | null): string { return rider ?? this.#clip ?? gameplay; }
}
/** Generic object choreography; this does not claim skeletal retargeting for incompatible rigs. */
export function scenePose(base: ScenePose, motion: SceneMotion, time: number): ScenePose {
  const pose = { ...base }, beat = time * Math.PI * 2;
  if (motion === 'dance') { pose.y += Math.abs(Math.sin(beat)) * .2; pose.roll = (base.roll ?? 0) + Math.sin(beat) * .2; pose.yaw += Math.sin(beat / 2) * .35; }
  if (motion === 'bob') pose.y += Math.sin(beat) * .2;
  if (motion === 'spin') pose.yaw += time * Math.PI;
  if (motion === 'sway') pose.roll = (base.roll ?? 0) + Math.sin(beat) * .2;
  return pose;
}

/**
 * Where an object stands `time` seconds into a walk along its spots (FILM-10b): it goes from `start` through each
 * spot in order at `speed` metres a second, turned the way it goes, kept `lift` metres above the ground under it,
 * and stays on the last spot afterwards.
 */
export function travelPose(start: ScenePose, spots: ReadonlyArray<{ x: number; z: number }>, speed: number, time: number,
  groundAt: (x: number, z: number) => number, lift: number): ScenePose {
  let left = Math.max(0, time) * Math.max(0, speed), x = start.x, z = start.z, yaw = start.yaw;
  for (const spot of spots) {
    const dx = spot.x - x, dz = spot.z - z, length = Math.hypot(dx, dz);
    if (length > 1e-6) yaw = Math.atan2(dx, dz);
    if (left < length) { x += (dx / length) * left; z += (dz / length) * left; left = 0; break; }
    left -= length; x = spot.x; z = spot.z;
  }
  return { ...start, x, z, yaw, y: groundAt(x, z) + lift };
}
