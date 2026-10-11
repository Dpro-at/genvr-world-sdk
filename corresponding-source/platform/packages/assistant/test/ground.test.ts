import { WorldDocument, type CommandPayload } from '@genvr/contracts';
import { describe, expect, it } from 'vitest';
import { encodeHeightTile } from '@genvr/world';
import { executeTool, runTool, toolDefinitions, type AssistantHost } from '../src/index.js';

function host() {
  const world = WorldDocument.parse({
    schemaVersion: 1,
    experienceId: 'exp-ground',
    version: 0,
    style: { base: 'realistic' },
    sizeTier: 'small',
    access: { mode: 'private' },
    environment: { sky: { preset: 'day' }, weather: { preset: 'clear' } },
    terrain: {},
    spawn: { position: [0, 1, 0] },
  });
  const applied: CommandPayload[] = [];
  const h: AssistantHost = {
    world: () => world,
    heightAt: () => 0,
    apply: (commands) => {
      applied.push(...commands);
      return null;
    },
    addWater: () => null,
    focus: () => ({ x: 0, z: 0 }),
  };
  return { h, applied };
}

describe('the assistant paints with ground materials (P2-37)', () => {
  it('paints a library material by name, counting as its soil', () => {
    const { h, applied } = host();
    const outcome = executeTool(
      'paint_terrain',
      { x: 0, z: 0, radius: 5, soil: 'grass', material: 'rock-063' },
      h,
    );
    expect(outcome.ok).toBe(true);
    const command = applied[0]!;
    expect(command.type).toBe('paint_terrain');
    if (command.type !== 'paint_terrain') return;
    expect(command.params.material).toEqual({ id: 'genvr.core.ground.rock-063', soil: 'rock' });
    expect(command.params.soilId).toBe('rock');
  });

  it('says so when the material does not exist', () => {
    const { h, applied } = host();
    const outcome = executeTool(
      'paint_terrain',
      { x: 0, z: 0, radius: 5, soil: 'grass', material: 'lava-001' },
      h,
    );
    expect(outcome.ok).toBe(false);
    expect(outcome.result).toMatch(/lava-001/);
    expect(applied).toHaveLength(0);
  });
});

