import { RULE_LIMITS, type Action, type Counter, type Who } from '@genvr/contracts';
import { presentIds, type GameContext } from '../context.js';
import type { GameEvent, TeamName, Winner } from '../types.js';
import type { CounterWho, CountersComponent } from './counters.js';
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
export function actorOf(event: GameEvent): string | null {
  if (event.type === 'hit' || event.type === 'died') return event.by;
  return 'id' in event ? event.id : null;
}

interface Timer {
  name: string;
  id: string | null;
  at: number;
  seq: number;
}

/** Whose counter value a read names: the actor's (as a rule's condition reads it), a player's, a team's or the global one. */
export type CounterTarget = { player: string } | { team: TeamName } | 'global' | 'actor';

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
export class ActionRunner {
  readonly #ctx: GameContext;
  readonly #counters: CountersComponent;
  readonly #health: HealthComponent;
  readonly #ranking: RankingComponent | null;
  /** Actions already run per top-level event. */
  readonly #spent = new WeakMap<GameEvent, number>();
  /** Top-level events whose limit was already logged. */
  readonly #limited = new WeakSet<GameEvent>();
  /** Problems with the game's data already logged. */
  readonly #reported = new Set<string>();
  #timers: Timer[] = [];
  #timerSeq = 0;

  constructor(
    ctx: GameContext,
    parts: { counters: CountersComponent; health: HealthComponent; ranking: RankingComponent | null },
  ) {
    this.#ctx = ctx;
    this.#counters = parts.counters;
    this.#health = parts.health;
    this.#ranking = parts.ranking;
    // A decided match (by any component) and a new one both drop the running timers.
    ctx.bus.on('match_won', () => {
      this.#timers = [];
    });
    ctx.bus.on('match_reset', () => {
      this.#timers = [];
    });
  }

  /** Whether `event` may still run rules or scripts: not deeper than `RULE_LIMITS.chain` follow-up hops. */
  allowed(event: GameEvent): boolean {
    const { root, depth } = this.#ctx.bus.traceOf(event);
    if (depth <= RULE_LIMITS.chain) return true;
    this.#limit(root, `rules: stopped a chain of more than ${RULE_LIMITS.chain} events`);
    return false;
  }

