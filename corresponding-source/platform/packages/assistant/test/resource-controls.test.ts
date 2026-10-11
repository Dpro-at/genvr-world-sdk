import { WorldDocument } from '@genvr/contracts';
import { describeGeneratedControls } from '@genvr/core-library';
import { applyCommand, createWorldState } from '@genvr/world';
import { describe, expect, it } from 'vitest';
import { runTool, type AssistantHost } from '../src/index.js';

const BOX = 'genvr.core.tidewater.test-box';
function setup() {
  const state = createWorldState(WorldDocument.parse({ schemaVersion: 1, experienceId: 'exp-controls', version: 0,
    style: { base: 'realistic' }, sizeTier: 'small', access: { mode: 'private' },
    environment: { sky: { preset: 'day' }, weather: { preset: 'clear' } }, terrain: {}, spawn: { position: [0, 1, 0] },
    instances: [{ instanceId: 'item-controls', itemId: BOX, params: { color: '#ffffff' },
      transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] } }] }));
  let writes = 0;
  const host: AssistantHost = { world: () => state.doc, heightAt: () => 0, focus: () => ({ x: 0, z: 0 }),
    addWater: () => null, apply: (commands) => { writes++; for (const command of commands) applyCommand(state, command); return null; } };
  return { state, host, writes: () => writes };
}

describe('shared resource control tools', () => {
  it('distinguishes normal resources without controls from hidden prototypes and unknown ids', async () => {
    const { host } = setup();
    const normal = await runTool('get_resource_controls', { item_id: 'genvr.core.crate' }, host);
    expect(normal.ok).toBe(true);
    expect(JSON.parse(normal.result)).toMatchObject({ controls: [], world_defaults: false });
    for (const item_id of [BOX, 'missing'])
      expect((await runTool('get_resource_controls', { item_id }, host)).ok).toBe(false);
  });
  it('changes a supported setting and resets to its source default without deleting unrelated params', async () => {
    const { host, state, writes } = setup();
    expect((await runTool('set_resource_params', { instance_id: 'item-controls', params: { width: 4 } }, host)).ok).toBe(true);
    expect(state.doc.instances[0]!.params).toEqual({ width: 4, color: '#ffffff' });
    const reset = await runTool('set_resource_params', { instance_id: 'item-controls', params: { width: null } }, host);
    expect(reset.ok).toBe(true);
    expect(JSON.parse(reset.result).values.width).toBe(describeGeneratedControls(BOX)!.controls.find((c) => c.key === 'width')!.default);
    expect(state.doc.instances[0]!.params).toEqual({ color: '#ffffff' });
    expect(writes()).toBe(2);
  });
  it('rejects invalid changes atomically, including unknown keys, empty patches, types and bounds', async () => {
    const { host, state, writes } = setup();
    for (const params of [{ width: 4, height: 500 }, { width: '4' }, { width: 4, bogus: null }, {}, { color: '#000000' }]) {
      expect((await runTool('set_resource_params', { instance_id: 'item-controls', params }, host)).ok).toBe(false);
    }
    expect((await runTool('set_resource_params', { instance_id: 'missing', params: { width: 4 } }, host)).ok).toBe(false);
    expect(writes()).toBe(0);
    expect(state.doc.instances[0]!.params).toEqual({ color: '#ffffff' });
  });
});
