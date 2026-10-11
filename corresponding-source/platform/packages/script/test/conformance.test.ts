import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { GameEventName, ScriptEvent, type Action } from '@genvr/contracts';
import type { GameEvent, SessionView } from '@genvr/game';
import { createScriptModule, type ScriptModule } from '../src/index.js';
import { place, script, untilReset } from './support.js';

let mod: ScriptModule;
beforeAll(async () => {
  mod = await createScriptModule();
});
const open: Array<{ dispose(): void }> = [];
afterEach(() => {
  for (const t of open.splice(0)) t.dispose();
});
function make(options: Parameters<typeof place>[0]) {
  const t = place(options);
  open.push(t);
  return t;
}

describe('every engine event reaches a script with its documented shape and actor handle', () => {
  it('delivers all 14 engine events and custom events, each a valid ScriptEvent', () => {
    const names = [...GameEventName.options, 'tap'];
    const t = make({
      module: mod,
      players: ['acct-a', 'acct-b'],
      scripts: [
        script(`const seen = {};
          for (const n of ${JSON.stringify(names)}) genvr.on(n, (e) => { seen[e.type] = (seen[e.type] || 0) + 1; });
          genvr.on('tap', () => genvr.act({ kind: 'start_timer', name: 'soon', seconds: 0.1 }));
          genvr.on('tap', () => genvr.act({ kind: 'add_counter', name: 'n', by: 1 }));
          genvr.on('report', () => genvr.log(Object.keys(seen).sort().join(',')));`),
      ],
    });
    t.cross('acct-a');
    t.pos.set('acct-a', { x: 50, y: 0, z: 50 });
    t.tick();
    t.pos.set('acct-a', { x: 0, y: 0, z: 0 });
    t.tick();
    t.raise('tap', 'acct-a');
    t.tick();
    t.session.damage('acct-b', 100, 'acct-a', t.now());
    for (let i = 0; i < 40; i++) t.tick();
    t.session.mount('acct-a', 'item-1', 'board', 1, t.now());
    t.session.dismount('acct-a', t.now());
    t.raise('report');
    // Until the results: time_up is in this match's recording (a new match starts a new one). Leaving earlier
    // would end the match as the last one standing, without time_up.
    for (let i = 0; i < 700 && t.session.view().phase !== 'results'; i++) t.tick();
    t.session.leave('acct-b', t.now());

    const events = t.runner.recording().events;
    for (const event of events)
      expect(ScriptEvent.safeParse(event).success, JSON.stringify(event)).toBe(true);
    const types = new Set(events.map((e) => e.type));
    for (const name of [...GameEventName.options, 'custom']) expect(types, name).toContain(name);
    expect(t.texts('log')[0]).toBe(
      'counter_changed,custom,died,dismounted,hit,mounted,phase_changed,player_joined,respawned,timer_fired,zone_crossed,zone_entered,zone_exited',
    );
    expect(JSON.stringify(events)).not.toContain('acct-');

    const one = <T extends ScriptEvent['type']>(type: T) =>
      events.find((e) => e.type === type) as Extract<ScriptEvent, { type: T }>;
    expect(one('zone_crossed')).toEqual({
      type: 'zone_crossed',
      actor: 'p1',
      id: 'p1',
      zone: 'z-gate',
      tag: 'line',
    });
    expect(one('zone_entered')).toEqual({
      type: 'zone_entered',
      actor: 'p1',
      id: 'p1',
      zone: 'z-pad',
      tag: 'pad',
    });
    expect(one('hit')).toEqual({ type: 'hit', actor: 'p1', victim: 'p2', by: 'p1', damage: 100, health: 0 });
    expect(one('died')).toEqual({ type: 'died', actor: 'p1', victim: 'p2', by: 'p1' });
    expect(one('respawned')).toEqual({ type: 'respawned', actor: 'p2', id: 'p2' });
    expect(one('counter_changed')).toEqual({
      type: 'counter_changed',
      actor: 'p1',
      name: 'n',
      value: 1,
      id: 'p1',
    });
    expect(one('timer_fired')).toEqual({ type: 'timer_fired', actor: 'p1', name: 'soon', id: 'p1' });
    expect(one('mounted')).toEqual({
      type: 'mounted',
      actor: 'p1',
      id: 'p1',
      item: 'item-1',
      tag: 'board',
      seat: 1,
    });
    expect(one('dismounted')).toEqual({
      type: 'dismounted',
      actor: 'p1',
      id: 'p1',
      item: 'item-1',
      tag: 'board',
    });
    expect(one('custom')).toEqual({ type: 'custom', actor: 'p1', name: 'tap', id: 'p1' });
    expect(one('player_left')).toEqual({ type: 'player_left', actor: 'p2', id: 'p2' });
    expect(one('time_up')).toEqual({ type: 'time_up', actor: null });
    expect(events.find((e) => e.type === 'player_joined' && e.id === 'p2')).toEqual({
      type: 'player_joined',
      actor: 'p2',
      id: 'p2',
      team: null,
      returning: false,
    });
    const playing = events.find((e) => e.type === 'phase_changed' && e.phase === 'playing');
    // The script clock: play began at 100 ms into the match and lasts 60 s.
    expect(playing).toEqual({ type: 'phase_changed', actor: null, phase: 'playing', endsAt: 60_100 });
  });

  it('the handler receives exactly the recorded event', () => {
    const t = make({
      module: mod,
      scripts: [script(`genvr.on('zone_crossed', (e) => genvr.log(JSON.stringify(e)));`)],
    });
    t.cross('b');
    expect(JSON.parse(t.texts('log')[0]!)).toEqual(t.runner.recording().events.at(-1));
  });
});

