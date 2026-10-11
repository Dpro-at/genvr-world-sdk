import { WorldDocument, type CommandPayload, type ItemInstance } from '@genvr/contracts';
import { describe, expect, it } from 'vitest';
import { isResting, regionOf, restingBefore, settleChain, SurfaceIndex, type RestShape } from '../src/index.js';

const doc = (instances: ItemInstance[]) =>
  WorldDocument.parse({
    schemaVersion: 1,
    experienceId: 'x',
    version: 0,
    style: { base: 'blocky' },
    sizeTier: 'small',
    access: { mode: 'private' },
    environment: { sky: { preset: 'day' }, weather: { preset: 'clear' } },
    terrain: {},
    spawn: { position: [50, 1, 50] },
    instances,
  });
const at = (id: string, itemId: string, x: number, y: number, z: number): ItemInstance => ({
  instanceId: id,
  itemId,
  transform: { position: [x, y, z], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
  params: {},
});
const shapes: Record<string, RestShape> = {
  tree: { min: [-0.3, 0, -0.3], max: [0.3, 4, 0.3], rule: { mode: 'upright', sink: 0.3 }, rooted: true },
  bench: { min: [-0.5, 0, -0.3], max: [0.5, 0.8, 0.3], rule: { mode: 'upright', sink: 0.05 } },
};
const shapeOf = (id: string) => shapes[id] ?? null;
const itemShape = (id: string) =>
  shapes[id]
    ? {
        ...shapes[id]!,
        part: false,
        solid: true,
        min: shapes[id]!.min as unknown as [number, number, number],
        max: shapes[id]!.max as unknown as [number, number, number],
      }
    : null;

/** New hills from a Real place build: a set_heights tile over (0, 0). */
const hills: CommandPayload = {
  type: 'set_heights',
  params: { x0: -8, z0: -8, cols: 9, rows: 9, step: 2, base: 0, heights: '' },
};

function settle(instances: ItemInstance[], ground: { h: number }, next: number) {
  const d = doc(instances);
  const surfaces = new SurfaceIndex(d, { groundAt: () => ground.h, itemShape });
  const region = regionOf(hills, d, shapeOf);
  expect(region).not.toEqual([]);
  const resting = restingBefore(d, region as never, shapeOf, surfaces);
  ground.h = next;
  const fresh = new SurfaceIndex(d, { groundAt: () => ground.h, itemShape });
  settleChain(d, shapeOf, fresh, resting, (command) => {
    if (command.type !== 'transform_item') throw new Error(`unexpected ${command.type}`);
    const instance = d.instances.find((i) => i.instanceId === command.params.instanceId)!;
    if (command.params.position) instance.transform.position = command.params.position;
    if (command.params.rotation) instance.transform.rotation = command.params.rotation;
    fresh.update(instance, instance.instanceId);
  });
  return { d, surfaces: fresh };
}

describe('rooted trees (owner, 2026-10-07)', () => {
  it('new hills set a tree down on the lower ground instead of leaving it floating', () => {
    const ground = { h: 0 };
    const { d, surfaces } = settle([at('t', 'tree', 0, 0, 0)], ground, -2.5);
    const tree = d.instances[0]!;
    expect(isResting(tree, shapes.tree!, surfaces)).toBe(true);
    expect(tree.transform.position[1]).toBeCloseTo(-2.5, 2);
  });

  it('new hills lift a tree out of the higher ground instead of burying it', () => {
    const ground = { h: 0 };
    const { d } = settle([at('t', 'tree', 0, 0, 0)], ground, 1.2);
    expect(d.instances[0]!.transform.position[1]).toBeCloseTo(1.2, 2);
  });

  it('a tree a few centimetres off the ground is still rooted', () => {
    const ground = { h: 0 };
    const { d } = settle([at('t', 'tree', 0, -0.03, 0)], ground, -1);
    expect(d.instances[0]!.transform.position[1]).toBeCloseTo(-1, 2);
  });

  it('one ground law: a bench up to half a metre off follows the ground, one put higher on purpose stays', () => {
    const ground = { h: 0 };
    const { d } = settle([at('near', 'bench', 3, 0.3, 0), at('high', 'bench', -3, 1.5, 0)], ground, -1);
    expect(d.instances.find((i) => i.instanceId === 'near')!.transform.position[1]).toBeCloseTo(-1, 2);
    expect(d.instances.find((i) => i.instanceId === 'high')!.transform.position[1]).toBe(1.5);
  });
});
