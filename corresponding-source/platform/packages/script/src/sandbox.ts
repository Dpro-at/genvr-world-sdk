import * as ngVariant from '@jitl/quickjs-ng-wasmfile-release-sync';
import {
  newQuickJSWASMModuleFromVariant,
  newVariant,
  type QuickJSContext,
  type QuickJSHandle,
  type QuickJSRuntime,
  type QuickJSSyncVariant,
  type QuickJSWASMModule,
} from 'quickjs-emscripten-core';
import { MODULE_MEMORY, type SandboxLimits } from './limits.js';

// The variant ships CommonJS-style typings; at run time (ESM) its default export is the variant itself.
const variant = (ngVariant as unknown as { default: QuickJSSyncVariant }).default;

/** The part of the WebAssembly global used here (the package compiles without the DOM library). */
declare const WebAssembly: { Memory: new (descriptor: { initial: number; maximum: number }) => object };

export type SandboxResult<T> =
  | { ok: true; value: T; ticks: number; ms: number }
  | {
      ok: false;
      /**
       * `killed`: a worker module (`@genvr/script/node`) ended the whole module on its hard deadline, because native
       * code did not poll the interrupt in time; every sandbox of that module is gone.
       */
      kind: 'error' | 'overrun' | 'memory' | 'syntax' | 'killed';
      message: string;
      line?: number;
      /** The column of a syntax error (from 1), when QuickJS gives one. */
      column?: number;
      /**
       * The script's own stack frames of a thrown error, innermost first, at most `STACK_FRAMES` (`inner 3:9`; the top
       * level is `top level`); frames of the prelude and native functions are left out.
       */
      stack?: string[];
      ticks: number;
      ms: number;
    };

/** The host functions a sandbox may offer. They take and return strings only. */
export type HostName = '__act' | '__read' | '__log';

/** One script: its own QuickJS runtime (own heap limit) and one context. */
export interface ScriptSandbox {
  readonly name: string;
  /** Installs a host function on the global; the prelude captures it before creator code runs. */
  defineHost(name: HostName, fn: (arg: string) => string): void;
  /**
   * Runs source as a classic script (no module loader), then drains its promise jobs in the same budget.
   * The global `__on(fn)` registers a handler and returns its number for `call`; the prelude captures it too.
   * `file` names the code in stack traces; error lines are read only from frames of the creator's file (the default),
   * so the host's own prelude runs under another name and never gives a line.
   */
  run(source: string, limits: SandboxLimits, file?: string): SandboxResult<void>;
  /** Compiles source as a classic script without running any of it: a syntax error, or ok (`compileCheck`). */
  compile(source: string, limits: SandboxLimits): SandboxResult<void>;
  /** Calls a handler registered with `__on` with the parsed `argJson`; drains pending jobs in the same budget. */
  call(handle: number, argJson: string, limits: SandboxLimits): SandboxResult<void>;
  readonly disposed: boolean;
  dispose(): void;
}

/** One WASM module instance (own linear memory); a room holds one (spec 5.1). */
export interface ScriptModule {
  newSandbox(name: string): ScriptSandbox;
  dispose(): void;
  /** Size of the module's WebAssembly memory in bytes (it grows and never shrinks). */
  residentBytes(): number;
  /**
   * Whether calls can be made now: a worker module's replacement thread may still be starting after a kill. Left out:
   * always (the in-process module).
   */
  isReady?(): boolean;
  /** Resolves true once calls can be made, false when the module will not start (a worker module). */
  whenReady?(): Promise<boolean>;
}

/** File name scripts are compiled under; error lines are read from it. Never the creator's script name. */
const FILE = 'script.js';
const MESSAGE_CHARS = 500;
/** The script's own stack frames kept for a thrown error (spec 6). */
export const STACK_FRAMES = 10;
/** Reading a thrown value's fields may run creator getters; they get this small budget of their own. */
const READ_LIMITS = { ticks: 2, wallMs: 2, extraBytes: 256 * 2 ** 10 };
/** Promise jobs run in batches so the wall clock is checked between batches too, not only on interrupt ticks. */
const JOB_BATCH = 32;
/**
 * The real heap size is read after a call that grew the module's memory, and after every this many calls otherwise
 * (memory another script freed is reused without growing the module). Reading it costs about 0.02 ms for a small heap
 * and 0.5 ms for 100 000 objects.
 */
