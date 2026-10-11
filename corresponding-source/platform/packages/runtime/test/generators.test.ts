import { WorldDocument, type ItemInstance } from '@genvr/contracts';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { BoxGeometry, type InstancedMesh } from 'three/webgpu';
import {
  buildGenerated,
  generatedBuildCount,
  hasGenerator,
  registerGenerator,
  registerGeneratorMaterial,
} from '../src/generators.js';
import { ItemsView, resolveItem, yawQuaternion } from '../src/items.js';
import { initPhysics, PhysicsWorld } from '../src/physics.js';

const BOX = 'genvr.core.tidewater.test-box';

beforeAll(async () => {
  await initPhysics();
});

const doc = (instances: ItemInstance[]) =>
  WorldDocument.parse({
    schemaVersion: 1,
    experienceId: 'x',
    version: 0,
    style: { base: 'realistic' },
    sizeTier: 'small',
    access: { mode: 'private' },
    environment: { sky: { preset: 'day' }, weather: { preset: 'clear' } },
    terrain: {},
    spawn: { position: [0, 1, 0] },
    instances,
  });

const box = (instanceId: string, x: number, params: Record<string, unknown> = {}): ItemInstance => ({
  instanceId,
  itemId: BOX,
  transform: { position: [x, 0, 0], rotation: yawQuaternion(0), scale: [1, 1, 1] },
  params,
});

describe('runtime generators (decision 130)', () => {
  it('the test box generator is registered by the runtime itself', () => {
    expect(hasGenerator('genvr.test-box')).toBe(true);
  });

  it('builds once per set of parameters and shares the build', () => {
    const build = vi.fn(() => ({
      levels: [[{ geometry: new BoxGeometry(1, 1, 1), material: 'test.shared' }]],
    }));
    registerGeneratorMaterial('test.shared', () => new (class {})() as never);
    registerGenerator('test.counted', { build });
    const a = buildGenerated('test.counted', { size: 2, seed: 3 });
    const b = buildGenerated('test.counted', { seed: 3, size: 2 });
    const c = buildGenerated('test.counted', { size: 3, seed: 3 });
    expect(a).toBe(b);
    expect(c).not.toBe(a);
    expect(build).toHaveBeenCalledTimes(2);
    expect(build).toHaveBeenNthCalledWith(1, { size: 2, seed: 3 }, 3);
  });

  it('gives null for a generator nobody registered', () => {
    expect(buildGenerated('no.such.generator', {})).toBeNull();
  });

  it('resolves a generated item with its defaults, and with the own parameters of an instance', () => {
    const plain = resolveItem(BOX, undefined, 'realistic', undefined, {});
    expect(plain.meshes).toHaveLength(1);
    expect(plain.bounds.min).toEqual([-0.5, 0, -0.5]);
    expect(plain.bounds.max).toEqual([0.5, 1, 0.5]);
    const wide = resolveItem(BOX, undefined, 'realistic', undefined, { width: 4, height: 2 });
    expect(wide.bounds.min[0]).toBeCloseTo(-2);
    expect(wide.bounds.max[0]).toBeCloseTo(2);
    expect(wide.bounds.max[1]).toBeCloseTo(2);
  });

  it('ignores parameters outside the limits (the server refuses them; old data still draws)', () => {
    const clamped = resolveItem(BOX, undefined, 'realistic', undefined, { width: 999 });
    expect(clamped.bounds.max[0]).toBeCloseTo(10);
  });

  it('draws instances with equal parameters in one batch and different ones apart', () => {
    const before = generatedBuildCount();
    const physics = new PhysicsWorld();
    const view = new ItemsView(physics, (itemId, params) =>
      resolveItem(itemId, undefined, 'realistic', undefined, params),
    );
    view.sync(doc([box('b1', 0, { width: 2 }), box('b2', 3, { width: 2 }), box('b3', 6, { width: 5 })]));
    const batches = view.group.children as InstancedMesh[];
    expect(batches).toHaveLength(2);
    expect(batches.map((mesh) => mesh.count).sort()).toEqual([1, 2]);
    // Two new parameter sets, each built once (b1 and b2 share theirs).
    expect(generatedBuildCount() - before).toBeLessThanOrEqual(2);
    // Each instance collides with the box of its own parameters.
    expect(view.model(BOX, { width: 5 }).bounds.max[0]).toBeCloseTo(2.5);
    expect(view.instanceIdAt(batches.find((mesh) => mesh.count === 1)!.name, 0)).toBe('b3');
  });

  it('keeps ordinary items in one batch per item, whatever params they carry', () => {
    const physics = new PhysicsWorld();
    const view = new ItemsView(physics);
    const crate = (id: string, params: Record<string, unknown>): ItemInstance => ({
      ...box(id, 0, params),
      itemId: 'genvr.core.crate',
    });
    view.sync(doc([crate('c1', { width: 2 }), crate('c2', { width: 9 })]));
    expect(view.group.children).toHaveLength(1);
  });
});
