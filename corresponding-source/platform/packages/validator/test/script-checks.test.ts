import {
  Game,
  SCRIPT_LIMITS,
  WorldDocument,
  type ItemInstance,
  type PlaceScript,
  type Rule,
} from '@genvr/contracts';
import { SPAWN_POINT_ID, ZONE_AREA_ID } from '@genvr/core-library';
import { describe, expect, it } from 'vitest';
import {
  checkScripts,
  scriptLiterals,
  validateWorld,
  WORLD_FINDING_CODES,
  type WorldEnvironment,
} from '../src/index.js';
import { testGame } from './support.js';

// Every script here is an example written for the tests; nothing in the checks knows what any name means.

const doc = (instances: ItemInstance[], extra: Partial<WorldDocument> = {}) =>
  WorldDocument.parse({
    schemaVersion: 1,
    experienceId: 'x',
    version: 0,
    style: { base: 'blocky' },
    sizeTier: 'small',
    access: { mode: 'private' },
    environment: { sky: { preset: 'day' }, weather: { preset: 'clear' } },
    terrain: {},
    spawn: { position: [50, 1, 50] },
    instances,
    ...extra,
  });

const item = (instanceId: string, x: number, extra: Partial<ItemInstance> = {}): ItemInstance => ({
  instanceId,
  itemId: 'test.crate',
  transform: { position: [x, 0, 40], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
  params: {},
  ...extra,
});
const spawn = item('s1', 0, { itemId: SPAWN_POINT_ID });
const zone = (instanceId: string, x: number, tag: string) =>
  item(instanceId, x, { itemId: ZONE_AREA_ID, params: { zoneTag: tag } });

let next = 0;
const script = (source: string, extra: Partial<PlaceScript> = {}): PlaceScript => {
  next += 1;
  return {
    id: `scr-${next.toString(16).padStart(8, '0')}`,
    name: `example ${next}`,
    api: 1,
    enabled: true,
    source,
    ...extra,
  };
};
const rule = (when: Rule['when'], actions: Rule['do']): Rule => ({ when, if: [], do: actions });

const flat = (): WorldEnvironment => ({
  groundAt: () => 0,
  supportBelow: () => 0,
  itemShape: () => ({ min: [-0.5, 0, -0.5], max: [0.5, 1, 0.5], solid: false, part: true }),
});

const place = (scripts: PlaceScript[], game: Partial<Game> | null = {}, instances: ItemInstance[] = []) => ({
  ...doc([spawn, ...instances]),
  scripts,
  ...(game ? { game: { ...testGame(), ...game } as Game } : {}),
});
const codes = (world: WorldDocument, prefix = 'script-') =>
  validateWorld(world, flat())
    .findings.filter((f) => f.code.startsWith(prefix))
    .map((f) => f.id);
const found = (world: WorldDocument, code: string) =>
  validateWorld(world, flat()).findings.filter((f) => f.code === code);

describe('scriptLiterals: a light tokenizer that never runs the code', () => {
  it('finds the literal names of on, emit, act, counter and zones', () => {
    const literals = scriptLiterals(`
      genvr.on('zone_crossed', (e) => genvr.act({ kind: 'add_counter', name: "laps", by: 1 }));
      genvr.on(\`custom-one\`, () => {
        genvr.emit('ping');
        genvr.act({ kind: 'emit', event: 'pong' });
        genvr.act({ kind: 'teleport_to_zone', tag: 'home', who: 'actor' });
        genvr.act({ kind: 'end_match', winner: { byCounter: 'best', order: 'high' } });
        if (genvr.counter('total', 'red') > 3) genvr.zones('pad');
      });
    `);
    expect(literals).toEqual({
      on: ['zone_crossed', 'custom-one'],
      emits: ['ping', 'pong'],
      counters: ['laps', 'best', 'total'],
      zoneTags: ['home', 'pad'],
      dynamic: false,
    });
  });

  it('skips comments, other strings and regular expressions', () => {
    const literals = scriptLiterals(`
      // genvr.on('commented', () => {});
      /* genvr.emit('blocked') */
      const text = "genvr.emit('inside a string')";
      const re = /genvr.emit\\('in a regex'\\)/g;
      const half = 10 / 2 / 1;
      genvr.on('real', () => genvr.log(text, re, half, 'a // not a comment'));
    `);
    expect(literals.on).toEqual(['real']);
    expect(literals.emits).toEqual([]);
    expect(literals.dynamic).toBe(false);
  });

  it('marks names worked out while the script runs as dynamic', () => {
    expect(scriptLiterals(`genvr.on('a' + 'b', () => {});`).dynamic).toBe(true);
    expect(scriptLiterals('const n = 1; genvr.emit(`step-${n}`);').dynamic).toBe(true);
    expect(scriptLiterals(`const name = 'x'; genvr.on(name, () => {});`).dynamic).toBe(true);
    expect(scriptLiterals(`genvr.on('t', () => genvr.act({ kind: 'emit', event: pick() }));`).dynamic).toBe(
      true,
    );
    // An action that is not written out may be an emit.
    expect(
      scriptLiterals(`const a = { kind: 'emit', event: 'x' }; genvr.on('t', () => genvr.act(a));`).dynamic,
    ).toBe(true);
    // A template with an expression still lets the rest of the script be read.
    const mixed = scriptLiterals('genvr.on(`x${1}`, () => {}); genvr.emit("later");');
    expect(mixed.emits).toEqual(['later']);
    // Reads by a computed name are not names of events.
    expect(scriptLiterals(`const n = 'c'; genvr.counter(n); genvr.zones();`).dynamic).toBe(false);
  });

  it('never throws on broken source', () => {
    for (const source of ['genvr.on(', "genvr.emit('open", '`${', '/* never closed', 'genvr.act({ kind: ']) {
      expect(() => scriptLiterals(source)).not.toThrow();
    }
  });
});

describe('script checks (P2-10, spec 8)', () => {
  it('lists every script finding code', () => {
    for (const code of [
      'script-no-game',
      'script-too-big',
      'script-unknown-event',
      'script-counter-undeclared',
      'script-zone-tag-missing',
      'script-disabled',
      'script-dynamic-name',
      'script-endless-loop',
      'script-syntax',
      'script-unreviewed-copy',
    ])
      expect(WORLD_FINDING_CODES).toContain(code);
  });

  it('reports enabled scripts in a place without a game, once', () => {
    const world = place([script(`genvr.on('hit', () => {});`), script(`genvr.on('died', () => {});`)], null);
    const findings = found(world, 'script-no-game');
    expect(findings).toHaveLength(1);
    expect(findings[0]!.level).toBe('warning');
    expect(findings[0]!.message).toContain('2 scripts');
    // Switched-off scripts in a place without a game are only switched off.
    expect(found(place([script('', { enabled: false })], null), 'script-no-game')).toEqual([]);
  });

  it('reports scripts over the source limits (possible only in old data)', () => {
    const big = script('x'.repeat(SCRIPT_LIMITS.sourceChars + 1));
    // Built by hand: the schema refuses it now.
    const world = { ...place([]), scripts: [big] } as WorldDocument;
    const findings = checkScripts(world).filter((f) => f.code === 'script-too-big');
    expect(findings.map((f) => [f.id, f.level, f.script?.id])).toEqual([
      [`script-too-big:${big.id}`, 'warning', big.id],
    ]);
  });

  it('reports an event a script listens for that nobody raises', () => {
    const listener = script(`genvr.on('hit', () => {});\n\ngenvr.on('nobody-raises', () => {});`);
    const findings = found(place([listener]), 'script-unknown-event');
    expect(findings.map((f) => f.id)).toEqual([`script-unknown-event:${listener.id}:nobody-raises`]);
    expect(findings[0]!.script).toEqual({ id: listener.id, line: 3 });
    expect(findings[0]!.message).toContain('"nobody-raises"');
    expect(findings[0]!.message).toContain(`"${listener.name}"`);
  });

  it('a custom event raised by a rule or by another script is known', () => {
    const rules = { rules: [rule({ event: 'hit' }, [{ kind: 'emit', event: 'from-rule' }])] };
    const world = place(
      [
        script(`genvr.on('from-rule', () => {}); genvr.on('from-script', () => {});`),
        script(`genvr.on('died', () => genvr.emit('from-script'));`),
      ],
      rules,
    );
    expect(codes(world)).toEqual([]);
  });

  it('no false warning when a script emits the custom event a rule hears', () => {
    const world = place([script(`genvr.on('hit', () => genvr.act({ kind: 'emit', event: 'bonus' }));`)], {
      rules: [rule({ event: 'bonus' }, [{ kind: 'add_score', by: 1, who: 'actor' }])],
    });
    expect(codes(world, 'game-event-not-emitted')).toEqual([]);
    // A switched-off script raises nothing.
    const off = place([script(`genvr.on('hit', () => genvr.emit('bonus'));`, { enabled: false })], {
      rules: [rule({ event: 'bonus' }, [{ kind: 'add_score', by: 1, who: 'actor' }])],
    });
    expect(codes(off, 'game-event-not-emitted')).toEqual(['game-event-not-emitted:bonus']);
  });

  it('a dynamic name gives one info finding and turns the custom-event warnings off', () => {
    const dynamic = script(`const which = 'x';\ngenvr.on('hit', () => genvr.emit(which));`);
    const world = place([dynamic, script(`genvr.on('never', () => {});`)], {
      rules: [rule({ event: 'unraised' }, [{ kind: 'add_score', by: 1, who: 'actor' }])],
    });
    const findings = validateWorld(world, flat()).findings;
    const info = findings.filter((f) => f.code === 'script-dynamic-name');
    expect(info.map((f) => [f.id, f.level, f.script])).toEqual([
      [`script-dynamic-name:${dynamic.id}`, 'info', { id: dynamic.id, line: 2 }],
    ]);
    expect(findings.filter((f) => f.code === 'script-unknown-event')).toEqual([]);
    expect(findings.filter((f) => f.code === 'game-event-not-emitted')).toEqual([]);
  });

  it('reports a counter a script names that the game does not declare, with a fix that declares it', () => {
    const user = script(
      `genvr.on('hit', () => {\n  genvr.act({ kind: 'add_counter', name: 'combo', by: 1 });\n});`,
    );
    const world = place([user], { counters: [{ name: 'known', scope: 'player', start: 0 }] });
    const findings = found(world, 'script-counter-undeclared');
    expect(findings.map((f) => [f.id, f.script])).toEqual([
      [`script-counter-undeclared:${user.id}:combo`, { id: user.id, line: 2 }],
    ]);
    const fix = findings[0]!.fix!;
    expect(fix).toHaveLength(1);
    expect(fix[0]).toMatchObject({ type: 'set_game' });
    const game = (fix[0]!.params as { game: Game }).game;
    expect(game.counters).toEqual([
      { name: 'known', scope: 'player', start: 0 },
      { name: 'combo', scope: 'player', start: 0 },
    ]);
    expect(Game.safeParse(game).success).toBe(true);
    expect(found({ ...world, game }, 'script-counter-undeclared')).toEqual([]);
  });

  it('every whole-game fix carries the counters scripts need too (Fix all keeps them)', () => {
    const world = place([script(`genvr.on('hit', () => genvr.counter('fromScript'));`)], {
      rules: [rule({ event: 'hit' }, [{ kind: 'add_counter', name: 'fromRule', by: 1, who: 'actor' }])],
    });
    const fixes = validateWorld(world, flat()).findings.flatMap((f) => f.fix ?? []);
    expect(fixes.length).toBeGreaterThan(1);
    const games = fixes.map((command) => JSON.stringify((command.params as { game: Game }).game));
    expect(new Set(games).size).toBe(1);
    const game = JSON.parse(games[0]!) as Game;
    expect(game.counters?.map((c) => c.name)).toEqual(['fromRule', 'fromScript']);
  });

  it('reports a zone tag a script names that no zone has', () => {
    const user =
      script(`genvr.on('hit', () => genvr.act({ kind: 'teleport_to_zone', tag: 'nowhere', who: 'actor' }));
genvr.zones('pad');`);
    const world = place([user], {}, [zone('z1', 0, 'pad')]);
    expect(found(world, 'script-zone-tag-missing').map((f) => [f.id, f.script])).toEqual([
      [`script-zone-tag-missing:${user.id}:nowhere`, { id: user.id, line: 1 }],
    ]);
  });

  it('zone tags a script names count as used', () => {
    const world = place([script(`genvr.on('hit', () => genvr.zones('pad'));`)], {}, [
      zone('z1', 0, 'pad'),
      zone('z2', 10, 'spare'),
    ]);
    expect(codes(world, 'game-zone-tag-unused')).toEqual(['game-zone-tag-unused:spare']);
    // A script hearing zone events and comparing tags uses those tags.
    const compares = place(
      [script(`genvr.on('zone_entered', (e) => { if (e.tag === 'spare') genvr.log(1); });`)],
      {},
      [zone('z2', 10, 'spare'), zone('z3', 20, 'other')],
    );
    expect(codes(compares, 'game-zone-tag-unused')).toEqual(['game-zone-tag-unused:other']);
    // One hearing zone events without naming any tag hears every zone.
    const every = place([script(`genvr.on('zone_crossed', () => genvr.log('crossed'));`)], {}, [
      zone('z2', 10, 'spare'),
    ]);
    expect(codes(every, 'game-zone-tag-unused')).toEqual([]);
  });

  it('warns about an obvious endless loop, with its line (second review)', () => {
    for (const [source, line] of [
      [
        `genvr.on('tap', () => {
  while (true) { genvr.log('x'); }
});`,
        2,
      ],
      [
        `let n = 0;
for (;;) n++;`,
        2,
      ],
      [`genvr.on('tap', () => { while(1) {} });`, 1],
      [
        `genvr.on('tap', () => {
  do {
    genvr.phase();
  } while (true);
});`,
        2,
      ],
    ] as const) {
      const one = script(source);
      const findings = found(place([one]), 'script-endless-loop');
      expect(
        findings.map((f) => [f.id, f.level, f.script]),
        source,
      ).toEqual([[`script-endless-loop:${one.id}`, 'warning', { id: one.id, line }]]);
      expect(findings[0]!.message).toContain(`line ${line}`);
    }
  });

  it('leaves loops alone that can end, and loops written in strings or comments', () => {
    for (const source of [
      `genvr.on('tap', () => { while (true) { if (genvr.phase() === 'ended') break; } });`,
      `genvr.on('tap', () => { for (;;) { return; } });`,
      `function f() { while (true) { throw new Error('stop'); } }`,
      `let i = 0; while (i < 10) i++; for (let k = 0; k < 3; k++) {}`,
      `genvr.log('while (true) {}'); // for (;;) {}`,
      `/* while (true) {} */ genvr.on('tap', () => {});`,
      `genvr.on('tap', () => { do { genvr.phase(); } while (false); });`,
    ]) {
      expect(found(place([script(source)]), 'script-endless-loop'), source).toEqual([]);
    }
  });

  it('notes a switched-off script, and checks nothing else in it', () => {
    const off = script(`genvr.on('never-raised', () => genvr.counter('undeclared'));`, { enabled: false });
    const findings = validateWorld(place([off]), flat()).findings.filter((f) => f.code.startsWith('script-'));
    expect(findings.map((f) => [f.id, f.level])).toEqual([[`script-disabled:${off.id}`, 'info']]);
  });

  it('finds nothing in a consistent place', () => {
    const world = place(
      [
        script(`genvr.on('zone_crossed', (e) => {
  if (e.tag !== 'line') return;
  genvr.act({ kind: 'add_counter', name: 'passes', by: 1 });
  if (genvr.counter('passes', e.id) % 3 === 0) genvr.emit('third');
});`),
      ],
      {
        counters: [{ name: 'passes', scope: 'player', start: 0 }],
        rules: [rule({ event: 'third' }, [{ kind: 'add_score', by: 1, who: 'actor' }])],
      },
      [zone('z1', 0, 'line')],
    );
    expect(validateWorld(world, flat()).findings.filter((f) => /^(script|game)-/.test(f.code))).toEqual([]);
  });

  it('messages name no game', () => {
    const world = place(
      [
        script(`genvr.on('x', () => genvr.counter('c')); genvr.zones('t'); const n = 'y'; genvr.emit(n);`),
        script('', { enabled: false }),
      ],
      {},
    );
    for (const finding of checkScripts(world))
      expect(finding.message).not.toMatch(/\b(race|lap|round|weapon|sword|car)\b/i);
  });
});
