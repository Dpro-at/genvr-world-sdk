import {
  GameEventName,
  scriptChars,
  SCRIPT_LIMITS,
  zoneFromParams,
  type PlaceScript,
  type WorldDocument,
} from '@genvr/contracts';
import { zoneShapeOfItem } from '@genvr/core-library';
import { repairGame, undeclaredCounters } from './game-repair.js';
import type { WorldFinding } from './world-checks.js';

/**
 * Checks of creator scripts (P2-10, spec `docs/superpowers/specs/2026-10-02-script-sandbox-design.md` 8). Pure and
 * without WASM: a light tokenizer reads the literal names a script gives `genvr.on`, `genvr.emit`, `genvr.act`,
 * `genvr.counter` and `genvr.zones`; nothing is ever run. Whether a script compiles needs the sandbox, so the API adds
 * that (`script-syntax`).
 */

/** The literal names in one script's source (strings and templates without `${}`), each once, in order. */
export interface ScriptLiterals {
  /** Event names given to `genvr.on`. */
  on: string[];
  /** Custom events raised by `genvr.emit` or `genvr.act({ kind: 'emit', event })`. */
  emits: string[];
  /** Counters named by `genvr.counter` and the counter actions (`add_counter`, `set_counter`, `byCounter`). */
  counters: string[];
  /** Zone tags named by `genvr.zones` and `teleport_to_zone`. */
  zoneTags: string[];
  /** A name of an event, an emit or a zone tag is worked out while the script runs (or an action is not written out). */
  dynamic: boolean;
}

type Kind = 'on' | 'emit' | 'counter' | 'zone';
interface Spot {
  kind: Kind;
  name: string;
  line: number;
}
interface Reading {
  spots: Spot[];
  /** The first place a name is worked out while running; null when every name is literal. */
  dynamicAt: number | null;
  /** Every plain string literal of the script (zone events compare tags as strings). */
  strings: string[];
  /** The line of the first loop that plainly never ends; null for none. */
  endlessAt: number | null;
}

type Token =
  | { t: 'str'; v: string; line: number }
  /** A template literal with an expression in it. */
  | { t: 'dyn'; line: number }
  | { t: 'id'; v: string; line: number }
  | { t: 'p'; v: string; line: number }
  /** A number (`v`: its text) or a regular expression (no `v`). */
  | { t: 'num'; line: number; v?: string };

/** Words after which a `/` starts a regular expression, not a division. */
const BEFORE_EXPRESSION = new Set([
  'return',
  'typeof',
  'instanceof',
  'in',
  'of',
  'new',
  'delete',
  'void',
  'throw',
  'case',
  'do',
  'else',
  'yield',
  'await',
]);
const ESCAPES: Record<string, string> = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v', '0': '\0' };

