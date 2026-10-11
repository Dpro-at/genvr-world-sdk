/*
 * The sea's clock (Tidewater sea, plan task 3). Genvr's own code.
 *
 * Every device in a room shows the same wave at the same moment: the FFT is a pure function of its seed and the
 * time, the shore waves of the shore field and the time, so both run on the room's server time (the room sends
 * 'time' on join; the web app keeps `serverOffset = now - Date.now()` and hands it to the runtime). Outside a room
 * the offset is 0 and the local clock is used.
 *
 * Shaders keep time in float32, so the clocks wrap: the FFT clock once an hour (steps of 0.25 ms, one jump an hour,
 * the same on every device), the shore clock after a whole number of waves so the shore phase never jumps.
 */
import type { SeaSwell } from '@genvr/contracts';
import { SHORE_DEFAULTS } from './shore-waves.js';

/** The FFT clock wraps after this many seconds. */
export const SEA_CLOCK_WRAP = 3600;
/** The shore clock wraps after this many waves of the swell's period. */
export const SHORE_CLOCK_WAVES = 400;

const wrap = (seconds: number, span: number) => ((seconds % span) + span) % span;

/** Seconds of FFT wave time at a room time (ms since 1970). */
export function seaClock(roomMs: number): number {
  return wrap(roomMs / 1000, SEA_CLOCK_WRAP);
}

/** Seconds of shore-wave time at a room time: wraps after SHORE_CLOCK_WAVES whole periods. */
export function shoreClock(roomMs: number, period: number): number {
  return wrap(roomMs / 1000, period * SHORE_CLOCK_WAVES);
}

/** The swell the shore waves use: the place's setting with Tidewater's values for anything absent. */
export interface Swell {
  period: number;
  /** Offshore amplitude (half the wave height), m. */
  amplitude: number;
  /** Unit xz direction the waves travel in, or null: computed from the open side of the island. */
  direction: [number, number] | null;
}

/**
 * `sea.swell` read for the runtime. `direction` there is where the waves come from, in degrees clockwise from
 * north (-z), so they travel the opposite way.
 */
export function swellFromSetting(setting: SeaSwell | undefined): Swell {
  const deg = setting?.direction;
  const rad = deg === undefined ? 0 : (deg * Math.PI) / 180;
  return {
    period: setting?.period ?? SHORE_DEFAULTS.period,
    amplitude: setting?.height ?? SHORE_DEFAULTS.amplitude,
    // from (sin a, -cos a), travelling (-sin a, cos a)
    direction: deg === undefined ? null : [-Math.sin(rad), Math.cos(rad)],
  };
}
