/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GenvrManifest, WorldDocument, type ItemInstance, type ItemPackage } from '@genvr/contracts';
import {
  InstancedMesh,
  Matrix4,
  Vector3,
  type BufferGeometry,
  type Mesh,
  type MeshStandardMaterial,
} from 'three/webgpu';
import { beforeAll, describe, expect, it } from 'vitest';
import { ItemPackages, mergedPackageGeometry } from '../src/item-packages.js';
import { ItemsView, MAX_ANIMATED_ITEMS, resolveItem, type ItemLoopEvent } from '../src/items.js';
import { initPhysics, PhysicsWorld } from '../src/physics.js';

// The generated development package (platform/apps/api/dev-packages, P2-16 slice b).
const BALL = join(import.meta.dirname, '..', '..', '..', 'apps', 'api', 'dev-packages', 'bouncing-ball');
const manifest = GenvrManifest.parse(JSON.parse(readFileSync(join(BALL, 'manifest.json'), 'utf8')));
const glb = readFileSync(join(BALL, 'model.glb'));
const ballPackage: ItemPackage = {
  id: manifest.id,
  manifest,
  files: [
    { path: 'model.glb', url: 'mem://model.glb', size: glb.length, contentType: 'model/gltf-binary' },
    { path: 'audio/bounce.wav', url: 'mem://bounce.wav', size: 1, contentType: 'audio/wav' },
  ],
};

let fetches = 0;
const packages = () =>
  new ItemPackages(
    async (itemId) => {
      fetches += 1;
      return itemId === manifest.id ? ballPackage : null;
    },
    {},
    async () => glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.length),
  );

beforeAll(async () => {
  await initPhysics();
});

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
    spawn: { position: [0, 1, 0] },
    instances,
  });

