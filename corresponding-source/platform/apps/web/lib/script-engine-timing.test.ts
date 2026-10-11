import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ScriptEngineTimeout,
  workerScriptEngine,
  type EngineReply,
  type EngineRequest,
  type EngineWorker,
} from './script-engine';

// Second review: the browser's time limit started when the page posted the call, so the first call also paid for
// loading the engine (its import and the QuickJS WebAssembly), which on a slow phone can take seconds. The limit now
// starts when the worker says it started the call; loading has its own, longer limit.

/** A stand-in Web Worker the test drives by hand. */
function fakeWorker() {
  const posted: EngineRequest[] = [];
  const worker: EngineWorker & { terminated: boolean; reply(data: EngineReply): void } = {
    terminated: false,
    onmessage: null,
    onerror: null,
    postMessage: (message) => posted.push(message),
    terminate: () => {
      worker.terminated = true;
    },
    reply: (data) => worker.onmessage?.({ data }),
  };
  return { worker, posted };
}

const DEADLINES = { compileMs: 50, dryRunMs: 100, loadMs: 5000 };

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('the browser engine times calls from when the worker starts them', () => {
  it('a slow engine load does not count toward the dry run limit', async () => {
    const { worker, posted } = fakeWorker();
    const engine = workerScriptEngine(() => worker, DEADLINES);
    const result = engine.dryRun({ scripts: [] } as never);
    const id = posted[0]!.id;
    // The engine's import and WebAssembly take 2 s, far past the 100 ms dry-run limit.
    await vi.advanceTimersByTimeAsync(2000);
    expect(worker.terminated).toBe(false);
    worker.reply({ id, started: true });
    await vi.advanceTimersByTimeAsync(60);
    worker.reply({ id, ok: true, value: 'done' });
    await expect(result).resolves.toBe('done');
  });

  it('a call that started and runs past its limit is stopped', async () => {
    const { worker, posted } = fakeWorker();
    const engine = workerScriptEngine(() => worker, DEADLINES);
    const result = engine.dryRun({ scripts: [] } as never);
    const check = expect(result).rejects.toBeInstanceOf(ScriptEngineTimeout);
    worker.reply({ id: posted[0]!.id, started: true });
    await vi.advanceTimersByTimeAsync(DEADLINES.dryRunMs + 1);
    await check;
    expect(worker.terminated).toBe(true);
  });

  it('an engine that never loads is stopped on the load limit', async () => {
    const { worker } = fakeWorker();
    const engine = workerScriptEngine(() => worker, DEADLINES);
    const result = engine.compileCheck('genvr.log(1);');
    const check = expect(result).rejects.toThrow(/could not load/);
    await vi.advanceTimersByTimeAsync(DEADLINES.loadMs + 1);
    await check;
    expect(worker.terminated).toBe(true);
  });
});
