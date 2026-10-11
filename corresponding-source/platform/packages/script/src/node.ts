import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { MessageChannel, receiveMessageOnPort, Worker, type MessagePort } from 'node:worker_threads';
import { SCRIPT_LIMITS } from '@genvr/contracts';
import { compileWith, type CompileResult } from './compile.js';
import { dryRun as dryRunWith, type DryRunInput, type DryRunResult } from './dry-run.js';
import type { SandboxLimits } from './limits.js';
import type { HostName, SandboxResult, ScriptModule, ScriptSandbox } from './sandbox.js';
import { TO_HOST, TO_WORKER, type ToHost, type ToWorker } from './worker-protocol.js';

/**
 * Worker modules (Node only; review finding 1). QuickJS polls its interrupt only every ~10 000 operations, and native
 * builtins (the default sort, indexOf, fill, join, JSON.stringify of a big array) never poll it, so a loop of them
 * would stall the thread that runs it for minutes. A worker module therefore runs one room's QuickJS module and its
 * sandboxes on a `worker_thread`. Calls stay synchronous for the caller (the session's bus flush): the host posts the
 * call and blocks in `Atomics.wait` until the worker answers, serving the script's host functions (`__act`, `__read`,
 * `__log`) as they come. If the worker does not answer by the call's hard deadline, the host terminates the thread,
 * every sandbox of the module is gone (result kind `killed`), and a fresh worker is started in the background for the
 * next match. The event loop of the room's process is blocked at most for that deadline.
 */

/** A call's hard deadline: past it the worker is terminated. Never less than the watchdog (50 ms). */
export function hardDeadlineMs(limits: SandboxLimits): number {
  return Math.max(SCRIPT_LIMITS.watchdogMs, limits.wallMs * 4);
}

/** Making a sandbox (a runtime, a context, the bootstrap) takes about 1 ms; this is its hard deadline. */
const NEW_SANDBOX_MS = 250;
/**
 * How long a replacement worker may take to say it is ready (it starts in the background right after a kill). Nobody
 * waits for it on the event loop (second review): calls made before are refused and the runner starts the scripts
 * when it is ready.
 */
const BOOT_MS = 10_000;

/**
 * V8 limits of each worker (a second guard; QuickJS's own memory is the module's capped WebAssembly memory, which V8
 * does not count here). The worker's JavaScript is the host side of `quickjs-emscripten` only.
 */
export const WORKER_RESOURCE_LIMITS = Object.freeze({
  maxOldGenerationSizeMb: 48,
  maxYoungGenerationSizeMb: 8,
  codeRangeSizeMb: 16,
  stackSizeMb: 4,
});

/** Live room worker modules in this process at most (each is a thread with up to 64 MiB of script memory). */
export const DEFAULT_MODULE_LIMIT = 16;
/** Live room worker modules of one place owner (account) at most, so one account cannot take every slot. */
export const DEFAULT_OWNER_MODULE_LIMIT = 4;
/**
 * Dry runs (each on a fresh worker module) running at once, and waiting for their turn, at most. They do not count
 * toward the rooms' cap: the API's compile check and dry runs keep a reserve of their own (second review).
 */
export const DEFAULT_DRY_RUN_LIMITS = Object.freeze({ concurrent: 2, queued: 8 });
/**
 * V8 limits of a dry run's own thread (third review, R2): it runs the game session and the replay, and its worker
 * module runs the scripts on one more thread below it.
 */
export const DRY_RUN_RESOURCE_LIMITS = Object.freeze({
  maxOldGenerationSizeMb: 64,
  maxYoungGenerationSizeMb: 16,
  codeRangeSizeMb: 16,
  stackSizeMb: 4,
});
/** Past its wall cap, how long a dry run's thread may still take (two worker starts and the kills) before it ends. */
const DRY_RUN_GRACE_MS = 10_000;
let moduleLimit: number | null = null;
let ownerLimit: number | null = null;
let dryRunLimits: { concurrent: number; queued: number } | null = null;
let live = 0;
const liveByOwner = new Map<string, number>();

/** Sets the process-wide cap on live room modules (null: the default, or `GENVR_SCRIPT_MODULES`). */
export function setScriptModuleLimit(limit: number | null): void {
  moduleLimit = limit;
}

