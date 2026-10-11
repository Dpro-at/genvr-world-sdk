import { describe, expect, it } from 'vitest';
import type { EngineReply } from './script-engine';
import { engineHandler } from './script-worker-handler';

// Third review, R4: the worker started a second call while the first still ran, so the second call's limit (counted
// from its `started`) also paid for the first, and a compile check could time out behind a dry run.

describe('the script worker runs one call at a time', () => {
  it('a call reports started only after the call before it has answered', async () => {
    const posted: EngineReply[] = [];
    let finishFirst: (value: unknown) => void = () => {};
    const first = new Promise((resolve) => (finishFirst = resolve));
    const engine = {
      compileCheck: async () => 'compiled',
      dryRun: async () => first,
    };
    const onMessage = engineHandler(
      (reply) => posted.push(reply),
      async () => engine as never,
    );
    onMessage({ data: { id: 1, op: 'dryRun', input: {} } });
    onMessage({ data: { id: 2, op: 'compile', input: 'genvr.log(1);' } });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(posted).toEqual([{ id: 1, started: true }]);
    finishFirst('replayed');
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(posted).toEqual([
      { id: 1, started: true },
      { id: 1, ok: true, value: 'replayed' },
      { id: 2, started: true },
      { id: 2, ok: true, value: 'compiled' },
    ]);
  });

  it('a failed call answers with its message and the next one still runs', async () => {
    const posted: EngineReply[] = [];
    const engine = {
      compileCheck: async () => 'compiled',
      dryRun: async () => {
        throw new Error('no game');
      },
    };
    const onMessage = engineHandler(
      (reply) => posted.push(reply),
      async () => engine as never,
    );
    onMessage({ data: { id: 1, op: 'dryRun', input: {} } });
    onMessage({ data: { id: 2, op: 'compile', input: 'x' } });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(posted).toContainEqual({ id: 1, ok: false, message: 'no game' });
    expect(posted).toContainEqual({ id: 2, ok: true, value: 'compiled' });
  });
});