export const HEAP_CHECK_EVERY = 16;

/**
 * Built before any creator code runs, so `JSON.parse` and `Object.create` are the pristine ones. The handler table is
 * a closure with no prototype; only the host holds `dispatch`.
 */
const BOOTSTRAP = `(() => {
  const parse = JSON.parse;
  const table = Object.create(null);
  let count = 0;
  const register = function __on(fn) {
    if (typeof fn !== 'function') throw new TypeError('__on expects a function');
    const handle = count;
    table[handle] = fn;
    count = count + 1;
    return handle;
  };
  const dispatch = function (handle, json) {
    if (typeof handle !== 'number' || !(handle >= 0 && handle < count)) throw new TypeError('unknown handler');
    const fn = table[handle];
    fn(parse(json));
  };
  return [dispatch, register];
})()`;

const PAGE = 65_536;

/**
 * A new, isolated WebAssembly instance whose linear memory is capped (`MODULE_MEMORY`). Without the cap a script could
 * grow it to 2 GiB, because the per-runtime QuickJS limit does not count bytes in this build (see `#overHeap`).
 */
export async function createScriptModule(options: { wasmModule?: object } = {}): Promise<ScriptModule> {
  const wasmMemory = new WebAssembly.Memory({
    initial: MODULE_MEMORY.initialBytes / PAGE,
    maximum: MODULE_MEMORY.maximumBytes / PAGE,
  });
  // A worker module passes the QuickJS WebAssembly.Module its host compiled once, so a new worker skips compiling.
  const capped = newVariant(variant, {
    wasmMemory,
    ...(options.wasmModule ? { wasmModule: options.wasmModule } : {}),
  } as Parameters<typeof newVariant>[1]) as QuickJSSyncVariant;
  const quickjs = await newQuickJSWASMModuleFromVariant(capped);
  return new Module(quickjs);
}

class Module implements ScriptModule {
  readonly #quickjs: QuickJSWASMModule;
  readonly #sandboxes = new Set<Sandbox>();
  #disposed = false;

  constructor(quickjs: QuickJSWASMModule) {
    this.#quickjs = quickjs;
  }

