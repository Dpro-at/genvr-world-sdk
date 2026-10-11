import { type Game } from '../contracts/index.js';
/** An item a game's loadout can hold: a library item with a `tool`. */
export declare const isTool: (itemId: string) => boolean;
/**
 * The counters a game names (in rules, the ranking or displays) or its scripts name (`also`, literal names in the
 * place's enabled scripts) that it does not declare, in the order they first appear, and those a fix can declare (as
 * many as the counter limit leaves room for).
 */
export declare function undeclaredCounters(game: Game, also?: readonly string[]): {
    undeclared: string[];
    declaredByFix: string[];
};
/**
 * The game with every whole-game repair the Checks offer: loadout items that are not tools taken
 * out, undeclared counters (the game's own and those its scripts name, `scriptCounters`) declared
 * per player from 0. Every whole-game fix (`set_game`) carries this same game: fixes are made from
 * one report, so a fix built from the stored game alone would undo the others when the console's
 * Fix all applies them together. Each fix therefore makes all of them, and any order or subset of
 * them ends in the same game.
 */
export declare function repairGame(game: Game, scriptCounters?: readonly string[]): Game;
