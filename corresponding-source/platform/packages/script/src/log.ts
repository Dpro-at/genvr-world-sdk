import { SCRIPT_LIMITS } from '@genvr/contracts';

/**
 * One line of a place's script log (spec 10): `genvr.log` lines, errors, refusals, strikes, switch-offs and match
 * starts. `at` is the session clock (server ms). Creator data: it reaches builders only, never players or the server log.
 */
export interface ScriptLogLine {
  at: number;
  /** The script's name ('' for a line about the whole place). */
  script: string;
  level: 'log' | 'error' | 'refused' | 'strike' | 'off' | 'start';
  text: string;
  line?: number;
}

/** Cuts a text to `SCRIPT_LIMITS.logChars`. */
export function cutLine(text: string): string {
  return text.length > SCRIPT_LIMITS.logChars ? `${text.slice(0, SCRIPT_LIMITS.logChars - 3)}...` : text;
}

/** The last `SCRIPT_LIMITS.logLines` lines of a place. */
export class LogRing {
  #lines: ScriptLogLine[] = [];

  push(line: ScriptLogLine): void {
    this.#lines.push(line);
    if (this.#lines.length > SCRIPT_LIMITS.logLines)
      this.#lines.splice(0, this.#lines.length - SCRIPT_LIMITS.logLines);
  }

  lines(): readonly ScriptLogLine[] {
    return [...this.#lines];
  }
}

/**
 * The `genvr.log` rate of one script: `SCRIPT_LIMITS.logPerSecond` lines per second of the session clock; the rest is
 * counted and reported as one "n lines dropped" line at the end of the call.
 */
export class LogRate {
  #second = -1;
  #count = 0;
  dropped = 0;

  /** Whether a line at session time `now` may be written; counts it either way. Returns the lines still allowed. */
  take(now: number): number {
    const second = Math.floor(now / 1000);
    if (second !== this.#second) {
      this.#second = second;
      this.#count = 0;
    }
    if (this.#count >= SCRIPT_LIMITS.logPerSecond) {
      this.dropped += 1;
      return -1;
    }
    this.#count += 1;
    return SCRIPT_LIMITS.logPerSecond - this.#count;
  }
}
