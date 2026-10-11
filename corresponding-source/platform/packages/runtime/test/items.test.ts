import { WorldDocument, type ItemInstance } from '@genvr/contracts';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  AnimationClip,
  BufferGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  Vector3,
  VectorKeyframeTrack,
  type Object3D,
} from 'three/webgpu';
import {
  itemColliderBox,
  itemGeometry,
  ItemsView,
  resolveItem,
  yawOf,
  yawQuaternion,
  type ItemModel,
} from '../src/items.js';
import { initPhysics, PhysicsWorld } from '../src/physics.js';
import { SurfaceIndex, type RestShape } from '@genvr/validator';

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

const place = (instanceId: string, itemId: string, x: number, z: number, yaw = 0): ItemInstance => ({
  instanceId,
  itemId,
  transform: { position: [x, 0, z], rotation: yawQuaternion(yaw), scale: [1, 1, 1] },
  params: {},
});

describe('items', () => {
  it('builds one merged, colored geometry per item', () => {
    const geometry = itemGeometry(resolveItem('genvr.core.tree.pine').parts);
    expect(geometry.getAttribute('position').count).toBeGreaterThan(20);
    expect(geometry.getAttribute('color').count).toBe(geometry.getAttribute('position').count);
  });

  it('draws Core items in the look of the place style (cube trees in Voxel places)', () => {
    const blocky = resolveItem('genvr.core.tree.round', undefined, 'blocky');
    const voxel = resolveItem('genvr.core.tree.round', undefined, 'voxel');
    expect(blocky.parts.some((part) => part.shape === 'sphere')).toBe(true);
    expect(voxel.parts.every((part) => part.shape === 'box')).toBe(true);
    expect(voxel.parts.length).toBeGreaterThan(20);
    expect(voxel.bounds.min[1]).toBeCloseTo(0, 5);
    // Items without a Voxel look keep their parts.
    expect(resolveItem('genvr.core.part.box', undefined, 'voxel').parts).toBe(
      resolveItem('genvr.core.part.box').parts,
    );
  });

  it('unknown items render as a placeholder box instead of failing', () => {
    expect(resolveItem('store.someone.unknown').name).toBe('Missing item');
  });

  it('turns quarter turns into quaternions and back', () => {
    expect(yawOf(yawQuaternion(Math.PI / 2))).toBeCloseTo(Math.PI / 2);
  });

  it('rotates the collider box with the item', () => {
    const bench = resolveItem('genvr.core.bench');
    const straight = itemColliderBox(bench, place('a', 'genvr.core.bench', 0, 0));
    const turned = itemColliderBox(bench, place('a', 'genvr.core.bench', 0, 0, Math.PI / 2));
    expect(straight.half[0]).toBeCloseTo(1);
    expect(turned.yaw).toBeCloseTo(Math.PI / 2);
  });

  it('collides a tree at its trunk, not its crown, so players can walk under it (2026-09-29)', () => {
    const bench = resolveItem('genvr.core.bench');
    const tree = {
      ...bench,
      bounds: { min: [-9, 0, -9] as [number, number, number], max: [9, 22, 9] as [number, number, number] },
      blocks: {
        min: [-0.5, 0, 1] as [number, number, number],
        max: [0.5, 22, 2] as [number, number, number],
      },
    };
    const box = itemColliderBox(tree, place('t', 'genvr.core.bench', 10, 20));
    expect(box.half[0]).toBeCloseTo(0.5);
    expect(box.half[2]).toBeCloseTo(0.5);
    // The trunk is where the model has it, off the item's origin.
    expect(box.center[0]).toBeCloseTo(10);
    expect(box.center[2]).toBeCloseTo(21.5);
  });

  it('draws one instanced mesh per item type and maps picks back to instances', () => {
    const physics = new PhysicsWorld();
    const view = new ItemsView(physics);
    view.sync(
      doc([
        place('c1', 'genvr.core.crate', 0, 0),
        place('c2', 'genvr.core.crate', 3, 0),
        place('f1', 'genvr.core.flower', 6, 0),
      ]),
    );
    expect(view.group.children).toHaveLength(2);
    expect(view.instanceIdAt('items:genvr.core.crate', 1)).toBe('c2');
    // Flowers have no collider; crates do.
    expect(physics.structureKeys.sort()).toEqual(['item:c1', 'item:c2']);

    view.sync(doc([place('c2', 'genvr.core.crate', 3, 0)]));
    expect(view.group.children).toHaveLength(1);
    expect(physics.structureKeys).toEqual(['item:c2']);
    view.dispose();
    physics.dispose();
  });

  it('draws a live item on its own, out of its batch, and puts it back (movement modes, R3)', () => {
    const physics = new PhysicsWorld();
    const view = new ItemsView(physics);
    const world = doc([
      { ...place('c1', 'genvr.core.crate', 0, 0), params: { ride: 'ground' } },
      place('c2', 'genvr.core.crate', 3, 0),
    ]);
    view.sync(world);
    const batch = () => view.group.getObjectByName('items:genvr.core.crate') as InstancedMesh;
    expect(batch().count).toBe(2);
    view.setLivePose('c1', { x: 10, y: 0, z: 5, yaw: 1 });
    // One copy in the batch and one of its own: never drawn twice, never missing.
    expect(batch().count).toBe(1);
    expect(view.instanceIdAt('items:genvr.core.crate', 0)).toBe('c2');
    const own = view.group.getObjectByName('items:live:c1') as InstancedMesh;
    expect(own.count).toBe(1);
    const matrix = new Matrix4();
    own.getMatrixAt(0, matrix);
    expect(new Vector3().setFromMatrixPosition(matrix).toArray()).toEqual([10, 0, 5]);
    // Its placed box collider goes; a moving box takes its place.
    expect(physics.structureKeys).toEqual(['item:c2']);
    expect(view.liveCollider('c1')).not.toBeNull();
    // Moving it only moves its own copy.
    view.setLivePose('c1', { x: 12, y: 0, z: 5, yaw: 1 });
    own.getMatrixAt(0, matrix);
    expect(new Vector3().setFromMatrixPosition(matrix).x).toBeCloseTo(12);
    expect(view.livePose('c1')).toMatchObject({ x: 12, z: 5 });
    // The item the local player steers has no moving box here (the rider's controller has one).
    view.setLivePose('c1', { x: 12, y: 0, z: 5, yaw: 1 }, false);
    expect(view.liveCollider('c1')).toBeNull();
    view.setLivePose('c1', null);
    expect(batch().count).toBe(2);
    expect(view.group.getObjectByName('items:live:c1')).toBeUndefined();
    expect(physics.structureKeys.sort()).toEqual(['item:c1', 'item:c2']);
    expect(view.livePose('c1')).toMatchObject({ x: 0, z: 0 });
    view.dispose();
    physics.dispose();
  });

  it('finds the nearest rideable item in reach and its seats box', () => {
    const physics = new PhysicsWorld();
    const view = new ItemsView(physics);
    view.sync(
      doc([
        { ...place('far', 'genvr.core.crate', 20, 0), params: { ride: 'ground' } },
        { ...place('near', 'genvr.core.crate', 3, 0), params: { ride: 'water', rideReach: 5 } },
        place('plain', 'genvr.core.crate', 1, 0),
      ]),
    );
    expect(view.rideableNear({ x: 0, y: 0, z: 0 })?.instanceId).toBe('near');
    expect(view.rideableNear({ x: 0, y: 0, z: 0 })?.ride.model).toBe('water');
    expect(view.rideableNear({ x: -10, y: 0, z: 0 })).toBeNull();
    // A live pose moves where it can be reached from.
    view.setLivePose('far', { x: -9, y: 0, z: 0, yaw: 0 });
    expect(view.rideableNear({ x: -10, y: 0, z: 0 })?.instanceId).toBe('far');
    const bounds = view.itemBounds('near')!;
    expect(bounds.max.y).toBeGreaterThan(bounds.min.y);
    expect(view.rideOf('plain')).toBeNull();
    view.dispose();
    physics.dispose();
  });

  it('hides the map markers of the rules while playing and shows them while building (P9-12)', () => {
    const physics = new PhysicsWorld();
    const view = new ItemsView(physics);
    const world = doc([
      place('c1', 'genvr.core.crate', 0, 0),
      place('s1', 'genvr.core.gameplay.spawn-point', 3, 0),
    ]);
    view.sync(world);
    expect(view.group.children).toHaveLength(2);
    view.setMarkersVisible(false, world);
    expect(view.group.children).toHaveLength(1);
    expect(view.instanceIdAt('items:genvr.core.crate', 0)).toBe('c1');
    // Later edits keep them hidden until building again.
    view.sync(world);
    expect(view.group.children).toHaveLength(1);
    view.setMarkersVisible(true, world);
    expect(view.group.children).toHaveLength(2);
    view.dispose();
    physics.dispose();
  });

  it('hides every marker kind of the rules while playing: spawn points and zone items', () => {
    const physics = new PhysicsWorld();
    const view = new ItemsView(physics);
    const world = doc([
      place('c1', 'genvr.core.crate', 0, 0),
      place('s1', 'genvr.core.gameplay.spawn-point', 3, 0),
      place('k1', 'genvr.core.gameplay.zone-gate', 6, 0),
      place('f1', 'genvr.core.gameplay.zone-area', 9, 0),
    ]);
    view.sync(world);
    expect(view.group.children).toHaveLength(4);
    view.setMarkersVisible(false, world);
    expect(view.group.children).toHaveLength(1);
    view.setMarkersVisible(true, world);
    expect(view.group.children).toHaveLength(4);
    view.dispose();
    physics.dispose();
  });

  it('keeps zone items the designer marked visible in play (zoneVisible) while playing', () => {
    const physics = new PhysicsWorld();
    const view = new ItemsView(physics);
    const shown = (instance: ItemInstance, params: Record<string, unknown>) => ({ ...instance, params });
    const world = doc([
      place('s1', 'genvr.core.gameplay.spawn-point', 3, 0),
      shown(place('k1', 'genvr.core.gameplay.zone-gate', 6, 0), { zoneTag: 'toll', zoneVisible: true }),
      shown(place('f1', 'genvr.core.gameplay.zone-area', 9, 0), { zoneTag: 'depot', zoneVisible: true }),
      shown(place('f2', 'genvr.core.gameplay.zone-area', 12, 0), { zoneTag: 'secret' }),
      // Not a zone without a tag: hidden like any marker.
      shown(place('f3', 'genvr.core.gameplay.zone-area', 15, 0), { zoneVisible: true }),
    ]);
    view.sync(world);
    view.setMarkersVisible(false, world);
    const ids = new Set<string>();
    for (const child of view.group.children)
      for (let i = 0; i < ((child as InstancedMesh).count ?? 0); i += 1) {
        const id = view.instanceIdAt(child.name, i);
        if (id) ids.add(id);
      }
    expect([...ids].sort()).toEqual(['f1', 'k1']);
    view.dispose();
    physics.dispose();
  });

  it('moves far copies of a package model to its simpler LOD levels (decision 94)', () => {
    const physics = new PhysicsWorld();
    const material = new MeshStandardMaterial();
    const level = (segments: number) => [
      { geometry: new SphereGeometry(0.5, segments, segments), material, matrix: new Matrix4() },
    ];
    const model = {
      ...resolveItem('user.demo.rock'),
      name: 'Rock',
      bounds: { min: [-0.5, 0, -0.5], max: [0.5, 1, 0.5] } as ItemModel['bounds'],
      meshes: level(32),
      lods: [level(12), level(4)],
    };
    const view = new ItemsView(physics, () => model);
    view.sync(
      doc([
        place('near', 'user.demo.rock', 0, 0),
        place('middle', 'user.demo.rock', 40, 0),
        place('far', 'user.demo.rock', 100, 0),
      ]),
    );
    const meshes = view.group.children as InstancedMesh[];
    expect(meshes).toHaveLength(3);
    // Until the camera is known everything is the full model.
    expect(meshes.map((mesh) => mesh.count)).toEqual([3, 0, 0]);
    view.updateLod(new Vector3(0, 2, 0));
    expect(meshes.map((mesh) => mesh.count)).toEqual([1, 1, 1]);
    // Raycast hits on each level map back to the right copy.
    expect(meshes.map((mesh) => view.instanceIdAt(mesh, 0))).toEqual(['near', 'middle', 'far']);
    // Walking over to the far one swaps them.
    view.updateLod(new Vector3(95, 2, 0));
    expect(meshes.map((mesh) => view.instanceIdAt(mesh, 0))).toEqual(['far', 'middle', 'near']);
    view.dispose();
    physics.dispose();
  });

  it('moves far moving copies to simpler triangle lists and updates their animation less often', () => {
    const physics = new PhysicsWorld();
    const material = new MeshStandardMaterial();
    const full = new SphereGeometry(0.5, 32, 32);
    // Levels made by Genvr: the same vertices (and skin data), fewer triangles.
    const simpler = (keep: number) => {
      const geometry = new BufferGeometry();
      for (const [name, attribute] of Object.entries(full.attributes)) geometry.setAttribute(name, attribute);
      const index = full.getIndex()!;
      geometry.setIndex(
        [...(index.array as Uint16Array | Uint32Array)].slice(0, Math.floor((index.count * keep) / 3) * 3),
      );
      return geometry;
    };
    const levels = [simpler(0.35), simpler(0.1)];
    const scene = new Group();
    const part = new Mesh(full, material);
    part.name = 'part';
    scene.add(part);
    // One second of sliding one meter along x.
    const clip = new AnimationClip('idle', 1, [
      new VectorKeyframeTrack('part.position', [0, 1], [0, 0, 0, 1, 0, 0]),
    ]);
    const model: ItemModel = {
      ...resolveItem('user.demo.walker'),
      name: 'Walker',
      bounds: { min: [-0.5, 0, -0.5], max: [0.5, 1, 0.5] },
      meshes: [{ geometry: full, material, matrix: new Matrix4() }],
      lods: levels.map((geometry) => [{ geometry, material, matrix: new Matrix4() }]),
      animation: { scene, clips: [clip] },
    };
    const view = new ItemsView(physics, () => model);
    view.sync(doc([place('near', 'user.demo.walker', 0, 0), place('far', 'user.demo.walker', 100, 0)]));
    expect(view.animatedCount).toBe(2);
    const copies = new Map<string, Object3D>(
      (view.group.children as Object3D[]).map((root) => [root.userData.itemInstanceId as string, root]),
    );
    const mesh = (id: string) => copies.get(id)!.getObjectByName('part') as Mesh;
    // Until the camera is known both show the full model.
    expect(mesh('far').geometry).toBe(full);
    view.updateLod(new Vector3(0, 2, 0));
    expect(mesh('near').geometry).toBe(full);
    expect(mesh('far').geometry).toBe(levels[1]);
    // The far copy's animation moves every fourth frame, by the time of all four.
    view.update(0.1);
    expect(mesh('near').position.x).toBeCloseTo(0.1);
    expect(mesh('far').position.x).toBeCloseTo(0);
    for (let frame = 0; frame < 3; frame += 1) view.update(0.1);
    expect(mesh('far').position.x).toBeCloseTo(0.4);
    // Walking over swaps them back.
    view.updateLod(new Vector3(100, 2, 0));
    expect(mesh('far').geometry).toBe(full);
    expect(mesh('near').geometry).toBe(levels[1]);
    view.dispose();
    physics.dispose();
  });

  it('a placed crate blocks the character', () => {
    const physics = new PhysicsWorld();
    physics.addGround(50);
    const view = new ItemsView(physics);
    view.sync(doc([place('c1', 'genvr.core.crate', 0, 3)]));
    const character = physics.createCharacter({ x: 0, y: 0, z: 0 });
    for (let i = 0; i < 120; i += 1) character.move({ x: 0, z: 4 }, false, 7, 22, 1 / 60);
    expect(character.feet.z).toBeLessThan(3 - 0.5 - 0.3);
    physics.dispose();
  });

  it('finds the ladder the player touches, and lets the player walk into it (P2-23)', () => {
    const physics = new PhysicsWorld();
    physics.addGround(50);
    const view = new ItemsView(physics);
    // A ladder 3 m north, turned to face west (+x in its own space runs north-south).
    view.sync(doc([place('l1', 'genvr.core.ladder', 0, 3, Math.PI / 2)]));
    expect(view.model('genvr.core.ladder').climbable).toBe(true);
    const touching = view.climbableAt({ x: -0.3, y: 0, z: 3 });
    expect(touching?.instanceId).toBe('l1');
    expect(touching?.top).toBeCloseTo(3);
    expect(touching?.bottom).toBeCloseTo(0);
    expect(touching?.yaw).toBeCloseTo(Math.PI / 2);
    expect(touching?.x).toBeCloseTo(0);
    expect(touching?.z).toBeCloseTo(3);
    // Too far in front, beside it, or above its top.
    expect(view.climbableAt({ x: -0.6, y: 0, z: 3 })).toBeNull();
    expect(view.climbableAt({ x: 0, y: 0, z: 3.9 })).toBeNull();
    expect(view.climbableAt({ x: 0, y: 3.3, z: 3 })).toBeNull();
    // No collider: players walk into it.
    const character = physics.createCharacter({ x: 0, y: 0, z: 0 });
    for (let i = 0; i < 60; i += 1) character.move({ x: 0, z: 4 }, false, 7, 22, 1 / 60);
    expect(character.feet.z).toBeGreaterThan(3.5);
    view.dispose();
    physics.dispose();
  });
});

