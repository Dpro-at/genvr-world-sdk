import {
  Action,
  GameEventName,
  ProductReceipt,
  RULE_LIMITS,
  SCRIPT_LIMITS,
  SPAWN_POINT_ID,
  ScriptProductPurchase,
  WorldDocument,
  ZONE_GATE_ID,
  getLibraryItem,
  newGame,
  zoneFromParams,
  zoneShapeOfItem,
  zoneSize
} from "./chunk-OOWEURE5.js";
import "./chunk-LIP43AWT.js";
import {
  QuickJSEmscriptenModuleError,
  debugLog
} from "./chunk-LVSPT3IE.js";
import "./chunk-PX6F3LHL.js";

// ../script/dist/limits.js
var HANDLER_TICKS = 12;
var START_TICKS = 60;
var SANDBOX_DEFAULTS = Object.freeze({
  memoryBytes: 4 * 2 ** 20,
  stackBytes: 256 * 2 ** 10,
  ticks: HANDLER_TICKS,
  wallMs: 5
});
var START_DEFAULTS = Object.freeze({
  memoryBytes: 4 * 2 ** 20,
  stackBytes: 256 * 2 ** 10,
  ticks: START_TICKS,
  wallMs: 25
});
var MODULE_MEMORY = Object.freeze({
  initialBytes: 16 * 2 ** 20,
  softBytes: SCRIPT_LIMITS.placeMemorySoftBytes,
  maximumBytes: SCRIPT_LIMITS.placeMemoryBytes
});
var QUICKJS_WASM_SHA256 = "b56fe5094b8751c47b8c32fb5ed4d75afe2dbb43412d3d983ac5d1156af456da";

// ../../../../../genvr/node_modules/.pnpm/@jitl+quickjs-ng-wasmfile-release-sync@0.32.0/node_modules/@jitl/quickjs-ng-wasmfile-release-sync/dist/index.mjs
var variant = { type: "sync", importFFI: () => import("./ffi-RY6GV6GP.js").then((mod) => mod.QuickJSFFI), importModuleLoader: () => import("./emscripten-module.browser-2CVOB3Q3.js").then((mod) => mod.default) };
var src_default = variant;

// ../../../../../genvr/node_modules/.pnpm/quickjs-emscripten-core@0.32.0/node_modules/quickjs-emscripten-core/dist/index.mjs
async function newQuickJSWASMModuleFromVariant(variantOrPromise) {
  let variant3 = smartUnwrap(await variantOrPromise), [wasmModuleLoader, QuickJSFFI, { QuickJSWASMModule: QuickJSWASMModule2 }] = await Promise.all([variant3.importModuleLoader().then(smartUnwrap), variant3.importFFI(), import("./module-ES6BEMUI-BYK6YMVN.js").then(smartUnwrap)]), wasmModule = await wasmModuleLoader();
  wasmModule.type = "sync";
  let ffi = new QuickJSFFI(wasmModule);
  return new QuickJSWASMModule2(wasmModule, ffi);
}
function smartUnwrap(val) {
  return val && "default" in val && val.default ? val.default && "default" in val.default && val.default.default ? val.default.default : val.default : val;
}
function newVariant(baseVariant, options) {
  return { ...baseVariant, async importModuleLoader() {
    let moduleLoader = smartUnwrap(await baseVariant.importModuleLoader());
    return async function() {
      let moduleLoaderArg = options.emscriptenModule ? { ...options.emscriptenModule } : {}, log = options.log ?? ((...args) => debugLog("newVariant moduleLoader:", ...args)), tapValue = (message, val) => (log(...message, val), val), force = (val) => typeof val == "function" ? val() : val;
      (options.wasmLocation || options.wasmSourceMapLocation || options.locateFile) && (moduleLoaderArg.locateFile = (fileName, relativeTo) => {
        let args = { fileName, relativeTo };
        if (fileName.endsWith(".wasm") && options.wasmLocation !== void 0) return tapValue(["locateFile .wasm: provide wasmLocation", args], options.wasmLocation);
        if (fileName.endsWith(".map")) {
          if (options.wasmSourceMapLocation !== void 0) return tapValue(["locateFile .map: provide wasmSourceMapLocation", args], options.wasmSourceMapLocation);
          if (options.wasmLocation && !options.locateFile) return tapValue(["locateFile .map: infer from wasmLocation", args], options.wasmLocation + ".map");
        }
        return options.locateFile ? tapValue(["locateFile: use provided fn", args], options.locateFile(fileName, relativeTo)) : tapValue(["locateFile: unhandled, passthrough", args], fileName);
      }), options.wasmBinary && (moduleLoaderArg.wasmBinary = await force(options.wasmBinary)), options.wasmMemory && (moduleLoaderArg.wasmMemory = await force(options.wasmMemory));
      let optionsWasmModule = options.wasmModule, modulePromise;
      optionsWasmModule && (moduleLoaderArg.instantiateWasm = async (imports, onSuccess) => {
        modulePromise ?? (modulePromise = Promise.resolve(force(optionsWasmModule)));
        let wasmModule = await modulePromise;
        if (!wasmModule) throw new QuickJSEmscriptenModuleError(`options.wasmModule returned ${String(wasmModule)}`);
        let instance = await WebAssembly.instantiate(wasmModule, imports);
        return onSuccess(instance), instance.exports;
      }), moduleLoaderArg.monitorRunDependencies = (left) => {
        log("monitorRunDependencies:", left);
      }, moduleLoaderArg.quickjsEmscriptenInit = () => newMockExtensions(log);
      let resultPromise = moduleLoader(moduleLoaderArg), extensions = moduleLoaderArg.quickjsEmscriptenInit?.(log);
      if (optionsWasmModule && extensions?.receiveWasmOffsetConverter && !extensions.existingWasmOffsetConverter) {
        let wasmBinary = await force(options.wasmBinary) ?? new ArrayBuffer(0);
        modulePromise ?? (modulePromise = Promise.resolve(force(optionsWasmModule)));
        let wasmModule = await modulePromise;
        if (!wasmModule) throw new QuickJSEmscriptenModuleError(`options.wasmModule returned ${String(wasmModule)}`);
        extensions.receiveWasmOffsetConverter(wasmBinary, wasmModule);
      }
      if (extensions?.receiveSourceMapJSON) {
        let loadedSourceMapData = await force(options.wasmSourceMapData);
        typeof loadedSourceMapData == "string" ? extensions.receiveSourceMapJSON(JSON.parse(loadedSourceMapData)) : loadedSourceMapData ? extensions.receiveSourceMapJSON(loadedSourceMapData) : extensions.receiveSourceMapJSON({ version: 3, names: [], sources: [], mappings: "" });
      }
      return resultPromise;
    };
  } };
}
function newMockExtensions(log) {
  let mockMessage = "mock called, emscripten module may not be initialized yet";
  return { mock: true, removeRunDependency(name) {
    log(`${mockMessage}: removeRunDependency called:`, name);
  }, receiveSourceMapJSON(data) {
    log(`${mockMessage}: receiveSourceMapJSON called:`, data);
  }, WasmOffsetConverter: void 0, receiveWasmOffsetConverter(bytes, mod) {
    log(`${mockMessage}: receiveWasmOffsetConverter called:`, bytes, mod);
  } };
}

// ../script/dist/sandbox.js
var variant2 = src_default;
var FILE = "script.js";
var MESSAGE_CHARS = 500;
var STACK_FRAMES = 10;
var READ_LIMITS = { ticks: 2, wallMs: 2, extraBytes: 256 * 2 ** 10 };
var JOB_BATCH = 32;
var HEAP_CHECK_EVERY = 16;
var BOOTSTRAP = `(() => {
  const parse = JSON.parse;
  const table = Object.create(null);
  let count = 0;
  const register = function __on(fn) {
    if (typeof fn !== 'function') throw new TypeError('__on expects a function');
    const handle = count;
    table[handle] = fn;
    count = count + 1;
    return handle;
  };
  const dispatch = function (handle, json) {
    if (typeof handle !== 'number' || !(handle >= 0 && handle < count)) throw new TypeError('unknown handler');
    const fn = table[handle];
    fn(parse(json));
  };
  return [dispatch, register];
})()`;
var PAGE = 65536;
async function createScriptModule(options = {}) {
  const wasmMemory = new WebAssembly.Memory({
    initial: MODULE_MEMORY.initialBytes / PAGE,
    maximum: MODULE_MEMORY.maximumBytes / PAGE
  });
  const capped = newVariant(variant2, {
    wasmMemory,
    ...options.wasmModule ? { wasmModule: options.wasmModule } : {}
  });
  const quickjs = await newQuickJSWASMModuleFromVariant(capped);
  return new Module(quickjs);
}
var Module = class {
  #quickjs;
  #sandboxes = /* @__PURE__ */ new Set();
  #disposed = false;
  constructor(quickjs) {
    this.#quickjs = quickjs;
  }
  newSandbox(name) {
    if (this.#disposed)
      throw new Error("script module disposed");
    const box = new Sandbox(name, this.#quickjs, () => this.#sandboxes.delete(box));
    this.#sandboxes.add(box);
    return box;
  }
  residentBytes() {
    return this.#quickjs.getWasmMemory().buffer.byteLength;
  }
  dispose() {
    if (this.#disposed)
      return;
    this.#disposed = true;
    for (const box of [...this.#sandboxes])
      box.dispose();
    this.#sandboxes.clear();
  }
};
var Sandbox = class {
  name;
  #runtime;
  #ctx;
  #dispatch;
  #onDispose;
  #moduleBytes;
  #disposed = false;
  #ticks = 0;
  #maxTicks = Infinity;
  #deadline = Infinity;
  #interrupted = false;
  #calls = 0;
  constructor(name, quickjs, onDispose) {
    this.name = name;
    this.#moduleBytes = () => quickjs.getWasmMemory().buffer.byteLength;
    this.#onDispose = onDispose;
    this.#runtime = quickjs.newRuntime();
    this.#runtime.setInterruptHandler(() => {
      this.#ticks += 1;
      if (this.#ticks > this.#maxTicks || performance.now() > this.#deadline) {
        this.#interrupted = true;
        return true;
      }
      return false;
    });
    this.#ctx = this.#runtime.newContext();
    const boot = this.#ctx.evalCode(BOOTSTRAP, "bootstrap.js", { type: "global" });
    if (boot.error) {
      boot.error.dispose();
      this.#ctx.dispose();
      this.#runtime.dispose();
      throw new Error("script sandbox bootstrap failed");
    }
    const pair = boot.value;
    this.#dispatch = this.#ctx.getProp(pair, 0);
    const register = this.#ctx.getProp(pair, 1);
    this.#ctx.setProp(this.#ctx.global, "__on", register);
    register.dispose();
    pair.dispose();
  }
  get disposed() {
    return this.#disposed;
  }
  defineHost(name, fn) {
    if (this.#disposed)
      throw new Error("script sandbox disposed");
    const ctx = this.#ctx;
    const handle = ctx.newFunction(name, (arg) => {
      if (arg === void 0 || ctx.typeof(arg) !== "string") {
        return { error: ctx.newError({ name: "TypeError", message: `${name} takes a string` }) };
      }
      let out;
      try {
        out = String(fn(ctx.getString(arg)));
      } catch {
        return { error: ctx.newError({ name: "Error", message: `${name} refused the request` }) };
      }
      return ctx.newString(out);
    });
    ctx.setProp(ctx.global, name, handle);
    handle.dispose();
  }
  run(source, limits, file = FILE) {
    return this.#guarded(limits, () => {
      const compiled = this.#ctx.evalCode(source, file, { type: "global", compileOnly: true });
      if (compiled.error)
        return { error: compiled.error, syntax: true };
      compiled.value.dispose();
      const result = this.#ctx.evalCode(source, file, { type: "global" });
      if (result.error)
        return { error: result.error, syntax: false };
      result.value.dispose();
      return null;
    });
  }
  compile(source, limits) {
    return this.#guarded(limits, () => {
      const compiled = this.#ctx.evalCode(source, FILE, { type: "global", compileOnly: true });
      if (compiled.error)
        return { error: compiled.error, syntax: true };
      compiled.value.dispose();
      return null;
    });
  }
  call(handle, argJson, limits) {
    return this.#guarded(limits, () => {
      const ctx = this.#ctx;
      const h = ctx.newNumber(handle);
      const json = ctx.newString(argJson);
      const result = ctx.callFunction(this.#dispatch, ctx.undefined, h, json);
      h.dispose();
      json.dispose();
      if (result.error)
        return { error: result.error, syntax: false };
      result.value.dispose();
      return null;
    });
  }
  dispose() {
    if (this.#disposed)
      return;
    this.#disposed = true;
    try {
      this.#dispatch.dispose();
      this.#ctx.dispose();
      this.#runtime.dispose();
    } finally {
      this.#onDispose();
    }
  }
  #arm(ticks, wallMs) {
    this.#ticks = 0;
    this.#maxTicks = ticks;
    this.#deadline = performance.now() + wallMs;
    this.#interrupted = false;
  }
  #disarm() {
    this.#maxTicks = Infinity;
    this.#deadline = Infinity;
  }
  #guarded(limits, body) {
    const start = performance.now();
    if (this.#disposed) {
      return { ok: false, kind: "error", message: "script sandbox disposed", ticks: 0, ms: 0 };
    }
    const moduleBytes = this.#moduleBytes();
    this.#calls += 1;
    this.#runtime.setMemoryLimit(limits.memoryBytes);
    this.#runtime.setMaxStackSize(limits.stackBytes);
    this.#arm(limits.ticks, limits.wallMs);
    let failure = null;
    let ticks = 0;
    try {
      const thrown = body() ?? this.#drainJobs();
      ticks = this.#ticks;
      if (thrown) {
        failure = this.#classify(thrown.error, thrown.syntax, limits);
        if (failure.kind !== "memory" && failure.kind !== "syntax" && this.#runtime.hasPendingJob()) {
          const settled = this.#settleJobs(limits);
          ticks += settled.ticks;
          if (!settled.done) {
            failure = {
              ...failure,
              kind: "overrun",
              message: "its promise jobs did not finish within the budget"
            };
            this.dispose();
          }
        }
      } else if (this.#overModule(moduleBytes) || this.#overHeapSometimes(moduleBytes, limits)) {
        failure = { ok: false, kind: "memory", message: "out of memory", ticks: 0, ms: 0 };
      }
    } catch {
      failure = { ok: false, kind: "error", message: "script sandbox failed", ticks: 0, ms: 0 };
      this.dispose();
    }
    this.#disarm();
    const ms = performance.now() - start;
    if (!failure)
      return { ok: true, value: void 0, ticks, ms };
    if (failure.kind === "memory" && !this.#disposed)
      this.dispose();
    return { ...failure, ticks, ms };
  }
  /**
   * Runs queued promise jobs inside the budget already armed for this call. A job that fails without an interrupt
   * does not leave the rest for later: they still run in this budget, and the first failure is reported.
   */
  #drainJobs() {
    let first = null;
    while (this.#runtime.hasPendingJob()) {
      if (performance.now() > this.#deadline) {
        this.#interrupted = true;
        first?.dispose();
        return {
          error: this.#ctx.newError({ name: "InternalError", message: "interrupted" }),
          syntax: false
        };
      }
      const jobs = this.#runtime.executePendingJobs(JOB_BATCH);
      if (!jobs.error)
        continue;
      if (this.#interrupted) {
        first?.dispose();
        return { error: jobs.error, syntax: false };
      }
      if (first)
        jobs.error.dispose();
      else
        first = jobs.error;
    }
    return first ? { error: first, syntax: false } : null;
  }
  /** The jobs a failed call left, on a fresh budget the size of the call's own. Whether they all ran, and the ticks. */
  #settleJobs(limits) {
    this.#arm(limits.ticks, limits.wallMs);
    const left = this.#drainJobs();
    const ticks = this.#ticks;
    left?.error.dispose();
    return { done: !this.#interrupted && !this.#runtime.hasPendingJob(), ticks };
  }
  #classify(error, syntax, limits) {
    const interrupted = this.#interrupted;
    const base = { ok: false, ticks: 0, ms: 0 };
    if (interrupted) {
      error.dispose();
      return { ...base, kind: "overrun", message: "interrupted: over the time budget" };
    }
    const fields = this.#withRoom(limits, () => this.#readFields(error));
    error.dispose();
    const line = fields.line === void 0 ? {} : { line: fields.line };
    if (syntax)
      return {
        ...base,
        ...line,
        ...fields.column === void 0 ? {} : { column: fields.column },
        kind: "syntax",
        message: fields.message
      };
    const outOfMemory = fields.name === "InternalError" && fields.rawMessage === "out of memory";
    if (outOfMemory || this.#overHeap(limits) || this.#moduleBytes() >= MODULE_MEMORY.maximumBytes)
      return { ...base, kind: "memory", message: "out of memory" };
    const stack = fields.stack.length > 0 ? { stack: fields.stack } : {};
    return { ...base, ...line, ...stack, kind: "error", message: fields.message };
  }
  /** This call grew the module's memory past its soft size: the script that grew it is switched off. */
  #overModule(before) {
    const now = this.#moduleBytes();
    return now > before && now > MODULE_MEMORY.softBytes;
  }
  #overHeapSometimes(before, limits) {
    const due = this.#moduleBytes() > before || this.#calls % HEAP_CHECK_EVERY === 0;
    return due && this.#overHeap(limits);
  }
  /**
   * Whether this script's heap is over its limit. QuickJS-ng's own limit (`setMemoryLimit`) counts every allocation
   * as 8 bytes in this WASM build (no `malloc_usable_size`), so it bounds the number of allocations, not bytes. The
   * size from `computeMemoryUsage` counts objects, properties and arrays but misses most string bytes, so it is a
   * second guard; the module's capped WebAssembly memory (`MODULE_MEMORY`) is the hard bound.
   */
  #overHeap(limits) {
    return this.#withRoom(limits, () => {
      const ctx = this.#ctx;
      const usage = this.#runtime.computeMemoryUsage();
      const number = (key) => {
        const value = ctx.getProp(usage, key);
        const n = ctx.typeof(value) === "number" ? ctx.getNumber(value) : 0;
        value.dispose();
        return n;
      };
      const used = number("memory_used_size");
      const blocks = number("malloc_count");
      usage.dispose();
      return used > limits.memoryBytes || blocks * 8 >= limits.memoryBytes * 0.95;
    }, true);
  }
  /** Runs `read` with a little heap room and a tiny budget of its own (it may run creator getters). */
  #withRoom(limits, read, onFailure) {
    this.#ticks = 0;
    this.#maxTicks = READ_LIMITS.ticks;
    this.#deadline = performance.now() + Math.min(READ_LIMITS.wallMs, limits.wallMs);
    this.#runtime.setMemoryLimit(limits.memoryBytes + READ_LIMITS.extraBytes);
    try {
      return read();
    } catch (error) {
      if (onFailure !== void 0)
        return onFailure;
      throw error;
    } finally {
      this.#runtime.setMemoryLimit(limits.memoryBytes);
    }
  }
  /** Reads name, message and stack of a thrown value (under `#withRoom`). */
  #readFields(error) {
    const ctx = this.#ctx;
    const kind = ctx.typeof(error);
    if (kind !== "object" && kind !== "function") {
      const text = kind === "string" ? ctx.getString(error) : kind === "number" ? String(ctx.getNumber(error)) : kind;
      return { name: "", rawMessage: text, message: cut(text), stack: [] };
    }
    const read = (key) => {
      try {
        const value = ctx.getProp(error, key);
        const text = ctx.typeof(value) === "string" ? ctx.getString(value) : "";
        value.dispose();
        return text;
      } catch {
        return "";
      }
    };
    const name = read("name");
    const rawMessage = read("message");
    const stack = read("stack");
    const match = /script\.js:(\d+)(?::(\d+))?/.exec(stack);
    const message = cut(name ? `${name}: ${rawMessage}` : rawMessage || "unreadable error");
    const frames = ownFrames(stack);
    if (!match)
      return { name, rawMessage, message, stack: frames };
    return {
      name,
      rawMessage,
      message,
      stack: frames,
      line: Number(match[1]),
      ...match[2] === void 0 ? {} : { column: Number(match[2]) }
    };
  }
};
function ownFrames(stack) {
  const frames = [];
  for (const frame of stack.slice(0, 2e4).matchAll(/at (\S+) \(script\.js:(\d+):(\d+)\)/g)) {
    if (frames.length >= STACK_FRAMES)
      break;
    const name = frame[1] === "<eval>" ? "top level" : frame[1] === "<anonymous>" ? "anonymous" : frame[1];
    frames.push(`${name.slice(0, 40)} ${frame[2]}:${frame[3]}`);
  }
  return frames;
}
function cut(text) {
  return text.length > MESSAGE_CHARS ? `${text.slice(0, MESSAGE_CHARS)}...` : text;
}

