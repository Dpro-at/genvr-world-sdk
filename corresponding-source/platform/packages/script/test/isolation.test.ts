import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Game, SCRIPT_LIMITS } from '@genvr/contracts';
import { createScriptModule, SANDBOX_DEFAULTS, START_DEFAULTS } from '../src/index.js';
import {
  compileCheck as nodeCompileCheck,
  createWorkerScriptModule,
  dryRun as nodeDryRun,
  hardDeadlineMs,
  liveScriptModules,
  setDryRunLimits,
  setScriptModuleLimit,
  setScriptOwnerLimit,
  ScriptCapacityError,
  type WorkerScriptModule,
} from '../src/node.js';
import { BASE_GAME, place, script, untilReset } from './support.js';

// Finding 1 of the independent review: native builtins (the default sort, indexOf, fill, join, JSON.stringify on big
// arrays) never poll QuickJS's interrupt, so a loop of them stalls the whole Node event loop for minutes. A worker
// module runs the sandboxes on a thread the host terminates on a hard deadline. Wall-clock tolerances are generous
// (a loaded test machine); what matters is "well under a second" against "minutes".

/** The exact hostile script of the review: 30 ms sorts that poll the interrupt only a few times each. */
const BIG = 'const big = Array.from({ length: 1e5 }, (_, i) => (i * 7919) % 1e5);';
const STALL_TOP = `${BIG} for (;;) big.slice().sort();`;
const STALL_HANDLER = `${BIG} genvr.on('tap', () => { for (;;) big.slice().sort(); });`;
/**
 * The longest the host may be blocked by a call that ends on its hard deadline: 3 x the deadline plus 25 ms, so a
 * five-fold regression of a deadline fails (second review: 1500 ms caught none). Measured 2026-10-03 on the dev
 * machine: a top level 113-125 ms (deadline 100), a handler 57-60, a native call 51-52, a dry run 65-68.
 */
const within = (deadlineMs: number) => deadlineMs * 3 + 25;
const TOP_LEVEL_MS = within(hardDeadlineMs(START_DEFAULTS));
const HANDLER_MS = within(hardDeadlineMs(SANDBOX_DEFAULTS));

const neighbour = () =>
  script(`genvr.on('tap', () => genvr.act({ kind: 'add_counter', name: 'g', by: 1 }));`, 'neighbour');

let mod: WorkerScriptModule;
beforeAll(async () => {
  mod = await createWorkerScriptModule();
});
afterAll(() => mod.dispose());
// A test that ended with a kill leaves a replacement worker starting in the background (never waited for).
beforeEach(async () => {
  await mod.whenReady();
});

/** Longest gap between event-loop turns while `body` runs (a timer every 5 ms). */
async function loopLag(body: () => Promise<void> | void): Promise<number> {
  let last = performance.now();
  let worst = 0;
  const timer = setInterval(() => {
    const now = performance.now();
    worst = Math.max(worst, now - last);
    last = now;
  }, 5);
  try {
    await new Promise((resolve) => setTimeout(resolve, 20));
    await body();
    await new Promise((resolve) => setTimeout(resolve, 20));
  } finally {
    clearInterval(timer);
  }
  return worst;
}

describe('the in-process module (why the worker exists)', () => {
  it('a bounded loop of default sorts runs far past its 25 ms top-level budget', async () => {
    const inProcess = await createScriptModule();
    try {
      const box = inProcess.newSandbox('stall');
      const start = performance.now();
      const result = box.run(`${BIG} for (let i = 0; i < 20; i++) big.slice().sort();`, {
        memoryBytes: SCRIPT_LIMITS.memoryBytes,
        stackBytes: SCRIPT_LIMITS.stackBytes,
        ticks: SCRIPT_LIMITS.startTicks,
        wallMs: SCRIPT_LIMITS.startMs,
      });
      // Each sort polls the interrupt only a few times: the budget is checked too rarely to stop it in time.
      expect(performance.now() - start).toBeGreaterThan(SCRIPT_LIMITS.startMs * 4);
      expect(result.ticks).toBeLessThan(SCRIPT_LIMITS.startTicks);
    } finally {
      inProcess.dispose();
    }
  });
});