  newSandbox(name: string): ScriptSandbox {
    if (this.#disposed) throw new Error('script module disposed');
    const box = new Sandbox(name, this.#quickjs, () => this.#sandboxes.delete(box));
    this.#sandboxes.add(box);
    return box;
  }

  residentBytes(): number {
    return this.#quickjs.getWasmMemory().buffer.byteLength;
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const box of [...this.#sandboxes]) box.dispose();
    this.#sandboxes.clear();
  }
}

type Failure = Extract<SandboxResult<void>, { ok: false }>;

class Sandbox implements ScriptSandbox {
  readonly name: string;
  readonly #runtime: QuickJSRuntime;
  readonly #ctx: QuickJSContext;
  readonly #dispatch: QuickJSHandle;
  readonly #onDispose: () => void;
  readonly #moduleBytes: () => number;
  #disposed = false;
  #ticks = 0;
  #maxTicks = Infinity;
  #deadline = Infinity;
  #interrupted = false;
  #calls = 0;

  constructor(name: string, quickjs: QuickJSWASMModule, onDispose: () => void) {
    this.name = name;
    this.#moduleBytes = () => quickjs.getWasmMemory().buffer.byteLength;
    this.#onDispose = onDispose;
    this.#runtime = quickjs.newRuntime();
    this.#runtime.setInterruptHandler(() => {
      this.#ticks += 1;
      if (this.#ticks > this.#maxTicks || performance.now() > this.#deadline) {
        this.#interrupted = true;
        return true;
      }
      return false;
    });
    this.#ctx = this.#runtime.newContext();
    const boot = this.#ctx.evalCode(BOOTSTRAP, 'bootstrap.js', { type: 'global' });
    if (boot.error) {
      boot.error.dispose();
      this.#ctx.dispose();
      this.#runtime.dispose();
      throw new Error('script sandbox bootstrap failed');
    }
    const pair = boot.value;
    this.#dispatch = this.#ctx.getProp(pair, 0);
    const register = this.#ctx.getProp(pair, 1);
    this.#ctx.setProp(this.#ctx.global, '__on', register);
    register.dispose();
    pair.dispose();
  }

  get disposed(): boolean {
    return this.#disposed;
  }

  defineHost(name: HostName, fn: (arg: string) => string): void {
    if (this.#disposed) throw new Error('script sandbox disposed');
    const ctx = this.#ctx;
    const handle = ctx.newFunction(name, (arg) => {
      // Only a string crosses: typeof never runs a getter or a Proxy trap, and nothing else is read.
      if (arg === undefined || ctx.typeof(arg) !== 'string') {
        return { error: ctx.newError({ name: 'TypeError', message: `${name} takes a string` }) };
      }
      let out: string;
      try {
        out = String(fn(ctx.getString(arg)));
      } catch {
        return { error: ctx.newError({ name: 'Error', message: `${name} refused the request` }) };
      }
      return ctx.newString(out);
    });
    ctx.setProp(ctx.global, name, handle);
    handle.dispose();
  }

  run(source: string, limits: SandboxLimits, file: string = FILE): SandboxResult<void> {
    return this.#guarded(limits, () => {
      // Compile first so a syntax error is told apart from a SyntaxError the script throws at run time.
      const compiled = this.#ctx.evalCode(source, file, { type: 'global', compileOnly: true });
      if (compiled.error) return { error: compiled.error, syntax: true };
      compiled.value.dispose();
      const result = this.#ctx.evalCode(source, file, { type: 'global' });
      if (result.error) return { error: result.error, syntax: false };
      result.value.dispose();
      return null;
    });
  }

