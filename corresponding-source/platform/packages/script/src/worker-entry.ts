import { receiveMessageOnPort, workerData, type MessagePort } from 'node:worker_threads';
import { createScriptModule, type HostName, type ScriptSandbox } from './sandbox.js';
import { TO_HOST, TO_WORKER, type ToHost, type ToWorker } from './worker-protocol.js';

/**
 * The thread of one worker module (`@genvr/script/node`): one QuickJS module and its sandboxes. It never uses its
 * event loop: it blocks on the shared signal, answers each request in order, and for every host function a script
 * calls it posts the call to the host and blocks until the answer comes. The host terminates this thread when a call
 * passes its hard deadline, so nothing here needs to be interruptible.
 */
const data = workerData as { port: MessagePort; signal: SharedArrayBuffer; wasmModule?: object };
const port = data.port;
const flags = new Int32Array(data.signal);
/** Requests that arrived while a host function call was waiting for its answer (none in practice; kept in order). */
const queued: ToWorker[] = [];

function send(message: ToHost): void {
  port.postMessage(message);
  Atomics.add(flags, TO_HOST, 1);
  Atomics.notify(flags, TO_HOST);
}

function receive(): ToWorker {
  for (;;) {
    const seen = Atomics.load(flags, TO_WORKER);
    const got = receiveMessageOnPort(port);
    if (got) return got.message as ToWorker;
    Atomics.wait(flags, TO_WORKER, seen);
  }
}

function next(): ToWorker {
  return queued.shift() ?? receive();
}

/** A host function: the script blocks until the host answers. */
function callHost(id: number, name: HostName, arg: string): string {
  send({ type: 'host', id, name, arg });
  for (;;) {
    const message = receive();
    if (message.op !== 'reply') {
      queued.push(message);
      continue;
    }
    if (!message.ok) throw new Error('refused');
    return message.value;
  }
}

const module = await createScriptModule(data.wasmModule ? { wasmModule: data.wasmModule } : {});
const boxes = new Map<number, ScriptSandbox>();
send({ type: 'ready' });

for (;;) {
  const message = next();
  if (message.op === 'reply') continue;
  if (message.op === 'dispose') {
    boxes.get(message.id)?.dispose();
    boxes.delete(message.id);
    continue;
  }
  if (message.op === 'host') {
    const box = boxes.get(message.id);
    const { id, name } = message;
    if (box && !box.disposed) box.defineHost(name, (arg) => callHost(id, name, arg));
    continue;
  }
  if (message.op === 'new') {
    try {
      boxes.set(message.id, module.newSandbox(message.name));
      send({ type: 'done', result: ok(), bytes: module.residentBytes(), disposed: false });
    } catch {
      send({
        type: 'done',
        result: failed('could not start a sandbox'),
        bytes: module.residentBytes(),
        disposed: true,
      });
    }
    continue;
  }
  const box = boxes.get(message.id);
  if (!box || box.disposed) {
    send({
      type: 'done',
      result: failed('script sandbox disposed'),
      bytes: module.residentBytes(),
      disposed: true,
    });
    continue;
  }
  const result =
    message.op === 'run'
      ? box.run(message.source, message.limits, message.file)
      : message.op === 'compile'
        ? box.compile(message.source, message.limits)
        : box.call(message.handle, message.json, message.limits);
  if (box.disposed) boxes.delete(message.id);
  send({ type: 'done', result, bytes: module.residentBytes(), disposed: box.disposed });
}

function ok() {
  return { ok: true as const, value: undefined, ticks: 0, ms: 0 };
}

function failed(message: string) {
  return { ok: false as const, kind: 'error' as const, message, ticks: 0, ms: 0 };
}