/** Splits source into tokens; strings, templates, comments and regular expressions are read whole. Never throws. */
function tokenize(source: string): Token[] {
  const out: Token[] = [];
  const n = source.length;
  let i = 0;
  let line = 1;
  /** Brace depth at which each open template expression (`${`) began. */
  const templates: number[] = [];
  let depth = 0;

  const regexAllowed = () => {
    const last = out[out.length - 1];
    if (!last) return true;
    if (last.t === 'p') return last.v !== ')' && last.v !== ']' && last.v !== '}';
    if (last.t === 'id') return BEFORE_EXPRESSION.has(last.v);
    return false;
  };
  /** Reads a template body from `i` (after the backtick or a closing `}`); true when it ended with a backtick. */
  const templateBody = (): { text: string; ended: boolean } => {
    let text = '';
    while (i < n) {
      const c = source[i]!;
      if (c === '\\') {
        const e = source[i + 1] ?? '';
        if (e === '\n') line += 1;
        text += ESCAPES[e] ?? e;
        i += 2;
        continue;
      }
      if (c === '`') {
        i += 1;
        return { text, ended: true };
      }
      if (c === '$' && source[i + 1] === '{') {
        i += 2;
        templates.push(depth);
        depth += 1;
        return { text, ended: false };
      }
      if (c === '\n') line += 1;
      text += c;
      i += 1;
    }
    return { text, ended: true };
  };

  while (i < n) {
    const c = source[i]!;
    if (c === '\n') {
      line += 1;
      i += 1;
      continue;
    }
    if (c === ' ' || c === '\t' || c === '\r' || c === '\f' || c === '\v' || c === ' ' || c === '﻿') {
      i += 1;
      continue;
    }
    if (c === '/' && source[i + 1] === '/') {
      while (i < n && source[i] !== '\n') i += 1;
      continue;
    }
    if (c === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2);
      const stop = end < 0 ? n : end + 2;
      for (let k = i; k < stop; k += 1) if (source[k] === '\n') line += 1;
      i = stop;
      continue;
    }
    if (c === '"' || c === "'") {
      const start = line;
      let text = '';
      i += 1;
      while (i < n && source[i] !== c && source[i] !== '\n') {
        if (source[i] === '\\') {
          const e = source[i + 1] ?? '';
          if (e === '\n') line += 1;
          text += ESCAPES[e] ?? e;
          i += 2;
        } else {
          text += source[i];
          i += 1;
        }
      }
      i += 1;
      out.push({ t: 'str', v: text, line: start });
      continue;
    }
    if (c === '`') {
      const start = line;
      i += 1;
      const body = templateBody();
      out.push(body.ended ? { t: 'str', v: body.text, line: start } : { t: 'dyn', line: start });
      continue;
    }
    if (c === '/' && regexAllowed()) {
      i += 1;
      let inClass = false;
      while (i < n && source[i] !== '\n') {
        const r = source[i]!;
        if (r === '\\') i += 2;
        else {
          i += 1;
          if (r === '[') inClass = true;
          else if (r === ']') inClass = false;
          else if (r === '/' && !inClass) break;
        }
      }
      while (i < n && /[a-z]/i.test(source[i]!)) i += 1;
      out.push({ t: 'num', line });
      continue;
    }
    if (/[A-Za-z_$]/.test(c)) {
      let j = i + 1;
      while (j < n && /[\w$]/.test(source[j]!)) j += 1;
      out.push({ t: 'id', v: source.slice(i, j), line });
      i = j;
      continue;
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(source[i + 1] ?? ''))) {
      let j = i + 1;
      while (j < n && /[\w.]/.test(source[j]!)) j += 1;
      out.push({ t: 'num', line, v: source.slice(i, j) });
      i = j;
      continue;
    }
    if (c === '?' && source[i + 1] === '.' && !/[0-9]/.test(source[i + 2] ?? '')) {
      out.push({ t: 'p', v: '.', line });
      i += 2;
      continue;
    }
    if (c === '{') depth += 1;
    if (c === '}') {
      depth -= 1;
      if (templates.length > 0 && templates[templates.length - 1] === depth) {
        // The end of a template expression: the template goes on.
        templates.pop();
        i += 1;
        templateBody();
        continue;
      }
    }
    out.push({ t: 'p', v: c, line });
    i += 1;
  }
  return out;
}

const isP = (token: Token | undefined, v: string) => token?.t === 'p' && token.v === v;

/** A string literal that is a whole argument (followed by `,` or the closing bracket). */
function literalAt(tokens: Token[], k: number, closers = [',', ')']): { name: string; line: number } | null {
  const token = tokens[k];
  if (token?.t !== 'str') return null;
  return closers.some((v) => isP(tokens[k + 1], v)) ? { name: token.v, line: token.line } : null;
}

/** The tokens from `open` (a bracket) to its matching closer, exclusive; the closer's index too. */
function group(tokens: Token[], open: number): { end: number } {
  let level = 0;
  for (let k = open; k < tokens.length; k += 1) {
    const token = tokens[k]!;
    if (token.t !== 'p') continue;
    if (token.v === '(' || token.v === '{' || token.v === '[') level += 1;
    else if (token.v === ')' || token.v === '}' || token.v === ']') {
      level -= 1;
      if (level === 0) return { end: k };
    }
  }
  return { end: tokens.length };
}

