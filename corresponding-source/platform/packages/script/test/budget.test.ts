import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Game, SCRIPT_LIMITS } from '@genvr/contracts';
import { ScriptGuard } from '../src/index.js';
import { createWorkerScriptModule, dryRun as nodeDryRun, type WorkerScriptModule } from '../src/node.js';
import { BASE_GAME, place, script } from './support.js';

// Second independent review (availability): every match start ran each enabled script's prelude and top level with
// its own 100 ms hard deadline, charged only afterwards, so eight scripts whose top levels stay just under the
// deadline blocked the room's process for most of a second at every match start, and a dry run of a game that
// restarts its match every few seconds could block the API for minutes. Wall-clock bounds here are meant to catch a
// regression of several times the budget, not machine noise: the old behaviour measures 5-10 times these bounds.

/** Native work that never polls the interrupt in time: the default sort of 100 000 numbers (30-70 ms). */
const BIG = 'const big = Array.from({ length: 1e5 }, (_, i) => (i * 7919) % 1e5);';
/** A match that never plays long: the next one starts every 3 s of game time. */
const FAST_MATCHES = { match: { minPlayers: 2, durationSec: 30, countdownSec: 0, resultsSec: 3 } };

let mod: WorkerScriptModule;
/** A top level of about 75 ms on this machine: under the 100 ms hard deadline, over the 50 ms watchdog. */
let NEAR_DEADLINE = '';
/** A top level of about 25 ms on this machine: under the watchdog. */
let UNDER_WATCHDOG = '';
beforeAll(async () => {
  mod = await createWorkerScriptModule();
  // The sort's speed differs between machines and between a lone file and the whole suite: measure it here.
  const box = mod.newSandbox('calibrate');
  const limits = { memoryBytes: SCRIPT_LIMITS.memoryBytes, stackBytes: SCRIPT_LIMITS.stackBytes, ticks: 1e6 };
  box.run(BIG, { ...limits, wallMs: 1000 });
  let sortMs = Infinity;
  for (let i = 0; i < 3; i++) {
    const start = performance.now();
    box.run('big.slice().sort();', { ...limits, wallMs: 1000 });
    sortMs = Math.min(sortMs, performance.now() - start);
  }
  box.dispose();
  const repeat = Math.max(1, Math.round(75 / sortMs));
  NEAR_DEADLINE = `${BIG} for (let i = 0; i < ${repeat}; i++) big.slice().sort();`;
  const length = Math.max(1000, Math.round((1e5 * 25) / sortMs));
  UNDER_WATCHDOG = `const small = Array.from({ length: ${length} }, (_, i) => (i * 7919) % ${length}); small.slice().sort();`;
});
afterAll(() => mod.dispose());

/**
 * Plays `starts` match starts one second apart on the budget clock (the most a room restarts a match for edits) and
 * returns the real time each start blocked the thread (the ticks that took longer than 2 ms).
 */
function blockedPerStart(sources: string[], starts: number) {
  let offset = 0;
  const clock = () => performance.now() + offset;
  const began = performance.now();
  const t = place({
    module: mod,
    scripts: sources.map((source, i) => script(source, `example ${i + 1}`)),
    runner: { clock },
    game: FAST_MATCHES,
    noStart: true,
  });
  const blocked = [performance.now() - began];
  let resets = 0;
  t.session.bus.on('match_reset', () => {
    resets += 1;
  });
  try {
    while (blocked.length < starts) {
      offset += 1000;
      const before = resets;
      let spent = 0;
      for (let i = 0; i < 1000 && resets === before; i++) {
        const tickStart = performance.now();
        t.tick(100);
        const took = performance.now() - tickStart;
        if (took > 2) spent += took;
      }
      if (resets === before) throw new Error('no new match');
      blocked.push(spent);
    }
    return { blocked, total: blocked.reduce((a, b) => a + b, 0), t };
  } finally {
    t.dispose();
  }
}

