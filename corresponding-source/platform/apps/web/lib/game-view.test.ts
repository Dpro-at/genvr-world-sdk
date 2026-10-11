import { describe, expect, it } from 'vitest';
import {
  addMessage,
  backIn,
  byPlace,
  canAttack,
  COMPACT_HUD,
  hudFit,
  hudLines,
  knockedOut,
  MESSAGES,
  rankingTitle,
  readGame,
  rememberNames,
  shownMessages,
  winnerText,
  type GameSnapshot,
  type GameStateView,
} from './game-view';
import { teamCounterKey, type GamePlayerRow as GamePlayerView } from '@genvr/contracts';

const row = (over: Partial<GamePlayerView> = {}): GamePlayerView => ({
  team: '',
  health: 100,
  max: 100,
  alive: true,
  score: 0,
  kills: 0,
  deaths: 0,
  present: true,
  tool: 'test.tool',
  respawnAt: 0,
  place: 0,
  counters: new Map(),
  ...over,
});

const state = (rows: Record<string, GamePlayerView>, over: Partial<GameStateView> = {}): GameStateView => ({
  on: true,
  phase: 'playing',
  endsAt: 90_000,
  winner: '',
  red: 0,
  blue: 0,
  players: { forEach: (callback) => Object.entries(rows).forEach(([id, player]) => callback(player, id)) },
  teamCounters: new Map(),
  globalCounters: new Map(),
  ...over,
});

describe('readGame', () => {
  it('maps every row with its roster name, marks our own, and names strangers Player', () => {
    const game = readGame(
      state(
        { a: row({ score: 2, kills: 2, team: 'red' }), b: row({ alive: false, present: false }) },
        { red: 2 },
      ),
      new Map([['a', 'Ana']]),
      'a',
    );
    expect(game).toMatchObject({ on: true, phase: 'playing', endsAt: 90_000, winner: '', red: 2, blue: 0 });
    expect(game.players).toEqual([
      { id: 'a', name: 'Ana', ...row({ score: 2, kills: 2, team: 'red' }), self: true },
      { id: 'b', name: 'Player', ...row({ alive: false, present: false }), self: false },
    ]);
  });
});

describe('rememberNames', () => {
  it('keeps the name of a player who left, so their kept row and the results still name them', () => {
    const known = new Map<string, string>();
    rememberNames(
      known,
      new Map([
        ['a', 'Ana'],
        ['b', 'Bo'],
      ]),
    );
    const names = rememberNames(known, new Map([['b', 'Bo 2']]));
    expect([...names]).toEqual([
      ['a', 'Ana'],
      ['b', 'Bo 2'],
    ]);
  });
});

describe('readGame counters', () => {
  it('copies the counters of each row, of the teams and global ones, never sharing the live maps', () => {
    const live = new Map([['coins', 3]]);
    const teams = new Map([[teamCounterKey('red', 'flags'), 1]]);
    const global = new Map([['round', 2]]);
    const game = readGame(
      state({ a: row({ counters: live }) }, { teamCounters: teams, globalCounters: global }),
      new Map(),
      'a',
    );
    expect(game.players[0]!.counters).toEqual(new Map([['coins', 3]]));
    expect(game.teamCounters).toEqual(new Map([['red:flags', 1]]));
    expect(game.globalCounters).toEqual(new Map([['round', 2]]));
    live.set('coins', 9);
    teams.set('red:flags', 5);
    global.set('round', 7);
    expect(game.players[0]!.counters.get('coins')).toBe(3);
    expect(game.teamCounters.get('red:flags')).toBe(1);
    expect(game.globalCounters.get('round')).toBe(2);
  });
});

describe('winnerText', () => {
  const game = (winner: string): GameSnapshot =>
    readGame(state({ a: row(), b: row() }, { phase: 'results', winner }), new Map([['b', 'Bo']]), 'a');
  it('names the winning player, the winning team, or a draw', () => {
    expect(winnerText(game('player:a'))).toBe('You win');
    expect(winnerText(game('player:b'))).toBe('Bo wins');
    expect(winnerText(game('player:gone'))).toBe('A player wins');
    expect(winnerText(game('team:red'))).toBe('Red team wins');
    expect(winnerText(game('team:blue'))).toBe('Blue team wins');
    expect(winnerText(game(''))).toBe('Draw');
  });
});

