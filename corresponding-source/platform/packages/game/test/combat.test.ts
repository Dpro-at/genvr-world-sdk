import { describe, expect, it } from 'vitest';
import type { Game } from '@genvr/contracts';
import { GameSession, type GameEvent } from '../src/index.js';
import { TEST_TOOL, testGame } from './support.js';

const tool = TEST_TOOL;
const spawns = [{ x: 0, y: 0, z: 0, team: 'any' as const }, { x: 40, y: 0, z: 0, team: 'any' as const }];

function playing(game: Game = testGame(), ids = ['a', 'b']) {
  const s = new GameSession(game, spawns, 0);
  const events: GameEvent[] = [];
  for (const t of ['hit', 'died', 'respawned', 'score_changed', 'match_won'] as const) s.bus.on(t, (e) => events.push(e));
  for (const id of ids) s.join(id, 0);
  s.tick(game.match.countdownSec * 1000);
  // Everyone is placed at a spawn when play starts, protected for protectSec: strikes land after that.
  return { s, events, start: (game.match.countdownSec + (game.respawn?.protectSec ?? 0)) * 1000 };
}

function twoTeams(): Game {
  return { ...testGame(), teams: { mode: 'two', friendlyFire: false } };
}

describe('combat', () => {
  it('takes new spawn points mid-match without restarting it', () => {
    const { s, start } = playing();
    s.attack('a', tool, ['b'], start);
    s.setSpawns([{ x: 7, y: 1, z: 9, team: 'any' }]);
    expect(s.respawnSpot('b', [{ x: 0, z: 0 }])).toEqual({ x: 7, y: 1, z: 9, team: 'any' });
    expect(s.view().phase).toBe('playing');
    expect(s.view().players.get('b')?.health).toBe(75);
  });

  it('damages, kills after four hits, scores the killer, and respawns after the delay', () => {
    const { s, events, start } = playing();
    for (let i = 0; i < 4; i++) expect(s.attack('a', tool, ['b'], start + i * 1000)).toBe('ok');
    expect(s.view().players.get('b')).toMatchObject({ health: 0, alive: false, deaths: 1 });
    expect(s.view().players.get('a')).toMatchObject({ score: 1, kills: 1 });
    expect(events).toContainEqual({ type: 'died', victim: 'b', by: 'a' });
    s.tick(start + 3000 + 2999);
    expect(s.view().players.get('b')?.alive).toBe(false);
    s.tick(start + 3000 + 3000);
    expect(s.view().players.get('b')).toMatchObject({ alive: true, health: 100 });
    expect(events.some((e) => e.type === 'respawned' && e.id === 'b')).toBe(true);
  });

  it('refuses strikes faster than the cooldown, from the dead, and outside play', () => {
    const { s, start } = playing();
    expect(s.attack('a', tool, ['b'], start)).toBe('ok');
    expect(s.attack('a', tool, ['b'], start + 300)).toBe('cooldown');
    const waiting = new GameSession(testGame(), spawns, 0);
    waiting.join('a', 0);
    expect(waiting.attack('a', tool, [], 0)).toBe('not_playing');
  });

  it('protects a player who just respawned', () => {
    const { s, start } = playing();
    for (let i = 0; i < 4; i++) s.attack('a', tool, ['b'], start + i * 1000);
    const back = start + 3000 + 3000;
    s.tick(back);
    s.attack('a', tool, ['b'], back + 1000); // inside protectSec (2 s)
    expect(s.view().players.get('b')?.health).toBe(100);
    s.attack('a', tool, ['b'], back + 2500);
    expect(s.view().players.get('b')?.health).toBe(75);
  });

  it('splits two teams evenly, spares teammates, and scores teams', () => {
    const { s, start } = playing(twoTeams(), ['a', 'b', 'c', 'd']);
    const teams = [...s.view().players.values()].map((p) => p.team);
    expect(teams.filter((t) => t === 'red')).toHaveLength(2);
    const [a, mate] = ['a', [...s.view().players].find(([id, p]) => id !== 'a' && p.team === s.view().players.get('a')!.team)![0]];
    s.attack(a, tool, [mate], start);
    expect(s.view().players.get(mate)?.health).toBe(100);
    const foe = [...s.view().players].find(([, p]) => p.team !== s.view().players.get('a')!.team)![0];
    for (let i = 0; i < 4; i++) s.attack('a', tool, [foe], start + 1000 + i * 1000);
    expect(s.view().teamScores[s.view().players.get('a')!.team!]).toBe(1);
  });

  it('gives the win to the highest score at time up, and nobody on a tie', () => {
    const { s, events, start } = playing();
    for (let i = 0; i < 4; i++) s.attack('a', tool, ['b'], start + i * 1000);
    s.tick(start + 300_000);
    expect(events).toContainEqual({ type: 'match_won', winner: { kind: 'player', id: 'a' } });
    const tie = playing();
    tie.s.tick(tie.start + 300_000);
    expect(tie.events).toContainEqual({ type: 'match_won', winner: null });
  });

  it('ends the match early when a score goal is reached', () => {
    const base = testGame();
    const { s, start } = playing({ ...base, score: { from: 'kills', goal: 1 } });
    for (let i = 0; i < 4; i++) s.attack('a', tool, ['b'], start + i * 1000);
    expect(s.view().phase).toBe('results');
  });

  it('ignores a repeated join, and a returning player keeps team and score', () => {
    const { s, start } = playing(twoTeams(), ['a', 'b', 'c']);
    const joins: GameEvent[] = [];
    s.bus.on('player_joined', (e) => joins.push(e));
    const team = s.view().players.get('c')!.team;
    s.join('c', start + 50); // already present: no-op
    expect(joins).toHaveLength(0);
    expect(s.view().players.get('c')?.team).toBe(team);
    s.leave('c', start + 100);
    expect(s.view().players.get('c')?.present).toBe(false);
    s.join('c', start + 200);
    expect(joins).toHaveLength(1);
    expect(s.view().players.get('c')).toMatchObject({ present: true, team });
  });

  it('finishes with no winner when everyone leaves during play', () => {
    const { s, events, start } = playing();
    s.setSolo(true, start);
    s.leave('a', start + 100);
    expect(s.view().phase).toBe('playing'); // b is still here, solo exemption
    s.leave('b', start + 200);
    expect(s.view().phase).toBe('results');
    expect(events).toContainEqual({ type: 'match_won', winner: null });
  });

  it('gives the win to the last team standing', () => {
    const { s, events, start } = playing(twoTeams(), ['a', 'b', 'c', 'd']);
    const blue = [...s.view().players].filter(([, p]) => p.team === 'blue').map(([id]) => id);
    expect(blue).toHaveLength(2);
    s.leave(blue[0]!, start + 100);
    expect(s.view().phase).toBe('playing'); // both teams still have a player
    s.leave(blue[1]!, start + 200);
    expect(s.view().phase).toBe('results');
    expect(events).toContainEqual({ type: 'match_won', winner: { kind: 'team', team: 'red' } });
  });

  it('stops damaging once a multi-target strike reaches the goal', () => {
    const base = testGame();
    const { s, events, start } = playing({ ...base, score: { from: 'kills', goal: 1 } }, ['a', 'b', 'c']);
    for (let i = 0; i < 3; i++) s.attack('a', tool, ['b'], start + i * 1000);
    for (let i = 0; i < 3; i++) s.attack('a', tool, ['c'], start + 3000 + i * 1000);
    expect(s.view().players.get('b')?.health).toBe(25);
    expect(s.view().players.get('c')?.health).toBe(25);
    s.attack('a', tool, ['b', 'c'], start + 10_000);
    expect(events.filter((e) => e.type === 'match_won')).toHaveLength(1);
    expect(s.view().players.get('c')?.health).toBe(25);
    expect(s.view().phase).toBe('results');
  });

  it('respawns a player who left while dead once they are back', () => {
    const { s, start } = playing(testGame(), ['a', 'b', 'c']);
    for (let i = 0; i < 4; i++) s.attack('a', tool, ['b'], start + i * 1000);
    s.leave('b', start + 3100);
    s.tick(start + 3000 + 3500);
    s.join('b', start + 3000 + 4000);
    s.tick(start + 3000 + 4000);
    expect(s.view().players.get('b')).toMatchObject({ alive: true, health: 100 });
  });

  it('refuses strikes from a player who left, and from the dead', () => {
    const { s, start } = playing(testGame(), ['a', 'b', 'c']);
    for (let i = 0; i < 4; i++) s.attack('a', tool, ['b'], start + i * 1000);
    expect(s.attack('b', tool, ['a'], start + 3500)).toBe('dead');
    s.leave('c', start + 3600);
    expect(s.attack('c', tool, ['a'], start + 4000)).toBe('not_playing');
  });

  it('rebalances teams when the countdown ends', () => {
    const s = new GameSession(twoTeams(), spawns, 0);
    for (const id of ['a', 'b', 'c', 'd']) s.join(id, 0);
    s.leave('b', 100);
    s.leave('d', 100); // a and c are both red
    expect(s.view().players.get('c')?.team).toBe('red');
    s.tick(5000);
    expect(s.view().phase).toBe('playing');
    expect(s.view().players.get('a')?.team).toBe('red');
    expect(s.view().players.get('c')?.team).toBe('blue');
  });

  it('gives no score for a friendly-fire kill, but the victim dies', () => {
    const game: Game = { ...testGame(), teams: { mode: 'two', friendlyFire: true } };
    const { s, events, start } = playing(game, ['a', 'b', 'c', 'd']);
    const before = s.view().players;
    const mate = [...before].find(([id, p]) => id !== 'a' && p.team === before.get('a')!.team)![0];
    for (let i = 0; i < 4; i++) s.attack('a', tool, [mate], start + i * 1000);
    const view = s.view().players; // view() is a copy: read it again after the strikes
    expect(view.get(mate)).toMatchObject({ alive: false, deaths: 1 });
    expect(view.get('a')).toMatchObject({ score: 0, kills: 0 });
    expect(events.some((e) => e.type === 'score_changed')).toBe(false);
  });
});
