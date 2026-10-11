import { WorldDocument, type CommandPayload } from '@genvr/contracts';
import { Block } from '@genvr/world';
import { describe, expect, it } from 'vitest';
import { executeTool, systemPrompt, toolDefinitions, type AssistantHost } from '../src/index.js';

/** A block place: ground 3 blocks high, a step up to 4 from x = 5; the builder stands at (0, 0). */
function blockHost(blockGround = true) {
  const world = WorldDocument.parse({
    schemaVersion: 1,
    experienceId: 'exp-blocks',
    version: 0,
    style: { base: 'voxel' },
    sizeTier: 'small',
    access: { mode: 'private' },
    environment: { sky: { preset: 'day' }, weather: { preset: 'clear' } },
    terrain: {},
    voxels: { seed: 1, generator: 1 },
    spawn: { position: [0, 3, 0] },
  });
  const applied: CommandPayload[][] = [];
  const host: AssistantHost = {
    world: () => world,
    heightAt: (x) => (x >= 5 ? 4 : 3),
    apply: (commands) => {
      applied.push(commands);
      return null;
    },
    addWater: () => null,
    focus: () => ({ x: 0.5, z: 0.5 }),
    blockGround: () => blockGround,
  };
  /** Every block the last request changed, keyed "x,y,z". */
  const changed = () => {
    const blocks = new Map<string, number>();
    for (const command of applied.at(-1) ?? [])
      if (command.type === 'set_blocks')
        for (const [x, y, z, block] of command.params.blocks) blocks.set(`${x},${y},${z}`, block);
    return blocks;
  };
  return { host, applied, changed };
}

describe('building with blocks (P2-26)', () => {
  it('offers the block tools only in block places, instead of shaping the ground', () => {
    const names = (blockGround: boolean) =>
      toolDefinitions({ blockGround }).map((tool) => tool.function.name);
    expect(names(true)).toEqual(expect.arrayContaining(['fill_blocks', 'block_line', 'block_floor']));
    expect(names(true)).not.toContain('sculpt_terrain');
    expect(names(false)).toContain('sculpt_terrain');
    expect(names(false)).not.toContain('dig_blocks');
    expect(systemPrompt(blockHost().host)).toContain('made of 1 m blocks');
    expect(systemPrompt(blockHost(false).host)).not.toContain('made of 1 m blocks');
  });

  it('fills a box on the ground, reaching down to lower ground under it', () => {
    const { host, changed } = blockHost();
    const outcome = executeTool(
      'fill_blocks',
      { x1: 4, z1: 10, x2: 6, z2: 11, block: 'brick', height: 2 },
      host,
    );
    expect(outcome.ok).toBe(true);
    const blocks = changed();
    // The middle column (x 5) stands on ground 4: the box is y 4 and 5; x 4 also fills y 3.
    expect(blocks.get('5,4,10')).toBe(Block.brick);
    expect(blocks.get('5,5,11')).toBe(Block.brick);
    expect(blocks.get('4,3,10')).toBe(Block.brick);
    expect(blocks.has('5,6,10')).toBe(false);
    expect(blocks.size).toBe(3 * 2 * 2 + 2);
  });

  it('makes a hollow hut with air inside', () => {
    const { host, changed } = blockHost();
    executeTool(
      'fill_blocks',
      { x1: 10, z1: 10, x2: 14, z2: 14, block: 'planks', height: 4, hollow: true },
      host,
    );
    const blocks = changed();
    // The ground there is 4 blocks high: floor at y 4, roof at y 7.
    expect(blocks.get('12,4,12')).toBe(Block.planks); // floor
    expect(blocks.get('12,7,12')).toBe(Block.planks); // roof
    expect(blocks.get('10,5,12')).toBe(Block.planks); // wall
    expect(blocks.get('12,5,12')).toBe(Block.air); // inside
    expect(blocks.has('12,8,12')).toBe(false);
    // A doorway two blocks high in the side facing the builder (who stands toward -x and -z).
    expect(blocks.get('12,5,10')).toBe(Block.air);
    expect(blocks.get('12,6,10')).toBe(Block.air);
    expect(blocks.get('12,7,10')).toBe(Block.planks);
    expect(blocks.get('11,5,10')).toBe(Block.planks);
  });

  it('makes a hut tall enough to walk in when the height is left out', () => {
    const { host, changed } = blockHost();
    executeTool('fill_blocks', { x1: 10, z1: 20, x2: 14, z2: 24, block: 'stone', hollow: true }, host);
    const blocks = changed();
    expect(blocks.get('12,7,22')).toBe(Block.stone); // roof: 4 high from y 4
    expect(blocks.has('12,8,22')).toBe(false);
  });

  it('builds a line that follows the ground, and floors and holes per column', () => {
    const { host, changed } = blockHost();
    executeTool(
      'block_line',
      {
        points: [
          [3, 20],
          [7, 20],
        ],
        block: 'stone',
        height: 2,
      },
      host,
    );
    let blocks = changed();
    expect(blocks.get('3,3,20')).toBe(Block.stone);
    expect(blocks.get('3,4,20')).toBe(Block.stone);
    expect(blocks.get('6,4,20')).toBe(Block.stone);
    expect(blocks.get('6,5,20')).toBe(Block.stone);
    expect(blocks.size).toBe(5 * 2);

    executeTool('block_floor', { x1: 4, z1: 30, x2: 5, z2: 30, block: 'paving' }, host);
    blocks = changed();
    expect([...blocks.entries()]).toEqual([
      ['4,2,30', Block.paving],
      ['5,3,30', Block.paving],
    ]);

    executeTool('dig_blocks', { x1: 1, z1: 40, x2: 1, z2: 40, depth: 2 }, host);
    expect([...changed().entries()]).toEqual([
      ['1,1,40', Block.air],
      ['1,2,40', Block.air],
    ]);
  });

  it('never builds where the builder stands, splits big jobs, and refuses outside block places', () => {
    const { host, applied, changed } = blockHost();
    executeTool('fill_blocks', { x1: -1, z1: -1, x2: 1, z2: 1, block: 'stone', height: 2 }, host);
    expect(changed().has('0,3,0')).toBe(false);
    expect(changed().size).toBe(8 * 2);

    const big = executeTool(
      'fill_blocks',
      { x1: -20, z1: -20, x2: 19, z2: 19, block: 'dirt', height: 5 },
      host,
    );
    expect(big.ok).toBe(true);
    expect(applied.at(-1)!.length).toBe(Math.ceil((40 * 40 * 5) / 4096));

    const tooBig = executeTool(
      'fill_blocks',
      { x1: -60, z1: -60, x2: 59, z2: 59, block: 'dirt', height: 5 },
      host,
    );
    expect(tooBig).toMatchObject({ ok: false, result: expect.stringContaining('smaller parts') });

    const flat = blockHost(false);
    expect(
      executeTool('block_floor', { x1: 0, z1: 5, x2: 2, z2: 5, block: 'sand' }, flat.host),
    ).toMatchObject({ ok: false, result: expect.stringContaining('no blocks') });
    expect(flat.applied).toEqual([]);
  });
});
