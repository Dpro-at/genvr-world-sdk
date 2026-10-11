import { describe, expect, it } from 'vitest';
import { GameSession, type Position, type ZoneSpec } from '../src/index.js';
import { testGame } from './support.js';
import { crossesZoneGate, insideZoneArea, segmentTouchesArea } from '../src/components/zones.js';

const gate: ZoneSpec = { id: 'g1', shape: 'gate', tag: 'line', x: 0, y: 0, z: 10, yaw: 0, width: 12, depth: 0 };
const area: ZoneSpec = { id: 'a1', shape: 'area', tag: 'room', x: 0, y: 0, z: 0, yaw: 0, width: 10, depth: 10 };
const at = (x: number, z: number, y = 0): Position => ({ x, y, z });

describe('gate geometry', () => {
  it('counts a forward pass through the gate', () => {
    expect(crossesZoneGate(at(0, 8), at(0, 12), gate)).toBe(true);
  });
  it('ignores a pass the wrong way and one that stops short', () => {
    expect(crossesZoneGate(at(0, 12), at(0, 8), gate)).toBe(false);
    expect(crossesZoneGate(at(0, 5), at(0, 9), gate)).toBe(false);
  });
  it('ignores a pass beside the gate, and counts one at the edge of its width', () => {
    expect(crossesZoneGate(at(7, 8), at(7, 12), gate)).toBe(false);
    expect(crossesZoneGate(at(5.9, 8), at(5.9, 12), gate)).toBe(true);
  });
  it('cannot be skipped by a fast pass: a long step across the gate counts', () => {
    expect(crossesZoneGate(at(0, -40), at(0, 60), gate)).toBe(true);
  });
  it('counts a step that lands exactly on the line once, not twice', () => {
    expect(crossesZoneGate(at(0, 8), at(0, 10), gate)).toBe(true);
    expect(crossesZoneGate(at(0, 10), at(0, 12), gate)).toBe(false);
  });
  it('ignores a pass far above or below the gate', () => {
    expect(crossesZoneGate(at(0, 8, 20), at(0, 12, 20), gate)).toBe(false);
  });
  it('follows the gate facing: a gate turned a quarter turn is crossed along x', () => {
    const turned: ZoneSpec = { ...gate, x: 10, z: 0, yaw: Math.PI / 2 };
    expect(crossesZoneGate(at(8, 0), at(12, 0), turned)).toBe(true);
    expect(crossesZoneGate(at(12, 0), at(8, 0), turned)).toBe(false);
    expect(crossesZoneGate(at(0, 8), at(0, 12), turned)).toBe(false);
  });
});

describe('area geometry', () => {
  it('contains points inside its box and not outside, with a height tolerance', () => {
    expect(insideZoneArea(at(4, 4), area)).toBe(true);
    expect(insideZoneArea(at(6, 0), area)).toBe(false);
    expect(insideZoneArea(at(0, 0, 7), area)).toBe(true);
    expect(insideZoneArea(at(0, 0, 9), area)).toBe(false);
  });
  it('follows the yaw of a narrow box', () => {
    const long: ZoneSpec = { ...area, width: 2, depth: 20, yaw: Math.PI / 2 };
    expect(insideZoneArea(at(8, 0), long)).toBe(true);
    expect(insideZoneArea(at(0, 8), long)).toBe(false);
  });
  it('sees a segment that crosses the box with both ends outside', () => {
    expect(segmentTouchesArea(at(-40, 0), at(40, 0), area)).toBe(true);
    expect(segmentTouchesArea(at(-40, 8), at(40, 8), area)).toBe(false);
    expect(segmentTouchesArea(at(-40, 0, 20), at(40, 0, 20), area)).toBe(false);
  });
});

type Seen = { type: string; [key: string]: unknown };

/** A match with two players, `a` and `b`, already in play at the origin. */
function play(zones: ZoneSpec[] = [gate, area]) {
  const game = testGame();
  const pos = new Map<string, Position>([
    ['a', at(0, 0)],
    ['b', at(0, 0)],
  ]);
  const seen: Seen[] = [];
  let now = 0;
  const session = new GameSession(game, [{ x: 0, y: 0, z: 0, team: 'any' }], 0, {
    positions: (id) => pos.get(id) ?? null,
    zones,
  });
  for (const type of ['zone_entered', 'zone_exited', 'zone_crossed'] as const)
    session.bus.on(type, (event) => seen.push(event));
  session.join('a', now);
  session.join('b', now);
  const step = (ms = 100) => {
    now += ms;
    session.tick(now);
  };
  now = game.match.countdownSec * 1000;
  session.tick(now);
  /** Moves `id` through the given z values (at x), one tick each. */
  const drive = (id: string, zs: number[], x = 0) => {
    for (const z of zs) {
      pos.set(id, at(x, z));
      step();
    }
  };
  return { session, pos, seen, step, drive, now: () => now, game };
}

const kinds = (seen: Seen[], id = 'a') => seen.filter((e) => e.id === id).map((e) => `${e.type}:${e.zone}`);

