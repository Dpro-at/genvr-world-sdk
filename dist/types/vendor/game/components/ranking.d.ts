import type { GameContext } from '../context.js';
import type { Winner } from '../types.js';
/**
 * Ranking (`game.ranking`): orders every player, present or not (a leaver keeps their row until
 * the match ends), by a player counter the designer names, and fills `PlayerView.place` (1 is
 * first). Order: `by` (highest first for `order: 'high'`, lowest for `'low'`), then `then` in the
 * same direction, then who reached their current values first (session clock), then join order.
 * The component knows nothing about what the counters mean.
 *
 * A `by` that is not a declared player counter is logged once and ranks nobody (place stays 0);
 * a bad `then` is logged once and ignored.
 */
export declare class RankingComponent {
    #private;
    constructor(ctx: GameContext);
    /** Player ids best first (present and absent); empty when the ranking counter is unusable. */
    rankedPlayers(): string[];
    /**
     * The winner by this ranking (the clock's fallback, and `end_match` by the ranking's own counter
     * and order): the first-ranked player if anyone moved (any player's `by` or `then` value differs
     * from its start: `then` orders players too); else nobody.
     */
    leader(): Winner;
    /** Whether `end_match` by this counter and order should use this ranking's tie-breaks. */
    decides(counter: string, order: 'high' | 'low'): boolean;
}
