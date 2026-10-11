import type { Game } from '../contracts/index.js';
import type { EventBus } from './events.js';
import type { Phase, PlayerView, PositionsProvider, SpawnSpot, TeamName, ToolLookup, ZoneSpec } from './types.js';
/**
 * What the components of one session share: the rules, the bus, the scoreboard rows, and the
 * time of the call being handled. Each component changes only its own fields of a row and its
 * own values here (the match component owns `phase` and `endsAt`).
 */
export interface GameContext {
    readonly game: Game;
    readonly bus: EventBus;
    readonly players: Map<string, PlayerView>;
    readonly positions: PositionsProvider;
    readonly tools: ToolLookup;
    /** Ms before "last one standing" ends a match, so a dropped connection can come back (0: at once). */
    readonly leaveGraceMs: number;
    /** Where a component reports a problem with the game's data (never thrown). */
    readonly log: (message: string) => void;
    /** Server ms of the call being handled (join, tick, attack...). */
    now: number;
    phase: Phase;
    endsAt: number | null;
    /**
     * Whether this match already has its winner. Every component that ends play checks and sets it
     * when it raises `match_won`, so a match is decided once; the session clears it when play starts
     * and on `match_reset`.
     */
    decided: boolean;
    /** Testing alone (studio Test game): one player is enough and nobody wins by being left. */
    solo: boolean;
    spawns: SpawnSpot[];
    /** The place's zones (areas and gates); empty when it has none. */
    zones: ZoneSpec[];
    /** Who rides what: the item's instance id and its ride tag ('' for none), by player (riding component). */
    readonly riding: Map<string, {
        item: string;
        tag: string;
    }>;
}
/** A spot given to a player earlier in the same placement pass. */
export interface TakenSpot {
    id: string;
    x: number;
    z: number;
    team: TeamName | null;
}
/** Ids of the players who are here now. */
export declare function presentIds(ctx: GameContext): string[];
/** A fresh row: every component then fills its own part when the player joins. */
export declare function newRow(): PlayerView;
/**
 * Where a player should (re)appear: their team's spots first, farthest from the real positions of
 * the opponents who are here and up; `taken` holds spots already given to players in the same pass
 * (their bodies have not moved yet, so the spot counts instead of where they stand). The origin
 * when the place has no spot at all.
 */
export declare function spotFor(ctx: GameContext, id: string, taken?: ReadonlyArray<TakenSpot>): SpawnSpot;
