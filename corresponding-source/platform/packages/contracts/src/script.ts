import { z } from 'zod';
import { Id } from './common.js';
import { SemVer } from './manifest.js';
import { Action, GameEventName, RULE_LIMITS } from './rules.js';
import { ScriptProductPurchase } from './game-products.js';

/**
 * Limits of creator scripts (P2-10, spec `docs/superpowers/specs/2026-10-02-script-sandbox-design.md` 5.4); the
 * contracts, the sandbox, the validator, the room and the tools share them. The tick numbers were measured in plan
 * Task 1: one interrupt tick is about 10 000 loop iterations (0.10-0.39 ms on the dev machine), so 12 ticks fit in a
 * 5 ms handler and 60 in the 25 ms top level, and the deterministic count trips before the clock.
 */
export const SCRIPT_LIMITS = {
  scripts: 8,
  sourceChars: 16_384,
  totalChars: 65_536,
  /**
   * The heap limit of one script's runtime. QuickJS-ng counts allocations against it, not bytes, in this build (about
   * 500 000 allocations), so long strings count less than their size; the place's shared memory below is the hard
   * bound (spec 5.1, review finding 5).
   */
  memoryBytes: 4 * 2 ** 20,
  /** All scripts of a place share this much WebAssembly memory (one module per room); allocations past it fail. */
  placeMemoryBytes: 64 * 2 ** 20,
  /** A call that grows the place's memory past this switches the script that made it off for the match. */
  placeMemorySoftBytes: 32 * 2 ** 20,
  stackBytes: 256 * 2 ** 10,
  startMs: 25,
  startTicks: 60,
  handlerMs: 5,
  handlerTicks: 12,
  scriptMsPerSecond: 25,
  placeMsPerSecond: 50,
  strikes: 3,
  errors: 50,
  actsPerHandler: 16,
  readsPerHandler: 512,
  eventJsonBytes: 4096,
  actJsonBytes: 2048,
  /** A read's argument (`{ op, args }`), refused before the host parses it (second review). */
  readJsonBytes: 1024,
  logPerSecond: 10,
  logChars: 200,
  logLines: 200,
  recordingEvents: 2000,
  testEvents: 500,
  watchdogMs: 50,
  /**
   * Match starts (each script's sandbox, prelude and top level) of a place share this much script time in
   * `startWindowMs`, on top of the place's 50 ms a second (second review, critical 1).
   */
  startMsPerWindow: 250,
  startWindowMs: 10_000,
  /**
   * A place's scripts may be ended this many times (the hard deadline, a worker that died, a call over the watchdog)
   * in `killWindowMs` before they stay off; a changed script may start again `killRetryMs` after the last kill,
   * doubled for every kill past the limit (second review, critical 2).
   */
  kills: 3,
  killWindowMs: 600_000,
  killRetryMs: 5_000,
  /** A dry run (the API's `test_script`, package installs, the studio's replay) stops after this much wall time. */
  dryRunMs: 2_000,
} as const;

/** The Genvr Script API version scripts target; a later version gets its own prelude and v1 stays supported. */
export const SCRIPT_API_VERSION = 1;

/** A place script's id: `scr-` and 8 hex characters. */
export const ScriptId = z.string().regex(/^scr-[0-9a-f]{8}$/, 'scr- and 8 hex characters');
export type ScriptId = z.infer<typeof ScriptId>;

/** A player as a script sees them: a handle for this match (`p1`, `p2`, ... in join order), never an account. */
export const ScriptHandle = z.string().regex(/^p[1-9][0-9]{0,3}$/, 'a player handle such as p1');
export type ScriptHandle = z.infer<typeof ScriptHandle>;

/** A script in a place (world document `scripts`), changed only by the `set_script` command. */
export const PlaceScript = z.object({
  id: ScriptId,
  name: z.string().trim().min(1).max(40),
  api: z.literal(SCRIPT_API_VERSION),
  enabled: z.boolean(),
  source: z.string().max(SCRIPT_LIMITS.sourceChars),
  /** Copied from a reviewed store script item (pinned by the source's sha256). */
  from: z.object({ itemId: Id, version: SemVer, sha256: z.string().regex(/^[0-9a-f]{64}$/) }).optional(),
});
export type PlaceScript = z.infer<typeof PlaceScript>;

/** What `set_script` carries: a script without its id (the id is the command's `scriptId`). */
export const PlaceScriptBody = PlaceScript.omit({ id: true });
export type PlaceScriptBody = z.infer<typeof PlaceScriptBody>;

