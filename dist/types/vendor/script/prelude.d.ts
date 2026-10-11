/** File name of the prelude in stack traces (error lines are read only from the creator's `script.js` frames). */
export declare const PRELUDE_FILE = "genvr-prelude.js";
/**
 * Host protocol (strings only, spec 7.2), captured by the prelude and deleted from the global before creator code:
 * - `__read(json)`: `{ op, ... }` -> JSON. `op: 'on'` registers a handler (top level only); the others are reads.
 * - `__act(json)`: `{ a: action, o: options | null }` -> 'true' | 'false'. `{ big: n }` reports an action that was
 *   too large to send.
 * - `__log(text)`: `'L' + line` writes a line and answers the lines still allowed this second (<= 0: muted for the rest
 *   of the call); `'D' + n` reports n lines the prelude dropped while muted.
 * - `__on(fn)` (from the sandbox's bootstrap): registers a function and answers its number. Number 0 is the prelude's
 *   own end-of-call hook (it reports dropped lines); creator handlers start at 1.
 */
export declare function prelude(seed: number): string;