describe('knocked out and attacking', () => {
  const game = (me: Partial<GamePlayerView>, phase = 'playing') =>
    readGame(state({ a: row(me) }, { phase }), new Map(), 'a');
  it('counts a knock-out only during the match', () => {
    expect(knockedOut(game({ alive: false }))).toBe(true);
    expect(knockedOut(game({ alive: false }, 'results'))).toBe(false);
    expect(knockedOut(game({}))).toBe(false);
    expect(knockedOut(null)).toBe(false);
  });
  it('attacks with a tool in hand while not knocked out', () => {
    expect(canAttack(game({}))).toBe(true);
    expect(canAttack(game({ alive: false }))).toBe(false);
    expect(canAttack(game({ tool: '' }))).toBe(false);
    // Not in the game (a builder who does not test): no row, no attack.
    expect(canAttack(readGame(state({ b: row() }), new Map(), 'a'))).toBe(false);
  });
  it("counts down to the server's respawn time", () => {
    // Server time is 1 s ahead of this device.
    expect(backIn(game({ alive: false, respawnAt: 12_500 }), 1000, 9000)).toBe(3);
    expect(backIn(game({ alive: false, respawnAt: 12_500 }), 1000, 13_000)).toBe(0);
    expect(backIn(game({ alive: false, respawnAt: 0 }), 0, 9000)).toBeNull();
    expect(backIn(game({ respawnAt: 12_500 }), 0, 9000)).toBeNull();
  });
});

describe('ranked rows', () => {
  const snapshotWith = (rows: Record<string, GamePlayerView>) =>
    readGame(state(rows), new Map(Object.keys(rows).map((id) => [id, id.toUpperCase()])), 'a');

  it('lists players best place first and leaves out players the ranking does not rank', () => {
    const snapshot = snapshotWith({ a: row({ place: 2 }), b: row({ place: 1 }), c: row({ place: 0 }) });
    expect(byPlace(snapshot.players).map((r) => r.id)).toEqual(['b', 'a']);
  });
});

describe('hudLines', () => {
  const rules = {
    counters: [
      { name: 'coins', scope: 'player' as const, start: 0 },
      { name: 'flags', scope: 'team' as const, start: 0 },
      { name: 'round', scope: 'global' as const, start: 0 },
    ],
    hud: [
      { kind: 'counter' as const, label: 'Coins', counter: 'coins' },
      { kind: 'counter' as const, label: 'Flags', counter: 'flags' },
      { kind: 'counter' as const, label: 'Round', counter: 'round' },
      { kind: 'rank' as const, label: 'Place' },
      { kind: 'timer' as const, label: 'Time' },
    ],
  };
  const snapshot = (me: Partial<GamePlayerView>) =>
    readGame(
      state(
        { a: row(me), b: row({ place: 2 }) },
        {
          teamCounters: new Map([[teamCounterKey('red', 'flags'), 3]]),
          globalCounters: new Map([['round', 2]]),
        },
      ),
      new Map(),
      'a',
    );

  it("shows each binding with the designer's label: own, team and global counters, the place, the clock", () => {
    const lines = hudLines(snapshot({ team: 'red', place: 1, counters: new Map([['coins', 7]]) }), rules, 65);
    expect(lines.map((line) => [line.label, line.value])).toEqual([
      ['Coins', '7'],
      ['Flags', '3'],
      ['Round', '2'],
      ['Place', '1/2'],
      ['Time', '1:05'],
    ]);
    expect(new Set(lines.map((line) => line.key)).size).toBe(lines.length);
  });

  it('leaves out what has nothing to show: no team, no place, no clock, an undeclared counter', () => {
    const lines = hudLines(
      snapshot({ counters: new Map([['coins', 1]]) }),
      { ...rules, hud: [...rules.hud, { kind: 'counter', label: 'Nope', counter: 'missing' }] },
      null,
    );
    expect(lines.map((line) => line.label)).toEqual(['Coins', 'Round']);
  });

  it("shows the local player's speed in the binding's unit, and nothing without a speed (movement modes)", () => {
    const speedRules = {
      ...rules,
      hud: [
        { kind: 'speed' as const, label: 'Speed', unit: 'km/h' as const },
        { kind: 'speed' as const, label: '', unit: 'm/s' as const },
      ],
    };
    const lines = hudLines(snapshot({}), speedRules, null, 20);
    expect(lines.map((line) => [line.label, line.value])).toEqual([
      ['Speed', '72 km/h'],
      ['', '20 m/s'],
    ]);
    expect(hudLines(snapshot({}), speedRules, 10)).toEqual([]);
  });

  it('shows nothing without bindings or without an own row', () => {
    expect(hudLines(snapshot({}), { counters: rules.counters }, 10)).toEqual([]);
    expect(hudLines(snapshot({}), null, 10)).toEqual([]);
    expect(hudLines(readGame(state({ b: row() }), new Map(), 'a'), rules, 10)).toEqual([]);
  });
});

