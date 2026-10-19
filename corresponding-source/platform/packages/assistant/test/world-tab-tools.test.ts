import { WorldDocument, type CommandPayload } from '@genvr/contracts';
import { applyCommand, createWorldState } from '@genvr/world';
import { describe, expect, it } from 'vitest';
import { executeTool, worldSummary, type AssistantHost } from '../src/index.js';

function host(base: 'blocky' | 'realistic' = 'realistic') {
  const state = createWorldState(
    WorldDocument.parse({
      schemaVersion: 1, experienceId: 'exp-world', version: 0, style: { base }, sizeTier: 'small', access: { mode: 'private' },
      environment: { sky: { preset: 'day' }, weather: { preset: 'clear' } }, terrain: {}, spawn: { position: [0, 1, 0] },
    }),
  );
  const assistant: AssistantHost = {
    world: () => state.doc, heightAt: () => 0, addWater: () => null, focus: () => ({ x: 0, z: 0 }),
    apply: (commands: CommandPayload[]) => { for (const command of commands) applyCommand(state, command); return null; },
  };
  return { host: assistant, state };
}

describe('World tab tools (WORLD-W8)', () => {
  it('keeps the hour and wind when only the sky preset changes, and the look when a cycle starts', () => {
    const { host: assistant, state } = host();
    expect(executeTool('set_sky', { preset: 'day', time_of_day: 17, wind_speed: 6, wind_direction: 90 }, assistant).ok).toBe(true);
    expect(executeTool('set_sky', { preset: 'sunset' }, assistant).ok).toBe(true);
    expect(state.doc.environment.sky).toMatchObject({ preset: 'sunset', params: { timeOfDay: 17, windSpeed: 6 } });
    expect(executeTool('set_sky', { preset: 'night', cycle_minutes: 20 }, assistant).ok).toBe(true);
    expect(state.doc.environment.sky).toMatchObject({ preset: 'night', params: { cycle: 20, windSpeed: 6 } });
    expect(executeTool('set_sky', { preset: 'night', cycle_minutes: 0 }, assistant).ok).toBe(true);
    expect(state.doc.environment.sky.params.cycle).toBeUndefined();
    expect(worldSummary(state.doc, 10)).toMatch(/Sky settings: 17 h, wind 6 m\/s/);
  });

  it('keeps the weather strength across presets', () => {
    const { host: assistant, state } = host();
    executeTool('set_weather', { preset: 'rain', strength: 1.5 }, assistant);
    executeTool('set_weather', { preset: 'snow' }, assistant);
    expect(state.doc.environment.weather).toMatchObject({ preset: 'snow', params: { strength: 1.5 } });
  });

  it('adds, updates, lists and removes lights, at most 4, and sets a three-point setup', () => {
    const { host: assistant, state } = host();
    expect(executeTool('set_lights', { action: 'three_point' }, assistant).ok).toBe(true);
    expect(state.doc.environment.lighting?.map((l) => l.name)).toEqual(['Key light', 'Fill light', 'Back light']);
    expect(executeTool('set_lights', { action: 'update', id: 'light-key', intensity: 40, color: '#ffaa00' }, assistant).ok).toBe(true);
    expect(state.doc.environment.lighting?.[0]).toMatchObject({ intensity: 40, color: '#ffaa00' });
    expect(executeTool('set_lights', { action: 'add', name: 'Rim' }, assistant).ok).toBe(true);
    expect(executeTool('set_lights', { action: 'add', name: 'Too many' }, assistant).result).toMatch(/at most 4/);
    expect(executeTool('set_lights', { action: 'remove', id: 'light-back' }, assistant).ok).toBe(true);
    expect(JSON.parse(executeTool('set_lights', { action: 'list' }, assistant).result)).toHaveLength(3);
    expect(worldSummary(state.doc, 10)).toMatch(/Lights: light-key "Key light"/);
  });

  it('moves the start point and sets the water look in realistic places only', () => {
    const { host: assistant, state } = host();
    expect(executeTool('set_spawn', { x: 12, z: -4, turn: 90 }, assistant).ok).toBe(true);
    expect(state.doc.spawn.position).toEqual([12, 1, -4]);
    expect(executeTool('set_water_look', { clarity: 4, waves: 'rough' }, assistant).ok).toBe(true);
    expect(state.doc.style.water).toMatchObject({ clarity: 4, waves: 'rough' });
    expect(executeTool('set_water_look', { waves: 'calm' }, host('blocky').host).ok).toBe(false);
  });
});
