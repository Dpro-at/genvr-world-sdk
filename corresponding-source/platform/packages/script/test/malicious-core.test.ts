import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createScriptModule,
  HEAP_CHECK_EVERY,
  MODULE_MEMORY,
  SANDBOX_DEFAULTS,
  START_DEFAULTS,
  type ScriptModule,
} from '../src/index.js';

// Hostile creator code against the bare sandbox (no prelude yet; the prelude's removals are tested in Task 4).
// Each case must end within its budget and leave the module able to run the next script.

let mod: ScriptModule;
beforeAll(async () => {
  mod = await createScriptModule();
});
afterAll(() => mod.dispose());

const limits = SANDBOX_DEFAULTS;
/** Slack for timer resolution and the last tick in flight (spec: overrun within wallMs + 5 ms). */
const SLACK_MS = 5;

function expectHealthy() {
  const box = mod.newSandbox('after');
  expect(box.run('let x = [1, 2, 3].map((v) => v * 2); x.length', limits).ok).toBe(true);
  box.dispose();
}

describe('CPU', () => {
  it('while(true){} at the top level is an overrun, and the sandbox runs the next call', () => {
    const box = mod.newSandbox('loop');
    const result = box.run('while (true) {}', limits);
    expect(result).toMatchObject({ ok: false, kind: 'overrun' });
    expect(result.ms).toBeLessThanOrEqual(limits.wallMs + SLACK_MS);
    expect(box.disposed).toBe(false);
    expect(box.run('1 + 1', limits).ok).toBe(true);
    box.dispose();
  });

  it('an overrun cannot be caught by the script', () => {
    const box = mod.newSandbox('catch-loop');
    let logged = false;
    box.defineHost('__log', () => {
      logged = true;
      return '';
    });
    const result = box.run('try { for (;;) {} } catch (e) { __log("caught"); for (;;) {} }', limits);
    expect(result).toMatchObject({ ok: false, kind: 'overrun' });
    expect(logged).toBe(false);
    box.dispose();
  });

  it('an endless loop inside a handler is an overrun within the handler budget', () => {
    const box = mod.newSandbox('handler-loop');
    expect(box.run('__on(() => { for (;;) {} })', START_DEFAULTS).ok).toBe(true);
    const result = box.call(0, '{}', limits);
    expect(result).toMatchObject({ ok: false, kind: 'overrun' });
    expect(result.ms).toBeLessThanOrEqual(limits.wallMs + SLACK_MS);
    expect(box.call(0, '{}', limits)).toMatchObject({ ok: false, kind: 'overrun' });
    box.dispose();
  });

  it('an endless loop inside a promise job is an overrun of the same call', () => {
    const box = mod.newSandbox('job-loop');
    expect(box.run('__on(() => { Promise.resolve().then(() => { for (;;) {} }); })', START_DEFAULTS).ok).toBe(
      true,
    );
    const result = box.call(0, '{}', limits);
    expect(result).toMatchObject({ ok: false, kind: 'overrun' });
    expect(result.ms).toBeLessThanOrEqual(limits.wallMs + SLACK_MS);
    box.dispose();
  });

  it('an endless chain of promise jobs is an overrun', () => {
    const box = mod.newSandbox('job-chain');
    const result = box.run('const again = () => Promise.resolve().then(again); again();', limits);
    // The jobs left after the overrun get one more budget to settle (review finding 7); they never do, so the
    // sandbox ends instead of leaving them for the next call.
    expect(result).toMatchObject({
      ok: false,
      kind: 'overrun',
      message: 'its promise jobs did not finish within the budget',
    });
    expect(result.ms).toBeLessThanOrEqual(2 * limits.wallMs + SLACK_MS);
    expect(box.disposed).toBe(true);
  });

  it('catastrophic regex backtracking ends within the wall budget', () => {
    const box = mod.newSandbox('regex');
    const result = box.run(`/(a+)+$/.test('a'.repeat(30) + 'b')`, limits);
    expect(result).toMatchObject({ ok: false, kind: 'overrun' });
    expect(result.ms).toBeLessThanOrEqual(limits.wallMs + SLACK_MS);
    box.dispose();
    expectHealthy();
  });

  it('a hostile sort comparator ends within the wall budget', () => {
    const box = mod.newSandbox('sort');
    const result = box.run(
      `const a = Array.from({ length: 5000 }, (_, i) => i);
       a.sort(() => { let s = 0; for (let i = 0; i < 1e6; i++) s += i; return Math.random() - 0.5; });`,
      limits,
    );
    expect(result).toMatchObject({ ok: false, kind: 'overrun' });
    expect(result.ms).toBeLessThanOrEqual(limits.wallMs + SLACK_MS);
    box.dispose();
  });
});