  compile(source: string, limits: SandboxLimits): SandboxResult<void> {
    return this.#guarded(limits, () => {
      const compiled = this.#ctx.evalCode(source, FILE, { type: 'global', compileOnly: true });
      if (compiled.error) return { error: compiled.error, syntax: true };
      compiled.value.dispose();
      return null;
    });
  }

  call(handle: number, argJson: string, limits: SandboxLimits): SandboxResult<void> {
    return this.#guarded(limits, () => {
      const ctx = this.#ctx;
      const h = ctx.newNumber(handle);
      const json = ctx.newString(argJson);
      const result = ctx.callFunction(this.#dispatch, ctx.undefined, h, json);
      h.dispose();
      json.dispose();
      if (result.error) return { error: result.error, syntax: false };
      result.value.dispose();
      return null;
    });
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    try {
      this.#dispatch.dispose();
      this.#ctx.dispose();
      this.#runtime.dispose();
    } finally {
      this.#onDispose();
    }
  }

  #arm(ticks: number, wallMs: number): void {
    this.#ticks = 0;
    this.#maxTicks = ticks;
    this.#deadline = performance.now() + wallMs;
    this.#interrupted = false;
  }

  #disarm(): void {
    this.#maxTicks = Infinity;
    this.#deadline = Infinity;
  }

  #guarded(
    limits: SandboxLimits,
    body: () => { error: QuickJSHandle; syntax: boolean } | null,
  ): SandboxResult<void> {
    const start = performance.now();
    if (this.#disposed) {
      return { ok: false, kind: 'error', message: 'script sandbox disposed', ticks: 0, ms: 0 };
    }
    const moduleBytes = this.#moduleBytes();
    this.#calls += 1;
    this.#runtime.setMemoryLimit(limits.memoryBytes);
    this.#runtime.setMaxStackSize(limits.stackBytes);
    this.#arm(limits.ticks, limits.wallMs);
    let failure: Failure | null = null;
    let ticks = 0;
    try {
      const thrown = body() ?? this.#drainJobs();
      ticks = this.#ticks;
      if (thrown) {
        failure = this.#classify(thrown.error, thrown.syntax, limits);
        // Promise jobs a failed call left behind (a throw, an overrun) must not run in the next call's budget
        // (review finding 7): they run now, on a budget of their own; if they still do not finish, the script stops.
        if (failure.kind !== 'memory' && failure.kind !== 'syntax' && this.#runtime.hasPendingJob()) {
          const settled = this.#settleJobs(limits);
          ticks += settled.ticks;
          if (!settled.done) {
            failure = {
              ...failure,
              kind: 'overrun',
              message: 'its promise jobs did not finish within the budget',
            };
            this.dispose();
          }
        }
      } else if (this.#overModule(moduleBytes) || this.#overHeapSometimes(moduleBytes, limits)) {
        failure = { ok: false, kind: 'memory', message: 'out of memory', ticks: 0, ms: 0 };
      }
    } catch {
      // A host-side failure of the binding itself: the sandbox can no longer be trusted.
      failure = { ok: false, kind: 'error', message: 'script sandbox failed', ticks: 0, ms: 0 };
      this.dispose();
    }
    this.#disarm();
    const ms = performance.now() - start;
    if (!failure) return { ok: true, value: undefined, ticks, ms };
    if (failure.kind === 'memory' && !this.#disposed) this.dispose();
    return { ...failure, ticks, ms };
  }

  /**
   * Runs queued promise jobs inside the budget already armed for this call. A job that fails without an interrupt
   * does not leave the rest for later: they still run in this budget, and the first failure is reported.
   */
  #drainJobs(): { error: QuickJSHandle; syntax: boolean } | null {
    let first: QuickJSHandle | null = null;
    while (this.#runtime.hasPendingJob()) {
      if (performance.now() > this.#deadline) {
        this.#interrupted = true;
        first?.dispose();
        return {
          error: this.#ctx.newError({ name: 'InternalError', message: 'interrupted' }),
          syntax: false,
        };
      }
      const jobs = this.#runtime.executePendingJobs(JOB_BATCH);
      if (!jobs.error) continue;
      if (this.#interrupted) {
        first?.dispose();
        return { error: jobs.error, syntax: false };
      }
      if (first) jobs.error.dispose();
      else first = jobs.error;
    }
    return first ? { error: first, syntax: false } : null;
  }

  /** The jobs a failed call left, on a fresh budget the size of the call's own. Whether they all ran, and the ticks. */
  #settleJobs(limits: SandboxLimits): { done: boolean; ticks: number } {
    this.#arm(limits.ticks, limits.wallMs);
    const left = this.#drainJobs();
    const ticks = this.#ticks;
    left?.error.dispose();
    return { done: !this.#interrupted && !this.#runtime.hasPendingJob(), ticks };
  }

  #classify(error: QuickJSHandle, syntax: boolean, limits: SandboxLimits): Failure {
    const interrupted = this.#interrupted;
    const base = { ok: false as const, ticks: 0, ms: 0 };
    if (interrupted) {
      error.dispose();
      return { ...base, kind: 'overrun', message: 'interrupted: over the time budget' };
    }
    const fields = this.#withRoom(limits, () => this.#readFields(error));
    error.dispose();
    const line = fields.line === undefined ? {} : { line: fields.line };
    if (syntax)
      return {
        ...base,
        ...line,
        ...(fields.column === undefined ? {} : { column: fields.column }),
        kind: 'syntax',
        message: fields.message,
      };
    const outOfMemory = fields.name === 'InternalError' && fields.rawMessage === 'out of memory';
    if (outOfMemory || this.#overHeap(limits) || this.#moduleBytes() >= MODULE_MEMORY.maximumBytes)
      return { ...base, kind: 'memory', message: 'out of memory' };
    const stack = fields.stack.length > 0 ? { stack: fields.stack } : {};
    return { ...base, ...line, ...stack, kind: 'error', message: fields.message };
  }

  /** This call grew the module's memory past its soft size: the script that grew it is switched off. */
  #overModule(before: number): boolean {
    const now = this.#moduleBytes();
    return now > before && now > MODULE_MEMORY.softBytes;
  }

  #overHeapSometimes(before: number, limits: SandboxLimits): boolean {
    const due = this.#moduleBytes() > before || this.#calls % HEAP_CHECK_EVERY === 0;
    return due && this.#overHeap(limits);
  }

  /**
   * Whether this script's heap is over its limit. QuickJS-ng's own limit (`setMemoryLimit`) counts every allocation
   * as 8 bytes in this WASM build (no `malloc_usable_size`), so it bounds the number of allocations, not bytes. The
   * size from `computeMemoryUsage` counts objects, properties and arrays but misses most string bytes, so it is a
   * second guard; the module's capped WebAssembly memory (`MODULE_MEMORY`) is the hard bound.
   */
  #overHeap(limits: SandboxLimits): boolean {
    return this.#withRoom(
      limits,
      () => {
        const ctx = this.#ctx;
        const usage = this.#runtime.computeMemoryUsage();
        // Own data properties only: no creator getter (a polluted prototype) runs.
        const number = (key: string): number => {
          const value = ctx.getProp(usage, key);
          const n = ctx.typeof(value) === 'number' ? ctx.getNumber(value) : 0;
          value.dispose();
          return n;
        };
        const used = number('memory_used_size');
        const blocks = number('malloc_count');
        usage.dispose();
        return used > limits.memoryBytes || blocks * 8 >= limits.memoryBytes * 0.95;
      },
      true,
    );
  }

  /** Runs `read` with a little heap room and a tiny budget of its own (it may run creator getters). */
  #withRoom<T>(limits: SandboxLimits, read: () => T, onFailure?: T): T {
    this.#ticks = 0;
    this.#maxTicks = READ_LIMITS.ticks;
    this.#deadline = performance.now() + Math.min(READ_LIMITS.wallMs, limits.wallMs);
    this.#runtime.setMemoryLimit(limits.memoryBytes + READ_LIMITS.extraBytes);
    try {
      return read();
    } catch (error) {
      if (onFailure !== undefined) return onFailure;
      throw error;
    } finally {
      this.#runtime.setMemoryLimit(limits.memoryBytes);
    }
  }

  /** Reads name, message and stack of a thrown value (under `#withRoom`). */
  #readFields(error: QuickJSHandle): {
    name: string;
    rawMessage: string;
    message: string;
    stack: string[];
    line?: number;
    column?: number;
  } {
    const ctx = this.#ctx;
    const kind = ctx.typeof(error);
    if (kind !== 'object' && kind !== 'function') {
      const text =
        kind === 'string' ? ctx.getString(error) : kind === 'number' ? String(ctx.getNumber(error)) : kind;
      return { name: '', rawMessage: text, message: cut(text), stack: [] };
    }
    const read = (key: string): string => {
      try {
        const value = ctx.getProp(error, key);
        const text = ctx.typeof(value) === 'string' ? ctx.getString(value) : '';
        value.dispose();
        return text;
      } catch {
        return '';
      }
    };
    const name = read('name');
    const rawMessage = read('message');
    const stack = read('stack');
    const match = /script\.js:(\d+)(?::(\d+))?/.exec(stack);
    const message = cut(name ? `${name}: ${rawMessage}` : rawMessage || 'unreadable error');
    const frames = ownFrames(stack);
    if (!match) return { name, rawMessage, message, stack: frames };
    return {
      name,
      rawMessage,
      message,
      stack: frames,
      line: Number(match[1]),
      ...(match[2] === undefined ? {} : { column: Number(match[2]) }),
    };
  }
}

/** The script's own frames of a QuickJS stack (`at inner (script.js:3:9)`), innermost first, `STACK_FRAMES` at most. */
function ownFrames(stack: string): string[] {
  const frames: string[] = [];
  for (const frame of stack.slice(0, 20_000).matchAll(/at (\S+) \(script\.js:(\d+):(\d+)\)/g)) {
    if (frames.length >= STACK_FRAMES) break;
    const name = frame[1] === '<eval>' ? 'top level' : frame[1] === '<anonymous>' ? 'anonymous' : frame[1]!;
    frames.push(`${name.slice(0, 40)} ${frame[2]}:${frame[3]}`);
  }
  return frames;
}

function cut(text: string): string {
  return text.length > MESSAGE_CHARS ? `${text.slice(0, MESSAGE_CHARS)}...` : text;
}
