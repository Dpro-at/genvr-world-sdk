import { WorldDocument, type CommandPayload } from '@genvr/contracts';
import { applyCommand, createWorldState } from '@genvr/world';
import { describe, expect, it } from 'vitest';
import { executeTool, worldSummary, type AssistantHost } from '../src/index.js';

/** A place whose commands really apply (as in build-tab-tools). */
function host(extra: Partial<AssistantHost> = {}) {
  const state = createWorldState(
    WorldDocument.parse({
      schemaVersion: 1,
      experienceId: 'exp-items',
      version: 0,
      style: { base: 'blocky' },
      sizeTier: 'small',
      access: { mode: 'private' },
      environment: { sky: { preset: 'day' }, weather: { preset: 'clear' } },
      terrain: {},
      spawn: { position: [0, 1, 0] },
    }),
  );
  const assistant: AssistantHost = {
    world: () => state.doc,
    heightAt: () => 0,
    apply: (commands: CommandPayload[]) => {
      for (const command of commands) applyCommand(state, command);
      return null;
    },
    addWater: () => null,
    focus: () => ({ x: 0, z: 0 }),
    ...extra,
  };
  const put = (instanceId: string, x: number) =>
    assistant.apply([{ type: 'place_item', params: { instanceId, itemId: 'genvr.core.part.box', position: [x, 0, 0] } }]);
  return { host: assistant, state, put };
}

describe('Items tab tools (ITEMS-I8)', () => {
  it('lists a kind of the library, page by page, only items of the style', () => {
    const { host: assistant } = host();
    const first = executeTool('list_library', { kind: 'models', group: 'parts', limit: 2 }, assistant);
    expect(first.ok, first.result).toBe(true);
    const page = JSON.parse(first.result) as { total: number; items: Array<{ id: string; group: string }>; next?: number };
    expect(page.items.length).toBeLessThanOrEqual(2);
    expect(page.items.every((item) => item.group === 'parts')).toBe(true);
    if (page.total > 2) expect(page.next).toBe(2);
  });

  it('changes colour and material, names, groups and ungroups items', () => {
    const { host: assistant, state, put } = host();
    put('a', 1);
    put('b', 3);
    expect(executeTool('set_item_look', { instanceIds: ['a'], color: '#e53935', material: 'wood' }, assistant).ok).toBe(true);
    expect(state.doc.instances[0]!.params).toMatchObject({ color: '#e53935', material: 'wood' });
    expect(executeTool('set_item_look', { instanceIds: ['a'], material: 'plastic' }, assistant).ok).toBe(true);
    expect(state.doc.instances[0]!.params.material).toBeUndefined();
    expect(executeTool('name_items', { instanceIds: ['a'], name: 'Red box' }, assistant).ok).toBe(true);
    expect(state.doc.instances[0]!.name).toBe('Red box');
    const grouped = executeTool('group_items', { instanceIds: ['a', 'b'], name: 'Pair' }, assistant);
    expect(grouped.ok, grouped.result).toBe(true);
    const groupId = state.doc.groups[0]!.id;
    expect(worldSummary(state.doc, 10)).toMatch(new RegExp(`${groupId} "Pair" \\(2 items\\)`));
    expect(executeTool('ungroup_items', { groupId }, assistant).ok).toBe(true);
    expect(state.doc.groups).toHaveLength(0);
  });

  it('anchors and floats items, refuses locked ones, and settles only through the host', () => {
    const settled: string[][] = [];
    const { host: assistant, state, put } = host({ settle: (ids) => { settled.push([...ids]); return ids.length; } });
    put('a', 1);
    expect(executeTool('set_item_flags', { instanceIds: ['a'], anchored: false, floats: true }, assistant).ok).toBe(true);
    expect(state.doc.instances[0]).toMatchObject({ anchored: false, floats: true });
    expect(executeTool('settle_items', { instanceIds: ['a'] }, assistant).ok).toBe(true);
    expect(settled).toEqual([['a']]);
    executeTool('lock_items', { instanceIds: ['a'] }, assistant);
    expect(executeTool('set_item_look', { instanceIds: ['a'], color: '#000000' }, assistant).result).toMatch(/locked/);
    expect(executeTool('settle_items', { instanceIds: ['a'] }, host().host).ok).toBe(false);
  });
});
