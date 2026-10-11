import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { Worker } from 'node:worker_threads';
import { WorldDocument } from '@genvr/contracts';
import { describe, expect, it } from 'vitest';
import {
  ScriptEngineTimeout,
  workerScriptEngine,
  type EngineReply,
  type EngineWorker,
} from './script-engine';

// Review finding 1 in the browser: the builder's dry run runs on a worker the page terminates on a deadline, so a
// script whose native calls never poll the interrupt cannot freeze the tab. A Node worker thread running the same
// message protocol as `script-worker.ts` stands in for the browser's Web Worker. The scripts are examples.

const scriptUrl = pathToFileURL(createRequire(import.meta.url).resolve('@genvr/script')).href;
const WORKER = `
const { parentPort } = require('node:worker_threads');
parentPort.on('message', async ({ id, op, input }) => {
  try {
    const script = await import(${JSON.stringify(scriptUrl)});
    parentPort.postMessage({ id, started: true });
    const value = op === 'compile' ? await script.compileCheck(input) : await script.dryRun(input);
    parentPort.postMessage({ id, ok: true, value });
  } catch (error) {
    parentPort.postMessage({ id, ok: false, message: String(error && error.message) });
  }
});`;

function nodeWorker(): EngineWorker & { terminated: boolean } {
  const worker = new Worker(WORKER, { eval: true });
  const adapter = {
    terminated: false,
    onmessage: null as EngineWorker['onmessage'],
    onerror: null as EngineWorker['onerror'],
    postMessage: (message: unknown) => worker.postMessage(message),
    terminate: () => {
      adapter.terminated = true;
      void worker.terminate();
    },
  };
  worker.on('message', (data: EngineReply) => adapter.onmessage?.({ data }));
  worker.on('error', (error) => adapter.onerror?.(error));
  return adapter;
}

const doc = (source: string) =>
  WorldDocument.parse({
    schemaVersion: 1,
    experienceId: 'exp-1',
    version: 1,
    style: { base: 'blocky' },
    sizeTier: 'small',
    access: { mode: 'private' },
    environment: { sky: { preset: 'day' }, weather: { preset: 'clear' } },
    terrain: {},
    spawn: { position: [0, 1, 0] },
    instances: [],
    game: {
      match: { minPlayers: 1, durationSec: 300, countdownSec: 0, resultsSec: 3 },
      win: { by: 'highest_score' },
      counters: [{ name: 'n', scope: 'global', start: 0 }],
    },
    scripts: [{ id: 'scr-0000aaaa', name: 'example', api: 1, enabled: true, source }],
  });

const STALL = `const big = Array.from({ length: 1e5 }, (_, i) => (i * 7919) % 1e5);
genvr.on('tap', () => { for (;;) big.slice().sort(); });`;

describe('the browser script engine on a worker', () => {
  it('a dry run of a script stuck in native sorts is stopped on its deadline; the page thread stays free', async () => {
    const made: Array<ReturnType<typeof nodeWorker>> = [];
    const engine = workerScriptEngine(
      () => {
        const worker = nodeWorker();
        made.push(worker);
        return worker;
      },
      { compileMs: 10_000, dryRunMs: 3000 },
    );
    const world = doc(STALL);
    let worst = 0;
    let last = performance.now();
    const timer = setInterval(() => {
      const now = performance.now();
      worst = Math.max(worst, now - last);
      last = now;
    }, 5);
    try {
      const started = performance.now();
      await expect(
        engine.dryRun({
          doc: world,
          scripts: world.scripts ?? [],
          events: [{ type: 'custom', name: 'tap', id: 'p1' }],
        }),
      ).rejects.toBeInstanceOf(ScriptEngineTimeout);
      // Generous tolerances: the deadline is 3 s, a stalled page thread would show a gap of seconds.
      expect(performance.now() - started).toBeLessThan(8000);
      expect(worst).toBeLessThan(1000);
      expect(made[0]!.terminated).toBe(true);
      // The next call gets a fresh worker and works.
      const fine = doc(`genvr.on('tap', () => genvr.act({ kind: 'add_counter', name: 'n', by: 1 }));`);
      const result = await engine.dryRun({
        doc: fine,
        scripts: fine.scripts ?? [],
        events: [{ type: 'custom', name: 'tap', id: 'p1' }],
      });
      expect(result.requested.filter((r) => r.accepted)).toHaveLength(1);
      expect(made).toHaveLength(2);
      expect(await engine.compileCheck('let = ;')).toMatchObject({ ok: false });
    } finally {
      clearInterval(timer);
      for (const worker of made) worker.terminate();
    }
  }, 30_000);
});
