import type { Game } from '@genvr/contracts';
import { describe, expect, it } from 'vitest';
import { GameSession, type GameEvent } from '../src/index.js';
import { testGame } from './support.js';

const game: Game = {
  ...testGame(),
  teams: { mode: 'two', friendlyFire: false },
  counters: [
    { name: 'mine', scope: 'player', start: 3 },
    { name: 'ours', scope: 'team', start: 10 },
    { name: 'all', scope: 'global', start: 100 },
  ],
};

function setup(log: string[] = []) {
  const s = new GameSession(game, [{ x: 0, y: 0, z: 0, team: 'any' }], 0, { log: (m) => log.push(m) });
  const changes: Array<Extract<GameEvent, { type: 'counter_changed' }>> = [];
  s.bus.on('counter_changed', (e) => changes.push(e));
  const reset = () => {
    s.bus.emit({ type: 'match_reset' });
    s.bus.flush();
  };
  return { s, changes, reset, log };
}

describe('counters', () => {
  it('starts each scope at its declared start value', () => {
    const { s } = setup();
    s.join('a', 0);
    s.join('b', 0); // a is red, b is blue
    expect(s.counters.get('mine', { player: 'a' })).toBe(3);
    expect(s.counters.get('ours', { team: 'red' })).toBe(10);
    expect(s.counters.get('all', 'global')).toBe(100);
    const view = s.view();
    expect(view.players.get('a')!.counters).toEqual({ mine: 3 });
    expect(view.teamCounters).toEqual({ red: { ours: 10 }, blue: { ours: 10 } });
    expect(view.globalCounters).toEqual({ all: 100 });
  });

  it('adds and sets, and raises counter_changed with the player id or null', () => {
    const { s, changes } = setup();
    s.join('a', 0);
    s.counters.add('mine', 2, { player: 'a' });
    s.counters.set('ours', 1, { team: 'blue' });
    s.counters.add('all', -5, 'global');
    s.bus.flush();
    expect(changes).toEqual([
      { type: 'counter_changed', name: 'mine', value: 5, id: 'a' },
      { type: 'counter_changed', name: 'ours', value: 1, id: null },
      { type: 'counter_changed', name: 'all', value: 95, id: null },
    ]);
    expect(s.counters.get('mine', { player: 'a' })).toBe(5);
  });

  it('shares a team counter between its members and not with the other team', () => {
    const { s } = setup();
    s.join('a', 0);
    s.join('b', 0);
    s.join('c', 0); // a red, b blue, c red
    s.counters.add('ours', 4, { team: 'red' });
    expect(s.counters.get('ours', { team: 'red' })).toBe(14);
    expect(s.counters.get('ours', { team: 'blue' })).toBe(10);
    expect(s.view().teamCounters).toEqual({ red: { ours: 14 }, blue: { ours: 10 } });
  });

  it('resets every scope to start on match_reset', () => {
    const { s, reset } = setup();
    s.join('a', 0);
    s.counters.add('mine', 9, { player: 'a' });
    s.counters.add('ours', 9, { team: 'red' });
    s.counters.add('all', 9, 'global');
    reset();
    expect(s.counters.get('mine', { player: 'a' })).toBe(3);
    expect(s.counters.get('ours', { team: 'red' })).toBe(10);
    expect(s.counters.get('all', 'global')).toBe(100);
  });

  it('lets a returning player keep their values while a new joiner starts at start', () => {
    const { s } = setup();
    s.join('a', 0);
    s.join('c', 0);
    s.tick(5000); // play begins, so a leaver keeps their row
    s.counters.add('mine', 7, { player: 'a' });
    s.leave('a', 5100);
    s.join('a', 5200);
    expect(s.counters.get('mine', { player: 'a' })).toBe(10);
    s.join('b', 5300);
    expect(s.counters.get('mine', { player: 'b' })).toBe(3);
  });

  it('ignores an unknown counter name and reports it once', () => {
    const { s, changes, log } = setup();
    s.join('a', 0);
    s.counters.add('nope', 1, { player: 'a' });
    s.counters.set('nope', 1, 'global');
    expect(s.counters.get('nope', 'global')).toBe(0);
    s.bus.flush();
    expect(changes).toEqual([]);
    expect(log).toHaveLength(1);
    expect(log[0]).toContain('nope');
  });

  it('ignores a counter used at the wrong scope and reports it once', () => {
    const { s, changes, log } = setup();
    s.join('a', 0);
    s.counters.add('mine', 1, 'global');
    s.counters.add('mine', 1, 'global');
    s.bus.flush();
    expect(changes).toEqual([]);
    expect(log).toHaveLength(1);
  });

  it('raises no event when a change leaves the value the same', () => {
    const { s, changes } = setup();
    s.join('a', 0);
    s.counters.set('mine', 3, { player: 'a' });
    s.counters.add('all', 0, 'global');
    s.bus.flush();
    expect(changes).toEqual([]);
  });

  it('gives view copies that do not alias the session', () => {
    const { s } = setup();
    s.join('a', 0);
    const view = s.view();
    view.players.get('a')!.counters.mine = 99;
    view.teamCounters.red.ours = 99;
    view.globalCounters.all = 99;
    expect(s.counters.get('mine', { player: 'a' })).toBe(3);
    expect(s.counters.get('ours', { team: 'red' })).toBe(10);
    expect(s.counters.get('all', 'global')).toBe(100);
    s.counters.add('mine', 1, { player: 'a' });
    expect(view.players.get('a')!.counters.mine).toBe(99);
    const again = s.view();
    expect(again.players.get('a')!.counters.mine).toBe(4);
  });
});
