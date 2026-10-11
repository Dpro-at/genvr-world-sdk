import type { GameContext } from '../context.js';

/**
 * Score (`game.score`): points come `from` kills (the only source so far; rules add points with
 * `add_score`). A knock-out of a teammate or of oneself scores nothing. Without the key
 * nobody scores.
 */
export class ScoreComponent {
  constructor(ctx: GameContext) {
    const { bus } = ctx;
    bus.on('died', (event) => {
      const score = ctx.game.score;
      if (!score || event.by === null || event.by === event.victim) return;
      const killer = ctx.players.get(event.by);
      const victim = ctx.players.get(event.victim);
      if (!killer || !victim) return;
      if (victim.team !== null && victim.team === killer.team) return; // a friendly-fire kill
      killer.kills += 1;
      if (score.from !== 'kills') return;
      killer.score += 1;
      bus.emit({ type: 'score_changed', id: event.by, score: killer.score });
    });
    bus.on('match_reset', () => {
      for (const row of ctx.players.values()) {
        row.score = 0;
        row.kills = 0;
      }
    });
  }
}
