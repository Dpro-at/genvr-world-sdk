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
export declare function cutLine(text: string): string;
/** The last `SCRIPT_LIMITS.logLines` lines of a place. */
export declare class LogRing {
    #private;
    push(line: ScriptLogLine): void;
    lines(): readonly ScriptLogLine[];
}
/**
 * The `genvr.log` rate of one script: `SCRIPT_LIMITS.logPerSecond` lines per second of the session clock; the rest is
 * counted and reported as one "n lines dropped" line at the end of the call.
 */
export declare class LogRate {
    #private;
    dropped: number;
    /** Whether a line at session time `now` may be written; counts it either way. Returns the lines still allowed. */
    take(now: number): number;
}
