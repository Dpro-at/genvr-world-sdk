import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { RULE_LIMITS, SCRIPT_LIMITS } from '@genvr/contracts';
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

describe('hearing events and requesting actions', () => {
  it('an example script adds a counter on each gate crossing', () => {
    const t = make({
      module: mod,
      scripts: [
        script(
          `genvr.on('zone_crossed', (e) => { if (e.tag === 'line') genvr.act({ kind: 'add_counter', name: 'n', by: 1 }); });`,
        ),
      ],
    });
    t.cross('a');
    t.cross('a');
    t.cross('b');
    expect(t.counter('n', 'a')).toBe(2);
    expect(t.counter('n', 'b')).toBe(1);
    expect(t.requests.map((r) => [r.actor, r.accepted])).toEqual([
      ['p1', true],
      ['p1', true],
      ['p2', true],
    ]);
  });

  it('opts.actor with a valid handle acts for that player; an unknown handle is refused', () => {
    const t = make({
      module: mod,
      scripts: [
        script(`genvr.on('tap', () => {
          genvr.log(String(genvr.act({ kind: 'add_counter', name: 'n', by: 3 }, { actor: 'p2' })));
          genvr.log(String(genvr.act({ kind: 'add_counter', name: 'n', by: 3 }, { actor: 'p7' })));
        });`),
      ],
    });
    t.raise('tap', 'a');
    expect(t.counter('n', 'b')).toBe(3);
    expect(t.counter('n', 'a')).toBe(0);
    expect(t.texts('log')).toEqual(['true', 'false']);
    expect(t.texts('refused')).toEqual(['unknown actor "p7"']);
  });

  it('refuses invalid actions, unknown counters and zone tags with one log line per reason', () => {
    const t = make({
      module: mod,
      scripts: [
        script(`genvr.on('tap', () => {
          const r = [
            genvr.act({ kind: 'fly' }),
            genvr.act({ kind: 'add_counter', name: 'nope', by: 1 }),
            genvr.act({ kind: 'add_counter', name: 'nope', by: 1 }),
            genvr.act({ kind: 'teleport_to_zone', tag: 'nowhere' }),
            genvr.act({ kind: 'show_message', text: 'x'.repeat(81) }),
            genvr.emit('ping'),
          ];
          genvr.log(r.join(','));
        });`),
      ],
    });
    t.raise('tap');
    expect(t.texts('log')).toEqual(['false,false,false,false,false,true']);
    expect(t.texts('refused')).toEqual([
      'not a valid action (kind)',
      'unknown counter "nope"',
      'no zone tagged "nowhere"',
      'not a valid action (text)',
    ]);
  });

  it('refuses actions from the top level', () => {
    const t = make({
      module: mod,
      scripts: [
        script(`genvr.log(String(genvr.act({ kind: 'add_score', by: 1 })), String(genvr.emit('x')));`),
      ],
      noStart: true,
    });
    expect(t.texts('log')).toEqual(['false false']);
    expect(t.texts('refused')).toEqual(['actions can only be requested from a handler, not the top level']);
  });

  it('hears custom events from rules and its own emits, but never a custom event named like an engine event', () => {
    const t = make({
      module: mod,
      game: { rules: [{ when: { event: 'ping' }, do: [{ kind: 'emit', event: 'pong' }] }] },
      scripts: [
        script(`genvr.on('pong', (e) => genvr.log('pong', e.actor));
                genvr.on('died', () => genvr.log('died'));
                genvr.on('tap', () => genvr.emit('died'));`),
      ],
    });
    t.raise('ping', 'b');
    t.raise('tap', 'a');
    expect(t.texts('log')).toEqual(['pong p2']);
  });

  it('a script emit loop stops at the rules chain limit', () => {
    const t = make({ module: mod, scripts: [script(`genvr.on('ping', () => genvr.emit('ping'));`)] });
    t.raise('ping');
    const accepted = t.requests.filter((r) => r.accepted).length;
    // The script hears ping at depths 0 to chain; the emit from the last is not delivered.
    expect(accepted).toBe(RULE_LIMITS.chain + 1);
    expect(t.engineLog.some((line) => line.includes('chain'))).toBe(true);
  });

  it('scripts hear events after the rules, in list order, handlers in registration order', () => {
    const t = make({
      module: mod,
      game: { rules: [{ when: { event: 'tap' }, do: [{ kind: 'add_counter', name: 'n', by: 1 }] }] },
      scripts: [
        script(
          `genvr.on('tap', () => genvr.log('A1', genvr.counter('n', 'p1'))); genvr.on('tap', () => genvr.log('A2'));`,
        ),
        script(`genvr.on('tap', () => genvr.log('B1'));`),
      ],
    });
    t.raise('tap');
    expect(t.texts('log')).toEqual(['A1 1', 'A2', 'B1']);
  });
});

