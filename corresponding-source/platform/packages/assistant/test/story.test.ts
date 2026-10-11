import { WorldDocument, type CommandPayload } from '@genvr/contracts';
import { applyCommand, createWorldState } from '@genvr/world';
import { describe, expect, it } from 'vitest';
import { executeTool, worldSummary, type AssistantHost } from '../src/index.js';

/** A place whose commands really apply, so the stored story can be read back. */
function host() {
  const state = createWorldState(
    WorldDocument.parse({
      schemaVersion: 1,
      experienceId: 'exp-story',
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

const STOPS = [
  { position: [0, 8, 60], look_at: [0, 2, 0], title: 'Shore' },
  { position: [20, 30, 0], look_at: [0, 10, 0], title: 'Hill', side: 'right', fov: 45 },
];

describe('the scroll story (SCROLL-02)', () => {
  it('stores the stops in the place, lists them, and removes them', () => {
    const { host: assistant, state } = host();
    const made = executeTool('set_story', { title: 'Island', stops: STOPS }, assistant);
    expect(made.ok).toBe(true);
    expect(made.result).toContain('/showcase?place=exp-story');
    expect(state.doc.story?.stops).toHaveLength(2);
    expect(state.doc.story?.stops[0]).toMatchObject({
      title: 'Shore',
      side: 'left',
      camera: { ease: 'in_out', position: [0, 8, 60], target: [0, 2, 0] },
    });
    expect(state.doc.story?.stops[1]?.camera.fov).toBe(45);
    expect(worldSummary(state.doc, 10)).toContain('Story "Island": 2 stops.');
    expect(executeTool('set_story', { stops: null }, assistant).ok).toBe(true);
    expect(state.doc.story).toBeUndefined();
  });

  it('refuses a story of one stop', () => {
    const { host: assistant, state } = host();
    expect(executeTool('set_story', { stops: STOPS.slice(0, 1) }, assistant).ok).toBe(false);
    expect(state.doc.story).toBeUndefined();
  });
});
