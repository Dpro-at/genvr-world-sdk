import { WorldDocument, type CommandPayload, type ItemInstance, type SideMove } from '@genvr/contracts';
import { applyCommand, createWorldState, type WorldState } from '@genvr/world';
import { describe, expect, it } from 'vitest';
import {
  executeTool,
  placeNotes,
  runAssistant,
  runTool,
  systemPrompt,
  toolDefinitions,
  type AssistantEvent,
  type AssistantHost,
  type ChatModel,
  type ToolCall,
} from '../src/index.js';

const item = (
  instanceId: string,
  x = 4,
  z = 4,
  extra: Partial<ItemInstance['transform']> = {},
): ItemInstance => ({
  instanceId,
  itemId: 'genvr.core.barrel',
  transform: { position: [x, 0, z], rotation: [0, 0, 0, 1], scale: [1, 1, 1], ...extra },
  params: {},
});

/** A host over a real world state (commands applied with the world's own code). */
function host(instances: ItemInstance[] = [], options: { voxels?: boolean } = {}) {
  const state: WorldState = createWorldState(
    WorldDocument.parse({
      schemaVersion: 1,
      experienceId: 'exp-run-tool',
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
    heightAt: () => 1.5,
    apply: (commands) => {
      applied.push(commands);
      for (const command of commands) applyCommand(state, command);
      return null;
    },
    addWater: () => null,
    focus: () => ({ x: 0, z: -40 }),
    ...(options.voxels ? { blockGround: () => true } : {}),
  };
  return { host: assistant, applied, state };
}

const call = (name: string, args: Record<string, unknown> | string): ToolCall => ({
  function: { name, arguments: args },
});

describe('runTool: the one entry point for every door', () => {
  it('runs a valid call like the loop did', async () => {
    const { host: h, applied } = host();
    const outcome = await runTool('place_item', { itemId: 'genvr.core.barrel', x: 3, z: 4 }, h, {
      random: () => 0.5,
    });
    expect(outcome.ok).toBe(true);
    expect(outcome.result).toMatch(/^Placed genvr\.core\.barrel as item-\w+ at \(3, 4\)\.$/);
    expect(applied).toHaveLength(1);
  });

  it('answers invalid JSON, schema errors and unknown tools with the loop errors', async () => {
    const { host: h, applied } = host();
    expect(await runTool('place_item', '{bad', h)).toEqual({
      ok: false,
      result: 'Error: Arguments are not valid JSON.',
    });
    const schema = await runTool('place_item', { itemId: 'genvr.core.barrel', x: 99999, z: 0 }, h);
    expect(schema.ok).toBe(false);
    expect(schema.result).toMatch(/^Error: Invalid x: /);
    expect(await runTool('fly_away', {}, h)).toEqual({
      ok: false,
      result: 'Error: there is no tool named fly_away.',
    });
    // A JSON string is parsed like an object.
    expect((await runTool('place_item', '{"itemId":"genvr.core.barrel","x":1,"z":1}', h)).ok).toBe(true);
    expect(applied).toHaveLength(1);
  });

  it('searches with the host by meaning, and by words without it', async () => {
    const { host: plain } = host();
    const words = await runTool('search_catalog', { query: 'barrel' }, plain);
    expect(words).toEqual(executeTool('search_catalog', { query: 'barrel' }, plain));
    const { host: h } = host();
    h.searchCatalog = async () => [
      { id: 'user.demo.ball', name: 'Ball', caption: 'A ball.', category: '3d-models' },
    ];
    const meaning = await runTool('search_catalog', { query: 'ball' }, h);
    expect(meaning.result.split('\n')[0]).toBe('user.demo.ball: Ball (A ball.)');
    // What the search offered can be placed afterwards on the same host.
    expect((await runTool('place_item', { itemId: 'user.demo.ball', x: 1, z: 1 }, h)).ok).toBe(true);
  });

  it('gives the loop the same outcomes (runAssistant uses runTool)', async () => {
    const calls = [
      call('place_item', { itemId: 'genvr.core.barrel', x: 2, z: 2 }),
      call('place_item', '{nope'),
      call('no_such_tool', {}),
      call('get_world_summary', {}),
    ];
    const replies: Array<{ content?: string; tool_calls?: ToolCall[] }> = [
      { tool_calls: calls },
      { content: 'Ok.' },
    ];
    const model: ChatModel = async () => {
      const reply = replies.shift() ?? { content: 'Ok.' };
      return { content: reply.content ?? '', tool_calls: reply.tool_calls ?? [] };
    };
    const events: AssistantEvent[] = [];
    const looped = host();
    await runAssistant({
      model,
      host: looped.host,
      history: [],
      prompt: 'go',
      onEvent: (event) => events.push(event),
      random: () => 0.25,
    });
    const direct = host();
    const expected = [];
    for (const c of calls)
      expected.push(
        await runTool(c.function.name, c.function.arguments, direct.host, { random: () => 0.25 }),
      );
    const tools = events.filter((e): e is Extract<AssistantEvent, { type: 'tool' }> => e.type === 'tool');
    expect(tools.map((e) => ({ ok: e.ok, result: e.result }))).toEqual(expected);
    // The event still carries the parsed arguments.
    expect(tools[0]!.args).toEqual({ itemId: 'genvr.core.barrel', x: 2, z: 2 });
    expect(looped.state.doc.instances).toEqual(direct.state.doc.instances);
  });
});

describe('move_item', () => {
  const turned = item('b1', 4, 4, { rotation: [0, 0.707, 0, 0.707], scale: [2, 2, 2] });

  it('is offered in every place with a short description', () => {
    for (const blockGround of [false, true]) {
      const tool = toolDefinitions({ blockGround }).find((t) => t.function.name === 'move_item');
      expect(tool?.function.description).toBe('Move, turn or resize a placed item by its instance id.');
    }
  });

  it('moves an item as one transform_item with rest, keeping its turn and size', async () => {
    const { host: h, applied } = host([turned]);
    const outcome = await runTool('move_item', { instanceId: 'b1', x: 10, z: -5 }, h);
    expect(outcome).toEqual({ ok: true, result: 'Moved b1 to (10, -5).' });
    expect(applied).toEqual([
      [
        {
          type: 'transform_item',
          params: {
            instanceId: 'b1',
            position: [10, 1.5, -5],
            rotation: [0, 0.707, 0, 0.707],
            scale: [2, 2, 2],
            rest: true,
          },
        },
      ],
    ]);
  });

  it('turns only, keeping the spot', async () => {
    const { host: h, applied, state } = host([turned]);
    expect((await runTool('move_item', { instanceId: 'b1', turn: 180 }, h)).result).toBe(
      'Moved b1 to (4, 4).',
    );
    const params = applied[0]![0]!.params as { position: number[]; rotation: number[] };
    expect(params.position).toEqual([4, 1.5, 4]);
    expect(params.rotation).toEqual([0, 1, 0, 0]);
    expect(state.doc.instances[0]!.transform.scale).toEqual([2, 2, 2]);
  });

  it('resizes', async () => {
    const { host: h, state } = host([item('b1')]);
    expect((await runTool('move_item', { instanceId: 'b1', size: 3 }, h)).ok).toBe(true);
    expect(state.doc.instances[0]!.transform.scale).toEqual([3, 3, 3]);
  });

  it('uses the resting point of the host when it has one', async () => {
    const { host: h, applied } = host([item('b1')]);
    h.restingPoint = (x, z) => [x, 7, z];
    await runTool('move_item', { instanceId: 'b1', x: 1, z: 2 }, h);
    expect((applied[0]![0]!.params as { position: number[] }).position).toEqual([1, 7, 2]);
  });

  it('refuses an unknown id, a spot outside the place, and a call that changes nothing', async () => {
    const { host: h, applied } = host([item('b1')]);
    expect(await runTool('move_item', { instanceId: 'nope', x: 1, z: 1 }, h)).toEqual({
      ok: false,
      result: 'Error: no placed item "nope". Use get_world_summary for ids.',
    });
    const outside = await runTool('move_item', { instanceId: 'b1', x: 3000, z: 0 }, h);
    expect(outside).toEqual({ ok: false, result: 'Error: (3000, 0) is outside the place.' });
    expect((await runTool('move_item', { instanceId: 'b1' }, h)).ok).toBe(false);
    expect(applied).toHaveLength(0);
  });

  it('keeps side-view places on the line like place_item', async () => {
    const { host: h, applied } = host([item('b1')]);
    h.sideLine = () => 4;
    expect((await runTool('move_item', { instanceId: 'b1', x: 6, z: 4.8 }, h)).result).toBe(
      'Moved b1 to (6, 4).',
    );
    const camera = await runTool('move_item', { instanceId: 'b1', x: 6, z: 6 }, h);
    expect(camera.ok).toBe(false);
    expect(camera.result).toContain('between the camera and the players');
    expect(applied).toHaveLength(1);
  });
});

describe('get_world_summary pages', () => {
  const many = Array.from({ length: 250 }, (_, i) => item(`i${i}`, i % 50, Math.floor(i / 50)));

  it('shows 100 items and names the next page', async () => {
    const { host: h } = host(many);
    const page = (await runTool('get_world_summary', {}, h)).result;
    const lines = page.split('\n');
    expect(lines.filter((line) => /^- i\d+:/.test(line))).toHaveLength(100);
    expect(lines).toContain('more_items_from: 100');
    expect(page).toContain('- i99:');
    expect(page).not.toContain('- i100:');
  });

  it('shows the last 50 from item 200, with no next page', async () => {
    const { host: h } = host(many);
    const page = (await runTool('get_world_summary', { from_item: 200 }, h)).result;
    const items = page.split('\n').filter((line) => /^- i\d+:/.test(line));
    expect(items).toHaveLength(50);
    expect(items[0]).toMatch(/^- i200:/);
    expect(page).not.toContain('more_items_from');
  });
});

describe('placeNotes', () => {
  it('is empty for a plain 3D place', () => {
    expect(placeNotes(host().host)).toEqual([]);
  });

  it('has the side-view lines and the jump reach', () => {
    const { host: h } = host();
    h.sideLine = () => 4;
    h.sideMoves = (): SideMove[] => ['double-jump'];
    const notes = placeNotes(h).join('\n');
    expect(notes).toContain('seen from the side');
    expect(notes).toContain('Players jump about 1.8 m up and 4 m across');
    expect(systemPrompt(h)).toContain(notes);
  });

  it('has the block lines in block places', () => {
    const { host: h } = host([], { voxels: true });
    const notes = placeNotes(h).join('\n');
    expect(notes).toContain('made of 1 m blocks');
    expect(systemPrompt(h)).toContain(notes);
  });

  it('leaves the system prompt text unchanged', () => {
    const plain = host().host;
    const side = host().host;
    side.sideLine = () => 4;
    side.sideMoves = () => ['dash'];
    const blocks = host([], { voxels: true }).host;
    expect(systemPrompt(plain)).toMatchSnapshot('plain');
    expect(systemPrompt(side)).toMatchSnapshot('side view');
    expect(systemPrompt(blocks)).toMatchSnapshot('blocks');
  });
});

describe('isPlaceable', () => {
  it('lets an uploaded item through place_item and scatter_items without a search first', async () => {
    const { host: h, applied } = host();
    expect((await runTool('place_item', { itemId: 'user.demo.ball', x: 1, z: 1 }, h)).result).toMatch(
      /Unknown item/,
    );
    h.isPlaceable = (id) => id === 'user.demo.ball';
    expect((await runTool('place_item', { itemId: 'user.demo.ball', x: 1, z: 1 }, h)).ok).toBe(true);
    const scatter = await runTool(
      'scatter_items',
      { itemIds: ['user.demo.ball'], x: 10, z: 10, radius: 5, count: 3 },
      h,
    );
    expect(scatter.ok).toBe(true);
    expect((await runTool('place_item', { itemId: 'user.demo.other', x: 1, z: 1 }, h)).ok).toBe(false);
    expect(applied).toHaveLength(2);
  });
});
