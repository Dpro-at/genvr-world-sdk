import { describe, expect, it } from 'vitest';
import type { Game } from '@genvr/contracts';
import { EventBus, GameSession, phaseSteps, type GameEvent, type Position } from '../src/index.js';
import { TEST_TOOL, TEST_TOOL_ID, testGame } from './support.js';

const tool = TEST_TOOL;
const base = testGame(); // countdown 5 s, protect 2 s, respawn 3 s
const twoTeams = (friendlyFire = false): Game => ({ ...base, teams: { mode: 'two', friendlyFire } });

/** A session whose events are recorded, with players standing where `where` says. */
function session(game: Game = base, where: Record<string, Position> = {}, options: { leaveGraceMs?: number } = {}) {
  const spawns = [
    { x: 0, y: 0, z: 0, team: 'any' as const },
    { x: 40, y: 0, z: 0, team: 'any' as const },
    { x: -40, y: 0, z: 0, team: 'red' as const },
    { x: 80, y: 0, z: 0, team: 'blue' as const },
  ];
  const s = new GameSession(game, spawns, 0, { positions: (id) => where[id] ?? null, ...options });
  const events: GameEvent[] = [];
  for (const type of ['placed', 'respawned', 'team_changed', 'struck', 'hit', 'match_won'] as const)
    s.bus.on(type, (event) => events.push(event));
  return { s, events };
}

/** Starts play with `ids`; returns the first time strikes land (after the start protection). */
function start(s: GameSession, ids: string[]): number {
  for (const id of ids) s.join(id, 0);
  s.tick(5000);
  return 7000;
}

const knockOut = (s: GameSession, by: string, victim: string, at: number) => {
  for (let i = 0; i < 4; i++) s.attack(by, tool, [victim], at + i * 1000);
  return at + 3000;
};

describe('event bus', () => {
  it('delivers an event only after the change that raised it, then the ones listeners raise', () => {
    const bus = new EventBus();
    const log: string[] = [];
    bus.on('time_up', () => {
      bus.emit({ type: 'match_reset' });
      log.push('time_up done');
    });
    bus.on('match_reset', () => log.push('match_reset'));
    bus.emit({ type: 'time_up' });
    expect(log).toEqual([]);
    bus.flush();
    expect(log).toEqual(['time_up done', 'match_reset']);
  });
});

describe('match phases as a list', () => {
  it('runs the game from an ordered phase list', () => {
    expect(phaseSteps(base).map((step) => [step.phase, step.ms])).toEqual([
      ['waiting', null], ['countdown', 5000], ['playing', 300_000], ['results', 10_000],
    ]);
  });
});

describe('placement and positions', () => {
  it('places everyone at a spawn when play starts, apart, and protects them there', () => {
    const { s, events } = session(base, { a: { x: 0, y: 0, z: 0 }, b: { x: 1, y: 0, z: 0 } });
    start(s, ['a', 'b']);
    const placed = events.filter((e) => e.type === 'placed');
    expect(placed.map((e) => e.id).sort()).toEqual(['a', 'b']);
    const spots = placed.map((e) => (e.type === 'placed' ? e.at.x : NaN));
    expect(new Set(spots).size).toBe(2);
    expect(s.view().players.get('a')?.protectedUntil).toBe(7000);
    // Protected: the first strike does nothing.
    s.attack('a', tool, ['b'], 6000);
    expect(s.view().players.get('b')?.health).toBe(100);
  });

  it('places a player who joins mid-match, but not one who comes back', () => {
    const { s, events } = session();
    const t = start(s, ['a', 'b']);
    s.join('c', t);
    expect(events.filter((e) => e.type === 'placed' && e.id === 'c')).toHaveLength(1);
    s.leave('c', t + 100);
    s.join('c', t + 200);
    expect(events.filter((e) => e.type === 'placed' && e.id === 'c')).toHaveLength(1);
  });

  it('brings a player back at the spot farthest from where the opponents really are', () => {
    const where: Record<string, Position> = { a: { x: 2, y: 0, z: 0 } };
    const { s, events } = session(base, where);
    const t = start(s, ['a', 'b']);
    const down = knockOut(s, 'a', 'b', t);
    s.tick(down + 3000);
    expect(events).toContainEqual({ type: 'respawned', id: 'b', at: { x: 40, y: 0, z: 0, team: 'any' } });
  });

  it('moves a player to the other team when teams are evened out, and places them at its spawn', () => {
    const { s, events } = session(twoTeams());
    for (const id of ['a', 'b', 'c', 'd']) s.join(id, 0);
    s.leave('b', 100);
    s.leave('d', 100); // a and c are both red
    s.tick(5000);
    expect(events).toContainEqual({ type: 'team_changed', id: 'c', team: 'blue' });
    const placedC = events.filter((e) => e.type === 'placed' && e.id === 'c');
    expect(placedC).toEqual([{ type: 'placed', id: 'c', at: { x: 80, y: 0, z: 0, team: 'blue' } }]);
    expect(events).toContainEqual({ type: 'placed', id: 'a', at: { x: -40, y: 0, z: 0, team: 'red' } });
  });
});

