import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { SCRIPT_LIMITS } from '@genvr/contracts';
import {
  createScriptModule,
  MODULE_MEMORY,
  prelude,
  PRELUDE_FILE,
  SANDBOX_DEFAULTS,
  START_DEFAULTS,
  type ScriptModule,
} from '../src/index.js';
import { place, script, untilReset } from './support.js';

// Hostile creator code against the whole runner (prelude + API). Each case must leave the session healthy, the
// other scripts running, the host unchanged and the next match clean.

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
/** A well-behaved neighbour script: adds 1 to the global counter g on every 'tap'. */
const neighbour = () =>
  script(`genvr.on('tap', () => genvr.act({ kind: 'add_counter', name: 'g', by: 1 }));`, 'neighbour');
const g = (t: ReturnType<typeof make>) => t.session.view().globalCounters.g;

describe('flooding the API', () => {
  it('1 000 act calls in one handler: 16 accepted, the call stays within its budget', () => {
    const t = make({
      module: mod,
      scripts: [
        script(
          `genvr.on('tap', () => { let ok = 0; for (let i = 0; i < 1000; i++) if (genvr.act({ kind: 'add_counter', name: 'n', by: 1 })) ok++; genvr.log(ok); });`,
        ),
      ],
    });
    t.raise('tap');
    expect(t.counter('n', 'a')).toBe(SCRIPT_LIMITS.actsPerHandler);
    expect(t.texts('log')).toEqual([String(SCRIPT_LIMITS.actsPerHandler)]);
    expect(t.texts('refused')).toEqual([
      `more than ${SCRIPT_LIMITS.actsPerHandler} act or emit calls in one handler`,
    ]);
    expect(t.runner.status()[0]!.strikes).toBe(0);
    // The next handler call has its own 16.
    t.raise('tap');
    expect(t.counter('n', 'a')).toBe(2 * SCRIPT_LIMITS.actsPerHandler);
  });

  it('refusals with creator-made names: one line per reason a match, within the log rate (review finding 3)', () => {
    const t = make({
      module: mod,
      scripts: [
        script(`let i = 0;
genvr.on('tap', () => {
  for (let k = 0; k < 5; k++) {
    i += 1;
    genvr.act({ kind: 'add_counter', name: 'c' + i, by: 1 });
    genvr.act({ kind: 'teleport_to_zone', tag: 't' + i }, null);
    genvr.act({ kind: 'add_counter', name: 'n', by: 1 }, { actor: 'p' + (100 + i) });
  }
});`),
      ],
    });
    for (let n = 0; n < 30; n++) t.raise('tap');
    // 450 refusals, each with a name the creator chose: three lines, one for each kind of refusal.
    const refused = t.texts('refused');
    expect(refused).toHaveLength(3);
    expect(refused[0]).toBe('unknown counter "c1"');
    expect(refused[1]).toBe('no zone tagged "t1"');
    expect(refused[2]).toBe('unknown actor "p101"');
  });

  it('refusal lines count toward the 10 lines a second of genvr.log (review finding 3)', () => {
    const t = make({
      module: mod,
      scripts: [
        script(`genvr.on('tap', () => {
  for (let k = 0; k < 10; k++) genvr.log('line', k);
  genvr.act({ kind: 'add_counter', name: 'nope', by: 1 });
});`),
      ],
    });
    t.raise('tap');
    expect(t.texts('log').filter((text) => text.startsWith('line'))).toHaveLength(10);
    expect(t.texts('refused')).toEqual([]);
    expect(t.texts('log').at(-1)).toBe(`1 line dropped (at most ${SCRIPT_LIMITS.logPerSecond} a second)`);
  });

  it('the prelude sends at most 16 actions and 512 reads a call, then one marker (review finding 7)', () => {
    const box = mod.newSandbox('crossings');
    const acts: string[] = [];
    const reads: string[] = [];
    box.defineHost('__act', (json) => {
      acts.push(json);
      return 'false';
    });
    box.defineHost('__read', (json) => {
      reads.push(json);
      return json.includes('"op":"on"') ? 'true' : 'null';
    });
    box.defineHost('__log', () => '10');
    try {
      expect(box.run(prelude(1), START_DEFAULTS, PRELUDE_FILE).ok).toBe(true);
      const source = `genvr.on('tap', () => { for (let i = 0; i < 1000; i++) { genvr.emit('x'); genvr.phase(); } });`;
      expect(box.run(source, START_DEFAULTS).ok).toBe(true);
      reads.length = 0;
      expect(box.call(1, '{}', { ...SANDBOX_DEFAULTS, ticks: 1000, wallMs: 1000 }).ok).toBe(true);
      expect(acts.filter((json) => json.includes('"a":'))).toHaveLength(SCRIPT_LIMITS.actsPerHandler);
      expect(acts.slice(SCRIPT_LIMITS.actsPerHandler)).toEqual(['{"over":true}']);
      expect(reads.filter((json) => json.includes('"phase"'))).toHaveLength(SCRIPT_LIMITS.readsPerHandler);
      expect(reads.slice(SCRIPT_LIMITS.readsPerHandler)).toEqual(['{"op":"over"}']);
    } finally {
      box.dispose();
    }
  });

  it('a 1 MB act payload is refused without reaching the engine', () => {
    const t = make({
      module: mod,
      scripts: [
        script(
          `genvr.on('tap', () => genvr.log(genvr.act({ kind: 'show_message', text: 'x'.repeat(1e6) })));`,
        ),
      ],
    });
    t.raise('tap');
    expect(t.texts('log')).toEqual(['false']);
    expect(t.texts('refused')).toEqual([`an action over ${SCRIPT_LIMITS.actJsonBytes} bytes`]);
    expect(t.seen.filter((e) => e.type === 'message')).toEqual([]);
  });

  it('a 100 KB read argument is refused before the host parses it (second review)', () => {
    const t = make({
      module: mod,
      scripts: [
        script(`genvr.on('tap', () => {
          const big = 'p'.repeat(1e5);
          genvr.log(genvr.player(big), genvr.counter('g', big), genvr.phase());
        });`),
        neighbour(),
      ],
    });
    t.raise('tap');
    // The big reads answer null; the small one still works.
    expect(t.texts('log')).toEqual(['null null playing']);
    expect(t.texts('refused')).toEqual([`a read over ${SCRIPT_LIMITS.readJsonBytes} bytes`]);
    expect(g(t)).toBe(1);
  });

  it('10 000 log calls give 10 lines and one dropped line, without a strike', () => {
    const t = make({
      module: mod,
      scripts: [
        script(`genvr.on('tap', () => { for (let i = 0; i < 10000; i++) console.log('spam', i); });`),
      ],
    });
    t.raise('tap');
    expect(t.texts('log')).toHaveLength(11);
    expect(t.texts('log')[10]).toBe('9990 lines dropped (at most 10 a second)');
    expect(t.runner.status()[0]!.strikes).toBe(0);
  });

  it('a huge string to log is cut to one line of 200 characters', () => {
    const t = make({ module: mod, scripts: [script(`genvr.on('tap', () => genvr.log('y'.repeat(2e6)));`)] });
    t.raise('tap');
    expect(t.texts('log')[0]!.length).toBeLessThanOrEqual(SCRIPT_LIMITS.logChars);
  });
});