describe('memory and stack', () => {
  it('a memory bomb is reported, the sandbox is disposed and the module still works', () => {
    const box = mod.newSandbox('bomb');
    const result = box.run('const a = []; for (;;) a.push({ a: 1, b: [1, 2, 3], c: "x".repeat(64) });', {
      ...limits,
      wallMs: 1000,
      ticks: 1_000_000,
    });
    expect(result).toMatchObject({ ok: false, kind: 'memory' });
    expect(box.disposed).toBe(true);
    expectHealthy();
  });

  it('a huge string is refused', () => {
    const box = mod.newSandbox('huge-string');
    const result = box.run(`'x'.repeat(1e9).length`, limits);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(['memory', 'error']).toContain(result.kind);
    expectHealthy();
    if (!box.disposed) box.dispose();
  });

  it('doubling a string until it breaks ends in memory or error, not a host crash', () => {
    const box = mod.newSandbox('doubling');
    const result = box.run(`let s = 'x'; for (;;) s = s + s;`, limits);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(['memory', 'error']).toContain(result.kind);
    expectHealthy();
    if (!box.disposed) box.dispose();
  });

  it('deeply nested objects hit the memory limit', () => {
    const box = mod.newSandbox('nested');
    const result = box.run(`let o = {}; for (;;) o = { o, pad: [1, 2, 3, 4, 5, 6, 7, 8] };`, {
      ...limits,
      wallMs: 1000,
      ticks: 1_000_000,
    });
    expect(result).toMatchObject({ ok: false, kind: 'memory' });
    expectHealthy();
  });

  it('deep recursion is an error, and the sandbox goes on', () => {
    const box = mod.newSandbox('recursion');
    const result = box.run('function f(n) { return f(n + 1) + 1; } f(0);', limits);
    expect(result).toMatchObject({ ok: false, kind: 'error' });
    expect(box.disposed).toBe(false);
    expect(box.run('1', limits).ok).toBe(true);
    box.dispose();
  });

  it('a huge string to a host function reaches it only as a string within the heap limit', () => {
    const box = mod.newSandbox('huge-log');
    let length = 0;
    box.defineHost('__log', (arg) => {
      length = arg.length;
      return '';
    });
    const result = box.run(`__log('y'.repeat(1_000_000))`, limits);
    expect(result.ok).toBe(true);
    expect(length).toBe(1_000_000);
    box.dispose();
  });
});

