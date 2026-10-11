import type { Game } from '@genvr/contracts';

/** The loadout item of `testGame`; tests inject its tool (`TEST_TOOL`) through `tools`, or take any. */
export const TEST_TOOL_ID = 'test.tool';

/** A melee tool: 25 damage (four hits knock out 100 health), 2.5 m reach, 90 degrees, 0.6 s cooldown. */
export const TEST_TOOL = { damage: 25, reach: 2.5, arcDeg: 90, cooldownSec: 0.6 };

/**
 * A neutral game for tests, built only from generic components: 2 players to start, a 5 s
 * countdown, 300 s of play, 10 s of results; no teams; 100 health; back after 3 s with 2 s of
 * protection; one tool; a point per knock-out; the highest score wins.
 */
export function testGame(): Game {
  return {
    match: { minPlayers: 2, durationSec: 300, countdownSec: 5, resultsSec: 10 },
    teams: { mode: 'none', friendlyFire: false },
    health: { max: 100 },
    respawn: { delaySec: 3, protectSec: 2 },
    loadout: { items: [TEST_TOOL_ID] },
    score: { from: 'kills' },
    win: { by: 'highest_score' },
  };
}