describe('settling items with physics (P2-11)', () => {
  it('lets items fall and come to rest on the ground and on each other', () => {
    const physics = new PhysicsWorld();
    physics.addGround(50);
    const view = new ItemsView(physics);
    const lifted = (instanceId: string, x: number, y: number): ItemInstance => ({
      ...place(instanceId, 'genvr.core.crate', x, 0),
      transform: { position: [x, y, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
    });
    const world = doc([
      lifted('low', 0, 3),
      lifted('high', 0.2, 6),
      place('still', 'genvr.core.crate', 5, 0),
    ]);
    view.sync(world);
    const rest = view.settle(world, ['low', 'high']);
    const at = (id: string) => rest.find((r) => r.instanceId === id)!.position;
    const height = resolveItem('genvr.core.crate').bounds.max[1];
    expect(at('low')[1]).toBeCloseTo(0, 1);
    expect(at('high')[1]).toBeCloseTo(height, 1); // on top of the other crate
    expect(rest.map((r) => r.instanceId)).toEqual(['low', 'high']); // "still" was not asked
    // The fixed boxes are back afterwards.
    expect(physics.structureKeys.sort()).toEqual(['item:high', 'item:low', 'item:still']);
    view.dispose();
    physics.dispose();
  });
});

describe('item picking', () => {
  it('hits the bounding box of thin items and returns the nearest', async () => {
    const { Ray, Vector3 } = await import('three/webgpu');
    const physics = new PhysicsWorld();
    const view = new ItemsView(physics);
    view.sync(doc([place('near', 'genvr.core.fence', 0, 5), place('far', 'genvr.core.fence', 0, 10)]));
    // Between the rails of the fence, still inside its box.
    const ray = new Ray(new Vector3(0.3, 0.6, 0), new Vector3(0, 0, 1));
    expect(view.pick(ray)).toBe('near');
    expect(view.pick(ray, 'near')).toBe('far');
    expect(view.pick(new Ray(new Vector3(0, 5, 0), new Vector3(0, 0, 1)))).toBeNull();
    physics.dispose();
  });
});

describe('scattered things and plinths follow what changed (P2-43 final review)', () => {
  const meshNamed = (view: ItemsView, name: string) =>
    view.group.children.find((child) => child.name.startsWith(name)) as InstancedMesh | undefined;
  const yOf = (mesh: InstancedMesh, index = 0) => {
    const matrix = new Matrix4();
    mesh.getMatrixAt(index, matrix);
    return matrix.elements[13]!;
  };

  it('redraws scattered things that were worked out again with the same ids but a new height', () => {
    const physics = new PhysicsWorld();
    const view = new ItemsView(physics);
    const world = doc([]);
    const tree = (y: number): ItemInstance => ({
      ...place('scatter:woods:1.00,1.00', 'genvr.core.crate', 1, 1),
      transform: { position: [1, y, 1], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
    });
    view.setScattered([tree(0)], world);
    expect(yOf(meshNamed(view, 'items:genvr.core.crate')!)).toBeCloseTo(0, 6);
    view.setScattered([tree(2)], world);
    expect(yOf(meshNamed(view, 'items:genvr.core.crate')!)).toBeCloseTo(2, 6);
    view.dispose();
    physics.dispose();
  });

  it('moves a plinth with its foundation item, without comparing every transform', () => {
    const physics = new PhysicsWorld();
    const view = new ItemsView(physics);
    const shape: RestShape = { min: [-1, 0, -1], max: [1, 1, 1], rule: { mode: 'foundation' } };
    const stall = (x: number, y: number): ItemInstance => ({
      ...place('s', 'genvr.core.crate', x, 0),
      transform: { position: [x, y, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
    });
    const groundAt = (x: number) => x * 0.2;
    let world = doc([stall(10, groundAt(11))]);
    view.setDrawContext({
      terrain: { heightAt: groundAt, drawnHeightAt: groundAt },
      stepAt: () => 1,
      stepVersion: () => 0,
      shapeOf: () => shape,
      surfaces: () => new SurfaceIndex(world, { groundAt, itemShape: () => null }),
      realistic: () => false,
    });
    view.sync(world);
    const first = yOf(meshNamed(view, 'items:plinths')!);
    world = doc([stall(20, groundAt(21))]);
    view.sync(world);
    const second = yOf(meshNamed(view, 'items:plinths')!);
    expect(second - first).toBeCloseTo(2, 3);
    view.dispose();
    physics.dispose();
  });
  it('works the plinths out again only when a placed item changed, not on every sync', () => {
    const physics = new PhysicsWorld();
    const view = new ItemsView(physics);
    const shape: RestShape = { min: [-1, 0, -1], max: [1, 1, 1], rule: { mode: 'foundation' } };
    const groundAt = (x: number) => x * 0.2;
    const world = doc([
      {
        ...place('s', 'genvr.core.crate', 10, 0),
        transform: { position: [10, groundAt(11), 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
      },
    ]);
    let asked = 0;
    view.setDrawContext({
      terrain: { heightAt: groundAt, drawnHeightAt: groundAt },
      stepAt: () => 1,
      stepVersion: () => 0,
      shapeOf: () => shape,
      surfaces: () => {
        asked += 1;
        return new SurfaceIndex(world, { groundAt, itemShape: () => null });
      },
      realistic: () => false,
    });
    view.sync(world);
    expect(asked).toBe(1);
    view.sync(world);
    view.setScattered([place('scatter:woods:1.00,1.00', 'genvr.core.crate', 1, 1)], world);
    expect(asked).toBe(1);
    world.instances[0]!.transform.position = [12, groundAt(13), 0];
    view.sync(world);
    expect(asked).toBe(2);
    view.dispose();
    physics.dispose();
  });
});
