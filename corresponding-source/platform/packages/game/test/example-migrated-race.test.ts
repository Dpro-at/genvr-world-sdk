import { legacyGateTags, StoredGame } from '@genvr/contracts';
import { describe, expect, it } from 'vitest';
import { GameSession, type GameEvent, type Position, type SpawnSpot, type ZoneSpec } from '../src/index.js';

/**
 * Example: a race stored before the generic rules, read through the `StoredGame` migration and played
 * on the old gates as zones (tagged by `legacyGateTags`, as the room does). It replays the 2-lap
 * course of the old race component's tests and must give the same laps, order and winner.
 */

/** What `gameTemplate('car_race')` stored, with 2 laps. */
const STORED = {
  template: 'car_race',
  match: { minPlayers: 2, durationSec: 600, countdownSec: 0, resultsSec: 15 },
  race: { laps: 2, checkpoints: 'ordered', finish: 'all_finish', graceSec: 30 },
};
type Race = { checkpoints?: string; finish?: string; laps?: number; graceSec?: number };
const stored = (race: Race = {}, durationSec = 600) => ({
  ...STORED,
  match: { ...STORED.match, durationSec },
  race: { ...STORED.race, ...race },
});

/** The old straight track along +z: checkpoints (order 1, 2) at z 10 and 20, the finish line at z 30. */
const OLD_GATES = [
  { instanceId: 'cp1', itemId: 'genvr.core.gameplay.checkpoint', params: { order: 1 }, z: 10 },
  { instanceId: 'cp2', itemId: 'genvr.core.gameplay.checkpoint', params: { order: 2 }, z: 20 },
  { instanceId: 'fin', itemId: 'genvr.core.gameplay.finish-line', params: {}, z: 30 },
];

/** The old gates as the room makes them: 12 m wide gate zones with the migrated tags. */
function zonesFor(gates: typeof OLD_GATES): ZoneSpec[] {
  const tags = legacyGateTags(gates);
  return gates.map((g) => ({
    id: g.instanceId, shape: 'gate', tag: tags.get(g.instanceId)!, x: 0, y: 0, z: g.z, yaw: 0, width: 12, depth: 0,
  }));
}

const START: SpawnSpot[] = [
  { x: 2, y: 0, z: 0, team: 'any' },
  { x: -2, y: 0, z: 0, team: 'any' },
];
const LAP = [5, 12, 18, 22, 28, 32];
const BACK = [20, 12, 5, 0];

function play(input: unknown, gates = OLD_GATES) {
  const game = StoredGame.parse(input);
  const at = new Map<string, Position>([
    ['a', { x: 0, y: 0, z: 0 }],
    ['b', { x: 0, y: 0, z: 0 }],
  ]);
  const seen: GameEvent[] = [];
  let now = 0;
  const session = new GameSession(game, START, 0, {
    positions: (id) => at.get(id) ?? null,
    zones: zonesFor(gates),
    log: () => {},
  });
  session.bus.on('match_won', (event) => seen.push(event));
  session.join('a', now);
  session.join('b', now);
  const step = (ms = 100) => {
    now += ms;
    session.tick(now);
  };
  step(); // the 0 s countdown ends: play starts
  // Placement moved nobody here (positions are ours): back to z = 0, then a first sample.
  at.set('a', { x: 0, y: 0, z: 0 });
  at.set('b', { x: 0, y: 0, z: 0 });
  step();
  const drive = (id: string, zs: number[], x = 0) => {
    for (const z of zs) {
      at.set(id, { x, y: 0, z });
      step();
    }
  };
  const row = (id: string) => session.view().players.get(id)!;
  return { session, seen, step, drive, row, now: () => now, game };
}

