import { WorldDocument, type CommandPayload } from '@genvr/contracts';
import { applyCommand, createWorldState, WALL_SURFACES } from '@genvr/world';
import { describe, expect, it } from 'vitest';
import { executeTool, TOOL_ARGS, worldSummary, type AssistantHost } from '../src/index.js';

/** A place whose commands really apply, so walls and items can be read back. */
function host() {
  const state = createWorldState(
    WorldDocument.parse({
      schemaVersion: 1,
      experienceId: 'exp-looks',
      version: 0,
      style: { base: 'realistic' },
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
  };
  return { host: assistant, state };
}

describe('wall looks', () => {
  it('draws a wall in old stone, names the look in the summary, and keeps plaster as before', () => {
    const { host: assistant, state } = host();
    const stone = executeTool('draw_wall', { points: [[0, 0], [10, 0]], material: 'old-stone' }, assistant);
    expect(stone.ok, stone.result).toBe(true);
    expect(state.doc.walls[0]?.materialId).toBe(WALL_SURFACES['old-stone']);
    expect(worldSummary(state.doc, 10)).toMatch(/wall-\S+ wall \(old-stone\)/);
    expect(executeTool('draw_wall', { points: [[0, 5], [10, 5]], material: 'plaster' }, assistant).ok).toBe(true);
    expect(state.doc.walls[1]?.materialId).toBeUndefined();
  });

  it('offers only the known looks', () => {
    expect(TOOL_ARGS.draw_wall.safeParse({ points: [[0, 0], [10, 0]], material: 'marble' }).success).toBe(false);
    expect(TOOL_ARGS.draw_wall.safeParse({ points: [[0, 0], [10, 0]], material: 'wood' }).success).toBe(true);
  });
});

describe('stretching parts', () => {
  it('places, places in a batch and moves a Wedge with its own width, height and depth', () => {
    const { host: assistant, state } = host();
    const one = executeTool(
      'place_item',
      { itemId: 'genvr.core.part.wedge', x: 4, z: 4, stretch: [6, 1.5, 8] },
      assistant,
    );
    expect(one.ok, one.result).toBe(true);
    expect(state.doc.instances[0]?.transform.scale).toEqual([6, 1.5, 8]);
    const batch = executeTool(
      'place_items',
      { items: [{ itemId: 'genvr.core.part.box', x: 10, z: 10, stretch: [2, 0.5, 12] }] },
      assistant,
    );
    expect(batch.ok, batch.result).toBe(true);
    expect(state.doc.instances[1]?.transform.scale).toEqual([2, 0.5, 12]);
    const id = state.doc.instances[0]!.instanceId;
    expect(executeTool('move_item', { instanceId: id, stretch: [7, 2, 9] }, assistant).ok).toBe(true);
    expect(state.doc.instances[0]?.transform.scale).toEqual([7, 2, 9]);
    // A move without a size or stretch keeps the stretch.
    expect(executeTool('move_item', { instanceId: id, x: 6 }, assistant).ok).toBe(true);
    expect(state.doc.instances[0]?.transform.scale).toEqual([7, 2, 9]);
  });

  it('refuses to stretch an item that is not a part', () => {
    const { host: assistant, state } = host();
    const refused = executeTool(
      'place_item',
      { itemId: 'genvr.core.tree.round', x: 4, z: 4, stretch: [2, 8, 2] },
      assistant,
    );
    expect(refused.ok).toBe(false);
    expect(refused.result).toContain('cannot be stretched');
    expect(state.doc.instances).toHaveLength(0);
  });
});
