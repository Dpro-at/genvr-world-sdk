import { type WorldDocument } from '../contracts/index.js';
import type { WorldFinding } from './world-checks.js';
/**
 * Checks of creator scripts (P2-10, spec `docs/superpowers/specs/2026-10-02-script-sandbox-design.md` 8). Pure and
 * without WASM: a light tokenizer reads the literal names a script gives `genvr.on`, `genvr.emit`, `genvr.act`,
 * `genvr.counter` and `genvr.zones`; nothing is ever run. Whether a script compiles needs the sandbox, so the API adds
 * that (`script-syntax`).
 */
/** The literal names in one script's source (strings and templates without `${}`), each once, in order. */
export interface ScriptLiterals {
    /** Event names given to `genvr.on`. */
    on: string[];
    /** Custom events raised by `genvr.emit` or `genvr.act({ kind: 'emit', event })`. */
    emits: string[];
    /** Counters named by `genvr.counter` and the counter actions (`add_counter`, `set_counter`, `byCounter`). */
    counters: string[];
    /** Zone tags named by `genvr.zones` and `teleport_to_zone`. */
    zoneTags: string[];
    /** A name of an event, an emit or a zone tag is worked out while the script runs (or an action is not written out). */
    dynamic: boolean;
}
/** The literal names a script uses (spec 8); a small tokenizer, it never evaluates code and never throws. */
export declare function scriptLiterals(source: string): ScriptLiterals;
/** What the place's enabled scripts use together, for the game checks (`checkGameRules`). */
export interface ScriptUsage {
    emits: Set<string>;
    counters: string[];
    /** Zone tags the scripts name; `everyZone` when a script hears zone events without naming any existing tag. */
    zoneTags: Set<string>;
    everyZone: boolean;
    /** A script names an event, an emit or a zone tag while running: "nobody raises / uses" warnings are skipped. */
    dynamic: boolean;
}
/** Zone tags the place has, with the zones' instance ids. */
export declare function zoneTagsOf(doc: WorldDocument): Map<string, string[]>;
/** The names the place's enabled scripts use, read once per check. */
export declare function scriptUsage(doc: WorldDocument): ScriptUsage;
/**
 * Findings about the place's scripts (spec 8): enabled scripts without a game, scripts over the size limits, events a
 * script hears that nobody raises, counters the game does not declare, zone tags no zone has, switched-off scripts,
 * and names worked out while running. Switched-off scripts are only noted (they run nothing). Messages describe the
 * script, never a kind of game.
 */
export declare function checkScripts(doc: WorldDocument): WorldFinding[];
