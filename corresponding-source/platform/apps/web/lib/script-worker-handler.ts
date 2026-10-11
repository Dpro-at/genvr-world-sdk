import type { DryRunInput } from '@genvr/script';
import type { EngineReply, EngineRequest } from './script-engine';

type ScriptPackage = Pick<typeof import('@genvr/script'), 'compileCheck' | 'dryRun'>;

/**
 * The script worker's message handler (`script-worker.ts`): one call at a time, in order (third review, R4). A call
 * posts `started` only when the call before it has answered, so the page's time limit for it (counted from
 * `started`, `script-engine.ts`) never pays for another call. The engine is loaded on first use; a failed load is
 * tried again by the next call.
 */
export function engineHandler(
  post: (reply: EngineReply) => void,
  load: () => Promise<ScriptPackage>,
): (event: { data: EngineRequest }) => void {
  let engine: Promise<ScriptPackage> | null = null;
  let queue: Promise<void> = Promise.resolve();
  return (event) => {
    const { id, op, input } = event.data;
    queue = queue.then(async () => {
      try {
        engine ??= load().catch((error: unknown) => {
          engine = null;
          throw error;
        });
        const script = await engine;
        post({ id, started: true });
        const value =
          op === 'compile'
            ? await script.compileCheck(input as string)
            : await script.dryRun(input as DryRunInput);
        post({ id, ok: true, value });
      } catch (error) {
        post({ id, ok: false, message: error instanceof Error ? error.message : 'the script engine failed' });
      }
    });
  };
}
