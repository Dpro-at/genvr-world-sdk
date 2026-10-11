import type { GameContext } from '../context.js';
import type { AttackResult, MeleeTool } from '../types.js';

/**
 * Loadout (`game.loadout`): each player gets the game's items when they join, when they come back
 * and for each new match, with the first one in hand. Items that are not tools are left out. It
 * also keeps each player's tool cooldown. A later game (a shooter's buy phase) changes a row's
 * items the same way.
 */
export class LoadoutComponent {
  readonly #ctx: GameContext;
  /** When each player last used their tool (server ms). */
  readonly #lastUse = new Map<string, number>();

  constructor(ctx: GameContext) {
    this.#ctx = ctx;
    const { bus } = ctx;
    bus.on('player_joined', (event) => {
      if (!event.returning) this.#equip(event.id);
    });
    bus.on('respawned', (event) => this.#equip(event.id));
    bus.on('match_reset', () => {
      this.#lastUse.clear();
      for (const id of ctx.players.keys()) this.#equip(id);
    });
  }

  /** The tool in a player's hand, or null (none, or not a tool). */
  toolOf(id: string): MeleeTool | null {
    const itemId = this.#ctx.players.get(id)?.tool;
    return itemId ? this.#ctx.tools(itemId) : null;
  }

  /** Uses the tool in hand once: refused while it cools down. */
  use(id: string, tool: MeleeTool): AttackResult {
    const now = this.#ctx.now;
    if (now - (this.#lastUse.get(id) ?? -Infinity) < tool.cooldownSec * 1000) return 'cooldown';
    this.#lastUse.set(id, now);
    return 'ok';
  }

  #equip(id: string): void {
    const row = this.#ctx.players.get(id);
    if (!row) return;
    row.items = (this.#ctx.game.loadout?.items ?? []).filter((item) => this.#ctx.tools(item) !== null);
    row.tool = row.items[0] ?? '';
  }
}
