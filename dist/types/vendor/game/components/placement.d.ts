import { type GameContext } from '../context.js';
/**
 * Placement at the map's spawn spots: when play starts everyone here goes to a spawn (their team's
 * when teams are on), and so does a newcomer mid-match and a player moved to another team. The
 * room moves the bodies on `placed`; the respawn component protects them there.
 */
export declare class PlacementComponent {
    #private;
    constructor(ctx: GameContext);
}
