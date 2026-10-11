import { type GameContext } from '../context.js';
import type { Winner } from '../types.js';
/**
 * The race (`game.race`): laps over numbered checkpoints and a finish line, judged from the
 * server's own positions; the live ranking; and the end of the race by the designer's finish rule.
 * The match component runs the phases; this one ends play with `match_won` like the win component
 * does in a fight. Without the key nothing races.
 */
export declare class RaceComponent {
    #private;
    constructor(ctx: GameContext);
    get winner(): Winner;
    /** Whether racers must stand still: the countdown of a race. */
    frozen(): boolean;
    /** Judges every racer's move since the last tick, ranks them, and ends the race when the rule says so. */
    tick(): void;
}
