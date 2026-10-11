import { WorldDocument, zoneFromParams, type CommandPayload, type ItemInstance } from '@genvr/contracts';
import { LIBRARY, ZONE_GATE_ID } from '@genvr/core-library';
import { applyCommand, createWorldState, type WorldState } from '@genvr/world';
import { describe, expect, it } from 'vitest';
import { executeTool, toolDefinitions, WORLD_SUMMARY_CHARS, worldSummary, type AssistantHost } from '../src/index.js';
import { TOOL_ARGS } from '../src/tools.js';

const crate = (instanceId: string, itemId = 'genvr.core.barrel', params: ItemInstance['params'] = {}): ItemInstance => ({
  instanceId,
  itemId,
  transform: { position: [4, 0, 4], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
  params,
});

function host(instances: ItemInstance[] = []) {
  const state: WorldState = createWorldState(
    WorldDocument.parse({
      schemaVersion: 1,
      experienceId: 'exp-rules',
      version: 0,
      style: { base: 'blocky' },
      sizeTier: 'small',
      access: { mode: 'private' },
      environment: { sky: { preset: 'day' }, weather: { preset: 'clear' } },
      terrain: {},
      spawn: { position: [0, 1, 0] },
      instances,
    }),
  );
  const applied: CommandPayload[][] = [];
  const assistant: AssistantHost = {
    world: () => state.doc,
    heightAt: (x, z) => state.terrain.heightAt(x, z),
    apply: (commands) => {
      applied.push(commands);
      for (const command of commands) applyCommand(state, command);
      return null;
    },
    addWater: () => null,
    focus: () => ({ x: 0, z: -40 }),
  };
  return { host: assistant, applied, state };
}

const points = { name: 'points', scope: 'player', start: 0 } as const;
const scoreOnPad = {
  when: { event: 'zone_entered', tag: 'pad' },
  do: [{ kind: 'add_counter', name: 'points', by: 1 }],
};
const endAtThree = {
  when: { event: 'counter_changed', counter: 'points' },
  if: [{ kind: 'counter', name: 'points', op: '>=', value: 3 }],
  do: [{ kind: 'end_match', winner: { byCounter: 'points', order: 'high' } }],
};

describe('the assistant sets a game\'s rules (set_rules, generic rules Task 8)', () => {
  it('gives a place without a game its counters, rules, ranking and displays as one set_game step', () => {
    const { host: h, applied, state } = host();
    const outcome = executeTool(
      'set_rules',
      {
        counters: [points],
        rules: [scoreOnPad, endAtThree],
        ranking: { by: 'points', order: 'high' },
        hud: [{ kind: 'counter', label: 'Points', counter: 'points' }, { kind: 'rank', label: 'Place' }],
        highest_score_wins: false,
      },
      h,
    );
    expect(outcome).toMatchObject({ ok: true });
    expect(outcome.result).toContain('1 counter, 2 rules');
    expect(outcome.result).toContain('2 displays');
    expect(applied).toHaveLength(1);
    expect(applied[0]).toHaveLength(1);
    expect(applied[0]![0]!.type).toBe('set_game');
    expect(state.doc.game).toMatchObject({
      match: { durationSec: 300 },
      counters: [points],
      rules: [
        { when: { event: 'zone_entered', tag: 'pad' }, if: [], do: [{ kind: 'add_counter', who: 'actor' }] },
        expect.objectContaining({ when: { event: 'counter_changed', counter: 'points' } }),
      ],
      ranking: { by: 'points', order: 'high' },
    });
    expect(state.doc.game?.win).toBeUndefined();
    expect(worldSummary(state.doc, 20)).toContain('1 counter, 2 rules, ranked by points, 2 displays');
  });

  it('changes only the parts given and keeps the rest of the game', () => {
    const { host: h, state } = host();
    executeTool('set_game', { minutes: 4, teams: 'two' }, h);
    executeTool('set_rules', { counters: [points], rules: [scoreOnPad] }, h);
    const outcome = executeTool('set_rules', { ranking: { by: 'points', order: 'low' } }, h);
    expect(outcome.ok).toBe(true);
    expect(state.doc.game).toMatchObject({
      match: { durationSec: 240 },
      teams: { mode: 'two' },
      win: { by: 'highest_score' },
      counters: [points],
      rules: [expect.objectContaining({ when: { event: 'zone_entered', tag: 'pad' } })],
      ranking: { by: 'points', order: 'low' },
    });
  });

  it('removes the parts named in remove', () => {
    const { host: h, state } = host();
    executeTool(
      'set_rules',
      {
        counters: [points],
        rules: [scoreOnPad],
        ranking: { by: 'points', order: 'high' },
        hud: [{ kind: 'timer', label: 'Time' }],
      },
      h,
    );
    const outcome = executeTool('set_rules', { remove: ['ranking', 'hud', 'rules'] }, h);
    expect(outcome.ok).toBe(true);
    expect(state.doc.game?.ranking).toBeUndefined();
    expect(state.doc.game?.hud).toBeUndefined();
    expect(state.doc.game?.rules).toBeUndefined();
    expect(state.doc.game?.counters).toEqual([points]);
  });

  it('refuses rules the schema does not allow, with nothing applied', () => {
    const { host: h, applied } = host();
    const bad = executeTool('set_rules', { rules: [{ when: { event: 'hit' }, do: [{ kind: 'explode' }] }] }, h);
    expect(bad.ok).toBe(false);
    expect(bad.result).toMatch(/^Error: /);
    const empty = executeTool('set_rules', { rules: [{ when: { event: 'hit' }, do: [] }] }, h);
    expect(empty.ok).toBe(false);
    expect(applied).toEqual([]);
  });

  it('checks the whole game after the change: something must end it, and counter names are unique', () => {
    const { host: h, applied } = host();
    const noEnding = executeTool('set_rules', { rules: [scoreOnPad], highest_score_wins: false }, h);
    expect(noEnding.ok).toBe(false);
    expect(noEnding.result).toContain('ends the match');
    const twice = executeTool('set_rules', { counters: [points, { ...points, start: 5 }] }, h);
    expect(twice.ok).toBe(false);
    expect(twice.result).toContain('unique');
    expect(applied).toEqual([]);
  });

  it("stores tags trimmed, so a rule's 'pad ' is the zone 'pad'", () => {
    const { host: h, state } = host();
    executeTool('set_rules', { add_rules: [{ ...scoreOnPad, when: { event: 'zone_entered', tag: 'pad ' } }] }, h);
    expect(state.doc.game?.rules?.[0]?.when.tag).toBe('pad');
  });

  it('turns the highest-score win back on', () => {
    const { host: h, state } = host();
    executeTool('set_rules', { counters: [points], rules: [endAtThree], highest_score_wins: false }, h);
    expect(state.doc.game?.win).toBeUndefined();
    executeTool('set_rules', { highest_score_wins: true }, h);
    expect(state.doc.game?.win).toEqual({ by: 'highest_score' });
  });

  it('offers generic parts only, in every place', () => {
    expect(Object.keys(TOOL_ARGS.set_rules.shape).sort()).toEqual([
      'add_counters',
      'add_hud',
      'add_rules',
      'counters',
      'highest_score_wins',
      'hud',
      'ranking',
      'remove',
      'remove_counters',
      'remove_hud',
      'remove_rules',
      'rules',
    ]);
    for (const blockGround of [false, true])
      expect(toolDefinitions({ blockGround }).map((tool) => tool.function.name)).toEqual(
        expect.arrayContaining(['get_game', 'set_rules', 'set_zone']),
      );
  });
});

/** Ten rules a designer made by hand: each adds to its own counter when a tagged zone is entered. */
const tenRules = Array.from({ length: 10 }, (_, i) => ({
  when: { event: 'zone_entered', tag: `zone ${i}` },
  do: [{ kind: 'add_counter', name: 'points', by: i + 1 }],
}));

describe('the assistant reads the game and changes parts of it (get_game, add and remove)', () => {
  it('get_game shows the counters, the numbered rules, the ranking and the displays as JSON', () => {
    const { host: h } = host();
    executeTool(
      'set_rules',
      {
        counters: [points],
        rules: [scoreOnPad, endAtThree],
        ranking: { by: 'points', order: 'high' },
        hud: [{ kind: 'counter', label: 'Points', counter: 'points' }],
      },
      h,
    );
    const outcome = executeTool('get_game', {}, h);
    expect(outcome.ok).toBe(true);
    const shown = JSON.parse(outcome.result) as Record<string, unknown>;
    expect(shown).toMatchObject({
      counters: [points],
      ranking: { by: 'points', order: 'high' },
      hud: [{ kind: 'counter', label: 'Points', counter: 'points' }],
      highest_score_wins: true,
    });
    expect(shown.rules).toEqual([
      expect.objectContaining({ index: 0, when: { event: 'zone_entered', tag: 'pad' } }),
      expect.objectContaining({ index: 1, when: { event: 'counter_changed', counter: 'points' } }),
    ]);
  });

  it('get_game says when there is no game', () => {
    const { host: h } = host();
    expect(executeTool('get_game', {}, h)).toEqual({ ok: true, result: 'The place has no game.' });
  });

  it('get_game stays bounded: a long rule list is shown in pages', () => {
    const { host: h } = host();
    const long = Array.from({ length: 64 }, (_, i) => ({
      when: { event: 'zone_entered', tag: `a long zone tag number ${i}` },
      if: [{ kind: 'counter', name: 'points', op: '<', value: 1000 }],
      do: [
        { kind: 'add_counter', name: 'points', by: 1 },
        { kind: 'show_message', text: `A fairly long message for everyone, number ${i}`, who: 'everyone' },
      ],
    }));
    executeTool('set_rules', { counters: [points], rules: long }, h);
    const first = executeTool('get_game', {}, h);
    expect(first.result.length).toBeLessThanOrEqual(6000);
    const page = JSON.parse(first.result) as { rules: { index: number }[]; more_rules_from?: number };
    expect(page.more_rules_from).toBeGreaterThan(0);
    const next = JSON.parse(executeTool('get_game', { from_rule: page.more_rules_from }, h).result) as {
      rules: { index: number }[];
    };
    expect(next.rules[0]!.index).toBe(page.more_rules_from);
  });

  it('adds one rule to ten rules the designer made, keeping all ten', () => {
    const { host: h, state } = host();
    executeTool('set_rules', { counters: [points], rules: tenRules }, h);
    const outcome = executeTool('set_rules', { add_rules: [scoreOnPad] }, h);
    expect(outcome).toMatchObject({ ok: true });
    expect(outcome.result).toContain('11 rules');
    expect(state.doc.game?.rules).toHaveLength(11);
    expect(state.doc.game?.rules?.slice(0, 10).map((rule) => rule.when.tag)).toEqual(
      tenRules.map((rule) => rule.when.tag),
    );
    expect(state.doc.game?.rules?.[10]?.when).toEqual({ event: 'zone_entered', tag: 'pad' });
  });

  it('removes rules by their get_game index and adds counters and displays', () => {
    const { host: h, state } = host();
    executeTool('set_rules', { counters: [points], rules: tenRules, hud: [{ kind: 'timer', label: 'Time' }] }, h);
    const lives = { name: 'lives', scope: 'player', start: 3 } as const;
    const outcome = executeTool(
      'set_rules',
      {
        remove_rules: [0, 9],
        add_counters: [lives],
        add_hud: [{ kind: 'counter', label: 'Lives', counter: 'lives' }],
      },
      h,
    );
    expect(outcome.ok).toBe(true);
    expect(state.doc.game?.rules?.map((rule) => rule.when.tag)).toEqual(
      tenRules.slice(1, 9).map((rule) => rule.when.tag),
    );
    expect(state.doc.game?.counters).toEqual([points, lives]);
    expect(state.doc.game?.hud).toHaveLength(2);
    const fewer = executeTool('set_rules', { remove_counters: ['lives'], remove_hud: [1] }, h);
    expect(fewer.ok).toBe(true);
    expect(state.doc.game?.counters).toEqual([points]);
    expect(state.doc.game?.hud).toEqual([{ kind: 'timer', label: 'Time' }]);
  });

  it('refuses unknown indexes and names, and a replace mixed with an add, with nothing applied', () => {
    const { host: h, applied } = host();
    executeTool('set_rules', { counters: [points], rules: tenRules }, h);
    applied.length = 0;
    expect(executeTool('set_rules', { remove_rules: [10] }, h)).toMatchObject({ ok: false });
    expect(executeTool('set_rules', { remove_counters: ['lives'] }, h)).toMatchObject({ ok: false });
    expect(executeTool('set_rules', { rules: [scoreOnPad], add_rules: [scoreOnPad] }, h)).toMatchObject({
      ok: false,
    });
    expect(applied).toEqual([]);
  });
});

describe('the assistant makes an item a zone (set_zone)', () => {
  it('makes any placed item a gate or an area with a tag, through set_item_params', () => {
    const { host: h, applied, state } = host([crate('b1')]);
    const outcome = executeTool('set_zone', { instanceId: 'b1', shape: 'gate', tag: 'north', visible: true }, h);
    expect(outcome.ok).toBe(true);
    expect(applied).toEqual([
      [
        {
          type: 'set_item_params',
          params: { instanceId: 'b1', params: { zone: 'gate', zoneTag: 'north', zoneVisible: true } },
        },
      ],
    ]);
    expect(zoneFromParams(state.doc.instances[0]!.params)).toEqual({
      shape: 'gate',
      tag: 'north',
      visibleInPlay: true,
    });
    expect(worldSummary(state.doc, 20)).toContain('zone gate "north"');
    // Changing only the tag keeps the shape.
    executeTool('set_zone', { instanceId: 'b1', tag: 'south' }, h);
    expect(zoneFromParams(state.doc.instances[0]!.params)?.tag).toBe('south');
    expect(zoneFromParams(state.doc.instances[0]!.params)?.shape).toBe('gate');
  });

  it('stores a zone item\'s own shape as no param, like the studio', () => {
    const { host: h, applied } = host([crate('g1', ZONE_GATE_ID)]);
    executeTool('set_zone', { instanceId: 'g1', shape: 'gate', tag: 'lane' }, h);
    expect(applied[0]![0]).toEqual({
      type: 'set_item_params',
      params: { instanceId: 'g1', params: { zone: null, zoneTag: 'lane' } },
    });
  });

  it('turns a zone off, clearing its settings', () => {
    const { host: h, state } = host([crate('b1', undefined, { zone: 'area', zoneTag: 'pad', zoneVisible: true })]);
    const outcome = executeTool('set_zone', { instanceId: 'b1', shape: 'off' }, h);
    expect(outcome.ok).toBe(true);
    expect(state.doc.instances[0]!.params).toEqual({});
  });

  it('refuses an unknown item, a zone without a tag, and turning a zone item off', () => {
    const { host: h, applied } = host([crate('b1'), crate('g1', ZONE_GATE_ID)]);
    expect(executeTool('set_zone', { instanceId: 'nope', shape: 'area', tag: 'x' }, h).ok).toBe(false);
    const untagged = executeTool('set_zone', { instanceId: 'b1', shape: 'area' }, h);
    expect(untagged.ok).toBe(false);
    expect(untagged.result).toContain('tag');
    expect(executeTool('set_zone', { instanceId: 'g1', shape: 'off' }, h).ok).toBe(false);
    // The loop checks arguments with the tool's schema before running it.
    expect(TOOL_ARGS.set_zone.safeParse({ instanceId: 'b1', shape: 'area', tag: 'x'.repeat(41) }).success).toBe(false);
    expect(applied).toEqual([]);
  });
});

describe('the assistant hands out tools (set_game tools)', () => {
  const toolId = LIBRARY.find((entry) => entry.manifest.tool)!.manifest.id;

  it('sets the loadout to library tools and removes it with an empty list', () => {
    const { host: h, state } = host();
    const outcome = executeTool('set_game', { tools: [toolId] }, h);
    expect(outcome.ok).toBe(true);
    expect(state.doc.game?.loadout).toEqual({ items: [toolId] });
    executeTool('set_game', { tools: [] }, h);
    expect(state.doc.game?.loadout).toBeUndefined();
  });

  it('refuses an item that is not a tool, with nothing applied', () => {
    const { host: h, applied } = host();
    const outcome = executeTool('set_game', { tools: ['genvr.core.barrel'] }, h);
    expect(outcome.ok).toBe(false);
    expect(outcome.result).toContain('genvr.core.barrel');
    expect(applied).toEqual([]);
  });
});

/** A placed item turned `turnDeg` about the vertical axis, with its own scale. */
const turned = (
  instanceId: string,
  itemId: string,
  turnDeg: number,
  scale: [number, number, number],
  params: ItemInstance['params'] = {},
): ItemInstance => {
  const half = (turnDeg * Math.PI) / 360;
  return {
    instanceId,
    itemId,
    transform: { position: [28, 0, 4], rotation: [0, Math.sin(half), 0, Math.cos(half)], scale },
    params,
  };
};

describe('the world summary describes zones: shape, tag, size and which way a gate counts', () => {
  it('names a gate\'s width, facing and the heading that counts', () => {
    const { state } = host([turned('g1', ZONE_GATE_ID, 90, [1.5, 1, 1], { zoneTag: 'toll' })]);
    const summary = worldSummary(state.doc, 20);
    expect(summary).toContain(
      '- g1: Zone Gate (genvr.core.gameplay.zone-gate) at (28, 4), zone gate "toll", 18 m wide, facing east (turn 90°), counts when crossed heading east (+x)',
    );
    // The compass is explained once, so "east" and the coordinates agree.
    expect(summary).toContain('Directions: north is -z, east is +x; turn 0° faces south (+z).');
  });

  it('gives each compass heading for a gate turned around', () => {
    const heading = (turnDeg: number) =>
      worldSummary(host([turned('g', ZONE_GATE_ID, turnDeg, [1, 1, 1], { zoneTag: 't' })]).state.doc, 5).match(
        /facing ([a-z-]+) \(turn (\d+)°\), counts when crossed heading \1/,
      )?.slice(1, 3);
    expect(heading(0)).toEqual(['south', '0']);
    expect(heading(180)).toEqual(['north', '180']);
    expect(heading(-90)).toEqual(['west', '270']);
    expect(heading(45)).toEqual(['south-east', '45']);
    expect(heading(135)).toEqual(['north-east', '135']);
  });

  it('gives an area its width and depth from its scale, and its turn when it is turned', () => {
    const { state } = host([
      turned('a1', 'genvr.core.barrel', 0, [2, 1, 3], { zone: 'area', zoneTag: 'depot' }),
      turned('a2', 'genvr.core.barrel', 30, [1, 1, 1], { zone: 'area', zoneTag: 'yard' }),
    ]);
    const summary = worldSummary(state.doc, 20);
    expect(summary).toContain('zone area "depot", 8 m wide x 12 m deep');
    expect(summary).not.toMatch(/"depot", 8 m wide x 12 m deep, turn/);
    expect(summary).toContain('zone area "yard", 4 m wide x 4 m deep, turn 30°');
    expect(summary).not.toContain('counts when crossed');
  });

  it('adds no directions line to a place without zones', () => {
    expect(worldSummary(host([crate('b1')]).state.doc, 20)).not.toContain('Directions:');
  });

  it('ends a page early, before 100 items, when the text would pass its character budget', () => {
    const gates = Array.from({ length: 150 }, (_, i) =>
      turned(`gate-number-${i}`, ZONE_GATE_ID, i, [1, 1, 1], { zoneTag: `a rather long zone tag ${i}` }),
    );
    const { state } = host(gates);
    const page = worldSummary(state.doc, 100);
    expect(page.length).toBeLessThanOrEqual(WORLD_SUMMARY_CHARS);
    const listed = page.split('\n').filter((line) => line.startsWith('- gate-number-'));
    expect(listed.length).toBeLessThan(100);
    expect(page).toContain(`more_items_from: ${listed.length}`);
    const next = worldSummary(state.doc, 100, listed.length);
    expect(next).toContain(`- gate-number-${listed.length}:`);
  });
});
