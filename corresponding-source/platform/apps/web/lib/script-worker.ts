import type { EngineReply, EngineRequest } from './script-engine';
import { engineHandler } from './script-worker-handler';

/**
 * The script sandbox's Web Worker (P2-10, review finding 1): the compile check and the dry run of `@genvr/script` run
 * here, off the page's thread. A native builtin that never polls QuickJS's interrupt (a loop of big sorts) can then
 * stall only this worker, and `script-engine.ts` terminates it on its deadline; the tab stays responsive. Calls run
 * one at a time (`engineHandler`).
 */
const scope = self as unknown as {
  onmessage: ((event: { data: EngineRequest }) => void) | null;
  postMessage(message: EngineReply): void;
};

scope.onmessage = engineHandler(
  (reply) => scope.postMessage(reply),
  () => import('@genvr/script'),
);
