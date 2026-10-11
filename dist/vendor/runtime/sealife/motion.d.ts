/**
 * Sea-life vertex motion (SEALIFE-01): the CPU twins of the shader formulas in `sealife/material.ts`, used by tests
 * to prove the motion stays inside the item's bounds. Both read the per-vertex `aMotion` attribute, so one shared
 * material animates every copy with its own amount, speed and phase (baked per build from the item's parameters).
 *
 * - `lift` (starfish arm curl): y += amp * (0.5 + 0.5 * sin(time * speed + phase)). Only upward, never into the
 *   ground. aMotion = (amp m, phase rad, speed rad/s, 0).
 * - `hinge` (giant clam): close = pow(0.5 + 0.5 * cos(time * speed + phase), CLAM_CLOSE_SHARPNESS); the vertex turns
 *   about the hinge line (the local X axis through the origin) by angleAmp * close, then drops by drop * close.
 *   aMotion = (angleAmp rad, phase rad, speed rad/s, drop m). Mostly open, with a slow partial close now and then;
 *   the valves never meet (the amplitude is a fraction of the rest gape).
 */
export declare const CLAM_CLOSE_SHARPNESS = 4;
export type Motion = readonly [number, number, number, number];
/** Starfish lift at `time` seconds. */
export declare function liftOffset(motion: Motion, time: number): number;
/** How far the clam is closing at `time` (0 open at rest, 1 the most it closes). */
export declare function clamClose(motion: Motion, time: number): number;
/** A clam vertex moved by the hinge motion at `time`. */
export declare function hingePosition(p: readonly [number, number, number], motion: Motion, time: number): [number, number, number];