/** The view without the parts that are copies of the same thing; maps as entries for deep equality. */
function plain(view: SessionView) {
  return { ...view, players: [...view.players] };
}

const ACTIONS: Array<[string, Action]> = [
  ['add_counter', { kind: 'add_counter', name: 'n', by: 2, who: 'everyone' }],
  ['set_counter', { kind: 'set_counter', name: 'g', to: 9, who: 'actor' }],
  ['add_score', { kind: 'add_score', by: 3, who: 'actor' }],
  ['end_match', { kind: 'end_match', winner: { player: 'actor' } }],
  ['end_match by counter', { kind: 'end_match', winner: { byCounter: 'n', order: 'high' } }],
  ['start_timer', { kind: 'start_timer', name: 'later', seconds: 0.2 }],
  ['damage', { kind: 'damage', amount: 30, who: 'actor' }],
  ['heal', { kind: 'heal', amount: 5, who: 'everyone' }],
  ['teleport_to_zone', { kind: 'teleport_to_zone', tag: 'pad', who: 'everyone' }],
  ['show_message', { kind: 'show_message', text: 'hello', who: 'actor' }],
  ['emit', { kind: 'emit', event: 'next' }],
  ['dismount', { kind: 'dismount', who: 'actor' }],
  ['set_speed', { kind: 'set_speed', factor: 1.5, seconds: 2, who: 'everyone' }],
];

describe('every action through genvr.act has the same effect as in a rule', () => {
  it.each(ACTIONS)('%s', (_label, action) => {
    const listenNext = { when: { event: 'next' }, do: [{ kind: 'add_counter' as const, name: 'n', by: 1 }] };
    const timerRule = {
      when: { event: 'timer_fired' as const },
      do: [{ kind: 'add_counter' as const, name: 'g', by: 1 }],
    };
    const ruled = make({
      module: mod,
      game: { rules: [{ when: { event: 'go' }, do: [action] }, listenNext, timerRule] },
      scripts: [],
    });
    const scripted = make({
      module: mod,
      game: { rules: [listenNext, timerRule] },
      scripts: [
        script(
          `genvr.on('go', () => { if (!genvr.act(${JSON.stringify(action)})) throw new Error('refused'); });`,
        ),
      ],
    });
    const events = (t: ReturnType<typeof make>) => {
      const seen: GameEvent[] = [];
      for (const type of [
        'placed',
        'message',
        'speed_requested',
        'dismount_requested',
        'match_won',
        'timer_fired',
        'hit',
        'counter_changed',
        'score_changed',
      ] as const)
        t.session.bus.on(type, (event) => seen.push(event));
      return seen;
    };
    const a = events(ruled);
    const b = events(scripted);
    for (const t of [ruled, scripted]) {
      t.session.mount('b', 'item-9', 'board', 1, t.now());
      t.raise('go', 'b');
      for (let i = 0; i < 5; i++) t.tick();
    }
    expect(scripted.texts('error')).toEqual([]);
    expect(plain(scripted.session.view())).toEqual(plain(ruled.session.view()));
    expect(b).toEqual(a);
    expect(scripted.engineLog).toEqual(ruled.engineLog);
  });
});

describe('match reset keeps the event stream consistent', () => {
  it('phase_changed after a reset is on the new match clock', () => {
    const t = make({ module: mod, scripts: [script(`genvr.on('phase_changed', () => {});`)] });
    untilReset(t);
    t.tick();
    const last = t.runner
      .recording()
      .events.filter((e) => e.type === 'phase_changed')
      .at(-1)!;
    expect(last).toMatchObject({ phase: 'playing' });
    expect((last as { endsAt: number }).endsAt).toBeLessThanOrEqual(60_100);
  });
});
