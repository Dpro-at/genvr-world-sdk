import { presentIds, spotFor, type GameContext, type TakenSpot } from '../context.js';

/**
 * Placement at the map's spawn spots: when play starts everyone here goes to a spawn (their team's
 * when teams are on), and so does a newcomer mid-match and a player moved to another team. The
 * room moves the bodies on `placed`; the respawn component protects them there.
 */
export class PlacementComponent {
  readonly #ctx: GameContext;
  /** When each player was last placed, so one change of the session places them once. */
  readonly #placedAt = new Map<string, number>();

  constructor(ctx: GameContext) {
    this.#ctx = ctx;
    const { bus } = ctx;
    bus.on('phase_changed', (event) => {
      if (event.phase === 'playing') this.#place(presentIds(ctx));
    });
    bus.on('player_joined', (event) => {
      if (!event.returning && ctx.phase === 'playing') this.#place([event.id]);
    });
    bus.on('team_changed', (event) => {
      if (ctx.phase === 'playing' && this.#placedAt.get(event.id) !== ctx.now) this.#place([event.id]);
    });
    bus.on('player_left', (event) => this.#placedAt.delete(event.id));
  }

  /** Places players one after another, each away from the spots the opponents already got. */
  #place(ids: string[]): void {
    const ctx = this.#ctx;
    const taken: TakenSpot[] = [];
    for (const id of ids) {
      const row = ctx.players.get(id);
      if (!row?.present) continue;
      const at = spotFor(ctx, id, taken);
      taken.push({ id, x: at.x, z: at.z, team: row.team });
      this.#placedAt.set(id, ctx.now);
      ctx.bus.emit({ type: 'placed', id, at });
    }
  }
}