/** The total source size of a place's scripts. */
export function scriptChars(scripts: ReadonlyArray<{ source: string }>): number {
  return scripts.reduce((sum, script) => sum + script.source.length, 0);
}

/** A place's scripts: at most 8, at most 65 536 characters together, ids unique. */
export const PlaceScripts = z
  .array(PlaceScript)
  .max(SCRIPT_LIMITS.scripts)
  .refine((scripts) => scriptChars(scripts) <= SCRIPT_LIMITS.totalChars, {
    message: `at most ${SCRIPT_LIMITS.totalChars} characters of script source in a place`,
  })
  .refine((scripts) => new Set(scripts.map((script) => script.id)).size === scripts.length, {
    message: 'script ids must be unique',
  });

const Name = z.string().max(RULE_LIMITS.name);
const Handle = ScriptHandle;
const MaybeHandle = ScriptHandle.nullable();

/** The events a script hears, built twice: as heard (`actor` given) and as a dry run takes them (`ScriptTestEvent`). */
function scriptEvents<A extends z.ZodType, X extends z.ZodRawShape>(actor: A, extra: X) {
  const event = <T extends string, S extends z.ZodRawShape>(type: T, shape: S) =>
    z.object({ type: z.literal(type), actor, ...extra, ...shape });
  return [
    event('zone_entered', { id: Handle, zone: z.string().max(128), tag: Name }),
    event('zone_exited', { id: Handle, zone: z.string().max(128), tag: Name }),
    event('zone_crossed', { id: Handle, zone: z.string().max(128), tag: Name }),
    event('player_joined', { id: Handle, team: z.enum(['red', 'blue']).nullable(), returning: z.boolean() }),
    event('player_left', { id: Handle }),
    event('hit', { victim: Handle, by: MaybeHandle, damage: z.number(), health: z.number() }),
    event('died', { victim: Handle, by: MaybeHandle }),
    event('respawned', { id: Handle }),
    event('phase_changed', {
      phase: z.enum(['waiting', 'countdown', 'playing', 'results']),
      endsAt: z.number().nullable(),
    }),
    event('time_up', {}),
    event('counter_changed', { name: Name, value: z.number(), id: MaybeHandle }),
    event('timer_fired', { name: Name, id: MaybeHandle }),
    event('mounted', { id: Handle, item: z.string().max(128), tag: Name, seat: z.number().int().min(1) }),
    event('dismounted', { id: Handle, item: z.string().max(128), tag: Name }),
    event('custom', { name: Name, id: MaybeHandle }),
  ] as const;
}

/**
 * An event as a script hears it (spec 4): the engine event as plain JSON, every player id replaced by its handle, plus
 * `actor` (the player the event is about, as rules see it). No positions, no names. `endsAt` is on the script clock
 * (`genvr.now()`), not the server's.
 */
export const ScriptEvent = z.discriminatedUnion('type', scriptEvents(MaybeHandle, {}));
export type ScriptEvent = z.infer<typeof ScriptEvent>;

/** The latest a dry-run event may happen: ms on the script clock (one hour). */
export const SCRIPT_TEST_MAX_MS = 3_600_000;

/**
 * An event given to a dry run (`test_script`, spec 12): a script event whose `actor` may be left out (the engine works
 * it out) and with an optional `at`, when it happens in ms on the script clock (`genvr.now()`). Events without `at`
 * follow each other at once; the dry run lets play start first.
 */
export const ScriptTestEvent = z.discriminatedUnion(
  'type',
  scriptEvents(MaybeHandle.optional(), { at: z.number().min(0).max(SCRIPT_TEST_MAX_MS).optional() }),
);
export type ScriptTestEvent = z.infer<typeof ScriptTestEvent>;

/**
 * The script-visible events of one match as a room recorded them (spec 10), for `test_script { recording:
 * 'last_match' }`: the match seed, the events, when each happened (ms on the script clock) and whether it was a
 * follow-up (raised while another event was delivered: by the rules, the scripts or the engine itself), which a dry
 * run raises again instead of replaying.
 */
export const ScriptRecording = z.object({
  seed: z.number(),
  events: z.array(ScriptEvent).max(SCRIPT_LIMITS.recordingEvents),
  at: z.array(z.number()).max(SCRIPT_LIMITS.recordingEvents).optional(),
  caused: z.array(z.boolean()).max(SCRIPT_LIMITS.recordingEvents).optional(),
});
export type ScriptRecording = z.infer<typeof ScriptRecording>;