describe('ordinary JavaScript', () => {
  it('classes, Map, generators, regexes and async handlers work', () => {
    const t = make({
      module: mod,
      scripts: [
        script(`class Tally { constructor() { this.m = new Map(); } add(k) { this.m.set(k, (this.m.get(k) ?? 0) + 1); return this.m.get(k); } }
          const tally = new Tally();
          function* twice(x) { yield x; yield x; }
          genvr.on('tap', async (e) => {
            await null;
            const n = tally.add(e.actor);
            genvr.log([...twice(n)].join('+'), /^p\\d$/.test(e.actor), new Date(0).toISOString());
            if (n === 2) genvr.act({ kind: 'add_score', by: 1 });
          });`),
      ],
    });
    t.raise('tap');
    t.raise('tap');
    expect(t.texts('log')).toEqual([
      '1+1 true 1970-01-01T00:00:00.000Z',
      '2+2 true 1970-01-01T00:00:00.000Z',
    ]);
    expect(t.session.view().players.get('a')!.score).toBe(1);
  });
});

describe('reads', () => {
  it('reads players, a player, counters by scope, zones, phase, time left and now', () => {
    const t = make({
      module: mod,
      game: { teams: { mode: 'two', friendlyFire: false } },
      scripts: [
        script(`genvr.on('tap', () => {
          genvr.act({ kind: 'add_counter', name: 'n', by: 2 });
          genvr.act({ kind: 'set_counter', name: 't', to: 5 });
          genvr.act({ kind: 'add_counter', name: 'g', by: 7 });
          const me = genvr.player('p1');
          genvr.log(JSON.stringify(genvr.players()), JSON.stringify(me), String(genvr.player('p9')));
          genvr.log(genvr.counter('n', 'p1'), genvr.counter('n', 'p2'), genvr.counter('t', me.team), genvr.counter('g'),
            genvr.counter('n'), genvr.counter('nope'), genvr.counter('n', 'p9'));
          genvr.log(JSON.stringify(genvr.zones('line')), genvr.zones().length);
          genvr.log(genvr.phase(), genvr.timeLeft(), genvr.now());
        });`),
      ],
    });
    t.raise('tap');
    const [players, me, rest] = t.texts('log');
    expect(JSON.parse(players!.split(' ')[0]!)).toEqual(['p1', 'p2']);
    const row = JSON.parse(players!.split(' ')[1]!);
    expect(Object.keys(row).sort()).toEqual(
      ['alive', 'health', 'place', 'present', 'riding', 'score', 'team'].sort(),
    );
    expect(row).toMatchObject({ health: 100, alive: true, score: 0, riding: null, present: true });
    expect(players!.endsWith(' null')).toBe(true);
    expect(me).toBe('2 0 5 7 null null null');
    expect(rest).toBe('[{"id":"z-gate","tag":"line","shape":"gate"}] 2');
    // Play started at 100 ms with 60 s on the clock; the second tick was at 200 ms.
    expect(t.texts('log')[3]).toBe('playing 59.9 200');
  });

  it('player().riding is the ride tag', () => {
    const t = make({
      module: mod,
      scripts: [script(`genvr.on('mounted', (e) => genvr.log(genvr.player(e.id).riding, e.tag, e.seat));`)],
    });
    t.session.mount('b', 'item-1', 'board', 2, t.now());
    expect(t.texts('log')).toEqual(['board board 2']);
  });

  it('gives at most 512 reads per handler, then null', () => {
    const t = make({
      module: mod,
      scripts: [
        script(`genvr.on('tap', () => {
          let last = 0, nulls = 0;
          for (let i = 0; i < 600; i++) { const v = genvr.phase(); if (v === null) nulls++; else last = i; }
          genvr.log(last, nulls);
        });`),
      ],
    });
    t.raise('tap');
    expect(t.texts('log')).toEqual([
      `${SCRIPT_LIMITS.readsPerHandler - 1} ${600 - SCRIPT_LIMITS.readsPerHandler}`,
    ]);
    expect(t.texts('refused')).toEqual([`more than ${SCRIPT_LIMITS.readsPerHandler} reads in one handler`]);
  });
});