/** Sets the cap on live room modules per owner (null: the default, or `GENVR_SCRIPT_MODULES_PER_OWNER`). */
export function setScriptOwnerLimit(limit: number | null): void {
  ownerLimit = limit;
}

/** Sets how many dry runs run at once and wait (null: `DEFAULT_DRY_RUN_LIMITS`). */
export function setDryRunLimits(limits: { concurrent: number; queued: number } | null): void {
  dryRunLimits = limits;
}

function envLimit(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

/** The cap in force. */
export function scriptModuleLimit(): number {
  return moduleLimit ?? envLimit('GENVR_SCRIPT_MODULES', DEFAULT_MODULE_LIMIT);
}

/** The per-owner cap in force. */
export function scriptOwnerLimit(): number {
  return ownerLimit ?? envLimit('GENVR_SCRIPT_MODULES_PER_OWNER', DEFAULT_OWNER_MODULE_LIMIT);
}

/** Room worker modules alive in this process now (the compile checker and dry runs are not counted). */
export function liveScriptModules(): number {
  return live;
}

/**
 * No worker module now: the process runs as many room modules as it may (`server`), the place's owner has as many as
 * one account may (`owner`), or too many dry runs are waiting (`busy`).
 */
export class ScriptCapacityError extends Error {
  readonly reason: 'server' | 'owner' | 'busy';
  constructor(limit: number, reason: 'server' | 'owner' | 'busy' = 'server') {
    super(
      reason === 'owner'
        ? `the place's owner already runs scripts in ${limit} place${limit === 1 ? '' : 's'} on this server`
        : reason === 'busy'
          ? 'the server is busy with other script tests; try again in a moment'
          : `this server already runs scripts for ${limit} places at once`,
    );
    this.name = 'ScriptCapacityError';
    this.reason = reason;
  }
}

export interface WorkerScriptModule extends ScriptModule {
  /** How often the worker was lost: a call passed its hard deadline, or the worker died by itself. */
  readonly kills: number;
  /**
   * Ends the worker as if it had died by itself (an operator's stop, and tests of that path); the next call answers
   * `killed` and a fresh worker starts.
   */
  stopWorker(): Promise<void>;
  /** Whether a call can be made now (a replacement worker may still be starting after a kill). */
  isReady(): boolean;
  /** Resolves true once the worker is up, false when it did not start or the module was disposed. */
  whenReady(): Promise<boolean>;
}

/** The parts of the WebAssembly global and of ES2024 `Atomics` used here (the package compiles against ES2023). */
declare const WebAssembly: { compile(bytes: Uint8Array): Promise<object> };
const waitAsync = (
  Atomics as unknown as {
    waitAsync(
      array: Int32Array,
      index: number,
      value: number,
      timeout: number,
    ): { value: Promise<string> | string };
  }
).waitAsync;

/** The QuickJS WebAssembly code, compiled once per process and handed to every worker. */
let compiled: Promise<object> | null = null;

/** A dry run's thread takes the code its parent compiled (`dry-run-entry.ts`). */
export function useQuickjsCode(code: object): void {
  compiled = Promise.resolve(code);
}
function quickjsCode(): Promise<object> {
  compiled ??= (async () => {
    const require = createRequire(import.meta.url);
    const bytes = readFileSync(require.resolve('@jitl/quickjs-ng-wasmfile-release-sync/wasm'));
    return (await WebAssembly.compile(bytes)) as object;
  })().catch((error: unknown) => {
    compiled = null;
    throw error;
  });
  return compiled;
}

/**
 * The worker's file: the built `.js` next to this one, or (tests run the source) a small bootstrap that registers tsx
 * in the worker and then loads the `.ts` source (`--import tsx` in `execArgv` does not reach a worker's loader).
 */
function entry(name: 'worker-entry' | 'dry-run-entry' = 'worker-entry'): URL {
  if (!import.meta.url.endsWith('.ts')) return new URL(`./${name}.js`, import.meta.url);
  const source = new URL(`./${name}.ts`, import.meta.url).href;
  const boot = `const { register } = await import(${JSON.stringify(tsxApi())}); register(); await import(${JSON.stringify(source)});`;
  return new URL(`data:text/javascript,${encodeURIComponent(boot)}`);
}

/** The ESM entry of tsx's API (a development dependency; only the test run of the source needs it). */
function tsxApi(): string {
  const resolve = (import.meta as { resolve?: (specifier: string) => string }).resolve;
  if (typeof resolve === 'function') {
    try {
      return resolve('tsx/esm/api');
    } catch {
      // Fall through to the CommonJS resolver below.
    }
  }
  const path = createRequire(import.meta.url)
    .resolve('tsx/esm/api')
    .replace(/\.cjs$/, '.mjs');
  return pathToFileURL(path).href;
}

/** One worker thread and its signalling. */
interface Thread {
  worker: Worker;
  port: MessagePort;
  flags: Int32Array;
  ready: boolean;
  dead: boolean;
  /** Watches, off the event loop, for the worker's `ready` (a replacement after a kill); null until asked. */
  up: Promise<boolean> | null;
}

function spawn(code: object): Thread {
  const { port1, port2 } = new MessageChannel();
  const signal = new SharedArrayBuffer(8);
  const worker = new Worker(entry(), {
    workerData: { port: port2, signal, wasmModule: code },
    transferList: [port2],
    resourceLimits: { ...WORKER_RESOURCE_LIMITS },
    execArgv: [],
    stdout: false,
    stderr: false,
  });
  worker.unref();
  const thread: Thread = {
    worker,
    port: port1,
    flags: new Int32Array(signal),
    ready: false,
    dead: false,
    up: null,
  };
  // A worker that exits by itself (a V8 resource limit, a crash) is dead; a call waiting on it ends on its deadline.
  worker.on('error', () => {
    thread.dead = true;
  });
  worker.on('exit', () => {
    thread.dead = true;
  });
  return thread;
}

/** The next message from the worker, waiting until `deadline` (performance.now); null on the deadline. */
function receive(thread: Thread, deadline: number): ToHost | null {
  for (;;) {
    const seen = Atomics.load(thread.flags, TO_HOST);
    const got = receiveMessageOnPort(thread.port);
    if (got) return got.message as ToHost;
    const left = deadline - performance.now();
    if (left <= 0) return null;
    Atomics.wait(thread.flags, TO_HOST, seen, left);
  }
}

/** Waits without blocking the event loop for the worker's `ready`. */
async function ready(thread: Thread, timeoutMs: number): Promise<boolean> {
  const deadline = performance.now() + timeoutMs;
  for (;;) {
    // A call's quick look (`#live`) may have read the `ready` first.
    if (thread.ready) return true;
    const seen = Atomics.load(thread.flags, TO_HOST);
    const got = receiveMessageOnPort(thread.port);
    if (got && (got.message as ToHost).type === 'ready') return (thread.ready = true);
    if (thread.dead) return false;
    const left = deadline - performance.now();
    if (left <= 0) return false;
    // Short slices so a worker that died before saying ready is noticed (its exit event needs the event loop).
    await waitAsync(thread.flags, TO_HOST, seen, Math.min(left, 50)).value;
  }
}

/**
 * A script module whose sandboxes run on their own worker thread (see above). Counts toward the process-wide cap;
 * rejects with `ScriptCapacityError` when the process is at it. Dispose it to free its slot and its thread.
 */
export async function createWorkerScriptModule(
  options: {
    /** The place owner's account: at most `scriptOwnerLimit()` room modules each. */
    owner?: string;
    /** The API's compile checker and dry runs: not counted toward the rooms' caps (they have their own bounds). */
    reserved?: boolean;
  } = {},
): Promise<WorkerScriptModule> {
  const counted = !options.reserved;
  const owner = counted ? options.owner : undefined;
  if (counted) {
    const limit = scriptModuleLimit();
    if (live >= limit) throw new ScriptCapacityError(limit);
    const perOwner = scriptOwnerLimit();
    if (owner !== undefined && (liveByOwner.get(owner) ?? 0) >= perOwner)
      throw new ScriptCapacityError(perOwner, 'owner');
  }
  const release = () => {
    if (!counted) return;
    live -= 1;
    if (owner === undefined) return;
    const left = (liveByOwner.get(owner) ?? 1) - 1;
    if (left > 0) liveByOwner.set(owner, left);
    else liveByOwner.delete(owner);
  };
  if (counted) {
    live += 1;
    if (owner !== undefined) liveByOwner.set(owner, (liveByOwner.get(owner) ?? 0) + 1);
  }
  try {
    const code = await quickjsCode();
    const thread = spawn(code);
    // Keeps the process alive while it waits (`Atomics.waitAsync` alone does not); unreferenced again once up.
    thread.worker.ref();
    const up = await ready(thread, 10_000);
    thread.worker.unref();
    if (!up) {
      void thread.worker.terminate();
      throw new Error('the script worker did not start');
    }
    return new WorkerModule(code, thread, release);
  } catch (error) {
    release();
    throw error;
  }
}

type Failure = Extract<SandboxResult<void>, { ok: false }>;

class WorkerModule implements WorkerScriptModule {
  readonly #code: object;
  #thread: Thread | null;
  readonly #boxes = new Map<number, WorkerSandbox>();
  #next = 1;
  #bytes = 0;
  #kills = 0;
  #disposed = false;
  /** Frees this module's slot of the process (and owner) cap. */
  readonly #release: () => void;

  constructor(code: object, thread: Thread, release: () => void) {
    this.#code = code;
    this.#thread = thread;
    this.#release = release;
  }

  get kills(): number {
    return this.#kills;
  }

  newSandbox(name: string): ScriptSandbox {
    if (this.#disposed) throw new Error('script module disposed');
    const id = this.#next;
    this.#next += 1;
    const result = this.request({ op: 'new', id, name }, NEW_SANDBOX_MS, null);
    if (!result.ok) throw new Error(`could not start a script sandbox (${result.kind})`);
    const box = new WorkerSandbox(this, id, name);
    this.#boxes.set(id, box);
    return box;
  }

  residentBytes(): number {
    return this.#bytes;
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#release();
    for (const box of this.#boxes.values()) box.markDisposed();
    this.#boxes.clear();
    const thread = this.#thread;
    this.#thread = null;
    if (thread) void thread.worker.terminate();
  }

  /** Posts a message that has no answer (making a host function, freeing a sandbox). */
  post(message: ToWorker): void {
    const thread = this.#thread;
    // A worker still starting reads it once it is up (the port keeps the order).
    if (!thread || thread.dead) return;
    send(thread, message);
  }

  forget(id: number): void {
    this.#boxes.delete(id);
  }

  async stopWorker(): Promise<void> {
    const thread = this.#thread;
    if (!thread || thread.dead) return;
    await thread.worker.terminate();
    thread.dead = true;
  }

  /**
   * One call, synchronously: serves the script's host functions until the worker answers, or terminates the worker on
   * the hard deadline. Time spent in host functions (the engine's own work) does not count toward the deadline, up to
   * one more hard deadline per call; past that the host refuses every further crossing unserved (the script sees an
   * error), so slow host work cannot stretch one call without bound (second review).
   */
  request(message: ToWorker, hardMs: number, box: WorkerSandbox | null): SandboxResult<void> {
    // A worker that died by itself between calls (a V8 resource limit, a crash) took every sandbox with it: that is a
    // kill like the hard deadline (spec 5.4), never a quiet replacement where each script then reads as out of memory.
    if (this.#thread?.dead && this.#thread.ready && !this.#disposed) return this.#died();
    const thread = this.#live();
    const start = performance.now();
    // Never waited for: the runner asks `isReady` first and starts its scripts on `whenReady` (second review).
    if (!thread)
      return failure(
        'error',
        this.#disposed ? 'script module disposed' : 'the script worker is starting',
        start,
      );
    send(thread, message);
    let deadline = start + hardMs;
    let hostLeft = hardMs;
    for (;;) {
      const reply = receive(thread, deadline);
      if (reply === null) return this.#kill(start, hardMs);
      if (reply.type === 'host') {
        if (hostLeft <= 0) {
          send(thread, { op: 'reply', ok: false, value: '' });
          continue;
        }
        const began = performance.now();
        const answer = box?.serve(reply.name, reply.arg) ?? { ok: false, value: '' };
        send(thread, { op: 'reply', ...answer });
        const spent = performance.now() - began;
        deadline += Math.min(spent, hostLeft);
        hostLeft -= spent;
        continue;
      }
      if (reply.type !== 'done') continue;
      this.#bytes = reply.bytes;
      if (reply.disposed) box?.markDisposed();
      return reply.result;
    }
  }

  /** Whether a call can be made now (the worker is up; a replacement after a kill may still be starting). */
  isReady(): boolean {
    const thread = this.#thread;
    if (this.#disposed || !thread || thread.dead) return false;
    if (!thread.ready && receive(thread, 0)?.type === 'ready') thread.ready = true;
    return thread.ready;
  }

  /** Resolves true once the worker is up, false when it did not start (or the module was disposed). */
  whenReady(): Promise<boolean> {
    if (this.#disposed) return Promise.resolve(false);
    const thread = !this.#thread || this.#thread.dead ? this.#replace() : this.#thread;
    if (thread.ready) return Promise.resolve(true);
    thread.up ??= ready(thread, BOOT_MS);
    return thread.up.then((up) => up && !this.#disposed && this.#thread === thread);
  }

  /** A new worker in the background; its `ready` is watched off the event loop. */
  #replace(): Thread {
    const thread = spawn(this.#code);
    thread.up = ready(thread, BOOT_MS);
    this.#thread = thread;
    return thread;
  }

  /** The running worker, or null while a replacement is still starting (never waited for). */
  #live(): Thread | null {
    if (this.#disposed) return null;
    // A worker that ended by itself (a V8 resource limit) is replaced like a terminated one.
    const thread = !this.#thread || this.#thread.dead ? this.#replace() : this.#thread;
    if (thread.ready) return thread;
    // Only a look: the message may be there already.
    if (receive(thread, 0)?.type === 'ready') {
      thread.ready = true;
      return thread;
    }
    return null;
  }

  /** The hard deadline passed: the worker and every sandbox in it are gone; a new worker starts for later calls. */
  #kill(start: number, hardMs: number): Failure {
    this.#kills += 1;
    const thread = this.#thread;
    if (thread) {
      thread.dead = true;
      void thread.worker.terminate();
    }
    for (const box of this.#boxes.values()) box.markDisposed();
    this.#boxes.clear();
    if (this.#disposed) this.#thread = null;
    else this.#replace();
    return failure('killed', `stopped on the hard deadline (${hardMs} ms)`, start);
  }

  /** The worker died by itself: counted as a kill, every sandbox is gone, a new worker starts. */
  #died(): Failure {
    const start = performance.now();
    this.#kills += 1;
    for (const box of this.#boxes.values()) box.markDisposed();
    this.#boxes.clear();
    this.#replace();
    return failure('killed', 'the script worker stopped by itself', start);
  }
}

function send(thread: Thread, message: ToWorker): void {
  thread.port.postMessage(message);
  Atomics.add(thread.flags, TO_WORKER, 1);
  Atomics.notify(thread.flags, TO_WORKER);
}

function failure(kind: Failure['kind'], message: string, start: number): Failure {
  return { ok: false, kind, message, ticks: 0, ms: performance.now() - start };
}

class WorkerSandbox implements ScriptSandbox {
  readonly name: string;
  readonly #module: WorkerModule;
  readonly #id: number;
  readonly #hosts = new Map<HostName, (arg: string) => string>();
  #disposed = false;

  constructor(module: WorkerModule, id: number, name: string) {
    this.#module = module;
    this.#id = id;
    this.name = name;
  }

  get disposed(): boolean {
    return this.#disposed;
  }

  defineHost(name: HostName, fn: (arg: string) => string): void {
    if (this.#disposed) throw new Error('script sandbox disposed');
    this.#hosts.set(name, fn);
    this.#module.post({ op: 'host', id: this.#id, name });
  }

  run(source: string, limits: SandboxLimits, file?: string): SandboxResult<void> {
    return this.#call(
      { op: 'run', id: this.#id, source, limits, ...(file === undefined ? {} : { file }) },
      limits,
    );
  }

  compile(source: string, limits: SandboxLimits): SandboxResult<void> {
    return this.#call({ op: 'compile', id: this.#id, source, limits }, limits);
  }

  call(handle: number, argJson: string, limits: SandboxLimits): SandboxResult<void> {
    return this.#call({ op: 'call', id: this.#id, handle, json: argJson, limits }, limits);
  }

  dispose(): void {
    if (this.#disposed) return;
    this.markDisposed();
    this.#module.post({ op: 'dispose', id: this.#id });
    this.#module.forget(this.#id);
  }

  /** The sandbox is gone on the worker's side (or the worker is). */
  markDisposed(): void {
    this.#disposed = true;
  }

  /** A host function call from the script, as the in-process sandbox would make it. */
  serve(name: HostName, arg: string): { ok: boolean; value: string } {
    const fn = this.#hosts.get(name);
    if (!fn) return { ok: false, value: '' };
    try {
      return { ok: true, value: String(fn(arg)) };
    } catch {
      return { ok: false, value: '' };
    }
  }

  #call(message: ToWorker, limits: SandboxLimits): SandboxResult<void> {
    if (this.#disposed) return failure('error', 'script sandbox disposed', performance.now());
    return this.#module.request(message, hardDeadlineMs(limits), this);
  }
}

// --- the compile check and the dry run on worker modules -------------------------------------------------------

let checker: Promise<WorkerScriptModule> | null = null;

/**
 * `compileCheck` on a worker module shared by the process (nothing of the source runs; the deadline still holds). It
 * is the API's reserve: it never counts toward the rooms' cap.
 */
export async function compileCheck(source: string): Promise<CompileResult> {
  checker ??= createWorkerScriptModule({ reserved: true }).catch((error: unknown) => {
    checker = null;
    throw error;
  });
  return compileWith(await checker, source);
}

let dryRunsRunning = 0;
const dryRunQueue: Array<() => void> = [];

/** Waits for a dry-run slot (`DEFAULT_DRY_RUN_LIMITS`); refuses as busy when the queue is full. */
async function dryRunSlot(): Promise<() => void> {
  const limits = dryRunLimits ?? DEFAULT_DRY_RUN_LIMITS;
  if (dryRunsRunning >= limits.concurrent) {
    if (dryRunQueue.length >= limits.queued) throw new ScriptCapacityError(limits.concurrent, 'busy');
    await new Promise<void>((resolve) => dryRunQueue.push(resolve));
  }
  dryRunsRunning += 1;
  let freed = false;
  return () => {
    if (freed) return;
    freed = true;
    dryRunsRunning -= 1;
    dryRunQueue.shift()?.();
  };
}

/**
 * `dryRun` on its own thread (unless a module is given): the same mechanism and hard deadline as a room, but the
 * replay and every wait for a script run there, so the caller's event loop (the API's) never waits on a dry run, not
 * even for a kill (third review, R2). At most a few run at once and a few more wait; they never take a room's slot
 * (second review). A thread that does not answer in its wall cap plus `DRY_RUN_GRACE_MS` is ended.
 */
export async function dryRun(input: DryRunInput): Promise<DryRunResult> {
  if (input.module) return dryRunWith(input);
  const free = await dryRunSlot();
  try {
    const code = await quickjsCode();
    const worker = new Worker(entry('dry-run-entry'), {
      workerData: { input, wasmModule: code },
      resourceLimits: { ...DRY_RUN_RESOURCE_LIMITS },
      execArgv: [],
      stdout: false,
      stderr: false,
    });
    const limitMs = (input.wallMs ?? SCRIPT_LIMITS.dryRunMs) + DRY_RUN_GRACE_MS;
    return await new Promise<DryRunResult>((resolve, reject) => {
      const done = (settle: () => void) => {
        clearTimeout(timer);
        worker.removeAllListeners();
        // A late error of the ending thread must not reach the process as an unhandled one.
        worker.on('error', () => {});
        void worker.terminate();
        settle();
      };
      const timer = setTimeout(
        () => done(() => reject(new Error(`the dry run did not finish in ${limitMs} ms and was stopped`))),
        limitMs,
      );
      worker.on('message', (reply: DryRunReply) =>
        done(() => (reply.ok ? resolve(reply.value) : reject(new Error(reply.message)))),
      );
      worker.on('error', (error) => done(() => reject(error)));
      worker.on('exit', () => done(() => reject(new Error('the dry run stopped by itself'))));
    });
  } finally {
    free();
  }
}

/** A dry run's thread answers once (`dry-run-entry.ts`). */
export type DryRunReply = { ok: true; value: DryRunResult } | { ok: false; message: string };

/** The dry run itself, on the calling thread: a fresh worker module for the scripts (`dry-run-entry.ts` runs it). */
export async function dryRunOnThisThread(input: DryRunInput): Promise<DryRunResult> {
  const module = await createWorkerScriptModule({ reserved: true });
  try {
    return await dryRunWith({ ...input, module });
  } finally {
    module.dispose();
  }
}

export type { CompileResult, DryRunInput, DryRunResult };
