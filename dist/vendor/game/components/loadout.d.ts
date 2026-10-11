import type { GameContext } from '../context.js';
import type { AttackResult, MeleeTool } from '../types.js';
/**
 * Loadout (`game.loadout`): each player gets the game's items when they join, when they come back
 * and for each new match, with the first one in hand. Items that are not tools are left out. It
 * also keeps each player's tool cooldown. A later game (a shooter's buy phase) changes a row's
 * items the same way.
 */
export declare class LoadoutComponent {
    #private;
    constructor(ctx: GameContext);
    /** The tool in a player's hand, or null (none, or not a tool). */
    toolOf(id: string): MeleeTool | null;
    /** Uses the tool in hand once: refused while it cools down. */
    use(id: string, tool: MeleeTool): AttackResult;
}
