import { WorldDocument, type CommandPayload } from '@genvr/contracts';
import { describeOceanControls } from '@genvr/core-library';
import { applyCommand, createWorldState } from '@genvr/world';
import { describe, expect, it } from 'vitest';
import { runTool, type AssistantHost } from '../src/index.js';

const OCEAN = 'genvr.core.water.tidewater-ocean';
function setup(style: 'realistic' | 'blocky' = 'realistic') {
  const state = createWorldState(
    WorldDocument.parse({
      schemaVersion: 1,
      experienceId: 'exp-ocean',
      version: 0,
      style: { base: style },
      sizeTier: 'small',
      access: { mode: 'private' },
      environment: {
        sky: { preset: 'day' },
        weather: { preset: 'clear' },
        sea: { level: -2, swell: { height: 0.2 }, params: { retained: true } },
      },
      terrain: {},
      spawn: { position: [0, 1, 0] },
    }),
  );
  const applied: CommandPayload[] = [],
    inverses: CommandPayload[] = [];
  const host: AssistantHost = {
    world: () => state.doc,
    heightAt: () => 0,
    focus: () => ({ x: 0, z: 0 }),
    addWater: () => null,
    apply: (commands) => {
      for (const command of commands) {
        inverses.push(applyCommand(state, command).inverse);
        applied.push(command);
      }
      return null;
    },
  };
  return { state, host, applied, inverses };
}

describe('reusable world ocean assistant and MCP tools', () => {
  it('discovers the ocean and its world-scoped supported controls without exposing unused params', async () => {
    const { host } = setup();
    const search = await runTool('search_catalog', { query: 'ocean' }, host);
    expect(search.ok).toBe(true);
    expect(search.result).toContain(OCEAN);
    expect(search.result).toContain('set_sea resource_id');
    const result = await runTool('get_resource_controls', { item_id: OCEAN }, host);
    expect(result.ok).toBe(true);
    const info = JSON.parse(result.result);
    expect(info).toMatchObject({ scope: 'world', apply_tool: 'set_sea', styles: ['realistic'] });
    expect(info.controls).toEqual(describeOceanControls(OCEAN)!.controls);
    expect(info.controls.map((control: { key: string }) => control.key)).toEqual([
      'level',
      'direction',
      'period',
      'height',
    ]);
    expect(info.control_arguments).toEqual({
      level: 'level',
      direction: 'swell.direction',
      period: 'swell.period',
      height: 'swell.height',
    });
  });

  it('does not turn semantic ocean discovery into permission to place it as a model', async () => {
    const { host, applied } = setup();
    host.searchCatalog = async () => [{ id: OCEAN, name: 'Ocean', category: 'environment' }];
    const search = await runTool('search_catalog', { query: 'sea' }, host);
    expect(search.result).toContain('set_sea resource_id');
    expect((await runTool('place_item', { itemId: OCEAN, x: 0, z: 0 }, host)).ok).toBe(false);
    expect(applied).toHaveLength(0);
  });

  it('applies resource and swell through an undoable command and preserves legacy parameters', async () => {
    const { state, host, applied, inverses } = setup();
    const before = structuredClone(state.doc.environment.sea);
    const changed = await runTool(
      'set_sea',
      { resource_id: OCEAN, level: 20, swell: { direction: 120, period: 8, height: 0.4 } },
      host,
    );
    expect(changed.ok).toBe(true);
    expect(applied[0]).toEqual({
      type: 'set_sea',
      params: { resourceId: OCEAN, level: 20, swell: { direction: 120, period: 8, height: 0.4 } },
    });
    expect(state.doc.environment.sea).toEqual({
      resourceId: OCEAN,
      level: 20,
      swell: { direction: 120, period: 8, height: 0.4 },
      params: { retained: true },
    });
    expect(WorldDocument.parse(JSON.parse(JSON.stringify(state.doc))).environment.sea).toEqual(
      state.doc.environment.sea,
    );
    applyCommand(state, inverses[0]!);
    expect(state.doc.environment.sea).toEqual(before);
  });

  it('preserves omitted values, resets swell and selector explicitly, and removes the sea', async () => {
    const { state, host } = setup();
    await runTool(
      'set_sea',
      { resource_id: OCEAN, level: 5, swell: { direction: 60, period: 10, height: 0.5 } },
      host,
    );
    await runTool('set_sea', { level: 7 }, host);
    expect(state.doc.environment.sea).toMatchObject({
      resourceId: OCEAN,
      level: 7,
      swell: { direction: 60, period: 10, height: 0.5 },
    });
    await runTool('set_sea', { level: 7, swell: null }, host);
    expect(state.doc.environment.sea?.swell).toBeUndefined();
    expect(state.doc.environment.sea?.resourceId).toBe(OCEAN);
    await runTool('set_sea', { level: 7, resource_id: null }, host);
    expect(state.doc.environment.sea?.resourceId).toBeUndefined();
    await runTool('set_sea', { level: null }, host);
    expect(state.doc.environment.sea).toBeUndefined();
  });

  it('rejects invalid resource, unsupported fields and swell bounds before any world command', async () => {
    const { host, applied } = setup();
    for (const args of [
      { resource_id: 'missing', level: 0 },
      { level: 51 },
      { level: 0, swell: { direction: 360 } },
      { level: 0, swell: { period: 5 } },
      { level: 0, swell: { height: 2 } },
      { level: 0, swell: { height: '0.3' } },
      { level: 0, swell: { foam: 1 } },
      { level: 0, params: { foam: 1 } },
    ])
      expect((await runTool('set_sea', args, host)).ok).toBe(false);
    expect(applied).toHaveLength(0);
  });

  it('allows reference discovery in other styles but refuses unsupported application', async () => {
    const { host, applied } = setup('blocky');
    expect((await runTool('get_resource_controls', { item_id: OCEAN }, host)).ok).toBe(true);
    expect((await runTool('set_sea', { level: 0, resource_id: OCEAN }, host)).ok).toBe(false);
    expect(applied).toHaveLength(0);
  });
});
