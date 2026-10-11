import { GameEventName, type Condition, type Rule } from '@genvr/contracts';
import type { GameContext } from '../context.js';
import type { GameEvent } from '../types.js';
import { actorOf, type ActionRunner } from './actions.js';

export { actorOf } from './actions.js';

/** The event names the engine raises; any other `when.event` is a custom name raised by `emit`. */
const ENGINE_EVENTS: ReadonlySet<string> = new Set(GameEventName.options);

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
export class RulesComponent {
  readonly #ctx: GameContext;
  readonly #runner: ActionRunner;
  readonly #rules: readonly Rule[];

  constructor(ctx: GameContext, runner: ActionRunner) {
    this.#ctx = ctx;
    this.#runner = runner;
    this.#rules = ctx.game.rules ?? [];
    const { bus } = ctx;
    const types = new Set(this.#rules.map((rule) => (ENGINE_EVENTS.has(rule.when.event) ? rule.when.event : 'custom')));
    for (const type of types) bus.on(type as GameEvent['type'], (event) => this.#hear(event));
  }

  #hear(event: GameEvent): void {
    const matching = this.#rules.filter((rule) => this.#matches(rule, event));
    if (matching.length === 0) return;
    if (!this.#runner.allowed(event)) return;
    const actor = actorOf(event);
    for (const rule of matching) {
      if (!rule.if.every((condition) => this.#holds(condition, actor))) continue;
      for (const action of rule.do) if (!this.#runner.run(action, actor)) return;
    }
  }

  #matches(rule: Rule, event: GameEvent): boolean {
    const { when } = rule;
    const name = event.type === 'custom' ? (ENGINE_EVENTS.has(event.name) ? null : event.name) : event.type;
    if (name !== when.event) return false;
    if (when.tag !== undefined && !('tag' in event && event.tag === when.tag)) return false;
    if (when.counter !== undefined && !(event.type === 'counter_changed' && event.name === when.counter)) return false;
    return true;
  }

  #holds(condition: Condition, actor: string | null): boolean {
    const ctx = this.#ctx;
    switch (condition.kind) {
      case 'phase':
        return ctx.phase === condition.is;
      case 'team':
        return actor !== null && ctx.players.get(actor)?.team === condition.is;
      case 'riding': {
        const riding = actor === null ? undefined : ctx.riding.get(actor);
        const rides = riding !== undefined && (condition.tag === undefined || riding.tag === condition.tag);
        return rides === condition.is;
      }
      case 'counter': {
        const left = this.#runner.read(condition.name, 'actor', actor);
        const right =
          typeof condition.value === 'number' ? condition.value : this.#runner.read(condition.value.counter, 'actor', actor);
        if (left === null || right === null) return false;
        switch (condition.op) {
          case '=': return left === right;
          case '!=': return left !== right;
          case '<': return left < right;
          case '<=': return left <= right;
          case '>': return left > right;
          case '>=': return left >= right;
        }
      }
    }
  }
}
