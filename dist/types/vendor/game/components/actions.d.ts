import { type Action } from '../../contracts/index.js';
import { type GameContext } from '../context.js';
import type { GameEvent, TeamName } from '../types.js';
import type { CountersComponent } from './counters.js';
import type { HealthComponent } from './health.js';
import type { RankingComponent } from './ranking.js';
/**
 * The actor of an event: the player a rule's conditions and `who` are about.
 *
 * | event                                   | actor                                        |
 * | --------------------------------------- | -------------------------------------------- |
 * | zone_entered, zone_exited, zone_crossed | `id` (the player in or through the zone)     |
 * | player_joined, player_left, respawned   | `id`                                         |
 * | mounted, dismounted                     | `id` (the player getting on or off)          |
 * | hit, died                               | `by` (who dealt it); null when nobody did     |
 * | counter_changed                         | `id` (null for a team or global counter)     |
 * | timer_fired                             | `id` (the actor of the rule that started it) |
 * | custom (from `emit`)                    | `id` (the actor of the rule that emitted it) |
 * | phase_changed, time_up                  | none (null)                                  |
 *
 * With no actor, `actor` and `team_of_actor` reach nobody and actor-based conditions are false.
 * Harm nobody dealt (a place hurting a player, a rule's `damage`) has no actor: the victim is
 * never credited with it, nor named by `end_match { player: 'actor' }`.
 */
export declare function actorOf(event: GameEvent): string | null;
/** Whose counter value a read names: the actor's (as a rule's condition reads it), a player's, a team's or the global one. */
export type CounterTarget = {
    player: string;
} | {
    team: TeamName;
} | 'global' | 'actor';
/**
 * Runs the rules' actions, for the rules and for scripts alike (P2-10): one implementation, one set of budgets.
 *
 * - Scopes: a player counter is read and changed on players, a team counter on the actor's team (both teams for
 *   `everyone`), a global counter once whoever the action names.
 * - `who`: `actor`; `everyone` (the players here); `team_of_actor` (the actor's teammates here, the actor alone when
 *   teams are off).
 * - Budgets (`RULE_LIMITS`): actions run while an event is delivered, as follow-ups of it; events they raise are one
 *   hop deeper. An event deeper than `chain` runs nothing (`allowed`), and one top-level event runs at most
 *   `actionsPerEvent` actions (`run`), whoever asks. Past either limit the rest is dropped and one line is logged for
 *   that top-level event. An action naming an unknown counter does nothing and is logged once.
 * - Timers (`start_timer`) live here: `tick` raises `timer_fired`; a decided match and a new one drop them.
 * - Deterministic: time comes only from the session's clock (`ctx.now`).
 */
export declare class ActionRunner {
    #private;
    constructor(ctx: GameContext, parts: {
        counters: CountersComponent;
        health: HealthComponent;
        ranking: RankingComponent | null;
    });
    /** Whether `event` may still run rules or scripts: not deeper than `RULE_LIMITS.chain` follow-up hops. */
    allowed(event: GameEvent): boolean;
    /**
     * Runs one action for `actor` as a follow-up of the event being delivered. False when the top-level event's budget
     * is spent, or when no event is being delivered (an action always belongs to one).
     */
    run(action: Action, actor: string | null): boolean;
    /** A counter's value: the actor's own (their team's, or the global one), a player's, a team's; null when none. */
    read(name: string, target: CounterTarget, actor: string | null): number | null;
    /** Raises `timer_fired` for every timer whose time has come, earliest first. */
    tick(): void;
}