describe('prototype pollution and traps', () => {
  it('a __proto__ key in an action leaves the host unchanged and the action is applied cleanly', () => {
    const t = make({
      module: mod,
      scripts: [
        script(`genvr.on('tap', () => {
          const a = JSON.parse('{"kind":"add_counter","name":"n","by":1,"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}}}');
          genvr.log(genvr.act(a, JSON.parse('{"__proto__":{"actor":"p2"}}')));
        });`),
      ],
    });
    t.raise('tap');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect((Object.prototype as Record<string, unknown>).polluted).toBeUndefined();
    expect(t.texts('log')).toEqual(['true']);
    // The polluted options carried no own actor: the event's actor (p1) got it.
    expect(t.counter('n', 'a')).toBe(1);
    expect(t.counter('n', 'b')).toBe(0);
    expect(t.requests[0]!.action).toEqual({ kind: 'add_counter', name: 'n', by: 1, who: 'actor' });
  });

  it('polluting the script’s own prototypes and JSON does not break genvr or reach the host', () => {
    const t = make({
      module: mod,
      scripts: [
        script(`Object.prototype.polluted = 1; Array.prototype.push = () => 0; Array.prototype.join = () => 'x';
                JSON.stringify = () => '{"a":{"kind":"end_match","winner":"nobody"}}'; JSON.parse = () => true;
                String.prototype.slice = () => ''; Reflect.apply = () => 0;
                genvr.on('tap', () => genvr.log(genvr.act({ kind: 'add_counter', name: 'n', by: 4 }), 'ok'));`),
      ],
    });
    t.raise('tap');
    expect(t.counter('n', 'a')).toBe(4);
    expect(t.session.view().phase).toBe('playing');
    expect(t.texts('log')).toEqual(['true ok']);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('a Proxy or a getter trap as an action only spends the script’s own budget', () => {
    const t = make({
      module: mod,
      scripts: [
        script(`genvr.on('tap', () => genvr.act(new Proxy({}, { get() { for (;;) {} }, ownKeys() { for (;;) {} } })));
                genvr.on('tap2', () => genvr.act({ kind: 'add_counter', name: 'n', get by() { for (;;) {} } }));
                genvr.on('tap3', () => genvr.act({ toJSON() { return { kind: 'add_counter', name: 'n', by: 2 }; } }));`),
        neighbour(),
      ],
    });
    t.raise('tap');
    t.raise('tap2');
    t.raise('tap3');
    expect(t.texts('strike')).toHaveLength(2);
    expect(t.counter('n', 'a')).toBe(2);
    expect(g(t)).toBe(1);
  });

  it('non-string arguments to reads never run creator code on the host', () => {
    const t = make({
      module: mod,
      scripts: [
        script(`genvr.on('tap', () => {
          const evil = { toString() { for (;;) {} }, valueOf() { for (;;) {} } };
          genvr.log(genvr.player(evil), genvr.counter(evil, evil), genvr.zones(evil).length);
        });`),
      ],
    });
    t.raise('tap');
    expect(t.texts('log')).toEqual(['null null 0']);
  });

  it('genvr and console are frozen and cannot be replaced', () => {
    const t = make({
      module: mod,
      scripts: [
        script(`genvr.on('tap', () => {
          try { genvr.act = () => true; } catch (e) {}
          try { globalThis.genvr = { act: () => true }; } catch (e) {}
          try { delete globalThis.genvr; } catch (e) {}
          try { Math.random = () => 0.5; } catch (e) {}
          genvr.log(Object.isFrozen(genvr), Object.isFrozen(console), genvr.act({ kind: 'add_counter', name: 'nope', by: 1 }), Math.random() !== 0.5);
        });`),
      ],
    });
    t.raise('tap');
    expect(t.texts('log')).toEqual(['true true false true']);
  });
});

describe('no way out', () => {
  it('the host functions are gone after the prelude', () => {
    const t = make({
      module: mod,
      scripts: [
        script(
          `genvr.log(typeof globalThis.__act, typeof __read, typeof __log, typeof __on, Object.getOwnPropertyNames(globalThis).filter((n) => n.startsWith('__')).join('|') || 'none');`,
        ),
      ],
      noStart: true,
    });
    expect(t.texts('log')).toEqual(['undefined undefined undefined undefined none']);
  });

  it('eval, Function and every function constructor are gone or throw', () => {
    const probes = [
      `eval('1')`,
      `(0, eval)('1')`,
      `globalThis['ev' + 'al']('1')`,
      `Function('return this')()`,
      `(() => {}).constructor('return globalThis')()`,
      `(function () {}).constructor.constructor('return 1')()`,
      `(async () => {}).constructor('return 1')`,
      `(function* () {}).constructor('yield 1')`,
      `(async function* () {}).constructor('yield 1')`,
      `Object.getPrototypeOf(function () {}).constructor('return 1')`,
      `Reflect.construct(Object.getPrototypeOf(() => {}).constructor, ['return 1'])`,
      `new (genvr.log.constructor)('return 1')`,
    ];
    const t = make({
      module: mod,
      scripts: [
        script(`const out = [];
          for (const p of ${JSON.stringify(probes)}) {
            try { out.push(typeof p); } catch (e) {}
          }
          const results = [
            ${probes.map((p) => `(() => { try { ${p}; return 'ran'; } catch (e) { return e.name; } })()`).join(',\n')}
          ];
          genvr.log(results.join(','));`),
      ],
      noStart: true,
    });
    const results = t.texts('log')[0]!.split(',');
    expect(results).toHaveLength(probes.length);
    expect(results.filter((r) => r === 'ran')).toEqual([]);
  });

  it('import() rejects, a static import does not compile, and require/process do not exist', () => {
    const t = make({
      module: mod,
      scripts: [
        script(`genvr.on('tap', () => {
          import('fs').then(() => genvr.log('loaded'), () => genvr.log('refused'));
          genvr.log(typeof require, typeof process, typeof module, typeof Buffer, typeof fetch, typeof WebAssembly);
        });`),
        script(`import x from 'y';`, 'static'),
      ],
    });
    t.raise('tap');
    expect(t.texts('log')).toEqual([
      'undefined undefined undefined undefined undefined undefined',
      'refused',
    ]);
    expect(t.runner.status()[1]!.state).toBe('not_compiled');
  });

  it('one script cannot read another script’s globals', () => {
    const t = make({
      module: mod,
      scripts: [
        script(`var secret = 'abc'; globalThis.shared = 1; Object.prototype.leak = 1;`),
        script(`genvr.log(typeof secret, typeof shared, typeof ({}).leak);`),
      ],
      noStart: true,
    });
    expect(t.texts('log')).toEqual(['undefined undefined undefined']);
  });

  it('a script never sees an account id, a name or a position', () => {
    const ids = ['acct-1f2e3d4c5b', 'acct-9a8b7c6d5e'];
    const t = make({
      module: mod,
      players: ids,
      scripts: [
        script(`const seen = [];
          for (const n of ['zone_crossed', 'zone_entered', 'player_joined', 'hit', 'died', 'tap', 'mounted'])
            genvr.on(n, (e) => seen.push(JSON.stringify(e)));
          genvr.on('dump', () => {
            seen.push(JSON.stringify(genvr.players()), JSON.stringify(genvr.players().map((h) => genvr.player(h))),
              JSON.stringify(genvr.zones()), Object.getOwnPropertyNames(globalThis).join(','));
            for (const s of seen) for (let i = 0; i < s.length; i += 190) genvr.log(s.slice(i, i + 190));
          });`),
      ],
    });
    t.cross(ids[0]);
    t.session.damage(ids[1]!, 10, ids[0]!, t.now());
    t.session.mount(ids[0]!, 'item-1', 'board', 1, t.now());
    t.raise('tap', ids[1]!);
    t.tick(1000);
    t.raise('dump', ids[0]!);
    const all = JSON.stringify(t.texts()) + JSON.stringify(t.runner.recording()) + JSON.stringify(t.requests);
    expect(all).not.toContain('acct-');
    expect(all).not.toMatch(/"(x|y|z|at|position|name)":-?\d/);
    expect(t.texts('log').length).toBeGreaterThan(3);
  });
});

describe('CPU', () => {
  it('while(true){} at the top level leaves the script off for the match and the neighbour running', () => {
    const t = make({ module: mod, scripts: [script(`while (true) {}`, 'spinner'), neighbour()] });
    t.raise('tap');
    expect(t.runner.status().map((s) => s.state)).toEqual(['off', 'running']);
    expect(t.logs.find((l) => l.script === 'spinner')!.text).toContain('over its budget');
    expect(g(t)).toBe(1);
  });

  it('an endless loop in a promise job is a strike of that handler', () => {
    const t = make({
      module: mod,
      scripts: [
        script(`genvr.on('tap', () => { Promise.resolve().then(() => { for (;;) {} }); });`),
        neighbour(),
      ],
    });
    t.raise('tap');
    expect(t.texts('strike')).toHaveLength(1);
    expect(g(t)).toBe(1);
  });

  it('catastrophic regex backtracking and a hostile sort comparator are strikes, not stalls', () => {
    const t = make({
      module: mod,
      scripts: [
        script(`genvr.on('tap', () => /(a+)+$/.test('a'.repeat(30) + 'b'));
                genvr.on('tap', () => { const a = Array.from({ length: 5000 }, (_, i) => i); a.sort(() => { for (let i = 0; i < 1e4; i++); return 1; }); });`),
        neighbour(),
      ],
    });
    const start = performance.now();
    t.raise('tap');
    expect(performance.now() - start).toBeLessThan(SCRIPT_LIMITS.watchdogMs);
    expect(t.texts('strike')).toHaveLength(2);
    expect(g(t)).toBe(1);
  });

  it('native code that never polls the interrupt is a strike once it returns', () => {
    const t = make({
      module: mod,
      // The default sort compares as strings and never polls: about 10-20 ms for 40 000 numbers on the dev machine
      // (100 000 took 30 ms when measured and over the 50 ms watchdog on a loaded machine).
      scripts: [
        script(
          `const big = Array.from({ length: 4e4 }, (_, i) => (i * 7919) % 4e4); genvr.on('tap', () => { big.slice().sort(); });`,
        ),
        neighbour(),
      ],
    });
    t.raise('tap');
    expect(t.texts('strike')).toEqual(['strike 1 of 3: a handler went over its budget (5 ms)']);
    // Its time also counts toward its 25 ms a second: the next call is skipped (a second strike).
    t.raise('tap');
    expect(t.texts('strike')).toHaveLength(2);
    expect(g(t)).toBe(2);
  });

  it('deep recursion is an error, and the script goes on', () => {
    const t = make({
      module: mod,
      scripts: [
        script(
          `function f(n) { return f(n + 1) + 1; }\ngenvr.on('tap', () => f(0));\ngenvr.on('tap2', () => genvr.log('alive'));`,
        ),
      ],
    });
    t.raise('tap');
    t.raise('tap2');
    expect(t.texts('error')).toHaveLength(1);
    expect(t.texts('log')).toEqual(['alive']);
  });
});

describe('memory', () => {
  it('a memory bomb in a handler switches that script off; the neighbour and the next match are fine', async () => {
    const fresh = await createScriptModule();
    const t = make({
      module: fresh,
      scripts: [script(`genvr.on('tap', () => { const a = new Array(3e6).fill(1); });`, 'bomb'), neighbour()],
    });
    t.raise('tap');
    expect(t.runner.status().map((s) => s.state)).toEqual(['off', 'running']);
    expect(t.logs.find((l) => l.level === 'off')!.text).toContain('out of memory');
    t.raise('tap');
    expect(g(t)).toBe(2);
    untilReset(t);
    expect(t.runner.status().map((s) => s.state)).toEqual(['running', 'running']);
    expect(fresh.residentBytes()).toBeLessThanOrEqual(MODULE_MEMORY.maximumBytes);
    t.dispose();
    fresh.dispose();
  });

  it('an allocation loop in a handler is stopped by its budget, and three of them switch the script off', () => {
    const t = make({
      module: mod,
      scripts: [
        script(
          `genvr.on('tap', () => { const a = []; for (;;) a.push({ a: 1, b: [1, 2, 3], c: 'x'.repeat(64) }); });`,
        ),
        neighbour(),
      ],
    });
    for (let i = 0; i < 4; i++) t.raise('tap');
    expect(t.runner.status().map((s) => s.state)).toEqual(['off', 'running']);
    expect(g(t)).toBe(4);
  });

  it('a huge string is refused inside the script', () => {
    const t = make({
      module: mod,
      scripts: [script(`genvr.on('tap', () => 'x'.repeat(1e9).length);`), neighbour()],
    });
    t.raise('tap');
    const line = t.logs.find((l) => l.level === 'error' || l.level === 'off');
    expect(line).toBeDefined();
    expect(g(t)).toBe(1);
  });

  it('growing the module past its soft size switches the script off (the 32 MiB guard stays in force)', async () => {
    const fresh = await createScriptModule();
    const t = make({
      module: fresh,
      // String bytes are not counted by QuickJS's own limit in this build; the module's growth is. The neighbour is
      // listed first: a top level this costly also uses the place's start budget, so nothing listed after it starts.
      scripts: [
        neighbour(),
        script(
          `const keep = []; for (let i = 0; i < 6; i++) keep.push(String.fromCharCode(65 + i).repeat(4e6));`,
          'grower',
        ),
      ],
    });
    t.raise('tap');
    expect(t.runner.status()[1]!.state).toBe('off');
    expect(t.logs.find((l) => l.script === 'grower')!.text).toContain('out of memory');
    expect(t.runner.status()[0]!.state).toBe('running');
    expect(fresh.residentBytes()).toBeLessThanOrEqual(MODULE_MEMORY.maximumBytes);
    t.dispose();
    fresh.dispose();
  });

  it('an object-heavy heap is caught by the periodic real-heap check', async () => {
    const fresh = await createScriptModule();
    // Grow the module once and free it, so the next allocations reuse memory without growing it.
    const warm = fresh.newSandbox('warm');
    warm.run('globalThis.k = []; for (let i = 0; i < 6; i++) k.push("z".repeat(3e6) + i); k = null;', {
      memoryBytes: 4 * 2 ** 20,
      stackBytes: 256 * 2 ** 10,
      ticks: 1e6,
      wallMs: 2000,
    });
    if (!warm.disposed) warm.dispose();
    const t = make({
      module: fresh,
      scripts: [
        script(
          `const keep = []; genvr.on('tap', () => { for (let i = 0; i < 3000; i++) keep.push({ i, j: [i] }); });`,
          'hoarder',
        ),
      ],
    });
    for (let i = 0; i < 200 && t.runner.status()[0]!.state === 'running'; i++) t.raise('tap');
    expect(t.runner.status()[0]!.state).toBe('off');
    expect(t.logs.find((l) => l.level === 'off')!.text).toContain('out of memory');
    t.dispose();
    fresh.dispose();
  });
});
