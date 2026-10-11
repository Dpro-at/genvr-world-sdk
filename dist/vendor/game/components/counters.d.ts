import type { GameContext } from '../context.js';
import type { TeamName } from '../types.js';
/** Whose value a counter change is about. */
export type CounterWho = {
    player: string;
} | {
    team: TeamName;
} | 'global';
/**
 * Counters (`game.counters`): named numbers a game declares, each per player, per team or for the
 * whole game. Values start at the declared `start`, reset on `match_reset`, and every change
 * raises `counter_changed`. The component knows nothing about what a counter means; the rules
 * interpreter reads and changes them through `get`, `add` and `set`.
 */
export declare class CountersComponent {
    #private;
    constructor(ctx: GameContext);
    get(name: string, who: CounterWho): number;
    add(name: string, by: number, who: CounterWho): void;
    set(name: string, to: number, who: CounterWho): void;
    /** Copies of the team and global values; changing them changes nothing here. */
    teamValues(): Record<TeamName, Record<string, number>>;
    globalValues(): Record<string, number>;
}
