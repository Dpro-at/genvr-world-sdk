import { type CompileResult } from './compile.js';
import { type DryRunInput, type DryRunResult } from './dry-run.js';
import type { SandboxLimits } from './limits.js';
import type { ScriptModule } from './sandbox.js';
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
export declare function hardDeadlineMs(limits: SandboxLimits): number;
/**
 * V8 limits of each worker (a second guard; QuickJS's own memory is the module's capped WebAssembly memory, which V8
 * does not count here). The worker's JavaScript is the host side of `quickjs-emscripten` only.
 */
export declare const WORKER_RESOURCE_LIMITS: Readonly<{
    maxOldGenerationSizeMb: 48;
    maxYoungGenerationSizeMb: 8;
    codeRangeSizeMb: 16;
    stackSizeMb: 4;
}>;
/** Live room worker modules in this process at most (each is a thread with up to 64 MiB of script memory). */
export declare const DEFAULT_MODULE_LIMIT = 16;
/** Live room worker modules of one place owner (account) at most, so one account cannot take every slot. */
export declare const DEFAULT_OWNER_MODULE_LIMIT = 4;
/**
 * Dry runs (each on a fresh worker module) running at once, and waiting for their turn, at most. They do not count
 * toward the rooms' cap: the API's compile check and dry runs keep a reserve of their own (second review).
 */
export declare const DEFAULT_DRY_RUN_LIMITS: Readonly<{
    concurrent: 2;
    queued: 8;
}>;
/**
 * V8 limits of a dry run's own thread (third review, R2): it runs the game session and the replay, and its worker
 * module runs the scripts on one more thread below it.
 */
export declare const DRY_RUN_RESOURCE_LIMITS: Readonly<{
    maxOldGenerationSizeMb: 64;
    maxYoungGenerationSizeMb: 16;
    codeRangeSizeMb: 16;
    stackSizeMb: 4;
}>;
/** Sets the process-wide cap on live room modules (null: the default, or `GENVR_SCRIPT_MODULES`). */
export declare function setScriptModuleLimit(limit: number | null): void;
/** Sets the cap on live room modules per owner (null: the default, or `GENVR_SCRIPT_MODULES_PER_OWNER`). */
export declare function setScriptOwnerLimit(limit: number | null): void;
/** Sets how many dry runs run at once and wait (null: `DEFAULT_DRY_RUN_LIMITS`). */
export declare function setDryRunLimits(limits: {
    concurrent: number;
    queued: number;
} | null): void;
/** The cap in force. */
export declare function scriptModuleLimit(): number;
/** The per-owner cap in force. */
export declare function scriptOwnerLimit(): number;
/** Room worker modules alive in this process now (the compile checker and dry runs are not counted). */
export declare function liveScriptModules(): number;
/**
 * No worker module now: the process runs as many room modules as it may (`server`), the place's owner has as many as
 * one account may (`owner`), or too many dry runs are waiting (`busy`).
 */
export declare class ScriptCapacityError extends Error {
    readonly reason: 'server' | 'owner' | 'busy';
    constructor(limit: number, reason?: 'server' | 'owner' | 'busy');
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
/** A dry run's thread takes the code its parent compiled (`dry-run-entry.ts`). */
export declare function useQuickjsCode(code: object): void;
/**
 * A script module whose sandboxes run on their own worker thread (see above). Counts toward the process-wide cap;
 * rejects with `ScriptCapacityError` when the process is at it. Dispose it to free its slot and its thread.
 */
export declare function createWorkerScriptModule(options?: {
    /** The place owner's account: at most `scriptOwnerLimit()` room modules each. */
    owner?: string;
    /** The API's compile checker and dry runs: not counted toward the rooms' caps (they have their own bounds). */
    reserved?: boolean;
}): Promise<WorkerScriptModule>;
/**
 * `compileCheck` on a worker module shared by the process (nothing of the source runs; the deadline still holds). It
 * is the API's reserve: it never counts toward the rooms' cap.
 */
export declare function compileCheck(source: string): Promise<CompileResult>;
/**
 * `dryRun` on its own thread (unless a module is given): the same mechanism and hard deadline as a room, but the
 * replay and every wait for a script run there, so the caller's event loop (the API's) never waits on a dry run, not
 * even for a kill (third review, R2). At most a few run at once and a few more wait; they never take a room's slot
 * (second review). A thread that does not answer in its wall cap plus `DRY_RUN_GRACE_MS` is ended.
 */
export declare function dryRun(input: DryRunInput): Promise<DryRunResult>;
/** A dry run's thread answers once (`dry-run-entry.ts`). */
export type DryRunReply = {
    ok: true;
    value: DryRunResult;
} | {
    ok: false;
    message: string;
};
/** The dry run itself, on the calling thread: a fresh worker module for the scripts (`dry-run-entry.ts` runs it). */
export declare function dryRunOnThisThread(input: DryRunInput): Promise<DryRunResult>;
export type { CompileResult, DryRunInput, DryRunResult };