describe('reconnecting and leaving', () => {
  it('ranks only the players who are here when time is up', () => {
    const { s, events } = session();
    const t = start(s, ['a', 'b', 'c']);
    knockOut(s, 'a', 'b', t);
    s.leave('a', t + 4000); // a leads with 1 but is gone
    s.tick(305_000);
    expect(events).toContainEqual({ type: 'match_won', winner: null });
  });

  it('keeps a match going while a dropped player may come back, and ends it after the grace', () => {
    const { s } = session(base, {}, { leaveGraceMs: 10_000 });
    const t = start(s, ['a', 'b']);
    s.leave('b', t);
    s.tick(t + 5000);
    expect(s.view().phase).toBe('playing');
    s.join('b', t + 6000);
    s.tick(t + 20_000);
    expect(s.view().phase).toBe('playing');
    s.leave('b', t + 21_000);
    s.tick(t + 30_999);
    expect(s.view().phase).toBe('playing');
    s.tick(t + 31_000);
    expect(s.view()).toMatchObject({ phase: 'results', winner: { kind: 'player', id: 'a' } });
  });

  it('gives a returning player their row back: health, score and respawn timer', () => {
    const { s } = session(base, {}, { leaveGraceMs: 10_000 });
    const t = start(s, ['a', 'b', 'c']);
    s.attack('b', tool, ['a'], t);
    const down = knockOut(s, 'a', 'c', t + 1000);
    s.leave('a', down + 100);
    s.leave('c', down + 100);
    s.join('a', down + 200);
    s.join('c', down + 200);
    expect(s.view().players.get('a')).toMatchObject({ health: 75, score: 1, kills: 1 });
    expect(s.view().players.get('c')).toMatchObject({ alive: false, respawnAt: down + 3000 });
  });

  it('looks again at who is left when testing alone stops', () => {
    const { s, events } = session();
    s.join('a', 0);
    s.join('tester', 0);
    s.setSolo(true, 0);
    const t = start(s, []);
    s.leave('tester', t);
    expect(s.view().phase).toBe('playing'); // still solo
    s.setSolo(false, t);
    expect(events).toContainEqual({ type: 'match_won', winner: { kind: 'player', id: 'a' } });
  });
});

describe('loadout', () => {
  it('gives each player the loadout tools, leaves out items that are not tools, and shows the one in hand', () => {
    const game: Game = { ...base, loadout: { items: ['rock', TEST_TOOL_ID] } };
    const s = new GameSession(game, [], 0, {
      tools: (id) => (id === TEST_TOOL_ID ? tool : null),
    });
    s.join('a', 0);
    expect(s.view().players.get('a')).toMatchObject({ items: [TEST_TOOL_ID], tool: TEST_TOOL_ID });
    expect(s.toolOf('a')).toEqual(tool);
  });

  it('refuses a strike without a tool in hand', () => {
    const { loadout: _none, ...rest } = base;
    const { s } = session(rest as Game);
    const t = start(s, ['a', 'b']);
    expect(s.view().players.get('a')?.tool).toBe('');
    expect(s.attack('a', tool, ['b'], t)).toBe('no_tool');
  });
});

