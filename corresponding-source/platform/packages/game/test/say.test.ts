import { Game } from '@genvr/contracts';
import { describe, expect, it } from 'vitest';
import { GameSession, type GameEvent } from '../src/index.js';

// Lip sync (P2-44, plan Task 4): the generic `say` action makes a player say a voice line (a sound item); the room
// tells everyone, and each device plays the line from the speaker with the mouth moving. The line id is an example.

const LINE = 'user.example.hello-line-a1b2c3';

describe('the say action', () => {
  it('a rule makes the actor say a line; everyone else is told who says which line', () => {
    const game = Game.parse({
      match: { minPlayers: 1, durationSec: 60, countdownSec: 0, resultsSec: 5 },
      win: { by: 'highest_score' },
      rules: [{ when: { event: 'greet' }, do: [{ kind: 'say', line: LINE }] }],
    });
    const said: GameEvent[] = [];
    const s = new GameSession(game, [{ x: 0, y: 0, z: 0, team: 'any' }], 0, {
      positions: () => ({ x: 0, y: 0, z: 0 }),
      log: () => {},
    });
    s.bus.on('said', (event) => said.push(event));
    s.join('a', 0);
    s.tick(100);
    s.bus.emit({ type: 'custom', name: 'greet', id: 'a' });
    s.bus.flush();
    expect(said).toEqual([{ type: 'said', id: 'a', line: LINE }]);
  });
});