describe('zones in play', () => {
  it('raises zone_crossed with the instance id and tag for a forward pass of a gate', () => {
    const { drive, seen } = play([gate]);
    drive('a', [8, 12]);
    expect(seen).toEqual([{ type: 'zone_crossed', id: 'a', zone: 'g1', tag: 'line' }]);
  });

  it('ignores the wrong way through a gate', () => {
    const { drive, seen } = play([gate]);
    drive('a', [14, 12, 8]);
    expect(seen).toEqual([]);
  });

  it('raises zone_entered when a sample moves into an area and zone_exited when it leaves', () => {
    const { drive, seen } = play([{ ...area, z: 20 }]);
    drive('a', [10, 18]);
    expect(seen).toEqual([{ type: 'zone_entered', id: 'a', zone: 'a1', tag: 'room' }]);
    drive('a', [19]); // still inside: nothing new
    expect(seen).toHaveLength(1);
    drive('a', [40]);
    expect(seen.map((e) => e.type)).toEqual(['zone_entered', 'zone_exited']);
  });

  it('does not skip a thin area on a fast pass: entered then exited', () => {
    const thin: ZoneSpec = { ...area, z: 20, depth: 1 };
    const { drive, seen } = play([thin]);
    drive('a', [10, 30]);
    expect(seen.map((e) => e.type)).toEqual(['zone_entered', 'zone_exited']);
  });

  it('fires both zones that share a tag', () => {
    const one: ZoneSpec = { ...gate, id: 'one', tag: 'same' };
    const two: ZoneSpec = { ...gate, id: 'two', tag: 'same' };
    const { drive, seen } = play([one, two]);
    drive('a', [8, 12]);
    expect(seen.map((e) => e.zone)).toEqual(['one', 'two']);
    expect(seen.every((e) => e.tag === 'same')).toBe(true);
  });

  it('judges each player on their own moves', () => {
    const { drive, seen } = play([gate]);
    drive('a', [8, 12]);
    drive('b', [2]);
    expect(kinds(seen, 'b')).toEqual([]);
    expect(kinds(seen, 'a')).toEqual(['zone_crossed:g1']);
  });

  it('raises nothing for a player who is not present, nor across their absence', () => {
    const { session, pos, step, drive, seen, now } = play([gate]);
    drive('a', [5]);
    session.leave('a', now());
    drive('a', [12]); // moves while gone
    expect(seen).toEqual([]);
    pos.set('a', at(0, 12));
    session.join('a', now());
    step();
    drive('a', [13]);
    expect(seen).toEqual([]); // the return reset the sample: no event across the gap
  });

  it('does not judge a move across a placement', () => {
    const { session, pos, step, drive, seen } = play([gate]);
    drive('a', [1]);
    pos.set('a', at(0, 11));
    session.bus.emit({ type: 'placed', id: 'a', at: { x: 0, y: 0, z: 11, team: 'any' } });
    step();
    drive('a', [13]);
    expect(seen).toEqual([]);
  });

  it('does not judge a move across a respawn', () => {
    const { session, pos, step, drive, seen } = play([gate]);
    drive('a', [1]);
    pos.set('a', at(0, 11));
    session.bus.emit({ type: 'respawned', id: 'a', at: { x: 0, y: 0, z: 11, team: 'any' } });
    step();
    drive('a', [13]);
    expect(seen).toEqual([]);
  });

  it('does not enter an area across a placement either', () => {
    const { session, pos, step, drive, seen } = play([area]);
    drive('a', [30]);
    pos.set('a', at(0, 0));
    session.bus.emit({ type: 'placed', id: 'a', at: { x: 0, y: 0, z: 0, team: 'any' } });
    step();
    expect(seen).toEqual([]);
    drive('a', [40]);
    expect(seen.map((e) => e.type)).toEqual(['zone_exited']);
  });

  it('is inert outside play, and forgets samples when play starts', () => {
    const game = testGame();
    const pos = new Map<string, Position>([['a', at(0, 8)]]);
    const seen: Seen[] = [];
    const session = new GameSession(game, [{ x: 0, y: 0, z: 0, team: 'any' }], 0, {
      positions: (id) => pos.get(id) ?? null,
      zones: [gate],
    });
    session.bus.on('zone_crossed', (event) => seen.push(event));
    session.join('a', 0);
    session.join('b', 0);
    session.tick(100);
    pos.set('a', at(0, 12)); // a crossing while the countdown runs
    session.tick(200);
    expect(seen).toEqual([]);
    session.tick(game.match.countdownSec * 1000); // play starts
    session.tick(game.match.countdownSec * 1000 + 100); // first sample
    pos.set('a', at(0, 14));
    session.tick(game.match.countdownSec * 1000 + 200);
    expect(seen).toEqual([]); // 12 to 14 crosses nothing; the jump 8 to 12 was not judged
  });

  it('takes changes made by setZones from the next tick', () => {
    const { session, drive, seen, now } = play([]);
    drive('a', [8, 12]);
    expect(seen).toEqual([]);
    session.setZones([gate]);
    drive('a', [5, 12]);
    expect(seen.map((e) => e.type)).toEqual(['zone_crossed']);
    session.setZones([]);
    drive('a', [5, 12]);
    expect(seen).toHaveLength(1);
    expect(now()).toBeGreaterThan(0);
  });
});
