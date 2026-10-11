import { Action, RULE_LIMITS, SCRIPT_LIMITS, ProductReceipt, ScriptProductPurchase, type PlaceScript } from '@genvr/contracts';
import type { GameEvent, ScriptHost, ScriptSessionApi, SessionView, TeamName } from '@genvr/game';
import { ScriptGuard, WINDOW_MS, windowSum } from './guard.js';
import { Handles } from './handles.js';
import { cutLine, LogRate, LogRing, type ScriptLogLine } from './log.js';
import { prelude, PRELUDE_FILE } from './prelude.js';
import { matchSeed, scriptSeed } from './random.js';
import {
  Recording,
  SCRIPT_EVENT_TYPES,
  scriptEventName,
  toScriptEvent,
  type FullRecording,
} from './recording.js';
import type { SandboxLimits } from './limits.js';
import type { SandboxResult, ScriptModule, ScriptSandbox } from './sandbox.js';

declare const performance: { now(): number };

/** One action a script asked for, and what the engine answered (the dry-run harness lists them). */
export interface ScriptRequest {
  /** The script's id. */
  script: string;
  /** The parsed action, or the raw value when it did not parse. */
  action: Action | unknown;
  /** The actor as a handle (null for none). */
  actor: string | null;
  accepted: boolean;
  why?: string;
}

export interface ScriptStatus {
  id: string;
  name: string;
  state: 'running' | 'off' | 'not_compiled';
  strikes: number;
  errors: number;
  /** Handler time in the last second of the budget clock. */
  msLastSecond: number;
  /** Interrupt ticks used this match (deterministic for the same code and events). */
  ticks: number;
}

export interface RunnerOptions {
  /** The place id (or any stable text): the match seeds come from it. */
  placeSeed: string;
  /** The room's WASM module (spec 5.1); the runner never disposes it. */
  module: ScriptModule;
  /** Every log line as it is written (the room sends them to builders). */
  onLog?: (line: ScriptLogLine) => void;
  /** Every action a script asked for, accepted or not. */
  onRequest?: (request: ScriptRequest) => void;
  /** At every match start and every switch-off. */
  onStatus?: (status: ScriptStatus[]) => void;
  /**
   * A problem the server log should know (a watchdog switch-off, a host-side failure). Never carries script source,
   * names or log text; the room adds the place id.
   */
  onIncident?: (message: string) => void;
  /** Wall clock in ms for the time budgets and the watchdog (default `performance.now`). */
  clock?: () => number;
  /** The first match's seed (the harness passes its own); later matches derive theirs from it. */
  seed?: number;
  /**
   * The place's script time and kills across games (a room keeps one for its life; second review, critical 1 and 2).
   * A runner without one makes its own.
   */
  guard?: ScriptGuard;
}

const START_LIMITS: SandboxLimits = Object.freeze({
  memoryBytes: SCRIPT_LIMITS.memoryBytes,
  stackBytes: SCRIPT_LIMITS.stackBytes,
  ticks: SCRIPT_LIMITS.startTicks,
  wallMs: SCRIPT_LIMITS.startMs,
});
const HANDLER_LIMITS: SandboxLimits = Object.freeze({
  memoryBytes: SCRIPT_LIMITS.memoryBytes,
  stackBytes: SCRIPT_LIMITS.stackBytes,
  ticks: SCRIPT_LIMITS.handlerTicks,
  wallMs: SCRIPT_LIMITS.handlerMs,
});
/** The prelude is the host's own code; it gets the top-level budget of its own. */
const PRELUDE_LIMITS = START_LIMITS;
/** The prelude's end-of-call hook (see `prelude`). */
const END_OF_CALL = 0;

/** The kinds of refused requests: the de-dup keys of the refusal log lines. */
type RefusalKey =
  | 'top'
  | 'acts'
  | 'size'
  | 'json'
  /** With the schema path of the first issue (`action (kind)`): bounded by the action schema, not creator text. */
  | `action${string}`
  | 'options'
  | 'actor'
  | 'counter'
  | 'zone'
  | 'rules'
  | 'reads';
/** At most this many refusal keys are remembered per script and match (there are fewer kinds). */
const REFUSAL_KEYS = 16;

interface Handler {
  name: string;
  handle: number;
}

interface Script {
  readonly source: PlaceScript;
  readonly index: number;
  box: ScriptSandbox | null;
  state: ScriptStatus['state'];
  handlers: Handler[];
  strikes: number;
  errors: number;
  ticks: number;
  /** Handler calls in the budget window: when (clock) and how long. */
  usage: Array<{ at: number; ms: number }>;
  /** Skipping handlers because the script used its share of the last second (one strike when it began). */
  overBudget: boolean;
  refused: Set<RefusalKey>;
  rate: LogRate;
  /** Not started yet this match (the place's budget was used, or its worker was starting); tried again later. */
  waiting: boolean;
}

