import { SCRIPT_LIMITS, type PlaceScript } from '@genvr/contracts';

/** The place budget window (spec 5.4): one second. */
export const WINDOW_MS = 1000;

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
export class ScriptGuard {
  #place: Use[] = [];
  #starts: Use[] = [];
  #kills: number[] = [];
  /** Each enabled script's text at the last kill (by id). */
  #sources = new Map<string, string>();

  /** Script time of the place in the second ending at `now`. */
  placeUsed(now: number): number {
    return windowSum(this.#place, now, WINDOW_MS);
  }

  /** Match-start time of the place in the start window ending at `now`. */
  startUsed(now: number): number {
    return windowSum(this.#starts, now, SCRIPT_LIMITS.startWindowMs);
  }

  /** Charges a handler call (or the end-of-call hook) to the place. */
  chargeCall(at: number, ms: number): void {
    this.#place.push({ at, ms });
  }

  /** Charges one script's start (sandbox, prelude and top level) to the place and to the start window. */
  chargeStart(at: number, ms: number): void {
    this.#place.push({ at, ms });
    this.#starts.push({ at, ms });
  }

  /** Why a script may not start now (the place budget or the start window), or null. */
  startRefusal(now: number): string | null {
    if (this.placeUsed(now) >= SCRIPT_LIMITS.placeMsPerSecond)
      return `the scripts of this place used their ${SCRIPT_LIMITS.placeMsPerSecond} ms of this second`;
    if (this.startUsed(now) >= SCRIPT_LIMITS.startMsPerWindow)
      return `match starts of this place used ${SCRIPT_LIMITS.startMsPerWindow} ms of script time in ${SCRIPT_LIMITS.startWindowMs / 1000} seconds`;
    return null;
  }

  /** Counts a kill at `now` and remembers the scripts' texts (a changed text may come back sooner). */
  recordKill(now: number, scripts: readonly PlaceScript[]): number {
    this.#prune(now);
    this.#kills.push(now);
    this.#sources = new Map(scripts.filter((s) => s.enabled).map((s) => [s.id, s.source]));
    return this.#kills.length;
  }

  /** Kills in the window ending at `now`. */
  kills(now: number): number {
    this.#prune(now);
    return this.#kills.length;
  }

  /**
   * Whether the place's scripts are off after too many kills: null when they may start; otherwise when they may
   * start again by themselves (`until`, budget clock) and, if a changed script may start sooner, from when (`retryAt`;
   * null while no script changed).
   */
  retired(now: number, scripts: readonly PlaceScript[]): { until: number; retryAt: number | null } | null {
    this.#prune(now);
    const count = this.#kills.length;
    if (count < SCRIPT_LIMITS.kills) return null;
    const last = this.#kills[count - 1]!;
    const until = this.#kills[count - SCRIPT_LIMITS.kills]! + SCRIPT_LIMITS.killWindowMs;
    const changed = scripts.some((s) => s.enabled && this.#sources.get(s.id) !== s.source);
    if (!changed) return { until, retryAt: null };
    const wait = Math.min(
      SCRIPT_LIMITS.killWindowMs,
      SCRIPT_LIMITS.killRetryMs * 2 ** (count - SCRIPT_LIMITS.kills),
    );
    const retryAt = last + wait;
    return now >= retryAt ? null : { until, retryAt };
  }

  #prune(now: number): void {
    while (this.#kills.length > 0 && this.#kills[0]! <= now - SCRIPT_LIMITS.killWindowMs) this.#kills.shift();
  }
}

/** The ms of `usage` within the window ending at `now`; older entries are dropped. */
export function windowSum(usage: Use[], now: number, windowMs: number): number {
  while (usage.length > 0 && usage[0]!.at <= now - windowMs) usage.shift();
  let sum = 0;
  for (const entry of usage) sum += entry.ms;
  return sum;
}
