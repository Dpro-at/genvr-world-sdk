import { presentIds, type GameContext } from '../context.js';
import type { TeamName, Winner } from '../types.js';

/** Total score per team (every row counts, also players who left: the team earned it). */
export function teamScores(ctx: GameContext): { red: number; blue: number } {
  const scores = { red: 0, blue: 0 };
  for (const player of ctx.players.values()) if (player.team) scores[player.team] += player.score;
  return scores;
}

/**
 * Win (`game.win`, by highest score): names the winner when the time is up, when a score reaches
 * `game.score.goal`, or when only one player (or team) is left here. "Left" counts presence: a
 * knocked-out player still stands. With `leaveGraceMs` the last one standing wins only if nobody
 * came back meanwhile (a dropped connection); a match with nobody left ends at once.
 */
export class WinComponent {
  readonly #ctx: GameContext;
  #winner: Winner = null;
  /** When to look again at who is left (a leave within the grace); null for no check pending. */
  #standingCheckAt: number | null = null;

  constructor(ctx: GameContext) {
    this.#ctx = ctx;
    const { bus } = ctx;
    bus.on('time_up', () => this.#decide(this.#leader()));
    bus.on('score_changed', () => {
      const goal = ctx.game.score?.goal;
      if (goal !== undefined && this.#reached(goal)) this.#decide(this.#leader());
    });
    bus.on('player_left', () => this.#checkStanding());
    bus.on('solo_changed', () => this.#checkStanding());
    bus.on('match_reset', () => {
      this.#winner = null;
      this.#standingCheckAt = null;
    });
  }

  get winner(): Winner {
    return this.#winner;
  }

  tick(): void {
    if (this.#standingCheckAt === null || this.#ctx.now < this.#standingCheckAt) return;
    this.#standingCheckAt = null;
    const winner = this.#lastStanding();
    if (winner !== undefined) this.#decide(winner);
  }

  #decide(winner: Winner): void {
    if (this.#ctx.phase !== 'playing' || this.#ctx.decided) return;
    this.#ctx.decided = true;
    this.#winner = winner;
    this.#standingCheckAt = null;
    this.#ctx.bus.emit({ type: 'match_won', winner });
  }

  #checkStanding(): void {
    const ctx = this.#ctx;
    if (ctx.phase !== 'playing') return;
    const winner = this.#lastStanding();
    if (winner === undefined) return;
    if (ctx.leaveGraceMs === 0 || presentIds(ctx).length === 0) this.#decide(winner);
    else this.#standingCheckAt ??= ctx.now + ctx.leaveGraceMs;
  }

  /** The winner when play must end because of who is left; undefined while the match goes on. */
  #lastStanding(): Winner | undefined {
    const ctx = this.#ctx;
    const present = presentIds(ctx);
    if (present.length === 0) return null;
    if (ctx.solo) return undefined;
    if (ctx.game.teams?.mode === 'two') {
      const teams = new Set(present.map((id) => ctx.players.get(id)!.team));
      return teams.size === 1 ? { kind: 'team', team: [...teams][0] as TeamName } : undefined;
    }
    return present.length === 1 ? { kind: 'player', id: present[0]! } : undefined;
  }

  #reached(goal: number): boolean {
    const scores = this.#ctx.game.teams?.mode === 'two'
      ? Object.values(teamScores(this.#ctx))
      : [...this.#ctx.players.values()].map((p) => p.score);
    return scores.some((score) => score >= goal);
  }

  /** Highest score wins, among the players who are here (or the teams); a tie has no winner. */
  #leader(): Winner {
    const ctx = this.#ctx;
    if (ctx.game.teams?.mode === 'two') {
      const { red, blue } = teamScores(ctx);
      return red === blue ? null : { kind: 'team', team: red > blue ? 'red' : 'blue' };
    }
    const ranked = [...ctx.players].filter(([, p]) => p.present).sort(([, a], [, b]) => b.score - a.score);
    if (ranked.length === 0 || (ranked[1] && ranked[1][1].score === ranked[0]![1].score)) return null;
    return { kind: 'player', id: ranked[0]![0] };
  }
}