/** The `key: 'literal'` pairs of an object literal starting at `open` (`{`), at any depth, and its own keys. */
function objectPairs(tokens: Token[], open: number) {
  const { end } = group(tokens, open);
  const own = new Map<string, { name: string; line: number } | null>();
  const nested = new Map<string, { name: string; line: number }>();
  let level = 0;
  for (let k = open; k < end; k += 1) {
    const token = tokens[k]!;
    if (token.t === 'p' && (token.v === '{' || token.v === '[' || token.v === '(')) level += 1;
    else if (token.t === 'p' && (token.v === '}' || token.v === ']' || token.v === ')')) level -= 1;
    const key = token.t === 'id' || token.t === 'str' ? token.v : null;
    if (key === null || !isP(tokens[k + 1], ':')) continue;
    const previous = tokens[k - 1];
    if (!(isP(previous, '{') || isP(previous, ','))) continue;
    const value = literalAt(tokens, k + 2, [',', '}']);
    if (level === 1) own.set(key, value);
    else if (value) nested.set(key, value);
  }
  return { own, nested };
}

/** Words that leave a loop's body: with one of them anywhere in it, the loop may end. */
const EXITS: ReadonlySet<string> = new Set(['break', 'return', 'throw']);

/** The end (exclusive) of the statement starting at `at`: a block, or up to its `;` outside brackets. */
function statementEnd(tokens: Token[], at: number): number {
  if (isP(tokens[at], '{')) return group(tokens, at).end + 1;
  let level = 0;
  for (let k = at; k < tokens.length; k += 1) {
    const token = tokens[k]!;
    if (token.t !== 'p') continue;
    if (token.v === '(' || token.v === '{' || token.v === '[') level += 1;
    else if (token.v === ')' || token.v === '}' || token.v === ']') level -= 1;
    else if (token.v === ';' && level === 0) return k + 1;
    if (level < 0) return k;
  }
  return tokens.length;
}

/** `(true)` or `(1)` from `at` (the opening bracket): the condition of a loop that never stops by itself. */
const alwaysTrue = (tokens: Token[], at: number) => {
  const condition = tokens[at + 1];
  if (!isP(tokens[at], '(') || !isP(tokens[at + 2], ')') || !condition) return false;
  return (condition.t === 'id' && condition.v === 'true') || (condition.t === 'num' && condition.v === '1');
};

/**
 * The first loop that plainly never ends (second review): `while (true)`, `while (1)`, `for (;;)` or `do ... while
 * (true)` whose body has no break, return or throw. Only the obvious case: a loop left by an exception from a call, or
 * by a break of an inner loop, is not flagged (no false alarms); the sandbox stops the rest at run time.
 */
function endlessLoop(tokens: Token[]): number | null {
  const doTails = new Set<number>();
  for (let k = 0; k < tokens.length; k += 1) {
    const head = tokens[k]!;
    if (head.t !== 'id' || doTails.has(k)) continue;
    let body: [number, number] | null = null;
    if (head.v === 'for' && isP(tokens[k + 1], '(') && isP(tokens[k + 2], ';') && isP(tokens[k + 3], ';')) {
      if (isP(tokens[k + 4], ')')) body = [k + 5, statementEnd(tokens, k + 5)];
    } else if (head.v === 'while' && alwaysTrue(tokens, k + 1)) {
      body = [k + 4, statementEnd(tokens, k + 4)];
    } else if (head.v === 'do') {
      const end = statementEnd(tokens, k + 1);
      const tail = tokens[end];
      if (tail?.t !== 'id' || tail.v !== 'while') continue;
      doTails.add(end);
      if (alwaysTrue(tokens, end + 1)) body = [k + 1, end];
    }
    if (!body) continue;
    const [from, to] = body;
    if (!tokens.slice(from, to).some((token) => token.t === 'id' && EXITS.has(token.v))) return head.line;
  }
  return null;
}

