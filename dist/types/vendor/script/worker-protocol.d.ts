import type { SandboxLimits } from './limits.js';
import type { HostName, SandboxResult } from './sandbox.js';
/**
 * The messages between a worker module's host (`node.ts`) and its worker thread (`worker-entry.ts`). They travel over
 * one `MessageChannel`, read synchronously with `receiveMessageOnPort`; a shared `Int32Array` signals new messages so
 * each side can block in `Atomics.wait` (the host with a deadline). Only strings, numbers and plain objects cross.
 */
export type ToWorker = {
    op: 'new';
    id: number;
    name: string;
} | {
    op: 'host';
    id: number;
    name: HostName;
} | {
    op: 'run';
    id: number;
    source: string;
    limits: SandboxLimits;
    file?: string;
} | {
    op: 'compile';
    id: number;
    source: string;
    limits: SandboxLimits;
} | {
    op: 'call';
    id: number;
    handle: number;
    json: string;
    limits: SandboxLimits;
} | {
    op: 'dispose';
    id: number;
}
/** The answer to a host function call the worker is blocked on. */
 | {
    op: 'reply';
    ok: boolean;
    value: string;
};
export type ToHost = {
    type: 'ready';
} | {
    type: 'host';
    id: number;
    name: HostName;
    arg: string;
} | {
    type: 'done';
    /** The sandbox call's result (`new` answers ok or an error). */
    result: SandboxResult<void>;
    /** The module's WebAssembly memory size after the call. */
    bytes: number;
    /** Whether the sandbox disposed itself (out of memory, a broken binding). */
    disposed: boolean;
};
/** Slots of the shared signal array: each side adds 1 and notifies after posting to the other. */
export declare const TO_HOST = 0;
export declare const TO_WORKER = 1;
