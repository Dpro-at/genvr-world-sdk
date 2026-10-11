import type { Game } from '../contracts/index.js';
import { CountersComponent } from './components/counters.js';
import { EventBus } from './events.js';
import type { AttackResult, MeleeTool, PositionsProvider, ScriptHost, SessionView, SpawnSpot, ToolLookup, ZoneSpec } from './types.js';
export interface SessionOptions {
    /** Where each player is now (server-authoritative); used to spawn away from opponents. */
    positions?: PositionsProvider;
    /** The tool behind a loadout item; without it every item counts as a tool. */
    tools?: ToolLookup;
    /** Ms before "last one standing" ends a match after a leave (0, the default: at once). */
    leaveGraceMs?: number;
    /** The place's zones (areas and gates); none by default. */
    zones?: ZoneSpec[];
    /** Where problems with the game's data are reported (default: console.warn). */
    log?: (message: string) => void;
    /** Creator scripts (P2-10): they hear events after the rules and request the rules' actions. */
    scripts?: ScriptHost;
}
/**
 * One game: composes the rule components the game's keys turn on and wires them to one event bus.
 * Its methods are the only way in; each applies a change, then delivers the events it raised.
 * Time comes from the caller (`now`, server ms), positions from the injected provider.
 */
export declare class GameSession {
    #private;
    constructor(game: Game, spawns: SpawnSpot[], now: number, options?: SessionOptions);
    get bus(): EventBus;
    /** A player already here is left alone; one who left mid-match comes back to their row. */
    join(id: string, now: number): void;
    /** During play and the results a leaver keeps their row (score, winner, place) until the next match. */
    leave(id: string, now: number): void;
    setSolo(on: boolean, now: number): void;
    tick(now: number): void;
    /**
     * A strike of the tool in hand reaching `targets` (the caller finds them from the positions it
     * trusts). Each target is one change: a goal reached by the first ends the match before the next.
     */
    attack(id: string, tool: MeleeTool, targets: string[], now: number): AttackResult;
    /** Harm without a strike (zones, falls later); `by` is null when nobody caused it. */
    damage(victim: string, amount: number, by: string | null, now: number): void;
    /** The counters of this game (the rules interpreter reads and changes them). */
    get counters(): CountersComponent;
    /** The tool in a player's hand, or null (none, or the item is not a tool). */
    toolOf(id: string): MeleeTool | null;
    /** The place's spawn points changed (a builder moved one): later spawns use the new ones. */
    setSpawns(spawns: SpawnSpot[]): void;
    /** The place's zones changed (a builder moved one): they are judged as given from the next tick. */
    setZones(zones: ZoneSpec[]): void;
    /** Where a player would come back, away from the given opponent positions. */
    respawnSpot(id: string, opponents: Array<{
        x: number;
        z: number;
    }>): SpawnSpot | null;
    /** Whether a player is knocked out during play (a cheap check, without copying the view). */
    isDown(id: string): boolean;
    /**
     * A player got on a rideable item (the room checked it): `item` is its instance id, `tag` its ride
     * tag ('' for none), `seat` from 1. Only for a player who is here.
     */
    mount(id: string, item: string, tag: string, seat: number, now: number): void;
    /** A player got off what they ride (nothing when they ride nothing). */
    dismount(id: string, now: number): void;
    /** The room moved a player's body itself (a seat, an exit spot, a correction): no zone judges the jump. */
    relocated(id: string, now: number): void;
    /** What a player rides (instance id and ride tag), or null. */
    ridingOf(id: string): {
        item: string;
        tag: string;
    } | null;
    /** A copy of the state; changing it changes nothing here. */
    view(): SessionView;
}
