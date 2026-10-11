import type { GameContext } from '../context.js';
/**
 * Health (`game.health`): damage while playing, knock-outs at 0, and full health on joining,
 * on respawn and for a new match. Without the key nobody can be hurt.
 */
export declare class HealthComponent {
    #private;
    constructor(ctx: GameContext);
    /**
     * Takes `amount` from a present, up, unprotected player during play. `by` is the attacker, or
     * null for harm without one (zones, falls later).
     */
    damage(victimId: string, amount: number, by: string | null): void;
    /** Gives `amount` back to a present, up player during play, never above the maximum. */
    heal(id: string, amount: number): void;
}