export interface ScriptApiEntry {
  /** The member of `genvr`. */
  name: string;
  /** TypeScript signature of the member, used in the `.d.ts` and the reference text. */
  signature: string;
  doc: string;
}

/**
 * The Genvr Script API version 1, the single source of the prelude's members, the `.d.ts` (`scriptApiDts`) and the
 * reference text `get_script_api` returns (`scriptApiText`). Only generic reads, the rules' actions and logging.
 */
export const SCRIPT_API: ReadonlyArray<ScriptApiEntry> = Object.freeze([
  {
    name: 'onProduct',
    signature: 'onProduct(productId: string, handler: (purchase: ScriptProductPurchase) => void): void',
      doc: 'Registers at top level for this Product ID. Only server-verified Sandbox or Stripe Test receipts reach this callback during playing. Stripe Test uses prepared Production IDs, not live entitlements. Read, log and activateProduct are allowed; act/emit are refused. Match recording is unavailable after a product callback. May run again on restore or restarting Test; never mint funds.',
  },
  {
    name: 'activateProduct',
    signature: 'activateProduct(receiptId: string): boolean',
    doc: 'Activates the immutable purchased skin/effect only inside its verified onProduct callback. No arbitrary benefit, player, expiry or price is accepted. False outside that context. Remaining effect duration is never restarted.',
  },
  {
    name: 'on',
    signature: 'on(event: ScriptEventName | (string & {}), handler: (e: ScriptEvent) => void): void',
    doc: 'Listens to an engine event or a custom event raised by an emit (from a rule or a script). Only while the top level runs.',
  },
  {
    name: 'now',
    signature: 'now(): number',
    doc: 'Milliseconds since this match started (the session clock). Date.now() and new Date() follow the session clock, and local time is UTC.',
  },
  {
    name: 'phase',
    signature: "phase(): 'waiting' | 'countdown' | 'playing' | 'results'",
    doc: 'The match phase.',
  },
  { name: 'timeLeft', signature: 'timeLeft(): number | null', doc: 'Seconds until the phase ends, or null.' },
  {
    name: 'players',
    signature: 'players(): string[]',
    doc: 'Handles of the players in the match, in join order (p1, p2, ...).',
  },
  {
    name: 'player',
    signature: 'player(handle: string): ScriptPlayer | null',
    doc: 'A copy of one player row; null for an unknown handle.',
  },
  {
    name: 'counter',
    signature: 'counter(name: string, of?: string): number | null',
    doc: "A counter's value: a player counter of a handle, a team counter of 'red' or 'blue', a global counter without `of`. Null when unknown.",
  },
  {
    name: 'zones',
    signature: "zones(tag?: string): Array<{ id: string; tag: string; shape: 'area' | 'gate' }>",
    doc: 'The zones of the place, all or those with a tag.',
  },
  {
    name: 'random',
    signature: 'random(): number',
    doc: 'A number in [0, 1) from the match seed; Math.random is the same generator.',
  },
  {
    name: 'act',
    signature: 'act(action: ScriptAction, opts?: { actor?: string }): boolean',
    doc: "Asks the engine to run one of the rules' actions; `who` is relative to the event's actor or `opts.actor`. False when refused (invalid, over a budget, unknown actor).",
  },
  {
    name: 'emit',
    signature: 'emit(name: string): boolean',
    doc: "Raises a custom event (the same as act({ kind: 'emit', event: name })).",
  },
  {
    name: 'log',
    signature: 'log(...values: unknown[]): void',
    doc: "Writes a line to the place's script log (builders only, never players). console.log is the same.",
  },
]);

/** TypeScript text for a JSON Schema (the subset zod produces for these contracts). */
function tsOf(schema: unknown, indent = ''): string {
  if (typeof schema !== 'object' || schema === null) return 'unknown';
  const s = schema as Record<string, unknown>;
  const union = (s.anyOf ?? s.oneOf) as unknown[] | undefined;
  if (union) return union.map((part) => tsOf(part, indent)).join(' | ');
  if ('const' in s) return JSON.stringify(s.const);
  if (Array.isArray(s.enum)) return s.enum.map((value) => JSON.stringify(value)).join(' | ');
  switch (s.type) {
    case 'string':
      return 'string';
    case 'number':
    case 'integer':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'null':
      return 'null';
    case 'array':
      return `Array<${tsOf(s.items, indent)}>`;
    case 'object': {
      const properties = (s.properties ?? {}) as Record<string, unknown>;
      const required = new Set((s.required ?? []) as string[]);
      const inner = `${indent}  `;
      const lines = Object.entries(properties).map(
        ([key, value]) => `${inner}${key}${required.has(key) ? '' : '?'}: ${tsOf(value, inner)};`,
      );
      return lines.length ? `{\n${lines.join('\n')}\n${indent}}` : '{}';
    }
    default:
      return 'unknown';
  }
}

