import { type PlaceScript } from '../contracts/index.js';
/** The place budget window (spec 5.4): one second. */
export declare const WINDOW_MS = 1000;
/** One measured stretch of script time on the budget clock. */
interface Use {
    at: number;
    ms: number;
}
/**
 * The script time and the kills of one place in one room, across its games (second review, critical 1 and 2): a room
 * keeps one guard for its life, so a match start, a new game for an edit, or a restart storm cannot reset what the
 * place already used. A runner without a guard (a dry run, tests) makes its own.
 *
 * - **Place time:** handler calls and match starts (sandbox, prelude, top level) share `placeMsPerSecond` in a rolling
 *   second; match starts also share `startMsPerWindow` in a rolling `startWindowMs`.
 * - **Kills:** a call ended on the hard deadline, a worker that died by itself, or a call over the watchdog. After
 *   `kills` of them in `killWindowMs` the place's scripts stay off. They start again when the window has passed
 *   since the last kill, or when a script that was enabled at the last kill has changed its text, but not sooner than
 *   `killRetryMs` after the last kill, doubled for every kill past the limit (so re-saving a hostile script costs one
 *   stall at 5, 10, 20, 40 ... seconds, never one a second).
 */
export declare class ScriptGuard {
    #private;
    /** Script time of the place in the second ending at `now`. */
    placeUsed(now: number): number;
    /** Match-start time of the place in the start window ending at `now`. */
    startUsed(now: number): number;
    /** Charges a handler call (or the end-of-call hook) to the place. */
    chargeCall(at: number, ms: number): void;
    /** Charges one script's start (sandbox, prelude and top level) to the place and to the start window. */
    chargeStart(at: number, ms: number): void;
    /** Why a script may not start now (the place budget or the start window), or null. */
    startRefusal(now: number): string | null;
    /** Counts a kill at `now` and remembers the scripts' texts (a changed text may come back sooner). */
    recordKill(now: number, scripts: readonly PlaceScript[]): number;
    /** Kills in the window ending at `now`. */
    kills(now: number): number;
    /**
     * Whether the place's scripts are off after too many kills: null when they may start; otherwise when they may
     * start again by themselves (`until`, budget clock) and, if a changed script may start sooner, from when (`retryAt`;
     * null while no script changed).
     */
    retired(now: number, scripts: readonly PlaceScript[]): {
        until: number;
        retryAt: number | null;
    } | null;
}
/** The ms of `usage` within the window ending at `now`; older entries are dropped. */
export declare function windowSum(usage: Use[], now: number, windowMs: number): number;
export {};