/** A start the place's budget refused is tried again this much later (budget clock ms). */
const START_RETRY_MS = 1000;

interface Call {
  script: Script;
  top: boolean;
  /** The event's actor (a player id), the default `who` of an action. */
  actor: string | null;
  acts: number;
  reads: number;
  view: SessionView | null;
}

/**
 * Runs the scripts of one session (spec 5): one sandbox per enabled script per match, handles instead of accounts,
 * the budgets of `SCRIPT_LIMITS`, the log and the recording. Implements the session's `ScriptHost`: every action goes
 * through `ScriptSessionApi.act`, the rules' `ActionRunner`. Never throws into the session.
 */
export class ScriptRunner implements ScriptHost {
  readonly events: ReadonlyArray<GameEvent['type']>;
  readonly #options: RunnerOptions;
  readonly #clock: () => number;
  readonly #scripts: Script[];
  readonly #handles = new Handles();
  readonly #log = new LogRing();
  readonly #recording: Recording;
  #api: ScriptSessionApi | null = null;
  #productContext: { receiptId: string; actorId: string; activated: boolean } | null = null;
  #productDecisions = new Map<string, boolean>();
  #productSession = false;
  #match = 0;
  #seed: number;
  #call: Call | null = null;
  #shed = new Set<Script>();
  /** The place's script time (handlers and match starts) and its kills, across games when the room shares it. */
  readonly #budget: ScriptGuard;
  #placeLoggedAt = -Infinity;
  #disposed = false;
  /** A kill ended this match's scripts: nothing more starts until the next match. */
  #killedThisMatch = false;
  /** This game already said that the place's scripts are off after too many kills. */
  #retiredNoted = false;
  /** This match already said that scripts wait to start. */
  #waitNoted = false;
  /** Starts the waiting scripts later in the match (after the place's budget, a kill's wait or a worker's start). */
  #retryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(scripts: readonly PlaceScript[], options: RunnerOptions) {
    this.#options = options;
    this.#clock = options.clock ?? (() => performance.now());
    this.#budget = options.guard ?? new ScriptGuard();
    this.#scripts = scripts
      .filter((script) => script.enabled)
      .map((source, index) => ({
        source,
        index,
        box: null,
        state: 'off' as const,
        handlers: [],
        strikes: 0,
        errors: 0,
        ticks: 0,
        usage: [],
        overBudget: false,
        refused: new Set<RefusalKey>(),
        rate: new LogRate(),
        waiting: false,
      }));
    // Every script-visible event: a later match may register other names than the first (seeded choices).
    this.events = this.#scripts.length > 0 ? SCRIPT_EVENT_TYPES : [];
    this.#seed = matchSeed(options.placeSeed, 0, options.seed);
    this.#recording = new Recording(this.#seed);
  }

  attach(api: ScriptSessionApi): void {
    this.#api = api;
    this.#guard(() => this.#startMatch());
  }

  hear(event: GameEvent, api: ScriptSessionApi): void {
    if (this.#disposed) return;
    this.#api = api;
    this.#guard(() => this.#deliver(event, api));
  }

  /** Host-only capability: the room must obtain the receipt over its authenticated API. */
  verifyProduct(value: unknown, playerId: string, now: number): boolean {
    const parsed = ProductReceipt.safeParse(value);
    const api = this.#api;
    if (!parsed.success || !api || this.#disposed || this.#productContext || !Number.isFinite(now) || api.view().phase !== 'playing') return false;
    const receipt = parsed.data;
    if (receipt.experienceId !== this.#options.placeSeed || !api.view().players.get(playerId)?.present) return false;
    if (receipt.expiresAt !== null && Date.parse(receipt.expiresAt) <= now) return false;
    const key = `${playerId}:${receipt.id}`;
    if (this.#productDecisions.has(key)) return this.#productDecisions.get(key)!;
    if (this.#productDecisions.size >= 500) return false;
    this.#handles.sync(api.view().players.keys());
    const json = JSON.stringify(ScriptProductPurchase.parse({
      type: 'product_purchased', actor: this.#handles.handleOf(playerId),
        productId: receipt.productId, receiptId: receipt.id, mode: receipt.mode, benefit: receipt.benefit,
      remainingMs: receipt.expiresAt === null ? null : Math.max(0, Date.parse(receipt.expiresAt) - now),
    }));
    const context = { receiptId: receipt.id, actorId: playerId, activated: false };
    let delivered = false;
    this.#guard(() => {
      this.#productContext = context;
      try {
        for (const s of this.#scripts) for (const handler of s.handlers) {
          if (handler.name !== `product:${receipt.productId}` || s.state !== 'running' || !s.box || !this.#mayRun(s)) continue;
          delivered = true;
          if (!this.#productSession) this.#write(s, 'refused', 'Sandbox product callbacks are not included in deterministic match replay; recording is unavailable for this match.');
          this.#productSession = true;
          this.#callHandler(s, handler, json, playerId);
        }
      } finally { this.#productContext = null; }
    });
    // Retry only if the sandbox module/handlers have not started or were temporarily budget limited.
    if (delivered) this.#productDecisions.set(key, context.activated);
    return context.activated;
  }

  matchReset(): void {
    if (this.#disposed) return;
    this.#guard(() => {
      this.#match += 1;
      this.#seed = matchSeed(this.#options.placeSeed, this.#match, this.#options.seed);
      this.#recording.restart(this.#seed);
      this.#startMatch();
    });
  }

  log(): readonly ScriptLogLine[] {
    return this.#log.lines();
  }

  recording(): FullRecording {
    // Purchase callbacks may mutate script-local state. Never present an incomplete replay as deterministic.
    if (this.#productSession) return { seed: this.#seed, events: [], at: [], caused: [] };
    return this.#recording.snapshot();
  }

  canReplay(): boolean { return !this.#productSession; }

  status(): ScriptStatus[] {
    const now = this.#clock();
    return this.#scripts.map((s) => ({
      id: s.source.id,
      name: s.source.name,
      state: s.state,
      strikes: s.strikes,
      errors: s.errors,
      msLastSecond: this.#used(s, now),
      ticks: s.ticks,
    }));
  }

  /** Switches every script off until the next match (the watchdog, or the room shutting scripts down). */
  switchOff(reason: string): void {
    let any = false;
    for (const s of this.#scripts)
      if (s.state === 'running') {
        any = true;
        this.#off(s, reason, false);
      }
    if (any) this.#emitStatus();
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#clearRetry();
    for (const s of this.#scripts) this.#disposeBox(s);
  }

  // --- match lifecycle -------------------------------------------------------------------------------------------

  #clearRetry(): void {
    if (this.#retryTimer !== null) clearTimeout(this.#retryTimer);
    this.#retryTimer = null;
  }

  #startMatch(): void {
    const api = this.#api;
    if (!api) return;
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
        state: 'off',
        handlers: [],
        strikes: 0,
        errors: 0,
        ticks: 0,
        usage: [],
        overBudget: false,
        waiting: true,
      });
      s.refused = new Set();
      s.rate = new LogRate();
    }
    if (!this.#retiredNow()) this.#startWaiting();
    this.#emitStatus();
  }

  /** Whether the place's scripts are off after too many kills (said once per game). */
  #retiredNow(): boolean {
    const now = this.#clock();
    const retired = this.#budget.retired(now, this.#sources());
    if (!retired) return false;
    // A changed script may start before the next match, once its wait after the last kill is over.
    if (retired.retryAt !== null) this.#startLater(retired.retryAt - now);
    if (!this.#retiredNoted) {
      this.#retiredNoted = true;
      const minutes = Math.max(1, Math.ceil((retired.until - now) / 60_000));
      const sooner =
        retired.retryAt === null
          ? 'or sooner once a script is changed'
          : `or in ${Math.ceil((retired.retryAt - now) / 1000)} s with the changed script`;
      this.#write(
        null,
        'off',
        `scripts of this place stay off: stopped ${SCRIPT_LIMITS.kills} times in ${SCRIPT_LIMITS.killWindowMs / 60_000} minutes; back in ${minutes} min, ${sooner}`,
      );
    }
    return true;
  }

  /** The enabled scripts as written (the guard compares their texts after a kill). */
  #sources(): PlaceScript[] {
    return this.#scripts.map((s) => s.source);
  }

  /**
   * Starts the waiting scripts in list order. Before each one the place's budget is checked (second review, critical
   * 1): when this second's place time or the start window is used, the rest wait (one line a match) and are tried
   * again a second later; after a kill nothing else starts this match.
   */
  #startWaiting(): void {
    if (!this.#scripts.some((s) => s.waiting) || this.#killedThisMatch) return;
    // A worker module's replacement thread may still be starting after a kill: nobody waits for it on the room's
    // thread (second review); the scripts start when it says it is ready.
    const module = this.#options.module;
    if (module.isReady && !module.isReady()) {
      if (!this.#waitNoted) {
        this.#waitNoted = true;
        this.#write(null, 'off', 'scripts wait: the script worker is starting; they start in a moment');
      }
      const match = this.#match;
      void module.whenReady?.().then((up) => {
        if (this.#disposed || this.#match !== match) return;
        if (up) this.#startLater(0);
        else this.#write(null, 'off', 'the script worker did not start; scripts are off for this match');
      });
      return;
    }
    const waiting: Script[] = [];
    let why: string | null = null;
    for (const s of this.#scripts) {
      if (!s.waiting) continue;
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
    if (waiting.length === 0 || this.#killedThisMatch) return;
    if (!this.#waitNoted) {
      this.#waitNoted = true;
      this.#write(
        null,
        'off',
        `not started yet: ${why}; waiting: ${waiting.map((s) => `"${s.source.name}"`).join(', ')}`,
      );
    }
    this.#startLater(START_RETRY_MS);
  }

  /** Tries the waiting scripts again in `ms` (budget clock), within this match; one timer at a time. */
  #startLater(ms: number): void {
    if (this.#retryTimer !== null || this.#disposed) return;
    const match = this.#match;
    const timer = setTimeout(
      () => {
        this.#retryTimer = null;
        if (this.#disposed || this.#match !== match || this.#killedThisMatch) return;
        this.#guard(() => {
          if (this.#retiredNow()) return;
          this.#startWaiting();
          this.#emitStatus();
        });
      },
      Math.max(0, ms),
    );
    (timer as { unref?: () => void }).unref?.();
    this.#retryTimer = timer;
  }

  /**
   * Starts one script and charges all of it (the sandbox, the prelude and the top level: the time the room's thread is
   * blocked) to the place's budget and the start window (review finding 2, second review critical 1).
   */
  #startScript(s: Script): void {
    let box: ScriptSandbox;
    try {
      box = this.#options.module.newSandbox(s.source.name);
    } catch {
      this.#write(s, 'off', 'could not start the script sandbox');
      return;
    }
    // Making the sandbox is the host's work (and may wait for a worker that is starting); the script's is timed.
    const start = this.#clock();
    try {
      this.#runStart(s, box);
    } finally {
      this.#budget.chargeStart(start, Math.max(0, this.#clock() - start));
    }
  }

  #runStart(s: Script, box: ScriptSandbox): void {
    s.box = box;
    box.defineHost('__act', (json) => this.#onAct(s, json));
    box.defineHost('__read', (json) => this.#onRead(s, json));
    box.defineHost('__log', (text) => this.#onLog(s, text));
    const ready = box.run(prelude(scriptSeed(this.#seed, s.source.id)), PRELUDE_LIMITS, PRELUDE_FILE);
    if (!ready.ok && ready.kind === 'killed') {
      this.#killed(ready.ms, ready.message);
      return;
    }
    if (!ready.ok) {
      this.#write(s, 'off', 'could not start the script sandbox');
      this.#options.onIncident?.(`script prelude failed: ${ready.kind}`);
      this.#disposeBox(s);
      return;
    }
    s.state = 'running';
    const topStart = this.#clock();
    const top = this.#within(s, null, true, () => box.run(s.source.source, START_LIMITS));
    const topMs = Math.max(0, this.#clock() - topStart);
    s.ticks += top.ticks;
    // Native code that polled the interrupt too rarely and still returned in time: the script is off for the match,
    // nothing else starts in it, and it counts as a kill (second review, critical 1).
    const slow = !(!top.ok && top.kind === 'killed') && topMs > SCRIPT_LIMITS.watchdogMs;
    if (slow) this.#slowTopLevel(topMs);
    if (top.ok && slow) {
      this.#off(s, `the top level took ${Math.round(topMs)} ms (over ${SCRIPT_LIMITS.watchdogMs} ms)`, false);
      return;
    }
    if (!top.ok) {
      if (top.kind === 'killed') {
        this.#killed(top.ms, top.message);
        return;
      }
      if (top.kind === 'syntax') {
        s.state = 'not_compiled';
        this.#write(s, 'off', `does not compile: ${top.message}`, top.line);
        this.#disposeBox(s);
        return;
      }
      const why =
        top.kind === 'overrun'
          ? `top level over its budget (${SCRIPT_LIMITS.startMs} ms)`
          : top.kind === 'memory'
            ? 'out of memory'
            : top.message;
      this.#off(s, `top level failed: ${why}`, false, top.line);
      return;
    }
    this.#endOfCall(s, null);
    if (s.state === 'running')
      this.#write(s, 'start', `running, ${s.handlers.length} handler${s.handlers.length === 1 ? '' : 's'}`);
  }

  // --- delivering events -----------------------------------------------------------------------------------------

  #deliver(event: GameEvent, api: ScriptSessionApi): void {
    const actorId = api.actorOf(event);
    // Handles go in join order: a player not seen yet is numbered with everyone else who joined before them.
    if (this.#mentionsUnknown(event)) this.#handles.sync(api.view().players.keys());
    const scriptEvent = toScriptEvent(event, actorId, this.#handles, api.matchStartedAt());
    if (!scriptEvent) return;
    this.#recording.push(scriptEvent, api.now() - api.matchStartedAt(), api.caused(event));
    const name = scriptEventName(scriptEvent);
    if (name === null) return;
    const json = JSON.stringify(scriptEvent);
    if (json.length > SCRIPT_LIMITS.eventJsonBytes) return;
    for (const s of this.#scripts) {
      for (const handler of s.handlers) {
        if (handler.name !== name) continue;
        if (s.state !== 'running' || !s.box) break;
        if (!this.#mayRun(s)) break;
        this.#callHandler(s, handler, json, actorId);
      }
    }
  }

  /** Whether the event names a player who has no handle yet (handles are given in join order first). */
  #mentionsUnknown(event: GameEvent): boolean {
    for (const key of ['id', 'victim', 'by'] as const) {
      const value = (event as Record<string, unknown>)[key];
      if (typeof value === 'string' && this.#handles.peek(value) === undefined) return true;
    }
    return false;
  }

  #callHandler(s: Script, handler: Handler, json: string, actorId: string | null): void {
    const box = s.box!;
    const start = this.#clock();
    const result = this.#within(s, actorId, false, () => box.call(handler.handle, json, HANDLER_LIMITS));
    const ms = Math.max(0, this.#clock() - start);
    s.usage.push({ at: start, ms });
    this.#budget.chargeCall(start, ms);
    s.ticks += result.ticks;
    this.#flushDropped(s);
    if (!result.ok && result.kind === 'killed') {
      this.#killed(ms, result.message);
      return;
    }
    if (ms > SCRIPT_LIMITS.watchdogMs) {
      // Native code that never polled the interrupt (spec 5.4): every script of the place stops for this match.
      this.#overWatchdog(`one handler call took ${Math.round(ms)} ms`);
      return;
    }
    if (!result.ok) this.#failed(s, result);
    // A native call that never polls the interrupt (the default sort of a large array) is not stopped while it
    // runs; over twice the handler budget it is still a strike once it returns.
    else if (ms > SCRIPT_LIMITS.handlerMs * 2)
      this.#strike(s, `a handler went over its budget (${SCRIPT_LIMITS.handlerMs} ms)`);
  }

  #failed(s: Script, result: Extract<SandboxResult<void>, { ok: false }>): void {
    if (result.kind === 'memory' || s.box?.disposed) {
      // A sandbox that ended itself: out of memory, or promise jobs that never finished (review finding 7).
      this.#off(s, result.kind === 'overrun' ? result.message : 'out of memory', true);
      return;
    }
    if (result.kind === 'overrun') {
      this.#strike(s, `a handler went over its budget (${SCRIPT_LIMITS.handlerMs} ms)`);
      return;
    }
    s.errors += 1;
    // The script's own frames after the message (spec 6), when there is more than the line already named.
    const frames = result.stack && result.stack.length > 1 ? ` (at ${result.stack.join(' < ')})` : '';
    this.#write(
      s,
      'error',
      `script "${s.source.name}"${result.line ? ` line ${result.line}` : ''}: ${result.message}${frames}`,
      result.line,
    );
    if (s.errors >= SCRIPT_LIMITS.errors) this.#off(s, `${SCRIPT_LIMITS.errors} errors in one match`, true);
  }

  #strike(s: Script, why: string): void {
    s.strikes += 1;
    this.#write(s, 'strike', `strike ${s.strikes} of ${SCRIPT_LIMITS.strikes}: ${why}`);
    if (s.strikes >= SCRIPT_LIMITS.strikes) this.#off(s, `${SCRIPT_LIMITS.strikes} strikes`, true);
  }

  /** The per-script and per-place time budgets (spec 5.4) before a handler call. */
  #mayRun(s: Script): boolean {
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
    // Over the place's share: the lowest-listed running script not yet skipped is skipped next.
    const next = [...this.#scripts]
      .reverse()
      .find((other) => other.state === 'running' && !this.#shed.has(other));
    if (next) this.#shed.add(next);
    if (now - this.#placeLoggedAt >= WINDOW_MS) {
      this.#placeLoggedAt = now;
      const names = this.#scripts
        .filter((other) => this.#shed.has(other))
        .map((other) => `"${other.source.name}"`);
      this.#write(
        null,
        'refused',
        `scripts of this place over ${SCRIPT_LIMITS.placeMsPerSecond} ms in one second; skipping ${names.join(', ')}`,
      );
    }
    return !this.#shed.has(s);
  }

  /** Handler ms of a script within the window ending at `now` (old entries dropped). */
  #used(s: Script, now: number): number {
    return windowSum(s.usage, now, WINDOW_MS);
  }

  /** Runs a sandbox call with `#call` set (the host functions read it), and never lets it leak. */
  #within(
    s: Script,
    actor: string | null,
    top: boolean,
    body: () => SandboxResult<void>,
  ): SandboxResult<void> {
    const outer = this.#call;
    this.#call = { script: s, top, actor, acts: 0, reads: 0, view: null };
    try {
      return body();
    } finally {
      this.#call = outer;
    }
  }

  /** The prelude's end-of-call hook after the top level (reports dropped log lines). */
  #endOfCall(s: Script, actor: string | null): void {
    if (!s.box || s.box.disposed) return;
    const result = this.#within(s, actor, false, () => s.box!.call(END_OF_CALL, '{}', HANDLER_LIMITS));
    this.#flushDropped(s);
    if (!result.ok && result.kind === 'killed') this.#killed(result.ms, result.message);
    else if (!result.ok) this.#failed(s, result);
  }

  /**
   * A call passed the module's hard deadline (native code that never polled the interrupt) and the worker was
   * terminated: every sandbox of the place is gone, so every script is off for the match; after
   * `SCRIPT_LIMITS.kills` kills in `killWindowMs` they stay off (the guard says until when).
   */
  #killed(ms: number, message = ''): void {
    const count = this.#recordKill();
    const final = count >= SCRIPT_LIMITS.kills;
    // A worker that died by itself between calls (a V8 resource limit) is a kill too (spec 5.4).
    const died = message.includes('by itself');
    this.#options.onIncident?.(
      died
        ? `script worker stopped by itself (${count} of ${SCRIPT_LIMITS.kills}); scripts off for the ${final ? 'game' : 'match'}`
        : `script hard deadline: a call ran ${Math.round(ms)} ms and its worker was stopped (${count} of ${SCRIPT_LIMITS.kills}); scripts off for the ${final ? 'game' : 'match'}`,
    );
    const why = final
      ? `stopped on the hard deadline ${SCRIPT_LIMITS.kills} times`
      : died
        ? 'the script worker stopped by itself (too much memory)'
        : 'a call did not end by the hard deadline (code that never yields, such as a loop of big sorts)';
    for (const s of this.#scripts) {
      s.box = null;
      if (s.state !== 'running') continue;
      s.state = 'off';
      this.#write(s, 'off', `switched off until the next match: ${why}`);
    }
    if (final) this.#retiredNow();
    this.#emitStatus();
  }

  /**
   * A call (a top level or a handler) took longer than the watchdog and returned (native code that polled the
   * interrupt too rarely): every script of the place stops for this match, and it counts as a kill.
   */
  #overWatchdog(what: string): void {
    const count = this.#recordKill();
    this.#options.onIncident?.(
      `script watchdog: ${what} (${count} of ${SCRIPT_LIMITS.kills}); scripts off for the match`,
    );
    this.switchOff(`a call took over ${SCRIPT_LIMITS.watchdogMs} ms`);
    if (count >= SCRIPT_LIMITS.kills) this.#retiredNow();
  }

  /** A top level over the watchdog: a kill for the guard; the other running scripts go on, nothing else starts. */
  #slowTopLevel(ms: number): void {
    const count = this.#recordKill();
    this.#options.onIncident?.(
      `script watchdog: a top level took ${Math.round(ms)} ms (${count} of ${SCRIPT_LIMITS.kills}); nothing more starts this match`,
    );
    if (count >= SCRIPT_LIMITS.kills) this.#retiredNow();
  }

  #recordKill(): number {
    this.#killedThisMatch = true;
    return this.#budget.recordKill(this.#clock(), this.#sources());
  }

  // --- host functions (strings in, strings out) -----------------------------------------------------------------

  #onAct(s: Script, json: string): string {
    const call = this.#call;
    if (!call || call.script !== s) return 'false';
    const api = this.#api!;
    const refuse = (key: RefusalKey, why: string, action: unknown = null): string => {
      this.#refused(s, key, why);
      this.#options.onRequest?.({ script: s.source.id, action, actor: null, accepted: false, why });
      return 'false';
    };
    if (call.top) return refuse('top', 'actions can only be requested from a handler, not the top level');
    if (this.#productContext) return refuse('rules', 'purchase callbacks use activateProduct only; gameplay actions belong in engine handlers');
    call.acts += 1;
    if (call.acts > SCRIPT_LIMITS.actsPerHandler)
      return refuse('acts', `more than ${SCRIPT_LIMITS.actsPerHandler} act or emit calls in one handler`);
    if (json.length > SCRIPT_LIMITS.actJsonBytes)
      return refuse('size', `an action over ${SCRIPT_LIMITS.actJsonBytes} bytes`);
    let raw: unknown;
    try {
      raw = JSON.parse(json);
    } catch {
      return refuse('json', 'an action that is not JSON');
    }
    const message = isRecord(raw) ? raw : {};
    if ('big' in message) return refuse('size', `an action over ${SCRIPT_LIMITS.actJsonBytes} bytes`);
    const parsed = Action.safeParse(message.a);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const where = issue && issue.path.length > 0 ? ` (${issue.path.join('.')})` : '';
      return refuse(`action${cutName(where)}`, `not a valid action${cutName(where)}`, message.a);
    }
    const action = parsed.data;
    let actorId = call.actor;
    const options = message.o;
    if (options !== null && options !== undefined) {
      if (!isRecord(options) || ('actor' in options && typeof options.actor !== 'string'))
        return refuse('options', 'options must be { actor?: handle }', action);
      if (typeof options.actor === 'string') {
        const id = this.#handles.idOf(options.actor);
        if (id === undefined || !this.#view(call).players.has(id))
          return refuse('actor', `unknown actor "${cutName(options.actor)}"`, action);
        actorId = id;
      }
    }
    const actor = actorId === null ? null : (this.#handles.peek(actorId) ?? null);
    const counter =
      action.kind === 'add_counter' || action.kind === 'set_counter'
        ? action.name
        : action.kind === 'end_match' && typeof action.winner === 'object' && 'byCounter' in action.winner
          ? action.winner.byCounter
          : null;
    if (counter !== null && api.counterScope(counter) === null)
      return refuse('counter', `unknown counter "${cutName(counter)}"`, action);
    if (action.kind === 'teleport_to_zone' && !api.zones().some((zone) => zone.tag === action.tag))
      return refuse('zone', `no zone tagged "${cutName(action.tag)}"`, action);
    const accepted = api.act(action, actorId);
    call.view = null;
    if (!accepted) {
      const why = `over the rules' budget (${RULE_LIMITS.actionsPerEvent} actions per event, chain of ${RULE_LIMITS.chain})`;
      this.#refused(s, 'rules', why);
      this.#options.onRequest?.({ script: s.source.id, action, actor, accepted: false, why });
      return 'false';
    }
    this.#options.onRequest?.({ script: s.source.id, action, actor, accepted: true });
    return 'true';
  }

  #onRead(s: Script, json: string): string {
    const call = this.#call;
    if (!call || call.script !== s) return 'null';
    if (json.length > SCRIPT_LIMITS.readJsonBytes) {
      // Counted as a read too: big reads in a loop still meet the per-handler cap.
      call.reads += 1;
      this.#refused(s, 'size', `a read over ${SCRIPT_LIMITS.readJsonBytes} bytes`);
      return 'null';
    }
    let message: Record<string, unknown>;
    try {
      const raw: unknown = JSON.parse(json);
      message = isRecord(raw) ? raw : {};
    } catch {
      return 'null';
    }
    const args = isRecord(message.args) ? message.args : {};
    if (message.op === 'on' || message.op === 'onProduct') return JSON.stringify(this.#register(s, call, args, message.op === 'onProduct'));
    call.reads += 1;
    if (call.reads > SCRIPT_LIMITS.readsPerHandler) {
      this.#refused(s, 'reads', `more than ${SCRIPT_LIMITS.readsPerHandler} reads in one handler`);
      return 'null';
    }
    const value = this.#read(call, String(message.op), args);
    return JSON.stringify(value === undefined ? null : value);
  }

  #register(s: Script, call: Call, args: Record<string, unknown>, product = false): true | string {
    if (!call.top) return 'genvr.on is only allowed while the top level runs';
    const handle = args.handle;
    const raw = args.name;
    if (typeof handle !== 'number' || !Number.isInteger(handle) || handle <= END_OF_CALL)
      return 'genvr.on was refused';
    const name = typeof raw === 'string' ? raw.trim() : '';
    if (product) {
      if (!ProductReceipt.shape.productId.safeParse(name).success) return 'onProduct needs a UUID Product ID';
      s.handlers.push({ name: `product:${name}`, handle });
      return true;
    }
    if (name.length === 0 || name.length > RULE_LIMITS.name)
      return `genvr.on needs an event name of 1 to ${RULE_LIMITS.name} characters`;
    s.handlers.push({ name, handle });
    return true;
  }

  #read(call: Call, op: string, args: Record<string, unknown>): unknown {
    const api = this.#api!;
    switch (op) {
      case 'activateProduct': {
        const context = this.#productContext;
        if (!context || call.top || call.actor !== context.actorId || args.receiptId !== context.receiptId) return false;
        context.activated = true;
        return true;
      }
      case 'now':
        return api.now() - api.matchStartedAt();
      case 'phase':
        return this.#view(call).phase;
      case 'timeLeft': {
        const { endsAt } = this.#view(call);
        return endsAt === null ? null : Math.max(0, (endsAt - api.now()) / 1000);
      }
      case 'players': {
        const view = this.#view(call);
        this.#handles.sync(view.players.keys());
        return [...view.players].filter(([, row]) => row.present).map(([id]) => this.#handles.handleOf(id));
      }
      case 'player': {
        const id = typeof args.handle === 'string' ? this.#handles.idOf(args.handle) : undefined;
        const row = id === undefined ? undefined : this.#view(call).players.get(id);
        if (id === undefined || !row) return null;
        return {
          team: row.team,
          health: row.health,
          alive: row.alive,
          score: row.score,
          place: row.place,
          riding: api.ridingOf(id)?.tag ?? null,
          present: row.present,
        };
      }
      case 'counter': {
        const name = typeof args.name === 'string' ? args.name : '';
        const of = args.of;
        if (of === null || of === undefined) return api.counter(name, 'global');
        if (of === 'red' || of === 'blue') return api.counter(name, { team: of as TeamName });
        const id = typeof of === 'string' ? this.#handles.idOf(of) : undefined;
        return id === undefined ? null : api.counter(name, { player: id });
      }
      case 'zones': {
        const tag = typeof args.tag === 'string' ? args.tag : null;
        return api
          .zones()
          .filter((zone) => tag === null || zone.tag === tag)
          .map((zone) => ({ id: zone.id, tag: zone.tag, shape: zone.shape }));
      }
      default:
        return null;
    }
  }

  #view(call: Call): SessionView {
    call.view ??= this.#api!.view();
    return call.view;
  }

  #onLog(s: Script, text: string): string {
    const api = this.#api;
    if (!api) return '0';
    if (text.startsWith('D')) {
      const n = Number(text.slice(1));
      if (Number.isInteger(n) && n > 0) s.rate.dropped += Math.min(n, 1e9);
      return '0';
    }
    const left = s.rate.take(api.now());
    if (left < 0) return '0';
    this.#write(s, 'log', text.slice(1));
    return String(left);
  }

  #flushDropped(s: Script): void {
    if (s.rate.dropped === 0) return;
    const n = s.rate.dropped;
    s.rate.dropped = 0;
    this.#write(
      s,
      'log',
      `${n} line${n === 1 ? '' : 's'} dropped (at most ${SCRIPT_LIMITS.logPerSecond} a second)`,
    );
  }

  // --- bookkeeping ------------------------------------------------------------------------------------------------

  /**
   * One log line per kind of refusal per script and match (review finding 3): keyed by a fixed reason, never by the
   * creator's text (names, handles, tags), so the set stays small; and the line counts toward the script's
   * `genvr.log` rate, so refusals cannot flood the log past 10 lines a second.
   */
  #refused(s: Script, key: RefusalKey, why: string): void {
    if (s.refused.has(key) || s.refused.size >= REFUSAL_KEYS) return;
    s.refused.add(key);
    if (s.rate.take(this.#api?.now() ?? 0) < 0) return;
    this.#write(s, 'refused', why);
  }

  #off(s: Script, why: string, status: boolean, line?: number): void {
    s.state = 'off';
    this.#write(s, 'off', `switched off until the next match: ${why}`, line);
    this.#disposeBox(s);
    if (status) this.#emitStatus();
  }

  #disposeBox(s: Script): void {
    const box = s.box;
    s.box = null;
    if (box && !box.disposed) {
      try {
        box.dispose();
      } catch {
        // Already unusable; nothing else to free.
      }
    }
  }

  #write(s: Script | null, level: ScriptLogLine['level'], text: string, line?: number): void {
    const entry: ScriptLogLine = {
      at: this.#api?.now() ?? 0,
      script: s ? s.source.name : '',
      level,
      text: cutLine(text),
      ...(line === undefined ? {} : { line }),
    };
    this.#log.push(entry);
    this.#options.onLog?.(entry);
  }

  #emitStatus(): void {
    this.#options.onStatus?.(this.status());
  }

  /** A host-side failure switches every script of the place off for the match (spec 6); the room never throws. */
  #guard(body: () => void): void {
    try {
      body();
    } catch (error) {
      this.#call = null;
      const kind = error instanceof Error ? error.name : typeof error;
      this.#options.onIncident?.(`script runner failed (${kind}); scripts off for the match`);
      try {
        this.switchOff('the script host failed');
      } catch {
        // Nothing more to do: every sandbox is already off or gone.
      }
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cutName(text: string): string {
  return text.length > RULE_LIMITS.name ? `${text.slice(0, RULE_LIMITS.name)}...` : text;
}
