import {
  newGame,
  RIDE_PRESETS,
  rideFromParams,
  WorldDocument,
  type CommandPayload,
  type ItemInstance,
} from '@genvr/contracts';
import { applyCommand, createWorldState, type WorldState } from '@genvr/world';
import { describe, expect, it } from 'vitest';
import { executeTool, toolDefinitions, worldSummary, type AssistantHost } from '../src/index.js';
import { TOOL_ARGS } from '../src/tools.js';

const crate = (instanceId: string, params: ItemInstance['params'] = {}): ItemInstance => ({
  instanceId,
  itemId: 'genvr.core.barrel',
  transform: { position: [4, 0, 4], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
  params,
});

function host(instances: ItemInstance[] = [], withGame = false) {
  const state: WorldState = createWorldState(
    WorldDocument.parse({
      schemaVersion: 1,
      experienceId: 'exp-ride',
      version: 0,
      style: { base: 'blocky' },
      sizeTier: 'small',
      access: { mode: 'private' },
      environment: { sky: { preset: 'day' }, weather: { preset: 'clear' } },
      terrain: {},
      spawn: { position: [0, 1, 0] },
      instances,
      ...(withGame ? { game: newGame() } : {}),
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

describe('the assistant makes an item rideable (set_ride)', () => {
  it('is offered in every place and names no kind of item', () => {
    for (const blockGround of [false, true]) {
      const tool = toolDefinitions({ blockGround }).find((t) => t.function.name === 'set_ride');
      expect(tool?.function.description).toContain('rideable item');
    }
  });

  it('makes any placed item rideable with a model preset, as one set_item_params', () => {
    const { host: h, applied, state } = host([crate('b1')]);
    const outcome = executeTool('set_ride', { instance_id: 'b1', model: 'water', seats: 2, tag: 'dock' }, h);
    expect(outcome.ok).toBe(true);
    expect(applied).toHaveLength(1);
    expect(applied[0]).toHaveLength(1);
    expect(applied[0]![0]!.type).toBe('set_item_params');
    expect(rideFromParams(state.doc.instances[0]!.params)).toEqual({
      model: 'water',
      ...RIDE_PRESETS.water,
      seats: 2,
      tag: 'dock',
    });
    expect(outcome.result).toContain('rideable on water');
  });

  it('changes only the numbers given and keeps the rest', () => {
    const { host: h, state } = host([crate('b1', { ride: 'air', rideSeats: 3, rideTag: 'sky' })]);
    expect(executeTool('set_ride', { instance_id: 'b1', max_speed: 45, glide: true }, h).ok).toBe(true);
    expect(rideFromParams(state.doc.instances[0]!.params)).toEqual({
      model: 'air',
      ...RIDE_PRESETS.air,
      seats: 3,
      maxSpeed: 45,
      glide: true,
      tag: 'sky',
    });
    // preset: true goes back to the model's starting numbers, keeping seats and tag.
    executeTool('set_ride', { instance_id: 'b1', preset: true }, h);
    expect(rideFromParams(state.doc.instances[0]!.params)).toEqual({
      model: 'air',
      ...RIDE_PRESETS.air,
      seats: 3,
      tag: 'sky',
    });
    // A tag of null takes it away.
    executeTool('set_ride', { instance_id: 'b1', tag: null }, h);
    expect(rideFromParams(state.doc.instances[0]!.params)?.tag).toBeUndefined();
  });

  it('turns riding off with model null, clearing every ride setting', () => {
    const { host: h, state } = host([crate('b1', { ride: 'ground', rideSeats: 2, color: '#ffffff' })]);
    const outcome = executeTool('set_ride', { instance_id: 'b1', model: null }, h);
    expect(outcome.ok).toBe(true);
    expect(state.doc.instances[0]!.params).toEqual({ color: '#ffffff' });
    expect(outcome.result).toContain('not rideable');
  });

  it('refuses an unknown item, a missing model, and numbers outside the limits', () => {
    const { host: h, applied } = host([crate('b1')]);
    expect(executeTool('set_ride', { instance_id: 'nope', model: 'ground' }, h).ok).toBe(false);
    const noModel = executeTool('set_ride', { instance_id: 'b1', seats: 2 }, h);
    expect(noModel.ok).toBe(false);
    expect(noModel.result).toContain('model');
    // The loop checks arguments with the tool's schema before running it.
    expect(TOOL_ARGS.set_ride.safeParse({ instance_id: 'b1', model: 'ground', max_speed: 61 }).success).toBe(
      false,
    );
    expect(TOOL_ARGS.set_ride.safeParse({ instance_id: 'b1', model: 'ground', seats: 9 }).success).toBe(
      false,
    );
    expect(TOOL_ARGS.set_ride.safeParse({ instance_id: 'b1', model: 'hover' }).success).toBe(false);
    expect(TOOL_ARGS.set_ride.safeParse({ instance_id: 'b1', model: 'air', climb: 12 }).success).toBe(true);
    expect(applied).toEqual([]);
  });

  it('marks rideable items in the summary and in get_game', () => {
    const { host: h, state } = host(
      [
        crate('a', { ride: 'ground' }),
        crate('b', { ride: 'ground', rideTag: 'lane' }),
        crate('c', { ride: 'air' }),
        crate('d'),
      ],
      true,
    );
    const summary = worldSummary(state.doc, 20);
    expect(summary).toContain('3 rideable items: 2 ground, 1 air');
    expect(summary).toContain('- b: ');
    expect(summary).toContain('rideable ground "lane"');
    const game = JSON.parse(executeTool('get_game', {}, h).result) as { rideable_items: string };
    expect(game.rideable_items).toBe('3 rideable items: 2 ground, 1 air');
    expect(worldSummary(host([crate('d')]).state.doc, 20)).not.toContain('rideable');
  });
});
