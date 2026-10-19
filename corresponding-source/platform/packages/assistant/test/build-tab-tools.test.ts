import { WorldDocument, type CommandPayload } from '@genvr/contracts';
import { applyCommand, createWorldState } from '@genvr/world';
import { describe, expect, it } from 'vitest';
import { executeTool, worldSummary, type AssistantHost } from '../src/index.js';

/** A place whose commands really apply (as in wall-look-stretch), plus an optional history hook. */
function host(history?: AssistantHost['history']) {
  const state = createWorldState(
    WorldDocument.parse({
      schemaVersion: 1,
      experienceId: 'exp-build',
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
    ...(history ? { history } : {}),
  };
  return { host: assistant, state };
}

describe('Build tab tools (BUILD-B9)', () => {
  it('cuts a door into the nearest part of a wall, lists it, and removes it', () => {
    const { host: assistant, state } = host();
    expect(executeTool('draw_wall', { points: [[0, 0], [10, 0]] }, assistant).ok).toBe(true);
    const wallId = state.doc.walls[0]!.id;
    const door = executeTool('add_opening', { wallId, kind: 'door', at: [5, 0.4] }, assistant);
    expect(door.ok, door.result).toBe(true);
    expect(state.doc.walls[0]!.openings[0]).toMatchObject({ kind: 'door', segment: 0, offset: 5, bottom: 0 });
    expect(worldSummary(state.doc, 10)).toMatch(/openings: door-\S+ door/);
    const openingId = state.doc.walls[0]!.openings[0]!.id;
    const removed = executeTool('remove_parts', { parts: [{ kind: 'opening', id: openingId, wallId }] }, assistant);
    expect(removed.ok, removed.result).toBe(true);
    expect(state.doc.walls[0]!.openings).toHaveLength(0);
  });

  it('draws a road with its own width and sidewalks, and removes roads and walls by id', () => {
    const { host: assistant, state } = host();
    const road = executeTool('draw_road', { points: [[0, 20], [30, 20]], width: 9, sidewalk: 2, sidewalkSide: 'left' }, assistant);
    expect(road.ok, road.result).toBe(true);
    expect(state.doc.roads[0]).toMatchObject({ width: 9, sidewalk: 2, sidewalkSide: 'left' });
    executeTool('draw_wall', { points: [[0, 0], [10, 0]] }, assistant);
    const parts = [
      { kind: 'road', id: state.doc.roads[0]!.id },
      { kind: 'wall', id: state.doc.walls[0]!.id },
    ];
    expect(executeTool('remove_parts', { parts }, assistant).ok).toBe(true);
    expect(state.doc.roads).toHaveLength(0);
    expect(state.doc.walls).toHaveLength(0);
    expect(executeTool('remove_parts', { parts: [{ kind: 'river', id: 'river-none' }] }, assistant).ok).toBe(false);
  });

  it('draws a river that widens as asked, then changes its width', () => {
    const { host: assistant, state } = host();
    const river = executeTool('draw_river', { points: [[-20, 0], [20, 0]], widen: 1 }, assistant);
    expect(river.ok, river.result).toBe(true);
    const id = state.doc.environment.rivers[0]!.id;
    expect(state.doc.environment.rivers[0]!.widen).toBe(1);
    const edited = executeTool('edit_river', { riverId: id, width: 14, flow: 3 }, assistant);
    expect(edited.ok, edited.result).toBe(true);
    expect(state.doc.environment.rivers[0]).toMatchObject({ width: 14, flow: 3 });
  });

  it('locks items; a locked item is never moved or removed by the assistant', () => {
    const { host: assistant, state } = host();
    assistant.apply([{ type: 'place_item', params: { instanceId: 'box-1', itemId: 'genvr.core.part.box', position: [2, 0, 2] } }]);
    const id = state.doc.instances[0]!.instanceId;
    expect(executeTool('lock_items', { instanceIds: [id] }, assistant).ok).toBe(true);
    expect(state.doc.instances[0]!.locked).toBe(true);
    expect(executeTool('move_item', { instanceId: id, x: 5 }, assistant).result).toMatch(/locked/);
    expect(executeTool('remove_items', { instanceIds: [id] }, assistant).result).toMatch(/locked/);
    expect(state.doc.instances).toHaveLength(1);
    expect(worldSummary(state.doc, 10)).toMatch(/, locked/);
  });

  it("undoes only through the host, which guards the person's work", () => {
    expect(executeTool('world_history', { action: 'undo' }, host().host).ok).toBe(false);
    const guarded = host((action) => (action === 'undo' ? 'The person changed the place after your last step.' : null));
    expect(executeTool('world_history', { action: 'undo' }, guarded.host).ok).toBe(false);
    expect(executeTool('world_history', { action: 'redo' }, guarded.host).ok).toBe(true);
  });
});