describe('example: a stored 2-lap race read as generic rules', () => {
  it('counts the checkpoints in order, completes a lap on the finish line, and ignores the wrong way', () => {
    const { drive, row } = play(stored());
    expect(row('a').counters).toEqual({ lap: 1, checkpoint: 0 });
    drive('a', [5, 12, 18, 22]);
    expect(row('a').counters).toEqual({ lap: 1, checkpoint: 2 });
    drive('a', [28, 32]);
    expect(row('a').counters).toEqual({ lap: 2, checkpoint: 0 });
    drive('a', BACK); // back along the track: nothing counts
    expect(row('a').counters).toEqual({ lap: 2, checkpoint: 0 });
    drive('a', LAP);
    // Finished: past the last lap (the old row kept lap 2 and set a finish time).
    expect(row('a').counters).toEqual({ lap: 3, checkpoint: 0 });
    drive('a', BACK);
    drive('a', LAP); // a finished racer's gates count no more
    expect(row('a').counters).toEqual({ lap: 3, checkpoint: 0 });
  });

  it('does not count the finish line before the checkpoints, or a checkpoint that was skipped', () => {
    const { drive, row } = play(stored());
    drive('a', [4, 8, 14], 20); // round the side of checkpoint 1
    drive('a', [18, 22, 28, 32], 0);
    expect(row('a').counters).toEqual({ lap: 1, checkpoint: 0 });
  });

  /** Checkpoint 2 first, then checkpoint 1, then the finish line (as the old test drove it). */
  const oddLap = (drive: (id: string, zs: number[], x?: number) => void) => {
    drive('a', [5, 14], 20);
    drive('a', [18, 22], 0);
    drive('a', [22, 5], 20);
    drive('a', [5, 12], 0);
    drive('a', [14, 25], 20);
    drive('a', [25, 32], 0);
  };

  it('takes the checkpoints in any order when the stored race allowed it', () => {
    const { drive, row } = play(stored({ checkpoints: 'any_order' }));
    oddLap(drive);
    expect(row('a').counters).toMatchObject({ lap: 2, checkpoint: 0, 'checkpoint 1 passed': 0, 'checkpoint 2 passed': 0 });
  });

  it('needs them in order when the stored race said so: the same run does not complete the lap', () => {
    const { drive, row } = play(stored({ checkpoints: 'ordered' }));
    oddLap(drive);
    expect(row('a').counters).toEqual({ lap: 1, checkpoint: 1 });
  });

  it('with no checkpoints, every forward pass of the finish line is a lap', () => {
    const { drive, row } = play(stored({ laps: 3 }), [OLD_GATES[2]!]);
    drive('a', [25, 32]);
    drive('a', [28, 32]);
    expect(row('a').counters).toEqual({ lap: 3, checkpoint: 0 });
  });

  it('first_wins: ends when the first racer finishes the 2 laps; the other is ranked by progress', () => {
    const { drive, row, session, seen } = play(stored({ finish: 'first_wins' }));
    drive('b', [5, 12]);
    drive('a', LAP);
    expect([row('a').place, row('b').place]).toEqual([1, 2]);
    drive('a', BACK);
    drive('a', LAP);
    expect(session.view().phase).toBe('results');
    expect(session.view().winner).toEqual({ kind: 'player', id: 'a' });
    expect(seen).toHaveLength(1);
    expect([row('a').place, row('b').place]).toEqual([1, 2]);
  });

  it('all_finish: waits the grace after the first finisher, then the first finisher wins', () => {
    const { drive, step, session } = play(stored({ finish: 'all_finish', graceSec: 30 }));
    drive('a', LAP);
    drive('a', BACK);
    drive('a', LAP);
    drive('b', LAP);
    expect(session.view().phase).toBe('playing');
    for (let i = 0; i < 290; i += 1) step(100); // 29 s
    expect(session.view().phase).toBe('playing');
    step(1500);
    expect(session.view().phase).toBe('results');
    expect(session.view().winner).toEqual({ kind: 'player', id: 'a' });
  });

  it('puts finishers first, in the order they finished', () => {
    const { drive, row } = play(stored({ finish: 'all_finish' }));
    drive('b', LAP);
    drive('b', BACK);
    drive('b', LAP);
    drive('a', LAP);
    drive('a', [5, 12, 18, 22]);
    expect([row('b').place, row('a').place]).toEqual([1, 2]);
  });

  it('timed: laps do not end a racer, the clock does, and the most laps wins', () => {
    const { drive, step, session, row, now } = play(stored({ finish: 'timed', laps: 1 }, 60));
    drive('a', LAP);
    drive('a', BACK);
    drive('a', LAP);
    drive('b', LAP);
    expect(row('a').counters.lap).toBe(3);
    expect(session.view().phase).toBe('playing');
    step(60_000 - now() + 100);
    step();
    expect(session.view().phase).toBe('results');
    expect(session.view().winner).toEqual({ kind: 'player', id: 'a' });
  });

  it('a race nobody progressed in has no winner when time is up', () => {
    const { step, session } = play(stored({ finish: 'all_finish' }, 30));
    step(30_000);
    step();
    expect(session.view().phase).toBe('results');
    expect(session.view().winner).toBeNull();
  });
});
