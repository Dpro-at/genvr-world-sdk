import { WorldDocument, type ItemInstance } from '@genvr/contracts';
import { beforeAll, describe, expect, it } from 'vitest';
import { BoxGeometry, Group, InstancedMesh, Matrix4, MeshStandardMaterial, Ray, Vector3 } from 'three/webgpu';
import { ItemsView, resolveItem, type ItemModel } from '../src/items.js';
import { initPhysics, PhysicsWorld } from '../src/physics.js';
beforeAll(initPhysics);
const place = (id: string, x: number): ItemInstance => ({ instanceId: id, itemId: 'test.palm',
  transform: { position: [x, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] }, params: {} });
const doc = (instances: ItemInstance[]) => WorldDocument.parse({ schemaVersion: 1, experienceId: 'test', version: 0,
  style: { base: 'realistic' }, sizeTier: 'small', access: { mode: 'private' }, environment: { sky: { preset: 'day' }, weather: { preset: 'clear' } },
  terrain: {}, spawn: { position: [0, 1, 0] }, instances });
function fixture(ranged = true) {
  const geometry = new BoxGeometry(1, 1, 1), material = new MeshStandardMaterial(), meshes: InstancedMesh[] = [];
  const part = { geometry, material, matrix: new Matrix4(), setupInstance: (mesh: InstancedMesh) => { meshes.push(mesh); } };
  const model: ItemModel = { ...resolveItem('test.palm'), bounds: { min: [-.5, 0, -.5], max: [.5, 1, .5] },
    meshes: [part], lods: [[part]], ...(ranged ? { lodResidency: { ranges: [[0, 137.2], [102.8, 2810]] as const, refreshDistance: 6 } } : {}) };
  const physics = new PhysicsWorld(), view = new ItemsView(physics, () => model);
  return { model, view, meshes, dispose: () => { view.dispose(); physics.dispose(); geometry.dispose(); material.dispose(); } };
}

describe('opt-in procedural LOD residency', () => {
  it('keeps both levels across a padded source cross-fade and preserves IDs and picking', () => {
    const f = fixture(); f.view.sync(doc([place('near', 0), place('cross', 120), place('far', 200), place('outside', 3000)]));
    f.view.updateProceduralLod(new Vector3());
    expect(f.meshes.map(m => m.count)).toEqual([2, 2]);
    expect(f.meshes.map(m => Array.from({ length: m.count }, (_, i) => f.view.instanceIdAt(m, i))))
      .toEqual([['near', 'cross'], ['cross', 'far']]);
    expect(f.view.pick(new Ray(new Vector3(120, .5, 5), new Vector3(0, 0, -1)))).toBe('cross');
    f.dispose();
  });
  it('refills only after camera threshold and refreshes edited instances with the last residency camera', () => {
    const f = fixture(); f.view.sync(doc([place('palm', 120)])); f.view.updateProceduralLod(new Vector3());
    const versions = f.meshes.map(m => m.instanceMatrix.version);
    f.view.updateProceduralLod(new Vector3(5, 0, 0));
    expect(f.meshes.map(m => m.instanceMatrix.version)).toEqual(versions);
    f.view.updateProceduralLod(new Vector3(40, 0, 0));
    expect(f.meshes.map(m => m.count)).toEqual([1, 0]);
    f.view.sync(doc([place('palm', 200)]));
    expect(f.meshes.map(m => m.count)).toEqual([0, 1]);
    const m = new Matrix4(); f.meshes[1]!.getMatrixAt(0, m);
    expect(new Vector3().setFromMatrixPosition(m).x).toBe(200);
    f.dispose();
  });
  it('uses three-dimensional distance and keeps default package LOD single-level', () => {
    const ranged = fixture(); ranged.view.sync(doc([place('one', 0)]));
    ranged.view.updateLod(new Vector3(0, 200, 0));
    expect(ranged.meshes.map(m => m.count)).toEqual([0, 1]); ranged.dispose();
    const ordinary = fixture(false); ordinary.view.sync(doc([place('one', 120)]));
    ordinary.view.updateProceduralLod(new Vector3());
    expect(ordinary.meshes.map(m => m.count)).toEqual([1, 0]);
    ordinary.view.updateLod(new Vector3());
    expect(ordinary.meshes.map(m => m.count)).toEqual([0, 1]); ordinary.dispose();
  });
  it('rejects inconsistent level metadata before allocating batches', () => {
    const f = fixture(); f.model.lodResidency = { ranges: [[0, 120]], refreshDistance: 6 };
    expect(() => f.view.sync(doc([place('one', 0)]))).toThrow('residency'); expect(f.meshes).toHaveLength(0); f.dispose();
  });
  it('retains camera residency on capacity growth and before the first type is added', () => {
    const f = fixture(); f.view.updateProceduralLod(new Vector3(200, 0, 0));
    f.view.sync(doc([place('first', 0)]));
    expect(f.meshes.map(m => m.count)).toEqual([0, 1]);
    f.view.updateProceduralLod(new Vector3(210, 0, 0));
    f.view.sync(doc(Array.from({ length: 9 }, (_, i) => place('p' + i, i))));
    expect(f.meshes.slice(-2).map(m => m.count)).toEqual([0, 9]);
    expect(f.view.instanceIdAt(f.meshes.at(-1)!, 8)).toBe('p8'); f.dispose();
  });
  it('rejects animated models at resolution rather than bypassing the instanced checks', () => {
    const f = fixture(); f.model.animation = { scene: new Group(), clips: [] };
    expect(() => f.view.sync(doc([place('one', 0)]))).toThrow('residency'); f.dispose();
  });
});
