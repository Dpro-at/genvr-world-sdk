import type { GameContext } from '../context.js';
import type { TeamName } from '../types.js';

/** Whose value a counter change is about. */
export type CounterWho = { player: string } | { team: TeamName } | 'global';

/**
 * Counters (`game.counters`): named numbers a game declares, each per player, per team or for the
 * whole game. Values start at the declared `start`, reset on `match_reset`, and every change
 * raises `counter_changed`. The component knows nothing about what a counter means; the rules
 * interpreter reads and changes them through `get`, `add` and `set`.
 */
export class CountersComponent {
  readonly #ctx: GameContext;
  #team: Record<TeamName, Record<string, number>> = { red: {}, blue: {} };
  #global: Record<string, number> = {};
  /** Messages already reported, so a rule that keeps misfiring logs once. */
  readonly #reported = new Set<string>();

  constructor(ctx: GameContext) {
    this.#ctx = ctx;
    const { bus } = ctx;
    this.#resetShared();
    bus.on('player_joined', (event) => {
      const row = ctx.players.get(event.id);
      if (!row || event.returning) return;
      row.counters = this.#playerStarts();
    });
    bus.on('match_reset', () => {
      this.#resetShared();
      for (const row of ctx.players.values()) row.counters = this.#playerStarts();
    });
  }

  get(name: string, who: CounterWho): number {
    return this.#slot(name, who)?.[name] ?? 0;
  }

  add(name: string, by: number, who: CounterWho): void {
    const slot = this.#slot(name, who);
    if (slot) this.#write(slot, name, slot[name]! + by, who);
  }

  set(name: string, to: number, who: CounterWho): void {
    const slot = this.#slot(name, who);
    if (slot) this.#write(slot, name, to, who);
  }

  /** Copies of the team and global values; changing them changes nothing here. */
  teamValues(): Record<TeamName, Record<string, number>> {
    return { red: { ...this.#team.red }, blue: { ...this.#team.blue } };
  }

  globalValues(): Record<string, number> {
    return { ...this.#global };
  }

  #declared(scope: 'player' | 'team' | 'global') {
    return (this.#ctx.game.counters ?? []).filter((c) => c.scope === scope);
  }

  #playerStarts(): Record<string, number> {
    return Object.fromEntries(this.#declared('player').map((c) => [c.name, c.start]));
  }

  #resetShared(): void {
    const teamStarts = Object.fromEntries(this.#declared('team').map((c) => [c.name, c.start]));
    this.#team = { red: { ...teamStarts }, blue: { ...teamStarts } };
    this.#global = Object.fromEntries(this.#declared('global').map((c) => [c.name, c.start]));
  }

  /** The record holding this counter's value for `who`, or null (reported once) when there is none. */
  #slot(name: string, who: CounterWho): Record<string, number> | null {
    const decl = (this.#ctx.game.counters ?? []).find((c) => c.name === name);
    if (!decl) return this.#report(`unknown counter "${name}"`);
    const kind = who === 'global' ? 'global' : 'player' in who ? 'player' : 'team';
    if (decl.scope !== kind) return this.#report(`counter "${name}" has scope ${decl.scope}, used as ${kind}`);
    if (who === 'global') return this.#global;
    if ('team' in who) return this.#team[who.team] ?? this.#report(`counter "${name}": unknown team`);
    return this.#ctx.players.get(who.player)?.counters ?? null;
  }

  #write(slot: Record<string, number>, name: string, value: number, who: CounterWho): void {
    if (slot[name] === value) return;
    slot[name] = value;
    const id = who !== 'global' && 'player' in who ? who.player : null;
    this.#ctx.bus.emit({ type: 'counter_changed', name, value, id });
  }

  #report(message: string): null {
    if (!this.#reported.has(message)) {
      this.#reported.add(message);
      this.#ctx.log(message);
    }
    return null;
  }
}
