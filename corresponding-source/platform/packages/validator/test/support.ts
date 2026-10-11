import type { Game } from '@genvr/contracts';

/**
 * A neutral game for tests, built only from generic components: 2 players, 300 s of play, 100
 * health, back after 3 s, a point per knock-out, the highest score wins; no loadout.
 */
export function testGame(): Game {
  return {
    match: { minPlayers: 2, durationSec: 300, countdownSec: 5, resultsSec: 10 },
    teams: { mode: 'none', friendlyFire: false },
    health: { max: 100 },
    respawn: { delaySec: 3, protectSec: 2 },
    score: { from: 'kills' },
    win: { by: 'highest_score' },
  };
}
