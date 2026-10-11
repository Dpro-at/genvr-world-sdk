import { SCRIPT_LIMITS } from '@genvr/contracts';
import { MULBERRY32_SOURCE } from './random.js';

/** File name of the prelude in stack traces (error lines are read only from the creator's `script.js` frames). */
export const PRELUDE_FILE = 'genvr-prelude.js';

/**
 * Host protocol (strings only, spec 7.2), captured by the prelude and deleted from the global before creator code:
 * - `__read(json)`: `{ op, ... }` -> JSON. `op: 'on'` registers a handler (top level only); the others are reads.
 * - `__act(json)`: `{ a: action, o: options | null }` -> 'true' | 'false'. `{ big: n }` reports an action that was
 *   too large to send.
 * - `__log(text)`: `'L' + line` writes a line and answers the lines still allowed this second (<= 0: muted for the rest
 *   of the call); `'D' + n` reports n lines the prelude dropped while muted.
 * - `__on(fn)` (from the sandbox's bootstrap): registers a function and answers its number. Number 0 is the prelude's
 *   own end-of-call hook (it reports dropped lines); creator handlers start at 1.
 */
export function prelude(seed: number): string {
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