const place = (instanceId: string, x: number): ItemInstance => ({
  instanceId,
  itemId: manifest.id,
  transform: { position: [x, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
  params: {},
});

describe('glTF item packages (P2-16 slice c)', () => {
  it('loads a package once and gives its meshes, bounds, clips and sounds', async () => {
    fetches = 0;
    const store = packages();
    expect(store.get(manifest.id)).toBeNull(); // loading
    const loaded = await store.whenSettled(manifest.id);
    store.get(manifest.id);
    expect(fetches).toBe(1);
    expect(loaded!.meshes).toHaveLength(1);
    expect(loaded!.bounds.min[1]).toBeCloseTo(0);
    expect(loaded!.bounds.max[1]).toBeCloseTo(0.8);
    expect(loaded!.animations.map((clip) => clip.name)).toEqual(['idle']);
    expect(loaded!.sounds).toEqual({ bounce: 'mem://bounce.wav' });
    const merged = mergedPackageGeometry(loaded!.meshes);
    expect(merged.getAttribute('color').count).toBe(merged.getAttribute('position').count);
  });

  it('items without a package stay missing', async () => {
    const store = packages();
    expect(await store.whenSettled('user.someone.nothing')).toBeNull();
    expect(store.isMissing('user.someone.nothing')).toBe(true);
    expect(resolveItem('user.someone.nothing', store).name).toBe('Missing item');
  });

  it('draws the placeholder first, then the model with instancing and a collider from its bounds', async () => {
    const store = packages();
    const physics = new PhysicsWorld();
    const view = new ItemsView(physics, (itemId) => resolveItem(itemId, store));
    const world = doc([place('b1', 0), place('b2', 3)]);
    // Without its animation the ball is a still model, drawn with instancing.
    store.onLoaded((itemId) => {
      store.get(itemId)!.animations.length = 0;
      view.reload(itemId, world);
    });
    view.sync(world);
    expect(view.model(manifest.id).name).toBe('Missing item');

    await store.whenSettled(manifest.id);
    expect(view.model(manifest.id).name).toBe('Bouncing Ball');
    const [mesh] = view.group.children as InstancedMesh[];
    expect(view.group.children).toHaveLength(1);
    expect(mesh!.count).toBe(2);
    // The second ball sits at x = 3 with the mesh's own place in the model (y = 0.4).
    const matrix = new Matrix4();
    mesh!.getMatrixAt(1, matrix);
    const position = new Vector3().setFromMatrixPosition(matrix);
    expect(position.toArray()).toEqual([3, expect.closeTo(0.4), 0]);
    expect(view.instanceIdAt(mesh!.name, 1)).toBe('b2');
    expect(physics.structureKeys.sort()).toEqual(['item:b1', 'item:b2']);
    expect(
      view.previewMesh(manifest.id, view.material).geometry.getAttribute('position').count,
    ).toBeGreaterThan(100);
    view.dispose();
    physics.dispose();
    store.dispose();
  });

  it('animated items move as their own copies and sound at every loop (slice d)', async () => {
    const store = packages();
    await store.whenSettled(manifest.id);
    const physics = new PhysicsWorld();
    const view = new ItemsView(physics, (itemId) => resolveItem(itemId, store));
    const loops: ItemLoopEvent[] = [];
    view.onItemLoop = (event) => loops.push(event);
    view.sync(doc([place('b1', 0), place('b2', 3)]));
    expect(view.animatedCount).toBe(2);
    expect(view.group.children.some((child) => child instanceof InstancedMesh)).toBe(false);
    expect(physics.structureKeys.sort()).toEqual(['item:b1', 'item:b2']);
    const ball = view.group.children[1]!.getObjectByName('ball');
    expect(view.instanceIdAt(ball!, undefined)).toBe('b2');

    // The bounce lifts the ball, and one loop (1 s) plays the bounce sound where the ball is.
    view.update(0.5);
    expect(view.group.children[1]!.children[0]!.position.y).toBeGreaterThan(0.9);
    view.update(0.6);
    expect(loops.map((event) => [event.instanceId, event.sound])).toEqual([
      ['b1', 'mem://bounce.wav'],
      ['b2', 'mem://bounce.wav'],
    ]);
    expect(loops[1]!.position.x).toBeCloseTo(3);

    view.sync(doc([place('b2', 3)]));
    expect(view.animatedCount).toBe(1);
    view.dispose();
    physics.dispose();
    store.dispose();
  });

  it('tints moving copies one by one with the item color', async () => {
    const store = packages();
    await store.whenSettled(manifest.id);
    const physics = new PhysicsWorld();
    const view = new ItemsView(physics, (itemId) => resolveItem(itemId, store));
    const colorOf = (index: number) =>
      (
        view.group.children[index]!.getObjectByName('ball') as Mesh<BufferGeometry, MeshStandardMaterial>
      ).material.color.getHexString();
    view.sync(doc([place('b1', 0), place('b2', 3)]));
    const own = colorOf(0);
    view.sync(doc([{ ...place('b1', 0), params: { color: '#00ff00' } }, place('b2', 3)]));
    // Green times the model's color on the first ball only; the second keeps its own colors.
    expect(colorOf(0)).not.toBe(own);
    expect(colorOf(0).slice(0, 2)).toBe('00');
    expect(colorOf(1)).toBe(own);
    view.sync(doc([{ ...place('b1', 0), params: { color: '#ffffff' } }, place('b2', 3)]));
    expect(colorOf(0)).toBe(own);
    view.dispose();
    physics.dispose();
    store.dispose();
  });

  it('draws copies beyond the moving cap still', async () => {
    const store = packages();
    await store.whenSettled(manifest.id);
    const physics = new PhysicsWorld();
    const view = new ItemsView(physics, (itemId) => resolveItem(itemId, store));
    view.sync(doc(Array.from({ length: MAX_ANIMATED_ITEMS + 3 }, (_, i) => place(`b${i}`, i))));
    expect(view.animatedCount).toBe(MAX_ANIMATED_ITEMS);
    const still = view.group.children.find((child) => child instanceof InstancedMesh) as InstancedMesh;
    expect(still.count).toBe(3);
    view.dispose();
    physics.dispose();
    store.dispose();
  });
});
