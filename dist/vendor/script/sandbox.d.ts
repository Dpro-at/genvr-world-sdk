import { type SandboxLimits } from './limits.js';
export type SandboxResult<T> = {
    ok: true;
    value: T;
    ticks: number;
    ms: number;
} | {
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
/** The script's own stack frames kept for a thrown error (spec 6). */
export declare const STACK_FRAMES = 10;
/**
 * The real heap size is read after a call that grew the module's memory, and after every this many calls otherwise
 * (memory another script freed is reused without growing the module). Reading it costs about 0.02 ms for a small heap
 * and 0.5 ms for 100 000 objects.
 */
export declare const HEAP_CHECK_EVERY = 16;
/**
 * A new, isolated WebAssembly instance whose linear memory is capped (`MODULE_MEMORY`). Without the cap a script could
 * grow it to 2 GiB, because the per-runtime QuickJS limit does not count bytes in this build (see `#overHeap`).
 */
export declare function createScriptModule(options?: {
    wasmModule?: object;
}): Promise<ScriptModule>;
