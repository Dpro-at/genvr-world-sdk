import { WorldDocument, type CommandPayload, type SideMove } from '@genvr/contracts';
import { describe, expect, it } from 'vitest';
import {
  readChatStream,
  executeTool,
  jumpReach,
  runAssistant,
  systemPrompt,
  TOOL_DEFINITIONS,
  type AssistantEvent,
  type AssistantHost,
  type ChatMessage,
  type ChatModel,
  type ToolCall,
} from '../src/index.js';

const doc = () =>
  WorldDocument.parse({
    schemaVersion: 1,
    experienceId: 'exp-test',
    version: 0,
    style: { base: 'blocky' },
    sizeTier: 'small',
    access: { mode: 'private' },
    environment: { sky: { preset: 'day' }, weather: { preset: 'clear' } },
    terrain: {},
    spawn: { position: [0, 1, 0] },
  });

/** A host that records commands and applies item placement to its document. */
function fakeHost() {
  const world = doc();
  const applied: CommandPayload[][] = [];
  const host: AssistantHost = {
    world: () => world,
    heightAt: () => 1.5,
    apply: (commands) => {
      applied.push(commands);
      for (const command of commands) {
        if (command.type === 'place_item')
          world.instances.push({
            instanceId: command.params.instanceId,
            itemId: command.params.itemId,
            transform: { position: command.params.position, rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
            params: {},
          });
      }
      return null;
    },
    addWater: () => null,
    focus: () => ({ x: 0, z: 0 }),
  };
  return { host, applied, world };
}

const call = (name: string, args: Record<string, unknown> | string): ToolCall => ({
  function: { name, arguments: args },
});

/** A model that answers from a script, one reply per request, and records what it was sent. */
function scripted(replies: Array<{ content?: string; tool_calls?: ToolCall[] }>) {
  const seen: ChatMessage[][] = [];
  const model: ChatModel = async (messages, onText) => {
    seen.push(messages);
    const reply = replies.shift() ?? { content: 'Done.' };
    if (reply.content) onText(reply.content);
    return { content: reply.content ?? '', tool_calls: reply.tool_calls ?? [] };
  };
  return { model, seen };
}

describe('tool definitions', () => {
  it('are generated from the argument schemas', () => {
    const place = TOOL_DEFINITIONS.find((tool) => tool.function.name === 'place_item');
    expect(place?.function.parameters).toMatchObject({
      type: 'object',
      required: expect.arrayContaining(['itemId', 'x', 'z']),
    });
    expect(TOOL_DEFINITIONS.map((tool) => tool.function.name)).toContain('ask_user');
  });
});

/** Repeatable random numbers for tests (a small LCG). */
function seeded(seed = 7) {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
}

describe('runAssistant', () => {
  it('asks the rest law to set what it places and scatters (P2-43)', () => {
    const { host, applied } = fakeHost();
    executeTool('place_item', { itemId: 'genvr.core.bench', x: 3, z: 3 }, host, seeded());
    executeTool(
      'scatter_items',
      { itemIds: ['genvr.core.tree.round'], x: 10, z: 10, radius: 5, count: 6 },
      host,
      seeded(),
    );
    const placed = applied.flat();
    expect(placed.length).toBeGreaterThan(1);
    for (const command of placed)
      expect(command).toMatchObject({ type: 'place_item', params: { rest: true } });
    // The hint stays: the y the host gave is still sent, the law only corrects it.
    expect(placed[0]).toMatchObject({ params: { position: [3, 1.5, 3] } });
  });

  it("follows the items' own placement rules (P2-11)", async () => {
    const { host, applied } = fakeHost();
    // Trees may not stand at x < 0 (say, sand there).
    host.canStand = (itemId, [x]) => (itemId.includes('tree') && x < 0 ? 'Round Tree needs grass.' : null);
    const { model, seen } = scripted([
      {
        tool_calls: [
          call('place_item', { itemId: 'genvr.core.tree.round', x: -5, z: 3 }),
          call('scatter_items', { itemIds: ['genvr.core.tree.round'], x: 0, z: 20, radius: 10, count: 20 }),
        ],
      },
      { content: 'Done.' },
    ]);
    await runAssistant({ model, host, history: [], prompt: 'trees', onEvent: () => {}, random: seeded() });
    expect(seen[1]!.find((m) => m.role === 'tool')?.content).toMatch(/needs grass\. Choose another spot/);
    const placed = applied.flat().filter((c) => c.type === 'place_item');
    expect(placed.length).toBeGreaterThan(0);
    for (const command of placed)
      if (command.type === 'place_item') expect(command.params.position[0]).toBeGreaterThanOrEqual(0);
    expect(seen[1]!.at(-1)?.content).toMatch(/spots did not suit them/);
  });

  it('stands items where the host says: on floors, parts, or a named item (P2-11)', async () => {
    const { host, applied } = fakeHost();
    host.restingPoint = (x, z, on) => (on === 'table-1' ? [9, 0.8, 9] : on ? null : [x, 2.5, z]);
    const { model, seen } = scripted([
      {
        tool_calls: [
          call('place_item', { itemId: 'genvr.core.bench', x: 3, z: 3 }),
          call('place_item', { itemId: 'genvr.core.bench', x: 20, z: 20, on: 'table-1' }),
          call('place_item', { itemId: 'genvr.core.bench', x: 1, z: 1, on: 'nothing' }),
        ],
      },
      { content: 'Done.' },
    ]);
    await runAssistant({ model, host, history: [], prompt: 'benches', onEvent: () => {}, random: () => 0.5 });
    const positions = applied.map((batch) => batch[0]!.type === 'place_item' && batch[0]!.params.position);
    expect(positions).toEqual([
      [3, 2.5, 3],
      [9, 0.8, 9],
    ]);
    expect(seen[1]!.at(-1)).toMatchObject({
      role: 'tool',
      content: expect.stringMatching(/no item nothing/),
    });
  });

  it('runs tool calls, returns results to the model, and ends with its answer', async () => {
    const { host, applied, world } = fakeHost();
    const { model, seen } = scripted([
      { tool_calls: [call('place_item', { itemId: 'genvr.core.tree.round', x: 4, z: -3, turn: 90 })] },
      { content: 'I planted a tree.' },
    ]);
    const events: AssistantEvent[] = [];
    const history = await runAssistant({
      model,
      host,
      history: [],
      prompt: 'plant a tree',
      onEvent: (event) => events.push(event),
      random: () => 0.5,
    });
    expect(applied).toHaveLength(1);
    const placed = applied[0]![0]!;
    expect(placed.type).toBe('place_item');
    if (placed.type === 'place_item') {
      expect(placed.params.position).toEqual([4, 1.5, -3]);
      expect(placed.params.rotation?.[1]).toBeCloseTo(Math.SQRT1_2, 2);
    }
    expect(world.instances).toHaveLength(1);
    // The second request carries the tool result, and the system prompt lists the new item.
    expect(seen[1]!.at(-1)).toMatchObject({ role: 'tool', tool_name: 'place_item' });
    expect(seen[1]![0]!.content).toContain('Round Tree');
    // Every placeable item is listed with its id.
    expect(seen[0]![0]!.content).toContain('- genvr.core.bench: Bench');
    expect(events.at(-1)).toEqual({ type: 'done', text: 'I planted a tree.' });
    expect(history.map((m) => m.role)).toEqual(['user', 'assistant', 'tool', 'assistant']);
  });

  it('searches the catalog by meaning first and falls back to words (P4-03)', async () => {
    const results = async (search: AssistantHost['searchCatalog'], query: string) => {
      const { host } = fakeHost();
      if (search) host.searchCatalog = search;
      const { model, seen } = scripted([
        { tool_calls: [call('search_catalog', { query })] },
        { content: 'Ok.' },
      ]);
      await runAssistant({ model, host, history: [], prompt: query, onEvent: () => {} });
      return seen[1]!.at(-1)!.content;
    };
    const byMeaning = await results(
      async () => [
        { id: 'genvr.core.bench', name: 'Bench', caption: 'A wooden bench.' },
        // Uploaded 3D models load as packages (P2-16); other kinds of items are left out.
        { id: 'user.demo.red-chair', name: 'Red Chair', caption: 'A red chair.', category: '3d-models' },
        { id: 'user.demo.rain-sound', name: 'Rain', caption: 'Rain.', category: 'audio' },
      ],
      'somewhere to sit',
    );
    expect(byMeaning.split('\n').slice(0, 2)).toEqual([
      'genvr.core.bench: Bench (A wooden bench.)',
      'user.demo.red-chair: Red Chair (A red chair.)',
    ]);
    expect(byMeaning).not.toContain('user.demo.rain-sound');
    // Model away, or no host search: the word search answers.
    const away = await results(async () => {
      throw new Error('503');
    }, 'bench');
    expect(away).toContain('genvr.core.bench: Bench');
    expect(away).not.toContain('(');
    expect(await results(undefined, 'bench')).toContain('genvr.core.bench: Bench');
  });

  it('places an uploaded item the search offered, not others (P2-16)', async () => {
    const { host, applied } = fakeHost();
    host.searchCatalog = async () => [{ id: 'user.demo.ball', name: 'Ball', category: '3d-models' }];
    const { model, seen } = scripted([
      { tool_calls: [call('place_item', { itemId: 'user.demo.ball', x: 1, z: 1 })] },
      { tool_calls: [call('search_catalog', { query: 'ball' })] },
      { tool_calls: [call('place_item', { itemId: 'user.demo.ball', x: 1, z: 1 })] },
      { content: 'A ball is there.' },
    ]);
    await runAssistant({ model, host, history: [], prompt: 'a ball', onEvent: () => {} });
    expect(seen[1]!.at(-1)?.content).toMatch(/Unknown item/);
    expect(applied).toHaveLength(1);
  });

  it('gives errors back so the model can fix its call (the agent_player gap)', async () => {
    const { host, applied } = fakeHost();
    const { model, seen } = scripted([
      { tool_calls: [call('place_item', { itemId: 'genvr.core.dragon', x: 0, z: 0 })] },
      { tool_calls: [call('place_item', '{"itemId":"genvr.core.bench","x":2,"z":2}')] },
      { content: 'A bench is there now.' },
    ]);
    const events: AssistantEvent[] = [];
    await runAssistant({ model, host, history: [], prompt: 'bench', onEvent: (e) => events.push(e) });
    expect(seen[1]!.at(-1)?.content).toMatch(/Unknown item/);
    expect(applied).toHaveLength(1);
    expect(events.filter((e) => e.type === 'tool').map((e) => e.type === 'tool' && e.ok)).toEqual([
      false,
      true,
    ]);
  });

  it('closes a room without repeating the first corner', async () => {
    const { host, applied } = fakeHost();
    const room = [
      [0, 0],
      [6, 0],
      [6, 6],
      [0, 6],
      [0, 0],
    ];
    const { model } = scripted([{ tool_calls: [call('draw_wall', { points: room, closed: true })] }]);
    await runAssistant({ model, host, history: [], prompt: 'room', onEvent: () => {} });
    const wall = applied[0]![0]!;
    expect(wall.type === 'draw_wall' && wall.params.points).toHaveLength(4);
  });

  it('points a sky sent as weather to set_sky', async () => {
    const { host } = fakeHost();
    const { model, seen } = scripted([{ tool_calls: [call('set_weather', { preset: 'sunset' })] }]);
    await runAssistant({ model, host, history: [], prompt: 'sunset', onEvent: () => {} });
    expect(seen[1]!.at(-1)?.content).toContain('Call set_sky');
  });

  it('starts and stops the day-night cycle (P2-02)', async () => {
    const { host, applied } = fakeHost();
    const { model } = scripted([
      { tool_calls: [call('set_sky', { preset: 'night', cycle_minutes: 30 })] },
      { tool_calls: [call('set_sky', { preset: 'sunset', cycle_minutes: 0 })] },
    ]);
    await runAssistant({ model, host, history: [], prompt: 'day and night', onEvent: () => {} });
    expect(applied.flat()).toEqual([
      // WORLD-W0: the cycle keeps the chosen look (it used to force day).
      { type: 'set_sky', params: { preset: 'night', params: { cycle: 30 } } },
      { type: 'set_sky', params: { preset: 'sunset' } },
    ]);
  });

  it('stops after repeated failures', async () => {
    const { host, applied } = fakeHost();
    const bad = { tool_calls: [call('draw_road', { points: [[0, 0]] })] };
    const { model, seen } = scripted([bad, bad, bad, bad, bad]);
    const events: AssistantEvent[] = [];
    await runAssistant({ model, host, history: [], prompt: 'road', onEvent: (e) => events.push(e) });
    expect(applied).toHaveLength(0);
    expect(seen).toHaveLength(3);
    expect(events.at(-1)?.type).toBe('done');
  });

  it('pauses on ask_user and continues with the answer', async () => {
    const { host } = fakeHost();
    const { model } = scripted([
      { tool_calls: [call('ask_user', { question: 'Which style?', options: ['Blocky', 'Anime'] })] },
      { tool_calls: [call('set_style', { base: 'anime' })] },
      { content: 'Anime it is.' },
    ]);
    const events: AssistantEvent[] = [];
    const first = await runAssistant({
      model,
      host,
      history: [],
      prompt: 'make it pretty',
      onEvent: (e) => events.push(e),
    });
    expect(events.at(-1)).toEqual({ type: 'ask', question: 'Which style?', options: ['Blocky', 'Anime'] });
    const applied: string[] = [];
    host.apply = (commands) => {
      applied.push(...commands.map((c) => c.type));
      return null;
    };
    await runAssistant({ model, host, history: first, prompt: 'Anime', onEvent: (e) => events.push(e) });
    expect(applied).toEqual(['set_style']);
  });

  it('scatters items inside the circle', async () => {
    const { host, applied } = fakeHost();
    let seed = 1;
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const { model } = scripted([
      {
        tool_calls: [
          call('scatter_items', {
            itemIds: ['genvr.core.tree.pine', 'genvr.core.rock'],
            x: 10,
            z: 10,
            radius: 5,
            count: 12,
          }),
        ],
      },
    ]);
    await runAssistant({ model, host, history: [], prompt: 'forest', onEvent: () => {}, random });
    const commands = applied[0]!;
    expect(commands.length).toBeGreaterThanOrEqual(10);
    const spots: Array<[number, number]> = [];
    for (const command of commands) {
      if (command.type !== 'place_item') throw new Error('expected place_item');
      const [x, , z] = command.params.position;
      expect(Math.hypot(x - 10, z - 10)).toBeLessThanOrEqual(5.01);
      // Kept apart (no trees growing into each other).
      for (const [sx, sz] of spots) expect(Math.hypot(sx - x, sz - z)).toBeGreaterThanOrEqual(1.99);
      spots.push([x, z]);
    }
  });
});

describe('the builder', () => {
  it('gets a spot in front and stays free of scattered items', async () => {
    const { host, applied } = fakeHost();
    host.focus = () => ({ x: 0, z: 0, yaw: Math.PI / 2 });
    const { model, seen } = scripted([
      {
        tool_calls: [
          call('scatter_items', { itemIds: ['genvr.core.bush'], x: 0, z: 0, radius: 6, count: 40 }),
        ],
      },
    ]);
    await runAssistant({ model, host, history: [], prompt: 'bushes here', onEvent: () => {} });
    expect(seen[0]![0]!.content).toContain('around x=12, z=0');
    const commands = applied[0]!;
    expect(commands.length).toBeGreaterThan(20);
    for (const command of commands) {
      if (command.type !== 'place_item') throw new Error('expected place_item');
      const [x, , z] = command.params.position;
      expect(Math.hypot(x, z)).toBeGreaterThanOrEqual(2.5);
    }
  });
});

describe('readChatStream', () => {
  it('joins streamed text and collects tool calls', async () => {
    const lines = [
      { message: { content: 'Hel' } },
      { message: { content: 'lo' } },
      { message: { content: '', tool_calls: [call('set_sky', { preset: 'night' })] } },
      { done: true },
    ];
    const text = lines.map((line) => JSON.stringify(line)).join('\n');
    const bytes = new TextEncoder().encode(text);
    // Split in awkward places to test line joining.
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, 7));
        controller.enqueue(bytes.slice(7, 40));
        controller.enqueue(bytes.slice(40));
        controller.close();
      },
    });
    const deltas: string[] = [];
    const reply = await readChatStream(body, (delta) => deltas.push(delta));
    expect(reply.content).toBe('Hello');
    expect(deltas).toEqual(['Hel', 'lo']);
    expect(reply.tool_calls[0]?.function.name).toBe('set_sky');
  });

  it('reports the place in the waiting line before the reply (P4-05)', async () => {
    const lines = [{ queue: { ahead: 2 } }, { queue: { ahead: 0 } }, { message: { content: 'Hi' } }];
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(lines.map((line) => JSON.stringify(line)).join(String.fromCharCode(10))),
        );
        controller.close();
      },
    });
    const ahead: number[] = [];
    const reply = await readChatStream(
      body,
      () => {},
      (n) => ahead.push(n),
    );
    expect(ahead).toEqual([2, 0]);
    expect(reply.content).toBe('Hi');
  });
});