describe('tools for big places (Tidewater world, task 2)', () => {
  it('set_ground_heights sends one set_heights command with the tile as given', async () => {
    const { h, applied } = host();
    const heights = encodeHeightTile([1, 2, 3, 4, 5, 6], 0);
    const outcome = await runTool(
      'set_ground_heights',
      { x0: -10, z0: 4, cols: 3, rows: 2, step: 2, base: 0, heights_cm: heights },
      h,
    );
    expect(outcome.ok, outcome.result).toBe(true);
    expect(applied).toEqual([
      { type: 'set_heights', params: { x0: -10, z0: 4, cols: 3, rows: 2, step: 2, base: 0, heights } },
    ]);
  });

  it('set_ground_heights refuses heights that do not fill the tile, and tiles over 129 a side', async () => {
    const { h, applied } = host();
    const short = await runTool(
      'set_ground_heights',
      { x0: 0, z0: 0, cols: 3, rows: 2, step: 2, base: 0, heights_cm: encodeHeightTile([1, 2], 0) },
      h,
    );
    expect(short.ok).toBe(false);
    expect(short.result).toMatch(/6/);
    const big = await runTool(
      'set_ground_heights',
      { x0: 0, z0: 0, cols: 130, rows: 2, step: 2, base: 0, heights_cm: 'AAAA' },
      h,
    );
    expect(big.ok).toBe(false);
    expect(applied).toHaveLength(0);
  });

  it('place_items places up to 200 items in one change, exactly where it is told', async () => {
    const { h, applied } = host();
    const items = Array.from({ length: 200 }, (_, i) => ({
      itemId: 'genvr.core.crate',
      x: i - 100,
      z: 5,
      turn: 90,
    }));
    items[0] = { ...items[0]!, y: 3.5, size: 2, lean: 10 } as (typeof items)[number];
    const outcome = await runTool('place_items', { items }, h);
    expect(outcome.ok, outcome.result).toBe(true);
    expect(applied).toHaveLength(200);
    const first = applied[0]!;
    if (first.type !== 'place_item') throw new Error('expected place_item');
    expect(first.params.position).toEqual([-100, 3.5, 5]);
    expect(first.params.rest).toBeUndefined();
    expect(first.params.scale).toEqual([2, 2, 2]);
    // turned 90 degrees and leaning 10 degrees: not a pure turn about y
    expect(Math.abs(first.params.rotation![0]) + Math.abs(first.params.rotation![2])).toBeGreaterThan(0.01);
    const second = applied[1]!;
    if (second.type !== 'place_item') throw new Error('expected place_item');
    expect(second.params.rest).toBe(true);
    expect(new Set(applied.map((c) => (c.type === 'place_item' ? c.params.instanceId : ''))).size).toBe(200);
  });

  it('place_items refuses 201 items, unknown items, and generator params out of limits (nothing placed)', async () => {
    const { h, applied } = host();
    const many = Array.from({ length: 201 }, () => ({ itemId: 'genvr.core.crate', x: 0, z: 0 }));
    expect((await runTool('place_items', { items: many }, h)).ok).toBe(false);
    const unknown = await runTool('place_items', { items: [{ itemId: 'no.such.item', x: 0, z: 0 }] }, h);
    expect(unknown.ok).toBe(false);
    const wide = await runTool(
      'place_items',
      {
        items: [
          { itemId: 'genvr.core.tidewater.test-box', x: 0, z: 0, params: { width: 3 } },
          { itemId: 'genvr.core.tidewater.test-box', x: 4, z: 0, params: { width: 300 } },
        ],
      },
      h,
    );
    expect(wide.ok).toBe(false);
    expect(wide.result).toMatch(/item 2.*width/);
    expect(applied).toHaveLength(0);
  });

  it('place_items carries generator params to the placed copy', async () => {
    const { h, applied } = host();
    const outcome = await runTool(
      'place_items',
      { items: [{ itemId: 'genvr.core.tidewater.test-box', x: 1, z: 2, params: { width: 3, seed: 9 } }] },
      h,
    );
    expect(outcome.ok, outcome.result).toBe(true);
    const placed = applied[0]!;
    if (placed.type !== 'place_item') throw new Error('expected place_item');
    expect(placed.params.itemParams).toEqual({ width: 3, seed: 9 });
  });

  it('paint_ground_rule sends one paint_rule command, a soil or a cover', async () => {
    const { h, applied } = host();
    const sand = await runTool(
      'paint_ground_rule',
      { x1: -20, z1: -30, x2: 40, z2: 10, soil: 'sand', height: [0, 3], slope: [0, 15] },
      h,
    );
    expect(sand.ok, sand.result).toBe(true);
    expect(applied[0]).toEqual({
      type: 'paint_rule',
      params: { box: [-20, -30, 40, 10], soilId: 'sand', height: [0, 3], slope: [0, 15] },
    });
    const both = await runTool(
      'paint_ground_rule',
      { x1: 0, z1: 0, x2: 1, z2: 1, soil: 'sand', cover: 'cleared' },
      h,
    );
    expect(both.ok).toBe(false);
    const big = await runTool('paint_ground_rule', { x1: 0, z1: 0, x2: 600, z2: 1, soil: 'sand' }, h);
    expect(big.ok).toBe(false);
    expect(big.result).toMatch(/512/);
  });

  it('set_sky keeps the time of day, the sun azimuth and the wind in the sky params', async () => {
    const { h, applied } = host();
    const outcome = await runTool(
      'set_sky',
      { preset: 'day', time_of_day: 16.2, sun_azimuth: 0, wind_direction: 200, wind_speed: 7 },
      h,
    );
    expect(outcome.ok, outcome.result).toBe(true);
    expect(applied[0]).toEqual({
      type: 'set_sky',
      params: { preset: 'day', params: { timeOfDay: 16.2, sunAzimuth: 0, windDirection: 200, windSpeed: 7 } },
    });
  });

  it('the in-app assistant is not offered the bulk tools (they are for MCP build clients)', () => {
    const names = toolDefinitions({ blockGround: false }).map((tool) => tool.function.name);
    for (const name of ['set_ground_heights', 'place_items', 'paint_ground_rule'])
      expect(names).not.toContain(name);
    expect(names).toContain('set_sky');
  });
});
