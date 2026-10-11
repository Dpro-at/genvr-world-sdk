import { spotFor, type GameContext } from '../context.js';

/**
 * Respawn (`game.respawn`): a knocked-out player comes back after `delaySec` at the spawn spot
 * farthest from the opponents, and anyone placed at a spawn is protected for `protectSec`. A
 * player who left while down keeps their timer and comes back once they are here again. Without
 * the key the knocked-out stay down until the next match.
 */
export class RespawnComponent {
  readonly #ctx: GameContext;

  constructor(ctx: GameContext) {
    this.#ctx = ctx;
    const { bus } = ctx;
    bus.on('died', (event) => {
      const row = ctx.players.get(event.victim);
      if (row && ctx.game.respawn) row.respawnAt = ctx.now + ctx.game.respawn.delaySec * 1000;
    });
    bus.on('placed', (event) => this.#protect(event.id));
    bus.on('match_reset', () => {
      for (const row of ctx.players.values()) {
        row.respawnAt = null;
        row.protectedUntil = 0;
      }
    });
  }

  /** Brings back the knocked-out whose time has come, during play. */
  tick(): void {
    const ctx = this.#ctx;
    if (ctx.phase !== 'playing' || !ctx.game.respawn) return;
    for (const [id, row] of ctx.players) {
      if (row.respawnAt === null || ctx.now < row.respawnAt || !row.present) continue;
      row.respawnAt = null;
      this.#protect(id);
      ctx.bus.emit({ type: 'respawned', id, at: spotFor(ctx, id) });
    }
  }

  #protect(id: string): void {
    const row = this.#ctx.players.get(id);
    const seconds = this.#ctx.game.respawn?.protectSec ?? 0;
    if (row) row.protectedUntil = seconds > 0 ? this.#ctx.now + seconds * 1000 : 0;
  }
}
