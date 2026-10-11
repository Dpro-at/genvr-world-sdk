import type { AssistantHost, ScriptEngine } from '@genvr/assistant';
import { api } from './api';

type ScriptPackage = typeof import('@genvr/script');

let loading: Promise<ScriptPackage> | null = null;

/**
 * The script sandbox outside the browser (tests): `@genvr/script` with its QuickJS-ng WebAssembly file, loaded only
 * when something first needs it. In the browser the same package runs in a Web Worker (`script-worker.ts`), loaded on
 * first use too (a syntax check in the code editor, a dry run of the studio assistant). A failed load is tried again.
 */
function load(): Promise<ScriptPackage> {
  loading ??= import('@genvr/script').catch((error: unknown) => {
    loading = null;
    throw error;
  });
  return loading;
}

/** A message to the script worker (`script-worker.ts`) and its answer. */
export interface EngineRequest {
  id: number;
  op: 'compile' | 'dryRun';
  input: unknown;
}
export type EngineReply =
  | { id: number; started: true }
  | { id: number; ok: true; value: unknown }
  | { id: number; ok: false; message: string };

/** The part of a Web Worker the engine uses (tests pass a stand-in). */
export interface EngineWorker {
  postMessage(message: EngineRequest): void;
  terminate(): void;
  onmessage: ((event: { data: EngineReply }) => void) | null;
  onerror: ((event: unknown) => void) | null;
}

/**
 * How long a call may take before the worker is terminated, counted from when the worker says it started the call
 * (second review): loading the engine (its import and the QuickJS WebAssembly, seconds on a slow phone) and waiting
 * behind an earlier call have their own, longer limit. A compile check runs no creator code; a dry run replays at most
 * 2000 events whose handlers each have a 5 ms budget, so a legitimate one ends well within its time.
 */
export const ENGINE_DEADLINES = Object.freeze({ compileMs: 3000, dryRunMs: 15_000, loadMs: 30_000 });

/** The call was stopped on its deadline (the script never yielded, or the device is very slow). */
export class ScriptEngineTimeout extends Error {
  constructor(op: EngineRequest['op']) {
    super(
      op === 'dryRun'
        ? 'The script ran too long and was stopped. Look for a loop that never ends.'
        : 'The syntax check took too long and was stopped.',
    );
    this.name = 'ScriptEngineTimeout';
  }
}

/**
 * The script engine on a Web Worker (review finding 1): every call goes to one worker; a call past its deadline
 * terminates the worker (every pending call fails) and the next call starts a fresh one. The page never runs creator
 * code on its own thread.
 */
export function workerScriptEngine(
  makeWorker: () => EngineWorker,
  deadlines: { compileMs: number; dryRunMs: number; loadMs?: number } = ENGINE_DEADLINES,
): ScriptEngine {
  let worker: EngineWorker | null = null;
  let next = 1;
  const pending = new Map<
    number,
    {
      op: EngineRequest['op'];
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  const stop = (error: (id: number) => Error) => {
    worker?.terminate();
    worker = null;
    for (const [id, call] of pending) {
      clearTimeout(call.timer);
      call.reject(error(id));
    }
    pending.clear();
  };
  const limit = (op: EngineRequest['op']) => (op === 'dryRun' ? deadlines.dryRunMs : deadlines.compileMs);
  // The worker may be stuck in native code: end it, and every call it still had.
  const expire = (id: number, op: EngineRequest['op']) =>
    stop((other) =>
      other === id ? new ScriptEngineTimeout(op) : new Error('The script engine was restarted.'),
    );
  const notLoaded = (id: number) =>
    stop((other) =>
      other === id
        ? new Error('The script engine could not load in time. Try again.')
        : new Error('The script engine was restarted.'),
    );
  const start = (): EngineWorker => {
    const made = makeWorker();
    made.onmessage = (event) => {
      const reply = event.data;
      const call = pending.get(reply.id);
      if (!call) return;
      if ('started' in reply) {
        // The engine is loaded and the call's own limit starts now.
        clearTimeout(call.timer);
        call.timer = setTimeout(() => expire(reply.id, call.op), limit(call.op));
        return;
      }
      pending.delete(reply.id);
      clearTimeout(call.timer);
      if (reply.ok) call.resolve(reply.value);
      else call.reject(new Error(reply.message));
    };
    made.onerror = () => stop(() => new Error('The script engine stopped. Try again.'));
    return made;
  };
  const call = <T>(op: EngineRequest['op'], input: unknown): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      worker ??= start();
      const id = next;
      next += 1;
      // Until the worker starts the call: the engine's load and any call ahead of it.
      const timer = setTimeout(() => notLoaded(id), deadlines.loadMs ?? ENGINE_DEADLINES.loadMs);
      pending.set(id, { op, resolve: resolve as (value: unknown) => void, reject, timer });
      worker.postMessage({ id, op, input });
    });
  return {
    compileCheck: (source) => call('compile', source),
    dryRun: (input) => call('dryRun', input),
  };
}

/** In the browser: the Web Worker. Elsewhere (tests, the server render) there is no page thread to protect. */
const inBrowser = typeof window !== 'undefined' && typeof Worker !== 'undefined';

/** The compile check and the dry run of the script sandbox, for the studio assistant's host and the code editor. */
export const scriptEngine: ScriptEngine = inBrowser
  ? workerScriptEngine(
      () =>
        new Worker(new URL('./script-worker.ts', import.meta.url), {
          type: 'module',
          name: 'genvr-scripts',
        }) as unknown as EngineWorker,
    )
  : {
      compileCheck: async (source) => (await load()).compileCheck(source),
      dryRun: async (input) => (await load()).dryRun(input),
    };

/**
 * The script side of the studio assistant's host (P2-10): the sandbox for `test_script` and the syntax checks, and the
 * place's script log and last match from its open rooms through the API (builders only), so `test_script { recording:
 * 'last_match' }` and `get_script_logs` work in the studio as over MCP.
 */
export function studioScriptHost(
  placeId: string,
): Pick<AssistantHost, 'scripts' | 'scriptLog' | 'scriptRecording'> {
  return {
    scripts: scriptEngine,
    scriptLog: async (since) => {
      const { data } = await api.GET('/v1/experiences/{id}/scripts', {
        params: { path: { id: placeId }, query: since === undefined ? {} : { since } },
      });
      return data?.lines ?? [];
    },
    scriptRecording: async () => {
      const { data } = await api.GET('/v1/experiences/{id}/scripts/recording', {
        params: { path: { id: placeId } },
      });
      return data?.recording ?? null;
    },
  };
}
