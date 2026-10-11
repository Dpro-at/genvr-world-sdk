/**
 * The speed over the ground the Speed display shows (m/s): measured from where the player's feet
 * were last frame, smoothed. A teleport (respawn, a room move, getting off an item, falling out of
 * the world) is no speed: the caller resets the meter, and a move faster than `teleportSpeed` in
 * one frame (no walking or falling body gets near it; ridden items give their own speed) is skipped
 * as one too, so the display never shows the jump.
 */
export const GROUND_SPEED = {
  /** How fast (per second) the shown value follows the measured one. */
  rate: 5,
  /** A sample faster than this is a teleport, not a move (m/s). */
  teleportSpeed: 100,
} as const;

export class GroundSpeed {
  value = 0;
  #lastX = Number.NaN;
  #lastZ = Number.NaN;

  /** Forget where the feet were and show 0: the next sample only sets the start again. */
  reset(): void {
    this.value = 0;
    this.#lastX = Number.NaN;
  }

  /** A steered item's own speed (riding); measuring starts again from the next sample. */
  set(speed: number): void {
    this.value = Math.abs(speed);
    this.#lastX = Number.NaN;
  }

  /** The feet at (x, z) after `dt` seconds. */
  sample(x: number, z: number, dt: number): void {
    if (dt > 0 && !Number.isNaN(this.#lastX)) {
      const measured = Math.hypot(x - this.#lastX, z - this.#lastZ) / dt;
      if (measured <= GROUND_SPEED.teleportSpeed)
        this.value += (measured - this.value) * Math.min(1, dt * GROUND_SPEED.rate);
    }
    this.#lastX = x;
    this.#lastZ = z;
  }
}
