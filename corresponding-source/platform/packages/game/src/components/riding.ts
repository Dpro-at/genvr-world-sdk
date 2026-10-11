import type { GameContext } from '../context.js';

/**
 * Riding (movement modes): who rides which item, for the rules. The room decides who may get on
 * and off and tells the session; this component keeps the pairs (`ctx.riding`) and raises
 * `mounted` and `dismounted`. It knows items only as instance ids and free-text tags.
 */
export class RidingComponent {
  readonly #ctx: GameContext;

  constructor(ctx: GameContext) {
    this.#ctx = ctx;
    const { bus } = ctx;
    // A player who left rides nothing (the room gets them off; a returning player starts on foot).
    bus.on('player_left', (event) => ctx.riding.delete(event.id));
    // A new match starts with everyone on foot (the room gets every rider off).
    bus.on('match_reset', () => ctx.riding.clear());
  }

  /** Only a player who is here gets on; one riding something else gets off it first. */
  mount(id: string, item: string, tag: string, seat: number): void {
    if (!this.#ctx.players.get(id)?.present) return;
    const current = this.#ctx.riding.get(id);
    if (current?.item === item) return;
    if (current) this.dismount(id);
    this.#ctx.riding.set(id, { item, tag });
    this.#ctx.bus.emit({ type: 'mounted', id, item, tag, seat });
  }

  dismount(id: string): void {
    const current = this.#ctx.riding.get(id);
    if (!current) return;
    this.#ctx.riding.delete(id);
    this.#ctx.bus.emit({ type: 'dismounted', id, item: current.item, tag: current.tag });
  }
}
