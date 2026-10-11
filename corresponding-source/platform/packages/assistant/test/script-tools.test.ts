import { Game, SCRIPT_LIMITS, WorldDocument, type CommandPayload, type PlaceScript } from '@genvr/contracts';
import { compileCheck, dryRun, type ScriptLogLine } from '@genvr/script';
import { applyCommand, createWorldState, type WorldState } from '@genvr/world';
import { describe, expect, it } from 'vitest';
import {
  DATA_LINE,
  runTool,
  systemPrompt,
  TOOL_DEFINITIONS,
  toolDefinitions,
  type AssistantHost,
} from '../src/index.js';

// Every script here is an example written for the tests.

const GAME: Game = Game.parse({
  match: { minPlayers: 2, durationSec: 60, countdownSec: 0, resultsSec: 3 },
  win: { by: 'highest_score' },
  counters: [{ name: 'passes', scope: 'player', start: 0 }],
});

function host(options: { game?: Game | null; scripts?: PlaceScript[]; engine?: boolean } = {}) {
  const state: WorldState = createWorldState(
    WorldDocument.parse({
      schemaVersion: 1,
      experienceId: 'exp-script-tools',
      version: 0,
      style: { base: 'blocky' },
      sizeTier: 'small',
      access: { mode: 'private' },
      environment: { sky: { preset: 'day' }, weather: { preset: 'clear' } },
      terrain: {},
      spawn: { position: [0, 1, 0] },
      instances: [
        {
          instanceId: 'gate-1',
          itemId: 'genvr.core.gameplay.zone-gate',
          transform: { position: [0, 0, -20], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
          params: { zoneTag: 'line' },
        },
      ],
      ...(options.game === null ? {} : { game: options.game ?? GAME }),
      ...(options.scripts ? { scripts: options.scripts } : {}),
    }),
  );
  const applied: CommandPayload[][] = [];
  const logs: ScriptLogLine[] = [];
  let recording: Awaited<ReturnType<NonNullable<AssistantHost['scriptRecording']>>> = null;
  const since: Array<number | undefined> = [];
  const assistant: AssistantHost = {
    world: () => state.doc,
    heightAt: () => 0,
    apply: (commands) => {
      try {
        for (const command of commands) applyCommand(state, command);
      } catch (error) {
        return error instanceof Error ? error.message : 'refused';
      }
      applied.push(commands);
      return null;
    },
    addWater: () => null,
    focus: () => ({ x: 0, z: 0 }),
    ...(options.engine === false ? {} : { scripts: { compileCheck, dryRun } }),
    scriptLog: async (from) => {
      since.push(from);
      return logs;
    },
    scriptRecording: async () => recording,
  };
  return {
    host: assistant,
    applied,
    state,
    logs,
    since,
    setRecording: (r: typeof recording) => {
      recording = r;
    },
  };
}

const script = (id: string, source: string, extra: Partial<PlaceScript> = {}): PlaceScript => ({
  id,
  name: `example ${id.slice(-2)}`,
  api: 1,
  enabled: true,
  source,
  ...extra,
});

const COUNTER = `genvr.on('zone_crossed', (e) => {
  if (e.tag !== 'line') return;
  genvr.act({ kind: 'add_counter', name: 'passes', by: 1 });
  genvr.log('pass', e.id);
});`;

describe('script tool schemas (P2-10, spec 12)', () => {
  it('offers the five script tools in every place, with their arguments', () => {
    const params = (name: string) =>
      Object.keys(
        (
          TOOL_DEFINITIONS.find((t) => t.function.name === name)!.function.parameters as {
            properties: object;
          }
        ).properties,
      );
    expect(params('get_script_api')).toEqual(['part']);
    expect(params('get_scripts')).toEqual(['script_id', 'from_line']);
    expect(params('set_script')).toEqual(['script_id', 'name', 'source', 'enabled', 'remove']);
    expect(params('test_script')).toEqual(['script_id', 'source', 'events', 'recording', 'players', 'seed']);
    expect(params('get_script_logs')).toEqual(['since']);
    for (const blockGround of [false, true])
      expect(toolDefinitions({ blockGround }).map((t) => t.function.name)).toEqual(
        expect.arrayContaining([
          'get_script_api',
          'get_scripts',
          'set_script',
          'test_script',
          'get_script_logs',
        ]),
      );
  });

  it('descriptions name no game, and examples are named as examples', () => {
    for (const name of ['get_script_api', 'get_scripts', 'set_script', 'test_script', 'get_script_logs']) {
      const text = TOOL_DEFINITIONS.find((t) => t.function.name === name)!.function.description;
      expect(text).not.toMatch(/\b(race|lap|round|weapon|sword|car)s?\b/i);
    }
  });

  it('the built-in assistant is not pushed to write code: its prompt keeps "never write code"', () => {
    expect(systemPrompt(host().host)).toContain('never write code');
    expect(systemPrompt(host().host)).not.toMatch(/script/i);
  });
});

describe('get_script_api', () => {
  it('gives the reference with limits and two examples, and the TypeScript declarations as a second part', async () => {
    const guide = await runTool('get_script_api', {}, host().host);
    expect(guide.ok).toBe(true);
    expect(guide.result).toContain('genvr.on(');
    expect(guide.result).toContain('Limits:');
    expect(guide.result.match(/^Example \d/gm)).toHaveLength(2);
    expect(guide.result).toContain("part: 'types'");
    expect(guide.result.length).toBeLessThan(8000);
    const types = await runTool('get_script_api', { part: 'types' }, host().host);
    expect(types.result).toContain('declare const genvr');
    expect(types.result.length).toBeLessThan(8000);
  });
});

describe('set_script', () => {
  it('adds a script as one set_script command and answers with its Checks', async () => {
    const h = host();
    const outcome = await runTool(
      'set_script',
      { name: 'example counter', source: "genvr.on('nobody-raises', () => {});" },
      h.host,
      { random: () => 0.5 },
    );
    expect(outcome.ok).toBe(true);
    expect(h.applied).toHaveLength(1);
    const [command] = h.applied[0]!;
    expect(command).toMatchObject({
      type: 'set_script',
      params: { script: { name: 'example counter', api: 1, enabled: true } },
    });
    const id = (command!.params as { scriptId: string }).scriptId;
    expect(id).toMatch(/^scr-[0-9a-f]{8}$/);
    expect(outcome.result.startsWith(`${DATA_LINE}\n`)).toBe(true);
    expect(outcome.result).toContain(id);
    expect(outcome.result).toContain('script-unknown-event');
    expect(h.state.doc.scripts).toHaveLength(1);
  });

  it('reports a syntax error with its line when the host can compile', async () => {
    const h = host();
    const outcome = await runTool('set_script', { name: 'draft', source: 'genvr.on(\n  "x",\n' }, h.host);
    expect(outcome.ok).toBe(true);
    expect(outcome.result).toMatch(/script-syntax line \d+/);
    // Without the engine only the static Checks run.
    const plain = await runTool(
      'set_script',
      { name: 'draft', source: 'let = ;' },
      host({ engine: false }).host,
    );
    expect(plain.result).not.toContain('script-syntax');
  });

  it('edits, switches off and removes by id; each is one command', async () => {
    const h = host({ scripts: [script('scr-000000a1', COUNTER)] });
    const edit = await runTool('set_script', { script_id: 'scr-000000a1', source: '// nothing yet' }, h.host);
    expect(edit.ok).toBe(true);
    expect(h.state.doc.scripts![0]).toMatchObject({
      name: 'example a1',
      source: '// nothing yet',
      enabled: true,
    });
    await runTool('set_script', { script_id: 'scr-000000a1', enabled: false }, h.host);
    expect(h.state.doc.scripts![0]!.enabled).toBe(false);
    await runTool('set_script', { script_id: 'scr-000000a1', name: 'renamed' }, h.host);
    expect(h.state.doc.scripts![0]!.name).toBe('renamed');
    const removed = await runTool('set_script', { script_id: 'scr-000000a1', remove: true }, h.host);
    expect(removed.ok).toBe(true);
    expect(h.state.doc.scripts).toBeUndefined();
    expect(
      h.applied.map((batch) => batch.map((c) => [c.type, (c.params as { script: unknown }).script === null])),
    ).toEqual([
      [['set_script', false]],
      [['set_script', false]],
      [['set_script', false]],
      [['set_script', true]],
    ]);
  });

  it('a changed text drops the store pin; a rename or a switch keeps it (review finding 4)', async () => {
    const from = { itemId: 'user.example.counter-script', version: '1.0.0', sha256: 'a'.repeat(64) };
    const h = host({ scripts: [script('scr-000000a1', COUNTER, { from })] });
    await runTool('set_script', { script_id: 'scr-000000a1', name: 'renamed' }, h.host);
    await runTool('set_script', { script_id: 'scr-000000a1', enabled: false }, h.host);
    await runTool('set_script', { script_id: 'scr-000000a1', source: COUNTER }, h.host);
    expect(h.state.doc.scripts![0]!.from).toEqual(from);
    await runTool('set_script', { script_id: 'scr-000000a1', source: `${COUNTER}\n// changed` }, h.host);
    expect(h.state.doc.scripts![0]!.from).toBeUndefined();
  });

  it('refuses what cannot be done, with nothing applied', async () => {
    const full = host({
      scripts: Array.from({ length: SCRIPT_LIMITS.scripts }, (_, i) => script(`scr-0000000${i}`, '')),
    });
    const cases: Array<[AssistantHost, Record<string, unknown>, RegExp]> = [
      [host().host, { source: '' }, /name/],
      [host().host, { script_id: 'scr-0000ffff', enabled: true }, /no script/],
      [host().host, { script_id: 'scr-0000ffff', remove: true }, /no script/],
      [host({ scripts: [script('scr-000000a1', '')] }).host, { script_id: 'scr-000000a1' }, /give/i],
      [full.host, { name: 'one more', source: '' }, /8 scripts/],
    ];
    for (const [h, args, error] of cases) {
      const outcome = await runTool('set_script', args, h);
      expect(outcome.ok, JSON.stringify(args)).toBe(false);
      expect(outcome.result).toMatch(error);
    }
    expect(full.applied).toEqual([]);
  });
});

describe('get_scripts', () => {
  it('lists the scripts, and gives one source with line numbers after the data line', async () => {
    const h = host({
      scripts: [
        script('scr-000000a1', COUNTER),
        script('scr-000000a2', '', {
          enabled: false,
          from: { itemId: 'user.example.script', version: '1.2.0', sha256: 'a'.repeat(64) },
        }),
      ],
    });
    const list = await runTool('get_scripts', {}, h.host);
    expect(list.result.startsWith(`${DATA_LINE}\n`)).toBe(true);
    expect(list.result).toContain('scr-000000a1: "example a1", on');
    expect(list.result).toContain(
      'scr-000000a2: "example a2", off, 0 characters, copied from user.example.script 1.2.0',
    );
    const one = await runTool('get_scripts', { script_id: 'scr-000000a1' }, h.host);
    expect(one.result.startsWith(`${DATA_LINE}\n`)).toBe(true);
    expect(one.result).toContain("   1| genvr.on('zone_crossed', (e) => {");
    expect(one.result).toContain('   5| });');
    expect(one.result).not.toContain('more_lines_from');
    expect((await runTool('get_scripts', { script_id: 'scr-0000ffff' }, h.host)).ok).toBe(false);
    expect((await runTool('get_scripts', {}, host().host)).result).toContain('no scripts');
  });

  it('pages a long source by lines', async () => {
    const long = Array.from({ length: 300 }, (_, i) => `genvr.log('line ${i} ${'x'.repeat(20)}');`).join(
      '\n',
    );
    const h = host({ scripts: [script('scr-000000a1', long)] });
    const first = await runTool('get_scripts', { script_id: 'scr-000000a1' }, h.host);
    expect(first.result.length).toBeLessThan(8000);
    const next = Number(/more_lines_from: (\d+)/.exec(first.result)![1]);
    expect(next).toBeGreaterThan(1);
    const second = await runTool('get_scripts', { script_id: 'scr-000000a1', from_line: next }, h.host);
    expect(second.result).toContain(`${String(next).padStart(4)}| `);
  });
});

describe('test_script', () => {
  const crossing = { type: 'zone_crossed', id: 'p1', zone: 'gate-1', tag: 'line' };

  it('dry-runs a saved script on the place game and lists the requested actions, counters and log', async () => {
    const h = host({ scripts: [script('scr-000000a1', COUNTER)] });
    const outcome = await runTool(
      'test_script',
      { script_id: 'scr-000000a1', events: [crossing, { ...crossing, id: 'p2' }] },
      h.host,
    );
    expect(outcome.ok).toBe(true);
    expect(outcome.result.startsWith(`${DATA_LINE}\n`)).toBe(true);
    expect(outcome.result).toContain('add_counter');
    expect(outcome.result).toContain('accepted');
    expect(outcome.result).toContain('p1: passes=1');
    expect(outcome.result).toContain('pass p2');
    expect(outcome.result.length).toBeLessThan(8000);
    // Nothing is saved.
    expect(h.applied).toEqual([]);
  });

  it('runs an unsaved draft given as source', async () => {
    const h = host();
    const outcome = await runTool('test_script', { source: COUNTER, events: [crossing] }, h.host);
    expect(outcome.ok).toBe(true);
    expect(outcome.result).toContain('p1: passes=1');
    expect(h.applied).toEqual([]);
  });

  it('names refused events and their reasons', async () => {
    const outcome = await runTool(
      'test_script',
      { source: COUNTER, events: [{ ...crossing, id: 'p9' }] },
      host().host,
    );
    expect(outcome.result).toContain('"p9"');
  });

  it("replays the last match's recording from the room", async () => {
    const h = host();
    h.setRecording({
      seed: 3,
      events: [
        { type: 'player_joined', actor: 'p1', id: 'p1', team: null, returning: false },
        { type: 'player_joined', actor: 'p2', id: 'p2', team: null, returning: false },
        { type: 'zone_crossed', actor: 'p2', id: 'p2', zone: 'gate-1', tag: 'line' },
      ],
      at: [0, 0, 400],
      caused: [false, false, false],
    });
    const outcome = await runTool('test_script', { source: COUNTER, recording: 'last_match' }, h.host);
    expect(outcome.ok).toBe(true);
    expect(outcome.result).toContain('p2: passes=1');
    expect(outcome.result).toContain('seed 3');
  });

  it('refuses without a game, a recording, the engine, or a script to test', async () => {
    const cases: Array<[AssistantHost, Record<string, unknown>, RegExp]> = [
      [host({ game: null }).host, { source: COUNTER, events: [] }, /no game/],
      [host().host, { source: COUNTER, recording: 'last_match' }, /no recording/i],
      [host({ engine: false }).host, { source: COUNTER, events: [] }, /not available/],
      [host().host, { events: [] }, /script_id or source/],
      [host().host, { script_id: 'scr-0000ffff', events: [] }, /no script/],
      [host().host, { source: COUNTER, events: [], recording: 'last_match' }, /events or recording/],
    ];
    for (const [h, args, error] of cases) {
      const outcome = await runTool('test_script', args, h);
      expect(outcome.ok, JSON.stringify(args)).toBe(false);
      expect(outcome.result).toMatch(error);
    }
    // More than 500 events is refused by the schema.
    const many = await runTool(
      'test_script',
      { source: '', events: Array.from({ length: 501 }, () => ({ type: 'custom', name: 'x', id: null })) },
      host().host,
    );
    expect(many.ok).toBe(false);
  });
});

describe('get_script_logs', () => {
  it("reads the place's script log after the data line", async () => {
    const h = host();
    h.logs.push(
      { at: 1200, script: 'example a1', level: 'log', text: 'pass p1' },
      {
        at: 1300,
        script: 'example a1',
        level: 'error',
        text: 'script "example a1" line 2: TypeError: x',
        line: 2,
      },
    );
    const outcome = await runTool('get_script_logs', { since: 1000 }, h.host);
    expect(outcome.ok).toBe(true);
    expect(outcome.result.startsWith(`${DATA_LINE}\n`)).toBe(true);
    expect(outcome.result).toContain('[1200 ms] example a1 log: pass p1');
    expect(outcome.result).toContain('error');
    expect(h.since).toEqual([1000]);
    const empty = await runTool('get_script_logs', {}, host().host);
    expect(empty.result).toContain('No script log lines');
    const { scriptLog: _dropped, ...none } = host().host;
    void _dropped;
    expect((await runTool('get_script_logs', {}, none)).result).toContain('not available');
  });
});
