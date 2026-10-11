import type { GameContext } from '../context.js';
import { type ActionRunner } from './actions.js';
export { actorOf } from './actions.js';
/**
 * Rules (`game.rules`): `when <event> if <conditions> do <actions>`, data only. For each event on
 * the bus the rules that match it run in the order they are listed; a rule runs its actions in
 * order when all its conditions hold for the event's actor (see `actorOf`). The interpreter knows
 * nothing about what a tag, a counter or a custom event means.
 *
 * - Matching: `when.event` is an engine event name or a custom name raised by `emit` (a custom
 *   event that reuses an engine name is never heard); `when.tag` keeps zone events of that tag;
 *   `when.counter` keeps `counter_changed` of that counter.
 * - Actions, scopes, `who`, timers and the budgets (`RULE_LIMITS.chain`, `actionsPerEvent`) are the
 *   `ActionRunner`'s, shared with scripts (P2-10): a rule's actions and a script's requests for the
 *   same top-level event spend one budget. Past a limit the rest of the event's rules are skipped.
 * - Deterministic: time comes only from the session's clock (`ctx.now`).
 */
export declare class RulesComponent {
    #private;
    constructor(ctx: GameContext, runner: ActionRunner);
}
