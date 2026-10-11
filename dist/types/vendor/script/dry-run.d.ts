import { type Game, type PlaceScript, type ScriptRecording, type ScriptTestEvent, type WorldDocument } from '../contracts/index.js';
import { type SpawnSpot, type ZoneSpec } from '../game/index.js';
import type { ScriptLogLine } from './log.js';
import { type ScriptRequest, type ScriptStatus } from './runner.js';
import { type ScriptModule } from './sandbox.js';
export interface DryRunInput {
    /** The place: its game, zones and spawn points are read as the room reads them, unless given below. */
    doc?: WorldDocument;
    game?: Game;
    zones?: ZoneSpec[];
    /** Where players start (the place's spawn points); one at the origin when left out. */
    spawns?: SpawnSpot[];
    /** The scripts of the place (with an unsaved draft in place of its saved text, when testing a draft). */
    scripts: PlaceScript[];
    /** Run only this script (by id); it runs even when switched off. All enabled scripts when left out. */
    only?: string;
    /** Players joined at the start when the events have no `player_joined` (1 to 8, default 2). */
    players?: number;
    /** Events to replay, at most `SCRIPT_LIMITS.testEvents`. */
    events?: ScriptTestEvent[];
    /** A room's recording (`/internal/script-recording`): its follow-ups are raised again, not replayed. */
    recording?: ScriptRecording;
    /** The match seed (a recording brings its own). */
    seed?: number;
    /** A module to use instead of a fresh one (tests); the dry run never disposes a module it was given. */
    module?: ScriptModule;
    /** Wall time the replay may take (default `SCRIPT_LIMITS.dryRunMs`); tests pass less. */
    wallMs?: number;
}
export interface DryRunResult {
    /** Every action a script asked for, in order, accepted or refused and why. */
    requested: ScriptRequest[];
    /** Events that could not be replayed, with why (by their index in the input). */
    skipped: Array<{
        index: number;
        type: string;
        why: string;
    }>;
    /** Counters after the run: players by handle, teams, and everyone's. */
    counters: {
        players: Record<string, Record<string, number>>;
        teams: Record<string, Record<string, number>>;
        global: Record<string, number>;
    };
    /** Handles of the players who took part, in join order. */
    players: string[];
    /** The match phase at the end, and the dry run's clock in ms since it started. */
    phase: string;
    now: number;
    log: ScriptLogLine[];
    /** Interrupt ticks the scripts used (deterministic for the same code and events). */
    ticks: number;
    status: ScriptStatus[];
    /** Set when the replay stopped on its wall-time cap before the last event (second review, critical 1). */
    stopped?: string;
}
/**
 * The dry-run harness (spec 12): the place's scripts in a fresh module on a real `GameSession` built from the place's
 * game, with synthetic players (handles `p1`, `p2`, ... in join order). Events become the session calls the room
 * makes: a join, a leave, a move through a zone judged by the zones component itself, a hit, getting on and off, and
 * ticks of 100 ms to their time. The same runner and session as the room, so the same events and seed request the
 * same actions. Nothing is saved.
 */
export declare function dryRun(input: DryRunInput): Promise<DryRunResult>;
