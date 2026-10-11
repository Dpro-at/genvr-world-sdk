import { newGame, WorldDocument, type ScriptTestEvent } from '@genvr/contracts';
import { SPAWN_POINT_ID, ZONE_GATE_ID } from '@genvr/core-library';

/**
 * The fixture a store script item is dry-run against when it is installed (spec 9.3), named as an example place: an
 * empty game (the generic match only: no counters, rules or ranking), a gate tagged "line", two spawn points, and two
 * players who each cross the gate once, with time passing afterwards so a timer a script starts can fire. The review
 * card shows what the script asked for here. A new object each call.
 */
export function reviewFixture(): { doc: WorldDocument; events: ScriptTestEvent[] } {
  const game = newGame();
  const doc = WorldDocument.parse({
    schemaVersion: 1,
    experienceId: 'exp-review-example',
    version: 0,
    style: { base: 'blocky' },
    sizeTier: 'small',
    access: { mode: 'private' },
    environment: { sky: { preset: 'day' }, weather: { preset: 'clear' } },
    terrain: {},
    spawn: { position: [0, 1, 0] },
    instances: [
      { instanceId: 'spawn-1', itemId: SPAWN_POINT_ID, transform: { position: [-2, 0, 0] } },
      { instanceId: 'spawn-2', itemId: SPAWN_POINT_ID, transform: { position: [2, 0, 0] } },
      {
        instanceId: 'gate-1',
        itemId: ZONE_GATE_ID,
        transform: { position: [0, 0, 10] },
        params: { zoneTag: 'line' },
      },
    ],
    game: { ...game, match: { ...game.match, countdownSec: 0 } },
  });
  const events: ScriptTestEvent[] = [
    { type: 'player_joined', id: 'p1', team: null, returning: false, at: 0 },
    { type: 'player_joined', id: 'p2', team: null, returning: false, at: 0 },
    { type: 'zone_crossed', id: 'p1', zone: 'gate-1', tag: 'line', at: 1000 },
    { type: 'zone_crossed', id: 'p2', zone: 'gate-1', tag: 'line', at: 2000 },
    { type: 'player_left', id: 'p2', at: 8000 },
  ];
  return { doc, events };
}