describe('lifecycle', () => {
  it('a new match rebuilds the scripts: globals gone, handles restart, the seed advances', () => {
    const t = make({
      module: mod,
      players: ['a', 'b'],
      scripts: [
        script(`let count = 0; const first = genvr.random();
                genvr.on('tap', () => { count += 1; genvr.log(String(count), JSON.stringify(genvr.players()), String(first)); });`),
      ],
    });
    t.raise('tap');
    t.raise('tap');
    t.session.leave('a', t.now());
    t.pos.set('c', { x: 0, y: 0, z: 0 });
    t.session.join('c', t.now());
    t.raise('tap', 'b');
    const before = t.texts('log').map((line) => line.split(' '));
    expect(before.map((p) => p[0])).toEqual(['1', '2', '3']);
    expect(before[2]![1]).toBe('["p2","p3"]');
    const seedBefore = t.runner.recording().seed;
    untilReset(t);
    t.raise('tap', 'b');
    const after = t.texts('log').at(-1)!.split(' ');
    expect(after[0]).toBe('1');
    expect(after[1]).toBe('["p1","p2"]');
    expect(after[2]).not.toBe(before[0]![2]);
    expect(t.runner.recording().seed).not.toBe(seedBefore);
    expect(t.texts('start')).toHaveLength(2);
  });

  it('a top-level throw leaves that script off for the match and the others running', () => {
    const t = make({
      module: mod,
      scripts: [
        script(`genvr.on('tap', () => genvr.log('never'));\nthrow new Error('boom');`, 'thrower'),
        script(`genvr.on('tap', () => genvr.log('ok'));`, 'fine'),
      ],
    });
    t.raise('tap');
    expect(t.texts('log')).toEqual(['ok']);
    expect(t.runner.status().map((s) => s.state)).toEqual(['off', 'running']);
    const off = t.logs.find((line) => line.level === 'off')!;
    expect(off).toMatchObject({ script: 'thrower', line: 2 });
    expect(off.text).toContain('Error: boom');
  });

  it('a script that does not compile is not_compiled, with its line', () => {
    const t = make({ module: mod, scripts: [script(`genvr.on('tap', () => {\n  let = ;\n});`)] });
    expect(t.runner.status()[0]!.state).toBe('not_compiled');
    expect(t.logs[0]).toMatchObject({ level: 'off', line: 2 });
  });

  it('a disabled script never runs', () => {
    const t = make({ module: mod, scripts: [script(`genvr.log('hi');`, 'off one', false)] });
    expect(t.logs).toEqual([]);
    expect(t.runner.status()).toEqual([]);
    expect(t.runner.events).toEqual([]);
  });

  it('three overruns switch a script off; the match and the other scripts go on', () => {
    const t = make({
      module: mod,
      scripts: [
        script(`genvr.on('tap', () => { for (;;) {} });`, 'spinner'),
        script(`genvr.on('tap', () => genvr.act({ kind: 'add_counter', name: 'n', by: 1 }));`),
      ],
    });
    for (let i = 0; i < 5; i++) t.raise('tap');
    expect(t.texts('strike')).toHaveLength(3);
    expect(t.logs.filter((l) => l.level === 'off' && l.script === 'spinner')).toHaveLength(1);
    expect(t.runner.status().map((s) => [s.state, s.strikes])).toEqual([
      ['off', 3],
      ['running', 0],
    ]);
    expect(t.counter('n', 'a')).toBe(5);
    expect(t.session.view().phase).toBe('playing');
  });

  it('fifty errors switch a script off', () => {
    const t = make({
      module: mod,
      scripts: [script(`genvr.on('tap', () => { throw new Error('nope'); });`, 'thrower')],
    });
    for (let i = 0; i < SCRIPT_LIMITS.errors + 5; i++) t.raise('tap');
    expect(t.texts('error')).toHaveLength(SCRIPT_LIMITS.errors);
    expect(t.texts('error')[0]).toBe('script "thrower" line 1: Error: nope');
    expect(t.runner.status()[0]).toMatchObject({ state: 'off', errors: SCRIPT_LIMITS.errors });
  });

  it("an error's line names the script's own frames, at most 10 (review finding 7)", () => {
    const t = make({
      module: mod,
      scripts: [
        script(
          `function inner() { throw new Error('nope'); }\nfunction outer() { inner(); }\ngenvr.on('tap', () => [1].forEach(() => outer()));\nfunction deep(n) { if (n === 0) throw new Error('deep'); deep(n - 1); }\ngenvr.on('tap2', () => deep(20));`,
          'thrower',
        ),
      ],
    });
    t.raise('tap');
    t.raise('tap2');
    const [first, second] = t.texts('error');
    // The prelude's frames and native ones (forEach) are not shown; only the script's own.
    expect(first).toBe(
      'script "thrower" line 1: Error: nope (at inner 1:29 < outer 2:20 < anonymous 3:41 < anonymous 3:27)',
    );
    expect(second!.match(/deep \d+:\d+/g)).toHaveLength(10);
    expect(second).not.toContain('prelude');
  });

  it('the next match starts clean after a switch-off', () => {
    const t = make({ module: mod, scripts: [script(`genvr.on('tap', () => { for (;;) {} });`)] });
    for (let i = 0; i < 3; i++) t.raise('tap');
    expect(t.runner.status()[0]!.state).toBe('off');
    untilReset(t);
    expect(t.runner.status()[0]).toMatchObject({ state: 'running', strikes: 0, errors: 0 });
  });

  it('genvr.on inside a handler is refused', () => {
    const t = make({
      module: mod,
      scripts: [script(`genvr.on('tap', () => genvr.on('tap', () => genvr.log('late')));`)],
    });
    t.raise('tap');
    t.raise('tap');
    expect(t.texts('log')).toEqual([]);
    expect(t.texts('error')[0]).toContain('genvr.on is only allowed while the top level runs');
  });
});