function read(source: string): Reading {
  const tokens = tokenize(source);
  const spots: Spot[] = [];
  const strings: string[] = [];
  let dynamicAt: number | null = null;
  const dynamic = (line: number) => {
    dynamicAt ??= line;
  };
  for (const token of tokens) if (token.t === 'str' && !strings.includes(token.v)) strings.push(token.v);

  for (let k = 0; k + 3 < tokens.length; k += 1) {
    const head = tokens[k]!;
    const member = tokens[k + 2];
    if (head.t !== 'id' || head.v !== 'genvr' || !isP(tokens[k + 1], '.') || member?.t !== 'id') continue;
    if (!isP(tokens[k + 3], '(')) continue;
    const arg = k + 4;
    const line = tokens[arg]?.line ?? member.line;
    switch (member.v) {
      case 'on':
      case 'emit': {
        const literal = literalAt(tokens, arg);
        if (literal) spots.push({ kind: member.v === 'on' ? 'on' : 'emit', ...literal });
        else dynamic(line);
        break;
      }
      case 'counter': {
        const literal = literalAt(tokens, arg);
        if (literal) spots.push({ kind: 'counter', ...literal });
        break;
      }
      case 'zones': {
        if (isP(tokens[arg], ')')) break;
        const literal = literalAt(tokens, arg);
        if (literal) spots.push({ kind: 'zone', ...literal });
        else dynamic(line);
        break;
      }
      case 'act': {
        if (!isP(tokens[arg], '{')) {
          dynamic(line);
          break;
        }
        const { own, nested } = objectPairs(tokens, arg);
        const kind = own.get('kind');
        if (!kind) {
          dynamic(line);
          break;
        }
        const named = (key: string, as: Kind, required: boolean) => {
          const value = own.get(key);
          if (value) spots.push({ kind: as, ...value });
          else if (required) dynamic(line);
        };
        if (kind.name === 'emit') named('event', 'emit', true);
        else if (kind.name === 'add_counter' || kind.name === 'set_counter') named('name', 'counter', false);
        else if (kind.name === 'teleport_to_zone') named('tag', 'zone', true);
        const by = nested.get('byCounter');
        if (kind.name === 'end_match' && by) spots.push({ kind: 'counter', ...by });
        break;
      }
      default:
        break;
    }
  }
  return { spots, dynamicAt, strings, endlessAt: endlessLoop(tokens) };
}

const unique = (spots: Spot[], kind: Kind) => [
  ...new Set(spots.filter((s) => s.kind === kind).map((s) => s.name)),
];

/** The literal names a script uses (spec 8); a small tokenizer, it never evaluates code and never throws. */
export function scriptLiterals(source: string): ScriptLiterals {
  const { spots, dynamicAt } = read(source);
  return {
    on: unique(spots, 'on'),
    emits: unique(spots, 'emit'),
    counters: unique(spots, 'counter'),
    zoneTags: unique(spots, 'zone'),
    dynamic: dynamicAt !== null,
  };
}

/** The events a zone tag narrows: a script hearing them uses the tags it compares against. */
const ZONE_EVENTS: ReadonlySet<string> = new Set(['zone_entered', 'zone_exited', 'zone_crossed']);

/** What the place's enabled scripts use together, for the game checks (`checkGameRules`). */
export interface ScriptUsage {
  emits: Set<string>;
  counters: string[];
  /** Zone tags the scripts name; `everyZone` when a script hears zone events without naming any existing tag. */
  zoneTags: Set<string>;
  everyZone: boolean;
  /** A script names an event, an emit or a zone tag while running: "nobody raises / uses" warnings are skipped. */
  dynamic: boolean;
}

const enabledOf = (doc: WorldDocument): PlaceScript[] =>
  (doc.scripts ?? []).filter((script) => script.enabled);

