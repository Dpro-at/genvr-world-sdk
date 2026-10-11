import { writeFileSync } from 'node:fs';
import { createScriptModule, SANDBOX_DEFAULTS, START_DEFAULTS } from '../src/index.js';

// Measurements for spec 5.1 and 5.4 (not a gate, not part of `test`): `pnpm --filter @genvr/script bench`.
// Prints the numbers and writes `measure.json` next to the package (git-ignored).

const limits = SANDBOX_DEFAULTS;

/** Work between interrupt polls differs per workload, so a tick costs differently. */
const WORKLOADS: Record<string, string> = {
  'empty loop': 'let i = 0; for (;;) i++;',
  'arithmetic loop': 'let s = 0; for (let i = 0; ; i++) s = (s + i * 31) % 1000003;',
  'function calls': 'function f(x) { return x + 1; } let s = 0; for (;;) s = f(s);',
  'object churn': 'let o; for (let i = 0; ; i++) o = { i, a: [i, i] };',
  'string concat': 'let s = ""; for (let i = 0; ; i++) s = (s + i).slice(-50);',
  'regex backtracking': `/(a+)+$/.test('a'.repeat(40) + 'b');`,
  'sort comparator':
    'const a = Array.from({ length: 2000 }, (_, i) => (i * 7919) % 2000); for (;;) a.slice().sort((x, y) => x - y);',
};

async function tickCosts() {
  const mod = await createScriptModule();
  const rows: Record<string, { ticks: number; ms: number; msPerTick: number }> = {};
  for (const [name, source] of Object.entries(WORKLOADS)) {
    // Warm up once (the WASM code tiers up), then measure 1000 ticks with a generous wall budget.
    for (const ticks of [200, 1000]) {
      const box = mod.newSandbox(name);
      const result = box.run(source, { ...limits, ticks, wallMs: 10_000 });
      box.dispose();
      if (ticks === 1000)
        rows[name] = { ticks: result.ticks, ms: result.ms, msPerTick: result.ms / result.ticks };
    }
  }
  // How many loop iterations one tick is.
  const box = mod.newSandbox('polls');
  const seen: string[] = [];
  box.defineHost('__log', (arg) => {
    seen.push(arg);
    return '';
  });
  box.run(
    '__on(() => { let i = 0; try { for (;;) { i++; if ((i & 1023) === 0) __log(String(i)); } } finally {} });',
    START_DEFAULTS,
  );
  const counted = box.call(0, '{}', { ...limits, ticks: 100, wallMs: 10_000 });
  const iterationsPerTick = Number(seen.at(-1) ?? 0) / Math.max(1, counted.ticks);
  box.dispose();
  mod.dispose();
  return { rows, iterationsPerTick };
}

async function moduleCosts() {
  const rssBefore = process.memoryUsage().rss;
  const modules = [];
  const created: number[] = [];
  for (let i = 0; i < 10; i++) {
    const start = performance.now();
    modules.push(await createScriptModule());
    created.push(performance.now() - start);
  }
  const rssPerModule = (process.memoryUsage().rss - rssBefore) / modules.length;
  const mod = modules[0]!;
  const resident = mod.residentBytes();
  const sandboxes = [];
  const boxStart = performance.now();
  for (let i = 0; i < 50; i++) sandboxes.push(mod.newSandbox(`s${i}`));
  const sandboxMs = (performance.now() - boxStart) / 50;
  const residentAfter50 = mod.residentBytes();
  const rssBeforeRun = process.memoryUsage().rss;
  for (const box of sandboxes)
    box.run('globalThis.state = { n: 0, list: [] }; __on((e) => { state.n += 1; });', START_DEFAULTS);
  const callStart = performance.now();
  let calls = 0;
  for (let round = 0; round < 200; round++) {
    for (const box of sandboxes) {
      box.call(0, '{"type":"zone_crossed","actor":"p1","id":"p1","zone":"z1","tag":"line"}', limits);
      calls += 1;
    }
  }
  const callMs = (performance.now() - callStart) / calls;
  const disposeStart = performance.now();
  for (const box of sandboxes) box.dispose();
  const disposeMs = (performance.now() - disposeStart) / sandboxes.length;
  for (const m of modules) m.dispose();
  return {
    moduleCreateMs: created,
    moduleResidentBytes: resident,
    moduleRssBytesPerModule: rssPerModule,
    sandboxCreateMs: sandboxMs,
    sandboxBytesEach: (residentAfter50 - resident) / 50,
    rssAfterSandboxesBytes: process.memoryUsage().rss - rssBeforeRun,
    callOverheadMs: callMs,
    sandboxDisposeMs: disposeMs,
  };
}

function perOp(label: string, n: number, fn: () => void): [string, number] {
  for (let i = 0; i < Math.min(100, n); i++) fn();
  const start = performance.now();
  for (let i = 0; i < n; i++) fn();
  return [label, (performance.now() - start) / n];
}

async function opCosts() {
  const mod = await createScriptModule();
  const box = mod.newSandbox('bench');
  box.run('__on(() => {});', START_DEFAULTS);
  const rows = Object.fromEntries([
    perOp('call an empty handler (ms)', 20_000, () => box.call(0, '{}', limits)),
    perOp('create and dispose a sandbox (ms)', 500, () => mod.newSandbox('x').dispose()),
    perOp('create, run a small top level, dispose (ms)', 500, () => {
      const b = mod.newSandbox('y');
      b.run('const handlers = []; for (let i = 0; i < 10; i++) handlers.push(() => i);', START_DEFAULTS);
      b.dispose();
    }),
  ]);
  mod.dispose();
  return rows;
}

const ticks = await tickCosts();
const modules = await moduleCosts();
const ops = await opCosts();
const report = { measuredAt: new Date().toISOString(), node: process.version, ticks, modules, ops };
writeFileSync(new URL('../measure.json', import.meta.url), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
