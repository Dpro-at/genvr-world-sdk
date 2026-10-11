import { WorldDocument, type CommandPayload } from '@genvr/contracts';
import { describe, expect, it } from 'vitest';
import { executeTool, toolDefinitions, worldSummary, type AssistantHost } from '../src/index.js';

/** A place with the smooth height-field ground the river and sea tools need. */
function host(blockGround = false) {
  const world = WorldDocument.parse({
    schemaVersion: 1,
    experienceId: 'exp-water',
    version: 0,
    style: { base: 'realistic' },
    sizeTier: 'small',
    access: { mode: 'private' },
    environment: { sky: { preset: 'day' }, weather: { preset: 'clear' } },
    terrain: {},
    spawn: { position: [0, 1, 0] },
  });
  const applied: CommandPayload[][] = [];
  const assistant: AssistantHost = {
    world: () => world,
    heightAt: () => 0,
    apply: (commands) => {
      applied.push(commands);
      return null;
    },
    addWater: () => null,
    focus: () => ({ x: 0, z: 0 }),
    blockGround: () => blockGround,
  };
  return { host: assistant, applied, world };
}

const LINE: Array<[number, number]> = [
  [0, -30],
  [0, 30],
];

describe('the assistant makes water (P2-39)', () => {
  it('offers the river and sea tools only where the ground is a height field', () => {
    const names = (blockGround: boolean) =>
      toolDefinitions({ blockGround }).map((tool) => tool.function.name);
    expect(names(false)).toEqual(expect.arrayContaining(['draw_river', 'set_sea']));
    expect(names(true)).not.toContain('draw_river');
    expect(names(true)).not.toContain('set_sea');
  });

  it('draws a river, and says whether it can be swum in', () => {
    const { host: h, applied } = host();
    const narrow = executeTool('draw_river', { points: LINE, width: 6 }, h);
    expect(narrow.ok).toBe(true);
    expect(narrow.result).toContain('widen it past 11 m');
    const command = applied.at(-1)![0]!;
    expect(command.type).toBe('draw_river');
    if (command.type !== 'draw_river') throw new Error('wrong command');
    expect(command.params.points).toEqual(LINE);
    expect(command.params.width).toBe(6);
    expect(command.params.riverId).toMatch(/^river-/);

    const wide = executeTool('draw_river', { points: LINE, width: 20 }, h);
    expect(wide.result).toContain('deep enough to swim in');
  });

  it('uses a sensible width and flow when none is asked for', () => {
    const { host: h, applied } = host();
    executeTool('draw_river', { points: LINE }, h);
    const command = applied.at(-1)![0]!;
    if (command.type !== 'draw_river') throw new Error('wrong command');
    expect(command.params.width).toBe(8);
    expect(command.params.flow).toBe(1.5);
  });

  it('refuses a river that leaves the place', () => {
    const { host: h, applied } = host();
    const before = applied.length;
    const outcome = executeTool(
      'draw_river',
      {
        points: [
          [0, 0],
          [9000, 9000],
        ],
      },
      h,
    );
    expect(outcome.ok).toBe(false);
    expect(outcome.result).toContain('outside the place');
    expect(applied.length).toBe(before);
  });

  it('turns the sea on and off', () => {
    const { host: h, applied } = host();
    const on = executeTool('set_sea', { level: -2 }, h);
    expect(on.ok).toBe(true);
    expect(on.result).toContain('-2 m');
    let command = applied.at(-1)![0]!;
    if (command.type !== 'set_sea') throw new Error('wrong command');
    expect(command.params.level).toBe(-2);

    const off = executeTool('set_sea', { level: null }, h);
    expect(off.result).toContain('gone');
    command = applied.at(-1)![0]!;
    if (command.type !== 'set_sea') throw new Error('wrong command');
    expect(command.params.level).toBeNull();
  });

  it('can see the rivers and the sea that are already there', () => {
    // Without this the assistant would draw a second river when asked about the first.
    const { world } = host();
    expect(worldSummary(world, 20)).not.toContain('Rivers:');
    world.environment.rivers.push({
      id: 'river-1',
      name: 'Old Creek',
      points: LINE,
      width: 9,
      widen: 1.3,
      flow: 1.5,
      params: {},
    });
    world.environment.sea = { level: -3, params: {} };
    const summary = worldSummary(world, 20);
    expect(summary).toContain('Rivers: 1');
    expect(summary).toContain('river-1');
    expect(summary).toContain('Old Creek');
    expect(summary).toContain('9 m wide');
    expect(summary).toContain('Sea up to -3 m');
  });
});
