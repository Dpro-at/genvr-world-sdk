import { type GameContext } from '../context.js';
import type { Winner } from '../types.js';
/** Total score per team (every row counts, also players who left: the team earned it). */
export declare function teamScores(ctx: GameContext): {
    red: number;
    blue: number;
};
/**
 * Win (`game.win`, by highest score): names the winner when the time is up, when a score reaches
 * `game.score.goal`, or when only one player (or team) is left here. "Left" counts presence: a
 * knocked-out player still stands. With `leaveGraceMs` the last one standing wins only if nobody
 * came back meanwhile (a dropped connection); a match with nobody left ends at once.
 */
export declare class WinComponent {
    #private;
    constructor(ctx: GameContext);
    get winner(): Winner;
    tick(): void;
}
