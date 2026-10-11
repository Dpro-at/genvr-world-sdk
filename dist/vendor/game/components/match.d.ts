import type { Game } from '../../contracts/index.js';
import { type GameContext } from '../context.js';
import type { Phase, Winner } from '../types.js';
/** One phase of a match, in the order a game runs them. */
export interface PhaseStep {
    phase: Phase;
    /** How long it lasts (ms); null: until enough players are here. */
    ms: number | null;
    /** Before play: losing players below the minimum goes back to the first step. */
    gathering: boolean;
    /** When its time runs out: go on to the next step, or tell the others time is up (play). */
    end: 'next' | 'time_up';
}
/**
 * The phases of a game, in order; after the last one a new match starts from the first. A later
 * game (a buy phase before play, a warm-up) adds its own steps here.
 */
export declare function phaseSteps(game: Game): PhaseStep[];
/**
 * The match (`game.match`): walks the phase list. Gathering phases follow the number of players,
 * the others follow the clock; play ends when a component names a winner (`match_won`), or one
 * tick after the clock ran out (or everyone left) when none did: with the clock's fallback winner
 * (the ranking's, when the game has one), or with no winner.
 */
export declare class MatchComponent {
    #private;
    constructor(ctx: GameContext, clockWinner?: () => Winner);
    /** Called once the session exists (and on every tick): moves on when the phase's time is up. */
    start(): void;
    tick(): void;
}