describe('health, respawn and strikes', () => {
  it('tells when a knocked-out player comes back', () => {
    const { s } = session();
    const t = start(s, ['a', 'b']);
    const down = knockOut(s, 'a', 'b', t);
    expect(s.view().players.get('b')?.respawnAt).toBe(down + 3000);
    expect([s.isDown('a'), s.isDown('b')]).toEqual([false, true]);
    s.tick(down + 3000);
    expect(s.view().players.get('b')?.respawnAt).toBeNull();
    expect(s.isDown('b')).toBe(false);
  });

  it('announces accepted strikes only', () => {
    const { s, events } = session();
    const t = start(s, ['a', 'b']);
    s.attack('a', tool, [], t);
    s.attack('a', tool, [], t + 100); // cooling down
    expect(events.filter((e) => e.type === 'struck')).toEqual([{ type: 'struck', id: 'a' }]);
  });

  it('hurts without an attacker (zones, falls)', () => {
    const { s, events } = session();
    const t = start(s, ['a', 'b']);
    s.damage('b', 30, null, t);
    expect(events).toContainEqual({ type: 'hit', victim: 'b', by: null, damage: 30, health: 70 });
  });

  it('hurts teammates when friendly fire is on', () => {
    const { s } = session(twoTeams(true));
    const t = start(s, ['a', 'b', 'c', 'd']);
    const rows = s.view().players;
    const mate = [...rows].find(([id, p]) => id !== 'a' && p.team === rows.get('a')!.team)![0];
    s.attack('a', tool, [mate], t);
    expect(s.view().players.get(mate)?.health).toBe(75);
  });
});

describe('teams and the winner', () => {
  it('ends the match when a team reaches the score goal', () => {
    const game: Game = { ...twoTeams(), score: { from: 'kills', goal: 2 } };
    const { s, events } = session(game);
    const t = start(s, ['a', 'b', 'c', 'd']);
    const rows = s.view().players;
    const team = rows.get('a')!.team!;
    const mate = [...rows].find(([id, p]) => id !== 'a' && p.team === team)![0];
    const foes = [...rows].filter(([, p]) => p.team !== team).map(([id]) => id);
    knockOut(s, 'a', foes[0]!, t);
    expect(s.view().phase).toBe('playing');
    knockOut(s, mate, foes[1]!, t);
    expect(s.view().phase).toBe('results');
    expect(events).toContainEqual({ type: 'match_won', winner: { kind: 'team', team } });
  });

  it('calls a draw when the teams are level at time up', () => {
    const { s, events } = session(twoTeams());
    start(s, ['a', 'b', 'c', 'd']);
    s.tick(305_000);
    expect(events).toContainEqual({ type: 'match_won', winner: null });
  });

  it('clears health, timers and scores for the next match', () => {
    const { s } = session();
    const t = start(s, ['a', 'b']);
    knockOut(s, 'a', 'b', t);
    s.tick(305_000); // results
    s.tick(315_000); // a new match counts down
    expect(s.view().phase).toBe('countdown');
    expect(s.view().players.get('b')).toMatchObject({ alive: true, health: 100, respawnAt: null, protectedUntil: 0, deaths: 0 });
    expect(s.view().players.get('a')).toMatchObject({ score: 0, kills: 0 });
    s.tick(320_000); // playing again, protected until 322 000
    expect(s.attack('a', tool, [], 322_000)).toBe('ok');
  });
});

describe('a player who leaves during the results', () => {
  it('keeps their row so the winner stays named, without restarting the match', () => {
    const { s } = session();
    const t = start(s, ['a', 'b']);
    knockOut(s, 'a', 'b', t);
    s.tick(305_000); // time up: a leads
    expect(s.view().phase).toBe('results');
    s.leave('a', 306_000);
    const view = s.view();
    expect(view.phase).toBe('results');
    expect(view.winner).toEqual({ kind: 'player', id: 'a' });
    expect(view.players.get('a')).toMatchObject({ present: false });
    s.tick(315_000); // results over: the next match
    expect(s.view().players.has('a')).toBe(false);
    expect(s.view().players.has('b')).toBe(true);
  });

  it('still drops a leaver in the waiting and countdown phases', () => {
    const { s } = session();
    s.join('a', 0);
    s.join('b', 0);
    s.leave('b', 100);
    expect(s.view().players.has('b')).toBe(false);
  });
});