/** The `.d.ts` of the Genvr Script API, generated from `SCRIPT_API`, `Action` and `ScriptEvent`. */
export function scriptApiDts(): string {
  const action = tsOf(z.toJSONSchema(Action, { io: 'input' }));
  const events = tsOf(z.toJSONSchema(ScriptEvent, { io: 'output' }));
  const names = [...GameEventName.options].map((name) => `'${name}'`).join(' | ');
  const members = SCRIPT_API.map((entry) => `  /** ${entry.doc} */\n  ${entry.signature};`).join('\n');
  return [
    `// Genvr Script API ${SCRIPT_API_VERSION}. Scripts are classic JavaScript (no modules, no eval, no timers).`,
    `type ScriptEventName = ${names};`,
    `type ScriptEvent = ${events};`,
    `type ScriptProductPurchase = ${tsOf(z.toJSONSchema(ScriptProductPurchase, { io: 'output' }))};`,
    `type ScriptAction = ${action};`,
    `type ScriptPlayer = {\n  team: 'red' | 'blue' | null;\n  health: number;\n  alive: boolean;\n  score: number;\n  place: number;\n  riding: string | null;\n  present: boolean;\n};`,
    `declare const genvr: {\n${members}\n};`,
    '',
  ].join('\n');
}

/** The reference text of the Genvr Script API (`get_script_api`): members, limits and the `.d.ts`. */
export function scriptApiText(): string {
  const L = SCRIPT_LIMITS;
  const members = SCRIPT_API.map((entry) => `- genvr.${entry.signature}\n  ${entry.doc}`).join('\n');
  return [
    `Genvr Script API ${SCRIPT_API_VERSION}`,
    '',
    "Scripts are small classic JavaScript files in a place. They run on the server in a sandbox, hear the same events as the rules and can only ask for the rules' actions; the engine runs or refuses each request. Players are handles (p1, p2, ...), never accounts or names. No modules, eval, Function, timers or network; use the start_timer action and listen to timer_fired. Handlers are registered only while the top level runs.",
    '',
    'Members of the global `genvr` (frozen):',
    members,
    '',
    'Limits:',
    `- ${L.scripts} scripts per place, ${L.sourceChars} characters each, ${L.totalChars} together.`,
    `- Top level: ${L.startMs} ms. Each handler call (with its promise jobs): ${L.handlerMs} ms; an overrun is a strike, ${L.strikes} strikes or ${L.errors} errors switch the script off until the next match.`,
    `- At most ${L.scriptMsPerSecond} ms a second per script and ${L.placeMsPerSecond} ms a second for all scripts of a place, top levels included; match starts also share ${L.startMsPerWindow} ms in ${L.startWindowMs / 1000} s, and a script that does not fit waits.`,
    `- Code that does not yield in time (such as a loop of big sorts) is stopped and every script of the place is off for the match; after ${L.kills} such stops in ${L.killWindowMs / 60_000} minutes they stay off until a script is changed (first after ${L.killRetryMs / 1000} s, longer after each further stop) or the ${L.killWindowMs / 60_000} minutes have passed.`,
    `- At most ${L.actsPerHandler} act or emit calls and ${L.readsPerHandler} reads per handler; actions also count toward the rules' ${RULE_LIMITS.actionsPerEvent} actions per event and their chain of ${RULE_LIMITS.chain}.`,
    `- Memory: each script has a heap limit of about ${L.memoryBytes / 2 ** 20} MiB of objects (it counts allocations, so long strings count less than their size), and all scripts of a place share ${L.placeMemoryBytes / 2 ** 20} MiB; a call that grows the place's memory past ${L.placeMemorySoftBytes / 2 ** 20} MiB switches its script off until the next match.`,
    `- An event in is at most ${L.eventJsonBytes} bytes of JSON, an action out ${L.actJsonBytes}, a read's argument ${L.readJsonBytes}.`,
    `- Log: ${L.logPerSecond} lines a second per script, ${L.logChars} characters a line, the last ${L.logLines} lines of the place kept.`,
    '',
    'TypeScript declarations:',
    scriptApiDts(),
  ].join('\n');
}
