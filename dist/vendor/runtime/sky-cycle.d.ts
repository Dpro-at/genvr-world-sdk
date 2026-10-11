import { type SkyPreset } from '../contracts/index.js';
import { type SkyLook } from '../core-library/index.js';
export type Direction = [number, number, number];
/** What the sky shows at one moment: colors, where the light comes from, and how dark it is. */
export interface SkyState {
    look: SkyLook;
    /** Direction toward the light that casts shadows: the sun by day, the moon by night. */
    light: Direction;
    /** Share of the light's strength (it fades out while the light hands over from sun to moon). */
    lightShare: number;
    /** 0 by day, 1 at full night (stars). */
    night: number;
    /** Direction toward the moon while it is up, else null. */
    moon: Direction | null;
    /** Direction toward the sun where it really is, below the horizon at night (physical sky, P2-36). */
    sun: Direction;
    /** Which sky it is closest to (world sounds: birds by day, crickets at night). */
    phase: SkyPreset;
}
/**
 * Time of day in a day-night cycle (P2-02): 0 is midnight, 0.25 sunrise, 0.5 noon, 0.75
 * sunset. It comes from the wall clock, so everyone in a place sees the same time without the
 * room sending it.
 */
export declare function timeOfDay(nowMs: number, cycleMinutes: number): number;
/** The sky of a fixed preset (no cycle). */
export declare function presetSky(preset: SkyPreset, params?: Readonly<Record<string, unknown>>): SkyState;
/**
 * The sky at a time of day in the cycle: the sun rises, climbs to 65° at noon, and sets on the
 * other side; colors go from night through sunset to day and back; the moon stands opposite
 * the sun and lights the night.
 */
export declare function cycleSky(time: number): SkyState;
