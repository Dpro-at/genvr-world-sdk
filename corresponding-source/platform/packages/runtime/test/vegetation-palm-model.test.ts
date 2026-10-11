import { beforeAll, describe, expect, it } from 'vitest';
import { WorldDocument } from '@genvr/contracts';
import { DataTexture, DirectionalLight, InstancedMesh, TSL, Vector2, Vector3 } from 'three/webgpu';
import { ItemsView, resolveItem } from '../src/items.js';
import { PhysicsWorld, initPhysics } from '../src/physics.js';
import { PalmWorldBindings } from '../src/vegetation/palm-bindings.js';
import { hasPalmGeometry, preparePalmModel } from '../src/vegetation/palm-model.js';
beforeAll(initPhysics);

describe('catalog palm through normal item model and world bindings', () => {
  it('retains the Core identity, author controls, preview and collider while binding source LOD', () => {
    const detail = new DataTexture(), owner = new PalmWorldBindings({ wind: { detail,
      gustOffset: TSL.uniform(new Vector2()), windDirection: TSL.uniform(new Vector2(1, 0)), windSpeed: TSL.uniform(7) },
      time: TSL.uniform(0), mainCamera: TSL.uniform(new Vector3()), frame: TSL.uniform(0, 'uint'),
      sun: new DirectionalLight(), sunDirection: TSL.uniform(new Vector3(1, 1, 0).normalize()), night: TSL.uniform(0) });
    const staticModel = resolveItem('genvr.core.tidewater.palm', undefined, 'realistic', undefined, { height: 12 });
    expect(hasPalmGeometry(staticModel)).toBe(true);
    const live = preparePalmModel(staticModel, owner);
    expect(live.id).toBe(staticModel.id); expect(live.bounds).toBe(staticModel.bounds); expect(live.blocks).toBe(staticModel.blocks);
    expect(live.meshes![0]!.material).toBe(staticModel.meshes![0]!.material);
    expect(staticModel.meshes![0]).not.toHaveProperty('setupInstance');
    expect(staticModel.blocks!.max[1]).toBeCloseTo(12.24);
    const physics = new PhysicsWorld(), view = new ItemsView(physics, () => live);
    const doc = WorldDocument.parse({ schemaVersion: 1, experienceId: 'test', version: 0,
      style: { base: 'realistic' }, sizeTier: 'small', access: { mode: 'private' },
      environment: { sky: { preset: 'day' }, weather: { preset: 'clear' } }, terrain: {}, spawn: { position: [0, 1, 0] },
      instances: [{ instanceId: 'palm', itemId: live.id, transform: { position: [120, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] }, params: { height: 12 } }] });
    view.sync(doc); view.updateProceduralLod(new Vector3());
    const batches = view.group.children.filter((child): child is InstancedMesh => child instanceof InstancedMesh);
    expect(batches).toHaveLength(2); expect(batches.map(m => m.count)).toEqual([1, 1]);
    expect(batches.map(m => m.castShadow)).toEqual([true, false]);
    expect(batches.map(m => view.instanceIdAt(m, 0))).toEqual(['palm', 'palm']);
    expect(batches[0]!.geometry.getAttribute('twPalmSourcePosition')).toBeDefined();
    expect(batches[0]!.material).not.toBe(staticModel.meshes![0]!.material);
    const preview = view.previewMesh(live.id, view.material);
    expect(preview.geometry.getAttribute('position').count).toBeGreaterThan(1000); preview.geometry.dispose();
    view.dispose(); owner.dispose(); physics.dispose(); detail.dispose();
  });
  it('leaves ordinary item models untouched', () => {
    const ordinary = resolveItem('genvr.core.crate');
    expect(hasPalmGeometry(ordinary)).toBe(false);
  });
});
