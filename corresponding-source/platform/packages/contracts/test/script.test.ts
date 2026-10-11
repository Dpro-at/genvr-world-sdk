import { describe, expect, it } from 'vitest';
import {
  Action,
  CommandPayload,
  GameEventName,
  GenvrManifest,
  PackagePath,
  PlaceScript,
  SCRIPT_API,
  SCRIPT_LIMITS,
  ScriptEvent,
  ScriptRecording,
  ScriptTestEvent,
  scriptApiDts,
  scriptApiText,
  WorldDocument,
} from '../src/index.js';
import { emptyWorld, seaWaterManifest } from './fixtures.js';

const script = (over: Record<string, unknown> = {}) => ({
  id: 'scr-0a1b2c3d',
  name: 'Example counter',
  api: 1,
  enabled: true,
  source: "genvr.on('zone_crossed', (e) => genvr.act({ kind: 'add_counter', name: 'n', by: 1 }));",
  ...over,
});

describe('PlaceScript', () => {
  it('accepts a script and trims its name', () => {
    expect(PlaceScript.parse(script({ name: '  Example  ' })).name).toBe('Example');
  });

  it('refuses a bad id, an empty name, a long name, another api and an over-long source', () => {
    expect(PlaceScript.safeParse(script({ id: 'scr-XYZ' })).success).toBe(false);
    expect(PlaceScript.safeParse(script({ id: 'abc' })).success).toBe(false);
    expect(PlaceScript.safeParse(script({ name: '   ' })).success).toBe(false);
    expect(PlaceScript.safeParse(script({ name: 'x'.repeat(41) })).success).toBe(false);
    expect(PlaceScript.safeParse(script({ api: 2 })).success).toBe(false);
    expect(PlaceScript.safeParse(script({ source: 'x'.repeat(SCRIPT_LIMITS.sourceChars) })).success).toBe(
      true,
    );
    expect(PlaceScript.safeParse(script({ source: 'x'.repeat(16_385) })).success).toBe(false);
  });

  it('keeps where a copied script came from', () => {
    const from = { itemId: 'example.counter', version: '1.0.0', sha256: 'a'.repeat(64) };
    expect(PlaceScript.parse(script({ from })).from).toEqual(from);
    expect(PlaceScript.safeParse(script({ from: { ...from, sha256: 'xyz' } })).success).toBe(false);
  });
});

describe('WorldDocument.scripts', () => {
  const many = (n: number, chars = 10) =>
    Array.from({ length: n }, (_, i) => script({ id: `scr-0000000${i}`, source: 'x'.repeat(chars) }));

  it('is optional, so old documents stay valid', () => {
    const doc = WorldDocument.parse(emptyWorld);
    expect(doc.scripts).toBeUndefined();
    expect(doc.schemaVersion).toBe(1);
  });

  it('allows 8 scripts and refuses a 9th', () => {
    expect(WorldDocument.safeParse({ ...emptyWorld, scripts: many(8) }).success).toBe(true);
    expect(WorldDocument.safeParse({ ...emptyWorld, scripts: many(9) }).success).toBe(false);
  });

  it('refuses more than 65 536 characters of source in total', () => {
    expect(WorldDocument.safeParse({ ...emptyWorld, scripts: many(4, 16_384) }).success).toBe(true);
    const over = [...many(4, 16_384), script({ id: 'scr-000000ff', source: 'x' })];
    expect(WorldDocument.safeParse({ ...emptyWorld, scripts: over }).success).toBe(false);
  });

  it('refuses two scripts with the same id', () => {
    const twice = [script(), script({ name: 'Other' })];
    expect(WorldDocument.safeParse({ ...emptyWorld, scripts: twice }).success).toBe(false);
  });
});

describe('set_script', () => {
  it('adds or replaces with a script, and removes with null', () => {
    const { id: _id, ...body } = script();
    void _id;
    expect(
      CommandPayload.parse({ type: 'set_script', params: { scriptId: 'scr-0a1b2c3d', script: body } }).type,
    ).toBe('set_script');
    expect(
      CommandPayload.safeParse({ type: 'set_script', params: { scriptId: 'scr-0a1b2c3d', script: null } })
        .success,
    ).toBe(true);
    expect(
      CommandPayload.safeParse({
        type: 'set_script',
        params: { scriptId: 'scr-0a1b2c3d', script: null, index: 2 },
      }).success,
    ).toBe(true);
  });

  it('refuses a bad id, an over-long source and an id inside the script', () => {
    const { id: _id, ...body } = script();
    void _id;
    expect(
      CommandPayload.safeParse({ type: 'set_script', params: { scriptId: 'nope', script: body } }).success,
    ).toBe(false);
    expect(
      CommandPayload.safeParse({
        type: 'set_script',
        params: { scriptId: 'scr-0a1b2c3d', script: { ...body, source: 'x'.repeat(16_385) } },
      }).success,
    ).toBe(false);
    expect(
      CommandPayload.safeParse({
        type: 'set_script',
        params: { scriptId: 'scr-0a1b2c3d', script: { ...body, index: -1 } },
      }).success,
    ).toBe(true);
    expect(
      CommandPayload.safeParse({
        type: 'set_script',
        params: { scriptId: 'scr-0a1b2c3d', script: null, index: -1 },
      }).success,
    ).toBe(false);
  });
});