/** Zone tags the place has, with the zones' instance ids. */
export function zoneTagsOf(doc: WorldDocument): Map<string, string[]> {
  const zones = new Map<string, string[]>();
  for (const instance of doc.instances) {
    const zone = zoneFromParams(instance.params, zoneShapeOfItem(instance.itemId));
    if (zone) zones.set(zone.tag, [...(zones.get(zone.tag) ?? []), instance.instanceId]);
  }
  return zones;
}

/** The names the place's enabled scripts use, read once per check. */
export function scriptUsage(doc: WorldDocument): ScriptUsage {
  const usage: ScriptUsage = {
    emits: new Set(),
    counters: [],
    zoneTags: new Set(),
    everyZone: false,
    dynamic: false,
  };
  const scripts = enabledOf(doc);
  if (scripts.length === 0) return usage;
  const tags = zoneTagsOf(doc);
  for (const script of scripts) {
    const { spots, dynamicAt, strings } = read(script.source);
    if (dynamicAt !== null) usage.dynamic = true;
    for (const spot of spots) {
      if (spot.kind === 'emit') usage.emits.add(spot.name);
      if (spot.kind === 'counter' && !usage.counters.includes(spot.name)) usage.counters.push(spot.name);
      if (spot.kind === 'zone') usage.zoneTags.add(spot.name);
    }
    if (spots.some((spot) => spot.kind === 'on' && ZONE_EVENTS.has(spot.name))) {
      const named = strings.filter((text) => tags.has(text));
      if (named.length === 0) usage.everyZone = true;
      for (const tag of named) usage.zoneTags.add(tag);
    }
  }
  return usage;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Findings about the place's scripts (spec 8): enabled scripts without a game, scripts over the size limits, events a
 * script hears that nobody raises, counters the game does not declare, zone tags no zone has, switched-off scripts,
 * and names worked out while running. Switched-off scripts are only noted (they run nothing). Messages describe the
 * script, never a kind of game.
 */
export function checkScripts(doc: WorldDocument): WorldFinding[] {
  const findings: WorldFinding[] = [];
  const scripts = doc.scripts ?? [];
  if (scripts.length === 0) return findings;
  const where = (script: PlaceScript, line?: number) => ({
    script: { id: script.id, ...(line === undefined ? {} : { line }) },
  });
  const enabled = scripts.filter((script) => script.enabled);
  const game = doc.game ?? null;

  if (!game && enabled.length > 0)
    findings.push({
      id: 'script-no-game',
      code: 'script-no-game',
      level: 'warning',
      message: `The place has ${plural(enabled.length, 'script')} switched on but no game, so ${enabled.length === 1 ? 'it does' : 'they do'} not run. Scripts hear the game's events: give the place a game or switch the scripts off.`,
      instanceIds: [],
      fix: null,
    });

  // Sizes: the command refuses them, so only old data can be over.
  for (const script of scripts)
    if (script.source.length > SCRIPT_LIMITS.sourceChars)
      findings.push({
        id: `script-too-big:${script.id}`,
        code: 'script-too-big',
        level: 'warning',
        message: `Script "${script.name}" has ${script.source.length} characters; a script may have ${SCRIPT_LIMITS.sourceChars}. Make it shorter.`,
        instanceIds: [],
        fix: null,
        ...where(script),
      });
  if (scriptChars(scripts) > SCRIPT_LIMITS.totalChars)
    findings.push({
      id: 'script-too-big:total',
      code: 'script-too-big',
      level: 'warning',
      message: `The scripts have ${scriptChars(scripts)} characters together; a place may have ${SCRIPT_LIMITS.totalChars}.`,
      instanceIds: [],
      fix: null,
    });
  if (scripts.length > SCRIPT_LIMITS.scripts)
    findings.push({
      id: 'script-too-big:count',
      code: 'script-too-big',
      level: 'warning',
      message: `The place has ${scripts.length} scripts; it may have ${SCRIPT_LIMITS.scripts}.`,
      instanceIds: [],
      fix: null,
    });

  for (const script of scripts)
    if (!script.enabled)
      findings.push({
        id: `script-disabled:${script.id}`,
        code: 'script-disabled',
        level: 'info',
        message: `Script "${script.name}" is switched off.`,
        instanceIds: [],
        fix: null,
        ...where(script),
      });

  // What the enabled scripts and the rules raise and use, once.
  const usage = scriptUsage(doc);
  const engine: ReadonlySet<string> = new Set(GameEventName.options);
  const ruleEmits = new Set(
    (game?.rules ?? []).flatMap((rule) => rule.do.flatMap((a) => (a.kind === 'emit' ? [a.event] : []))),
  );
  const declared = new Set((game?.counters ?? []).map((counter) => counter.name));
  const tags = zoneTagsOf(doc);
  const repaired = game ? repairGame(game, usage.counters) : null;
  // Counters the game's own parts already report (game-counter-undeclared) are not reported twice.
  const gameUndeclared = new Set(game ? undeclaredCounters(game).undeclared : []);
  let fixGiven = false;

  for (const script of enabled) {
    const { spots, dynamicAt, endlessAt } = read(script.source);
    if (endlessAt !== null)
      findings.push({
        id: `script-endless-loop:${script.id}`,
        code: 'script-endless-loop',
        level: 'warning',
        message: `Script "${script.name}" has a loop that never ends (line ${endlessAt}): nothing in it breaks, returns or throws. When it runs, the script is stopped and switched off. Give the loop a way out.`,
        instanceIds: [],
        fix: null,
        ...where(script, endlessAt),
      });
    if (dynamicAt !== null)
      findings.push({
        id: `script-dynamic-name:${script.id}`,
        code: 'script-dynamic-name',
        level: 'info',
        message: `Script "${script.name}" works out an event name, an action or a zone tag while it runs (line ${dynamicAt}), so the Checks cannot see which; warnings about events nobody raises and zone tags nobody uses are skipped.`,
        instanceIds: [],
        fix: null,
        ...where(script, dynamicAt),
      });
    const seen = new Set<string>();
    const once = (key: string) => {
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    };
    for (const spot of spots) {
      if (spot.kind === 'on' && !usage.dynamic && !engine.has(spot.name)) {
        if (ruleEmits.has(spot.name) || usage.emits.has(spot.name) || !once(`on:${spot.name}`)) continue;
        findings.push({
          id: `script-unknown-event:${script.id}:${spot.name}`,
          code: 'script-unknown-event',
          level: 'warning',
          message: `Script "${script.name}" listens for the event "${spot.name}" (line ${spot.line}), but the engine, the rules and the scripts never raise it. Raise it with an emit or listen for another event.`,
          instanceIds: [],
          fix: null,
          ...where(script, spot.line),
        });
      }
      if (spot.kind === 'counter' && game && !declared.has(spot.name) && !gameUndeclared.has(spot.name)) {
        if (!once(`counter:${spot.name}`)) continue;
        const fixes = !fixGiven && repaired !== null && repaired.counters?.some((c) => c.name === spot.name);
        if (fixes) fixGiven = true;
        findings.push({
          id: `script-counter-undeclared:${script.id}:${spot.name}`,
          code: 'script-counter-undeclared',
          level: 'warning',
          message: `Script "${script.name}" uses the counter "${spot.name}" (line ${spot.line}), but the game declares no counter with that name. Declare it or use a declared name.`,
          instanceIds: [],
          fix: fixes ? [{ type: 'set_game', params: { game: repaired! } }] : null,
          ...where(script, spot.line),
        });
      }
      if (spot.kind === 'zone' && !tags.has(spot.name)) {
        if (!once(`zone:${spot.name}`)) continue;
        findings.push({
          id: `script-zone-tag-missing:${script.id}:${spot.name}`,
          code: 'script-zone-tag-missing',
          level: 'warning',
          message: `Script "${script.name}" uses the zone tag "${spot.name}" (line ${spot.line}), but no zone in the place has it. Give an item that tag or change the script.`,
          instanceIds: [],
          fix: null,
          ...where(script, spot.line),
        });
      }
    }
  }
  return findings;
}
