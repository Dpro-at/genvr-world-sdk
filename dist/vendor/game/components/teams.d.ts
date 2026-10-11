import type { GameContext } from '../context.js';
/**
 * Teams (`game.teams`): a newcomer joins the smaller team, the teams are evened out when play
 * starts, and teammates are spared unless friendly fire is on. Off (every team null) without the key.
 */
export declare class TeamsComponent {
    #private;
    constructor(ctx: GameContext);
    /** Puts a new player on the team with fewer present players (red on a tie). */
    assign(id: string): void;
    /** Whether `by` may hurt `victim`: never teammates, unless friendly fire is on. */
    canHurt(by: string, victim: string): boolean;
}