describe('match starts are bounded (review 2, critical 1)', () => {
  it('eight top levels just under the hard deadline: a kill each, then off; not 8 x 90 ms per start', () => {
    const { blocked, total, t } = blockedPerStart(Array(8).fill(NEAR_DEADLINE), 10);
    // Before: about 600 ms at every start (6 s over these ten). Now: one top level per start over the watchdog is a
    // kill, three kills and the place's scripts stay off.
    expect(Math.max(...blocked)).toBeLessThan(250);
    expect(total).toBeLessThan(700);
    expect(t.texts('off').some((text) => text.includes(`${SCRIPT_LIMITS.kills} times`))).toBe(true);
  });

  it('eight top levels under the watchdog: the place budget is checked before each one, start time per ten seconds', () => {
    const { blocked, total, t } = blockedPerStart(Array(8).fill(UNDER_WATCHDOG), 10);
    // Before: about 200 ms at every start (2 s over ten). Now: at most the place's 50 ms a second plus the top
    // level that crossed it, and match starts share 250 ms in ten seconds.
    expect(Math.max(...blocked)).toBeLessThan(150);
    expect(total).toBeLessThan(SCRIPT_LIMITS.startMsPerWindow + 250);
    expect(t.logs.some((line) => line.script === '' && line.text.includes('not started yet'))).toBe(true);
  });

  it('a dry run of about a thousand match starts ends within its wall-time cap', async () => {
    const ender = script(
      `genvr.on('phase_changed', (e) => { if (e.phase === 'playing') genvr.act({ kind: 'end_match', winner: 'nobody' }); });`,
      'ender',
    );
    const busy = Array.from({ length: 7 }, (_, i) =>
      script(`let x = 0; for (let i = 0; i < 40000; i++) x += i;`, `busy ${i + 1}`),
    );
    const began = performance.now();
    const result = await nodeDryRun({
      game: Game.parse({ ...BASE_GAME, ...FAST_MATCHES }),
      scripts: [ender, ...busy],
      // One hour of game time: a match start every 3 s.
      events: [{ type: 'custom', name: 'tap', id: null, at: 3_600_000 }],
    });
    const took = performance.now() - began;
    // Before: every start ran all eight top levels (about a thousand starts, tens of seconds on the API's thread).
    expect(took).toBeLessThan(SCRIPT_LIMITS.dryRunMs + 1000);
    expect(result.status.length).toBe(8);
  });

  it("a dry run's kills never block the caller's event loop: it runs on its own thread (third review, R2)", async () => {
    const big = 'const big = Array.from({ length: 1e5 }, (_, i) => (i * 7919) % 1e5);';
    let worst = 0;
    let last = performance.now();
    const probe = setInterval(() => {
      const now = performance.now();
      worst = Math.max(worst, now - last);
      last = now;
    }, 5);
    try {
      // The probe's timer must be running before the dry run starts, or a stall at its start goes unseen.
      await new Promise((resolve) => setTimeout(resolve, 20));
      const result = await nodeDryRun({
        game: Game.parse(BASE_GAME),
        scripts: [script(`${big} genvr.on('tap', () => { for (;;) big.slice().sort(); });`, 'stall')],
        events: Array.from({ length: 5 }, () => ({ type: 'custom' as const, name: 'tap', id: 'p1' })),
      });
      expect(result.status[0]!.state).toBe('off');
      await new Promise((resolve) => setTimeout(resolve, 20));
    } finally {
      clearInterval(probe);
    }
    // Before: each kill held the API's thread for the hard deadline (about 50-125 ms measured).
    expect(worst).toBeLessThan(30);
  });

  it('a dry run past its wall-time cap stops with a clear message', async () => {
    const result = await nodeDryRun({
      game: Game.parse({ ...BASE_GAME, ...FAST_MATCHES }),
      scripts: [script(`genvr.on('tap', () => { let x = 0; for (let i = 0; i < 30000; i++) x += i; });`)],
      events: Array.from({ length: 400 }, () => ({ type: 'custom' as const, name: 'tap', id: 'p1' })),
      wallMs: 1,
    });
    expect(result.stopped).toMatch(/stopped after/);
    expect(result.log.some((line) => line.level === 'off' && /stopped after/.test(line.text))).toBe(true);
  });
});

