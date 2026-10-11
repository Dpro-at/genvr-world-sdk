import type { GameContext } from '../context.js';

/**
 * Health (`game.health`): damage while playing, knock-outs at 0, and full health on joining,
 * on respawn and for a new match. Without the key nobody can be hurt.
 */
export class HealthComponent {
  readonly #ctx: GameContext;

  constructor(ctx: GameContext) {
    this.#ctx = ctx;
    const { bus } = ctx;
    bus.on('player_joined', (event) => {
      if (!event.returning) this.#heal(event.id);
    });
    bus.on('respawned', (event) => this.#heal(event.id));
    bus.on('match_reset', () => {
      for (const [id, row] of ctx.players) {
        this.#heal(id);
        row.deaths = 0;
      }
    });
  }

  get #max(): number {
    return this.#ctx.game.health?.max ?? 0;
  }

  /**
   * Takes `amount` from a present, up, unprotected player during play. `by` is the attacker, or
   * null for harm without one (zones, falls later).
   */
  damage(victimId: string, amount: number, by: string | null): void {
    const ctx = this.#ctx;
    // A goal reached earlier in the same strike already ended the match.
    if (ctx.phase !== 'playing' || !ctx.game.health) return;
    const victim = ctx.players.get(victimId);
    if (!victim || !victim.present || !victim.alive || ctx.now < victim.protectedUntil || victimId === by) return;
    victim.health = Math.max(0, victim.health - amount);
    ctx.bus.emit({ type: 'hit', victim: victimId, by, damage: amount, health: victim.health });
    if (victim.health > 0) return;
    victim.alive = false;
    victim.deaths += 1;
    ctx.bus.emit({ type: 'died', victim: victimId, by });
  }

  /** Gives `amount` back to a present, up player during play, never above the maximum. */
  heal(id: string, amount: number): void {
    const ctx = this.#ctx;
    if (ctx.phase !== 'playing' || !ctx.game.health) return;
    const row = ctx.players.get(id);
    if (!row || !row.present || !row.alive) return;
    row.health = Math.min(this.#max, row.health + amount);
  }

  #heal(id: string): void {
    const row = this.#ctx.players.get(id);
    if (!row) return;
    row.alive = true;
    row.health = this.#max;
  }
}
