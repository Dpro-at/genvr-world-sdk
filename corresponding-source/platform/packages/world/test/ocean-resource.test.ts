import { describe, expect, it } from 'vitest';
import { CommandPayload, Sea, WorldDocument } from '@genvr/contracts';
import { applyCommand, createWorldState } from '../src/index.js';

const id = 'genvr.core.water.tidewater-ocean' as const;
const state = () =>
  createWorldState(
    WorldDocument.parse({
      schemaVersion: 1,
      experienceId: 'ocean-test',
      version: 0,
      style: { base: 'realistic' },
      sizeTier: 'small',
      access: { mode: 'private' },
      environment: {
        sky: { preset: 'day' },
        weather: { preset: 'clear' },
        sea: { level: 2, params: { custom: 4 }, swell: { period: 10 } },
      },
      terrain: {},
      spawn: { position: [0, 3, 0] },
    }),
  );
describe('Ocean resource selection and inverses', () => {
  it('parses legacy seas and rejects unsupported selector ids', () => {
    expect(Sea.parse({ level: 0 })).toEqual({ level: 0, params: {} });
    expect(Sea.safeParse({ level: 0, resourceId: 'unknown' }).success).toBe(false);
    expect(
      CommandPayload.safeParse({ type: 'set_sea', params: { level: 0, resourceId: 'unknown' } }).success,
    ).toBe(false);
  });
  it('preserves omitted params, swell and selector on level changes', () => {
    const world = state();
    applyCommand(world, { type: 'set_sea', params: { level: 3, resourceId: id } });
    applyCommand(world, { type: 'set_sea', params: { level: 4 } });
    expect(world.doc.environment.sea).toEqual({
      level: 4,
      resourceId: id,
      params: { custom: 4 },
      swell: { period: 10 },
    });
  });
  it('restores absence of selector and old params with inverse', () => {
    const world = state(),
      before = structuredClone(world.doc.environment.sea);
    const result = applyCommand(world, {
      type: 'set_sea',
      params: { level: 3, resourceId: id, params: {}, swell: null },
    });
    applyCommand(world, result.inverse);
    expect(world.doc.environment.sea).toEqual(before);
  });
  it('undoes explicit selector reset and removal including all preserved settings', () => {
    const world = state();
    applyCommand(world, { type: 'set_sea', params: { level: 2, resourceId: id } });
    const before = structuredClone(world.doc.environment.sea);
    const clear = applyCommand(world, { type: 'set_sea', params: { level: 2, resourceId: null } });
    expect(world.doc.environment.sea?.resourceId).toBeUndefined();
    applyCommand(world, clear.inverse);
    expect(world.doc.environment.sea).toEqual(before);
    const remove = applyCommand(world, { type: 'set_sea', params: { level: null } });
    expect(world.doc.environment.sea).toBeUndefined();
    applyCommand(world, remove.inverse);
    expect(world.doc.environment.sea).toEqual(before);
  });
});
