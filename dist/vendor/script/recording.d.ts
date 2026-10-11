import { type ScriptEvent, type ScriptRecording } from '../contracts/index.js';
import type { GameEvent } from '../game/index.js';
import type { Handles } from './handles.js';
/** The engine events a script may hear (the rules' vocabulary); `custom` carries the names raised by `emit`. */
export declare const ENGINE_EVENTS: ReadonlySet<string>;
export declare const SCRIPT_EVENT_TYPES: ReadonlyArray<GameEvent['type']>;
/**
 * An engine event as a script hears it (spec 4): plain JSON, every player id replaced by its handle, plus `actor`.
 * No positions, no names; `endsAt` on the script clock. Null for an internal event a script never hears.
 */
export declare function toScriptEvent(event: GameEvent, actorId: string | null, handles: Handles, matchStartedAt: number): ScriptEvent | null;
/** The name a handler registered with `genvr.on` must have to hear `event` (rules' matching, spec 4). */
export declare function scriptEventName(event: ScriptEvent): string | null;
/** A recording as the runner gives it: every event with its time and whether it was a follow-up. */
export interface FullRecording extends ScriptRecording {
    at: number[];
    caused: boolean[];
}
/**
 * The last `SCRIPT_LIMITS.recordingEvents` script-visible events of a match, with its seed, when each happened (ms on
 * the script clock) and whether it was a follow-up (for dry runs, which raise follow-ups again instead of replaying).
 */
export declare class Recording {
    #private;
    constructor(seed: number);
    push(event: ScriptEvent, at?: number, caused?: boolean): void;
    /** A new match: the finished one stays readable until the new one has events. */
    restart(seed: number): void;
    /** The current match's events, or the last match's while the current one has none. */
    snapshot(): FullRecording;
}
