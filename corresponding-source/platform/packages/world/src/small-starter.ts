import type { CommandPayload } from '@genvr/contracts';

import { applyCommand, type WorldState } from './apply.js';
import { Block } from './voxel-data.js';


/** A compact editable garden, made only of existing per-style Core Library looks. */
const LAYOUT = [
  ['genvr.core.tree.pine', -9, -7, 5, 0],
  ['genvr.core.tree.pine', 9, -8, 5.5, 0.4],
  ['genvr.core.tree.pine', -10, 7, 4.5, -0.3],
  ['genvr.core.rock', -5, -5, 0.8, 0.2],
  ['genvr.core.rock', 6, -3, 1, -0.5],
  ['genvr.core.rock', -8, 7, 0.6, 0.7],
  ['genvr.core.bench', -5, 1, 0.9, Math.PI / 2],
  ['genvr.core.bench', 5, 1, 0.9, -Math.PI / 2],
  ['genvr.core.flower', -6, 3, 0.4, 0],
  ['genvr.core.flower', -5, 3.5, 0.35, 0.2],
  ['genvr.core.flower', -4, 3, 0.4, -0.1],
  ['genvr.core.flower', 4, 3, 0.35, 0.1],
  ['genvr.core.flower', 5, 3.5, 0.4, -0.2],
  ['genvr.core.flower', 6, 3, 0.35, 0],
] as const;

export function smallStarterCommands(state: WorldState, boundsFor: (id: string) => { min: readonly number[]; max: readonly number[] }): CommandPayload[] {
  if (state.voxels) {
    // A small grass clearing, not a change to the seeded landscape outside it.
    const level = Math.max(3, state.voxels.surfaceHeight(0.5, 0.5));
    const blocks: Array<[number, number, number, number]> = [];
    for (let z = -13; z <= 13; z++) {
      for (let x = -13; x <= 13; x++) {
        const ground = state.voxels.surfaceHeight(x + 0.5, z + 0.5);
        const top = state.voxels.columnTop(x, z);
        for (let y = Math.min(ground - 1, level - 1); y < level - 1; y++) blocks.push([x, y, z, Block.dirt]);
        blocks.push([x, level - 1, z, Block.grass]);
        for (let y = level; y < Math.max(ground, top); y++) blocks.push([x, y, z, Block.air]);
      }
    }
    for (let i = 0; i < blocks.length; i += 4096) {
      applyCommand(state, { type: 'set_blocks', params: { blocks: blocks.slice(i, i + 4096) } });
    }
    state.doc.spawn.position = [0.5, level + 1, 0.5];
  }
  const style = state.doc.style.base;
  const commands: CommandPayload[] = LAYOUT.map(([id, x, z, height, yaw], index) => {
    const bounds = boundsFor(id);
    const scale = height / (bounds.max[1]! - bounds.min[1]!);
    const ground = state.voxels?.surfaceHeight(x, z) ?? state.terrain.heightAt(x, z);
    return {
      type: 'place_item',
      params: {
        instanceId: `starter-${index}`,
        itemId: id,
        position: [x, ground - bounds.min[1]! * scale, z],
        rotation: [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)],
        scale: [scale, scale, scale],
        rest: true,
      },
    };
  });
  return commands;
}
