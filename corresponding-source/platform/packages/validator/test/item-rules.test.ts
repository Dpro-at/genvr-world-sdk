import { WorldDocument, type ItemInstance, type PlacementRules } from '@genvr/contracts';
import { describe, expect, it } from 'vitest';
import { documentEnvironment, ruleReport, validateWorld } from '../src/index.js';

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
    spawn: { position: [90, 1, 90] },
    instances,
  });

const at = (
  instanceId: string,
  itemId: string,
  position: [number, number, number],
  rotation: [number, number, number, number] = [0, 0, 0, 1],
): ItemInstance => ({ instanceId, itemId, transform: { position, rotation, scale: [1, 1, 1] }, params: {} });

const RULES: Record<string, PlacementRules> = {
  tree: { stands: ['ground'], soils: ['grass', 'dirt'], maxTilt: 10, maxSlope: 30 },
  bench: { stands: ['ground', 'built'], maxTilt: 5, clearFront: 0.8 },
};
const SHAPES: Record<string, { min: [number, number, number]; max: [number, number, number] }> = {
  tree: { min: [-0.5, 0, -0.5], max: [0.5, 4, 0.5] },
  bench: { min: [-1, 0, -0.25], max: [1, 0.8, 0.25] },
  crate: { min: [-0.5, 0, -0.5], max: [0.5, 1, 0.5] },
};

/** Flat grass with a sand beach at x > 40, a pond at x < -40, and a ramp at 20 < z < 30. */
function env(world: WorldDocument) {
  return documentEnvironment(world, {
    groundAt: (_x, z) => (z > 20 && z < 30 ? (z - 20) * 1.5 : 0),
    waterAt: (x) => (x < -40 ? 1.5 : null),
    soilAt: (x) => (x > 40 ? 'sand' : 'grass'),
    itemShape: (itemId) => (SHAPES[itemId] ? { ...SHAPES[itemId]!, solid: true, part: false } : null),
    itemRules: (itemId) => RULES[itemId] ?? null,
    itemName: (itemId) => itemId,
  });
}
const messages = (world: WorldDocument) =>
  validateWorld(world, env(world))
    .findings.filter((f) => f.code === 'rule')
    .map((f) => f.message);

const tilt = (degrees: number): [number, number, number, number] => {
  const half = (degrees * Math.PI) / 360;
  return [Math.sin(half), 0, 0, Math.cos(half)];
};

describe('item placement rules (P2-11, owner note)', () => {
  it('keeps a tree on grass and reports soil, water, built things, lean, and slope', () => {
    expect(messages(doc([at('t', 'tree', [0, 0, 0])]))).toEqual([]);
    expect(messages(doc([at('t', 'tree', [50, 0, 0])]))).toEqual([
      'tree needs grass or dirt; it stands on sand.',
    ]);
    expect(messages(doc([at('t', 'tree', [-50, 1.5, 0])]))).toEqual([
      'tree stands in water; it belongs on the ground.',
    ]);
    expect(messages(doc([at('c', 'crate', [0, 0, 0]), at('t', 'tree', [0, 1, 0])]))).toEqual([
      'tree stands on a built thing; it belongs on the ground.',
    ]);
    expect(messages(doc([at('t', 'tree', [0, 0, 0], tilt(30))]))).toEqual([
      'tree leans 30°; it should lean at most 10°.',
    ]);
    expect(messages(doc([at('t', 'tree', [0, 7.5, 25])]))).toEqual([
      'The ground under tree is 56° steep; it needs at most 30°.',
    ]);
  });

  it('does not call a tree "in the way" of a bench under its crown (2026-09-29)', () => {
    const crowned = (world: WorldDocument) =>
      documentEnvironment(world, {
        groundAt: () => 0,
        soilAt: () => 'grass',
        itemShape: (itemId) =>
          itemId === 'tree'
            ? {
                min: [-9, 0, -9],
                max: [9, 20, 9],
                blocks: { min: [-0.5, 0, -0.5], max: [0.5, 20, 0.5] },
                solid: true,
                part: false,
              }
            : SHAPES[itemId]
              ? { ...SHAPES[itemId]!, solid: true, part: false }
              : null,
        itemRules: (itemId) => RULES[itemId] ?? null,
        itemName: (itemId) => itemId,
      });
    const front = (world: WorldDocument) =>
      validateWorld(world, crowned(world))
        .findings.filter((f) => f.code === 'rule')
        .map((f) => f.message);
    // The bench faces +z; the tree's trunk is 4 m away, its crown over the bench.
    expect(front(doc([at('b', 'bench', [0, 0, 0]), at('t', 'tree', [0, 0, 4])]))).toEqual([]);
    // Its trunk right in front still is in the way.
    expect(front(doc([at('b', 'bench', [0, 0, 0]), at('t', 'tree', [0, 0, 0.8])]))).toEqual([
      expect.stringContaining('tree is in the way'),
    ]);
  });

  it('stands a leaning item up again, keeping its turn', () => {
    const world = doc([at('t', 'tree', [0, 0, 0], tilt(30))]);
    const [finding] = validateWorld(world, env(world)).findings;
    expect(finding!.fix).toEqual([
      { type: 'transform_item', params: { instanceId: 't', rotation: [0, 0, 0, 1] } },
    ]);
  });

  it('needs free space in front of a bench, and lets it stand on a crate', () => {
    expect(messages(doc([at('b', 'bench', [0, 0, 0])]))).toEqual([]);
    expect(messages(doc([at('b', 'bench', [0, 0, 0]), at('c', 'crate', [0, 0, 1])]))).toEqual([
      'bench needs 0.8 m of free space in front; crate is in the way.',
    ]);
    expect(messages(doc([at('c', 'crate', [0, 0, 5]), at('b', 'bench', [0, 1, 5])]))).toEqual([]);
  });

  it('reports every rule with kept or broken for the debug view', () => {
    const world = doc([at('t', 'tree', [50, 0, 0])]);
    const report = ruleReport(world, env(world), world.instances[0]!)!;
    expect(report.map((r) => [r.rule, r.ok])).toEqual([
      ['tilt', true],
      ['stands', true],
      ['soil', false],
      ['slope', true],
    ]);
    expect(report[0]!.label).toBe('Upright (leans at most 10°)');
    expect(ruleReport(world, env(world), at('x', 'crate', [0, 0, 0]))).toBeNull();
  });
});