describe('time budgets', () => {
  /** A fake budget clock: every read advances it by `step` ms, so each handler call costs `step` ms. */
  function steppingClock(step: number) {
    let t = 0;
    return () => (t += step);
  }

  it('a script over 25 ms in one second is skipped, with one strike', () => {
    const t = make({
      module: mod,
      runner: { clock: steppingClock(3) },
      scripts: [script(`genvr.on('tap', () => genvr.act({ kind: 'add_counter', name: 'n', by: 1 }));`)],
    });
    for (let i = 0; i < 20; i++) t.raise('tap');
    // 9 calls of 3 ms reach 27 ms; the rest of the second is skipped.
    expect(t.counter('n', 'a')).toBe(9);
    expect(t.runner.status()[0]).toMatchObject({ state: 'running', strikes: 1 });
    expect(t.texts('strike')).toEqual([
      `strike 1 of 3: over ${SCRIPT_LIMITS.scriptMsPerSecond} ms in one second; handlers skipped`,
    ]);
  });

  it('over 50 ms a second for the place, the lowest-listed script is skipped first', () => {
    const t = make({
      module: mod,
      runner: { clock: steppingClock(3) },
      scripts: [1, 100, 10000].map((by) =>
        script(`genvr.on('tap', () => genvr.act({ kind: 'add_counter', name: 'g', by: ${by} }));`, `s${by}`),
      ),
    });
    for (let i = 0; i < 12; i++) t.raise('tap');
    const g = t.session.view().globalCounters.g!;
    const counts = [g % 100, Math.floor(g / 100) % 100, Math.floor(g / 10000)];
    expect(counts[2]).toBeLessThan(counts[1]!);
    expect(counts[1]).toBeLessThanOrEqual(counts[0]!);
    const placeLines = t.logs.filter((line) => line.script === '' && line.level === 'refused');
    expect(placeLines).toHaveLength(1);
    expect(placeLines[0]!.text).toContain('"s10000"');
  });

  it("promise jobs left by an interrupted call never run in the next handler's budget (review finding 7)", () => {
    const t = make({
      module: mod,
      scripts: [
        script(`const work = () => { let x = 0; for (let i = 0; i < 35000; i++) x += i; return x; };
genvr.on('tap', () => {
  Promise.resolve().then(() => { for (;;) {} });
  Promise.resolve().then(() => { work(); genvr.log('left-over job'); });
});
genvr.on('tap2', () => { work(); genvr.log('tap2'); });`),
      ],
    });
    t.raise('tap');
    expect(t.runner.status()[0]!.strikes).toBe(1);
    // About 7 ticks each: the left-over job and tap2 together would pass the 12 ticks of one handler call.
    t.raise('tap2');
    expect(t.texts('log')).toEqual(['left-over job', 'tap2']);
    expect(t.runner.status()[0]).toMatchObject({ state: 'running', strikes: 1 });
  });

  it('prelude and top-level time count toward the place budget (review finding 2)', () => {
    let now = 0;
    const lines: string[] = [];
    const t = make({
      module: mod,
      runner: {
        clock: () => now,
        // The example's top level "takes" 50 ms (the watchdog's limit, not over it): each of its two log lines
        // advances the budget clock by 25 ms.
        onLog: (line) => {
          lines.push(`${line.level}: ${line.text}`);
          if (line.text === 'heavy') now += 25;
        },
      },
      scripts: [
        script(
          `genvr.log('heavy'); genvr.log('heavy'); genvr.on('tap', () => genvr.act({ kind: 'add_counter', name: 'g', by: 100 }));`,
          'start-heavy',
        ),
        script(`genvr.on('tap', () => genvr.act({ kind: 'add_counter', name: 'g', by: 1 }));`, 'tapper'),
      ],
    });
    // The place's second is used: the next script does not start this match (second review, critical 1) ...
    expect(lines).toContain(
      `off: not started yet: the scripts of this place used their ${SCRIPT_LIMITS.placeMsPerSecond} ms of this second; waiting: "tapper"`,
    );
    expect(t.runner.status().map((s) => s.state)).toEqual(['running', 'off']);
    // ... and the handlers right after the costly start are skipped.
    t.raise('tap');
    expect(t.session.view().globalCounters.g).toBe(0);
    expect(lines.some((line) => line.startsWith('refused: scripts of this place over'))).toBe(true);
    now += 1001;
    t.raise('tap');
    expect(t.session.view().globalCounters.g).toBe(100);
  });

  it('a handler call over the watchdog time switches every script of the place off', () => {
    const incidents: string[] = [];
    let now = 0;
    const t = make({
      module: mod,
      // The first handler call "takes" 94 ms: its log line advances the budget clock.
      runner: {
        clock: () => now,
        onIncident: (m) => incidents.push(m),
        onLog: (line) => {
          if (line.text === 'slow') now += 94;
        },
      },
      scripts: [script(`genvr.on('tap', () => genvr.log('slow'));`), script(`genvr.on('tap', () => {});`)],
    });
    t.raise('tap');
    expect(t.runner.status().map((s) => s.state)).toEqual(['off', 'off']);
    expect(incidents).toHaveLength(1);
    expect(incidents[0]).toContain('watchdog');
  });
});