describe('a worker module ends hostile native loops on a hard deadline', () => {
  it('a sort loop at the top level: the host stays responsive and the place scripts are off', async () => {
    const incidents: string[] = [];
    let t: ReturnType<typeof place> | null = null;
    const lag = await loopLag(() => {
      t = place({
        module: mod,
        scripts: [script(STALL_TOP, 'stall'), neighbour()],
        runner: { onIncident: (message) => incidents.push(message) },
      });
    });
    const run = t as unknown as ReturnType<typeof place>;
    try {
      expect(lag).toBeLessThan(TOP_LEVEL_MS);
      expect(run.runner.status().every((s) => s.state !== 'running')).toBe(true);
      expect(incidents.some((m) => m.includes('hard deadline'))).toBe(true);
      expect(run.texts('off').some((text) => text.includes('hard deadline'))).toBe(true);
    } finally {
      run.dispose();
    }
  });

  it('a sort loop in a handler: the call ends on the deadline, the script is off, the next match runs again', async () => {
    const incidents: string[] = [];
    // The budget clock runs a second ahead at each new match, as a room's would (results last at least 3 s): the
    // killed call's time is charged to the place's second.
    let offset = 0;
    const t = place({
      module: mod,
      // The neighbour is listed first: it hears 'tap' before the hostile handler ends the module.
      scripts: [neighbour(), script(STALL_HANDLER, 'stall')],
      runner: { onIncident: (message) => incidents.push(message), clock: () => performance.now() + offset },
      game: { match: { minPlayers: 2, durationSec: 30, countdownSec: 0, resultsSec: 3 } },
    });
    t.session.bus.on('phase_changed', () => {
      offset += 1000;
    });
    try {
      expect(t.runner.status().map((s) => s.state)).toEqual(['running', 'running']);
      const lag = await loopLag(() => t.raise('tap'));
      expect(lag).toBeLessThan(HANDLER_MS);
      expect(t.runner.status().map((s) => s.state)).toEqual(['off', 'off']);
      expect(incidents.some((m) => m.includes('hard deadline'))).toBe(true);
      // The room goes on; the next match runs on the fresh worker (up in the background, never waited for) and the
      // well-behaved neighbour runs again.
      await mod.whenReady();
      untilReset(t);
      expect(t.runner.status().map((s) => s.state)).toEqual(['running', 'running']);
      t.tick();
      t.tick();
      const before = t.session.view().globalCounters.g ?? 0;
      // The hostile handler is killed again (a second kill), the neighbour has already counted.
      t.raise('tap');
      expect(t.session.view().globalCounters.g).toBe(before + 1);
    } finally {
      t.dispose();
    }
  });

  it('a script killed three times stays off for the rest of the game', async () => {
    let offset = 0;
    const t = place({
      module: mod,
      scripts: [script(STALL_TOP, 'stall')],
      runner: { clock: () => performance.now() + offset },
      game: { match: { minPlayers: 2, durationSec: 30, countdownSec: 0, resultsSec: 3 } },
    });
    t.session.bus.on('phase_changed', () => {
      offset += 1000;
    });
    try {
      // Each kill's replacement worker comes up in the background before the next match.
      await mod.whenReady();
      untilReset(t);
      await mod.whenReady();
      untilReset(t);
      await mod.whenReady();
      const lag = await loopLag(() => untilReset(t));
      expect(lag).toBeLessThan(TOP_LEVEL_MS);
      expect(t.texts('off').some((text) => text.includes(`${SCRIPT_LIMITS.kills} times`))).toBe(true);
      expect(t.runner.status()[0]!.state).toBe('off');
    } finally {
      t.dispose();
    }
  });

  it('a match start never waits for a replacement worker to boot; the scripts start when it is ready', async () => {
    let offset = 0;
    const t = place({
      module: mod,
      scripts: [neighbour(), script(STALL_HANDLER, 'stall')],
      runner: { clock: () => performance.now() + offset },
      game: { match: { minPlayers: 2, durationSec: 30, countdownSec: 0, resultsSec: 3 } },
    });
    try {
      // A kill: the worker is terminated and a new one starts in the background.
      t.raise('tap');
      expect(t.runner.status().map((s) => s.state)).toEqual(['off', 'off']);
      offset += 5000;
      // The next match starts at once (second review): before, the start blocked until the new worker was up.
      let worstTick = 0;
      let reset = false;
      t.session.bus.on('match_reset', () => {
        reset = true;
      });
      for (let i = 0; i < 2000 && !reset; i++) {
        const began = performance.now();
        t.tick(100);
        worstTick = Math.max(worstTick, performance.now() - began);
      }
      expect(reset).toBe(true);
      expect(worstTick).toBeLessThan(25);
      expect(t.logs.some((line) => line.script === '' && line.text.includes('worker is starting'))).toBe(
        true,
      );
      expect(t.texts('off').some((text) => text.includes('no room for more scripts'))).toBe(false);
      // Once the worker says it is ready, the scripts start (no new match needed).
      const deadline = performance.now() + 3000;
      while (performance.now() < deadline && t.runner.status().some((s) => s.state !== 'running'))
        await new Promise((resolve) => setTimeout(resolve, 20));
      expect(t.runner.status().map((s) => s.state)).toEqual(['running', 'running']);
    } finally {
      t.dispose();
    }
  });

  it('other hostile native calls on big arrays end on the deadline too', async () => {
    const bodies = [
      `for (;;) big.indexOf(-1);`,
      `for (;;) big.slice().fill(1);`,
      `for (;;) big.join(',');`,
      `for (;;) JSON.stringify(big);`,
    ];
    for (const body of bodies) {
      await mod.whenReady();
      const t = place({ module: mod, scripts: [script(`${BIG} genvr.on('tap', () => { ${body} });`)] });
      try {
        expect(t.runner.status()[0]!.state).toBe('running');
        const start = performance.now();
        t.raise('tap');
        expect(performance.now() - start).toBeLessThan(HANDLER_MS);
        expect(t.runner.status()[0]!.state).toBe('off');
      } finally {
        t.dispose();
      }
    }
  });

  it('slow host functions cannot stretch one call far past its hard deadline (second review)', () => {
    const box = mod.newSandbox('slow-host');
    let served = 0;
    box.defineHost('__read', () => {
      served += 1;
      // 20 ms of host work, asleep so the other test files keep their CPU.
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
      return 'null';
    });
    try {
      const limits = { ...SANDBOX_DEFAULTS, ticks: 1e9, wallMs: 25 };
      const started = performance.now();
      const result = box.run(`for (let i = 0; i < 200; i++) { try { __read('x'); } catch (e) {} }`, limits);
      const took = performance.now() - started;
      expect(result.ok).toBe(true);
      // 200 crossings of 20 ms would be 4 s; the call ends within about two hard deadlines.
      expect(took).toBeLessThan(2 * 100 + 150);
      // At most one hard deadline (100 ms) of host work, then every crossing is refused unserved.
      expect(served).toBeLessThanOrEqual(6);
    } finally {
      box.dispose();
    }
  });

  it('well-behaved scripts work the same through the worker', () => {
    const t = place({
      module: mod,
      scripts: [
        script(
          `let n = 0; genvr.on('tap', (e) => { n += 1; genvr.log('tap', n, e.actor); genvr.act({ kind: 'add_counter', name: 'n', by: 2 }); });`,
        ),
      ],
    });
    try {
      t.raise('tap');
      t.raise('tap');
      expect(t.texts('log')).toEqual(['tap 1 p1', 'tap 2 p1']);
      expect(t.counter('n', 'a')).toBe(4);
      expect(t.runner.status()[0]!.state).toBe('running');
    } finally {
      t.dispose();
    }
  });
});