describe('ScriptEvent', () => {
  it('has one shape per engine event plus custom, with handles instead of ids', () => {
    const types = ScriptEvent.options.map((option) => option.shape.type.value).sort();
    expect(types).toEqual([...GameEventName.options, 'custom'].sort());
    expect(
      ScriptEvent.parse({ type: 'zone_crossed', actor: 'p2', id: 'p2', zone: 'gate-1', tag: 'line' }),
    ).toMatchObject({ actor: 'p2' });
    expect(
      ScriptEvent.safeParse({ type: 'zone_crossed', actor: 'acc-123', id: 'acc-123', zone: 'g', tag: 't' })
        .success,
    ).toBe(false);
    expect(ScriptEvent.parse({ type: 'custom', name: 'boost', actor: 'p1', id: 'p1' })).toMatchObject({
      name: 'boost',
    });
  });
});

describe('SCRIPT_API', () => {
  it('names only generic reads, requests and logging', () => {
    expect(SCRIPT_API.map((entry) => entry.name)).toEqual([
      'on',
      'now',
      'phase',
      'timeLeft',
      'players',
      'player',
      'counter',
      'zones',
      'random',
      'act',
      'emit',
      'log',
    ]);
    for (const entry of SCRIPT_API) {
      expect(entry.signature.length).toBeGreaterThan(0);
      expect(entry.doc.length).toBeGreaterThan(0);
    }
  });

  it('the .d.ts names every entry, every event and every action', () => {
    const dts = scriptApiDts();
    for (const entry of SCRIPT_API) expect(dts).toContain(`${entry.name}(`);
    for (const name of GameEventName.options) expect(dts).toContain(`'${name}'`);
    for (const option of Action.options) expect(dts).toContain(`"${option.shape.kind.value}"`);
    expect(dts).toContain('declare const genvr');
  });

  it('the reference text lists every entry and the limits', () => {
    const text = scriptApiText();
    for (const entry of SCRIPT_API) expect(text).toContain(`genvr.${entry.name}(`);
    expect(text).toContain(String(SCRIPT_LIMITS.actsPerHandler));
    expect(text).toContain(scriptApiDts());
  });

  it('the memory limits are told as the sandbox enforces them (review finding 5)', () => {
    const text = scriptApiText();
    expect(text).not.toMatch(/MiB per script;/);
    expect(text).toContain(`share ${SCRIPT_LIMITS.placeMemoryBytes / 2 ** 20} MiB`);
    expect(text).toContain(`past ${SCRIPT_LIMITS.placeMemorySoftBytes / 2 ** 20} MiB`);
  });
});

describe('script packages', () => {
  const scriptManifest = {
    ...seaWaterManifest,
    id: 'example.counter',
    type: 'script',
    category: 'gameplay',
    subcategory: 'scripts',
    entry: { script: 'scripts/main.js' },
    physics: undefined,
    material: undefined,
    audio: {},
  };

  it('a script item names one script and no model', () => {
    expect(GenvrManifest.safeParse(scriptManifest).success).toBe(true);
    expect(GenvrManifest.safeParse({ ...scriptManifest, entry: {} }).success).toBe(false);
    expect(
      GenvrManifest.safeParse({ ...scriptManifest, entry: { script: 'scripts/main.js', model: 'model.glb' } })
        .success,
    ).toBe(false);
    expect(GenvrManifest.safeParse({ ...scriptManifest, entry: { script: 'main.js' } }).success).toBe(false);
  });

  it('other item types are unchanged', () => {
    expect(GenvrManifest.safeParse(seaWaterManifest).success).toBe(true);
  });

  it('PackagePath accepts scripts/<name>.js only', () => {
    expect(PackagePath.safeParse('scripts/main.js').success).toBe(true);
    expect(PackagePath.safeParse('scripts/my-script_2.js').success).toBe(true);
    expect(PackagePath.safeParse('../x.js').success).toBe(false);
    expect(PackagePath.safeParse('scripts/a/b.js').success).toBe(false);
    expect(PackagePath.safeParse('main.js').success).toBe(false);
    expect(PackagePath.safeParse('scripts/../main.js').success).toBe(false);
    expect(PackagePath.safeParse('model.glb').success).toBe(true);
  });
});

describe('ScriptTestEvent and ScriptRecording (the dry run, spec 12)', () => {
  it('a test event is a script event whose actor and time may be left out', () => {
    const types = ScriptTestEvent.options.map((option) => option.shape.type.value).sort();
    expect(types).toEqual([...GameEventName.options, 'custom'].sort());
    expect(ScriptTestEvent.parse({ type: 'zone_crossed', id: 'p1', zone: 'g', tag: 'line' })).toEqual({
      type: 'zone_crossed',
      id: 'p1',
      zone: 'g',
      tag: 'line',
    });
    expect(ScriptTestEvent.parse({ type: 'custom', name: 'tap', id: null, at: 1500 })).toMatchObject({
      at: 1500,
    });
    expect(ScriptTestEvent.safeParse({ type: 'player_left', id: 'acc-1' }).success).toBe(false);
    expect(ScriptTestEvent.safeParse({ type: 'time_up', at: -1 }).success).toBe(false);
    // Every recorded event is a test event.
    expect(ScriptTestEvent.safeParse({ type: 'time_up', actor: null }).success).toBe(true);
  });

  it('a recording carries the seed, the events, their times and which were follow-ups', () => {
    const recording = ScriptRecording.parse({
      seed: 7,
      events: [{ type: 'time_up', actor: null }],
      at: [60_000],
      caused: [false],
    });
    expect(recording.events).toHaveLength(1);
    // Recordings from before times were kept still read.
    expect(ScriptRecording.parse({ seed: 1, events: [] })).toEqual({ seed: 1, events: [] });
    expect(
      ScriptRecording.safeParse({
        seed: 1,
        events: Array.from({ length: SCRIPT_LIMITS.recordingEvents + 1 }, () => ({
          type: 'time_up',
          actor: null,
        })),
      }).success,
    ).toBe(false);
  });
});
