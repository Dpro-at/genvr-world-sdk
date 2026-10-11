import { type GameContext } from '../context.js';
/**
 * Respawn (`game.respawn`): a knocked-out player comes back after `delaySec` at the spawn spot
 * farthest from the opponents, and anyone placed at a spawn is protected for `protectSec`. A
 * player who left while down keeps their timer and comes back once they are here again. Without
 * the key the knocked-out stay down until the next match.
 */
export declare class RespawnComponent {
    #private;
    constructor(ctx: GameContext);
    /** Brings back the knocked-out whose time has come, during play. */
    tick(): void;
}