describe('the log', () => {
  it('joins values, writes objects as JSON, cuts lines, and console.log is genvr.log', () => {
    const t = make({
      module: mod,
      scripts: [
        script(`genvr.on('tap', () => {
          genvr.log('a', 1, true, null, undefined, { x: [1, 2] });
          console.log('c', 'x'.repeat(500));
        });`),
      ],
    });
    t.raise('tap');
    const [first, second] = t.texts('log');
    expect(first).toBe('a 1 true null undefined {"x":[1,2]}');
    expect(second!.length).toBeLessThanOrEqual(SCRIPT_LIMITS.logChars);
    expect(second!.startsWith('c xxx')).toBe(true);
  });

  it('keeps 10 lines a second per script and reports the dropped ones in one line', () => {
    const t = make({
      module: mod,
      scripts: [script(`genvr.on('tap', () => { for (let i = 0; i < 10000; i++) genvr.log(i); });`)],
    });
    t.raise('tap');
    expect(t.texts('log')).toEqual([
      ...Array.from({ length: 10 }, (_, i) => String(i)),
      '9990 lines dropped (at most 10 a second)',
    ]);
    expect(t.runner.status()[0]!.strikes).toBe(0);
    // Later in the same second: dropped again; in the next second: allowed again.
    t.raise('tap');
    expect(t.texts('log').at(-1)).toBe('10000 lines dropped (at most 10 a second)');
    t.tick(1000);
    t.raise('tap');
    expect(t.texts('log').at(-2)).toBe('9');
  });

  it('keeps the last 200 lines of the place', () => {
    const t = make({ module: mod, scripts: [script(`genvr.on('tap', () => genvr.log('x'));`)] });
    for (let i = 0; i < 300; i++) {
      t.tick(1000);
      t.raise('tap');
    }
    expect(t.runner.log()).toHaveLength(SCRIPT_LIMITS.logLines);
  });
});

