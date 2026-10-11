import { describe, expect, it } from 'vitest';
import { GameSession, type GameEvent } from '../src/index.js';
import { testGame } from './support.js';

const spawns = [{ x: 0, y: 0, z: 0, team: 'any' as const }];
const game = testGame(); // min 2, countdown 5 s, 300 s, results 10 s

function session() {
  const s = new GameSession(game, spawns, 0);
  const events: GameEvent[] = [];
  for (const type of ['phase_changed', 'match_won'] as const) s.bus.on(type, (e) => events.push(e));
  return { s, events };
}

describe('match phases', () => {
  it('waits until enough players, counts down, plays, shows results, and starts again', () => {
    const { s } = session();
    s.join('a', 0);
    s.tick(1000);
    expect(s.view().phase).toBe('waiting');
    s.join('b', 1000);
    expect(s.view()).toMatchObject({ phase: 'countdown', endsAt: 6000 });
    s.tick(6000);
    expect(s.view()).toMatchObject({ phase: 'playing', endsAt: 306_000 });
    s.tick(306_000);
    expect(s.view()).toMatchObject({ phase: 'results', endsAt: 316_000 });
    s.tick(316_000);
    expect(s.view().phase).toBe('countdown'); // both still here: straight into the next match
  });

  it('emits phase_changed for countdown, playing and results with their end times', () => {
    const s = new GameSession(game, spawns, 0);
    const changes: GameEvent[] = [];
    s.bus.on('phase_changed', (e) => changes.push(e));
    s.join('a', 0); s.join('b', 1000);
    s.tick(6000); s.tick(306_000);
    expect(changes).toEqual([
      { type: 'phase_changed', phase: 'countdown', endsAt: 6000 },
      { type: 'phase_changed', phase: 'playing', endsAt: 306_000 },
      { type: 'phase_changed', phase: 'results', endsAt: 316_000 },
    ]);
  });

  it('ends the match when one player is left, and they win', () => {
    const { s, events } = session();
    s.join('a', 0); s.join('b', 0); s.tick(5000);
    s.leave('b', 7000);
    expect(s.view().phase).toBe('results');
    expect(events).toContainEqual({ type: 'match_won', winner: { kind: 'player', id: 'a' } });
  });

  it('keeps a player who left in the scoreboard until the match ends', () => {
    const { s } = session();
    s.join('a', 0); s.join('b', 0); s.join('c', 0); s.tick(5000);
    s.leave('c', 6000);
    expect(s.view().players.get('c')?.present).toBe(false);
    s.tick(305_000); s.tick(315_000);
    expect(s.view().players.has('c')).toBe(false);
  });

  it('lets a builder test alone', () => {
    const { s } = session();
    s.join('builder', 0);
    s.setSolo(true, 0);
    expect(s.view().phase).toBe('countdown');
  });

  it('goes back to waiting when a countdown loses its players', () => {
    const { s } = session();
    s.join('a', 0); s.join('b', 0);
    s.leave('b', 1000);
    expect(s.view()).toMatchObject({ phase: 'waiting', endsAt: null });
  });
});
