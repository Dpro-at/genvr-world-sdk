import { SCRIPT_LIMITS } from '@genvr/contracts';

/**
 * Budgets for one sandbox call (spec 5.4).
 *
 * `ticks` counts calls of QuickJS's interrupt handler. QuickJS-ng polls its interrupt counter on function calls and
 * backward jumps (and inside the regex engine) and calls the handler once every 10 000 polls, so one tick is about
 * 10 000 loop iterations or calls. The count is deterministic for the same code and input; `wallMs` is the backstop.
 */
export interface SandboxLimits {
  /** Heap limit of the script's runtime (`setMemoryLimit`). */
  memoryBytes: number;
  /** Stack limit of the script's runtime (`setMaxStackSize`). */
  stackBytes: number;
  /** Interrupt handler calls allowed before the call is interrupted. */
  ticks: number;
  /** Wall clock allowed before the call is interrupted (checked on every tick). */
  wallMs: number;
}

/**
 * Measured on the dev machine (2026-10-01, Windows 11, Node 24.2, `pnpm --filter @genvr/script bench`): one tick is
 * about 10 000 loop iterations and costs 0.10 ms (empty loop, regex backtracking), 0.16 ms (function calls), 0.28 ms
 * (arithmetic), 0.39 ms (sort with a comparator), and 1.1-1.7 ms when every iteration allocates (strings, objects:
 * the garbage collector runs between polls). The budgets below make the deterministic tick count trip before the
 * wall clock for every workload that does not allocate on each iteration (12 x 0.39 ms = 4.7 ms < 5 ms; 60 x 0.39 ms
 * = 23.5 ms < 25 ms); allocation-heavy loops are stopped by the clock, which is the backstop by design.
 */
export const HANDLER_TICKS = 12;
export const START_TICKS = 60;

/** One handler call, including the promise jobs it queues (spec 5.4: 5 ms). */
export const SANDBOX_DEFAULTS: SandboxLimits = Object.freeze({
  memoryBytes: 4 * 2 ** 20,
  stackBytes: 256 * 2 ** 10,
  ticks: HANDLER_TICKS,
  wallMs: 5,
});

/** The top level of a script at match start (spec 5.4: 25 ms). */
export const START_DEFAULTS: SandboxLimits = Object.freeze({
  memoryBytes: 4 * 2 ** 20,
  stackBytes: 256 * 2 ** 10,
  ticks: START_TICKS,
  wallMs: 25,
});

/**
 * The WebAssembly memory of one module (one room's scripts). 16 MiB is the least the QuickJS-ng build declares.
 * `maximumBytes` is the hard bound on everything the place's scripts allocate together (an allocation past it fails
 * as out of memory); a call that grows the module past `softBytes` switches the script that made it off.
 */
export const MODULE_MEMORY = Object.freeze({
  initialBytes: 16 * 2 ** 20,
  softBytes: SCRIPT_LIMITS.placeMemorySoftBytes,
  maximumBytes: SCRIPT_LIMITS.placeMemoryBytes,
});

/** sha256 of `@jitl/quickjs-ng-wasmfile-release-sync@0.32.0` `dist/emscripten-module.wasm`. Updating is deliberate. */
export const QUICKJS_WASM_SHA256 = 'b56fe5094b8751c47b8c32fb5ed4d75afe2dbb43412d3d983ac5d1156af456da';