describe('the recording', () => {
  it('keeps the script-visible events with handles and the seed', () => {
    const t = make({
      module: mod,
      players: ['acct-7f3a9c', 'acct-0b12ee'],
      scripts: [script(`genvr.on('tap', () => {});`)],
    });
    t.raise('tap', 'acct-0b12ee');
    const rec = t.runner.recording();
    expect(typeof rec.seed).toBe('number');
    expect(rec.events.at(-1)).toEqual({ type: 'custom', actor: 'p2', name: 'tap', id: 'p2' });
    expect(JSON.stringify(rec)).not.toContain('acct-');
    expect(rec.events.some((e) => e.type === 'player_joined')).toBe(true);
  });

  it('keeps when each event happened and which were follow-ups', () => {
    const t = make({
      module: mod,
      game: {
        rules: [
          { when: { event: 'zone_crossed', tag: 'line' }, do: [{ kind: 'add_counter', name: 'n', by: 1 }] },
        ],
      },
      scripts: [script(`genvr.on('zone_crossed', () => {});`)],
    });
    t.cross('a');
    const rec = t.runner.recording();
    expect(rec.at).toHaveLength(rec.events.length);
    expect(rec.caused).toHaveLength(rec.events.length);
    const crossed = rec.events.findIndex((e) => e.type === 'zone_crossed');
    const counted = rec.events.findIndex((e) => e.type === 'counter_changed');
    // Two ticks to start play, two to cross: the crossing is at 400 ms on the match clock.
    expect(rec.at[crossed]).toBe(400);
    expect(rec.caused[crossed]).toBe(false);
    expect(counted).toBeGreaterThan(crossed);
    expect(rec.caused[counted]).toBe(true);
    expect(rec.at[0]).toBe(0);
  });

  it('holds at most 2000 events', () => {
    const t = make({ module: mod, scripts: [script(`genvr.on('nothing', () => {});`)] });
    for (let i = 0; i < SCRIPT_LIMITS.recordingEvents + 50; i++) t.raise('tap');
    expect(t.runner.recording().events).toHaveLength(SCRIPT_LIMITS.recordingEvents);
  });
});