describe('rankingTitle', () => {
  const counters = [{ name: 'crates_delivered', scope: 'player' as const, start: 0 }];
  it("names the ranked counter by the designer's display label", () => {
    const hud = [
      { kind: 'timer' as const, label: 'Time' },
      { kind: 'counter' as const, label: 'Crates Delivered', counter: 'crates_delivered' },
    ];
    expect(rankingTitle({ counters, hud, ranking: { by: 'crates_delivered', order: 'high' } })).toBe(
      'Crates Delivered',
    );
  });
  it('falls back to the counter name without a labelled display, and to null without a ranking', () => {
    expect(rankingTitle({ counters, hud: [], ranking: { by: 'crates_delivered', order: 'high' } })).toBe(
      'crates_delivered',
    );
    expect(rankingTitle({ counters, hud: [] })).toBeNull();
    expect(rankingTitle(null)).toBeNull();
  });
});

describe('rule messages on screen', () => {
  it('keeps a message for its time and at most three at once', () => {
    let list = addMessage([], { key: 1, at: 0, text: 'one' });
    list = addMessage(list, { key: 2, at: 100, text: 'two' });
    list = addMessage(list, { key: 3, at: 200, text: 'three' });
    list = addMessage(list, { key: 4, at: 300, text: 'four' });
    expect(list.map((m) => m.text)).toEqual(['two', 'three', 'four']);
    expect(shownMessages(list, 100 + MESSAGES.ms).map((m) => m.text)).toEqual(['three', 'four']);
    expect(shownMessages(list, 300 + MESSAGES.ms)).toEqual([]);
    expect(shownMessages([{ key: 5, at: 0, text: '  ' }], 1)).toEqual([]);
    // A new message lets go of the ones already gone.
    expect(addMessage(list, { key: 6, at: 250 + MESSAGES.ms, text: 'six' }).map((m) => m.text)).toEqual([
      'four',
      'six',
    ]);
  });
});

describe('hudFit: how many displays a short (landscape phone) screen shows before "Show more"', () => {
  it('shows every display on a tall screen', () => {
    expect(hudFit(7, 900, true)).toBe(7);
    expect(hudFit(8, 768, false)).toBe(8);
  });

  it('shows every display on a short screen when they all fit above the thumb area', () => {
    expect(hudFit(3, 375, true)).toBe(3);
  });

  it('caps the displays on landscape phones, keeping room for the health line and the toggle', () => {
    const at812 = hudFit(7, 375, true);
    const at568 = hudFit(7, 320, true);
    expect(at812).toBeGreaterThanOrEqual(2);
    expect(at812).toBeLessThan(7);
    expect(at568).toBeGreaterThanOrEqual(1);
    expect(at568).toBeLessThanOrEqual(at812);
    // Shown rows, the health line and the 44 px toggle stay above the thumb area.
    for (const [height, shown] of [
      [375, at812],
      [320, at568],
    ] as const) {
      const bottom = COMPACT_HUD.top + (shown + 1) * COMPACT_HUD.row + COMPACT_HUD.toggle;
      expect(bottom).toBeLessThanOrEqual(height - COMPACT_HUD.thumb);
    }
  });

  it('always shows at least one display, however short the screen', () => {
    expect(hudFit(7, 200, true)).toBe(1);
    expect(hudFit(0, 200, true)).toBe(0);
  });
});
