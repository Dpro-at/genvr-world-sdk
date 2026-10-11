import { Action, type PlaceScript } from '../contracts/index.js';
import type { GameEvent, ScriptHost, ScriptSessionApi } from '../game/index.js';
import { ScriptGuard } from './guard.js';
import { type ScriptLogLine } from './log.js';
import { type FullRecording } from './recording.js';
import type { ScriptModule } from './sandbox.js';
/** One action a script asked for, and what the engine answered (the dry-run harness lists them). */
export interface ScriptRequest {
    /** The script's id. */
    script: string;
    /** The parsed action, or the raw value when it did not parse. */
    action: Action | unknown;
    /** The actor as a handle (null for none). */
    actor: string | null;
    accepted: boolean;
    why?: string;
}
export interface ScriptStatus {
    id: string;
    name: string;
    state: 'running' | 'off' | 'not_compiled';
    strikes: number;
    errors: number;
    /** Handler time in the last second of the budget clock. */
    msLastSecond: number;
    /** Interrupt ticks used this match (deterministic for the same code and events). */
    ticks: number;
}
export interface RunnerOptions {
    /** The place id (or any stable text): the match seeds come from it. */
    placeSeed: string;
    /** The room's WASM module (spec 5.1); the runner never disposes it. */
    module: ScriptModule;
    /** Every log line as it is written (the room sends them to builders). */
    onLog?: (line: ScriptLogLine) => void;
    /** Every action a script asked for, accepted or not. */
    onRequest?: (request: ScriptRequest) => void;
    /** At every match start and every switch-off. */
    onStatus?: (status: ScriptStatus[]) => void;
    /**
     * A problem the server log should know (a watchdog switch-off, a host-side failure). Never carries script source,
     * names or log text; the room adds the place id.
     */
    onIncident?: (message: string) => void;
    /** Wall clock in ms for the time budgets and the watchdog (default `performance.now`). */
    clock?: () => number;
    /** The first match's seed (the harness passes its own); later matches derive theirs from it. */
    seed?: number;
    /**
     * The place's script time and kills across games (a room keeps one for its life; second review, critical 1 and 2).
     * A runner without one makes its own.
     */
    guard?: ScriptGuard;
}
/**
 * Runs the scripts of one session (spec 5): one sandbox per enabled script per match, handles instead of accounts,
 * the budgets of `SCRIPT_LIMITS`, the log and the recording. Implements the session's `ScriptHost`: every action goes
 * through `ScriptSessionApi.act`, the rules' `ActionRunner`. Never throws into the session.
 */
export declare class ScriptRunner implements ScriptHost {
    #private;
    readonly events: ReadonlyArray<GameEvent['type']>;
    constructor(scripts: readonly PlaceScript[], options: RunnerOptions);
    attach(api: ScriptSessionApi): void;
    hear(event: GameEvent, api: ScriptSessionApi): void;
    /** Host-only capability: the room must obtain the receipt over its authenticated API. */
    verifyProduct(value: unknown, playerId: string, now: number): boolean;
    matchReset(): void;
    log(): readonly ScriptLogLine[];
    recording(): FullRecording;
    canReplay(): boolean;
    status(): ScriptStatus[];
    /** Switches every script off until the next match (the watchdog, or the room shutting scripts down). */
    switchOff(reason: string): void;
    dispose(): void;
}
