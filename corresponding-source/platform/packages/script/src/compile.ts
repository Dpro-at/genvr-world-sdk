import { SCRIPT_LIMITS } from '@genvr/contracts';
import type { SandboxLimits } from './limits.js';
import { createScriptModule, type ScriptModule } from './sandbox.js';

export type CompileResult = { ok: true } | { ok: false; message: string; line: number; column: number };

/** Compiling is parsing only; the budget bounds a pathological source, not creator code (none runs). */
const COMPILE_LIMITS: SandboxLimits = Object.freeze({
  memoryBytes: SCRIPT_LIMITS.memoryBytes,
  stackBytes: SCRIPT_LIMITS.stackBytes,
  ticks: SCRIPT_LIMITS.startTicks,
  wallMs: SCRIPT_LIMITS.startMs * 4,
});

/** One module for syntax checks in this process; creator code never runs in it (compile only). */
let shared: Promise<ScriptModule> | null = null;

async function checker(): Promise<ScriptModule> {
  shared ??= createScriptModule().catch((error: unknown) => {
    shared = null;
    throw error;
  });
  return shared;
}

/**
 * Whether a script compiles as a classic script (spec 8, `script-syntax`), with the message, line and column of the
 * first syntax error. Nothing of the source runs. Asynchronous because the WebAssembly module is made on first use.
 */
export async function compileCheck(source: string): Promise<CompileResult> {
  const module = await checker();
  try {
    return compileWith(module, source);
  } catch {
    // The shared module is gone (disposed or broken): make a new one once.
    shared = null;
    return compileWith(await checker(), source);
  }
}

/** The compile check in a given module (a worker module in Node: `@genvr/script/node`). Throws when it has no room. */
export function compileWith(module: ScriptModule, source: string): CompileResult {
  const box = module.newSandbox('compile');
  try {
    const result = box.compile(source, COMPILE_LIMITS);
    if (result.ok) return { ok: true };
    return {
      ok: false,
      message:
        result.kind === 'syntax' ? result.message : `the script could not be compiled (${result.kind})`,
      line: result.line ?? 1,
      column: result.column ?? 1,
    };
  } finally {
    if (!box.disposed) box.dispose();
  }
}
