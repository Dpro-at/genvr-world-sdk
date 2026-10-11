import type { CommandPayload } from '@genvr/contracts';
import { Block, VoxelData } from '@genvr/world';
import { Mesh, Object3D, Ray, Vector3, type Intersection } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { BlockTools, MAX_DRAG_SPAN } from '../src/block-tools.js';

/** A tap that lands on the top face of the ground block under (x, z). */
function setup(player = { x: 100, y: 0, z: 100 }) {
  const voxels = new VoxelData(250, { seed: 1234, generator: 1 });
  const applied: CommandPayload[] = [];
  let hit: Intersection | null = null;
  // The drag follows this ray; tests point it at the spot the pointer is over.
  let ray = new Ray();
  const tools = new BlockTools({
    scene: new Object3D(),
    voxels,
    cast: () => (hit ? [hit] : []),
    ray: () => ray,
    apply: (command) => {
      applied.push(command);
      return true;
    },
    player: () => player,
  });
  const pointAt = (x: number, z: number) => {
    const object = new Mesh();
    object.name = 'voxels:0,0';
    hit = {
      distance: 5,
      point: new Vector3(x, voxels.surfaceHeight(x, z), z),
      object,
      face: { a: 0, b: 1, c: 2, normal: new Vector3(0, 1, 0), materialIndex: 0 },
    };
    ray = new Ray(new Vector3(x, 200, z), new Vector3(0, -1, 0));
  };
  /** A hit on the +x side face of block (x, y, z), with the ray looking along -x. */
  const pointAtSide = (x: number, y: number, z: number) => {
    const object = new Mesh();
    object.name = 'voxels:0,0';
    hit = {
      distance: 5,
      point: new Vector3(x + 1, y + 0.5, z + 0.5),
      object,
      face: { a: 0, b: 1, c: 2, normal: new Vector3(1, 0, 0), materialIndex: 0 },
    };
  };
  const aimSide = (y: number, z: number) => {
    ray = new Ray(new Vector3(200, y, z), new Vector3(-1, 0, 0));
  };
  return { voxels, tools, applied, pointAt, pointAtSide, aimSide };
}

describe('Blocks tool (P2-26 digging and stacking)', () => {
  it('stacks on the face pointed at and digs the block pointed at', () => {
    const { voxels, tools, applied, pointAt } = setup();
    const ground = voxels.surfaceHeight(3.3, 5.2);
    pointAt(3.3, 5.2);
    tools.set({ mode: 'stack', block: 'planks' });
    expect(tools.target(0, 0)).toEqual([3, ground, 5]);
    expect(tools.tap(0, 0)).toBeNull();
    tools.set({ mode: 'dig' });
    expect(tools.target(0, 0)).toEqual([3, ground - 1, 5]);
    expect(tools.tap(0, 0)).toBeNull();
    expect(applied).toEqual([
      { type: 'set_blocks', params: { blocks: [[3, ground, 5, Block.planks]] } },
      { type: 'set_blocks', params: { blocks: [[3, ground - 1, 5, Block.air]] } },
    ]);
  });

  it('never stacks a block where the player stands', () => {
    const voxels = new VoxelData(250, { seed: 1234, generator: 1 });
    const ground = voxels.surfaceHeight(3.3, 5.2);
    const { tools, applied, pointAt } = setup({ x: 3.5, y: ground, z: 5.5 });
    pointAt(3.3, 5.2);
    expect(tools.tap(0, 0)).toBe('You are standing there.');
    expect(applied).toEqual([]);
  });

  /** The single command of a drag, as a map from "x,y,z" to the block. */
  const blocksOf = (applied: CommandPayload[]) => {
    expect(applied).toHaveLength(1);
    const command = applied[0]!;
    if (command.type !== 'set_blocks') throw new Error(command.type);
    return new Map(command.params.blocks.map(([x, y, z, block]) => [`${x},${y},${z}`, block]));
  };

  it('stacks a flat rectangle in the layer of the first block while dragging, as one command', () => {
    const { voxels, tools, applied, pointAt } = setup();
    tools.set({ mode: 'stack', block: 'brick' });
    pointAt(10.5, 20.5);
    const layer = voxels.surfaceHeight(10.5, 20.5);
    expect(tools.startDrag(1, 100, 100)).toBe(true);
    pointAt(14.5, 22.5);
    expect(tools.moveDrag(1, 160, 130)).toBe(true);
    expect(tools.endDrag(1, 160, 130)).toBeNull();
    const blocks = blocksOf(applied);
    // Every free block of the 5 x 3 rectangle at the first block's height, and nothing else.
    let free = 0;
    for (let x = 10; x <= 14; x += 1)
      for (let z = 20; z <= 22; z += 1) {
        const taken = voxels.block(x, layer, z) !== Block.air && voxels.block(x, layer, z) !== Block.water;
        if (!taken) free += 1;
        expect(blocks.get(`${x},${layer},${z}`)).toBe(taken ? undefined : Block.brick);
      }
    expect(blocks.size).toBe(free);
  });

  it('digs one layer of a rectangle and treats a short press as a tap', () => {
    const { voxels, tools, applied, pointAt } = setup();
    tools.set({ mode: 'dig' });
    pointAt(30.5, 30.5);
    tools.startDrag(1, 100, 100);
    expect(tools.endDrag(1, 103, 102)).toBeNull();
    expect(applied).toEqual([]);

    const layer = voxels.surfaceHeight(30.5, 30.5) - 1;
    tools.startDrag(2, 100, 100);
    pointAt(27.5, 30.5);
    tools.moveDrag(2, 60, 100);
    tools.endDrag(2, 60, 100);
    const blocks = blocksOf(applied);
    expect([...blocks.keys()].every((key) => key.endsWith(`,${layer},30`))).toBe(true);
    expect([...blocks.values()].every((block) => block === Block.air)).toBe(true);
    expect(blocks.size).toBeGreaterThan(0);
  });

  it('builds a wall from a side face and keeps a drag within 64 blocks a side', () => {
    const { voxels, tools, applied, pointAtSide, aimSide } = setup();
    const ground = voxels.surfaceHeight(50.5, 50.5);
    tools.set({ mode: 'stack', block: 'stone' });
    pointAtSide(50, ground - 1, 50);
    aimSide(ground + 0.5, 50.5);
    tools.startDrag(1, 100, 100);
    aimSide(ground + 3.5, 500);
    tools.moveDrag(1, 300, 20);
    tools.endDrag(1, 300, 20);
    const keys = [...blocksOf(applied).keys()].map((key) => key.split(',').map(Number));
    expect(keys.every(([x]) => x === 51)).toBe(true);
    expect(Math.max(...keys.map(([, y]) => y!))).toBe(ground + 3);
    expect(Math.max(...keys.map(([, , z]) => z!))).toBe(50 + MAX_DRAG_SPAN - 1);
  });

  it('a second finger ends the drag without changing blocks', () => {
    const { tools, applied, pointAt } = setup();
    pointAt(10.5, 20.5);
    tools.startDrag(1, 100, 100);
    pointAt(14.5, 22.5);
    tools.moveDrag(1, 160, 130);
    expect(tools.endDrag(1)).toBeNull();
    expect(applied).toEqual([]);
  });
});
