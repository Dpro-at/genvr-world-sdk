import type { GameContext } from '../context.js';
/**
 * Score (`game.score`): points come `from` kills (the only source so far; rules add points with
 * `add_score`). A knock-out of a teammate or of oneself scores nothing. Without the key
 * nobody scores.
 */
export declare class ScoreComponent {
    constructor(ctx: GameContext);
}