/** The exact hostile top level of the live check: killed on the 100 ms hard deadline every time it runs. */
const STALL_TOP = `${BIG} for (;;) big.slice().sort();`;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('kills count per room across games (review 2, critical 2)', () => {
  it('a hostile top level re-saved every second stalls the room a few times, not once a second', async () => {
    const guard = new ScriptGuard();
    let offset = 0;
    const clock = () => performance.now() + offset;
    const blocked: number[] = [];
    const incidents: string[] = [];
    const lines: string[] = [];
    // Each save is a new game with the changed text (the room restarts at most once a second).
    for (let save = 0; save < 25; save += 1) {
      const before = incidents.length;
      const began = performance.now();
      const t = place({
        module: mod,
        scripts: [script(`${STALL_TOP} // save ${save}`, 'hostile')],
        runner: {
          clock,
          guard,
          onIncident: (message) => incidents.push(message),
          onLog: (line) => lines.push(line.text),
        },
        noStart: true,
      });
      blocked.push(performance.now() - began);
      t.dispose();
      // A killed worker starts again in the background; give it the time a second between saves gives it.
      if (incidents.length > before) await sleep(300);
      offset += 1000;
    }
    const total = blocked.reduce((a, b) => a + b, 0);
    const kills = incidents.filter((m) => m.includes('hard deadline')).length;
    // Before: a kill (about 100 ms) at every save, 2.5 s over these 25 seconds. Now: three, then one after 5 s and one
    // after 10 s more (the back-off), so at most 5 in 25 s (about 2% of the time).
    expect(kills).toBeGreaterThanOrEqual(3);
    expect(kills).toBeLessThanOrEqual(5);
    expect(total).toBeLessThan(800);
    expect(lines.some((text) => text.includes('stay off'))).toBe(true);
  });

  it('the same text saved again after three kills stays off until the window has passed', () => {
    const guard = new ScriptGuard();
    const hostile = script(STALL_TOP, 'hostile');
    for (let at = 0; at < 3; at += 1) guard.recordKill(at * 1000, [hostile]);
    expect(guard.retired(4000, [hostile])).toMatchObject({ retryAt: null });
    // A changed text may come back 5 s after the last kill; the same text only after 10 minutes.
    const fixed = { ...hostile, source: 'genvr.log("fixed");' };
    expect(guard.retired(4000, [fixed])).toMatchObject({ retryAt: 2000 + SCRIPT_LIMITS.killRetryMs });
    expect(guard.retired(2000 + SCRIPT_LIMITS.killRetryMs, [fixed])).toBeNull();
    // A fourth kill doubles the wait for a changed text.
    guard.recordKill(8000, [fixed]);
    expect(guard.retired(9000, [{ ...fixed, source: 'x' }])).toMatchObject({
      retryAt: 8000 + 2 * SCRIPT_LIMITS.killRetryMs,
    });
    // Ten minutes after the third-last kill fewer than three are left: the same text runs again.
    expect(guard.retired(1000 + SCRIPT_LIMITS.killWindowMs, [fixed])).toBeNull();
  });

  it('a worker that died between calls is a kill, not an out-of-memory note for each script', async () => {
    const own = await createWorkerScriptModule();
    const incidents: string[] = [];
    const t = place({
      module: own,
      scripts: [
        script(`genvr.on('tap', () => genvr.act({ kind: 'add_counter', name: 'g', by: 1 }));`, 'one'),
        script(`genvr.on('tap', () => {});`, 'two'),
      ],
      runner: { onIncident: (message) => incidents.push(message) },
    });
    try {
      await own.stopWorker();
      t.raise('tap');
      expect(t.runner.status().map((s) => s.state)).toEqual(['off', 'off']);
      expect(incidents.some((m) => m.includes('hard deadline') || m.includes('stopped by itself'))).toBe(
        true,
      );
      expect(t.texts('off').some((text) => text.includes('out of memory'))).toBe(false);
      expect(own.kills).toBe(1);
    } finally {
      t.dispose();
      own.dispose();
    }
  });
});