  /**
   * Runs one action for `actor` as a follow-up of the event being delivered. False when the top-level event's budget
   * is spent, or when no event is being delivered (an action always belongs to one).
   */
  run(action: Action, actor: string | null): boolean {
    const { bus } = this.#ctx;
    const current = bus.current();
    if (!current) return false;
    const { root } = current;
    const spent = this.#spent.get(root) ?? 0;
    if (spent >= RULE_LIMITS.actionsPerEvent) {
      this.#limit(root, `rules: stopped after ${RULE_LIMITS.actionsPerEvent} actions for one event`);
      return false;
    }
    this.#spent.set(root, spent + 1);
    bus.followUp(() => this.#act(action, actor));
    return true;
  }

  /** A counter's value: the actor's own (their team's, or the global one), a player's, a team's; null when none. */
  read(name: string, target: CounterTarget, actor: string | null): number | null {
    const decl = this.#declared(name);
    if (!decl) return null;
    if (target === 'actor') {
      const [who] = this.#counterTargets(decl, 'actor', actor);
      return who === undefined ? null : this.#counters.get(name, who);
    }
    if (target === 'global') return decl.scope === 'global' ? this.#counters.get(name, 'global') : null;
    if ('team' in target) return decl.scope === 'team' ? this.#counters.get(name, { team: target.team }) : null;
    if (decl.scope !== 'player' || !this.#ctx.players.has(target.player)) return null;
    return this.#counters.get(name, { player: target.player });
  }

  /** Raises `timer_fired` for every timer whose time has come, earliest first. */
  tick(): void {
    const now = this.#ctx.now;
    const due = this.#timers.filter((t) => t.at <= now).sort((a, b) => a.at - b.at || a.seq - b.seq);
    if (due.length === 0) return;
    this.#timers = this.#timers.filter((t) => t.at > now);
    for (const t of due) this.#ctx.bus.emit({ type: 'timer_fired', name: t.name, id: t.id });
  }

  #act(action: Action, actor: string | null): void {
    const ctx = this.#ctx;
    switch (action.kind) {
      case 'add_counter':
      case 'set_counter': {
        const decl = this.#declared(action.name);
        if (!decl) return;
        for (const who of this.#counterTargets(decl, action.who, actor))
          if (action.kind === 'add_counter') this.#counters.add(action.name, action.by, who);
          else this.#counters.set(action.name, action.to, who);
        return;
      }
      case 'add_score':
        if (action.by === 0) return;
        for (const id of this.#players(action.who, actor)) {
          const row = ctx.players.get(id)!;
          row.score += action.by;
          ctx.bus.emit({ type: 'score_changed', id, score: row.score });
        }
        return;
      case 'end_match':
        // One decision per match (shared with the other components that end play).
        if (ctx.phase !== 'playing' || ctx.decided) return;
        ctx.decided = true;
        ctx.bus.emit({ type: 'match_won', winner: this.#pickWinner(action.winner, actor) });
        return;
      case 'start_timer': {
        const { name } = action;
        // One timer per name and actor: starting it again starts it over.
        this.#timers = this.#timers.filter((t) => !(t.name === name && t.id === actor));
        this.#timers.push({ name, id: actor, at: ctx.now + action.seconds * 1000, seq: this.#timerSeq++ });
        return;
      }
      case 'damage':
        // Harm from the place, not from a player: `by` is null, so its hit and knock-out have no actor.
        for (const id of this.#players(action.who, actor)) this.#health.damage(id, action.amount, null);
        return;
      case 'heal':
        for (const id of this.#players(action.who, actor)) this.#health.heal(id, action.amount);
        return;
      case 'teleport_to_zone': {
        const zone = ctx.zones.find((z) => z.tag === action.tag);
        if (!zone) {
          this.#report(`rules: no zone tagged "${action.tag}"`);
          return;
        }
        for (const id of this.#players(action.who, actor))
          if (ctx.players.get(id)!.present) {
            // A rider gets off first; the room then moves the body.
            if (ctx.riding.has(id)) ctx.bus.emit({ type: 'dismount_requested', id });
            ctx.bus.emit({ type: 'placed', id, at: { x: zone.x, y: zone.y, z: zone.z, team: 'any' } });
          }
        return;
      }
      case 'show_message':
        if (action.who === 'everyone') ctx.bus.emit({ type: 'message', id: null, text: action.text });
        else for (const id of this.#players(action.who, actor)) ctx.bus.emit({ type: 'message', id, text: action.text });
        return;
      case 'emit':
        ctx.bus.emit({ type: 'custom', name: action.event, id: actor });
        return;
      case 'say':
        if (!action.line) return;
        for (const id of this.#players(action.who, actor))
          if (ctx.players.get(id)!.present) ctx.bus.emit({ type: 'said', id, line: action.line });
        return;
      case 'dismount':
        // The room carries it out (and ignores a player who rides nothing).
        for (const id of this.#players(action.who, actor)) ctx.bus.emit({ type: 'dismount_requested', id });
        return;
      case 'set_speed': {
        const until = ctx.now + action.seconds * 1000;
        for (const id of this.#players(action.who, actor))
          ctx.bus.emit({ type: 'speed_requested', id, factor: action.factor, until });
        return;
      }
    }
  }

  /** The players an action reaches (ids with a row). */
  #players(who: Who, actor: string | null): string[] {
    const ctx = this.#ctx;
    if (who === 'everyone') return presentIds(ctx);
    if (actor === null || !ctx.players.has(actor)) return [];
    if (who === 'actor') return [actor];
    const team = ctx.players.get(actor)!.team;
    if (team === null) return [actor];
    return presentIds(ctx).filter((id) => ctx.players.get(id)!.team === team);
  }

  /** Whose value of a counter an action (or a condition, as `actor`) reaches, by the counter's scope. */
  #counterTargets(decl: Counter, who: Who, actor: string | null): CounterWho[] {
    if (decl.scope === 'global') return ['global'];
    if (decl.scope === 'player') return this.#players(who, actor).map((player) => ({ player }));
    if (who === 'everyone') return [{ team: 'red' }, { team: 'blue' }];
    const team = actor === null ? null : (this.#ctx.players.get(actor)?.team ?? null);
    return team === null ? [] : [{ team }];
  }

  #pickWinner(winner: Extract<Action, { kind: 'end_match' }>['winner'], actor: string | null): Winner {
    if (winner === 'nobody') return null;
    if ('player' in winner) return actor !== null && this.#ctx.players.has(actor) ? { kind: 'player', id: actor } : null;
    if ('team' in winner) return { kind: 'team', team: winner.team };
    const decl = this.#declared(winner.byCounter);
    if (!decl) return null;
    // The ranking's own counter and order: its tie-breaks (then, reached first, join order) decide,
    // and nobody wins when nobody moved (the same answer as the clock's fallback).
    if (decl.scope === 'player' && this.#ranking?.decides(decl.name, winner.order)) return this.#ranking.leader();
    const better = (a: number, b: number) => (winner.order === 'high' ? a > b : a < b);
    let entries: Array<[Winner, number]>;
    if (decl.scope === 'player')
      // Every row counts, also players who left mid-match: they earned their value.
      entries = [...this.#ctx.players].map(([id, row]) => [{ kind: 'player', id }, row.counters[decl.name] ?? decl.start]);
    else if (decl.scope === 'team')
      entries = (['red', 'blue'] as TeamName[]).map((team) => [{ kind: 'team', team }, this.#counters.get(decl.name, { team })]);
    else {
      this.#report(`rules: counter "${decl.name}" is global and cannot pick a winner`);
      return null;
    }
    if (entries.length === 0) return null;
    const best = entries.reduce((top, entry) => (better(entry[1], top[1]) ? entry : top));
    // A tie for the best value has no winner (see the ranking above for its own counter).
    return entries.filter((entry) => entry[1] === best[1]).length > 1 ? null : best[0];
  }

  #declared(name: string): Counter | null {
    const decl = (this.#ctx.game.counters ?? []).find((c) => c.name === name);
    if (!decl) this.#report(`rules: unknown counter "${name}"`);
    return decl ?? null;
  }

  #limit(root: GameEvent, message: string): void {
    if (this.#limited.has(root)) return;
    this.#limited.add(root);
    this.#ctx.log(message);
  }

  #report(message: string): void {
    if (this.#reported.has(message)) return;
    this.#reported.add(message);
    this.#ctx.log(message);
  }
}