describe('no way out', () => {
  it('has no require, process, module loader or host objects', () => {
    const box = mod.newSandbox('globals');
    let out = '';
    box.defineHost('__log', (arg) => {
      out = arg;
      return '';
    });
    const names = [
      'require',
      'process',
      'module',
      'exports',
      'Buffer',
      'fetch',
      'XMLHttpRequest',
      'WebSocket',
      'importScripts',
      'std',
      'os',
      'setTimeout',
      'setInterval',
      'window',
      'document',
      'navigator',
      'WebAssembly',
      'global',
    ];
    expect(
      box.run(`__log(JSON.stringify(${JSON.stringify(names)}.map((n) => typeof globalThis[n])))`, limits).ok,
    ).toBe(true);
    expect(JSON.parse(out)).toEqual(names.map(() => 'undefined'));
    box.dispose();
  });

  it('static import is a syntax error', () => {
    const box = mod.newSandbox('import');
    expect(box.run(`import x from 'y';`, limits)).toMatchObject({ ok: false, kind: 'syntax' });
    box.dispose();
  });

  it('dynamic import never loads anything', () => {
    const box = mod.newSandbox('dynamic-import');
    const seen: string[] = [];
    box.defineHost('__log', (arg) => {
      seen.push(arg);
      return '';
    });
    const result = box.run(
      `import('x').then(() => __log('loaded'), (e) => __log('refused'));
       import('data:text/javascript,1').then(() => __log('loaded'), (e) => __log('refused'));`,
      limits,
    );
    expect(result.ok).toBe(true);
    expect(seen).toEqual(['refused', 'refused']);
    box.dispose();
  });

  it('eval and Function reach only the sandbox global', () => {
    const box = mod.newSandbox('eval');
    let out = '';
    box.defineHost('__log', (arg) => {
      out = arg;
      return '';
    });
    expect(
      box.run(
        `const g1 = Function('return this')();
         const g2 = (() => {}).constructor('return globalThis')();
         const g3 = eval('globalThis');
         __log([typeof g1.process, typeof g2.require, typeof g3.process, g1 === globalThis, g3 === globalThis].join(','));`,
        limits,
      ).ok,
    ).toBe(true);
    expect(out).toBe('undefined,undefined,undefined,true,true');
    box.dispose();
  });

  it('a host function exposes no host object', () => {
    const box = mod.newSandbox('host-shape');
    let out = '';
    box.defineHost('__log', (arg) => {
      out = arg;
      return '';
    });
    expect(
      box.run(
        `const f = __log;
         const ctor = f.constructor;
         __log([ctor === Function, ctor('return typeof process')(), Object.getOwnPropertyNames(f).sort().join('|')].join(','));`,
        limits,
      ).ok,
    ).toBe(true);
    expect(out).toBe('true,undefined,length|name');
    box.dispose();
  });

  it('prototype pollution stays inside one sandbox', () => {
    const a = mod.newSandbox('polluter');
    const b = mod.newSandbox('neighbour');
    let out = '';
    b.defineHost('__log', (arg) => {
      out = arg;
      return '';
    });
    expect(
      a.run(
        `Object.prototype.polluted = 1; Array.prototype.push = () => 0; JSON.parse = () => ({ evil: true });
         Object.defineProperty(Object.prototype, '__proto__', { get() { for (;;) {} } });`,
        limits,
      ).ok,
    ).toBe(true);
    expect(
      b.run(
        `__log(String(({}).polluted) + ',' + [1].concat([2]).length + ',' + JSON.parse('{"a":1}').a)`,
        limits,
      ).ok,
    ).toBe(true);
    expect(out).toBe('undefined,2,1');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    a.dispose();
    b.dispose();
  });

  it('a polluted JSON.parse does not change what a handler receives', () => {
    const box = mod.newSandbox('json');
    let out = '';
    box.defineHost('__log', (arg) => {
      out = arg;
      return '';
    });
    expect(
      box.run(`JSON.parse = () => ({ n: -1 }); __on((e) => __log(String(e.n)));`, START_DEFAULTS).ok,
    ).toBe(true);
    expect(box.call(0, '{"n":7}', limits).ok).toBe(true);
    expect(out).toBe('7');
    box.dispose();
  });

  it('two sandboxes do not see each other’s globals', () => {
    const a = mod.newSandbox('a');
    const b = mod.newSandbox('b');
    let out = '';
    b.defineHost('__log', (arg) => {
      out = arg;
      return '';
    });
    expect(a.run('var secret = 42; globalThis.shared = 1;', limits).ok).toBe(true);
    expect(b.run('__log(typeof secret + typeof shared)', limits).ok).toBe(true);
    expect(out).toBe('undefinedundefined');
    a.dispose();
    b.dispose();
  });

  it('a thrown value with a getter trap does not hang the host', () => {
    const box = mod.newSandbox('getter');
    const result = box.run(
      `throw { get message() { for (;;) {} }, get stack() { for (;;) {} }, get name() { for (;;) {} } };`,
      limits,
    );
    expect(result.ok).toBe(false);
    expect(result.ms).toBeLessThanOrEqual(limits.wallMs * 2 + SLACK_MS);
    box.dispose();
  });

  it('a thrown Proxy does not hang the host', () => {
    const box = mod.newSandbox('proxy');
    const result = box.run(
      `throw new Proxy({}, { get() { for (;;) {} }, has() { for (;;) {} }, ownKeys() { for (;;) {} }, getPrototypeOf() { for (;;) {} } });`,
      limits,
    );
    expect(result.ok).toBe(false);
    expect(result.ms).toBeLessThanOrEqual(limits.wallMs * 2 + SLACK_MS);
    box.dispose();
  });

  it('a Proxy passed to a host function is refused without running its traps', () => {
    const box = mod.newSandbox('proxy-arg');
    let called = false;
    box.defineHost('__act', () => {
      called = true;
      return '';
    });
    const result = box.run(`__act(new Proxy({}, { get() { for (;;) {} } }))`, limits);
    expect(result).toMatchObject({ ok: false, kind: 'error' });
    expect(called).toBe(false);
    expect(result.ms).toBeLessThanOrEqual(limits.wallMs + SLACK_MS);
    box.dispose();
  });

  it('a handler cannot reach the handler table', () => {
    const box = mod.newSandbox('table');
    let out = '';
    box.defineHost('__log', (arg) => {
      out = arg;
      return '';
    });
    expect(
      box.run(
        `const h = __on(() => __log('first'));
         Array.prototype[1] = () => __log('planted');
         Object.prototype[1] = () => __log('planted');
         __log(String(h));`,
        START_DEFAULTS,
      ).ok,
    ).toBe(true);
    expect(out).toBe('0');
    expect(box.call(1, '{}', limits)).toMatchObject({ ok: false, kind: 'error' });
    expect(out).toBe('0');
    box.dispose();
  });
});