describe('side-view places (P2-23)', () => {
  /** A side-view host: players move on the line z = 4; the ground rises 1 m past x = 20. */
  function sideHost() {
    const fake = fakeHost();
    fake.host.sideLine = () => 4;
    fake.host.heightAt = (x) => (x > 20 ? 1 : 0);
    fake.host.focus = () => ({ x: 2, z: 10, yaw: -Math.PI / 2 });
    return fake;
  }

  it('tells the model about the line, the jumps, and where scenery goes', () => {
    const prompt = systemPrompt(sideHost().host);
    expect(prompt).toContain('on the line z=4');
    expect(prompt).toMatch(/jump about 1 m up and 3 m across/);
    expect(prompt).toContain('Never put anything at z above 5');
    // "Here" is along the line, on the side the builder faces (-x).
    expect(prompt).toContain('around x=-10, z=4');
    // 3D places do not get these rules.
    expect(systemPrompt(fakeHost().host)).not.toContain('seen from the side');
  });

  it('puts items near the line on it, and nothing between the camera and the players', () => {
    const { host, applied } = sideHost();
    const near = executeTool('place_item', { itemId: 'genvr.core.crate', x: 3, z: 5 }, host, () => 0.5);
    expect(near.ok).toBe(true);
    const crate = applied[0]![0]!;
    if (crate.type === 'place_item') expect(crate.params.position[2]).toBe(4);
    const front = executeTool('place_item', { itemId: 'genvr.core.crate', x: 3, z: 8 }, host);
    expect(front).toMatchObject({
      ok: false,
      result: expect.stringMatching(/between the camera and the players/),
    });
    // Scenery behind the line stays where it was asked.
    executeTool('place_item', { itemId: 'genvr.core.tree.round', x: 3, z: -6 }, host, () => 0.5);
    const tree = applied[1]![0]!;
    if (tree.type === 'place_item') expect(tree.params.position[2]).toBe(-6);
  });

  it('scatters scenery only behind the line', () => {
    const { host, applied } = sideHost();
    const result = executeTool(
      'scatter_items',
      { itemIds: ['genvr.core.tree.round'], x: 0, z: 2, radius: 8, count: 30 },
      host,
      seeded(),
    );
    expect(result.result).toMatch(/left free/);
    for (const command of applied.flat())
      if (command.type === 'place_item') expect(command.params.position[2]).toBeLessThanOrEqual(2.5);
    // All of it on the path: an error that says where to put it instead.
    const onPath = executeTool(
      'scatter_items',
      { itemIds: ['genvr.core.tree.round'], x: 0, z: 5, radius: 2, count: 5 },
      host,
      seeded(),
    );
    expect(onPath).toMatchObject({ ok: false, result: expect.stringMatching(/behind the players' line/) });
  });

  it('builds platforms on the line and keeps every jump possible', () => {
    const { host, applied } = sideHost();
    const result = executeTool(
      'build_platforms',
      {
        platforms: [
          { x: 0, height: 0.8 },
          { x: 4, height: 1.6 },
          { x: 14, height: 1.6 },
          { x: 25, height: 3, width: 4 },
        ],
      },
      host,
      () => 0.5,
    );
    expect(result.ok).toBe(true);
    const boxes = applied[0]!.flatMap((command) => (command.type === 'place_item' ? [command.params] : []));
    expect(boxes).toHaveLength(4);
    // Thin platforms in the air, 2 m deep across the line, marked as meant to float.
    expect(boxes[1]).toMatchObject({
      itemId: 'genvr.core.part.box',
      position: [4, 1.2, 4],
      scale: [3, 0.4, 2],
      floats: true,
    });
    // The 7 m gap is closed to 3 m (the third moves from x=14 to x=10).
    expect(boxes[2]!.position).toEqual([10, 1.2, 4]);
    // The last would be 2.4 m higher (3 m over ground that rises 1 m): lowered to 1 m above the
    // one before (top 2.6), and moved to within 1.5 m because it also goes up.
    expect(boxes[3]!.position).toEqual([15, 2.2, 4]);
    expect(result.result).toMatch(
      /at x=0, x=4, x=10, x=15; the course ends at x=17, 2.6 m above the ground\. I moved 2 closer and lowered 1 so players can jump/,
    );
    // Solid steps reach down to the ground; a first step too high for a jump is lowered to 1 m.
    const steps = sideHost();
    executeTool(
      'build_platforms',
      { platforms: [{ x: 0, height: 1.5 }], floating: false },
      steps.host,
      () => 0.5,
    );
    const step = steps.applied[0]![0]!;
    if (step.type === 'place_item') {
      expect(step.params.position).toEqual([0, 0, 4]);
      expect(step.params.scale).toEqual([3, 1, 2]);
      expect(step.params.floats).toBeUndefined();
    }
    // A ladder at the end: on the far edge of the last platform, from the ground to its top.
    const withLadder = sideHost();
    const laddered = executeTool(
      'build_platforms',
      {
        platforms: [
          { x: 0, height: 1 },
          { x: 5, height: 2 },
        ],
        ladder: true,
      },
      withLadder.host,
      () => 0.5,
    );
    const ladder = withLadder.applied[0]!.at(-1)!;
    expect(ladder.type).toBe('place_item');
    if (ladder.type === 'place_item') {
      expect(ladder.params).toMatchObject({
        itemId: 'genvr.core.ladder',
        position: [6.05, 0, 4],
        scale: [1, 0.67, 1],
      });
      expect(ladder.params.rotation?.[1]).toBeCloseTo(Math.SQRT1_2, 2);
    }
    expect(laddered.result).toMatch(
      /Built 2 platforms .* A ladder at x=6.05 goes from the ground up to the last platform/,
    );
    // Only for side-view places.
    expect(executeTool('build_platforms', { platforms: [{ x: 0, height: 1 }] }, fakeHost().host).ok).toBe(
      false,
    );
  });
});

describe('side-view moves the creator turned on (decision 95)', () => {
  /** A side-view host with some moves: the line at z = 0 on flat ground. */
  function movesHost(moves: SideMove[]) {
    const fake = fakeHost();
    fake.host.sideLine = () => 0;
    fake.host.heightAt = () => 0;
    fake.host.sideMoves = () => moves;
    return fake;
  }

  it('reaches higher and wider with a double jump, wider with a dash', () => {
    expect(jumpReach([])).toEqual({ up: 1, across: 3, acrossUp: 1.5 });
    expect(jumpReach(['double-jump'])).toEqual({ up: 1.8, across: 4, acrossUp: 2.5 });
    expect(jumpReach(['double-jump', 'dash'])).toEqual({ up: 1.8, across: 6, acrossUp: 4.5 });
    expect(jumpReach(['wall-jump'])).toEqual(jumpReach([]));
  });

  it('names the moves in the prompt and uses them for the jump reach', () => {
    const prompt = systemPrompt(movesHost(['double-jump', 'wall-jump']).host);
    expect(prompt).toContain('a double jump (jump again in the air), a wall jump');
    expect(prompt).toContain('tall walls are for jumping off');
    expect(prompt).toMatch(/jump about 1.8 m up and 4 m across/);
    expect(systemPrompt(movesHost([]).host)).toContain('no extra moves');
  });

  it('builds higher steps and wider gaps when players have a double jump', () => {
    const course = {
      platforms: [
        { x: 0, height: 1.8 },
        { x: 5.5, height: 3.6 },
      ],
    };
    const plain = movesHost([]);
    executeTool('build_platforms', course, plain.host, () => 0.5);
    const double = movesHost(['double-jump']);
    executeTool('build_platforms', course, double.host, () => 0.5);
    const tops = (applied: CommandPayload[][]) =>
      applied[0]!.flatMap((c) =>
        c.type === 'place_item'
          ? [[c.params.position[0], Math.round((c.params.position[1] + c.params.scale![1]) * 100) / 100]]
          : [],
      );
    // Without it the first step is lowered to 1 m, the second to 2 m and pulled within 1.5 m.
    expect(tops(plain.applied)).toEqual([
      [0, 1],
      [4.5, 2],
    ]);
    // With it both heights stay, and a 2.5 m gap going up 1.8 m is kept.
    expect(tops(double.applied)).toEqual([
      [0, 1.8],
      [5.5, 3.6],
    ]);
  });
});
