import { createScriptModule, SANDBOX_DEFAULTS, type ScriptModule } from '../src/index.js';
import { createWorkerScriptModule } from '../src/node.js';

// The cost of a worker module (review finding 1, spec 5.1): one handler call through the worker's synchronous
// round trip against the same call in-process. Not a gate, not part of `test`:
// `pnpm --filter @genvr/script exec tsx test/worker.bench.ts`.

const HANDLERS: Record<string, string> = {
  'empty handler': `__on(() => {});`,
  'one host call': `const act = __act; __on(() => { act('{}'); });`,
  'four host calls': `const act = __act; __on(() => { act('{}'); act('{}'); act('{}'); act('{}'); });`,
};
const CALLS = 2000;

function percentile(sorted: number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]!;
}

function measure(module: ScriptModule, source: string): { median: number; p99: number; mean: number } {
  const box = module.newSandbox('bench');
  box.defineHost('__act', () => 'true');
  const ran = box.run(source, { ...SANDBOX_DEFAULTS, wallMs: 1000, ticks: 1000 });
  if (!ran.ok) throw new Error(`setup failed: ${ran.message}`);
  const times: number[] = [];
  for (let i = 0; i < CALLS + 200; i++) {
    const start = performance.now();
    const result = box.call(0, '{"type":"custom","name":"tap"}', SANDBOX_DEFAULTS);
    const ms = performance.now() - start;
    if (!result.ok) throw new Error(`call failed: ${result.message}`);
    if (i >= 200) times.push(ms);
  }
  box.dispose();
  times.sort((a, b) => a - b);
  return {
    median: percentile(times, 0.5),
    p99: percentile(times, 0.99),
    mean: times.reduce((a, b) => a + b, 0) / times.length,
  };
}

const inProcess = await createScriptModule();
const bootStart = performance.now();
const worker = await createWorkerScriptModule();
const bootMs = performance.now() - bootStart;
const round = (n: number) => Math.round(n * 1000) / 1000;
console.log(`worker start: ${round(bootMs)} ms (first; compiles the WebAssembly code once per process)`);
for (const [name, source] of Object.entries(HANDLERS)) {
  const a = measure(inProcess, source);
  const b = measure(worker, source);
  console.log(
    `${name}: in-process median ${round(a.median)} ms (p99 ${round(a.p99)}), worker median ${round(b.median)} ms (p99 ${round(b.p99)}), added ${round(b.median - a.median)} ms`,
  );
}
const again = performance.now();
const second = await createWorkerScriptModule();
console.log(`worker start: ${round(performance.now() - again)} ms (later, code already compiled)`);
second.dispose();
worker.dispose();
inProcess.dispose();
process.exit(0);