describe('the module memory cap', () => {
  it('many large strings stop at the module cap, not at host memory', () => {
    const box = mod.newSandbox('big-strings');
    const result = box.run(
      'const a = []; for (let i = 0; i < 400; i++) a.push("x".repeat(3e6) + i); a.length',
      {
        ...limits,
        wallMs: 2000,
        ticks: 1_000_000,
      },
    );
    expect(result).toMatchObject({ ok: false, kind: 'memory' });
    expect(box.disposed).toBe(true);
    expect(mod.residentBytes()).toBeLessThanOrEqual(MODULE_MEMORY.maximumBytes);
    expectHealthy();
  });

  it('a script that grows the module past its soft size is switched off, and the module goes on', async () => {
    const fresh = await createScriptModule();
    const box = fresh.newSandbox('few-big');
    const result = box.run(
      'globalThis.keep = []; for (let i = 0; i < 10; i++) keep.push("y".repeat(3e6) + i);',
      {
        ...limits,
        wallMs: 2000,
        ticks: 1_000_000,
      },
    );
    expect(result).toMatchObject({ ok: false, kind: 'memory' });
    expect(box.disposed).toBe(true);
    const next = fresh.newSandbox('next');
    expect(next.run('1 + 1', limits).ok).toBe(true);
    fresh.dispose();
  });

  it('an object-heavy heap in reused module memory is switched off within HEAP_CHECK_EVERY calls', () => {
    // The module already grew to its cap in an earlier test, so these allocations reuse freed memory.
    const box = mod.newSandbox('reuse');
    expect(
      box.run(
        '__on(() => { globalThis.keep = []; for (let i = 0; i < 120000; i++) keep.push({ i }); });',
        START_DEFAULTS,
      ).ok,
    ).toBe(true);
    let result = box.call(0, '{}', { ...limits, wallMs: 2000, ticks: 1_000_000 });
    for (let i = 0; i < HEAP_CHECK_EVERY && result.ok; i++)
      result = box.call(0, '{}', { ...limits, wallMs: 2000, ticks: 1_000_000 });
    expect(result).toMatchObject({ ok: false, kind: 'memory' });
    expect(box.disposed).toBe(true);
    expectHealthy();
  });
});
