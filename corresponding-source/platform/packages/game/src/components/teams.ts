import type { GameContext } from '../context.js';
import type { TeamName } from '../types.js';

/**
 * Teams (`game.teams`): a newcomer joins the smaller team, the teams are evened out when play
 * starts, and teammates are spared unless friendly fire is on. Off (every team null) without the key.
 */
export class TeamsComponent {
  readonly #ctx: GameContext;

  constructor(ctx: GameContext) {
    this.#ctx = ctx;
    ctx.bus.on('phase_changed', (event) => {
      if (event.phase === 'playing') this.#balance();
    });
  }

  get #on(): boolean {
    return this.#ctx.game.teams?.mode === 'two';
  }

  /** Puts a new player on the team with fewer present players (red on a tie). */
  assign(id: string): void {
    const row = this.#ctx.players.get(id);
    if (!row || !this.#on) return;
    const count = (team: TeamName) =>
      [...this.#ctx.players.values()].filter((p) => p.present && p.team === team).length;
    row.team = count('blue') < count('red') ? 'blue' : 'red';
  }

  /** Whether `by` may hurt `victim`: never teammates, unless friendly fire is on. */
  canHurt(by: string, victim: string): boolean {
    const teams = this.#ctx.game.teams;
    if (!this.#on || teams?.friendlyFire) return true;
    const a = this.#ctx.players.get(by)?.team ?? null;
    return a === null || a !== (this.#ctx.players.get(victim)?.team ?? null);
  }

  /** Moves the latest joiners from the bigger team to the smaller until they differ by at most one. */
  #balance(): void {
    if (!this.#on) return;
    const members = (team: TeamName) => [...this.#ctx.players].filter(([, p]) => p.present && p.team === team);
    for (;;) {
      const red = members('red');
      const blue = members('blue');
      if (Math.abs(red.length - blue.length) <= 1) return;
      const [from, to] = red.length > blue.length ? [red, 'blue' as const] : [blue, 'red' as const];
      const [id, row] = from[from.length - 1]!;
      row.team = to;
      this.#ctx.bus.emit({ type: 'team_changed', id, team: to });
    }
  }
}
