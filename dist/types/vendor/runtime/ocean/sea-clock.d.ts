import type { SeaSwell } from '../../contracts/index.js';
/** The FFT clock wraps after this many seconds. */
export declare const SEA_CLOCK_WRAP = 3600;
/** The shore clock wraps after this many waves of the swell's period. */
export declare const SHORE_CLOCK_WAVES = 400;
/** Seconds of FFT wave time at a room time (ms since 1970). */
export declare function seaClock(roomMs: number): number;
/** Seconds of shore-wave time at a room time: wraps after SHORE_CLOCK_WAVES whole periods. */
export declare function shoreClock(roomMs: number, period: number): number;
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
export declare function swellFromSetting(setting: SeaSwell | undefined): Swell;