// ../script/dist/handles.js
var Handles = class {
  #byId = /* @__PURE__ */ new Map();
  #byHandle = /* @__PURE__ */ new Map();
  #next = 1;
  /** The handle of `id`, given the next one if it has none yet. */
  handleOf(id) {
    let handle = this.#byId.get(id);
    if (handle === void 0) {
      handle = `p${this.#next}`;
      this.#next += 1;
      this.#byId.set(id, handle);
      this.#byHandle.set(handle, id);
    }
    return handle;
  }
  /** The handle of `id` when it has one, without giving a new one. */
  peek(id) {
    return this.#byId.get(id);
  }
  /** The id behind a handle, or undefined. */
  idOf(handle) {
    return this.#byHandle.get(handle);
  }
  /** Gives handles to ids that have none, in the given (join) order. */
  sync(ids) {
    for (const id of ids)
      this.handleOf(id);
  }
  reset() {
    this.#byId = /* @__PURE__ */ new Map();
    this.#byHandle = /* @__PURE__ */ new Map();
    this.#next = 1;
  }
};

// ../script/dist/log.js
function cutLine(text) {
  return text.length > SCRIPT_LIMITS.logChars ? `${text.slice(0, SCRIPT_LIMITS.logChars - 3)}...` : text;
}
var LogRing = class {
  #lines = [];
  push(line) {
    this.#lines.push(line);
    if (this.#lines.length > SCRIPT_LIMITS.logLines)
      this.#lines.splice(0, this.#lines.length - SCRIPT_LIMITS.logLines);
  }
  lines() {
    return [...this.#lines];
  }
};
var LogRate = class {
  #second = -1;
  #count = 0;
  dropped = 0;
  /** Whether a line at session time `now` may be written; counts it either way. Returns the lines still allowed. */
  take(now) {
    const second = Math.floor(now / 1e3);
    if (second !== this.#second) {
      this.#second = second;
      this.#count = 0;
    }
    if (this.#count >= SCRIPT_LIMITS.logPerSecond) {
      this.dropped += 1;
      return -1;
    }
    this.#count += 1;
    return SCRIPT_LIMITS.logPerSecond - this.#count;
  }
};

// ../script/dist/random.js
function hash32(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = state + 1831565813 | 0;
    let t = state;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
var MULBERRY32_SOURCE = `(seed) => {
    let state = seed >>> 0;
    return () => {
      state = (state + 0x6d2b79f5) | 0;
      let t = state;
      t = imul(t ^ (t >>> 15), t | 1);
      t ^= t + imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }`;
function matchSeed(placeSeed, n, first) {
  const base = first ?? hash32(placeSeed);
  return n === 0 ? base >>> 0 : hash32(`${base}:${n}`);
}
function scriptSeed(match, scriptId) {
  return hash32(`${match}:${scriptId}`);
}

// ../script/dist/prelude.js
var PRELUDE_FILE = "genvr-prelude.js";
function prelude(seed) {
  const L = SCRIPT_LIMITS;
  return `(() => {
  'use strict';
  const g = globalThis;
  const on = g.__on, act = g.__act, read = g.__read, log = g.__log;
  delete g.__on; delete g.__act; delete g.__read; delete g.__log;
  const parse = JSON.parse, stringify = JSON.stringify, toText = String, imul = Math.imul;
  const apply = Reflect.apply, construct = Reflect.construct, freeze = Object.freeze;
  const defineProperty = Object.defineProperty, getPrototypeOf = Object.getPrototypeOf;
  const slice = String.prototype.slice, join = Array.prototype.join, push = Array.prototype.push;
  const OriginalDate = Date;
  const ACTS = ${L.actsPerHandler}, READS = ${L.readsPerHandler}, ACT_BYTES = ${L.actJsonBytes}, LOG_CHARS = ${L.logChars};

  // Per call: the host counts too and has the last word; these only spare needless crossings.
  let acts = 0, reads = 0, muted = false, dropped = 0;
  const reportDropped = () => {
    if (dropped > 0) log('D' + dropped);
    dropped = 0;
  };
  const begin = () => {
    acts = 0; reads = 0; muted = false; dropped = 0;
  };
  on(() => { reportDropped(); begin(); });

  // At most READS reads and ACTS actions cross per call; then one marker, so the host writes its refusal line, and
  // nothing more (review finding 7: the check was one late).
  const ask = (op, args) => {
    if (reads >= READS) {
      if (reads === READS) {
        reads += 1;
        read('{"op":"over"}');
      }
      return null;
    }
    reads += 1;
    const message = args === undefined ? { op } : { op, args };
    return parse(read(stringify(message)));
  };
  const text = (value) => (typeof value === 'string' ? value : '');

  const random = (${MULBERRY32_SOURCE})(${seed >>> 0});

  const requestAction = (action, options) => {
    if (acts >= ACTS) {
      if (acts === ACTS) {
        acts += 1;
        act('{"over":true}');
      }
      return false;
    }
    acts += 1;
    let json;
    try {
      json = stringify({ a: action, o: options === undefined ? null : options });
    } catch (error) {
      json = undefined;
    }
    if (typeof json !== 'string') return act('{"a":null,"o":null}') === 'true';
    if (json.length > ACT_BYTES) return act(stringify({ big: json.length })) === 'true';
    return act(json) === 'true';
  };

  const cut = (value, chars) => (value.length > chars ? apply(slice, value, [0, chars]) : value);
  const show = (value) => {
    try {
      if (typeof value === 'string') return cut(value, LOG_CHARS);
      if (typeof value === 'object' && value !== null) {
        const json = stringify(value);
        return cut(typeof json === 'string' ? json : toText(value), LOG_CHARS);
      }
      return cut(toText(value), LOG_CHARS);
    } catch (error) {
      return '[unprintable]';
    }
  };
  // Fixed parameters, not a rest array: a muted call then allocates nothing (4 times cheaper in a log loop). Up to
  // 16 values; trailing undefined values are not printed (a lone undefined is).
  const writeLog = function writeLine(v0, v1, v2, v3, v4, v5, v6, v7, v8, v9, v10, v11, v12, v13, v14, v15) {
    if (muted) {
      dropped += 1;
      return;
    }
    const values = [v0, v1, v2, v3, v4, v5, v6, v7, v8, v9, v10, v11, v12, v13, v14, v15];
    let count = values.length;
    while (count > 1 && values[count - 1] === undefined) count -= 1;
    const parts = [];
    for (let i = 0; i < count; i++) apply(push, parts, [show(values[i])]);
    const left = Number(log('L' + cut(apply(join, parts, [' ']), LOG_CHARS)));
    if (!(left > 0)) muted = true;
  };

  const listen = (name, handler, op) => {
    if (typeof name !== 'string') throw new TypeError('genvr.on needs an event name');
    if (typeof handler !== 'function') throw new TypeError('genvr.on needs a handler function');
    const handle = on((event) => {
      begin();
      try {
        handler(event);
      } finally {
        reportDropped();
      }
    });
    const answer = parse(read(stringify({ op, args: { name, handle } })));
    if (answer !== true) throw new Error(typeof answer === 'string' ? answer : 'genvr.on was refused');
  };

  const now = () => {
    const value = ask('now');
    return typeof value === 'number' ? value : 0;
  };

  const genvr = freeze({
    on: (name, handler) => listen(name, handler, 'on'),
    onProduct: (productId, handler) => listen(productId, handler, 'onProduct'),
    activateProduct: (receiptId) => ask('activateProduct', { receiptId: text(receiptId) }) === true,
    now,
    phase: () => ask('phase'),
    timeLeft: () => ask('timeLeft'),
    players: () => ask('players'),
    player: (handle) => ask('player', { handle: text(handle) }),
    counter: (name, of) => ask('counter', { name: text(name), of: of === undefined ? null : text(of) }),
    zones: (tag) => ask('zones', { tag: tag === undefined ? null : text(tag) }),
    random,
    act: requestAction,
    emit: (name) => requestAction({ kind: 'emit', event: name }),
    log: writeLog,
  });
  const fixed = { writable: false, configurable: false, enumerable: false };
  defineProperty(g, 'genvr', { ...fixed, value: genvr });
  defineProperty(g, 'console', {
    ...fixed,
    value: freeze({ log: writeLog, info: writeLog, warn: writeLog, error: writeLog, debug: writeLog }),
  });

  // Determinism (spec 5.5): the session clock and the match's seeded generator; nothing else tells time.
  defineProperty(Math, 'random', { ...fixed, value: random });
  // Local time is UTC (review finding 6): the engine would read the host's time zone for local dates, which differs
  // between the room, the API and a builder's browser and tells the script where the server is.
  const P = OriginalDate.prototype, UTC = OriginalDate.UTC, originalParse = OriginalDate.parse;
  const getTime = P.getTime, toISO = P.toISOString;
  const zoned = /(?:Z|GMT|UTC|UT|[+-]\\d\\d:?\\d\\d)\\s*(?:\\([^)]*\\))?\\s*$/i;
  const dateOnly = /^\\s*[+-]?\\d{4,6}(?:-\\d\\d(?:-\\d\\d)?)?\\s*$/;
  const isoDateTime = /^\\s*[+-]?\\d{4,6}-\\d\\d-\\d\\dT/i;
  const parseUtc = function parse(value) {
    const s = toText(value);
    if (zoned.test(s) || dateOnly.test(s)) return originalParse(s);
    return originalParse(isoDateTime.test(s) ? s + 'Z' : s + ' GMT');
  };
  const SessionDate = function Date(...args) {
    if (new.target === undefined) return apply(toISO, new OriginalDate(now()), []);
    const time =
      args.length === 0 ? [now()]
      : args.length >= 2 ? [apply(UTC, undefined, args)]
      : typeof args[0] === 'string' ? [parseUtc(args[0])]
      : args;
    return construct(OriginalDate, time, new.target);
  };
  const names = ['FullYear', 'Month', 'Date', 'Day', 'Hours', 'Minutes', 'Seconds', 'Milliseconds'];
  for (let i = 0; i < names.length; i++) {
    defineProperty(P, 'get' + names[i], { ...fixed, value: P['getUTC' + names[i]] });
    if (names[i] !== 'Day') defineProperty(P, 'set' + names[i], { ...fixed, value: P['setUTC' + names[i]] });
  }
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const pad = (n, width) => {
    let s = toText(n < 0 ? -n : n);
    while (s.length < width) s = '0' + s;
    return n < 0 ? '-' + s : s;
  };
  // The parts of a date in UTC, or null for an invalid date (a non-date throws, as the built-ins do).
  const partsOf = (d) => {
    const t = apply(getTime, d, []);
    if (t !== t) return null;
    const get = (name) => apply(P['getUTC' + name], d, []);
    return { y: get('FullYear'), mo: get('Month'), d: get('Date'), wd: get('Day'), h: get('Hours'), mi: get('Minutes'), s: get('Seconds') };
  };
  const dateText = (p) => DAYS[p.wd] + ' ' + MONTHS[p.mo] + ' ' + pad(p.d, 2) + ' ' + pad(p.y, 4);
  const timeText = (p) => pad(p.h, 2) + ':' + pad(p.mi, 2) + ':' + pad(p.s, 2) + ' GMT+0000';
  const localDate = (p) => pad(p.mo + 1, 2) + '/' + pad(p.d, 2) + '/' + pad(p.y, 4);
  const localTime = (p) => pad(p.h % 12 === 0 ? 12 : p.h % 12, 2) + ':' + pad(p.mi, 2) + ':' + pad(p.s, 2) + (p.h < 12 ? ' AM' : ' PM');
  const texts = {
    toString: (p) => dateText(p) + ' ' + timeText(p),
    toDateString: dateText,
    toTimeString: timeText,
    toLocaleString: (p) => localDate(p) + ', ' + localTime(p),
    toLocaleDateString: localDate,
    toLocaleTimeString: localTime,
  };
  const textNames = ['toString', 'toDateString', 'toTimeString', 'toLocaleString', 'toLocaleDateString', 'toLocaleTimeString'];
  for (let i = 0; i < textNames.length; i++) {
    const format = texts[textNames[i]];
    defineProperty(P, textNames[i], {
      ...fixed,
      value: {
        [textNames[i]]() {
          const p = partsOf(this);
          return p === null ? 'Invalid Date' : format(p);
        },
      }[textNames[i]],
    });
  }
  defineProperty(P, 'getTimezoneOffset', {
    ...fixed,
    value: function getTimezoneOffset() {
      const t = apply(getTime, this, []);
      return t !== t ? t : 0;
    },
  });
  defineProperty(P, 'getYear', {
    ...fixed,
    value: function getYear() {
      return apply(P.getUTCFullYear, this, []) - 1900;
    },
  });
  defineProperty(P, 'setYear', {
    ...fixed,
    value: function setYear(year) {
      const y = +year;
      return apply(P.setUTCFullYear, this, [y >= 0 && y <= 99 && y === (y | 0) ? 1900 + y : y]);
    },
  });
  defineProperty(SessionDate, 'prototype', { value: P, writable: false });
  defineProperty(SessionDate, 'now', { ...fixed, value: now });
  defineProperty(SessionDate, 'UTC', { ...fixed, value: UTC });
  defineProperty(SessionDate, 'parse', { ...fixed, value: parseUtc });
  defineProperty(P, 'constructor', { ...fixed, value: SessionDate });
  defineProperty(g, 'Date', { ...fixed, value: SessionDate });

  // No code from text (spec 7.2): what a reviewer, the Checks or an AI reads is all that runs.
  const refuse = function () {
    throw new TypeError('creating code from text is not allowed in Genvr scripts');
  };
  const kinds = [function () {}, async function () {}, function* () {}, async function* () {}];
  for (let i = 0; i < kinds.length; i++) defineProperty(getPrototypeOf(kinds[i]), 'constructor', { ...fixed, value: refuse });
  delete g.eval;
  delete g.Function;
  // Not deterministic, or not needed: removed.
  delete g.performance;
  delete g.queueMicrotask;
  delete g.WeakRef;
  delete g.FinalizationRegistry;
})();`;
}

// ../script/dist/recording.js
var ENGINE_EVENTS = /* @__PURE__ */ new Set([...GameEventName.options, "product_purchased"]);
var SCRIPT_EVENT_TYPES = Object.freeze([
  ...GameEventName.options,
  "custom"
]);
function toScriptEvent(event, actorId, handles2, matchStartedAt) {
  const h = (id) => handles2.handleOf(id);
  const hn = (id) => id === null ? null : handles2.handleOf(id);
  const actor = hn(actorId);
  switch (event.type) {
    case "zone_entered":
    case "zone_exited":
    case "zone_crossed":
      return { type: event.type, actor, id: h(event.id), zone: event.zone, tag: event.tag };
    case "player_joined":
      return { type: "player_joined", actor, id: h(event.id), team: event.team, returning: event.returning };
    case "player_left":
      return { type: "player_left", actor, id: h(event.id) };
    case "hit":
      return {
        type: "hit",
        actor,
        victim: h(event.victim),
        by: hn(event.by),
        damage: event.damage,
        health: event.health
      };
    case "died":
      return { type: "died", actor, victim: h(event.victim), by: hn(event.by) };
    case "respawned":
      return { type: "respawned", actor, id: h(event.id) };
    case "phase_changed":
      return {
        type: "phase_changed",
        actor,
        phase: event.phase,
        endsAt: event.endsAt === null ? null : event.endsAt - matchStartedAt
      };
    case "time_up":
      return { type: "time_up", actor };
    case "counter_changed":
      return { type: "counter_changed", actor, name: event.name, value: event.value, id: hn(event.id) };
    case "timer_fired":
      return { type: "timer_fired", actor, name: event.name, id: hn(event.id) };
    case "mounted":
      return { type: "mounted", actor, id: h(event.id), item: event.item, tag: event.tag, seat: event.seat };
    case "dismounted":
      return { type: "dismounted", actor, id: h(event.id), item: event.item, tag: event.tag };
    case "custom":
      return { type: "custom", actor, name: event.name, id: hn(event.id) };
    default:
      return null;
  }
}
function scriptEventName(event) {
  if (event.type !== "custom")
    return event.type;
  return ENGINE_EVENTS.has(event.name) ? null : event.name;
}
var Recording = class {
  #events = [];
  #at = [];
  #caused = [];
  #seed;
  #last = null;
  constructor(seed) {
    this.#seed = seed;
  }
  push(event, at = 0, caused = false) {
    this.#events.push(event);
    this.#at.push(at);
    this.#caused.push(caused);
    if (this.#events.length > SCRIPT_LIMITS.recordingEvents) {
      this.#events.shift();
      this.#at.shift();
      this.#caused.shift();
    }
  }
  /** A new match: the finished one stays readable until the new one has events. */
  restart(seed) {
    if (this.#events.length > 0)
      this.#last = { seed: this.#seed, events: this.#events, at: this.#at, caused: this.#caused };
    this.#events = [];
    this.#at = [];
    this.#caused = [];
    this.#seed = seed;
  }
  /** The current match's events, or the last match's while the current one has none. */
  snapshot() {
    if (this.#events.length === 0 && this.#last)
      return {
        seed: this.#last.seed,
        events: [...this.#last.events],
        at: [...this.#last.at],
        caused: [...this.#last.caused]
      };
    return { seed: this.#seed, events: [...this.#events], at: [...this.#at], caused: [...this.#caused] };
  }
};

// ../script/dist/guard.js
var WINDOW_MS = 1e3;
var ScriptGuard = class {
  #place = [];
  #starts = [];
  #kills = [];
  /** Each enabled script's text at the last kill (by id). */
  #sources = /* @__PURE__ */ new Map();
  /** Script time of the place in the second ending at `now`. */
  placeUsed(now) {
    return windowSum(this.#place, now, WINDOW_MS);
  }
  /** Match-start time of the place in the start window ending at `now`. */
  startUsed(now) {
    return windowSum(this.#starts, now, SCRIPT_LIMITS.startWindowMs);
  }
  /** Charges a handler call (or the end-of-call hook) to the place. */
  chargeCall(at, ms) {
    this.#place.push({ at, ms });
  }
  /** Charges one script's start (sandbox, prelude and top level) to the place and to the start window. */
  chargeStart(at, ms) {
    this.#place.push({ at, ms });
    this.#starts.push({ at, ms });
  }
  /** Why a script may not start now (the place budget or the start window), or null. */
  startRefusal(now) {
    if (this.placeUsed(now) >= SCRIPT_LIMITS.placeMsPerSecond)
      return `the scripts of this place used their ${SCRIPT_LIMITS.placeMsPerSecond} ms of this second`;
    if (this.startUsed(now) >= SCRIPT_LIMITS.startMsPerWindow)
      return `match starts of this place used ${SCRIPT_LIMITS.startMsPerWindow} ms of script time in ${SCRIPT_LIMITS.startWindowMs / 1e3} seconds`;
    return null;
  }
  /** Counts a kill at `now` and remembers the scripts' texts (a changed text may come back sooner). */
  recordKill(now, scripts) {
    this.#prune(now);
    this.#kills.push(now);
    this.#sources = new Map(scripts.filter((s) => s.enabled).map((s) => [s.id, s.source]));
    return this.#kills.length;
  }
  /** Kills in the window ending at `now`. */
  kills(now) {
    this.#prune(now);
    return this.#kills.length;
  }
  /**
   * Whether the place's scripts are off after too many kills: null when they may start; otherwise when they may
   * start again by themselves (`until`, budget clock) and, if a changed script may start sooner, from when (`retryAt`;
   * null while no script changed).
   */
  retired(now, scripts) {
    this.#prune(now);
    const count = this.#kills.length;
    if (count < SCRIPT_LIMITS.kills)
      return null;
    const last = this.#kills[count - 1];
    const until = this.#kills[count - SCRIPT_LIMITS.kills] + SCRIPT_LIMITS.killWindowMs;
    const changed = scripts.some((s) => s.enabled && this.#sources.get(s.id) !== s.source);
    if (!changed)
      return { until, retryAt: null };
    const wait = Math.min(SCRIPT_LIMITS.killWindowMs, SCRIPT_LIMITS.killRetryMs * 2 ** (count - SCRIPT_LIMITS.kills));
    const retryAt = last + wait;
    return now >= retryAt ? null : { until, retryAt };
  }
  #prune(now) {
    while (this.#kills.length > 0 && this.#kills[0] <= now - SCRIPT_LIMITS.killWindowMs)
      this.#kills.shift();
  }
};
function windowSum(usage, now, windowMs) {
  while (usage.length > 0 && usage[0].at <= now - windowMs)
    usage.shift();
  let sum = 0;
  for (const entry of usage)
    sum += entry.ms;
  return sum;
}

// ../script/dist/runner.js
var START_LIMITS = Object.freeze({
  memoryBytes: SCRIPT_LIMITS.memoryBytes,
  stackBytes: SCRIPT_LIMITS.stackBytes,
  ticks: SCRIPT_LIMITS.startTicks,
  wallMs: SCRIPT_LIMITS.startMs
});
var HANDLER_LIMITS = Object.freeze({
  memoryBytes: SCRIPT_LIMITS.memoryBytes,
  stackBytes: SCRIPT_LIMITS.stackBytes,
  ticks: SCRIPT_LIMITS.handlerTicks,
  wallMs: SCRIPT_LIMITS.handlerMs
});
var PRELUDE_LIMITS = START_LIMITS;
var END_OF_CALL = 0;
var REFUSAL_KEYS = 16;
var START_RETRY_MS = 1e3;
var ScriptRunner = class {
  events;
  #options;
  #clock;
  #scripts;
  #handles = new Handles();
  #log = new LogRing();
  #recording;
  #api = null;
  #productContext = null;
  #productDecisions = /* @__PURE__ */ new Map();
  #productSession = false;
  #match = 0;
  #seed;
  #call = null;
  #shed = /* @__PURE__ */ new Set();
  /** The place's script time (handlers and match starts) and its kills, across games when the room shares it. */
  #budget;
  #placeLoggedAt = -Infinity;
  #disposed = false;
  /** A kill ended this match's scripts: nothing more starts until the next match. */
  #killedThisMatch = false;
  /** This game already said that the place's scripts are off after too many kills. */
  #retiredNoted = false;
  /** This match already said that scripts wait to start. */
  #waitNoted = false;
  /** Starts the waiting scripts later in the match (after the place's budget, a kill's wait or a worker's start). */
  #retryTimer = null;
  constructor(scripts, options) {
    this.#options = options;
    this.#clock = options.clock ?? (() => performance.now());
    this.#budget = options.guard ?? new ScriptGuard();
    this.#scripts = scripts.filter((script) => script.enabled).map((source, index) => ({
      source,
      index,
      box: null,
      state: "off",
      handlers: [],
      strikes: 0,
      errors: 0,
      ticks: 0,
      usage: [],
      overBudget: false,
      refused: /* @__PURE__ */ new Set(),
      rate: new LogRate(),
      waiting: false
    }));
    this.events = this.#scripts.length > 0 ? SCRIPT_EVENT_TYPES : [];
    this.#seed = matchSeed(options.placeSeed, 0, options.seed);
    this.#recording = new Recording(this.#seed);
  }
  attach(api) {
    this.#api = api;
    this.#guard(() => this.#startMatch());
  }
  hear(event, api) {
    if (this.#disposed)
      return;
    this.#api = api;
    this.#guard(() => this.#deliver(event, api));
  }
  /** Host-only capability: the room must obtain the receipt over its authenticated API. */
  verifyProduct(value, playerId, now) {
    const parsed = ProductReceipt.safeParse(value);
    const api = this.#api;
    if (!parsed.success || !api || this.#disposed || this.#productContext || !Number.isFinite(now) || api.view().phase !== "playing")
      return false;
    const receipt = parsed.data;
    if (receipt.experienceId !== this.#options.placeSeed || !api.view().players.get(playerId)?.present)
      return false;
    if (receipt.expiresAt !== null && Date.parse(receipt.expiresAt) <= now)
      return false;
    const key = `${playerId}:${receipt.id}`;
    if (this.#productDecisions.has(key))
      return this.#productDecisions.get(key);
    if (this.#productDecisions.size >= 500)
      return false;
    this.#handles.sync(api.view().players.keys());
    const json = JSON.stringify(ScriptProductPurchase.parse({
      type: "product_purchased",
      actor: this.#handles.handleOf(playerId),
      productId: receipt.productId,
      receiptId: receipt.id,
      mode: receipt.mode,
      benefit: receipt.benefit,
      remainingMs: receipt.expiresAt === null ? null : Math.max(0, Date.parse(receipt.expiresAt) - now)
    }));
    const context = { receiptId: receipt.id, actorId: playerId, activated: false };
    let delivered = false;
    this.#guard(() => {
      this.#productContext = context;
      try {
        for (const s of this.#scripts)
          for (const handler of s.handlers) {
            if (handler.name !== `product:${receipt.productId}` || s.state !== "running" || !s.box || !this.#mayRun(s))
              continue;
            delivered = true;
            if (!this.#productSession)
              this.#write(s, "refused", "Sandbox product callbacks are not included in deterministic match replay; recording is unavailable for this match.");
            this.#productSession = true;
            this.#callHandler(s, handler, json, playerId);
          }
      } finally {
        this.#productContext = null;
      }
    });
    if (delivered)
      this.#productDecisions.set(key, context.activated);
    return context.activated;
  }
  matchReset() {
    if (this.#disposed)
      return;
    this.#guard(() => {
      this.#match += 1;
      this.#seed = matchSeed(this.#options.placeSeed, this.#match, this.#options.seed);
      this.#recording.restart(this.#seed);
      this.#startMatch();
    });
  }
  log() {
    return this.#log.lines();
  }
  recording() {
    if (this.#productSession)
      return { seed: this.#seed, events: [], at: [], caused: [] };
    return this.#recording.snapshot();
  }
  canReplay() {
    return !this.#productSession;
  }
  status() {
    const now = this.#clock();
    return this.#scripts.map((s) => ({
      id: s.source.id,
      name: s.source.name,
      state: s.state,
      strikes: s.strikes,
      errors: s.errors,
      msLastSecond: this.#used(s, now),
      ticks: s.ticks
    }));
  }
  /** Switches every script off until the next match (the watchdog, or the room shutting scripts down). */
  switchOff(reason) {
    let any = false;
    for (const s of this.#scripts)
      if (s.state === "running") {
        any = true;
        this.#off(s, reason, false);
      }
    if (any)
      this.#emitStatus();
  }
  dispose() {
    if (this.#disposed)
      return;
    this.#disposed = true;
    this.#clearRetry();
    for (const s of this.#scripts)
      this.#disposeBox(s);
  }
  // --- match lifecycle -------------------------------------------------------------------------------------------
  #clearRetry() {
    if (this.#retryTimer !== null)
      clearTimeout(this.#retryTimer);
    this.#retryTimer = null;
  }
  #startMatch() {
    const api = this.#api;
    if (!api)
      return;
    this.#clearRetry();
    this.#handles.reset();
    this.#productDecisions.clear();
    this.#productSession = false;
    this.#handles.sync(api.view().players.keys());
    this.#shed.clear();
    this.#killedThisMatch = false;
    this.#waitNoted = false;
    for (const s of this.#scripts) {
      this.#disposeBox(s);
      Object.assign(s, {
        state: "off",
        handlers: [],
        strikes: 0,
        errors: 0,
        ticks: 0,
        usage: [],
        overBudget: false,
        waiting: true
      });
      s.refused = /* @__PURE__ */ new Set();
      s.rate = new LogRate();
    }
    if (!this.#retiredNow())
      this.#startWaiting();
    this.#emitStatus();
  }
  /** Whether the place's scripts are off after too many kills (said once per game). */
  #retiredNow() {
    const now = this.#clock();
    const retired = this.#budget.retired(now, this.#sources());
    if (!retired)
      return false;
    if (retired.retryAt !== null)
      this.#startLater(retired.retryAt - now);
    if (!this.#retiredNoted) {
      this.#retiredNoted = true;
      const minutes = Math.max(1, Math.ceil((retired.until - now) / 6e4));
      const sooner = retired.retryAt === null ? "or sooner once a script is changed" : `or in ${Math.ceil((retired.retryAt - now) / 1e3)} s with the changed script`;
      this.#write(null, "off", `scripts of this place stay off: stopped ${SCRIPT_LIMITS.kills} times in ${SCRIPT_LIMITS.killWindowMs / 6e4} minutes; back in ${minutes} min, ${sooner}`);
    }
    return true;
  }
  /** The enabled scripts as written (the guard compares their texts after a kill). */
  #sources() {
    return this.#scripts.map((s) => s.source);
  }
  /**
   * Starts the waiting scripts in list order. Before each one the place's budget is checked (second review, critical
   * 1): when this second's place time or the start window is used, the rest wait (one line a match) and are tried
   * again a second later; after a kill nothing else starts this match.
   */
  #startWaiting() {
    if (!this.#scripts.some((s) => s.waiting) || this.#killedThisMatch)
      return;
    const module = this.#options.module;
    if (module.isReady && !module.isReady()) {
      if (!this.#waitNoted) {
        this.#waitNoted = true;
        this.#write(null, "off", "scripts wait: the script worker is starting; they start in a moment");
      }
      const match = this.#match;
      void module.whenReady?.().then((up) => {
        if (this.#disposed || this.#match !== match)
          return;
        if (up)
          this.#startLater(0);
        else
          this.#write(null, "off", "the script worker did not start; scripts are off for this match");
      });
      return;
    }
    const waiting = [];
    let why = null;
    for (const s of this.#scripts) {
      if (!s.waiting)
        continue;
      if (this.#killedThisMatch) {
        s.waiting = false;
        continue;
      }
      why ??= this.#budget.startRefusal(this.#clock());
      if (why !== null) {
        waiting.push(s);
        continue;
      }
      s.waiting = false;
      this.#startScript(s);
    }
    if (waiting.length === 0 || this.#killedThisMatch)
      return;
    if (!this.#waitNoted) {
      this.#waitNoted = true;
      this.#write(null, "off", `not started yet: ${why}; waiting: ${waiting.map((s) => `"${s.source.name}"`).join(", ")}`);
    }
    this.#startLater(START_RETRY_MS);
  }
  /** Tries the waiting scripts again in `ms` (budget clock), within this match; one timer at a time. */
  #startLater(ms) {
    if (this.#retryTimer !== null || this.#disposed)
      return;
    const match = this.#match;
    const timer = setTimeout(() => {
      this.#retryTimer = null;
      if (this.#disposed || this.#match !== match || this.#killedThisMatch)
        return;
      this.#guard(() => {
        if (this.#retiredNow())
          return;
        this.#startWaiting();
        this.#emitStatus();
      });
    }, Math.max(0, ms));
    timer.unref?.();
    this.#retryTimer = timer;
  }
  /**
   * Starts one script and charges all of it (the sandbox, the prelude and the top level: the time the room's thread is
   * blocked) to the place's budget and the start window (review finding 2, second review critical 1).
   */
  #startScript(s) {
    let box;
    try {
      box = this.#options.module.newSandbox(s.source.name);
    } catch {
      this.#write(s, "off", "could not start the script sandbox");
      return;
    }
    const start = this.#clock();
    try {
      this.#runStart(s, box);
    } finally {
      this.#budget.chargeStart(start, Math.max(0, this.#clock() - start));
    }
  }
  #runStart(s, box) {
    s.box = box;
    box.defineHost("__act", (json) => this.#onAct(s, json));
    box.defineHost("__read", (json) => this.#onRead(s, json));
    box.defineHost("__log", (text) => this.#onLog(s, text));
    const ready = box.run(prelude(scriptSeed(this.#seed, s.source.id)), PRELUDE_LIMITS, PRELUDE_FILE);
    if (!ready.ok && ready.kind === "killed") {
      this.#killed(ready.ms, ready.message);
      return;
    }
    if (!ready.ok) {
      this.#write(s, "off", "could not start the script sandbox");
      this.#options.onIncident?.(`script prelude failed: ${ready.kind}`);
      this.#disposeBox(s);
      return;
    }
    s.state = "running";
    const topStart = this.#clock();
    const top = this.#within(s, null, true, () => box.run(s.source.source, START_LIMITS));
    const topMs = Math.max(0, this.#clock() - topStart);
    s.ticks += top.ticks;
    const slow = !(!top.ok && top.kind === "killed") && topMs > SCRIPT_LIMITS.watchdogMs;
    if (slow)
      this.#slowTopLevel(topMs);
    if (top.ok && slow) {
      this.#off(s, `the top level took ${Math.round(topMs)} ms (over ${SCRIPT_LIMITS.watchdogMs} ms)`, false);
      return;
    }
    if (!top.ok) {
      if (top.kind === "killed") {
        this.#killed(top.ms, top.message);
        return;
      }
      if (top.kind === "syntax") {
        s.state = "not_compiled";
        this.#write(s, "off", `does not compile: ${top.message}`, top.line);
        this.#disposeBox(s);
        return;
      }
      const why = top.kind === "overrun" ? `top level over its budget (${SCRIPT_LIMITS.startMs} ms)` : top.kind === "memory" ? "out of memory" : top.message;
      this.#off(s, `top level failed: ${why}`, false, top.line);
      return;
    }
    this.#endOfCall(s, null);
    if (s.state === "running")
      this.#write(s, "start", `running, ${s.handlers.length} handler${s.handlers.length === 1 ? "" : "s"}`);
  }
  // --- delivering events -----------------------------------------------------------------------------------------
  #deliver(event, api) {
    const actorId = api.actorOf(event);
    if (this.#mentionsUnknown(event))
      this.#handles.sync(api.view().players.keys());
    const scriptEvent = toScriptEvent(event, actorId, this.#handles, api.matchStartedAt());
    if (!scriptEvent)
      return;
    this.#recording.push(scriptEvent, api.now() - api.matchStartedAt(), api.caused(event));
    const name = scriptEventName(scriptEvent);
    if (name === null)
      return;
    const json = JSON.stringify(scriptEvent);
    if (json.length > SCRIPT_LIMITS.eventJsonBytes)
      return;
    for (const s of this.#scripts) {
      for (const handler of s.handlers) {
        if (handler.name !== name)
          continue;
        if (s.state !== "running" || !s.box)
          break;
        if (!this.#mayRun(s))
          break;
        this.#callHandler(s, handler, json, actorId);
      }
    }
  }
  /** Whether the event names a player who has no handle yet (handles are given in join order first). */
  #mentionsUnknown(event) {
    for (const key of ["id", "victim", "by"]) {
      const value = event[key];
      if (typeof value === "string" && this.#handles.peek(value) === void 0)
        return true;
    }
    return false;
  }
  #callHandler(s, handler, json, actorId) {
    const box = s.box;
    const start = this.#clock();
    const result = this.#within(s, actorId, false, () => box.call(handler.handle, json, HANDLER_LIMITS));
    const ms = Math.max(0, this.#clock() - start);
    s.usage.push({ at: start, ms });
    this.#budget.chargeCall(start, ms);
    s.ticks += result.ticks;
    this.#flushDropped(s);
    if (!result.ok && result.kind === "killed") {
      this.#killed(ms, result.message);
      return;
    }
    if (ms > SCRIPT_LIMITS.watchdogMs) {
      this.#overWatchdog(`one handler call took ${Math.round(ms)} ms`);
      return;
    }
    if (!result.ok)
      this.#failed(s, result);
    else if (ms > SCRIPT_LIMITS.handlerMs * 2)
      this.#strike(s, `a handler went over its budget (${SCRIPT_LIMITS.handlerMs} ms)`);
  }
  #failed(s, result) {
    if (result.kind === "memory" || s.box?.disposed) {
      this.#off(s, result.kind === "overrun" ? result.message : "out of memory", true);
      return;
    }
    if (result.kind === "overrun") {
      this.#strike(s, `a handler went over its budget (${SCRIPT_LIMITS.handlerMs} ms)`);
      return;
    }
    s.errors += 1;
    const frames = result.stack && result.stack.length > 1 ? ` (at ${result.stack.join(" < ")})` : "";
    this.#write(s, "error", `script "${s.source.name}"${result.line ? ` line ${result.line}` : ""}: ${result.message}${frames}`, result.line);
    if (s.errors >= SCRIPT_LIMITS.errors)
      this.#off(s, `${SCRIPT_LIMITS.errors} errors in one match`, true);
  }
  #strike(s, why) {
    s.strikes += 1;
    this.#write(s, "strike", `strike ${s.strikes} of ${SCRIPT_LIMITS.strikes}: ${why}`);
    if (s.strikes >= SCRIPT_LIMITS.strikes)
      this.#off(s, `${SCRIPT_LIMITS.strikes} strikes`, true);
  }
  /** The per-script and per-place time budgets (spec 5.4) before a handler call. */
  #mayRun(s) {
    const now = this.#clock();
    const used = this.#used(s, now);
    if (used >= SCRIPT_LIMITS.scriptMsPerSecond) {
      if (!s.overBudget) {
        s.overBudget = true;
        this.#strike(s, `over ${SCRIPT_LIMITS.scriptMsPerSecond} ms in one second; handlers skipped`);
      }
      return false;
    }
    s.overBudget = false;
    if (this.#budget.placeUsed(now) < SCRIPT_LIMITS.placeMsPerSecond) {
      this.#shed.clear();
      return true;
    }
    const next = [...this.#scripts].reverse().find((other) => other.state === "running" && !this.#shed.has(other));
    if (next)
      this.#shed.add(next);
    if (now - this.#placeLoggedAt >= WINDOW_MS) {
      this.#placeLoggedAt = now;
      const names = this.#scripts.filter((other) => this.#shed.has(other)).map((other) => `"${other.source.name}"`);
      this.#write(null, "refused", `scripts of this place over ${SCRIPT_LIMITS.placeMsPerSecond} ms in one second; skipping ${names.join(", ")}`);
    }
    return !this.#shed.has(s);
  }
  /** Handler ms of a script within the window ending at `now` (old entries dropped). */
  #used(s, now) {
    return windowSum(s.usage, now, WINDOW_MS);
  }
  /** Runs a sandbox call with `#call` set (the host functions read it), and never lets it leak. */
  #within(s, actor, top, body) {
    const outer = this.#call;
    this.#call = { script: s, top, actor, acts: 0, reads: 0, view: null };
    try {
      return body();
    } finally {
      this.#call = outer;
    }
  }
  /** The prelude's end-of-call hook after the top level (reports dropped log lines). */
  #endOfCall(s, actor) {
    if (!s.box || s.box.disposed)
      return;
    const result = this.#within(s, actor, false, () => s.box.call(END_OF_CALL, "{}", HANDLER_LIMITS));
    this.#flushDropped(s);
    if (!result.ok && result.kind === "killed")
      this.#killed(result.ms, result.message);
    else if (!result.ok)
      this.#failed(s, result);
  }
  /**
   * A call passed the module's hard deadline (native code that never polled the interrupt) and the worker was
   * terminated: every sandbox of the place is gone, so every script is off for the match; after
   * `SCRIPT_LIMITS.kills` kills in `killWindowMs` they stay off (the guard says until when).
   */
  #killed(ms, message = "") {
    const count = this.#recordKill();
    const final = count >= SCRIPT_LIMITS.kills;
    const died = message.includes("by itself");
    this.#options.onIncident?.(died ? `script worker stopped by itself (${count} of ${SCRIPT_LIMITS.kills}); scripts off for the ${final ? "game" : "match"}` : `script hard deadline: a call ran ${Math.round(ms)} ms and its worker was stopped (${count} of ${SCRIPT_LIMITS.kills}); scripts off for the ${final ? "game" : "match"}`);
    const why = final ? `stopped on the hard deadline ${SCRIPT_LIMITS.kills} times` : died ? "the script worker stopped by itself (too much memory)" : "a call did not end by the hard deadline (code that never yields, such as a loop of big sorts)";
    for (const s of this.#scripts) {
      s.box = null;
      if (s.state !== "running")
        continue;
      s.state = "off";
      this.#write(s, "off", `switched off until the next match: ${why}`);
    }
    if (final)
      this.#retiredNow();
    this.#emitStatus();
  }
  /**
   * A call (a top level or a handler) took longer than the watchdog and returned (native code that polled the
   * interrupt too rarely): every script of the place stops for this match, and it counts as a kill.
   */
  #overWatchdog(what) {
    const count = this.#recordKill();
    this.#options.onIncident?.(`script watchdog: ${what} (${count} of ${SCRIPT_LIMITS.kills}); scripts off for the match`);
    this.switchOff(`a call took over ${SCRIPT_LIMITS.watchdogMs} ms`);
    if (count >= SCRIPT_LIMITS.kills)
      this.#retiredNow();
  }
  /** A top level over the watchdog: a kill for the guard; the other running scripts go on, nothing else starts. */
  #slowTopLevel(ms) {
    const count = this.#recordKill();
    this.#options.onIncident?.(`script watchdog: a top level took ${Math.round(ms)} ms (${count} of ${SCRIPT_LIMITS.kills}); nothing more starts this match`);
    if (count >= SCRIPT_LIMITS.kills)
      this.#retiredNow();
  }
  #recordKill() {
    this.#killedThisMatch = true;
    return this.#budget.recordKill(this.#clock(), this.#sources());
  }
  // --- host functions (strings in, strings out) -----------------------------------------------------------------
  #onAct(s, json) {
    const call = this.#call;
    if (!call || call.script !== s)
      return "false";
    const api = this.#api;
    const refuse = (key, why, action2 = null) => {
      this.#refused(s, key, why);
      this.#options.onRequest?.({ script: s.source.id, action: action2, actor: null, accepted: false, why });
      return "false";
    };
    if (call.top)
      return refuse("top", "actions can only be requested from a handler, not the top level");
    if (this.#productContext)
      return refuse("rules", "purchase callbacks use activateProduct only; gameplay actions belong in engine handlers");
    call.acts += 1;
    if (call.acts > SCRIPT_LIMITS.actsPerHandler)
      return refuse("acts", `more than ${SCRIPT_LIMITS.actsPerHandler} act or emit calls in one handler`);
    if (json.length > SCRIPT_LIMITS.actJsonBytes)
      return refuse("size", `an action over ${SCRIPT_LIMITS.actJsonBytes} bytes`);
    let raw;
    try {
      raw = JSON.parse(json);
    } catch {
      return refuse("json", "an action that is not JSON");
    }
    const message = isRecord(raw) ? raw : {};
    if ("big" in message)
      return refuse("size", `an action over ${SCRIPT_LIMITS.actJsonBytes} bytes`);
    const parsed = Action.safeParse(message.a);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const where = issue && issue.path.length > 0 ? ` (${issue.path.join(".")})` : "";
      return refuse(`action${cutName(where)}`, `not a valid action${cutName(where)}`, message.a);
    }
    const action = parsed.data;
    let actorId = call.actor;
    const options = message.o;
    if (options !== null && options !== void 0) {
      if (!isRecord(options) || "actor" in options && typeof options.actor !== "string")
        return refuse("options", "options must be { actor?: handle }", action);
      if (typeof options.actor === "string") {
        const id = this.#handles.idOf(options.actor);
        if (id === void 0 || !this.#view(call).players.has(id))
          return refuse("actor", `unknown actor "${cutName(options.actor)}"`, action);
        actorId = id;
      }
    }
    const actor = actorId === null ? null : this.#handles.peek(actorId) ?? null;
    const counter = action.kind === "add_counter" || action.kind === "set_counter" ? action.name : action.kind === "end_match" && typeof action.winner === "object" && "byCounter" in action.winner ? action.winner.byCounter : null;
    if (counter !== null && api.counterScope(counter) === null)
      return refuse("counter", `unknown counter "${cutName(counter)}"`, action);
    if (action.kind === "teleport_to_zone" && !api.zones().some((zone) => zone.tag === action.tag))
      return refuse("zone", `no zone tagged "${cutName(action.tag)}"`, action);
    const accepted = api.act(action, actorId);
    call.view = null;
    if (!accepted) {
      const why = `over the rules' budget (${RULE_LIMITS.actionsPerEvent} actions per event, chain of ${RULE_LIMITS.chain})`;
      this.#refused(s, "rules", why);
      this.#options.onRequest?.({ script: s.source.id, action, actor, accepted: false, why });
      return "false";
    }
    this.#options.onRequest?.({ script: s.source.id, action, actor, accepted: true });
    return "true";
  }
  #onRead(s, json) {
    const call = this.#call;
    if (!call || call.script !== s)
      return "null";
    if (json.length > SCRIPT_LIMITS.readJsonBytes) {
      call.reads += 1;
      this.#refused(s, "size", `a read over ${SCRIPT_LIMITS.readJsonBytes} bytes`);
      return "null";
    }
    let message;
    try {
      const raw = JSON.parse(json);
      message = isRecord(raw) ? raw : {};
    } catch {
      return "null";
    }
    const args = isRecord(message.args) ? message.args : {};
    if (message.op === "on" || message.op === "onProduct")
      return JSON.stringify(this.#register(s, call, args, message.op === "onProduct"));
    call.reads += 1;
    if (call.reads > SCRIPT_LIMITS.readsPerHandler) {
      this.#refused(s, "reads", `more than ${SCRIPT_LIMITS.readsPerHandler} reads in one handler`);
      return "null";
    }
    const value = this.#read(call, String(message.op), args);
    return JSON.stringify(value === void 0 ? null : value);
  }
  #register(s, call, args, product = false) {
    if (!call.top)
      return "genvr.on is only allowed while the top level runs";
    const handle = args.handle;
    const raw = args.name;
    if (typeof handle !== "number" || !Number.isInteger(handle) || handle <= END_OF_CALL)
      return "genvr.on was refused";
    const name = typeof raw === "string" ? raw.trim() : "";
    if (product) {
      if (!ProductReceipt.shape.productId.safeParse(name).success)
        return "onProduct needs a UUID Product ID";
      s.handlers.push({ name: `product:${name}`, handle });
      return true;
    }
    if (name.length === 0 || name.length > RULE_LIMITS.name)
      return `genvr.on needs an event name of 1 to ${RULE_LIMITS.name} characters`;
    s.handlers.push({ name, handle });
    return true;
  }
  #read(call, op, args) {
    const api = this.#api;
    switch (op) {
      case "activateProduct": {
        const context = this.#productContext;
        if (!context || call.top || call.actor !== context.actorId || args.receiptId !== context.receiptId)
          return false;
        context.activated = true;
        return true;
      }
      case "now":
        return api.now() - api.matchStartedAt();
      case "phase":
        return this.#view(call).phase;
      case "timeLeft": {
        const { endsAt } = this.#view(call);
        return endsAt === null ? null : Math.max(0, (endsAt - api.now()) / 1e3);
      }
      case "players": {
        const view = this.#view(call);
        this.#handles.sync(view.players.keys());
        return [...view.players].filter(([, row]) => row.present).map(([id]) => this.#handles.handleOf(id));
      }
      case "player": {
        const id = typeof args.handle === "string" ? this.#handles.idOf(args.handle) : void 0;
        const row = id === void 0 ? void 0 : this.#view(call).players.get(id);
        if (id === void 0 || !row)
          return null;
        return {
          team: row.team,
          health: row.health,
          alive: row.alive,
          score: row.score,
          place: row.place,
          riding: api.ridingOf(id)?.tag ?? null,
          present: row.present
        };
      }
      case "counter": {
        const name = typeof args.name === "string" ? args.name : "";
        const of = args.of;
        if (of === null || of === void 0)
          return api.counter(name, "global");
        if (of === "red" || of === "blue")
          return api.counter(name, { team: of });
        const id = typeof of === "string" ? this.#handles.idOf(of) : void 0;
        return id === void 0 ? null : api.counter(name, { player: id });
      }
      case "zones": {
        const tag = typeof args.tag === "string" ? args.tag : null;
        return api.zones().filter((zone) => tag === null || zone.tag === tag).map((zone) => ({ id: zone.id, tag: zone.tag, shape: zone.shape }));
      }
      default:
        return null;
    }
  }
  #view(call) {
    call.view ??= this.#api.view();
    return call.view;
  }
  #onLog(s, text) {
    const api = this.#api;
    if (!api)
      return "0";
    if (text.startsWith("D")) {
      const n = Number(text.slice(1));
      if (Number.isInteger(n) && n > 0)
        s.rate.dropped += Math.min(n, 1e9);
      return "0";
    }
    const left = s.rate.take(api.now());
    if (left < 0)
      return "0";
    this.#write(s, "log", text.slice(1));
    return String(left);
  }
  #flushDropped(s) {
    if (s.rate.dropped === 0)
      return;
    const n = s.rate.dropped;
    s.rate.dropped = 0;
    this.#write(s, "log", `${n} line${n === 1 ? "" : "s"} dropped (at most ${SCRIPT_LIMITS.logPerSecond} a second)`);
  }
  // --- bookkeeping ------------------------------------------------------------------------------------------------
  /**
   * One log line per kind of refusal per script and match (review finding 3): keyed by a fixed reason, never by the
   * creator's text (names, handles, tags), so the set stays small; and the line counts toward the script's
   * `genvr.log` rate, so refusals cannot flood the log past 10 lines a second.
   */
  #refused(s, key, why) {
    if (s.refused.has(key) || s.refused.size >= REFUSAL_KEYS)
      return;
    s.refused.add(key);
    if (s.rate.take(this.#api?.now() ?? 0) < 0)
      return;
    this.#write(s, "refused", why);
  }
  #off(s, why, status, line) {
    s.state = "off";
    this.#write(s, "off", `switched off until the next match: ${why}`, line);
    this.#disposeBox(s);
    if (status)
      this.#emitStatus();
  }
  #disposeBox(s) {
    const box = s.box;
    s.box = null;
    if (box && !box.disposed) {
      try {
        box.dispose();
      } catch {
      }
    }
  }
  #write(s, level, text, line) {
    const entry = {
      at: this.#api?.now() ?? 0,
      script: s ? s.source.name : "",
      level,
      text: cutLine(text),
      ...line === void 0 ? {} : { line }
    };
    this.#log.push(entry);
    this.#options.onLog?.(entry);
  }
  #emitStatus() {
    this.#options.onStatus?.(this.status());
  }
  /** A host-side failure switches every script of the place off for the match (spec 6); the room never throws. */
  #guard(body) {
    try {
      body();
    } catch (error) {
      this.#call = null;
      const kind = error instanceof Error ? error.name : typeof error;
      this.#options.onIncident?.(`script runner failed (${kind}); scripts off for the match`);
      try {
        this.switchOff("the script host failed");
      } catch {
      }
    }
  }
};
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function cutName(text) {
  return text.length > RULE_LIMITS.name ? `${text.slice(0, RULE_LIMITS.name)}...` : text;
}

// ../script/dist/compile.js
var COMPILE_LIMITS = Object.freeze({
  memoryBytes: SCRIPT_LIMITS.memoryBytes,
  stackBytes: SCRIPT_LIMITS.stackBytes,
  ticks: SCRIPT_LIMITS.startTicks,
  wallMs: SCRIPT_LIMITS.startMs * 4
});
var shared = null;
async function checker() {
  shared ??= createScriptModule().catch((error) => {
    shared = null;
    throw error;
  });
  return shared;
}
async function compileCheck(source) {
  const module = await checker();
  try {
    return compileWith(module, source);
  } catch {
    shared = null;
    return compileWith(await checker(), source);
  }
}
function compileWith(module, source) {
  const box = module.newSandbox("compile");
  try {
    const result = box.compile(source, COMPILE_LIMITS);
    if (result.ok)
      return { ok: true };
    return {
      ok: false,
      message: result.kind === "syntax" ? result.message : `the script could not be compiled (${result.kind})`,
      line: result.line ?? 1,
      column: result.column ?? 1
    };
  } finally {
    if (!box.disposed)
      box.dispose();
  }
}

// ../script/dist/place.js
function spawnSpots(doc) {
  const placed = doc.instances.filter((i) => i.itemId === SPAWN_POINT_ID).map((i) => {
    const team = i.params.team === "red" || i.params.team === "blue" ? i.params.team : "any";
    const [x2, y2, z2] = i.transform.position;
    return { x: x2, y: y2, z: z2, team };
  });
  if (placed.length > 0)
    return placed;
  const [x, y, z] = doc.spawn.position;
  return [{ x, y, z, team: "any" }];
}
var yawOf = (q) => 2 * Math.atan2(q[1] ?? 0, q[3] ?? 1);
function zonesOf(doc) {
  return doc.instances.flatMap((i) => {
    const zone = zoneFromParams(i.params, zoneShapeOfItem(i.itemId));
    if (!zone)
      return [];
    const [x, y, z] = i.transform.position;
    return [
      {
        id: i.instanceId,
        shape: zone.shape,
        tag: zone.tag,
        x,
        y,
        z,
        yaw: yawOf(i.transform.rotation),
        ...zoneSize(zone.shape, i.transform.scale)
      }
    ];
  });
}

// ../game/dist/events.js
var EventBus = class {
  #handlers = /* @__PURE__ */ new Map();
  #queue = [];
  #traces = /* @__PURE__ */ new WeakMap();
  /** The trace of the event being delivered; null outside a delivery. */
  #current = null;
  #followUp = false;
  #flushing = false;
  on(type, handler) {
    const list = this.#handlers.get(type) ?? [];
    list.push(handler);
    this.#handlers.set(type, list);
  }
  emit(event) {
    const cause = this.#current;
    this.#traces.set(event, cause ? { root: cause.root, depth: cause.depth + (this.#followUp ? 1 : 0) } : { root: event, depth: 0 });
    this.#queue.push(event);
  }
  /** The trace of the event being delivered now; null outside a delivery. */
  current() {
    return this.#current;
  }
  /** The top-level event behind `event` and its follow-up depth (itself and 0 when unknown). */
  traceOf(event) {
    return this.#traces.get(event) ?? { root: event, depth: 0 };
  }
  /**
   * Runs `raise`; every event it emits (also through other components) counts one follow-up hop
   * deeper than the event being delivered. The rules interpreter uses it to bound its chains.
   */
  followUp(raise) {
    const before = this.#followUp;
    this.#followUp = true;
    try {
      raise();
    } finally {
      this.#followUp = before;
    }
  }
  /** Delivers the queued events, oldest first, until none are left. */
  flush() {
    if (this.#flushing)
      return;
    this.#flushing = true;
    try {
      for (let event = this.#queue.shift(); event; event = this.#queue.shift()) {
        this.#current = this.traceOf(event);
        for (const handler of this.#handlers.get(event.type) ?? [])
          handler(event);
      }
    } finally {
      this.#current = null;
      this.#flushing = false;
    }
  }
};

// ../game/dist/components/counters.js
var CountersComponent = class {
  #ctx;
  #team = { red: {}, blue: {} };
  #global = {};
  /** Messages already reported, so a rule that keeps misfiring logs once. */
  #reported = /* @__PURE__ */ new Set();
  constructor(ctx) {
    this.#ctx = ctx;
    const { bus } = ctx;
    this.#resetShared();
    bus.on("player_joined", (event) => {
      const row = ctx.players.get(event.id);
      if (!row || event.returning)
        return;
      row.counters = this.#playerStarts();
    });
    bus.on("match_reset", () => {
      this.#resetShared();
      for (const row of ctx.players.values())
        row.counters = this.#playerStarts();
    });
  }
  get(name, who) {
    return this.#slot(name, who)?.[name] ?? 0;
  }
  add(name, by, who) {
    const slot = this.#slot(name, who);
    if (slot)
      this.#write(slot, name, slot[name] + by, who);
  }
  set(name, to, who) {
    const slot = this.#slot(name, who);
    if (slot)
      this.#write(slot, name, to, who);
  }
  /** Copies of the team and global values; changing them changes nothing here. */
  teamValues() {
    return { red: { ...this.#team.red }, blue: { ...this.#team.blue } };
  }
  globalValues() {
    return { ...this.#global };
  }
  #declared(scope) {
    return (this.#ctx.game.counters ?? []).filter((c) => c.scope === scope);
  }
  #playerStarts() {
    return Object.fromEntries(this.#declared("player").map((c) => [c.name, c.start]));
  }
  #resetShared() {
    const teamStarts = Object.fromEntries(this.#declared("team").map((c) => [c.name, c.start]));
    this.#team = { red: { ...teamStarts }, blue: { ...teamStarts } };
    this.#global = Object.fromEntries(this.#declared("global").map((c) => [c.name, c.start]));
  }
  /** The record holding this counter's value for `who`, or null (reported once) when there is none. */
  #slot(name, who) {
    const decl = (this.#ctx.game.counters ?? []).find((c) => c.name === name);
    if (!decl)
      return this.#report(`unknown counter "${name}"`);
    const kind = who === "global" ? "global" : "player" in who ? "player" : "team";
    if (decl.scope !== kind)
      return this.#report(`counter "${name}" has scope ${decl.scope}, used as ${kind}`);
    if (who === "global")
      return this.#global;
    if ("team" in who)
      return this.#team[who.team] ?? this.#report(`counter "${name}": unknown team`);
    return this.#ctx.players.get(who.player)?.counters ?? null;
  }
  #write(slot, name, value, who) {
    if (slot[name] === value)
      return;
    slot[name] = value;
    const id = who !== "global" && "player" in who ? who.player : null;
    this.#ctx.bus.emit({ type: "counter_changed", name, value, id });
  }
  #report(message) {
    if (!this.#reported.has(message)) {
      this.#reported.add(message);
      this.#ctx.log(message);
    }
    return null;
  }
};

// ../game/dist/components/health.js
var HealthComponent = class {
  #ctx;
  constructor(ctx) {
    this.#ctx = ctx;
    const { bus } = ctx;
    bus.on("player_joined", (event) => {
      if (!event.returning)
        this.#heal(event.id);
    });
    bus.on("respawned", (event) => this.#heal(event.id));
    bus.on("match_reset", () => {
      for (const [id, row] of ctx.players) {
        this.#heal(id);
        row.deaths = 0;
      }
    });
  }
  get #max() {
    return this.#ctx.game.health?.max ?? 0;
  }
  /**
   * Takes `amount` from a present, up, unprotected player during play. `by` is the attacker, or
   * null for harm without one (zones, falls later).
   */
  damage(victimId, amount, by) {
    const ctx = this.#ctx;
    if (ctx.phase !== "playing" || !ctx.game.health)
      return;
    const victim = ctx.players.get(victimId);
    if (!victim || !victim.present || !victim.alive || ctx.now < victim.protectedUntil || victimId === by)
      return;
    victim.health = Math.max(0, victim.health - amount);
    ctx.bus.emit({ type: "hit", victim: victimId, by, damage: amount, health: victim.health });
    if (victim.health > 0)
      return;
    victim.alive = false;
    victim.deaths += 1;
    ctx.bus.emit({ type: "died", victim: victimId, by });
  }
  /** Gives `amount` back to a present, up player during play, never above the maximum. */
  heal(id, amount) {
    const ctx = this.#ctx;
    if (ctx.phase !== "playing" || !ctx.game.health)
      return;
    const row = ctx.players.get(id);
    if (!row || !row.present || !row.alive)
      return;
    row.health = Math.min(this.#max, row.health + amount);
  }
  #heal(id) {
    const row = this.#ctx.players.get(id);
    if (!row)
      return;
    row.alive = true;
    row.health = this.#max;
  }
};

// ../game/dist/components/loadout.js
var LoadoutComponent = class {
  #ctx;
  /** When each player last used their tool (server ms). */
  #lastUse = /* @__PURE__ */ new Map();
  constructor(ctx) {
    this.#ctx = ctx;
    const { bus } = ctx;
    bus.on("player_joined", (event) => {
      if (!event.returning)
        this.#equip(event.id);
    });
    bus.on("respawned", (event) => this.#equip(event.id));
    bus.on("match_reset", () => {
      this.#lastUse.clear();
      for (const id of ctx.players.keys())
        this.#equip(id);
    });
  }
  /** The tool in a player's hand, or null (none, or not a tool). */
  toolOf(id) {
    const itemId = this.#ctx.players.get(id)?.tool;
    return itemId ? this.#ctx.tools(itemId) : null;
  }
  /** Uses the tool in hand once: refused while it cools down. */
  use(id, tool) {
    const now = this.#ctx.now;
    if (now - (this.#lastUse.get(id) ?? -Infinity) < tool.cooldownSec * 1e3)
      return "cooldown";
    this.#lastUse.set(id, now);
    return "ok";
  }
  #equip(id) {
    const row = this.#ctx.players.get(id);
    if (!row)
      return;
    row.items = (this.#ctx.game.loadout?.items ?? []).filter((item) => this.#ctx.tools(item) !== null);
    row.tool = row.items[0] ?? "";
  }
};

// ../game/dist/spawn.js
function pickSpawn(spots, team, opponents) {
  const own = team ? spots.filter((s) => s.team === team) : [];
  const pool = own.length > 0 ? own : spots.filter((s) => s.team === "any");
  const candidates = pool.length > 0 ? pool : spots;
  let best = null;
  let bestDistance = -1;
  for (const spot of candidates) {
    const nearest = opponents.length === 0 ? Number.POSITIVE_INFINITY : Math.min(...opponents.map((o) => Math.hypot(o.x - spot.x, o.z - spot.z)));
    if (nearest > bestDistance) {
      best = spot;
      bestDistance = nearest;
    }
  }
  return best;
}

// ../game/dist/context.js
function presentIds(ctx) {
  return [...ctx.players].filter(([, p]) => p.present).map(([id]) => id);
}
function newRow() {
  return {
    team: null,
    health: 0,
    alive: true,
    deaths: 0,
    protectedUntil: 0,
    respawnAt: null,
    score: 0,
    kills: 0,
    items: [],
    tool: "",
    present: true,
    place: 0,
    counters: {}
  };
}
function spotFor(ctx, id, taken = []) {
  const team = ctx.players.get(id)?.team ?? null;
  const rival = (other) => team === null || other !== team;
  const opponents = [...ctx.players].filter(([other, p]) => other !== id && p.present && p.alive && rival(p.team)).filter(([other]) => !taken.some((spot) => spot.id === other)).flatMap(([other]) => {
    const at = ctx.positions(other);
    return at ? [{ x: at.x, z: at.z }] : [];
  });
  for (const spot of taken)
    if (rival(spot.team))
      opponents.push({ x: spot.x, z: spot.z });
  return pickSpawn(ctx.spawns, team, opponents) ?? { x: 0, y: 0, z: 0, team: "any" };
}

// ../game/dist/components/match.js
function phaseSteps(game) {
  const { match } = game;
  return [
    { phase: "waiting", ms: null, gathering: true, end: "next" },
    { phase: "countdown", ms: match.countdownSec * 1e3, gathering: true, end: "next" },
    { phase: "playing", ms: match.durationSec * 1e3, gathering: false, end: "time_up" },
    { phase: "results", ms: match.resultsSec * 1e3, gathering: false, end: "next" }
  ];
}
var MatchComponent = class {
  #ctx;
  #steps;
  #index = 0;
  /**
   * Play must end but nobody named a winner yet (the clock ran out, or everyone left). Checked on
   * the next tick, so the components and rule chains that decide on it finish their own flush first.
   */
  #undecided = null;
  /** Who wins a match the clock ended when nothing named a winner (nobody by default). */
  #clockWinner;
  constructor(ctx, clockWinner = () => null) {
    this.#ctx = ctx;
    this.#clockWinner = clockWinner;
    this.#steps = phaseSteps(ctx.game);
    ctx.phase = this.#steps[0].phase;
    ctx.endsAt = null;
    const { bus } = ctx;
    bus.on("player_joined", () => this.#evaluate());
    bus.on("player_left", () => {
      this.#evaluate();
      if (this.#step.end === "time_up" && presentIds(ctx).length === 0)
        this.#undecided ??= "empty";
    });
    bus.on("solo_changed", () => this.#evaluate());
    bus.on("match_won", () => {
      if (this.#step.end === "time_up")
        this.#next();
    });
  }
  get #step() {
    return this.#steps[this.#index];
  }
  get #minPlayers() {
    return this.#ctx.solo ? 1 : this.#ctx.game.match.minPlayers;
  }
  /** Called once the session exists (and on every tick): moves on when the phase's time is up. */
  start() {
    this.#evaluate();
  }
  tick() {
    const { endsAt, now } = this.#ctx;
    if (this.#undecided === "empty" && presentIds(this.#ctx).length > 0)
      this.#undecided = null;
    if (this.#undecided !== null && this.#step.end === "time_up" && !this.#ctx.decided) {
      const winner = this.#undecided === "clock" ? this.#clockWinner() : null;
      this.#undecided = null;
      this.#ctx.decided = true;
      this.#ctx.bus.emit({ type: "match_won", winner });
      return;
    }
    if (endsAt === null || now < endsAt)
      return;
    if (this.#step.end === "time_up") {
      this.#ctx.endsAt = null;
      this.#undecided = "clock";
      this.#ctx.bus.emit({ type: "time_up" });
    } else
      this.#next();
  }
  /** Gathering phases follow the number of players: enough moves on, too few goes back to the start. */
  #evaluate() {
    if (!this.#step.gathering)
      return;
    const enough = presentIds(this.#ctx).length >= this.#minPlayers;
    if (!enough) {
      if (this.#index !== 0)
        this.#enter(0);
    } else if (this.#step.ms === null)
      this.#next();
  }
  #next() {
    if (this.#index + 1 < this.#steps.length) {
      this.#enter(this.#index + 1);
      return;
    }
    this.#ctx.bus.emit({ type: "match_reset" });
    this.#enter(0);
    this.#evaluate();
  }
  #enter(index) {
    this.#index = index;
    this.#undecided = null;
    const step = this.#step;
    this.#ctx.phase = step.phase;
    this.#ctx.endsAt = step.ms === null ? null : this.#ctx.now + step.ms;
    this.#ctx.bus.emit({ type: "phase_changed", phase: step.phase, endsAt: this.#ctx.endsAt });
  }
};

// ../game/dist/components/placement.js
var PlacementComponent = class {
  #ctx;
  /** When each player was last placed, so one change of the session places them once. */
  #placedAt = /* @__PURE__ */ new Map();
  constructor(ctx) {
    this.#ctx = ctx;
    const { bus } = ctx;
    bus.on("phase_changed", (event) => {
      if (event.phase === "playing")
        this.#place(presentIds(ctx));
    });
    bus.on("player_joined", (event) => {
      if (!event.returning && ctx.phase === "playing")
        this.#place([event.id]);
    });
    bus.on("team_changed", (event) => {
      if (ctx.phase === "playing" && this.#placedAt.get(event.id) !== ctx.now)
        this.#place([event.id]);
    });
    bus.on("player_left", (event) => this.#placedAt.delete(event.id));
  }
  /** Places players one after another, each away from the spots the opponents already got. */
  #place(ids) {
    const ctx = this.#ctx;
    const taken = [];
    for (const id of ids) {
      const row = ctx.players.get(id);
      if (!row?.present)
        continue;
      const at = spotFor(ctx, id, taken);
      taken.push({ id, x: at.x, z: at.z, team: row.team });
      this.#placedAt.set(id, ctx.now);
      ctx.bus.emit({ type: "placed", id, at });
    }
  }
};

// ../game/dist/components/ranking.js
var RankingComponent = class {
  #ctx;
  #by;
  #then;
  #high;
  /** Per player, per counter name: when the current value was reached. */
  #reached = /* @__PURE__ */ new Map();
  /** Join order (first join only; a returning player keeps theirs). */
  #joined = /* @__PURE__ */ new Map();
  #joinSeq = 0;
  constructor(ctx) {
    this.#ctx = ctx;
    const ranking = ctx.game.ranking;
    this.#high = ranking.order === "high";
    this.#by = this.#playerCounter(ranking.by);
    this.#then = ranking.then === void 0 ? null : this.#playerCounter(ranking.then);
    const { bus } = ctx;
    bus.on("player_joined", (event) => {
      if (!this.#joined.has(event.id))
        this.#joined.set(event.id, this.#joinSeq++);
      if (!event.returning && ctx.phase === "playing")
        this.#stampJoin(event.id);
      this.#update();
    });
    bus.on("player_left", (event) => {
      if (!ctx.players.has(event.id))
        this.#forget(event.id);
      this.#update();
    });
    bus.on("counter_changed", (event) => {
      if (event.id !== null && (event.name === this.#by?.name || event.name === this.#then?.name))
        this.#update();
    });
    bus.on("phase_changed", (event) => {
      if (event.phase === "playing")
        this.#update();
    });
    bus.on("match_reset", () => {
      this.#reached = /* @__PURE__ */ new Map();
      for (const id of this.#joined.keys())
        if (!ctx.players.has(id))
          this.#forget(id);
      for (const row of ctx.players.values())
        row.place = 0;
    });
  }
  /** Player ids best first (present and absent); empty when the ranking counter is unusable. */
  rankedPlayers() {
    const by = this.#by;
    if (!by)
      return [];
    const then = this.#then;
    const rows = [...this.#ctx.players.keys()].map((id) => {
      const byNow = this.#stamp(id, by);
      const thenNow = then ? this.#stamp(id, then) : null;
      return {
        id,
        by: byNow.value,
        then: thenNow?.value ?? 0,
        // The current pair of values was reached when the later of the two was.
        at: Math.max(byNow.at, thenNow?.at ?? -Infinity),
        joined: this.#joined.get(id) ?? Infinity
      };
    });
    const sign = this.#high ? -1 : 1;
    rows.sort((a, b) => sign * (a.by - b.by) || sign * (a.then - b.then) || compare(a.at, b.at) || compare(a.joined, b.joined));
    return rows.map((row) => row.id);
  }
  /**
   * The winner by this ranking (the clock's fallback, and `end_match` by the ranking's own counter
   * and order): the first-ranked player if anyone moved (any player's `by` or `then` value differs
   * from its start: `then` orders players too); else nobody.
   */
  leader() {
    const by = this.#by;
    const [first] = this.rankedPlayers();
    if (!by || first === void 0)
      return null;
    const used = this.#then ? [by, this.#then] : [by];
    const moved = [...this.#ctx.players.values()].some((row) => used.some((counter) => (row.counters[counter.name] ?? counter.start) !== counter.start));
    return moved ? { kind: "player", id: first } : null;
  }
  /** Whether `end_match` by this counter and order should use this ranking's tie-breaks. */
  decides(counter, order) {
    return this.#by !== null && this.#by.name === counter && this.#high === (order === "high");
  }
  #update() {
    const ranked = this.rankedPlayers();
    ranked.forEach((id, index) => {
      this.#ctx.players.get(id).place = index + 1;
    });
  }
  /** The value a player has now and when they reached it (a change is stamped with the session clock). */
  #stamp(id, counter) {
    const value = this.#ctx.players.get(id)?.counters[counter.name] ?? counter.start;
    let mine = this.#reached.get(id);
    if (!mine)
      this.#reached.set(id, mine = /* @__PURE__ */ new Map());
    const known = mine.get(counter.name);
    if (known && known.value === value)
      return known;
    const fresh = { value, at: !known && value === counter.start ? -Infinity : this.#ctx.now };
    mine.set(counter.name, fresh);
    return fresh;
  }
  #stampJoin(id) {
    const mine = /* @__PURE__ */ new Map();
    for (const counter of [this.#by, this.#then]) {
      if (!counter)
        continue;
      const value = this.#ctx.players.get(id)?.counters[counter.name] ?? counter.start;
      mine.set(counter.name, { value, at: this.#ctx.now });
    }
    this.#reached.set(id, mine);
  }
  #forget(id) {
    this.#reached.delete(id);
    this.#joined.delete(id);
  }
  #playerCounter(name) {
    const decl = (this.#ctx.game.counters ?? []).find((c) => c.name === name);
    if (decl?.scope === "player")
      return decl;
    this.#ctx.log(decl ? `ranking: counter "${name}" has scope ${decl.scope}, a ranking needs a player counter` : `ranking: unknown counter "${name}"`);
    return null;
  }
};
function compare(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

// ../game/dist/components/respawn.js
var RespawnComponent = class {
  #ctx;
  constructor(ctx) {
    this.#ctx = ctx;
    const { bus } = ctx;
    bus.on("died", (event) => {
      const row = ctx.players.get(event.victim);
      if (row && ctx.game.respawn)
        row.respawnAt = ctx.now + ctx.game.respawn.delaySec * 1e3;
    });
    bus.on("placed", (event) => this.#protect(event.id));
    bus.on("match_reset", () => {
      for (const row of ctx.players.values()) {
        row.respawnAt = null;
        row.protectedUntil = 0;
      }
    });
  }
  /** Brings back the knocked-out whose time has come, during play. */
  tick() {
    const ctx = this.#ctx;
    if (ctx.phase !== "playing" || !ctx.game.respawn)
      return;
    for (const [id, row] of ctx.players) {
      if (row.respawnAt === null || ctx.now < row.respawnAt || !row.present)
        continue;
      row.respawnAt = null;
      this.#protect(id);
      ctx.bus.emit({ type: "respawned", id, at: spotFor(ctx, id) });
    }
  }
  #protect(id) {
    const row = this.#ctx.players.get(id);
    const seconds = this.#ctx.game.respawn?.protectSec ?? 0;
    if (row)
      row.protectedUntil = seconds > 0 ? this.#ctx.now + seconds * 1e3 : 0;
  }
};

// ../game/dist/components/riding.js
var RidingComponent = class {
  #ctx;
  constructor(ctx) {
    this.#ctx = ctx;
    const { bus } = ctx;
    bus.on("player_left", (event) => ctx.riding.delete(event.id));
    bus.on("match_reset", () => ctx.riding.clear());
  }
  /** Only a player who is here gets on; one riding something else gets off it first. */
  mount(id, item, tag, seat) {
    if (!this.#ctx.players.get(id)?.present)
      return;
    const current = this.#ctx.riding.get(id);
    if (current?.item === item)
      return;
    if (current)
      this.dismount(id);
    this.#ctx.riding.set(id, { item, tag });
    this.#ctx.bus.emit({ type: "mounted", id, item, tag, seat });
  }
  dismount(id) {
    const current = this.#ctx.riding.get(id);
    if (!current)
      return;
    this.#ctx.riding.delete(id);
    this.#ctx.bus.emit({ type: "dismounted", id, item: current.item, tag: current.tag });
  }
};

// ../game/dist/components/actions.js
function actorOf(event) {
  if (event.type === "hit" || event.type === "died")
    return event.by;
  return "id" in event ? event.id : null;
}
var ActionRunner = class {
  #ctx;
  #counters;
  #health;
  #ranking;
  /** Actions already run per top-level event. */
  #spent = /* @__PURE__ */ new WeakMap();
  /** Top-level events whose limit was already logged. */
  #limited = /* @__PURE__ */ new WeakSet();
  /** Problems with the game's data already logged. */
  #reported = /* @__PURE__ */ new Set();
  #timers = [];
  #timerSeq = 0;
  constructor(ctx, parts) {
    this.#ctx = ctx;
    this.#counters = parts.counters;
    this.#health = parts.health;
    this.#ranking = parts.ranking;
    ctx.bus.on("match_won", () => {
      this.#timers = [];
    });
    ctx.bus.on("match_reset", () => {
      this.#timers = [];
    });
  }
  /** Whether `event` may still run rules or scripts: not deeper than `RULE_LIMITS.chain` follow-up hops. */
  allowed(event) {
    const { root, depth } = this.#ctx.bus.traceOf(event);
    if (depth <= RULE_LIMITS.chain)
      return true;
    this.#limit(root, `rules: stopped a chain of more than ${RULE_LIMITS.chain} events`);
    return false;
  }
  /**
   * Runs one action for `actor` as a follow-up of the event being delivered. False when the top-level event's budget
   * is spent, or when no event is being delivered (an action always belongs to one).
   */
  run(action, actor) {
    const { bus } = this.#ctx;
    const current = bus.current();
    if (!current)
      return false;
    const { root } = current;
    const spent = this.#spent.get(root) ?? 0;
    if (spent >= RULE_LIMITS.actionsPerEvent) {
      this.#limit(root, `rules: stopped after ${RULE_LIMITS.actionsPerEvent} actions for one event`);
      return false;
    }
    this.#spent.set(root, spent + 1);
    bus.followUp(() => this.#act(action, actor));
    return true;
  }
  /** A counter's value: the actor's own (their team's, or the global one), a player's, a team's; null when none. */
  read(name, target, actor) {
    const decl = this.#declared(name);
    if (!decl)
      return null;
    if (target === "actor") {
      const [who] = this.#counterTargets(decl, "actor", actor);
      return who === void 0 ? null : this.#counters.get(name, who);
    }
    if (target === "global")
      return decl.scope === "global" ? this.#counters.get(name, "global") : null;
    if ("team" in target)
      return decl.scope === "team" ? this.#counters.get(name, { team: target.team }) : null;
    if (decl.scope !== "player" || !this.#ctx.players.has(target.player))
      return null;
    return this.#counters.get(name, { player: target.player });
  }
  /** Raises `timer_fired` for every timer whose time has come, earliest first. */
  tick() {
    const now = this.#ctx.now;
    const due = this.#timers.filter((t) => t.at <= now).sort((a, b) => a.at - b.at || a.seq - b.seq);
    if (due.length === 0)
      return;
    this.#timers = this.#timers.filter((t) => t.at > now);
    for (const t of due)
      this.#ctx.bus.emit({ type: "timer_fired", name: t.name, id: t.id });
  }
  #act(action, actor) {
    const ctx = this.#ctx;
    switch (action.kind) {
      case "add_counter":
      case "set_counter": {
        const decl = this.#declared(action.name);
        if (!decl)
          return;
        for (const who of this.#counterTargets(decl, action.who, actor))
          if (action.kind === "add_counter")
            this.#counters.add(action.name, action.by, who);
          else
            this.#counters.set(action.name, action.to, who);
        return;
      }
      case "add_score":
        if (action.by === 0)
          return;
        for (const id of this.#players(action.who, actor)) {
          const row = ctx.players.get(id);
          row.score += action.by;
          ctx.bus.emit({ type: "score_changed", id, score: row.score });
        }
        return;
      case "end_match":
        if (ctx.phase !== "playing" || ctx.decided)
          return;
        ctx.decided = true;
        ctx.bus.emit({ type: "match_won", winner: this.#pickWinner(action.winner, actor) });
        return;
      case "start_timer": {
        const { name } = action;
        this.#timers = this.#timers.filter((t) => !(t.name === name && t.id === actor));
        this.#timers.push({ name, id: actor, at: ctx.now + action.seconds * 1e3, seq: this.#timerSeq++ });
        return;
      }
      case "damage":
        for (const id of this.#players(action.who, actor))
          this.#health.damage(id, action.amount, null);
        return;
      case "heal":
        for (const id of this.#players(action.who, actor))
          this.#health.heal(id, action.amount);
        return;
      case "teleport_to_zone": {
        const zone = ctx.zones.find((z) => z.tag === action.tag);
        if (!zone) {
          this.#report(`rules: no zone tagged "${action.tag}"`);
          return;
        }
        for (const id of this.#players(action.who, actor))
          if (ctx.players.get(id).present) {
            if (ctx.riding.has(id))
              ctx.bus.emit({ type: "dismount_requested", id });
            ctx.bus.emit({ type: "placed", id, at: { x: zone.x, y: zone.y, z: zone.z, team: "any" } });
          }
        return;
      }
      case "show_message":
        if (action.who === "everyone")
          ctx.bus.emit({ type: "message", id: null, text: action.text });
        else
          for (const id of this.#players(action.who, actor))
            ctx.bus.emit({ type: "message", id, text: action.text });
        return;
      case "emit":
        ctx.bus.emit({ type: "custom", name: action.event, id: actor });
        return;
      case "say":
        if (!action.line)
          return;
        for (const id of this.#players(action.who, actor))
          if (ctx.players.get(id).present)
            ctx.bus.emit({ type: "said", id, line: action.line });
        return;
      case "dismount":
        for (const id of this.#players(action.who, actor))
          ctx.bus.emit({ type: "dismount_requested", id });
        return;
      case "set_speed": {
        const until = ctx.now + action.seconds * 1e3;
        for (const id of this.#players(action.who, actor))
          ctx.bus.emit({ type: "speed_requested", id, factor: action.factor, until });
        return;
      }
    }
  }
  /** The players an action reaches (ids with a row). */
  #players(who, actor) {
    const ctx = this.#ctx;
    if (who === "everyone")
      return presentIds(ctx);
    if (actor === null || !ctx.players.has(actor))
      return [];
    if (who === "actor")
      return [actor];
    const team = ctx.players.get(actor).team;
    if (team === null)
      return [actor];
    return presentIds(ctx).filter((id) => ctx.players.get(id).team === team);
  }
  /** Whose value of a counter an action (or a condition, as `actor`) reaches, by the counter's scope. */
  #counterTargets(decl, who, actor) {
    if (decl.scope === "global")
      return ["global"];
    if (decl.scope === "player")
      return this.#players(who, actor).map((player) => ({ player }));
    if (who === "everyone")
      return [{ team: "red" }, { team: "blue" }];
    const team = actor === null ? null : this.#ctx.players.get(actor)?.team ?? null;
    return team === null ? [] : [{ team }];
  }
  #pickWinner(winner, actor) {
    if (winner === "nobody")
      return null;
    if ("player" in winner)
      return actor !== null && this.#ctx.players.has(actor) ? { kind: "player", id: actor } : null;
    if ("team" in winner)
      return { kind: "team", team: winner.team };
    const decl = this.#declared(winner.byCounter);
    if (!decl)
      return null;
    if (decl.scope === "player" && this.#ranking?.decides(decl.name, winner.order))
      return this.#ranking.leader();
    const better = (a, b) => winner.order === "high" ? a > b : a < b;
    let entries;
    if (decl.scope === "player")
      entries = [...this.#ctx.players].map(([id, row]) => [{ kind: "player", id }, row.counters[decl.name] ?? decl.start]);
    else if (decl.scope === "team")
      entries = ["red", "blue"].map((team) => [{ kind: "team", team }, this.#counters.get(decl.name, { team })]);
    else {
      this.#report(`rules: counter "${decl.name}" is global and cannot pick a winner`);
      return null;
    }
    if (entries.length === 0)
      return null;
    const best = entries.reduce((top, entry) => better(entry[1], top[1]) ? entry : top);
    return entries.filter((entry) => entry[1] === best[1]).length > 1 ? null : best[0];
  }
  #declared(name) {
    const decl = (this.#ctx.game.counters ?? []).find((c) => c.name === name);
    if (!decl)
      this.#report(`rules: unknown counter "${name}"`);
    return decl ?? null;
  }
  #limit(root, message) {
    if (this.#limited.has(root))
      return;
    this.#limited.add(root);
    this.#ctx.log(message);
  }
  #report(message) {
    if (this.#reported.has(message))
      return;
    this.#reported.add(message);
    this.#ctx.log(message);
  }
};

// ../game/dist/components/rules.js
var ENGINE_EVENTS2 = new Set(GameEventName.options);
var RulesComponent = class {
  #ctx;
  #runner;
  #rules;
  constructor(ctx, runner) {
    this.#ctx = ctx;
    this.#runner = runner;
    this.#rules = ctx.game.rules ?? [];
    const { bus } = ctx;
    const types = new Set(this.#rules.map((rule) => ENGINE_EVENTS2.has(rule.when.event) ? rule.when.event : "custom"));
    for (const type of types)
      bus.on(type, (event) => this.#hear(event));
  }
  #hear(event) {
    const matching = this.#rules.filter((rule) => this.#matches(rule, event));
    if (matching.length === 0)
      return;
    if (!this.#runner.allowed(event))
      return;
    const actor = actorOf(event);
    for (const rule of matching) {
      if (!rule.if.every((condition) => this.#holds(condition, actor)))
        continue;
      for (const action of rule.do)
        if (!this.#runner.run(action, actor))
          return;
    }
  }
  #matches(rule, event) {
    const { when } = rule;
    const name = event.type === "custom" ? ENGINE_EVENTS2.has(event.name) ? null : event.name : event.type;
    if (name !== when.event)
      return false;
    if (when.tag !== void 0 && !("tag" in event && event.tag === when.tag))
      return false;
    if (when.counter !== void 0 && !(event.type === "counter_changed" && event.name === when.counter))
      return false;
    return true;
  }
  #holds(condition, actor) {
    const ctx = this.#ctx;
    switch (condition.kind) {
      case "phase":
        return ctx.phase === condition.is;
      case "team":
        return actor !== null && ctx.players.get(actor)?.team === condition.is;
      case "riding": {
        const riding = actor === null ? void 0 : ctx.riding.get(actor);
        const rides = riding !== void 0 && (condition.tag === void 0 || riding.tag === condition.tag);
        return rides === condition.is;
      }
      case "counter": {
        const left = this.#runner.read(condition.name, "actor", actor);
        const right = typeof condition.value === "number" ? condition.value : this.#runner.read(condition.value.counter, "actor", actor);
        if (left === null || right === null)
          return false;
        switch (condition.op) {
          case "=":
            return left === right;
          case "!=":
            return left !== right;
          case "<":
            return left < right;
          case "<=":
            return left <= right;
          case ">":
            return left > right;
          case ">=":
            return left >= right;
        }
      }
    }
  }
};

// ../game/dist/components/score.js
var ScoreComponent = class {
  constructor(ctx) {
    const { bus } = ctx;
    bus.on("died", (event) => {
      const score = ctx.game.score;
      if (!score || event.by === null || event.by === event.victim)
        return;
      const killer = ctx.players.get(event.by);
      const victim = ctx.players.get(event.victim);
      if (!killer || !victim)
        return;
      if (victim.team !== null && victim.team === killer.team)
        return;
      killer.kills += 1;
      if (score.from !== "kills")
        return;
      killer.score += 1;
      bus.emit({ type: "score_changed", id: event.by, score: killer.score });
    });
    bus.on("match_reset", () => {
      for (const row of ctx.players.values()) {
        row.score = 0;
        row.kills = 0;
      }
    });
  }
};

// ../game/dist/components/teams.js
var TeamsComponent = class {
  #ctx;
  constructor(ctx) {
    this.#ctx = ctx;
    ctx.bus.on("phase_changed", (event) => {
      if (event.phase === "playing")
        this.#balance();
    });
  }
  get #on() {
    return this.#ctx.game.teams?.mode === "two";
  }
  /** Puts a new player on the team with fewer present players (red on a tie). */
  assign(id) {
    const row = this.#ctx.players.get(id);
    if (!row || !this.#on)
      return;
    const count = (team) => [...this.#ctx.players.values()].filter((p) => p.present && p.team === team).length;
    row.team = count("blue") < count("red") ? "blue" : "red";
  }
  /** Whether `by` may hurt `victim`: never teammates, unless friendly fire is on. */
  canHurt(by, victim) {
    const teams = this.#ctx.game.teams;
    if (!this.#on || teams?.friendlyFire)
      return true;
    const a = this.#ctx.players.get(by)?.team ?? null;
    return a === null || a !== (this.#ctx.players.get(victim)?.team ?? null);
  }
  /** Moves the latest joiners from the bigger team to the smaller until they differ by at most one. */
  #balance() {
    if (!this.#on)
      return;
    const members = (team) => [...this.#ctx.players].filter(([, p]) => p.present && p.team === team);
    for (; ; ) {
      const red = members("red");
      const blue = members("blue");
      if (Math.abs(red.length - blue.length) <= 1)
        return;
      const [from, to] = red.length > blue.length ? [red, "blue"] : [blue, "red"];
      const [id, row] = from[from.length - 1];
      row.team = to;
      this.#ctx.bus.emit({ type: "team_changed", id, team: to });
    }
  }
};

// ../game/dist/components/win.js
function teamScores(ctx) {
  const scores = { red: 0, blue: 0 };
  for (const player of ctx.players.values())
    if (player.team)
      scores[player.team] += player.score;
  return scores;
}
var WinComponent = class {
  #ctx;
  #winner = null;
  /** When to look again at who is left (a leave within the grace); null for no check pending. */
  #standingCheckAt = null;
  constructor(ctx) {
    this.#ctx = ctx;
    const { bus } = ctx;
    bus.on("time_up", () => this.#decide(this.#leader()));
    bus.on("score_changed", () => {
      const goal = ctx.game.score?.goal;
      if (goal !== void 0 && this.#reached(goal))
        this.#decide(this.#leader());
    });
    bus.on("player_left", () => this.#checkStanding());
    bus.on("solo_changed", () => this.#checkStanding());
    bus.on("match_reset", () => {
      this.#winner = null;
      this.#standingCheckAt = null;
    });
  }
  get winner() {
    return this.#winner;
  }
  tick() {
    if (this.#standingCheckAt === null || this.#ctx.now < this.#standingCheckAt)
      return;
    this.#standingCheckAt = null;
    const winner = this.#lastStanding();
    if (winner !== void 0)
      this.#decide(winner);
  }
  #decide(winner) {
    if (this.#ctx.phase !== "playing" || this.#ctx.decided)
      return;
    this.#ctx.decided = true;
    this.#winner = winner;
    this.#standingCheckAt = null;
    this.#ctx.bus.emit({ type: "match_won", winner });
  }
  #checkStanding() {
    const ctx = this.#ctx;
    if (ctx.phase !== "playing")
      return;
    const winner = this.#lastStanding();
    if (winner === void 0)
      return;
    if (ctx.leaveGraceMs === 0 || presentIds(ctx).length === 0)
      this.#decide(winner);
    else
      this.#standingCheckAt ??= ctx.now + ctx.leaveGraceMs;
  }
  /** The winner when play must end because of who is left; undefined while the match goes on. */
  #lastStanding() {
    const ctx = this.#ctx;
    const present = presentIds(ctx);
    if (present.length === 0)
      return null;
    if (ctx.solo)
      return void 0;
    if (ctx.game.teams?.mode === "two") {
      const teams = new Set(present.map((id) => ctx.players.get(id).team));
      return teams.size === 1 ? { kind: "team", team: [...teams][0] } : void 0;
    }
    return present.length === 1 ? { kind: "player", id: present[0] } : void 0;
  }
  #reached(goal) {
    const scores = this.#ctx.game.teams?.mode === "two" ? Object.values(teamScores(this.#ctx)) : [...this.#ctx.players.values()].map((p) => p.score);
    return scores.some((score) => score >= goal);
  }
  /** Highest score wins, among the players who are here (or the teams); a tie has no winner. */
  #leader() {
    const ctx = this.#ctx;
    if (ctx.game.teams?.mode === "two") {
      const { red, blue } = teamScores(ctx);
      return red === blue ? null : { kind: "team", team: red > blue ? "red" : "blue" };
    }
    const ranked = [...ctx.players].filter(([, p]) => p.present).sort(([, a], [, b]) => b.score - a.score);
    if (ranked.length === 0 || ranked[1] && ranked[1][1].score === ranked[0][1].score)
      return null;
    return { kind: "player", id: ranked[0][0] };
  }
};

// ../game/dist/components/zones.js
var ZONE_HEIGHT = 8;
function local(zone, p) {
  const dx = p.x - zone.x;
  const dz = p.z - zone.z;
  return {
    across: dx * Math.cos(zone.yaw) - dz * Math.sin(zone.yaw),
    along: dx * Math.sin(zone.yaw) + dz * Math.cos(zone.yaw),
    dy: p.y - zone.y
  };
}
function crossesZoneGate(from, to, zone) {
  const a = local(zone, from);
  const b = local(zone, to);
  if (a.along >= 0 || b.along < 0)
    return false;
  const t = a.along / (a.along - b.along);
  if (Math.abs(a.dy + (b.dy - a.dy) * t) > ZONE_HEIGHT)
    return false;
  return Math.abs(a.across + (b.across - a.across) * t) <= zone.width / 2;
}
function insideZoneArea(p, zone) {
  const l = local(zone, p);
  return Math.abs(l.across) <= zone.width / 2 && Math.abs(l.along) <= zone.depth / 2 && Math.abs(l.dy) <= ZONE_HEIGHT;
}
function segmentTouchesArea(from, to, zone) {
  const a = local(zone, from);
  const b = local(zone, to);
  let t0 = 0;
  let t1 = 1;
  const slabs = [
    [a.across, b.across, zone.width / 2],
    [a.along, b.along, zone.depth / 2],
    [a.dy, b.dy, ZONE_HEIGHT]
  ];
  for (const [start, end, half] of slabs) {
    const delta = end - start;
    if (delta === 0) {
      if (Math.abs(start) > half)
        return false;
      continue;
    }
    let near = (-half - start) / delta;
    let far = (half - start) / delta;
    if (near > far)
      [near, far] = [far, near];
    t0 = Math.max(t0, near);
    t1 = Math.min(t1, far);
    if (t0 > t1)
      return false;
  }
  return true;
}
var ZonesComponent = class {
  #ctx;
  /** The last trusted position per player; absent right after a jump (no event is judged across it). */
  #last = /* @__PURE__ */ new Map();
  constructor(ctx) {
    this.#ctx = ctx;
    const { bus } = ctx;
    bus.on("phase_changed", () => this.#last.clear());
    bus.on("player_joined", (event) => {
      if (event.returning)
        this.#last.delete(event.id);
    });
    bus.on("player_left", (event) => this.#last.delete(event.id));
    bus.on("placed", (event) => this.#last.delete(event.id));
    bus.on("respawned", (event) => this.#last.delete(event.id));
    bus.on("relocated", (event) => this.#last.delete(event.id));
    bus.on("match_reset", () => this.#last.clear());
  }
  /** Judges every present player's move since the last tick against every zone. */
  tick() {
    const ctx = this.#ctx;
    if (ctx.phase !== "playing" || ctx.zones.length === 0)
      return;
    for (const id of presentIds(ctx)) {
      const at = ctx.positions(id);
      if (!at) {
        this.#last.delete(id);
        continue;
      }
      const from = this.#last.get(id);
      this.#last.set(id, at);
      if (from)
        for (const zone of ctx.zones)
          this.#judge(id, zone, from, at);
    }
  }
  #judge(id, zone, from, to) {
    const bus = this.#ctx.bus;
    const base = { id, zone: zone.id, tag: zone.tag };
    if (zone.shape === "gate") {
      if (crossesZoneGate(from, to, zone))
        bus.emit({ type: "zone_crossed", ...base });
      return;
    }
    const wasIn = insideZoneArea(from, zone);
    const isIn = insideZoneArea(to, zone);
    const touches = !wasIn && !isIn && segmentTouchesArea(from, to, zone);
    if (!wasIn && (isIn || touches))
      bus.emit({ type: "zone_entered", ...base });
    if (!isIn && (wasIn || touches))
      bus.emit({ type: "zone_exited", ...base });
  }
};

// ../game/dist/session.js
var anyTool = () => ({ damage: 0, reach: 0, arcDeg: 0, cooldownSec: 0 });
var GameSession = class {
  #ctx;
  #match;
  #teams;
  #health;
  #respawn;
  #loadout;
  #zones;
  #counters;
  #ranking;
  #win;
  /** The rules' and scripts' actions, budgets and timers; null with neither rules nor scripts. */
  #actions;
  #riding;
  /** Server ms when the current match began. */
  #matchStartedAt;
  /** The winner of this match (every decider raises `match_won` at most once per match). */
  #winner = null;
  constructor(game, spawns, now, options = {}) {
    const bus = new EventBus();
    this.#ctx = {
      game,
      bus,
      players: /* @__PURE__ */ new Map(),
      positions: options.positions ?? (() => null),
      tools: options.tools ?? anyTool,
      leaveGraceMs: options.leaveGraceMs ?? 0,
      log: options.log ?? ((message) => console.warn(message)),
      now,
      phase: "waiting",
      endsAt: null,
      decided: false,
      solo: false,
      spawns,
      zones: options.zones ?? [],
      riding: /* @__PURE__ */ new Map()
    };
    this.#matchStartedAt = now;
    bus.on("match_reset", () => {
      this.#matchStartedAt = this.#ctx.now;
      for (const [id, row] of this.#ctx.players)
        if (!row.present)
          this.#ctx.players.delete(id);
      this.#ctx.decided = false;
      this.#winner = null;
    });
    bus.on("phase_changed", (event) => {
      if (event.phase === "playing") {
        this.#ctx.decided = false;
        this.#winner = null;
      }
    });
    bus.on("match_won", (event) => {
      this.#winner = event.winner;
    });
    this.#match = new MatchComponent(this.#ctx, () => this.#ranking?.leader() ?? null);
    this.#teams = new TeamsComponent(this.#ctx);
    this.#health = new HealthComponent(this.#ctx);
    this.#respawn = new RespawnComponent(this.#ctx);
    new PlacementComponent(this.#ctx);
    this.#loadout = new LoadoutComponent(this.#ctx);
    this.#zones = new ZonesComponent(this.#ctx);
    this.#counters = new CountersComponent(this.#ctx);
    this.#riding = new RidingComponent(this.#ctx);
    this.#ranking = game.ranking ? new RankingComponent(this.#ctx) : null;
    new ScoreComponent(this.#ctx);
    this.#win = game.win ? new WinComponent(this.#ctx) : null;
    const rules = Boolean(game.rules?.length);
    this.#actions = rules || options.scripts ? new ActionRunner(this.#ctx, { counters: this.#counters, health: this.#health, ranking: this.#ranking }) : null;
    if (rules)
      new RulesComponent(this.#ctx, this.#actions);
    if (options.scripts)
      this.#attachScripts(options.scripts, this.#actions);
    this.#run(now, () => this.#match.start());
  }
  get bus() {
    return this.#ctx.bus;
  }
  /** A player already here is left alone; one who left mid-match comes back to their row. */
  join(id, now) {
    this.#run(now, () => {
      const existing = this.#ctx.players.get(id);
      if (existing?.present)
        return;
      if (existing)
        existing.present = true;
      else {
        this.#ctx.players.set(id, newRow());
        this.#teams.assign(id);
      }
      this.bus.emit({ type: "player_joined", id, team: this.#ctx.players.get(id).team, returning: Boolean(existing) });
    });
  }
  /** During play and the results a leaver keeps their row (score, winner, place) until the next match. */
  leave(id, now) {
    this.#run(now, () => {
      const player = this.#ctx.players.get(id);
      if (!player)
        return;
      if (this.#ctx.phase === "playing" || this.#ctx.phase === "results")
        player.present = false;
      else
        this.#ctx.players.delete(id);
      this.bus.emit({ type: "player_left", id });
    });
  }
  setSolo(on, now) {
    this.#run(now, () => {
      if (this.#ctx.solo === on)
        return;
      this.#ctx.solo = on;
      this.bus.emit({ type: "solo_changed", on });
    });
  }
  tick(now) {
    this.#run(now, () => this.#respawn.tick());
    this.#run(now, () => this.#win?.tick());
    this.#run(now, () => this.#zones.tick());
    this.#run(now, () => this.#actions?.tick());
    this.#run(now, () => this.#match.tick());
  }
  /**
   * A strike of the tool in hand reaching `targets` (the caller finds them from the positions it
   * trusts). Each target is one change: a goal reached by the first ends the match before the next.
   */
  attack(id, tool, targets, now) {
    this.#ctx.now = now;
    const attacker = this.#ctx.players.get(id);
    if (this.#ctx.phase !== "playing" || !attacker?.present)
      return "not_playing";
    if (!attacker.alive)
      return "dead";
    if (!attacker.tool)
      return "no_tool";
    const result = this.#loadout.use(id, tool);
    if (result !== "ok")
      return result;
    this.#run(now, () => this.bus.emit({ type: "struck", id }));
    for (const target of targets)
      this.#run(now, () => {
        if (this.#teams.canHurt(id, target))
          this.#health.damage(target, tool.damage, id);
      });
    return "ok";
  }
  /** Harm without a strike (zones, falls later); `by` is null when nobody caused it. */
  damage(victim, amount, by, now) {
    this.#run(now, () => this.#health.damage(victim, amount, by));
  }
  /** The counters of this game (the rules interpreter reads and changes them). */
  get counters() {
    return this.#counters;
  }
  /** The tool in a player's hand, or null (none, or the item is not a tool). */
  toolOf(id) {
    return this.#loadout.toolOf(id);
  }
  /** The place's spawn points changed (a builder moved one): later spawns use the new ones. */
  setSpawns(spawns) {
    this.#ctx.spawns = spawns;
  }
  /** The place's zones changed (a builder moved one): they are judged as given from the next tick. */
  setZones(zones) {
    this.#ctx.zones = zones;
  }
  /** Where a player would come back, away from the given opponent positions. */
  respawnSpot(id, opponents) {
    return pickSpawn(this.#ctx.spawns, this.#ctx.players.get(id)?.team ?? null, opponents);
  }
  /** Whether a player is knocked out during play (a cheap check, without copying the view). */
  isDown(id) {
    const row = this.#ctx.players.get(id);
    return this.#ctx.phase === "playing" && row !== void 0 && row.present && !row.alive;
  }
  /**
   * A player got on a rideable item (the room checked it): `item` is its instance id, `tag` its ride
   * tag ('' for none), `seat` from 1. Only for a player who is here.
   */
  mount(id, item, tag, seat, now) {
    this.#run(now, () => this.#riding.mount(id, item, tag, seat));
  }
  /** A player got off what they ride (nothing when they ride nothing). */
  dismount(id, now) {
    this.#run(now, () => this.#riding.dismount(id));
  }
  /** The room moved a player's body itself (a seat, an exit spot, a correction): no zone judges the jump. */
  relocated(id, now) {
    this.#run(now, () => this.bus.emit({ type: "relocated", id }));
  }
  /** What a player rides (instance id and ride tag), or null. */
  ridingOf(id) {
    const riding = this.#ctx.riding.get(id);
    return riding ? { ...riding } : null;
  }
  /** A copy of the state; changing it changes nothing here. */
  view() {
    const players = new Map([...this.#ctx.players].map(([id, row]) => [id, { ...row, items: [...row.items], counters: { ...row.counters } }]));
    return {
      phase: this.#ctx.phase,
      endsAt: this.#ctx.endsAt,
      players,
      teamScores: teamScores(this.#ctx),
      winner: this.#winner,
      teamCounters: this.#counters.teamValues(),
      globalCounters: this.#counters.globalValues()
    };
  }
  /** Subscribes a script host after the rules; it hears only events within the rules' chain limit. */
  #attachScripts(host, actions) {
    const ctx = this.#ctx;
    const api = {
      act: (action, actor) => actions.run(action, actor),
      view: () => this.view(),
      now: () => ctx.now,
      zones: () => ctx.zones.map((zone) => ({ ...zone })),
      ridingOf: (id) => this.ridingOf(id),
      actorOf,
      matchStartedAt: () => this.#matchStartedAt,
      counter: (name, of) => actions.read(name, of, null),
      counterScope: (name) => (ctx.game.counters ?? []).find((c) => c.name === name)?.scope ?? null,
      caused: (event) => ctx.bus.traceOf(event).root !== event
    };
    host.attach?.(api);
    for (const type of new Set(host.events))
      ctx.bus.on(type, (event) => {
        if (actions.allowed(event))
          host.hear(event, api);
      });
    ctx.bus.on("match_reset", () => host.matchReset());
  }
  /** Applies one change at time `now`, then delivers the events it raised. */
  #run(now, change) {
    this.#ctx.now = now;
    change();
    this.#ctx.bus.flush();
  }
};

// ../script/dist/dry-run.js
var TICK = 100;
var MAX_TICKS = 36e3;
var STEP = 2;
var MAX_PLAYERS = 8;
var ENGINE_RAISED = /* @__PURE__ */ new Set([
  "phase_changed",
  "time_up",
  "counter_changed",
  "timer_fired",
  "respawned"
]);
async function dryRun(input) {
  const recorded = input.recording;
  const events = recorded ? recorded.events.map((event, i) => ({
    ...event,
    ...recorded.at?.[i] === void 0 ? {} : { at: recorded.at[i] },
    ...recorded.caused?.[i] ? { caused: true } : {}
  })) : input.events ?? [];
  if (!recorded && events.length > SCRIPT_LIMITS.testEvents)
    throw new Error(`a dry run takes at most ${SCRIPT_LIMITS.testEvents} events`);
  const game = input.game ?? input.doc?.game;
  if (!game)
    throw new Error("the place has no game; scripts run only in places with a game");
  const place = {
    game,
    zones: input.zones ?? (input.doc ? zonesOf(input.doc) : []),
    spawns: input.spawns ?? (input.doc ? spawnSpots(input.doc) : [])
  };
  const players = input.players ?? 2;
  if (!Number.isInteger(players) || players < 1 || players > MAX_PLAYERS)
    throw new Error(`a dry run has 1 to ${MAX_PLAYERS} players`);
  const scripts = input.only ? input.scripts.filter((s) => s.id === input.only).map((s) => ({ ...s, enabled: true })) : input.scripts;
  if (input.only && scripts.length === 0)
    throw new Error(`no script ${input.only}`);
  const seed = recorded?.seed ?? input.seed ?? 1;
  const module = input.module ?? await createScriptModule();
  const log = [];
  const requested = [];
  const runner = new ScriptRunner(scripts, {
    placeSeed: "dry-run",
    seed,
    module,
    onLog: (line) => log.push(line),
    onRequest: (request) => requested.push(request)
  });
  try {
    return replay(place, Boolean(recorded), events, players, runner, {
      log,
      requested,
      wallMs: input.wallMs ?? SCRIPT_LIMITS.dryRunMs
    });
  } finally {
    runner.dispose();
    if (!input.module)
      module.dispose();
  }
}
function replay(input, fromRecording, events, players, runner, out) {
  const deadline = performance.now() + out.wallMs;
  let stopped;
  const overCap = () => {
    if (stopped !== void 0)
      return true;
    if (performance.now() <= deadline)
      return false;
    stopped = `the dry run stopped after ${out.wallMs} ms of wall time (at ${(now / 1e3).toFixed(1)} s of the match clock); test fewer events or a shorter time`;
    runner.switchOff("the dry run stopped on its time limit");
    out.log.push({ at: now, script: "", level: "off", text: stopped });
    return true;
  };
  const positions = /* @__PURE__ */ new Map();
  const spawns = input.spawns.length ? input.spawns : [{ x: 0, y: 0, z: 0, team: "any" }];
  const start = spawns[0];
  let now = 0;
  let ticks = 0;
  const session = new GameSession(input.game, spawns, now, {
    positions: (id) => positions.get(id) ?? null,
    tools: (itemId) => getLibraryItem(itemId)?.manifest.tool ?? null,
    leaveGraceMs: 0,
    zones: input.zones,
    log: () => {
    },
    scripts: runner
  });
  const bus = session.bus;
  const move = (event) => positions.set(event.id, { x: event.at.x, y: event.at.y, z: event.at.z });
  bus.on("placed", move);
  bus.on("respawned", move);
  const getOff = (id) => {
    if (session.ridingOf(id))
      session.dismount(id, now);
  };
  bus.on("died", (event) => getOff(event.victim));
  bus.on("dismount_requested", (event) => getOff(event.id));
  const zoneEvents = [];
  for (const type of ["zone_entered", "zone_exited", "zone_crossed"])
    bus.on(type, (event) => zoneEvents.push(event));
  const ids = [];
  const idOf = (handle) => {
    if (!handle)
      return void 0;
    const n = /^p(\d+)$/.exec(handle);
    return n ? ids[Number(n[1]) - 1] : void 0;
  };
  const present = (id) => session.view().players.get(id)?.present === true;
  const tick = () => {
    if (ticks >= MAX_TICKS || overCap())
      return false;
    ticks += 1;
    now += TICK;
    session.tick(now);
    return true;
  };
  const advanceTo = (at) => {
    if (at === void 0)
      return;
    while (now + TICK <= at && tick())
      ;
    if (now < at && ticks < MAX_TICKS && stopped === void 0)
      now = at;
  };
  const join = (id) => {
    if (!positions.has(id))
      positions.set(id, { x: start.x, y: start.y, z: start.z });
    session.join(id, now);
  };
  const joins = events.some((event) => event.type === "player_joined" && !event.caused);
  if (!joins)
    for (let k = 1; k <= players; k += 1) {
      ids.push(`dry-${k}`);
      join(`dry-${k}`);
    }
  const expected = joins ? new Set(events.flatMap((e) => e.type === "player_joined" ? [e.id] : [])).size : players;
  if (expected < input.game.match.minPlayers)
    session.setSolo(true, now);
  const timed = events.some((event) => event.at !== void 0);
  let playing = timed;
  const ensurePlaying = () => {
    if (playing)
      return;
    playing = true;
    for (let i = 0; i < 1e3 && session.view().phase !== "playing"; i += 1)
      if (!tick())
        break;
  };
  const skipped = [];
  events.forEach((event, index) => {
    const refuse = (why) => skipped.push({ index, type: event.type, why });
    if (event.caused || overCap())
      return;
    if (ENGINE_RAISED.has(event.type)) {
      if (!fromRecording)
        refuse("the engine raises this event itself; give later times (at) and let the clock raise it");
      return;
    }
    if (event.type !== "player_joined")
      ensurePlaying();
    const known = (handle, what = "player") => {
      const id = idOf(handle);
      if (id === void 0)
        refuse(`unknown ${what} handle "${handle}" (players here: ${handles(ids)})`);
      return id;
    };
    switch (event.type) {
      case "player_joined": {
        advanceTo(event.at);
        const id = idOf(event.id);
        if (id === void 0) {
          const next = `p${ids.length + 1}`;
          if (event.id !== next)
            return refuse(`handles are given in join order: the next new player is ${next}`);
          ids.push(`dry-${ids.length + 1}`);
          join(ids[ids.length - 1]);
          return;
        }
        if (present(id))
          return refuse(`${event.id} is already here`);
        join(id);
        return;
      }
      case "player_left": {
        const id = known(event.id);
        if (id === void 0)
          return;
        advanceTo(event.at);
        if (!present(id))
          return refuse(`${event.id} is not here`);
        session.leave(id, now);
        return;
      }
      case "zone_entered":
      case "zone_exited":
      case "zone_crossed": {
        const id = known(event.id);
        if (id === void 0)
          return;
        if (!present(id))
          return refuse(`${event.id} is not here`);
        const shape = event.type === "zone_crossed" ? "gate" : "area";
        const zone = input.zones.find((z) => z.id === event.zone && z.shape === shape) ?? input.zones.find((z) => z.tag === event.tag && z.shape === shape);
        if (!zone)
          return refuse(`the place has no zone ${shape} "${event.zone}" or with the tag "${event.tag}"`);
        if (event.at !== void 0)
          advanceTo(event.at - 2 * TICK);
        const [from, to] = passage(zone, event.type);
        positions.set(id, from);
        session.relocated(id, now);
        tick();
        zoneEvents.length = 0;
        positions.set(id, to);
        tick();
        const happened = zoneEvents.some((z) => z.type === event.type && "id" in z && z.id === id && "zone" in z && z.zone === zone.id);
        if (!happened)
          refuse(`the zone did not count the move (zones are judged while playing; the phase is ${session.view().phase})`);
        return;
      }
      case "hit":
      case "died": {
        const victim = known(event.victim);
        if (victim === void 0)
          return;
        const by = event.by === null ? null : known(event.by);
        if (by === void 0)
          return;
        advanceTo(event.at);
        const row = session.view().players.get(victim);
        if (!row?.present)
          return refuse(`${event.victim} is not here`);
        if (!row.alive) {
          if (event.type === "died" && fromRecording)
            return;
          return refuse(`${event.victim} is already knocked out`);
        }
        session.damage(victim, event.type === "hit" ? event.damage : row.health, by, now);
        return;
      }
      case "mounted": {
        const id = known(event.id);
        if (id === void 0)
          return;
        advanceTo(event.at);
        if (!present(id))
          return refuse(`${event.id} is not here`);
        session.mount(id, event.item, event.tag, event.seat, now);
        return;
      }
      case "dismounted": {
        const id = known(event.id);
        if (id === void 0)
          return;
        advanceTo(event.at);
        if (!session.ridingOf(id))
          return refuse(`${event.id} rides nothing`);
        session.dismount(id, now);
        return;
      }
      case "custom": {
        const id = event.id === null ? null : known(event.id);
        if (id === void 0)
          return;
        advanceTo(event.at);
        bus.emit({ type: "custom", name: event.name, id });
        bus.flush();
        return;
      }
    }
  });
  const view = session.view();
  const handleOf = (id) => `p${ids.indexOf(id) + 1}`;
  const status = runner.status();
  return {
    requested: out.requested,
    skipped,
    counters: {
      players: Object.fromEntries([...view.players].map(([id, row]) => [handleOf(id), { ...row.counters }])),
      teams: { red: { ...view.teamCounters.red }, blue: { ...view.teamCounters.blue } },
      global: { ...view.globalCounters }
    },
    players: ids.map(handleOf),
    phase: view.phase,
    now,
    log: out.log,
    ticks: status.reduce((sum, s) => sum + s.ticks, 0),
    status,
    ...stopped === void 0 ? {} : { stopped }
  };
}
var handles = (ids) => ids.length ? ids.map((_, i) => `p${i + 1}`).join(", ") : "none";
function passage(zone, type) {
  const fx = Math.sin(zone.yaw);
  const fz = Math.cos(zone.yaw);
  const at = (d) => ({ x: zone.x + fx * d, y: zone.y, z: zone.z + fz * d });
  if (type === "zone_crossed")
    return [at(-STEP), at(STEP)];
  const outside = at(-(zone.depth / 2 + STEP));
  const inside = at(0);
  return type === "zone_entered" ? [outside, inside] : [inside, outside];
}

// ../script/dist/review.js
function reviewFixture() {
  const game = newGame();
  const doc = WorldDocument.parse({
    schemaVersion: 1,
    experienceId: "exp-review-example",
    version: 0,
    style: { base: "blocky" },
    sizeTier: "small",
    access: { mode: "private" },
    environment: { sky: { preset: "day" }, weather: { preset: "clear" } },
    terrain: {},
    spawn: { position: [0, 1, 0] },
    instances: [
      { instanceId: "spawn-1", itemId: SPAWN_POINT_ID, transform: { position: [-2, 0, 0] } },
      { instanceId: "spawn-2", itemId: SPAWN_POINT_ID, transform: { position: [2, 0, 0] } },
      {
        instanceId: "gate-1",
        itemId: ZONE_GATE_ID,
        transform: { position: [0, 0, 10] },
        params: { zoneTag: "line" }
      }
    ],
    game: { ...game, match: { ...game.match, countdownSec: 0 } }
  });
  const events = [
    { type: "player_joined", id: "p1", team: null, returning: false, at: 0 },
    { type: "player_joined", id: "p2", team: null, returning: false, at: 0 },
    { type: "zone_crossed", id: "p1", zone: "gate-1", tag: "line", at: 1e3 },
    { type: "zone_crossed", id: "p2", zone: "gate-1", tag: "line", at: 2e3 },
    { type: "player_left", id: "p2", at: 8e3 }
  ];
  return { doc, events };
}
export {
  ENGINE_EVENTS,
  HANDLER_TICKS,
  HEAP_CHECK_EVERY,
  Handles,
  LogRing,
  MODULE_MEMORY,
  PRELUDE_FILE,
  QUICKJS_WASM_SHA256,
  Recording,
  SANDBOX_DEFAULTS,
  SCRIPT_EVENT_TYPES,
  START_DEFAULTS,
  START_TICKS,
  ScriptGuard,
  ScriptRunner,
  compileCheck,
  createScriptModule,
  cutLine,
  dryRun,
  hash32,
  matchSeed,
  mulberry32,
  prelude,
  reviewFixture,
  scriptEventName,
  scriptSeed,
  spawnSpots,
  toScriptEvent,
  zonesOf
};
//# sourceMappingURL=dist-N42YE32G.js.map
