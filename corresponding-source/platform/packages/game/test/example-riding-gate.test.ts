// An example written by a designer, not a part of the engine: a gate that counts only for players
// who ride something through it (a course where riders score and walkers do not).
import { Game } from '@genvr/contracts';
import { describe, expect, it } from 'vitest';
import { GameSession, type Position, type ZoneSpec } from '../src/index.js';

const gate: ZoneSpec = { id: 'gate-1', shape: 'gate', tag: 'gate', x: 0, y: 0, z: 10, yaw: 0, width: 12, depth: 0 };

const game = Game.parse({
  match: { minPlayers: 3, durationSec: 120, countdownSec: 0, resultsSec: 5 },
  counters: [{ name: 'passes', scope: 'player' }],
  rules: [
    {
      when: { event: 'zone_crossed', tag: 'gate' },
      if: [{ kind: 'riding', is: true }],
      do: [{ kind: 'add_counter', name: 'passes', by: 1 }],
    },
    { when: { event: 'time_up' }, do: [{ kind: 'end_match', winner: { byCounter: 'passes', order: 'high' } }] },
  ],
  ranking: { by: 'passes', order: 'high' },
});

describe('example: a gate that counts only riders', () => {
  it('scores the two riders and not the walker', () => {
    const pos = new Map<string, Position>();
    let now = 0;
    const s = new GameSession(game, [{ x: 0, y: 0, z: 0, team: 'any' }], now, {
      positions: (id) => pos.get(id) ?? null,
      zones: [gate],
    });
    const tick = () => {
      now += 100;
      s.tick(now);
    };
    for (const id of ['rider-1', 'rider-2', 'walker']) {
      pos.set(id, { x: 0, y: 0, z: 0 });
      s.join(id, now);
    }
    tick();
    // Two players get on (one item with two seats); the room moves them onto it.
    s.mount('rider-1', 'item', 'blue', 1, now);
    s.mount('rider-2', 'item', 'blue', 2, now);
    s.relocated('rider-1', now);
    s.relocated('rider-2', now);
    tick();
    // Everyone goes through the gate: the riders on the item, the walker on foot.
    for (const z of [8, 12]) {
      for (const id of ['rider-1', 'rider-2', 'walker']) pos.set(id, { x: 0, y: 0, z });
      tick();
    }
    const counters = (id: string) => s.view().players.get(id)!.counters.passes;
    expect(counters('rider-1')).toBe(1);
    expect(counters('rider-2')).toBe(1);
    expect(counters('walker')).toBe(0);
  });
});
