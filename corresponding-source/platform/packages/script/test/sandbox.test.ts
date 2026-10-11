import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createScriptModule,
  SANDBOX_DEFAULTS,
  START_DEFAULTS,
  type ScriptModule,
  type SandboxLimits,
} from '../src/index.js';

let mod: ScriptModule;
beforeAll(async () => {
  mod = await createScriptModule();
});
afterAll(() => mod.dispose());

const limits: SandboxLimits = SANDBOX_DEFAULTS;

describe('ScriptSandbox basics', () => {
  it('runs a classic script', () => {
    const box = mod.newSandbox('basic');
    const result = box.run('1 + 1', limits);
    expect(result.ok).toBe(true);
    expect(result.ticks).toBeGreaterThanOrEqual(0);
    box.dispose();
    expect(box.disposed).toBe(true);
  });

  it('host functions take and return strings', () => {
    const box = mod.newSandbox('host');
    const seen: string[] = [];
    box.defineHost('__read', (arg) => `read:${arg}`);
    box.defineHost('__log', (arg) => {
      seen.push(arg);
      return '';
    });
    expect(box.run(`__log(__read('a'))`, limits).ok).toBe(true);
    expect(seen).toEqual(['read:a']);
    box.dispose();
  });

  it('a host function refuses non-string arguments without touching them', () => {
    const box = mod.newSandbox('host-args');
    const seen: string[] = [];
    box.defineHost('__log', (arg) => {
      seen.push(arg);
      return '';
    });
    const result = box.run(`__log({ toString() { for (;;) {} } })`, limits);
    expect(result).toMatchObject({ ok: false, kind: 'error' });
    expect(seen).toEqual([]);
    box.dispose();
  });

  it('a host exception becomes a script error, not a host crash', () => {
    const box = mod.newSandbox('host-throws');
    box.defineHost('__act', () => {
      throw new Error('secret host detail');
    });
    const result = box.run(`__act('x')`, limits);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe('error');
      expect(result.message).not.toContain('secret host detail');
    }
    box.dispose();
  });

  it('calls a registered handler with a JSON argument and drains its promise jobs', () => {
    const box = mod.newSandbox('handlers');
    const seen: string[] = [];
    box.defineHost('__log', (arg) => {
      seen.push(arg);
      return '';
    });
    expect(
      box.run(
        `__on((e) => { __log('sync ' + e.n); Promise.resolve(e.n + 1).then((v) => __log('job ' + v)); });`,
        START_DEFAULTS,
      ).ok,
    ).toBe(true);
    const result = box.call(0, JSON.stringify({ n: 41 }), limits);
    expect(result.ok).toBe(true);
    expect(seen).toEqual(['sync 41', 'job 42']);
    box.dispose();
  });

  it('calling an unknown handler is an error', () => {
    const box = mod.newSandbox('no-handler');
    expect(box.call(3, '{}', limits)).toMatchObject({ ok: false, kind: 'error' });
    box.dispose();
  });

  it('reports a syntax error with its line', () => {
    const box = mod.newSandbox('syntax');
    const result = box.run('let a = 1;\n\nlet b = (;', limits);
    expect(result).toMatchObject({ ok: false, kind: 'syntax', line: 3 });
    box.dispose();
  });

  it('reports a thrown error with its line', () => {
    const box = mod.newSandbox('throw');
    const result = box.run('let a = 1;\nthrow new Error("boom");', limits);
    expect(result).toMatchObject({ ok: false, kind: 'error', line: 2 });
    if (!result.ok) expect(result.message).toContain('boom');
    box.dispose();
  });

  it('a disposed sandbox refuses to run', () => {
    const box = mod.newSandbox('gone');
    box.dispose();
    expect(box.run('1', limits)).toMatchObject({ ok: false, kind: 'error' });
  });

  it('reports the module size', () => {
    expect(mod.residentBytes()).toBeGreaterThan(0);
  });
});
