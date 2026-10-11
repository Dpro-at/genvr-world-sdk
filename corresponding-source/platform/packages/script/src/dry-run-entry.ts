import { parentPort, workerData } from 'node:worker_threads';
import type { DryRunInput } from './dry-run.js';
import { dryRunOnThisThread, useQuickjsCode, type DryRunReply } from './node.js';

/**
 * The thread of one dry run (`@genvr/script/node` `dryRun`; third review, R2): the replay runs here and waits here for
 * its scripts' worker module, so the API's event loop never does. One answer, then the parent ends the thread.
 */
const data = workerData as { input: DryRunInput; wasmModule?: object };
if (data.wasmModule) useQuickjsCode(data.wasmModule);
let reply: DryRunReply;
try {
  reply = { ok: true, value: await dryRunOnThisThread(data.input) };
} catch (error) {
  reply = { ok: false, message: error instanceof Error ? error.message : 'the dry run failed' };
}
parentPort!.postMessage(reply);