describe('the API side: compile check and dry run on worker modules', () => {
  it('a dry run of the hostile handler ends on the deadline and reports the script off', async () => {
    let result: Awaited<ReturnType<typeof nodeDryRun>> | null = null;
    const lag = await loopLag(async () => {
      result = await nodeDryRun({
        game: Game.parse(BASE_GAME),
        scripts: [script(STALL_HANDLER, 'stall')],
        events: [{ type: 'custom', name: 'tap', id: 'p1' }],
      });
    });
    expect(lag).toBeLessThan(HANDLER_MS);
    const done = result as unknown as Awaited<ReturnType<typeof nodeDryRun>>;
    expect(done.status[0]!.state).toBe('off');
    expect(done.log.some((line) => line.level === 'off' && line.text.includes('hard deadline'))).toBe(true);
    expect(await nodeCompileCheck('let = ;')).toMatchObject({ ok: false });
  });
});

describe('process-wide cap on live script modules', () => {
  it('refuses a module over the cap with a clear error, and frees a slot on dispose', async () => {
    const before = liveScriptModules();
    setScriptModuleLimit(before + 1);
    try {
      const extra = await createWorkerScriptModule();
      expect(liveScriptModules()).toBe(before + 1);
      await expect(createWorkerScriptModule()).rejects.toBeInstanceOf(ScriptCapacityError);
      extra.dispose();
      expect(liveScriptModules()).toBe(before);
      const again = await createWorkerScriptModule();
      again.dispose();
    } finally {
      setScriptModuleLimit(null);
    }
  });

  it("caps one owner's rooms, so one account cannot take every slot (second review)", async () => {
    setScriptOwnerLimit(1);
    const made: WorkerScriptModule[] = [];
    try {
      made.push(await createWorkerScriptModule({ owner: 'acct-example-a' }));
      const refused = await createWorkerScriptModule({ owner: 'acct-example-a' }).catch(
        (error: unknown) => error,
      );
      expect(refused).toBeInstanceOf(ScriptCapacityError);
      expect((refused as ScriptCapacityError).reason).toBe('owner');
      made.push(await createWorkerScriptModule({ owner: 'acct-example-b' }));
      made[0]!.dispose();
      made.push(await createWorkerScriptModule({ owner: 'acct-example-a' }));
    } finally {
      setScriptOwnerLimit(null);
      for (const one of made) one.dispose();
    }
  });

  it("the compile check and dry runs keep working when the rooms took every slot (the API's reserve)", async () => {
    setScriptModuleLimit(liveScriptModules());
    try {
      await expect(createWorkerScriptModule()).rejects.toBeInstanceOf(ScriptCapacityError);
      expect(await nodeCompileCheck('genvr.log(1);')).toEqual({ ok: true });
      const result = await nodeDryRun({
        game: Game.parse(BASE_GAME),
        scripts: [script(`genvr.on('tap', () => genvr.log('tap'));`)],
        events: [{ type: 'custom', name: 'tap', id: 'p1' }],
      });
      expect(result.log.some((line) => line.text === 'tap')).toBe(true);
    } finally {
      setScriptModuleLimit(null);
    }
  });

  it('dry runs wait their turn in a short queue; past it they are refused as busy', async () => {
    setDryRunLimits({ concurrent: 1, queued: 1 });
    try {
      const input = {
        game: Game.parse(BASE_GAME),
        scripts: [script(`genvr.on('tap', () => genvr.log('tap'));`)],
        events: [{ type: 'custom' as const, name: 'tap', id: 'p1' }],
      };
      const runs = [nodeDryRun(input), nodeDryRun(input), nodeDryRun(input)].map((run) =>
        run.then(
          (result) => result.log.some((line) => line.text === 'tap'),
          (error: unknown) => error,
        ),
      );
      const [first, second, third] = await Promise.all(runs);
      expect(first).toBe(true);
      expect(second).toBe(true);
      expect(third).toBeInstanceOf(ScriptCapacityError);
      expect((third as ScriptCapacityError).reason).toBe('busy');
    } finally {
      setDryRunLimits(null);
    }
  });
});
